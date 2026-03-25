# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

QOD (Quality Observability Dashboard) is a self-hosted quality metrics platform. It aggregates data from GitHub Actions, Jira, TestRail, and JUnit/TestNG XML reports into a unified dashboard with KPI tracking, defect analytics, and test coverage heatmaps.

## Commands

```bash
# Install dependencies (npm workspaces)
npm install

# Start all services in dev mode (Turbo)
npx turbo dev

# Start frontend only (demo mode, no backend needed)
npm run -w packages/web dev          # http://localhost:3000

# Start backend only
npm run -w packages/api dev          # http://localhost:4000

# Infrastructure
npm run docker:up                    # Start PostgreSQL + Redis
npm run docker:down                  # Stop infrastructure
npm run db:migrate                   # Run Prisma migrations
npm run db:seed                      # Seed admin user + demo data

# Run all backend tests (Vitest, ~340 tests)
cd packages/api && npx vitest run

# Run a specific test file or module
cd packages/api && npx vitest run src/connectors/github
cd packages/api && npx vitest run src/modules/kpi/kpi.service.spec.ts

# Run tests in watch mode
cd packages/api && npx vitest

# Run with coverage
cd packages/api && npx vitest run --coverage

# Build all packages
npm run build

# Lint
npm run lint
```

## Architecture

Turborepo monorepo with three packages:

- **`packages/api`** — NestJS + Fastify backend. Prisma ORM for PostgreSQL, BullMQ for async sync jobs, Socket.IO WebSocket gateway at `/live`.
- **`packages/web`** — Next.js 14 (App Router) frontend. Tailwind CSS, Recharts, TanStack Query, Zustand. Runs in **demo mode** by default using client-side generated data (no backend required).
- **`packages/shared`** — Shared TypeScript types (`IQODConnector`, `IReportUploadConnector`, normalized data interfaces) and the deterministic demo data generator.

### Data Flow

External systems (GitHub, TestRail, Jira) → Connectors (polling or webhook) → SyncService normalizes data → Prisma upserts with compound unique keys (`[projectId, externalId, source]`) for idempotent sync → AggregationService computes KPI snapshots → WebSocket gateway pushes live updates.

Report uploads (JUnit/TestNG XML) go through `UploadController` → `IReportUploadConnector.parseReport()` → same SyncService pipeline.

### Backend Module Structure (`packages/api/src/`)

NestJS modules follow a standard pattern: `*.module.ts`, `*.service.ts`, `*.controller.ts`, `*.service.spec.ts`.

- **`connectors/`** — Each connector (github, testrail, jira, junit-xml) implements `IQODConnector` or `IReportUploadConnector` from `@qod/shared`. Registered in `ConnectorRegistryService` at startup.
- **`modules/sync/`** — SyncService orchestrates data ingestion. SyncScheduler uses BullMQ for cron-based polling.
- **`modules/aggregation/`** — Computes KPI metrics from raw data (pass rate, coverage, MTTD/MTTR, flaky rate, etc.).
- **`modules/kpi/`** — KPI dashboard endpoints and target/threshold management.
- **`modules/alert/`** — Alert service (backend logic implemented, not yet wired to UI or API endpoints).
- **`modules/live/`** — Socket.IO WebSocket gateway for real-time run streaming.
- **`modules/export/`** — Connector export (JSON) and data export endpoints.
- **`modules/demo/`** — Backend demo data endpoints (delegates to `@qod/shared` generator).
- **`common/utils/prisma-mock.ts`** — Shared Prisma mock factory used across all unit tests (`createPrismaMock()`).

### Frontend Structure (`packages/web/src/`)

- **`app/(dashboard)/`** — Next.js App Router pages. Route group `(dashboard)` wraps all pages in the dashboard layout. Project pages at `projects/[id]/` with sub-pages: kpis, runs, defects, settings.
- **`app/_providers/`** — React context providers: DemoMode, QueryClient, Theme.
- **`components/`** — `ui/` (reusable primitives), `charts/` (Recharts wrappers), `layout/` (sidebar, header, breadcrumbs).
- **`lib/demo/`** — Client-side demo data provider. Caches generated data per project for stable page reloads.
- **`lib/api/`** — API client (fetch wrapper) and TanStack Query hooks.

### Database

Prisma schema at `packages/api/prisma/schema.prisma` with 20 models. Key patterns:
- All IDs are UUID (`@db.Uuid`)
- Column names use snake_case via `@map()`, model fields use camelCase
- Compound unique constraints for idempotent connector sync: `@@unique([projectId, externalId, source])`
- JSON fields for flexible data: `credentials`, `changelog`, `fieldMapping`, `widgets`, `jobs`

### Testing Patterns

- All backend tests use Vitest with `globals: true`
- Tests are co-located as `*.spec.ts` next to source files
- Unit tests mock Prisma via `createPrismaMock()` from `common/utils/prisma-mock.ts`
- Connector tests use `nock` for HTTP request interception
- XML parser tests use fixture files

### Key Conventions

- The `@qod/shared` package must be built before the API or web packages (`turbo` handles this via `dependsOn: ["^build"]`)
- The frontend's demo mode is the default experience — the app is fully functional without a backend
- All REST endpoints are under `/api/v1/`
- Swagger docs at `/api/docs` when the backend is running
- Environment config follows 12-factor (see `.env.example`)
