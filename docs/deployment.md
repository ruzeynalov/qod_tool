# Deployment

## Custom API URL

By default the frontend connects to the API at `http://localhost:4000`. To deploy on a remote server, edit `deploy/docker-compose/docker-compose.yml`:

```yaml
web:
  build:
    args:
      NEXT_PUBLIC_API_URL: http://your-server:4000
```

## Default Seed Credentials

| Field | Value |
|-------|-------|
| Email | `admin@qod.dev` |
| Password | `admin123` |

There is no login UI yet — the frontend uses demo mode with client-side data or connects to the API for live data.
