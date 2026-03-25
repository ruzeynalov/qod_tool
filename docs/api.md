# API Reference

All endpoints are under `/api/v1/`. Swagger docs available at `/api/docs` when the backend is running.

## Core Endpoints

```
POST   /api/v1/auth/login              # Login
POST   /api/v1/auth/register           # Register

GET    /api/v1/projects                 # List projects
POST   /api/v1/projects                 # Create project
GET    /api/v1/projects/:id             # Get project
PATCH  /api/v1/projects/:id             # Update project
DELETE /api/v1/projects/:id             # Delete project

GET    /api/v1/projects/:id/kpis        # KPI dashboard
GET    /api/v1/projects/:id/kpis/history/:metric  # KPI time series
PUT    /api/v1/projects/:id/kpis/targets/:metric  # Set KPI target

GET    /api/v1/projects/:id/connectors  # List connectors
POST   /api/v1/projects/:id/connectors  # Add connector
POST   /api/v1/projects/:id/connectors/:id/test  # Test connection

GET    /api/v1/projects/:id/stories         # List stories (paginated)
GET    /api/v1/projects/:id/analytics/epic-coverage  # Epic coverage drill-down

GET    /api/v1/projects/:id/export/summary               # Export JSON summary

POST   /api/v1/projects/:id/upload/junit-xml   # Upload JUnit XML
POST   /api/v1/projects/:id/upload/testng-xml  # Upload TestNG XML

GET    /api/v1/projects/:id/demo/status       # Demo mode status
GET    /api/v1/projects/:id/demo/overview     # Demo overview
GET    /api/v1/projects/:id/demo/test-cases   # Demo test cases
GET    /api/v1/projects/:id/demo/test-runs    # Demo test runs
GET    /api/v1/projects/:id/demo/defects      # Demo defects
GET    /api/v1/projects/:id/demo/kpi-snapshots  # Demo KPI data

POST   /api/v1/webhooks/:type/:configId # Inbound webhooks
```
