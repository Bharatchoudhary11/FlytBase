# Code Documentation

## Backend (Node.js / Express)

- `src/server.js`: Entry point that configures Express, HTTP server, and Socket.IO for real-time updates. Registers mission, drone, and report routes.
- `src/dataStore.js`: In-memory store using Maps to track missions, drones, and generated reports.
- `src/routes/missions.js`: Router factory handling mission creation, telemetry updates, waypoint generation, mission control actions, and automatic report creation.
- `src/routes/drones.js`: Router factory for registering drones, listing inventory, and updating status or battery levels with WebSocket notifications.
- `src/routes/reports.js`: Router providing per-mission summaries and organization-wide analytics based on mission and drone data.

## Frontend (React)

- `src/App.js`: Renders the application shell and mounts the analytics dashboard.
- `src/AnalyticsDashboard.js`: Fetches org-wide statistics, allows lookup of individual mission reports, and displays mission outcome, duration, distance, waypoints, and sensor details.
- Additional React files handle the entry point (`index.js`), styling (`App.css`, `index.css`), and test utilities (`App.test.js`, `setupTests.js`, `reportWebVitals.js`).

## Development Notes

- The backend reads environment variables via `dotenv` and exposes a WebSocket endpoint for real-time mission and drone events.
- The frontend supports a `REACT_APP_API_URL` environment variable so the API host can be configured without code changes.
