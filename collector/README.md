# Router Collector Service

This FastAPI service polls an ASUSWRT router (including `RT-AX86U Pro`) and exposes data for the React dashboard.

## Endpoints

- `GET /health`
- `GET /api/router/snapshot`
- `GET /api/overview`
- `GET /api/network`
- `WS /ws/router` (pushes latest snapshot after each poll)

## Setup

1. Create and activate a Python virtual environment.
2. Install dependencies:
   - `pip install -r collector/requirements.txt`
3. Copy env file:
   - `copy collector\\.env.example collector\\.env` (Windows)
4. Fill in router credentials in `collector/.env`.

## Run

From `collector/`:

- `uvicorn main:app --host 0.0.0.0 --port 8000`

Or from project root:

- `uvicorn collector.main:app --host 0.0.0.0 --port 8000`

## Notes

- If credentials are missing and `ROUTER_MOCK_MODE=auto`, the service runs in live-mock mode so the dashboard still updates in real time.
- For production, run over LAN/VPN only and keep `ROUTER_PASSWORD` in environment variables (not committed files).
