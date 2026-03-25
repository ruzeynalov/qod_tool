# Real-time Updates

WebSocket gateway at `/live` namespace provides real-time streaming:

- Subscribe to project rooms for live updates
- `run:update` — test run progress (pass/fail counts, percentage)
- `run:complete` — final run summary
- `test:result` — individual test result as it completes

## WebSocket Protocol

```
ws://localhost:4000/live

# Client events
subscribe    { projectId: string }   -> ack
unsubscribe  { projectId: string }   -> ack

# Server events
run:update   { id, status, passedCount, failedCount, totalTests, progress }
run:complete { id, status, passedCount, failedCount, totalTests, duration }
test:result  { testCaseId, status, durationMs, errorMessage? }
```
