# Testing

```bash
# Run all backend tests (550+ tests)
cd packages/api && npx vitest run

# Run with coverage
npx vitest run --coverage

# Run specific module tests
npx vitest run src/connectors/github
npx vitest run src/modules/kpi
npx vitest run src/modules/export
npx vitest run src/modules/live
```

## Test Coverage

| Module | Tests | Approach |
|--------|-------|----------|
| GitHub connector | 16 | nock HTTP mocking |
| TestRail connector | 15 | nock HTTP mocking |
| Jira connector | 45 | nock HTTP mocking |
| JUnit XML parser | 19 | XML fixture parsing |
| TestNG XML parser | 14 | XML fixture parsing |
| Auth service + guard | 26 | Unit with mocked Prisma |
| User service | 10 | Unit with mocked Prisma |
| Project service | 9 | Unit with mocked Prisma |
| Connector service + registry | 14 | Unit with mocked Prisma |
| Demo service | 26 | Unit with mocked Prisma |
| KPI service | 18 | Unit with mocked Prisma |
| Aggregation service | 20 | Unit with mocked Prisma |
| Sync engine | 26 | Unit with mocked Prisma + registry |
| Sync scheduler (BullMQ) | 11 | Unit with mocked queue |
| Export service | 19 | Unit with mocked Prisma |
| WebSocket gateway | 21 | Unit with mocked sockets |
| Upload controller | 10 | Unit with mocked sync |
| Prisma service | 2 | Lifecycle hooks |
