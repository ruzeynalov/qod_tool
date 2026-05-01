# QOD Mobile UI/UX Plan

**Issue:** RUZ-23 — Mobile view for Quality Observability Dashboard
**Scope:** Make QOD usable on phones (320–414 px), reference devices iPhone 16 (393 px) and Pixel 8 (412 px). **Desktop view (≥1024 px) must remain pixel-identical to today.**
**Approach:** Mobile-first Tailwind utilities layered onto the existing desktop classes. No component duplication, no separate "mobile app".

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
| Tables | `components/ui/data-table.tsx:98-99` | Single `overflow-x-auto`. Real-world usage (Runs, Defects, Coverage) renders 6–9 columns at `text-sm` — practically unreadable on phones, requires constant horizontal scrolling. |
| Page grids | `projects/[id]/{runs,defects,settings,users}/page.tsx` | Hard `grid-cols-2` / `grid-cols-3` without breakpoint — KPI tiles jam into 150 px columns on a 320 px screen. |
| Charts | `components/charts/*.tsx`, `kpis/page.tsx:508` | Hardcoded heights `h-64` / `h-72`, `fontSize={12}` axis labels. Charts render but legends/labels collide. |
| KPI page | `kpis/page.tsx` | Trend chart toolbar (period selector + metric chips) assumes wide row, wraps poorly. |
| Modals/dialogs | `settings/page.tsx`, `user-settings-dialog.tsx`, `test-history-drawer.tsx` | Use `max-w-lg` / `max-w-md` with `mx-4`. Drawer width may exceed viewport on small phones. |
| Tap targets | Various | Many buttons at `h-8 w-8` (32 px) — below the 44 px minimum recommended for touch. |

**Summary:** ~80 % of the brokenness is fixed by three things — viewport meta, off-canvas sidebar, and a card-mode for tables. The rest is a sweep through grids and chart heights.

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

- **DataTable (`components/ui/data-table.tsx`)** gains an optional `mobileCard` render prop. When set, on `<md` the table renders as `<ul>` of cards using the same data, same sort/pagination — just a different DOM. Default fallback on `<md` is "first 2 columns visible, rest collapsed under an expand chevron".
- **StatCard** drops its inline icon padding from `p-6` → `p-4` on `<sm`, font from `text-2xl` → `text-xl`.
- **Charts** — wrap each chart container in `h-56 sm:h-64 lg:h-72`, axis font `fontSize={11}` on `<sm` via responsive prop. Legends move below the chart on `<sm`.
- **Modals** — every dialog gets `w-[calc(100vw-1rem)] max-w-lg max-h-[calc(100dvh-2rem)] overflow-y-auto`. Use `dvh` (dynamic viewport) so iOS Safari address bar does not chop content.
- **Drawer** (`test-history-drawer.tsx`) — full width on `<sm` (`w-full`), slide from bottom (sheet style) instead of right; existing right-slide preserved on `≥md`.
- **Forms** — `grid grid-cols-2` becomes `grid grid-cols-1 sm:grid-cols-2` everywhere in `settings/`. KPI Formula Configurator's fixed `260px` left rail stacks on top on `<lg`.

### 2.5 Touch ergonomics

- Minimum tap target 44×44 px on `<md`. `h-8 w-8` controls in the header become `h-10 w-10` on mobile (`h-8 lg:h-8 sm:h-10` style).
- Increase row height in card lists (≥56 px) to reduce mis-taps.
- `font-size: 16px` minimum on inputs to prevent iOS auto-zoom on focus (already true for default `text-base`; verify any `text-sm` inputs).

---

## 3. Implementation plan — phased

Each phase is independently mergeable and each is desktop-safe (no `lg:` class is ever removed; only mobile-first counterparts are added).

### Phase 1 — Foundation (Day 1, ~½ day of dev)

Goal: stop the bleeding. After this phase the app is at least laid out correctly on mobile, even if individual pages still feel cramped.

