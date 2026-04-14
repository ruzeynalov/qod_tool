# Deployment

## Custom API URL

By default the frontend connects to the API at `http://localhost:4000`. To deploy on a remote server, edit `deploy/docker-compose/docker-compose.yml`:

```yaml
web:
  build:
    args:
      NEXT_PUBLIC_API_URL: http://your-server:4000
```

## Default Seed Users

The seed script creates an admin and a member user. Credentials are defined in `packages/api/src/database/seeds/seed.ts`. Change these before deploying to production.
