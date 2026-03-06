"""Router collector service for ASUSWRT devices.

This service polls an ASUS router (RT-AX86U Pro compatible) using `asusrouter`
and exposes normalized dashboard data through REST + WebSocket endpoints.
"""

from __future__ import annotations

import asyncio
from collections import deque
from dataclasses import asdict, dataclass, is_dataclass
from datetime import datetime
import logging
import os
import random
import time
from typing import Any

import aiohttp
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware

try:
    from asusrouter import AsusData, AsusRouter
except ImportError:  # pragma: no cover - optional until dependencies are installed
    AsusData = None
    AsusRouter = None

logging.basicConfig(
    level=os.getenv("COLLECTOR_LOG_LEVEL", "INFO").upper(),
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
LOGGER = logging.getLogger("router-collector")


def env_bool(name: str, default: bool = False) -> bool:
    """Read a boolean environment variable."""

    raw = os.getenv(name)
    if raw is None:
        return default
    return raw.strip().lower() in {"1", "true", "yes", "on"}


def env_float(name: str, default: float) -> float:
    """Read a float environment variable."""

    raw = os.getenv(name)
    if raw is None:
        return default
    try:
        return float(raw)
    except ValueError:
        return default


def env_int(name: str, default: int) -> int:
    """Read an integer environment variable."""

    raw = os.getenv(name)
    if raw is None:
        return default
    try:
        return int(raw)
    except ValueError:
        return default


def now_iso() -> str:
    """Get UTC timestamp string."""

    return datetime.utcnow().isoformat(timespec="seconds") + "Z"


def round_gb(value: float) -> float:
    """Round GB numbers for stable display."""

    return round(max(value, 0.0), 3)


@dataclass
class CollectorSettings:
    """Collector runtime settings."""

    router_host: str
    router_username: str
    router_password: str
    router_use_ssl: bool
    router_port: int | None
    poll_interval_seconds: float
    history_limit: int
    mock_mode: bool
    host: str
    port: int
    allowed_origins: list[str]


def load_settings() -> CollectorSettings:
    """Load collector settings from environment."""

    host = os.getenv("ROUTER_HOST", "").strip()
    username = os.getenv("ROUTER_USERNAME", "admin").strip()
    password = os.getenv("ROUTER_PASSWORD", "").strip()
    use_ssl = env_bool("ROUTER_USE_SSL", False)
    port_raw = os.getenv("ROUTER_PORT")
    router_port = int(port_raw) if port_raw and port_raw.isdigit() else None

    mock_mode_raw = os.getenv("ROUTER_MOCK_MODE", "auto").strip().lower()
    has_router_credentials = bool(host and password)
    mock_mode = (
        mock_mode_raw in {"1", "true", "yes", "on"}
        or (mock_mode_raw == "auto" and not has_router_credentials)
    )

    origins = os.getenv(
        "COLLECTOR_ALLOWED_ORIGINS",
        "http://localhost:5173,http://127.0.0.1:5173",
    )
    allowed_origins = [origin.strip() for origin in origins.split(",") if origin.strip()]

    return CollectorSettings(
        router_host=host,
        router_username=username,
        router_password=password,
        router_use_ssl=use_ssl,
        router_port=router_port,
        poll_interval_seconds=max(env_float("ROUTER_POLL_INTERVAL", 3.0), 0.5),
        history_limit=max(env_int("ROUTER_HISTORY_LIMIT", 60), 10),
        mock_mode=mock_mode,
        host=os.getenv("COLLECTOR_HOST", "0.0.0.0"),
        port=env_int("COLLECTOR_PORT", 8000),
        allowed_origins=allowed_origins,
    )


class RouterCollector:
    """Stateful polling collector for router metrics."""

    def __init__(self, settings: CollectorSettings) -> None:
        self.settings = settings
        self._session: aiohttp.ClientSession | None = None
        self._router: Any | None = None
        self._task: asyncio.Task[None] | None = None
        self._clients: set[WebSocket] = set()
        self._lock = asyncio.Lock()

        self._day_key = datetime.now().date().isoformat()
        self._last_poll_monotonic: float | None = None
        self._daily_total_gb = 0.0
        self._device_usage_gb: dict[str, float] = {}
        self._usage_history: deque[dict[str, Any]] = deque(
            maxlen=self.settings.history_limit
        )

        self._connected = False
        self._last_error: str | None = None
        self._router_model: str | None = None
        self._router_firmware: str | None = None

        self._mock_devices = self._build_mock_devices()
        self._snapshot: dict[str, Any] = self._build_initial_snapshot()

    async def start(self) -> None:
        """Start background polling."""

        if self._task and not self._task.done():
            return
        self._task = asyncio.create_task(self._run_loop(), name="router-collector-loop")

    async def stop(self) -> None:
        """Stop background polling and clean up resources."""

        if self._task:
            self._task.cancel()
            try:
                await self._task
            except asyncio.CancelledError:
                pass
            self._task = None

        await self._close_router()

    async def get_snapshot(self) -> dict[str, Any]:
        """Get the latest snapshot."""

        async with self._lock:
            return self._snapshot.copy()

    async def get_health(self) -> dict[str, Any]:
        """Return collector health state."""

        return {
            "ok": True,
            "mode": "mock" if self.settings.mock_mode else "router",
            "connected": self._connected if not self.settings.mock_mode else True,
            "routerHost": self.settings.router_host or None,
            "routerModel": self._router_model,
            "routerFirmware": self._router_firmware,
            "lastError": self._last_error,
            "timestamp": now_iso(),
        }

    async def register_socket(self, websocket: WebSocket) -> None:
        """Register a websocket subscriber."""

        self._clients.add(websocket)

    def unregister_socket(self, websocket: WebSocket) -> None:
        """Unregister a websocket subscriber."""

        self._clients.discard(websocket)

    async def _run_loop(self) -> None:
        """Polling loop."""

        LOGGER.info(
            "Collector loop started in %s mode",
            "mock" if self.settings.mock_mode else "router",
        )
        while True:
            cycle_started = time.monotonic()
            try:
                snapshot = (
                    await self._collect_mock()
                    if self.settings.mock_mode
                    else await self._collect_router()
                )
                await self._set_snapshot(snapshot)
                await self._broadcast(snapshot)
                self._last_error = None
            except asyncio.CancelledError:
                raise
            except Exception as exc:  # noqa: BLE001
                self._connected = False
                self._last_error = str(exc)
                LOGGER.error("Collector poll failed: %s", exc)
                await self._broadcast(await self.get_snapshot())

            elapsed = time.monotonic() - cycle_started
            sleep_for = max(self.settings.poll_interval_seconds - elapsed, 0.25)
            await asyncio.sleep(sleep_for)

    async def _collect_router(self) -> dict[str, Any]:
        """Poll a live router and build snapshot payload."""

        if AsusRouter is None or AsusData is None:
            raise RuntimeError(
                "Missing dependency: install `asusrouter` to use live router mode."
            )

        await self._ensure_router_connected()
        if not self._router:
            raise RuntimeError("Router is not initialized.")

        clients_raw, network_raw = await asyncio.gather(
            self._router.async_get_data(AsusData.CLIENTS, force=True),
            self._router.async_get_data(AsusData.NETWORK, force=True),
        )

        normalized_clients = self._normalize_clients(clients_raw)
        interface_total_mbps = self._sum_interface_speed_mbps(network_raw)
        self._connected = True
        return self._assemble_snapshot(
            normalized_clients=normalized_clients,
            source="router",
            connected=True,
            interface_total_mbps=interface_total_mbps,
        )

    async def _collect_mock(self) -> dict[str, Any]:
        """Generate mock live data when router credentials are not configured."""

        for device in self._mock_devices:
            if random.random() < 0.04:
                device["online"] = not device["online"]
            if device["online"]:
                base = max(2.0, random.gauss(42.0, 16.0))
                rx = max(0.1, base * random.uniform(0.45, 0.7))
                tx = max(0.1, base * random.uniform(0.25, 0.55))
                device["rx_speed_mbps"] = round(rx, 2)
                device["tx_speed_mbps"] = round(tx, 2)
            else:
                device["rx_speed_mbps"] = 0.0
                device["tx_speed_mbps"] = 0.0

        normalized_clients = [
            {
                "id": str(device["id"]),
                "name": str(device["name"]),
                "ipAddress": str(device["ipAddress"]),
                "online": bool(device["online"]),
                "rxSpeedMbps": float(device["rx_speed_mbps"]),
                "txSpeedMbps": float(device["tx_speed_mbps"]),
            }
            for device in self._mock_devices
        ]

        return self._assemble_snapshot(
            normalized_clients=normalized_clients,
            source="mock",
            connected=True,
            interface_total_mbps=0.0,
        )

    async def _set_snapshot(self, snapshot: dict[str, Any]) -> None:
        """Safely replace latest snapshot."""

        async with self._lock:
            self._snapshot = snapshot

    async def _broadcast(self, payload: dict[str, Any]) -> None:
        """Broadcast latest payload to all websocket clients."""

        stale: list[WebSocket] = []
        for client in list(self._clients):
            try:
                await client.send_json(payload)
            except Exception:  # noqa: BLE001
                stale.append(client)
        for client in stale:
            self._clients.discard(client)

    async def _ensure_router_connected(self) -> None:
        """Initialize router connection if needed."""

        if not self.settings.router_host or not self.settings.router_password:
            raise RuntimeError(
                "Router credentials missing. Set ROUTER_HOST / ROUTER_PASSWORD "
                "or enable ROUTER_MOCK_MODE=true."
            )

        if self._session is None or self._session.closed:
            self._session = aiohttp.ClientSession()

        if self._router is None:
            self._router = AsusRouter(
                hostname=self.settings.router_host,
                username=self.settings.router_username,
                password=self.settings.router_password,
                port=self.settings.router_port,
                use_ssl=self.settings.router_use_ssl,
                session=self._session,
            )

        connected = bool(getattr(self._router, "connected", False))
        if connected:
            return

        try:
            connect_result = await self._router.async_connect()
        except Exception as exc:  # noqa: BLE001
            await self._close_router()
            raise RuntimeError(f"Router connect failed: {exc}") from exc

        if not connect_result:
            await self._close_router()
            raise RuntimeError("Router authentication failed or device is unreachable.")

        identity = await self._router.async_get_identity()
        self._router_model = getattr(identity, "model", None)
        firmware = getattr(identity, "firmware", None)
        self._router_firmware = str(firmware) if firmware else None
        LOGGER.info(
            "Router connected (%s, firmware=%s)",
            self._router_model or "unknown-model",
            self._router_firmware or "unknown-firmware",
        )

    async def _close_router(self) -> None:
        """Close router/session resources."""

        if self._router is not None:
            try:
                await self._router.async_disconnect()
            except Exception:  # noqa: BLE001
                pass
            self._router = None

        if self._session is not None and not self._session.closed:
            await self._session.close()
            self._session = None

    def _assemble_snapshot(
        self,
        normalized_clients: list[dict[str, Any]],
        source: str,
        connected: bool,
        interface_total_mbps: float,
    ) -> dict[str, Any]:
        """Build payload matching dashboard contracts."""

        self._rollover_if_new_day()
        now_monotonic = time.monotonic()
        if self._last_poll_monotonic is None:
            interval_seconds = self.settings.poll_interval_seconds
        else:
            interval_seconds = max(now_monotonic - self._last_poll_monotonic, 0.25)
        self._last_poll_monotonic = now_monotonic

        increment_devices_gb = 0.0
        for client in normalized_clients:
            speed_mbps = max(client["rxSpeedMbps"], 0.0) + max(client["txSpeedMbps"], 0.0)
            if client["online"] and speed_mbps > 0:
                delta_gb = (speed_mbps * 125_000 * interval_seconds) / 1_000_000_000
                increment_devices_gb += delta_gb
                self._device_usage_gb[client["id"]] = (
                    self._device_usage_gb.get(client["id"], 0.0) + delta_gb
                )
            else:
                self._device_usage_gb.setdefault(client["id"], 0.0)

        increment_interfaces_gb = (
            (interface_total_mbps * 125_000 * interval_seconds) / 1_000_000_000
            if interface_total_mbps > 0
            else 0.0
        )
        increment_gb = max(increment_devices_gb, increment_interfaces_gb)
        self._daily_total_gb += increment_gb

        self._usage_history.append(
            {
                "time": datetime.now().strftime("%H:%M"),
                "bandwidthGb": round_gb(self._daily_total_gb),
            }
        )

        device_rows = []
        for client in normalized_clients:
            usage_gb = self._device_usage_gb.get(client["id"], 0.0)
            device_rows.append(
                {
                    "id": client["id"],
                    "deviceName": client["name"],
                    "ipAddress": client["ipAddress"],
                    "bandwidthGb": round_gb(usage_gb),
                    "status": "Online" if client["online"] else "Offline",
                }
            )

        device_rows.sort(key=lambda row: row["bandwidthGb"], reverse=True)
        top_ten = device_rows[:10]

        top_devices = [
            {"device": row["deviceName"], "bandwidthGb": row["bandwidthGb"]}
            for row in top_ten
        ]
        traffic_distribution = self._build_traffic_distribution(top_ten)
        active_devices = sum(1 for row in device_rows if row["status"] == "Online")

        return {
            "timestamp": now_iso(),
            "source": source,
            "connected": connected,
            "router": {
                "hostname": self.settings.router_host or None,
                "model": self._router_model,
                "firmware": self._router_firmware,
            },
            "overview": {
                "activeDevices": active_devices,
                "totalBandwidthGb": round_gb(self._daily_total_gb),
            },
            "network": {
                "topDevices": top_devices,
                "usageOverTime": list(self._usage_history),
                "trafficDistribution": traffic_distribution,
                "devices": [
                    {
                        "deviceName": row["deviceName"],
                        "ipAddress": row["ipAddress"],
                        "bandwidthGb": row["bandwidthGb"],
                        "status": row["status"],
                    }
                    for row in device_rows
                ],
            },
            "error": self._last_error,
        }

    def _build_traffic_distribution(self, device_rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
        """Build percentage distribution from top device usage."""

        rows = [row for row in device_rows[:5] if row["bandwidthGb"] > 0]
        total = sum(row["bandwidthGb"] for row in rows)
        if total <= 0:
            return [
                {"name": "No Traffic", "value": 100},
            ]
        return [
            {
                "name": row["deviceName"][:22],
                "value": round((row["bandwidthGb"] / total) * 100, 1),
            }
            for row in rows
        ]

    def _rollover_if_new_day(self) -> None:
        """Reset daily accumulators at local day boundary."""

        current_day = datetime.now().date().isoformat()
        if current_day == self._day_key:
            return
        self._day_key = current_day
        self._daily_total_gb = 0.0
        self._device_usage_gb.clear()
        self._usage_history.clear()

    def _normalize_clients(self, raw: Any) -> list[dict[str, Any]]:
        """Normalize `AsusData.CLIENTS` payload to dashboard-friendly shape."""

        if not isinstance(raw, dict):
            return []

        clients: list[dict[str, Any]] = []
        for key, client in raw.items():
            client_map = self._as_dict(client)
            description = self._as_dict(client_map.get("description"))
            connection = self._as_dict(client_map.get("connection"))

            device_id = str(
                description.get("mac")
                or client_map.get("mac")
                or key
            )
            name = str(
                description.get("name")
                or client_map.get("name")
                or device_id
            )
            ip_address = str(
                connection.get("ip_address")
                or client_map.get("ip")
                or "N/A"
            )
            online = self._as_bool(
                connection.get("online", client_map.get("online", client_map.get("isOnline")))
            )
            rx_speed = self._as_float(
                connection.get("rx_speed", client_map.get("curRx"))
            )
            tx_speed = self._as_float(
                connection.get("tx_speed", client_map.get("curTx"))
            )

            clients.append(
                {
                    "id": device_id,
                    "name": name,
                    "ipAddress": ip_address,
                    "online": online,
                    "rxSpeedMbps": max(rx_speed, 0.0),
                    "txSpeedMbps": max(tx_speed, 0.0),
                }
            )

        return clients

    def _sum_interface_speed_mbps(self, raw_network: Any) -> float:
        """Estimate aggregate interface throughput speed in Mbps."""

        network_map = self._as_dict(raw_network)
        total_mbps = 0.0
        for interface_data in network_map.values():
            data = self._as_dict(interface_data)
            rx = self._as_float(data.get("rx_speed"))
            tx = self._as_float(data.get("tx_speed"))
            total_mbps += self._normalize_speed_to_mbps(rx)
            total_mbps += self._normalize_speed_to_mbps(tx)
        return total_mbps

    def _normalize_speed_to_mbps(self, value: float) -> float:
        """Normalize unknown speed units to an approximate Mbps value."""

        if value <= 0:
            return 0.0
        # Hook endpoint speeds are often bits/s and can be very large.
        if value > 100_000:
            return value / 1_000_000
        return value

    def _build_initial_snapshot(self) -> dict[str, Any]:
        """Create initial empty snapshot."""

        source = "mock" if self.settings.mock_mode else "router"
        return {
            "timestamp": now_iso(),
            "source": source,
            "connected": False if not self.settings.mock_mode else True,
            "router": {
                "hostname": self.settings.router_host or None,
                "model": None,
                "firmware": None,
            },
            "overview": {
                "activeDevices": 0,
                "totalBandwidthGb": 0.0,
            },
            "network": {
                "topDevices": [],
                "usageOverTime": [],
                "trafficDistribution": [{"name": "No Traffic", "value": 100}],
                "devices": [],
            },
            "error": None,
        }

    def _build_mock_devices(self) -> list[dict[str, Any]]:
        """Initialize mock device state."""

        names = [
            "Core-Switch-01",
            "Finance-Laptop-12",
            "Engineering-PC-08",
            "HR-Desktop-03",
            "DB-Server-02",
            "Security-Cam-14",
            "Executive-Tablet-05",
            "Dev-Laptop-27",
            "Support-PC-11",
            "Backup-Server-01",
            "QA-Laptop-09",
            "Warehouse-Scanner-03",
        ]
        devices: list[dict[str, Any]] = []
        for idx, name in enumerate(names, start=10):
            devices.append(
                {
                    "id": f"AA:BB:CC:DD:EE:{idx:02X}",
                    "name": name,
                    "ipAddress": f"10.1.{idx // 8}.{idx % 254}",
                    "online": random.random() > 0.15,
                    "rx_speed_mbps": 0.0,
                    "tx_speed_mbps": 0.0,
                }
            )
        return devices

    def _as_dict(self, value: Any) -> dict[str, Any]:
        """Convert dataclasses/objects to dict."""

        if isinstance(value, dict):
            return value
        if is_dataclass(value):
            return asdict(value)
        if hasattr(value, "__dict__"):
            return {
                key: item
                for key, item in vars(value).items()
                if not key.startswith("_")
            }
        return {}

    def _as_bool(self, value: Any) -> bool:
        """Convert many representations to bool."""

        if isinstance(value, bool):
            return value
        if isinstance(value, (int, float)):
            return value > 0
        if isinstance(value, str):
            return value.strip().lower() in {"1", "true", "yes", "online", "connected"}
        return False

    def _as_float(self, value: Any) -> float:
        """Convert values to float safely."""

        if isinstance(value, (float, int)):
            return float(value)
        if isinstance(value, str):
            try:
                return float(value.strip())
            except ValueError:
                return 0.0
        return 0.0


settings = load_settings()
collector = RouterCollector(settings)

app = FastAPI(
    title="IT Operations Router Collector",
    description="Collects live metrics from ASUS routers and streams dashboard payloads.",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.allowed_origins if settings.allowed_origins else ["*"],
    allow_methods=["*"],
    allow_headers=["*"],
    allow_credentials=True,
)


@app.on_event("startup")
async def startup() -> None:
    """Start collector on API startup."""

    await collector.start()


@app.on_event("shutdown")
async def shutdown() -> None:
    """Stop collector on API shutdown."""

    await collector.stop()


@app.get("/health")
async def health() -> dict[str, Any]:
    """Health endpoint."""

    return await collector.get_health()


@app.get("/api/router/snapshot")
async def router_snapshot() -> dict[str, Any]:
    """Return complete latest snapshot."""

    return await collector.get_snapshot()


@app.get("/api/overview")
async def overview() -> dict[str, Any]:
    """Return overview payload for dashboard cards."""

    snapshot = await collector.get_snapshot()
    return snapshot.get("overview", {})


@app.get("/api/network")
async def network() -> dict[str, Any]:
    """Return network analytics payload."""

    snapshot = await collector.get_snapshot()
    return snapshot.get("network", {})


@app.websocket("/ws/router")
async def ws_router(websocket: WebSocket) -> None:
    """Stream live snapshots over websocket."""

    await websocket.accept()
    await collector.register_socket(websocket)

    try:
        await websocket.send_json(await collector.get_snapshot())
        while True:
            # Keep the socket open and detect disconnect.
            await websocket.receive_text()
    except WebSocketDisconnect:
        collector.unregister_socket(websocket)
    except Exception:  # noqa: BLE001
        collector.unregister_socket(websocket)


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        "main:app",
        host=settings.host,
        port=settings.port,
        reload=env_bool("COLLECTOR_RELOAD", False),
    )