1. `app/layout.tsx` — add Metadata viewport: `viewport: { width: 'device-width', initialScale: 1, maximumScale: 5 }` (Next 14 supports the `viewport` export).
2. `components/layout/dashboard-layout.tsx` — replace inline `paddingLeft` with Tailwind classes: `lg:pl-60` (or `lg:pl-16` when collapsed). On `<lg` no left padding — sidebar is off-canvas.
3. `components/layout/sidebar.tsx` — accept `mobileOpen` prop, become `fixed inset-y-0 left-0 z-50 w-72 -translate-x-full transition-transform lg:translate-x-0 lg:w-60` (and `w-16` collapsed). Add backdrop overlay on `<lg` when open. Close on route change.
4. `components/layout/header.tsx` — add hamburger button visible `<lg`, hidden `lg:hidden`. Reduce `px-6` → `px-3 lg:px-6`. Truncate breadcrumbs to current page on `<sm` (`hidden sm:flex` on intermediate crumbs).
5. Sweep all `grid-cols-2` / `grid-cols-3` without breakpoint prefix in pages and convert to `grid-cols-1 sm:grid-cols-2 lg:grid-cols-N`. Same for any `flex` rows that crowd controls — apply `flex-col sm:flex-row`.

Acceptance: at 375 px, app is navigable, no horizontal page scroll, every page renders without overflow on the **outer** axis. Tables may still scroll horizontally — that is Phase 2.

### Phase 2 — Tables & charts (Day 2, ~1 day)

1. Extend `DataTable` with an optional `mobileCard?: (row: T) => ReactNode` render. When provided, render `<ul>` on `<md` (using a `hidden md:block` table + `md:hidden` list pair).
2. Provide `mobileCard` for the four heaviest tables: Runs, Defects, Coverage test cases, Users.
   - Card shape: top row = primary identifier (run name / defect title / test name / user email) + status badge; secondary row = 2–3 metadata pills; tap opens existing detail view.
3. Wrap chart containers in responsive heights and pass `fontSize={11}` axis tick props on `<sm`. Move legend `verticalAlign="bottom"` on `<sm`.
4. Filter rows on Runs / Defects / Coverage become a single "Filters" button on `<md` that opens a bottom sheet containing the same form.

Acceptance: Runs/Defects/Coverage are usable on iPhone 16 with no horizontal scroll. KPI page chart is readable.

### Phase 3 — Polish (Day 3, ~½ day)

1. Header right-side controls collapse into `⋯` menu on `<sm`. Bell + avatar stay.
2. Modals/dialogs adopt the `w-[calc(100vw-1rem)] max-h-[calc(100dvh-2rem)]` pattern. `test-history-drawer` becomes a bottom sheet on `<sm`.
3. Tap-target sweep: `h-8 w-8` controls → `h-10 w-10` on `<sm`.
4. KPI Formula Configurator and any `lg:grid-cols-[260px_minmax(0,1fr)]` rails stack vertically on `<lg`.
5. Project switcher dropdown beside page title for `/projects/[id]/*` pages on `<lg`.

Acceptance: full UX pass on iPhone 16, Pixel 8, iPhone SE (375), and Galaxy Fold cover (320). All flows from the README's "Dashboard Modules" section are completable.

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
| Hamburger drawer captures focus / breaks keyboard nav | Use the same focus-trap pattern as the existing `user-settings-dialog`; restore focus to trigger on close. |
| `mobileCard` divergence — table and card list show different data | Both render from the same `data` array in `DataTable`; `mobileCard` is a presentation function only, not a data fork. Sort/pagination state is shared. |
| Bottom sheets fight iOS keyboard | Use `100dvh` not `100vh`; test on iOS Safari with focused input. |
| Chart `ResponsiveContainer` glitches on rotate | Already used; add `key={orientation}` only if a flicker is observed. |
| Visual regression on desktop from a careless edit | Phase 4 baselines + the rule "never delete a `lg:` class" make this catchable. |

## 6. File-touch estimate

| Phase | Files touched | Net new code |
|---|---|---|
| 1 | 4 layout files + ~12 page files (sweep) | ~150 LOC |
| 2 | `data-table.tsx` + 4 page files + 5 chart wrappers | ~250 LOC |
| 3 | `header.tsx`, dialogs, drawer, formula configurator | ~150 LOC |
| 4 | 1 new e2e spec + screenshot baselines | ~80 LOC |

Total: ~630 LOC of additive Tailwind/JSX changes, zero deletions on desktop classes.
