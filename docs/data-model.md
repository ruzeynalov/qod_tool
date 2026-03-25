# Data Model

22 Prisma models covering:

- **Organization / User / ProjectMember** - Multi-user with RBAC
- **Project / ConnectorConfig** - Per-project connector configuration
- **TestCase / TestRun / TestResult** - Test execution data with compound unique keys for idempotent sync; re-run tracking via `isRerun`/`originalRunId`
- **Defect / DefectTestLink** - Bug tracking with test case cross-references and JSON changelog for MTTR computation
- **Story / Epic** - Jira stories with epic parent linkage; test coverage via reference IDs
- **PipelineRun** - CI/CD pipeline tracking
- **KPISnapshot / KPITarget** - Time-series metrics with configurable thresholds
- **AlertRule / Notification** - Alert rules and notification records (backend implementation, not yet exposed via UI)
- **DashboardLayout** - Per-user widget layout (Phase 3)
- **AuditLog** - Configuration change tracking
