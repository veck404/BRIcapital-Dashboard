"""Router collector service for ASUSWRT devices.

This service polls an ASUS router (RT-AX86U Pro compatible) using `asusrouter`
and exposes normalized dashboard data through REST + WebSocket endpoints.
"""

from __future__ import annotations

import asyncio
from collections import deque
from dataclasses import asdict, dataclass, is_dataclass
from datetime import date, datetime, timedelta
import json
import logging
import os
from pathlib import Path
import random
import time
from typing import Any

import aiohttp
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware

try:
    from asusrouter import AsusData, AsusRouter, Endpoint
    from asusrouter.modules.endpoint import (
        process as endpoint_process,
        read as endpoint_read,
    )
except ImportError:  # pragma: no cover - optional until dependencies are installed
    AsusData = None
    AsusRouter = None
    Endpoint = None
    endpoint_read = None
    endpoint_process = None

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
    usage_retention_days: int
    usage_history_file: str
    usage_persist_interval_seconds: float
    mock_mode: bool
    max_device_rows: int
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

    history_file = os.getenv(
        "ROUTER_USAGE_HISTORY_FILE",
        str(Path(__file__).resolve().parent / "data" / "usage-history.json"),
    ).strip()

    return CollectorSettings(
        router_host=host,
        router_username=username,
        router_password=password,
        router_use_ssl=use_ssl,
        router_port=router_port,
        poll_interval_seconds=max(env_float("ROUTER_POLL_INTERVAL", 3.0), 0.5),
        history_limit=max(env_int("ROUTER_HISTORY_LIMIT", 60), 10),
        usage_retention_days=max(env_int("ROUTER_USAGE_RETENTION_DAYS", 183), 30),
        usage_history_file=history_file,
        usage_persist_interval_seconds=max(
            env_float("ROUTER_USAGE_PERSIST_INTERVAL", 20.0),
            2.0,
        ),
        mock_mode=mock_mode,
        max_device_rows=max(env_int("ROUTER_MAX_DEVICE_ROWS", 60), 10),
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
        self._daily_total_gb = 0.0
        self._device_usage_gb: dict[str, float] = {}
        self._usage_history: deque[dict[str, Any]] = deque(
            maxlen=self.settings.history_limit
        )
        self._hourly_usage_gb: dict[str, float] = {}
        self._history_dirty = False
        self._last_history_persist_ts = 0.0
        self._prev_primary_interface: str | None = None
        self._prev_primary_rx: int | None = None
        self._prev_primary_tx: int | None = None
        self._prev_client_total_bytes: dict[str, int] = {}
        self._last_distribution_ts: float | None = None
        self._seen_online_ids: set[str] = set()
        self._per_device_mode = "estimated_activity"

        self._connected = False
        self._last_error: str | None = None
        self._router_model: str | None = None
        self._router_firmware: str | None = None

        self._mock_devices = self._build_mock_devices()
        self._load_usage_history()
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

        self._persist_usage_history(force=True)
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
            "perDeviceMode": self._per_device_mode,
            "lastError": self._last_error,
            "timestamp": now_iso(),
        }

    async def get_usage_history(
        self,
        interval: str,
        start: str | None = None,
        end: str | None = None,
    ) -> dict[str, Any]:
        """Return aggregated bandwidth history for chart filters."""

        interval_key = interval.strip().lower()
        if interval_key not in {"daily", "weekly", "monthly", "custom"}:
            interval_key = "daily"

        points, range_start, range_end = self._build_usage_history(
            interval=interval_key,
            start=start,
            end=end,
        )
        return {
            "interval": interval_key,
            "rangeStart": range_start.isoformat(),
            "rangeEnd": range_end.isoformat(),
            "points": points,
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
                self._persist_usage_history(force=False)
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

        exact_client_counters = await self._fetch_client_total_counters()
        normalized_clients = self._normalize_clients(clients_raw)
        self._inject_exact_counters(normalized_clients, exact_client_counters)
        period_delta_gb = self._extract_period_delta_from_network_counters(network_raw)
        self._connected = True
        return self._assemble_snapshot(
            normalized_clients=normalized_clients,
            source="router",
            connected=True,
            period_delta_gb=period_delta_gb,
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

        total_mbps = sum(
            max(client["rxSpeedMbps"], 0.0) + max(client["txSpeedMbps"], 0.0)
            for client in normalized_clients
            if client["online"]
        )
        interval_seconds = max(self.settings.poll_interval_seconds, 0.5)
        period_delta_gb = (total_mbps * 125_000 * interval_seconds) / 1_000_000_000

        return self._assemble_snapshot(
            normalized_clients=normalized_clients,
            source="mock",
            connected=True,
            period_delta_gb=period_delta_gb,
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
        period_delta_gb: float,
    ) -> dict[str, Any]:
        """Build payload matching dashboard contracts."""

        self._rollover_if_new_day()
        period_delta_gb = max(period_delta_gb, 0.0)
        self._daily_total_gb += period_delta_gb
        self._distribute_period_usage(period_delta_gb, normalized_clients)
        self._record_usage_delta(period_delta_gb)
        self._refresh_intraday_usage_history()

        active_devices = 0
        device_rows: list[dict[str, Any]] = []
        for client in normalized_clients:
            if client["online"]:
                active_devices += 1
                self._seen_online_ids.add(client["id"])

            usage_gb = self._device_usage_gb.get(client["id"], 0.0)
            keep_row = (
                client["online"]
                or usage_gb > 0.0005
                or client["id"] in self._seen_online_ids
            )
            if not keep_row:
                continue

            device_rows.append(
                {
                    "id": client["id"],
                    "deviceName": client["name"],
                    "ipAddress": client["ipAddress"],
                    "bandwidthGb": round_gb(usage_gb),
                    "status": "Online" if client["online"] else "Offline",
                }
            )

        device_rows.sort(
            key=lambda row: (row["status"] == "Online", row["bandwidthGb"]),
            reverse=True,
        )
        device_rows = device_rows[: self.settings.max_device_rows]
        top_ten = sorted(
            device_rows,
            key=lambda row: row["bandwidthGb"],
            reverse=True,
        )[:10]

        top_devices = [
            {"device": row["deviceName"], "bandwidthGb": row["bandwidthGb"]}
            for row in top_ten
        ]
        traffic_distribution = self._build_traffic_distribution(top_ten)

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
                "perDeviceMode": self._per_device_mode,
                "totalBandwidthTodayGb": round_gb(self._daily_total_gb),
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
        self._prev_client_total_bytes.clear()
        self._last_distribution_ts = None
        self._seen_online_ids.clear()

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

    async def _fetch_client_total_counters(self) -> dict[str, int]:
        """Fetch exact per-client byte counters from update_clients endpoint.

        On many stock firmwares these fields are empty, but when available
        they provide cumulative values (`totalTx` + `totalRx`) per client.
        """

        if (
            self.settings.mock_mode
            or self._router is None
            or Endpoint is None
            or endpoint_read is None
            or endpoint_process is None
        ):
            return {}

        try:
            status, _, content = await self._router.async_api_query(Endpoint.UPDATE_CLIENTS)
            if status != 200:
                return {}

            parsed = endpoint_read(Endpoint.UPDATE_CLIENTS, content)
            state = endpoint_process(Endpoint.UPDATE_CLIENTS, parsed)
            clients_raw = state.get(AsusData.CLIENTS, {})
            if not isinstance(clients_raw, dict):
                return {}

            counters: dict[str, int] = {}
            for mac, info in clients_raw.items():
                if not isinstance(info, dict):
                    continue
                tx = self._as_counter(info.get("totalTx"))
                rx = self._as_counter(info.get("totalRx"))
                if tx >= 0 and rx >= 0:
                    counters[self._normalize_mac(str(mac))] = tx + rx
            return counters
        except Exception:  # noqa: BLE001
            return {}

    def _inject_exact_counters(
        self,
        normalized_clients: list[dict[str, Any]],
        counters: dict[str, int],
    ) -> None:
        """Attach exact counters from update_clients payload where available."""

        if not counters:
            return
        for client in normalized_clients:
            key = self._normalize_mac(client["id"])
            if key in counters:
                client["totalBytes"] = counters[key]

    def _extract_period_delta_from_network_counters(self, raw_network: Any) -> float:
        """Calculate transferred GB for the current poll interval using counters.

        This uses cumulative `rx`/`tx` bytes from router network stats and computes
        deltas between polls. It is far more reliable than integrating client link rates.
        """

        network_map = self._as_dict(raw_network)
        if not network_map:
            return 0.0

        primary_interface = next(
            (name for name in ("wan", "internet", "bridge") if name in network_map),
            None,
        )
        if primary_interface is None:
            primary_interface = next(iter(network_map.keys()), None)

        if primary_interface is None:
            return 0.0

        interface_data = self._as_dict(network_map.get(primary_interface))
        current_rx = self._as_int(interface_data.get("rx"))
        current_tx = self._as_int(interface_data.get("tx"))
        if current_rx < 0 or current_tx < 0:
            return 0.0

        # First sample or interface switch: initialize baseline.
        if (
            self._prev_primary_interface != primary_interface
            or self._prev_primary_rx is None
            or self._prev_primary_tx is None
        ):
            self._prev_primary_interface = primary_interface
            self._prev_primary_rx = current_rx
            self._prev_primary_tx = current_tx
            return 0.0

        delta_rx = max(current_rx - self._prev_primary_rx, 0)
        delta_tx = max(current_tx - self._prev_primary_tx, 0)

        self._prev_primary_interface = primary_interface
        self._prev_primary_rx = current_rx
        self._prev_primary_tx = current_tx

        return (delta_rx + delta_tx) / 1_000_000_000

    def _distribute_period_usage(
        self,
        period_delta_gb: float,
        normalized_clients: list[dict[str, Any]],
    ) -> None:
        """Allocate period usage across active devices.

        Priority:
        1) Exact per-device cumulative counters (`totalBytes`) when available.
        2) Fallback to integrating per-device live rates over elapsed time.

        Note: on this ASUS firmware, client rates are reported in Kbps even
        though variable names keep legacy `...Mbps` naming in this file.
        """

        interval_seconds = self._next_distribution_interval_seconds()

        for client in normalized_clients:
            self._device_usage_gb.setdefault(client["id"], 0.0)

        active_clients = [client for client in normalized_clients if client["online"]]
        if not active_clients:
            self._per_device_mode = "estimated_activity"
            return

        exact_deltas: dict[str, float] = {}
        for client in normalized_clients:
            total_bytes = self._as_counter(client.get("totalBytes"))
            if total_bytes < 0:
                continue

            device_id = client["id"]
            prev = self._prev_client_total_bytes.get(device_id)
            self._prev_client_total_bytes[device_id] = total_bytes
            if prev is None:
                continue
            if total_bytes < prev:
                # Counter reset or wrap.
                continue

            delta_gb = (total_bytes - prev) / 1_000_000_000
            if delta_gb > 0:
                exact_deltas[device_id] = delta_gb
                self._device_usage_gb[device_id] += delta_gb

        if exact_deltas:
            exact_client_ids = set(exact_deltas.keys())
            active_without_exact = [
                client for client in active_clients if client["id"] not in exact_client_ids
            ]
            if not active_without_exact:
                self._per_device_mode = "exact_counters"
                return

            self._per_device_mode = "mixed_exact_and_rate"
            self._integrate_rate_usage(active_without_exact, interval_seconds)
            return

        self._per_device_mode = "rate_integration"
        self._integrate_rate_usage(active_clients, interval_seconds)

    def _integrate_rate_usage(
        self,
        clients: list[dict[str, Any]],
        interval_seconds: float,
    ) -> None:
        """Integrate per-device traffic rates into byte totals."""

        if interval_seconds <= 0:
            return

        # Router payload rates are in Kbps. Mock generator uses Mbps-like values.
        bytes_per_rate_unit_second = 125_000.0 if self.settings.mock_mode else 125.0
        max_reasonable_rate = 2_000_000.0 if self.settings.mock_mode else 2_000_000.0

        for client in clients:
            rate = max(client["rxSpeedMbps"], 0.0) + max(client["txSpeedMbps"], 0.0)
            if rate <= 0:
                continue

            rate = min(rate, max_reasonable_rate)
            delta_gb = (rate * bytes_per_rate_unit_second * interval_seconds) / 1_000_000_000
            if delta_gb <= 0:
                continue

            self._device_usage_gb[client["id"]] += delta_gb

    def _next_distribution_interval_seconds(self) -> float:
        """Return elapsed seconds since last per-device distribution."""

        now_ts = time.monotonic()
        if self._last_distribution_ts is None:
            self._last_distribution_ts = now_ts
            return max(self.settings.poll_interval_seconds, 0.5)

        elapsed = max(now_ts - self._last_distribution_ts, 0.0)
        self._last_distribution_ts = now_ts

        # Guard against pause/resume spikes after process stalls.
        max_window = max(self.settings.poll_interval_seconds * 4, 20.0)
        return min(max(elapsed, 0.25), max_window)

    def _history_file_path(self) -> Path:
        """Resolve usage-history file path."""

        return Path(self.settings.usage_history_file).expanduser()

    def _load_usage_history(self) -> None:
        """Load persisted intraday usage history from disk."""

        path = self._history_file_path()
        if not path.exists():
            return

        try:
            payload = json.loads(path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError) as exc:
            LOGGER.warning("Unable to read usage history file (%s): %s", path, exc)
            return

        rows = payload.get("hourly", [])
        if not isinstance(rows, list):
            return

        loaded: dict[str, float] = {}
        for row in rows:
            if not isinstance(row, dict):
                continue
            bucket = self._parse_hour_bucket(str(row.get("hour", "")))
            if bucket is None:
                continue

            gb = max(self._as_float(row.get("bandwidthGb")), 0.0)
            if gb <= 0:
                continue

            key = bucket.isoformat(timespec="seconds")
            loaded[key] = loaded.get(key, 0.0) + gb

        self._hourly_usage_gb = loaded
        self._prune_hourly_usage()
        self._daily_total_gb = self._build_daily_totals().get(datetime.now().date(), 0.0)
        self._refresh_intraday_usage_history()
        self._history_dirty = False

    def _persist_usage_history(self, force: bool) -> None:
        """Persist usage history to disk with write throttling."""

        if not self._history_dirty and not force:
            return

        now_ts = time.monotonic()
        if (
            not force
            and now_ts - self._last_history_persist_ts
            < self.settings.usage_persist_interval_seconds
        ):
            return

        path = self._history_file_path()
        try:
            path.parent.mkdir(parents=True, exist_ok=True)
            payload = {
                "updatedAt": now_iso(),
                "hourly": [
                    {"hour": hour, "bandwidthGb": round_gb(gb)}
                    for hour, gb in sorted(self._hourly_usage_gb.items())
                    if gb > 0
                ],
            }
            path.write_text(
                json.dumps(payload, separators=(",", ":"), ensure_ascii=True),
                encoding="utf-8",
            )
        except OSError as exc:
            LOGGER.warning("Unable to persist usage history file (%s): %s", path, exc)
            return

        self._last_history_persist_ts = now_ts
        self._history_dirty = False

    def _to_half_hour_bucket(self, value: datetime) -> datetime:
        """Normalize timestamp to a 30-minute bucket boundary."""

        minute = 30 if value.minute >= 30 else 0
        return value.replace(minute=minute, second=0, microsecond=0)

    def _prune_hourly_usage(self) -> None:
        """Drop usage buckets older than retention window."""

        cutoff = self._to_half_hour_bucket(datetime.now()) - timedelta(
            days=self.settings.usage_retention_days
        )
        keys_to_remove: list[str] = []
        for key, value in self._hourly_usage_gb.items():
            bucket = self._parse_hour_bucket(key)
            if bucket is None or bucket < cutoff or value <= 0:
                keys_to_remove.append(key)

        if not keys_to_remove:
            return

        for key in keys_to_remove:
            self._hourly_usage_gb.pop(key, None)

        self._history_dirty = True

    def _record_usage_delta(self, period_delta_gb: float) -> None:
        """Accumulate current poll delta into 30-minute usage buckets."""

        if period_delta_gb > 0:
            bucket = self._to_half_hour_bucket(datetime.now())
            key = bucket.isoformat(timespec="seconds")
            self._hourly_usage_gb[key] = self._hourly_usage_gb.get(key, 0.0) + period_delta_gb
            self._history_dirty = True

        self._prune_hourly_usage()

    def _refresh_intraday_usage_history(self) -> None:
        """Rebuild short usage series for quick charting in live snapshots."""

        now = datetime.now()
        start_of_day = datetime(now.year, now.month, now.day)
        latest_bucket = self._to_half_hour_bucket(now)
        points: list[dict[str, Any]] = []
        bucket = start_of_day
        while bucket <= latest_bucket:
            key = bucket.isoformat(timespec="seconds")
            points.append(
                {
                    "time": bucket.strftime("%H:%M"),
                    "bandwidthGb": round_gb(self._hourly_usage_gb.get(key, 0.0)),
                }
            )
            bucket += timedelta(minutes=30)

        self._usage_history = deque(points[-self.settings.history_limit :], maxlen=self.settings.history_limit)

    def _build_usage_history(
        self,
        interval: str,
        start: str | None,
        end: str | None,
    ) -> tuple[list[dict[str, Any]], date, date]:
        """Build chart-ready usage points for requested interval."""

        interval_key = interval.strip().lower()
        if interval_key not in {"daily", "weekly", "monthly", "custom"}:
            interval_key = "daily"

        today = datetime.now().date()
        earliest = today - timedelta(days=self.settings.usage_retention_days - 1)
        daily_totals = self._build_daily_totals()

        if interval_key == "weekly":
            current_week_start = today - timedelta(days=today.weekday())
            first_week = current_week_start - timedelta(weeks=25)
            while first_week < earliest:
                first_week += timedelta(weeks=1)

            weekly_totals: dict[date, float] = {}
            for day, value in daily_totals.items():
                if day < first_week or day > today:
                    continue
                week_start = day - timedelta(days=day.weekday())
                weekly_totals[week_start] = weekly_totals.get(week_start, 0.0) + value

            points: list[dict[str, Any]] = []
            cursor = first_week
            while cursor <= current_week_start:
                iso = cursor.isocalendar()
                points.append(
                    {
                        "time": f"W{iso.week} {iso.year}",
                        "bandwidthGb": round_gb(weekly_totals.get(cursor, 0.0)),
                    }
                )
                cursor += timedelta(weeks=1)

            return points, first_week, today

        if interval_key == "monthly":
            current_month = today.replace(day=1)
            month_starts = [self._shift_months(current_month, offset) for offset in range(-5, 1)]

            monthly_totals: dict[date, float] = {}
            first_month = month_starts[0]
            for day, value in daily_totals.items():
                if day < first_month or day > today:
                    continue
                bucket = day.replace(day=1)
                monthly_totals[bucket] = monthly_totals.get(bucket, 0.0) + value

            points = [
                {
                    "time": month.strftime("%b %Y"),
                    "bandwidthGb": round_gb(monthly_totals.get(month, 0.0)),
                }
                for month in month_starts
            ]
            return points, first_month, today

        if interval_key == "custom":
            custom_start = self._parse_query_date(start) or (today - timedelta(days=29))
            custom_end = self._parse_query_date(end) or today
            if custom_start > custom_end:
                custom_start, custom_end = custom_end, custom_start
            custom_start = max(custom_start, earliest)
            custom_end = min(custom_end, today)
            if custom_start > custom_end:
                custom_start = custom_end
            return self._build_daily_points(custom_start, custom_end, daily_totals)

        daily_start = max(today - timedelta(days=29), earliest)
        return self._build_daily_points(daily_start, today, daily_totals)

    def _build_daily_points(
        self,
        start_day: date,
        end_day: date,
        daily_totals: dict[date, float],
    ) -> tuple[list[dict[str, Any]], date, date]:
        """Build one-point-per-day chart series."""

        points: list[dict[str, Any]] = []
        cursor = start_day
        while cursor <= end_day:
            points.append(
                {
                    "time": cursor.strftime("%b %d"),
                    "bandwidthGb": round_gb(daily_totals.get(cursor, 0.0)),
                }
            )
            cursor += timedelta(days=1)

        return points, start_day, end_day

    def _build_daily_totals(self) -> dict[date, float]:
        """Aggregate hourly usage into daily totals."""

        totals: dict[date, float] = {}
        for hour_key, value in self._hourly_usage_gb.items():
            if value <= 0:
                continue
            bucket = self._parse_hour_bucket(hour_key)
            if bucket is None:
                continue
            day_key = bucket.date()
            totals[day_key] = totals.get(day_key, 0.0) + value
        return totals

    def _parse_hour_bucket(self, value: str) -> datetime | None:
        """Parse persisted usage-bucket key values safely."""

        text = value.strip()
        if not text:
            return None

        if text.endswith("Z"):
            text = text[:-1]

        try:
            parsed = datetime.fromisoformat(text)
        except ValueError:
            return None

        if parsed.tzinfo is not None:
            parsed = parsed.replace(tzinfo=None)

        return self._to_half_hour_bucket(parsed)

    def _parse_query_date(self, value: str | None) -> date | None:
        """Parse YYYY-MM-DD query values."""

        if value is None:
            return None

        text = value.strip()
        if not text:
            return None

        try:
            return datetime.fromisoformat(text[:10]).date()
        except ValueError:
            return None

    def _shift_months(self, month_start: date, offset: int) -> date:
        """Shift a month-start date by `offset` months."""

        month_index = (month_start.year * 12 + month_start.month - 1) + offset
        year, month = divmod(month_index, 12)
        return date(year, month + 1, 1)

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
                "totalBandwidthGb": round_gb(self._daily_total_gb),
            },
            "network": {
                "topDevices": [],
                "usageOverTime": list(self._usage_history),
                "trafficDistribution": [{"name": "No Traffic", "value": 100}],
                "perDeviceMode": self._per_device_mode,
                "totalBandwidthTodayGb": round_gb(self._daily_total_gb),
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

    def _as_int(self, value: Any) -> int:
        """Convert values to integer safely."""

        if isinstance(value, bool):
            return int(value)
        if isinstance(value, int):
            return value
        if isinstance(value, float):
            return int(value)
        if isinstance(value, str):
            try:
                return int(float(value.strip()))
            except ValueError:
                return -1
        return -1

    def _as_counter(self, value: Any) -> int:
        """Parse traffic counter values from router payload."""

        if value is None:
            return -1
        if isinstance(value, (int, float)):
            return int(value)
        if isinstance(value, str):
            text = value.strip().replace(",", "")
            if text == "":
                return -1
            try:
                return int(float(text))
            except ValueError:
                return -1
        return -1

    def _normalize_mac(self, value: str) -> str:
        """Normalize MAC-like IDs for reliable map lookups."""

        return value.strip().upper()


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


@app.get("/api/network/usage-history")
async def network_usage_history(
    interval: str = "daily",
    start: str | None = None,
    end: str | None = None,
) -> dict[str, Any]:
    """Return bandwidth usage history for selected interval."""

    return await collector.get_usage_history(interval=interval, start=start, end=end)


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
