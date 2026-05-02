# QOD Mobile UI — Phase 2, 3, 4 Implementation Plan

**Issue:** [RUZ-23](mention://issue/8c702faf-cd41-4998-a5f6-a955189e9f39)
**Companion to:** [`docs/mobile-ui-plan.md`](./mobile-ui-plan.md) (revision 4 — high-level plan, design concept, and Phase 1 scope).
**Phase 1 status:** merged on `main` as `27bff64` (PR #11). This doc covers everything that comes after.

---

## 0. Recap of what Phase 1 already shipped

So that the deltas below are unambiguous:

- `app/layout.tsx` — Next 14 `viewport` export.
- `components/ui/dialog.tsx` (new) — portal-mounted, stack-safe `Dialog` + `Sheet` with focus trap, refcounted body scroll lock, refcounted inert background, focus restoration with unmount safety, `aria-labelledby`/`aria-describedby` slots gated on actual title/description registration.
- `components/layout/sidebar.tsx` — split into `Sidebar` (desktop rail, `hidden lg:flex`) + `MobileNav` (`Sheet`-backed drawer for `<lg`, inherits all a11y from the primitive). Common nav rendering extracted to `NavSections`.
- `components/layout/dashboard-layout.tsx` — replaces inline `paddingLeft: 15rem` with `lg:pl-{60,16}`; threads mobile-open state.
- `components/layout/header.tsx` — hamburger button on `<lg`, `px-3 lg:px-6`, breadcrumb collapses to current page on `<sm`.
- `components/layout/user-settings-dialog.tsx` — migrated onto `Dialog` primitive; `inputClass` bumped to `text-base sm:text-sm`.
- Page grid sweep — `grid-cols-2/3` → `grid-cols-1 sm:grid-cols-2 (...lg:grid-cols-N)` in `users/`, `runs/`, `defects/`, `settings/`.

**Invariants carried into 2/3/4** (do not break):
- No `lg:` class is ever removed. Visual diff at ≥1024 px must be empty.
- Every drawer / sheet / dialog uses the shared `Dialog`/`Sheet` primitive from `components/ui/dialog.tsx` — never roll its own focus / scroll-lock / inert / restore.
- `getRowKey` will be required on `DataTable` (Phase 2 introduces it, all 5 callsites migrate in the same commit).

---

## 1. Phase 2 — Tables, tabs, charts, filters

**Scope target:** ~1¼ days of dev. Estimated **~450 LOC additive**.

**PR shape:** **one PR**, by explicit decision. Codex (round 1 review on this doc) recommended splitting Phase 2 into two PRs — table contract/migration in PR-A (DataTable API + 5 callsite migrations + Users), and layout/polish in PR-B (Alerts cards + Tabs scroll + charts + filter-sheet). The user has overridden that recommendation: **all of Phase 2 ships as a single PR.** The trade-offs that informed the override:

- *For combining*: the `DataTable` API change is load-bearing for every other Phase 2 sub-task, the dependency chain is short (Tabs / charts / filter-sheet don't depend on the table change but DO share the same review context), and a single PR keeps reviewers loaded once instead of twice.
- *Against combining (acknowledged)*: the resulting PR is large (~450 LOC across ~12 files), so reviewers must be deliberate about reading it in passes; CI cycle time on amendments is higher; a botched migration on a single callsite blocks the whole PR.
- *Mitigations carried forward*: each Phase 2 sub-section below (1.1 through 1.6) is structured so it can be reviewed independently, with its own acceptance criteria. The PR description should mirror those section headings so reviewers can sweep one area at a time.

### 1.1 `DataTable` API change — `components/ui/data-table.tsx`

Two prop additions in one commit:

```ts
export interface DataTableProps<T> {
  // ...existing...
  /**
   * Required. Stable per-row key. Replaces today's index-keying which is
   * brittle on resort and breaks once the same data is rendered in two DOM
   * shapes (table and card list) at different breakpoints.
   */
  getRowKey: (row: T, idx: number) => string;

  /**
   * Optional. When set, renders an <ul> of cards on <md (using a
   * `hidden md:block` table + `md:hidden` list pair). Receives the same
   * sorted/paginated data as the table; sort and pagination state is
   * shared. Card click should not duplicate `onRowClick` — caller controls
   * tap behaviour inside `mobileCard`.
   */
  mobileCard?: (row: T) => ReactNode;
}
```

Internal changes inside the component:
- `sortedData.map(...)` keys become `getRowKey(row, idx)` instead of `idx`.
- Render pair: keep current `<table>` wrapped in `<div className="hidden md:block overflow-x-auto">`; add a sibling `<ul className="md:hidden divide-y divide-qod-border" role="list">` that maps the same `sortedData` through `mobileCard`. Pagination controls live OUTSIDE the table/list pair so they're shared.
- TS: `getRowKey` is a required field. The 5 migration callsites (below) update in the same commit.

Acceptance: existing desktop renders are visually identical. No `key={idx}` warnings in dev console at any breakpoint.

### 1.2 The 5 `<DataTable>` callsite migrations

For each table, supply `getRowKey` and `mobileCard`. Card style is shared:

```jsx
<li className="px-3 py-3">
  <div className="flex min-w-0 items-center gap-2">
    <span className="truncate text-sm font-medium text-primary">{primary}</span>
    <Badge variant={statusVariant}>{statusLabel}</Badge>
  </div>
  <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted">
    {secondaryFields.map((f) => <span key={f.label}>{f.label}: {f.value}</span>)}
  </div>
</li>
```

The whole `<li>` is the tap target (44 px min height — already exceeded by `py-3` + content).

| File:Line | What | `getRowKey` | `mobileCard` primary / secondary |
|---|---|---|---|
| `runs/page.tsx:315` | Flaky tests | `(t) => t.testId` | name + flakiness-score badge / pass count, fail count, last failure |
| `runs/page.tsx:514` | Run history (DemoTestRun) | `(r) => r.id` | name + status badge / branch, trigger, duration |
| `runs/page.tsx:629` | Pipeline runs | `(r) => r.id` | workflow + status / branch, sha (short), duration, started-at |
| `coverage/page.tsx:471` | Test cases | `(c) => c.id` | externalId + title + automation badge / suite, type, last-run status |
| `coverage/page.tsx:532` | Stories | `(s) => s.id` | externalId + title + status badge / points, assignee, component |

Tap behaviour:
- Test cases card → opens existing `TestHistoryDrawer` (which becomes a Sheet on `<sm` in Phase 3).
- Stories card → no existing drawer; respects existing row click handler if present, otherwise no-op.
- Run history / pipeline runs / flaky tests → no existing detail view today; no tap action wired in Phase 2 (deferred to a future Phase 5 task).

### 1.3 Bespoke tables — Users + Alerts

#### `users/page.tsx:736`

**Migrate onto `DataTable`** — clean migration since the existing `<table>` only renders cells (no inline-edit forms). Steps:

1. Define `userColumns: DataTableColumn<User>[]` with the existing 6 logical columns: Name, Username, Email, Role, Status, Actions.
2. Replace the bespoke `<table>` block (`:737-839`) with `<DataTable columns={userColumns} data={users} getRowKey={(u) => u.id} mobileCard={renderUserMobileCard} />`.
3. The Actions column's render keeps the 4 inline icon-buttons (Edit, Regenerate password, Block-Unblock, Delete) at `:799-835`.
4. `mobileCard` for the user row:
   - **Body**: name + role badge (top), email + username (second line), status badge (third line, only if `blockedAt` is set or role is admin).
   - **Footer / action row**: 3 inline 44×44 icon-buttons — Edit, Block-Unblock, Delete — followed by an overflow `⋯` button at the right end.
   - Overflow `⋯` opens a `Sheet side="bottom"` containing the less-frequent actions: Regenerate password (and any future low-frequency actions). The sheet has its own `DialogTitle` ("More actions for <name>") so a11y stays honest.
   - **Self-row** (matching the existing condition at `users/page.tsx:811`): hide Block + Delete in the inline row; the overflow sheet still renders Regenerate password.

#### `alerts/page.tsx:245` (Rules table) and `:630` (Log table)

**Keep markup, add parallel cards** — the rules table has inline edit controls (toggle, condition editor) that don't fit cleanly into `DataTable`'s render contract. Both tables:

1. Wrap the existing `<table>` in `<div className="hidden md:block ..."> ... </div>`.
2. Add a sibling `<ul className="md:hidden divide-y divide-qod-border">` driven by the same `rules` / `events` arrays.
3. Cards keyed by `rule.id` / `event.id` (use a shared `getKey` helper, NOT index).
4. **Rules card** body: metric + condition + threshold inline; channel as a small badge; enabled toggle inline (full-width tap target). Action row at the bottom: Edit, Delete buttons at 44×44.
5. **Log card** body: alert text (truncated to 2 lines with `line-clamp-2`); rule + time on a secondary line; unread/read indicator dot at the leading edge. Action row: Mark read / Acknowledge.

### 1.4 `Tabs` overflow — `components/ui/tabs.tsx:22-32`

Today's nav is `flex gap-0 -mb-px` with each tab at `whitespace-nowrap px-4 py-2.5 text-sm`. With 3+ tabs (Coverage's Test Cases / Stories / Epics, Runs's Charts / Flaky / History) the row exceeds 320 px.

Change inside the component:

```jsx
<div className={cn('border-b border-qod-border', className)}>
  <nav
    className="-mx-3 flex gap-0 overflow-x-auto px-3 sm:mx-0 sm:px-0 [scrollbar-width:none] [-webkit-overflow-scrolling:touch] [scroll-snap-type:x_mandatory]"
    role="tablist"
  >
    {/* per-tab buttons add: scroll-snap-align: start */}
  </nav>
</div>
```

Plus per-tab class change: append `[scroll-snap-align:start]` to the existing tab class string.

Acceptance: at 320 px, every tab row scrolls horizontally inside the card it belongs to (no body-level scroll). The border under the tabs stays put — only the tab buttons scroll.

### 1.5 Charts — responsive heights + axis fonts + legend placement

Five chart sources (numbers from the survey):

| File:Line | Chart | Current height | Current axis font |
|---|---|---|---|
| `components/charts/pass-rate-trend.tsx:55,62` | LineChart | `h-64` | `fontSize={12}` |
| `runs/page.tsx:189` | Execution timeline | `h-64` | `12` |
| `runs/page.tsx:305` | Flaky tests overlay | `h-72` | `12` |
| `runs/page.tsx:787` (legend at `:810`) | Re-run analysis stacked bar | `h-64` | `12`, legend wrapper `12px` |
| `defects/page.tsx:528,641,659,686` | Burndown / trend / severity / age | `h-48` … `h-64` | mixed |

**Chosen approach** — introduce a small wrapper rather than touch each chart inline:

```tsx
// components/charts/chart-frame.tsx (new, ~40 LOC)
export function ChartFrame({ size = 'md', children }: {
  size?: 'sm' | 'md' | 'lg';
  children: ReactNode;
}) {
  // sm: h-44 sm:h-52 lg:h-48
  // md: h-56 sm:h-64 lg:h-64
  // lg: h-64 sm:h-72 lg:h-72
  const cls = {
    sm: 'h-44 sm:h-52 lg:h-48',
    md: 'h-56 sm:h-64 lg:h-64',
    lg: 'h-64 sm:h-72 lg:h-72',
  }[size];
  return <div className={cls}>{children}</div>;
}
```

For **axis font size**, **do not** add a dedicated hook — the breakpoint delta is 1 px across 5 sites and a `matchMedia` subscription per chart is more machinery than the problem warrants. Instead, derive the value from the single `useMediaQuery('(min-width: 640px)')` hook introduced for Phase 3 (§2.2), called once in each page that owns the charts:

```tsx
// inside e.g. defects/page.tsx render
const isCompact = !useMediaQuery('(min-width: 640px)');
const tickFont = isCompact ? 11 : 12;
// pass `tick={{ fontSize: tickFont }}` to every Recharts axis on the page
```

Then per-chart:
- Replace bare `h-64` / `h-72` / `h-48` divs with `<ChartFrame size="md">` / `"lg"` / `"sm"`.
- Replace `tick={{ fontSize: 12 }}` with `tick={{ fontSize: tickFont }}` using the page-level value above.
- For multi-series charts with a legend, add `<Legend wrapperStyle={{ fontSize: 11 }} verticalAlign="bottom" />` on `<sm` (default desktop position is unchanged — Recharts' default).

Acceptance: at 375 px each chart is at least 220 px tall, axis labels don't collide, no truncation in tick labels.

### 1.6 Filter rows → `Sheet` on `<md`

Targets:
- `runs/page.tsx:485-507` (Status, Branch, Trigger Selects)
- `coverage/page.tsx:429-464` (Test cases filters: 5 controls)
- `coverage/page.tsx:493-525` (Stories filters: 4 controls)
- `defects/page.tsx:734-780` (Severity, Status, Component, Label + SearchInput)

Pattern (one helper, four reuses):

```tsx
// components/layout/filter-sheet.tsx (new, ~80 LOC)
export function FilterSheet({
  triggerLabel = 'Filters',
  activeCount,
  children,           // the existing filter form
  onReset,            // optional clear-all
}: {...}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="md:hidden inline-flex h-10 items-center gap-2 rounded-md border border-qod-border px-3 text-sm"
      >
        <Filter className="h-4 w-4" />
        {triggerLabel}
        {activeCount > 0 && <Badge>{activeCount}</Badge>}
      </button>
      <Sheet open={open} onClose={() => setOpen(false)} side="bottom" className="bg-qod-surface p-0">
        <DialogHeader onClose={() => setOpen(false)}>
          <DialogTitle>Filters</DialogTitle>
        </DialogHeader>
        <DialogBody className="space-y-3">
          {children}
        </DialogBody>
        <div className="sticky bottom-0 flex items-center justify-between gap-2 border-t border-qod-border bg-qod-surface px-4 py-3">
          {onReset && <button type="button" onClick={onReset}>Reset</button>}
          <Button onClick={() => setOpen(false)}>Apply</Button>
        </div>
      </Sheet>
    </>
  );
}
```

For each filter row, wrap the existing controls in the same component twice — once for desktop (`hidden md:flex`), once inside `FilterSheet` (`md:hidden`). Both render the SAME form components against the SAME state, so applying filters in the sheet immediately reflects in the URL/query state and closing the sheet doesn't reset anything. Active filter count drives the badge.

Acceptance: at 375 px, Runs/Defects/Coverage pages show a single "Filters (n)" button instead of a row of dropdowns. Tapping opens a bottom sheet with the same form, focus trap and inert background inherited from `Sheet`.

### 1.7 Phase 2 acceptance criteria

- **Functional**: Runs / Defects / Coverage / Users / Alerts pages render and are usable on iPhone 16 (393 px) and Galaxy Fold cover (320 px) with no horizontal page scroll.
- **A11y**: filter sheets and overflow sheets have `DialogTitle`; no `[Dialog] No <DialogTitle>` warnings in dev.
- **Tests**: extend the existing sidebar Vitest with one snapshot of `DataTable` rendering at the mobile breakpoint to lock in the table↔list swap. Add a Vitest unit for `getRowKey`-driven keying after a sort.
- **Verification**: `next build` clean, `tsc` clean for changed files, `eslint src/` 0 errors, all existing Vitest + Playwright suites still pass.

---

## 2. Phase 3 — Polish, drawer-as-sheet, iOS audit, project switcher

**Scope target:** ~¾ day of dev. Estimated **~180 LOC additive**.
**PR shape:** one PR. Touches `header.tsx`, `test-history-drawer.tsx`, several shared form classes, KPI Formula Configurator, and adds the project switcher.

### 2.1 Header right-side overflow `⋯` — `components/layout/header.tsx`

The right side after Phase 1 has 5 controls with these line numbers:
- `:131` Demo toggle
- `:143` NotificationBell
- `:150` Skin switcher (`h-8 w-8`)
- `:186` Theme toggle (`h-8 w-8`)
- `:200` User avatar (`h-8 w-8`, circular)

On `<sm` we keep **NotificationBell + Avatar visible** (highest signal, smallest footprint), and move **Demo toggle, Skin switcher, Theme toggle into a `⋯` overflow menu** — a single `h-10 w-10` button followed by a `Sheet side="bottom"` containing the three controls as full-width rows (icon + label + current value badge for skin/theme).

Implementation sketch:

```jsx
{/* Right section */}
<div className="flex shrink-0 items-center gap-2 sm:gap-3">
  <div className="hidden sm:contents">
    {/* DemoToggle, Skin, Theme all stay here on >=sm */}
  </div>
  <button className="sm:hidden h-10 w-10 ..." onClick={() => setOverflow(true)} aria-label="More controls">
    <MoreHorizontal className="h-5 w-5" />
  </button>
  <NotificationBell />        {/* always visible */}
  <UserAvatarMenu ... />      {/* always visible */}
</div>

<Sheet open={overflow} onClose={() => setOverflow(false)} side="bottom" className="bg-qod-surface p-0">
  <DialogHeader onClose={() => setOverflow(false)}>
    <DialogTitle>Display & data</DialogTitle>
  </DialogHeader>
  <DialogBody className="space-y-1">
    <DemoToggleRow />     {/* existing toggle, full-width row layout */}
    <SkinPickerRow />     {/* existing skin options, full-width rows */}
    <ThemeToggleRow />    {/* existing theme toggle, full-width row */}
  </DialogBody>
</Sheet>
```

The skin / theme menus that live inline in `header.tsx` today (`<div className="absolute right-0 top-full ... w-52">`) are reused inside the sheet but with `w-full` instead of `w-52`. No duplication of business logic — only layout.

### 2.2 `test-history-drawer.tsx` becomes a `Sheet`

Today: `fixed right-0 top-0 z-50 flex h-full w-full max-w-lg` (`:190-192`). On a 375 px phone this renders 100 % wide, which IS usable, but it's a hand-rolled overlay with no focus trap, no inert background, no body scroll lock. Move onto the shared primitive:

```jsx
<Sheet
  open={open}
  onClose={onClose}
  side={mobile ? 'bottom' : 'right'}
  className="bg-qod-surface p-0"
>
  <DialogHeader onClose={onClose}>
    <DialogTitle>{testTitle}</DialogTitle>
    <DialogDescription>{suiteName} · {executionsCount} runs</DialogDescription>
  </DialogHeader>
  <DialogBody>...existing chart + execution list...</DialogBody>
</Sheet>
```

`mobile` derived from a single `useMediaQuery('(max-width: 639px)')` hook (introduce as `lib/utils/use-media-query.ts`, ~15 LOC). Reuse this hook for the chart legend placement and any future breakpoint-conditional renders.

Existing `Sheet` widths cover both:
- `side="right"` desktop: existing `w-72 max-w-[85vw]` from the primitive — too narrow vs current 448 px. Add a width override via the `className` prop: `lg:w-[28rem] lg:max-w-[28rem]`.
- `side="bottom"` mobile: existing `inset-x-0 bottom-0 max-h-[85dvh]`.

Acceptance: tapping a test row on the Coverage test cases card list opens the same drawer it always did, but on `<sm` it slides up from the bottom and is dismissed by **Esc or backdrop tap**. Swipe-to-dismiss is **out of scope for this phase** — the shared `Sheet` primitive currently exposes only `Esc` and backdrop close (`components/ui/dialog.tsx`); adding a pointer-gesture handler would be a primitive change and is tracked separately in Phase 5 if user testing surfaces a real need.

### 2.3 iOS auto-zoom audit

Targets confirmed by survey:
- `components/ui/select.tsx:39` — the `<select>` element class list includes `text-sm`.
- `components/ui/search-input.tsx` — input is `text-sm`.
- `users/page.tsx:96` — `inputClass` constant.
- `alerts/page.tsx:67` (`inputClass`) and `:70` (`selectClass`).

For each, change `text-sm` → `text-base sm:text-sm`. Concrete: in shared component files (`select.tsx`, `search-input.tsx`) change once; in page-local `inputClass` constants change in place. Run `grep -rn 'text-sm' packages/web/src | grep -E '(input|select|textarea|inputClass|selectClass)'` after the edit to confirm zero remaining.

There is one open question about `select.tsx`: native `<select>` zoom on iOS is partially controlled by `font-size` of the option as well. Confirmed minimum is the trigger element being 16 px; option font-size inherits. The `text-base sm:text-sm` change is sufficient.

### 2.4 Tap target sweep

`h-8 w-8` icon buttons (per the survey):
- `header.tsx:150` (Skin switcher)
- `header.tsx:186` (Theme toggle)

Both will be moved into the overflow sheet on `<sm` per §2.1, so the tap-target sweep on those is implicit (sheet rows are full-width). The remaining `h-8 w-8` buttons in the codebase that DO stay visible at `<sm` (NotificationBell trigger, Avatar) get `h-8 w-8 sm:h-8 lg:h-8` → `h-10 w-10 sm:h-8` so they grow on the smallest viewports.

`users/page.tsx:799-824` action buttons (`p-1.5`) are inside the desktop `<table>` cell — on mobile they live in the new `mobileCard` action row at 44×44, so no change needed in the desktop path.

### 2.5 KPI Formula Configurator

Today (per survey): `kpi-formula-configurator/index.tsx:82` is `grid grid-cols-1 gap-4 lg:grid-cols-[260px_minmax(0,1fr)]`. This already stacks on `<lg` — no change needed in the layout grid.

What DOES need work: the inner formula list rendered in the 260 px left rail. On `<lg` it stacks ABOVE the editor — fine. But on `<sm` the list of formulas may be long; convert it to a horizontally-scrollable strip of pills (similar to the Tabs pattern from §1.4) so the user can pick a formula without scrolling past the entire editor. Lower priority — only do this if it shows up as a pain point in manual smoke (Phase 4).

### 2.6 Project switcher beside the page title

No project switcher exists today (survey confirmed). On `/projects/[id]/*` routes, add a `<select>` (or a `Sheet`-backed picker on `<sm`) beside the page title that lists workspace projects and navigates on change.

Implementation:
- New component `components/layout/project-switcher.tsx` (~60 LOC).
- Renders in the page title row on `<lg` (small inline `<select>` with project count badge).
- Renders inside the mobile drawer (`MobileNav`) on `<lg` so the user can switch projects from the hamburger.
- Data source: existing `useProjects()` hook from `lib/api/hooks.ts`.
- Navigation: `router.push(targetUrl)` where `targetUrl` is computed via a **conservative whitelist of known shared sub-routes** — `coverage`, `runs`, `defects`, `kpis`, `alerts`, `settings`. The algorithm:
  1. `parts = pathname.split('/').filter(Boolean)` → e.g. `['projects', 'demo-banking', 'coverage']`.
  2. If `parts[0] === 'projects'` and `parts.length >= 3` and `parts[2]` is in the whitelist, build `/projects/<newId>/<parts[2]>`.
  3. Otherwise fall back to `/projects/<newId>` (project overview).
  4. **Drop query strings, hashes, and any deeper segments** — `parts[3+]` is intentionally ignored. Carrying e.g. `?status=open` or `#defect-42` into a different project would point at filters or rows that may not exist there, ranging from "meaningless" to "broken" (deep-linked alert log anchors, expanded epic rows, defect ids).
- Aria: the trigger is a `<select>` (or `combobox`-role button) with an explicit `aria-label="Switch project"`; option labels are project names (not ids).

### 2.7 Phase 3 acceptance criteria

- **Functional**: a full UX pass on iPhone 16, Pixel 8, iPhone SE (375), Galaxy Fold cover (320). Every flow listed in the README's "Dashboard Modules" section completable on each device.
- **iOS auto-zoom**: a manual test on real iOS Safari (or DevTools' "iPhone 14 Pro" device emulation with text-zoom check) — focusing inputs in `UserSettingsDialog`, the Login form, and any settings dialog does NOT zoom the viewport.
- **A11y**: all overflow sheets have `DialogTitle`; the shared dev-only "no DialogTitle" warning never fires in normal use.
- **Tests**: extend e2e mobile smoke (Phase 4) to cover open/close of overflow sheet, project switcher, and test history drawer at 375 px.

---

## 3. Phase 4 — Verification & guardrails

**Scope target:** ~½ day. Estimated **~80–120 LOC additive** plus checked-in screenshot baselines.
**PR shape:** one PR. Adds: a Playwright `mobile` project, a mobile-smoke spec, screenshot baselines at two viewports for the canonical pages, and a CI step for mobile a11y.

### 3.1 Playwright `mobile` project

Edit `packages/web/playwright.config.ts` to add a new project:

```ts
import { devices } from '@playwright/test';

projects: [
  // existing chromium / firefox / webkit
  {
    name: 'mobile-chromium',
    use: { ...devices['iPhone 14'] }, // 393×852, DPR 3, mobile UA
  },
  {
    name: 'mobile-chromium-narrow',
    use: { ...devices['iPhone SE'] }, // 375×667, DPR 2
  },
],
```

Update CI (`.github/workflows/ci.yml:99-130`) to run the new mobile projects on every PR alongside the existing chromium-only run:

```yaml
- name: Run Playwright (chromium)
  run: cd packages/web && npx playwright test --project=chromium
- name: Run Playwright (mobile)
  run: cd packages/web && npx playwright test --project=mobile-chromium --project=mobile-chromium-narrow
```

### 3.2 `e2e/mobile-smoke.spec.ts` (new)

**Use the existing fixtures.** `packages/web/e2e/fixtures/demo-mode.ts` already exports:
- `test` — a Playwright test that pre-seeds `qod-demo-mode=true` in `localStorage`, skipping the login gate.
- `DEMO_PROJECTS` — the canonical demo project ids: `demo-ecommerce`, `demo-banking`, `demo-internal`. The doc previously used a fictional `demo-1` which would 404; the spec MUST import from this fixture.

**Routes covered** (8 unauthenticated demo-mode routes, plus 1 admin-gated):

```ts
import { DEMO_PROJECTS } from './fixtures/demo-mode';
const PID = DEMO_PROJECTS.ecommerce.id; // 'demo-ecommerce'

const PUBLIC_ROUTES = [
  '/',
  '/projects',
  `/projects/${PID}`,
  `/projects/${PID}/kpis`,
  `/projects/${PID}/runs`,
  `/projects/${PID}/defects`,
  `/projects/${PID}/coverage`,
  `/projects/${PID}/settings`,
];
// '/users' is admin-only — see admin fixture below.
```

**Admin fixture (new)** for the one admin-gated route. `packages/web/src/app/(dashboard)/users/page.tsx:676-688` shows an Access Denied screen when `!isAdmin`, and `auth-provider.tsx:75` derives `isAdmin` from `user?.role === 'ADMIN'`. Demo mode does NOT seed an auth user, so a vanilla `demoPage` would assert against the Access Denied screen instead of the user list.

Add a sibling fixture `packages/web/e2e/fixtures/admin-mode.ts` (~25 LOC) that builds on `demoPage` and additionally seeds `qod-auth-token` and `qod-auth-user` with a synthetic admin user before navigation:

```ts
import { test as base } from './demo-mode';
export const test = base.extend({
  adminPage: async ({ page }, use) => {
    await page.addInitScript(() => {
      localStorage.setItem('qod-auth-token', 'mobile-smoke-admin-token');
      localStorage.setItem('qod-auth-user', JSON.stringify({
        id: 'mobile-smoke-admin', email: 'admin@example.com',
        name: 'Mobile Smoke Admin', role: 'ADMIN', orgId: 'demo-org',
      }));
    });
    await use(page);
  },
});
```

`/users` is the only route in the smoke matrix that uses `adminPage`; everything else uses `demoPage` from the existing fixture.

**Two assertions per route per mobile viewport:**

```ts
test('no horizontal body scroll', async ({ demoPage }) => {
  await demoPage.goto(route);
  const overflow = await demoPage.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(1); // sub-pixel slack
});

test('hamburger opens drawer and traps focus', async ({ demoPage }) => {
  await demoPage.goto('/');
  await demoPage.getByRole('button', { name: /open navigation menu/i }).click();
  await expect(demoPage.getByRole('dialog')).toBeVisible();
  await demoPage.keyboard.press('Tab');
  const inside = await demoPage.evaluate(() => {
    const d = document.querySelector('[role="dialog"]');
    return d?.contains(document.activeElement) ?? false;
  });
  expect(inside).toBe(true);
  await demoPage.keyboard.press('Escape');
  await expect(demoPage.getByRole('dialog')).toBeHidden();
  await expect(demoPage.getByRole('button', { name: /open navigation menu/i })).toBeFocused();
});
```

Spec file: `packages/web/e2e/mobile-smoke.spec.ts`. Admin fixture: `packages/web/e2e/fixtures/admin-mode.ts`. Combined estimate ~220 LOC.

### 3.3 Visual regression baselines

Use Playwright's built-in `toHaveScreenshot()` (no extra dep). One spec at `e2e/visual-regression.spec.ts`:

```ts
import { test, expect, DEMO_PROJECTS } from './fixtures/demo-mode';
const PID = DEMO_PROJECTS.ecommerce.id; // 'demo-ecommerce'

const ROUTES = [
  '/',
  '/projects',
  `/projects/${PID}/kpis`,
  `/projects/${PID}/runs`,
  `/projects/${PID}/defects`,
  `/projects/${PID}/coverage`,
  `/projects/${PID}/settings`,
];
const VIEWPORTS = [
  { name: 'mobile', width: 375, height: 812 },
  { name: 'desktop', width: 1280, height: 800 },
];

for (const v of VIEWPORTS) {
  for (const r of ROUTES) {
    test(`${v.name} ${r}`, async ({ demoPage }) => {
      await demoPage.setViewportSize(v);
      await demoPage.goto(r, { waitUntil: 'networkidle' });
      await expect(demoPage).toHaveScreenshot(`${v.name}-${r.replace(/[/]/g, '_') || 'home'}.png`, {
        fullPage: true,
        animations: 'disabled',
        maxDiffPixelRatio: 0.005,
      });
    });
  }
}
```

Baselines committed under `packages/web/e2e/visual-regression.spec.ts-snapshots/`. CI updates baselines via `--update-snapshots` only when explicitly invoked (separate workflow_dispatch).

**Critical rule**: any PR that touches CSS / layout MUST run visual regression locally and either accept the diff (re-record baselines and commit) or reject the change. The baseline commit lock-in is the strongest defense against accidental desktop regression.

### 3.4 Lighthouse mobile a11y

Add a CI job using `lhci` (Lighthouse CI) — most lightweight integration:

```yaml
lighthouse-mobile:
  name: Lighthouse Mobile
  runs-on: ubuntu-latest
  needs: [test-web]
  steps:
    - uses: actions/checkout@v4
    - uses: actions/setup-node@v4
      with: { node-version: 22, cache: npm }
    - run: npm ci
    - run: npm run -w packages/shared build
    - name: Run Lighthouse CI
      run: |
        npm install -g @lhci/cli
        cd packages/web
        npx next build && npx next start -p 3001 &
        sleep 5
        lhci autorun --config=./lighthouserc.json
```

`packages/web/lighthouserc.json`:

```json
{
  "ci": {
    "collect": {
      "url": ["http://localhost:3001/", "http://localhost:3001/projects"],
      "settings": { "preset": "perf", "emulatedFormFactor": "mobile" }
    },
    "assert": {
      "assertions": {
        "categories:accessibility": ["error", { "minScore": 0.9 }],
        "categories:best-practices": ["warn", { "minScore": 0.9 }]
      }
    }
  }
}
```

Acceptance: a11y ≥ 0.9 on mobile for the home page and projects listing. Best-practices is a warning, not a blocker.

### 3.5 Phase 4 acceptance criteria

- **Mobile smoke**: `mobile-smoke.spec.ts` passes on both `mobile-chromium` (iPhone 14, 393 px) and `mobile-chromium-narrow` (iPhone SE, 375 px). 8 routes use `demoPage` (8 public routes); `/users` uses `adminPage` (the new fixture).
- **Visual regression**: baselines exist for 7 routes × 2 viewports (14 images), all driven by `demoPage` so no auth state pollutes the snapshot. PRs that change layout produce a clean visual diff.
- **Lighthouse**: a11y ≥ 0.9 on mobile for home + projects.
- **CI**: all 4 new checks (`mobile-chromium`, `mobile-chromium-narrow`, `visual-regression`, `lighthouse-mobile`) added to required-checks list (or at least to the merge-blocking set).

---

## 4. Sequencing & dependencies

```
Phase 1 (merged) ────► Phase 2 ──┬──► Phase 3 ──► Phase 4
                                  │
                                  └─► (Phase 4 partially in parallel: mobile-smoke
                                       spec can be drafted against Phase 2 output;
                                       visual-regression baselines locked in
                                       AFTER Phase 3 ships)
```

Ordering rationale:
- **Phase 2 must precede Phase 3** because Phase 3's overflow sheet, project switcher, and test-history-drawer-as-sheet all depend on the `Sheet` primitive being in heavy production use (so Phase 2 catches edge cases the lighter Phase 1 use didn't).
- **Phase 4's mobile-smoke spec can land partly during Phase 2** — the no-horizontal-scroll assertions are useful as a CI guard while Phase 2 sweeps the remaining grid cases. Visual-regression baselines must wait until Phase 3 ships, or they get re-recorded twice.
- **Phase 4's Lighthouse step** can land at any time; recommend right after Phase 3 so the a11y gate reflects the final UX.

---

## 5. Risks & rollback

| Phase | Risk | Mitigation | Rollback |
|---|---|---|---|
| 2 | `getRowKey` migration touches all 5 callsites; a missed key → React reconciles wrong rows on resort | Migrate all 5 in the same commit; PR description includes the `getRowKey` fn for each callsite for reviewer eyeballs | Single revert of the commit puts the table back to index keys |
| 2 | `mobileCard` divergence — the same row data displays inconsistently between table and card | The `mobileCard` is a presentation function only; both DOM shapes render from the same `data` array with the same `getRowKey`. No data fork possible | Drop the `mobileCard` prop on the offending callsite; table continues to render |
| 2 | Filter Sheet captures the form but `Apply` button doesn't visibly close on `<sm` | Sheet uses `Sheet`'s built-in close-on-backdrop + `onClose={() => setOpen(false)}` on Apply. Test in mobile-smoke spec | Drop the `FilterSheet` wrapper, fall back to `flex-wrap` row |
| 3 | Header `⋯` menu hides Theme toggle on `<sm` — users may not find dark mode | Add a "Theme" row label inside the sheet so it's obvious; theme toggle is also accessible via `UserSettingsDialog` for logged-in users | Restore the inline buttons; cost is a 50 px-wide row of icons that wraps on smallest viewports |
| 3 | iOS auto-zoom audit misses a third-party form (e.g. inside a connector setup wizard) | Plan explicitly excludes connector setup wizards (per `mobile-ui-plan.md` §4 "out of scope"); follow-up if user testing surfaces issues | Per-call font-size override in the offending wizard component |
| 3 | Project switcher confuses users who deep-link to `/projects/[id]/runs` then switch to a project that has no Runs | Best-effort sub-route preservation with fallback to project overview; the switcher itself displays project status badges so users know what they're picking | Hide the switcher on routes where it's confusing; revert to breadcrumb-only navigation |
| 4 | Visual regression flakes on chart animation / dynamic data | `animations: 'disabled'`, demo data is deterministic per `lib/demo`. If flake persists, mask the chart region with `mask` selector | Lower `maxDiffPixelRatio`; mark route as visual-regression-skip with a comment |
| 4 | Lighthouse a11y regression below 0.9 due to a third-party widget (e.g. recharts) | Score the home + projects routes (no charts) for the gate; charts pages get a separate, lower-bar score | Drop the gate to `warn` while the underlying issue is fixed |

---

## 6. LOC estimate (refining the original plan's table)

| Phase | New files | Modified files | LOC additive |
|---|---|---|---|
| 2 | `chart-frame.tsx`, `filter-sheet.tsx` | `data-table.tsx`, 5 callsites, `tabs.tsx`, `users/page.tsx`, `alerts/page.tsx`, ~5 chart files | ~480 |
| 3 | `use-media-query.ts`, `project-switcher.tsx` | `header.tsx`, `test-history-drawer.tsx`, `select.tsx`, `search-input.tsx`, `users/page.tsx`, `alerts/page.tsx`, KPI formula configurator | ~210 |
| 4 | `e2e/mobile-smoke.spec.ts`, `e2e/visual-regression.spec.ts`, `lighthouserc.json`, screenshot baselines | `playwright.config.ts`, `.github/workflows/ci.yml` | ~250 + binaries |

Cumulative across 2/3/4: **~940 LOC additive plus ~14 baseline screenshots.** Zero deletions on any `lg:` class.

---

## 7. Definition of Done — full mobile UI initiative

After Phase 4 merges:
- Every page in the README's "Dashboard Modules" section is fully usable at 320–414 px without horizontal scrolling.
- iPhone 16 (393), Pixel 8 (412), iPhone SE (375), Galaxy Fold cover (320) all pass manual smoke.
- Visual diff at ≥1024 px vs pre-Phase-1 `main` is empty (verified by visual-regression baselines).
- Mobile-smoke + visual-regression + Lighthouse-mobile are required CI checks.
- No remaining `text-sm` form inputs in shared/page-level components.
- All drawers / sheets / dialogs derive from `components/ui/dialog.tsx`.
- All `<DataTable>` callsites have stable `getRowKey` and at least one (per page) ships a `mobileCard`.
