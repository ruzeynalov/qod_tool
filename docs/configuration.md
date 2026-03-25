# Configuration

All configuration is via environment variables (12-factor). See `.env.example` for the full list.

| Variable | Default | Description |
|----------|---------|-------------|
| `DATABASE_URL` | `postgresql://qod:...@localhost:5432/qod` | PostgreSQL connection |
| `REDIS_URL` | `redis://localhost:6379` | Redis connection |
| `PORT` | `4000` | API server port |
| `JWT_SECRET` | - | Secret for JWT signing (required in production) |
| `NEXT_PUBLIC_API_URL` | `http://localhost:4000` | API URL for frontend |
| `NEXTAUTH_SECRET` | - | NextAuth session secret |
| `QOD_DEMO_MODE` | `true` | Auto-enable demo mode for new projects |
