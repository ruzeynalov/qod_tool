# QOD Mobile UI/UX Plan

**Issue:** RUZ-23 — Mobile view for Quality Observability Dashboard
**Scope:** Make QOD usable on phones (320–414 px), reference devices iPhone 16 (393 px) and Pixel 8 (412 px). **Desktop view (≥1024 px) must remain pixel-identical to today.**
**Approach:** Mobile-first Tailwind utilities layered onto the existing desktop classes. No component duplication, no separate "mobile app".

**Revision 2 (post-Codex round 1)** — added: bespoke tables (`users/page.tsx`, `alerts/page.tsx` ×2) and `Tabs` overflow folded into Phase 2; new shared `Dialog`/`Sheet` primitive in Phase 1 (existing `UserSettingsDialog` has no focus trap / scroll lock / focus restoration — confirmed); `getRowKey` shipped alongside `mobileCard` on `DataTable`; iOS auto-zoom audit corrected — `text-sm` inputs in `user-settings-dialog.tsx:9-10` and `select.tsx:32-39` are real and need bumping to `text-base` on `<sm`.

**Revision 3 (post-Codex round 2)** — Users mobile-card action layout pinned down (per-row Edit / Regenerate password / Block-Unblock / Delete actions at `users/page.tsx:795-835`); `Dialog`/`Sheet` primitive scope hardened with portal mounting (cites `notification-bell.tsx:86` z-index conflict and `users/page.tsx:736` `overflow-hidden` clip risk) and explicit `aria-labelledby` / `aria-describedby` wiring via `DialogTitle` / `DialogDescription` slots; `getRowKey` promoted to a global `DataTable` requirement; focus-restoration safety added (no-op if trigger has unmounted during route change).

**Revision 4 (post-Codex round 3 — final)** — `<DataTable>` callsite inventory corrected from **3** to **5**: Runs ×3 (`runs/page.tsx:315,514,629`) and **Coverage ×2** (`coverage/page.tsx:471` test cases, `:532` stories) which the previous count missed. Both Coverage tables are added to Phase 2 for required `getRowKey` migration **and** for `mobileCard` treatment — these are the test case and stories drill-down lists from the README's "Test Coverage" module, central to mobile usability, not desktop-only.

---

## 1. Current state — why it breaks on phones

Survey of `packages/web/src/`:

