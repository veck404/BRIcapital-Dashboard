# IT Operations Dashboard

React + TypeScript + Tailwind + Vite dashboard for attendance and network analytics.

## Frontend

1. Install dependencies:
   - `npm install`
2. Run dev server:
   - `npm run dev`

## Router Collector (FastAPI)

Collector lives in [`collector/`](./collector) and streams live router metrics.

1. Install Python dependencies:
   - `pip install -r collector/requirements.txt`
2. Configure environment:
   - copy `collector/.env.example` to `collector/.env`
   - set `ROUTER_HOST`, `ROUTER_USERNAME`, `ROUTER_PASSWORD`
3. Start collector:
   - `uvicorn collector.main:app --host 0.0.0.0 --port 8000`

## Connect Dashboard to Collector

1. Copy `.env.example` to `.env`
2. Set:
   - `VITE_USE_ROUTER_COLLECTOR=true`
   - `VITE_COLLECTOR_BASE_URL=http://localhost:8000`
3. Restart `npm run dev`

With collector enabled, `Dashboard` and `Network` pages subscribe to `ws://<collector>/ws/router` and update in real time.