| Area | File | Problem |
|---|---|---|
| Root document | `app/layout.tsx` | No `<meta name="viewport">` — phones render at 980 px and zoom out, fonts become illegible. |
| Shell | `components/layout/dashboard-layout.tsx:20` | Inline `paddingLeft: 15rem` always pushes content right of the sidebar. On a 375 px screen only ~135 px is left for the page. |
| Sidebar | `components/layout/sidebar.tsx:59-63` | `fixed left-0 w-60` (or `w-16` collapsed) — always present, no off-canvas. Even collapsed it eats 64 px. |
| Header | `components/layout/header.tsx:79` | `h-14 px-6` with a long breadcrumb trail + 5 right-side controls (demo toggle, bell, paint, theme, avatar). On 375 px the row overflows and the breadcrumb wraps awkwardly. |
| Header menus | `header.tsx:129,176` | Dropdowns use `w-52` / `w-48` positioned `right-0`. Fine — just need to verify they do not exceed `100vw - 16px`. |
| Tables (shared) | `components/ui/data-table.tsx:98-99` | Single `overflow-x-auto`. Real-world usage (Runs, Defects, Coverage) renders 6–9 columns at `text-sm` — practically unreadable on phones, requires constant horizontal scrolling. Rows also keyed by index (`:153-156`), brittle once breakpoint can swap DOM. |
| Tables (bespoke) | `users/page.tsx:737`, `alerts/page.tsx:245`, `:630` | Three wide tables that **do not use `DataTable`** — `mobileCard` alone will not reach them. Need either migration or a parallel mobile treatment. |
| Tabs | `components/ui/tabs.tsx:22-32` | `flex` row with `whitespace-nowrap` items, no horizontal scroll. With 4–6 tabs (e.g. Coverage's Stories/Epics/Cases) the row overflows the viewport at `<sm`. |
| Page grids | `projects/[id]/{runs,defects,settings,users}/page.tsx` | Hard `grid-cols-2` / `grid-cols-3` without breakpoint — KPI tiles jam into 150 px columns on a 320 px screen. |
| Charts | `components/charts/*.tsx`, `kpis/page.tsx:508` | Hardcoded heights `h-64` / `h-72`, `fontSize={12}` axis labels. Charts render but legends/labels collide. |
| KPI page | `kpis/page.tsx` | Trend chart toolbar (period selector + metric chips) assumes wide row, wraps poorly. |
| Modals/dialogs | `settings/page.tsx`, `user-settings-dialog.tsx`, `test-history-drawer.tsx` | Use `max-w-lg` / `max-w-md` with `mx-4`. Drawer width may exceed viewport on small phones. |
| Tap targets | Various | Many buttons at `h-8 w-8` (32 px) — below the 44 px minimum recommended for touch. |

**Summary:** the bulk of the brokenness is fixed by four things — viewport meta, off-canvas sidebar, a card-mode for shared tables, and a parallel pass over the three bespoke tables (Users, Alerts ×2). The rest is a sweep through grids, chart heights, tab overflow, dialog a11y, and the 16 px input audit.

---

## 2. Design concept

### 2.1 Breakpoints

Stay on Tailwind defaults — adding a custom breakpoint risks regressing desktop classes that were authored against `lg: 1024`.

| Token | Width | Layout intent |
|---|---|---|
| `<sm` (default, 0–639 px) | **Mobile.** Single column, off-canvas sidebar, card-mode tables, condensed header. |
| `sm:` (640–767) | Larger phones / small tablets. 2-column tile grids return. |
| `md:` (768–1023) | Tablets. Sidebar still off-canvas, but content can use 2–3 column layouts and tables can return to native form. |
| `lg:` (≥1024) | **Desktop — unchanged.** Persistent sidebar, full tables, 3–4 column tile grids. All existing `lg:` classes keep their meaning. |

Reference targets: iPhone 16 = 393 px (`<sm`), Pixel 8 = 412 px (`<sm`), iPhone SE = 375 px (`<sm`). Smallest supported width = **320 px** (Galaxy Fold cover, older iPhone SE).

### 2.2 Information architecture

The dashboard's job on a phone is **glanceable status + drill-down**, not data exploration. So we de-emphasise wide tables and emphasise:

1. **At-a-glance KPI cards** — one card per row on `<sm`, two on `sm`.
2. **Key chart** — large enough to read (≥220 px tall), labels readable.
3. **Lists, not tables** — every wide table degrades to a vertical list of cards on `<md`. Each card shows the 2–4 most identifying fields and is tappable to open a detail drawer/page.
4. **Filters in a sheet** — filter rows that span the screen on desktop become a single "Filters" button that opens a bottom sheet on mobile.
5. **Bottom thumb-zone** — primary action buttons (e.g. "Sync now", "Add user") move to a sticky bottom bar inside their page on `<sm`, so they are reachable one-handed.

### 2.3 Navigation pattern

- **`<lg`:** Sidebar becomes an off-canvas drawer triggered by a hamburger button placed in the header (left of the breadcrumb). Drawer slides in from the left, covers ~80 % of viewport, dimmed backdrop, closes on backdrop tap / nav-item tap / `Esc`.
- **`<lg`:** Breadcrumb in the header collapses to **only the current page** (e.g. "Defects"). Full path is still visible inside the drawer header.
- **`<sm`:** Right-side header controls collapse into a single `⋯` "More" menu (skin, theme, demo toggle move into it; bell + avatar stay outside).
- **Project switching:** Today there is no explicit switcher — users go via Projects list. On mobile we add a dropdown beside the page title for pages under `/projects/[id]/...` so users can hop between projects without two taps.

### 2.4 Component-level patterns

- **DataTable (`components/ui/data-table.tsx`)** gains two related changes:
  - `getRowKey: (row: T, idx: number) => string` — **required on every callsite**, not only when `mobileCard` is set. There are 5 `<DataTable>` callsites in the repo today — `runs/page.tsx:315,514,629` and `coverage/page.tsx:471,532` — all migrated in the same commit as the API change. Making row identity explicit everywhere is cheaper than carrying a TS conditional and removes the index-key brittleness on desktop too. Default sort already mutates row order (`data-table.tsx:71-91`), so this is a real correctness win independent of mobile.
  - `mobileCard?: (row: T) => ReactNode` — optional render. When set, on `<md` the component renders `<ul>` of cards (using a `hidden md:block` table + `md:hidden` list pair), driven by the same `data` and the same `getRowKey`. Default fallback on `<md` (no `mobileCard`) is "first 2 columns visible, rest collapsed under an expand chevron".
- **Bespoke tables** (`users/page.tsx`, `alerts/page.tsx`) — two paths:
  - **Users → migrate to `DataTable`.** Each row has 4 inline action buttons today (Edit / Regenerate password / Block-Unblock / Delete at `users/page.tsx:795-835`), so the migration ships an explicit mobile card layout for actions, not just metadata:
    - **Card body:** Name + role badge (top), email + username (second line), status badge (third line).
    - **Card footer (action row):** primary actions inline as 44×44 icon-buttons — Edit, Block-Unblock, Delete (the destructive/most-used three). Regenerate password and any future low-frequency actions move into an overflow `⋯` menu (built on `Dialog`/`Sheet`) at the right end of the same row.
    - "Self" rows still hide Block / Delete — same conditional as today (`users/page.tsx:811`), just applied in the card render.
  - **Alerts → keep markup, add parallel cards.** Rules (`alerts/page.tsx:245`) has inline edit controls and the History table (`:630`) is read-only. Both get a sibling `md:hidden` card list driven by the same data, both keyed by row id. Visual style mirrors the shared `mobileCard` cards. Not migrated to `DataTable` in this pass — too invasive for the value.
- **Tabs (`components/ui/tabs.tsx`)** — keep `whitespace-nowrap` per-tab but wrap the `<nav>` in `overflow-x-auto -mx-3 px-3 sm:mx-0 sm:px-0` so the tab row scrolls horizontally inside the page on `<sm` instead of pushing the whole page wider. Add `scroll-snap-type: x mandatory` for predictable swiping.
- **StatCard** drops its inline icon padding from `p-6` → `p-4` on `<sm`, font from `text-2xl` → `text-xl`.
- **Charts** — wrap each chart container in `h-56 sm:h-64 lg:h-72`, axis font `fontSize={11}` on `<sm` via responsive prop. Legends move below the chart on `<sm`.
- **Dialog primitive (new)** — Codex flagged in two rounds that the existing `UserSettingsDialog` (`components/layout/user-settings-dialog.tsx:61-154`) is a bare overlay with **no focus trap, no scroll lock, no focus restoration, no portal, no a11y labelling**. Before any drawer/sheet lands, we extract a small `Dialog` (+ `Sheet`) primitive in `components/ui/dialog.tsx` with the following surface:
  - **Portal mounting.** Renders into `document.body` via `createPortal` so it escapes ancestor `overflow-hidden` and z-index stacking contexts. This matters because the app already has cases that would clip or stack badly: `notification-bell.tsx:86` is an absolute overlay at `z-[60]`, and `users/page.tsx:736` wraps its table card in `overflow-hidden`.
  - **A11y labelling.** Exposes `DialogTitle` and `DialogDescription` slot components that auto-wire `aria-labelledby` and `aria-describedby` on the root. `aria-modal="true"` + role `dialog` on the root. Lint-style assertion in dev: warn if a `Dialog` mounts without a `DialogTitle`.
  - **Focus trap.** Cycles Tab inside the dialog; restores focus to the original trigger on close. **Fail-safe**: if the trigger node is no longer in the document on close (route change, parent remount), restore to `document.body` and emit a one-line console warning in dev only — never throw.
  - **Inert background.** `aria-hidden="true"` + `inert` attribute on siblings of the portal root while open (with feature-detect fallback for older browsers).
  - **Body scroll lock.** `overflow:hidden` on `<html>` while any dialog is open; refcount so multiple stacked dialogs don't unlock prematurely.
  - **Close behaviour.** `Esc` to close; click-on-backdrop to close (both configurable per instance).
  - **Initial focus.** First focusable in the dialog, or a `data-autofocus` target if present.
  - **Sheet variant.** Same primitive, slides in from `bottom` (mobile default) or `left`/`right` (sidebar drawer). Inherits all of the above.
  Then `UserSettingsDialog`, the new `MobileSidebarDrawer`, the filter `BottomSheet`, the Users overflow `⋯` menu, and `TestHistoryDrawer` all build on top of it. This is one new file (~150 LOC after the additions above) plus a small migration of the existing dialog. **Without this, the Lighthouse a11y target is at risk and stacking/clip bugs are inevitable.**
- **Modals** — every dialog gets `w-[calc(100vw-1rem)] max-w-lg max-h-[calc(100dvh-2rem)] overflow-y-auto`. Use `dvh` (dynamic viewport) so iOS Safari address bar does not chop content.
- **Drawer** (`test-history-drawer.tsx`) — full width on `<sm` (`w-full`), slide from bottom (sheet style) instead of right; existing right-slide preserved on `≥md`. Built on the new `Sheet` primitive so it inherits focus-trap / scroll-lock automatically.
- **Forms** — `grid grid-cols-2` becomes `grid grid-cols-1 sm:grid-cols-2` everywhere in `settings/`. KPI Formula Configurator's fixed `260px` left rail stacks on top on `<lg`.

### 2.5 Touch ergonomics

- Minimum tap target 44×44 px on `<md`. `h-8 w-8` controls in the header become `h-10 w-10` on mobile (`h-8 lg:h-8 sm:h-10` style).
- Increase row height in card lists (≥56 px) to reduce mis-taps.
- **iOS auto-zoom audit** — Codex correctly flagged that the previous claim ("16 px is already true") was wrong. The shared input class in `user-settings-dialog.tsx:9-10` and the `Select` element in `components/ui/select.tsx:32-39` are both `text-sm` (14 px), which **does** trigger zoom-on-focus on iOS Safari. Phase 3 sweep: any `<input>`, `<textarea>`, or `<select>` that today uses `text-sm` is bumped to `text-base` (16 px) on `<sm` (`text-base sm:text-sm` for backward-compat with the existing visual). Where the design strictly requires `text-sm` text, set `font-size: 16px` only on focus or use a 16 px input with smaller visual padding.

---

## 3. Implementation plan — phased

Each phase is independently mergeable and each is desktop-safe (no `lg:` class is ever removed; only mobile-first counterparts are added).

### Phase 1 — Foundation + a11y primitive (Day 1, ~1 day of dev)

Goal: stop the bleeding and ship the shared `Dialog`/`Sheet` primitive that everything else depends on. After this phase the app is at least laid out correctly on mobile, even if individual pages still feel cramped.

1. `app/layout.tsx` — add Next 14 `viewport` export: `{ width: 'device-width', initialScale: 1, maximumScale: 5 }`.
2. `components/layout/dashboard-layout.tsx` — replace inline `paddingLeft` with Tailwind classes: `lg:pl-60` (or `lg:pl-16` when collapsed). On `<lg` no left padding — sidebar is off-canvas.
3. `components/ui/dialog.tsx` (**new**) — extract focus-trap + scroll-lock + focus-restoration + `Esc`/backdrop-close primitive. Export `Dialog` (centred) and `Sheet` (bottom). Migrate `UserSettingsDialog` onto it as the first consumer in this phase, so the new primitive is exercised end-to-end.
4. `components/layout/sidebar.tsx` — accept `mobileOpen` prop, become `fixed inset-y-0 left-0 z-50 w-72 -translate-x-full transition-transform lg:translate-x-0 lg:w-60` (and `w-16` collapsed). Built on the new `Sheet` primitive so a11y is inherited. Add backdrop on `<lg`. Close on route change.
5. `components/layout/header.tsx` — add hamburger button visible `<lg`, hidden `lg:hidden`. Reduce `px-6` → `px-3 lg:px-6`. Truncate breadcrumbs to current page on `<sm` (`hidden sm:flex` on intermediate crumbs).
6. Sweep all `grid-cols-2` / `grid-cols-3` without breakpoint prefix in pages and convert to `grid-cols-1 sm:grid-cols-2 lg:grid-cols-N`. Same for any `flex` rows that crowd controls — apply `flex-col sm:flex-row`.

Acceptance: at 375 px, app is navigable, no horizontal page scroll, every page renders without overflow on the **outer** axis. Sidebar drawer passes manual focus-trap test (Tab cycles inside, `Esc` closes, focus returns to hamburger). Tables may still scroll horizontally — that is Phase 2.

### Phase 2 — Tables, tabs & charts (Day 2, ~1¼ days)

1. Extend `DataTable`:
   - Add `getRowKey: (row: T, idx: number) => string` as a **required** prop on every callsite. Migrate **all 5 existing callsites in the same commit**: `runs/page.tsx:315,514,629` (test runs / pipeline runs / flaky tests) and `coverage/page.tsx:471,532` (test cases / stories). Each callsite supplies an `id`-based key.
   - Add optional `mobileCard?: (row: T) => ReactNode`. When set, render `<ul>` on `<md` (using a `hidden md:block` table + `md:hidden` list pair) driven by the same `data` and the same `getRowKey`. Default desktop behaviour unchanged.
2. Provide `mobileCard` for **all five `<DataTable>` callsites** plus the per-test execution lists rendered through it. The Coverage tables (test cases at `:471`, stories at `:532`) are central to the "Test Coverage" module and are not desktop-only.
   - **Runs / Pipeline runs:** top = run name + status badge; secondary = branch / trigger / duration pills; tap opens existing detail view.
   - **Flaky tests:** top = test name + flakiness score badge; secondary = pass/fail counts, last-failure timestamp.
   - **Coverage test cases:** top = test name + automation badge; secondary = suite / type / last-run status; tap opens the existing test-history side-drawer (which itself becomes a bottom sheet on `<sm` in Phase 3).
   - **Coverage stories:** top = story title + status badge; secondary = points / assignee / component pills; tap follows existing row behaviour.
3. **Bespoke tables** — parallel sub-task in the same phase:
   - `users/page.tsx:737` — migrate onto `DataTable`, provide `mobileCard` with the action layout described in §2.4 (3 inline 44×44 actions + overflow `⋯` menu for Regenerate password). Self-row hides Block / Delete (existing condition at `users/page.tsx:811`).
   - `alerts/page.tsx:245` (rules) and `:630` (history) — keep markup, add sibling `md:hidden` card lists driven by the same data; lists keyed by `rule.id` / `event.id`. Visual matches the shared `mobileCard` cards.
4. **Tabs** — wrap the existing nowrap row in `overflow-x-auto -mx-3 px-3 sm:mx-0 sm:px-0` with scroll-snap. Verify Coverage tabs (Stories / Epic Coverage / Test Cases) scroll cleanly at 320 px.
5. Wrap chart containers in responsive heights (`h-56 sm:h-64 lg:h-72`) and pass `fontSize={11}` axis tick props on `<sm`. Move legend `verticalAlign="bottom"` on `<sm`.
6. Filter rows on Runs / Defects / Coverage become a single "Filters" button on `<md` that opens a `Sheet` containing the same form.

Acceptance: Runs / Defects / Coverage / Users / Alerts are usable on iPhone 16 with no horizontal page scroll. Tabs row scrolls cleanly. KPI page chart is readable. No `key={idx}` warnings in the console at any breakpoint.

### Phase 3 — Polish + iOS input audit (Day 3, ~¾ day)

1. Header right-side controls collapse into `⋯` menu on `<sm`. Bell + avatar stay.
2. Remaining modals/drawers adopt the new `Dialog`/`Sheet` primitive: `test-history-drawer` becomes a bottom sheet on `<sm`; settings dialogs adopt `w-[calc(100vw-1rem)] max-h-[calc(100dvh-2rem)]`.
3. Tap-target sweep: `h-8 w-8` controls → `h-10 w-10` on `<sm`.
4. **iOS auto-zoom sweep** — grep `<input|<textarea|<select|inputClass` for `text-sm`, change to `text-base sm:text-sm` (or pure `text-base` when `sm:` differs). Specifically covers `user-settings-dialog.tsx:9-10` and `components/ui/select.tsx:32-39`, plus any settings forms found in the sweep.
5. KPI Formula Configurator and any `lg:grid-cols-[260px_minmax(0,1fr)]` rails stack vertically on `<lg`.
6. Project switcher dropdown beside page title for `/projects/[id]/*` pages on `<lg`.

Acceptance: full UX pass on iPhone 16, Pixel 8, iPhone SE (375), and Galaxy Fold cover (320). No input triggers iOS zoom-on-focus. All flows from the README's "Dashboard Modules" section are completable.

### Phase 4 — Verification

1. Playwright responsive specs: add a single `e2e/mobile-smoke.spec.ts` that loads each major route at 375×812 (iPhone 13/14/15/16 width) and 320×568 (iPhone SE 1) and asserts no horizontal scroll at the body level (`document.documentElement.scrollWidth === clientWidth`).
2. Visual regression — capture screenshots of `/`, `/projects/[id]`, `/projects/[id]/kpis`, `/runs`, `/defects`, `/coverage`, `/settings` at 375 and at 1280; commit baselines.
3. Manual checklist on real Chrome DevTools device emulation for iPhone 16, Pixel 8.
4. Lighthouse mobile score baseline → target ≥ 90 for Accessibility on mobile (catches tap-target and contrast regressions).

---

## 4. Out of scope (deliberately)

- **Native app** — not building one. PWA install prompt is a possible Phase 5.
- **Mobile-only features** — no biometric login, no push notifications. Pure responsive web.
- **Redesign of desktop view** — no class is removed from any `lg:` rule. Visual diff at ≥1024 should be empty.
- **Dark mode rework** — already supported, not touched here.
- **Connector setup wizards** — deep-config flows in Settings are usable on phones but not optimised; admins typically do this from desktop.

## 5. Risks & mitigations

| Risk | Mitigation |
|---|---|
| Drawer / sheet captures focus, leaks it back to the page underneath, or clips behind a stacking context | Build the new shared `Dialog`/`Sheet` primitive in Phase 1 with portal mounting, focus trap, body scroll lock, focus restoration, `aria-modal`, `aria-labelledby`/`aria-describedby` slots, `Esc`/backdrop close. The existing `UserSettingsDialog` has none of this. Every later drawer/sheet inherits from this primitive. |
| Focus restoration crashes if trigger unmounts during route change | Restore-on-close checks `document.contains(triggerEl)` first; if false, restores to `document.body` and emits a dev-only console warning. Never throws. |
| `mobileCard` divergence — table and card list show different data or lose row identity on resort | Both render from the same `data` array in `DataTable`; `mobileCard` is a presentation function only, sort/pagination state is shared. **Required** `getRowKey` (on every `DataTable` callsite, not only mobile) replaces today's `key={idx}` so resort + breakpoint swap stays stable. |
| Bespoke tables drift from the shared mobile card style | Hand-rolled cards in `users/page.tsx` (after migration to `DataTable`) and `alerts/page.tsx` use the same Tailwind class set as the shared cards; the visual is documented in this plan rather than encoded in code so the next bespoke table follows it too. |
| Bottom sheets fight iOS keyboard | Use `100dvh` not `100vh`; the new `Sheet` primitive owns this. Smoke-tested on iOS Safari with a focused input. |
| iOS Safari zooms on input focus | Phase 3 sweep moves shared input class and `Select` from `text-sm` (14 px) to `text-base sm:text-sm` (16 px on mobile). |
| Chart `ResponsiveContainer` glitches on rotate | Already used; add `key={orientation}` only if a flicker is observed. |
| Visual regression on desktop from a careless edit | Phase 4 baselines + the rule "never delete a `lg:` class" make this catchable. |

## 6. File-touch estimate

| Phase | Files touched | Net new code |
|---|---|---|
| 1 | 4 layout files + new `dialog.tsx` primitive (~150 LOC, portal + a11y) + `user-settings-dialog.tsx` migration + ~12 page files (sweep) | ~310 LOC |
| 2 | `data-table.tsx` + 5 `<DataTable>` callsites (`runs/page.tsx`, `coverage/page.tsx`) for required `getRowKey` and `mobileCard`, `tabs.tsx`, bespoke tables (`users/page.tsx` migration, `alerts/page.tsx` parallel cards) + 5 chart wrappers | ~450 LOC |
| 3 | `header.tsx`, `test-history-drawer.tsx`, formula configurator, iOS input audit (~3–5 form/select files) | ~180 LOC |
| 4 | 1 new e2e spec + screenshot baselines | ~80 LOC |

Total: ~1020 LOC of additive Tailwind/JSX changes plus one new ~150 LOC `Dialog`/`Sheet` primitive, zero deletions on desktop classes.
