# Sproutify Micro — Application Review & Findings

**Date:** July 3, 2026
**Scope:** web-admin app, Supabase database (project `rmjyfdmwnmaerthcoosq`), edge functions, repo structure
**Method:** Full code review (4 parallel deep-dives: grow workflow, orders/sales, app structure/UX, code health/security) plus direct inspection of the live database (schema, RLS policies, views, functions, Supabase advisors). Claims below were cross-checked; where a first-pass finding turned out to be wrong, the corrected version is what appears here.

---

## 1. Executive Summary

**The honest answer: the domain model is good, the security foundation is better than you think, and the product vision is right. The problem is not bad work — it's accretion.** Features were added in layers (trays → requests → soaking → standing orders → schedules → gaps) without ever consolidating the previous layer, and the result is an app where the same concept lives in 3–5 places and nobody (including the code) is sure which one is authoritative.

Three numbers tell the story:

- **DailyFlow.tsx is ~6,500 lines with 37 `useState` hooks.** Its service, `dailyFlowService.ts`, contains a single 2,400-line function that makes ~150 database calls across 6 different task-generation strategies.
- **The sidebar has 21 top-level pages**, five of which (Dashboard, Daily Flow, Calendar, Weekly Tasks, Planting Schedule) all answer the question "what should I do today/this week?" in different, unsynchronized ways.
- **The repo root contains 17 fix/debug markdown files** (SOAKING_TASK_FIX, SEEDING_STEP_DEBUG, COMPLETE_SEEDING_STEP_FIX, …). These are the fossil record of fighting the same fragile areas repeatedly — task completion sync and date math — rather than fixing them structurally once.

There is also **one genuinely urgent item**: the repo is **public on GitHub** and contains a live Resend webhook signing secret ([ADMIN_PORTAL_SETUP.md:48](ADMIN_PORTAL_SETUP.md), [VERIFY_WEBHOOK_SETUP.md:13](VERIFY_WEBHOOK_SETUP.md)) — and the webhook function doesn't verify signatures anyway. See §3.

The recommended path forward (§8) is not a rewrite. It's: fix the security items this week, then **pick one source of truth for tasks and one for demand**, collapse the overlapping pages around those, and delete the half-built features that aren't earning their complexity.

---

## 2. How the App Actually Flows Today

### The grow side (recipe → harvest)

```
recipes + steps  (farm-owned)          global_recipes + global_steps (Sproutify templates,
        │                                    copied into farm recipes on adoption)
        ▼
PLANNING — three parallel, loosely-connected mechanisms:
  • PlantingSchedulePage (manual drag/plan, ~1,700 lines)
  • planting_schedule_view (DB view: sow_date = delivery_date − recipe_total_days)
  • predictiveScheduler.ts + taskGeneratorService.ts (written, largely NOT wired in)
        ▼
tray_creation_requests  (soak + seed requests; soaking piggybacks on this table + soaked_seed)
        ▼
trays + tray_steps  (day-by-day step instances; DB triggers create steps on tray insert)
        ▼
DAILY EXECUTION — DailyFlow assembles "today" from at least 6 sources:
  daily_flow_aggregated view, direct tray_steps queries, planting_schedule_view,
  tray_creation_requests, task_completions, order_fulfillment_status
        ▼
Harvest → order fulfillment / delivery
```

### The sales side (customer → delivery)

```
customers → standing_orders + standing_order_items  (recurring templates — THE real system)
                      │
                      ▼
          order_schedules (134 rows — generated delivery instances)
                      │
                      ▼
   order_fulfillment_status (view) → DailyFlow gap detection → order_fulfillment_actions (audit log)

customers → orders + order_items  ← DEAD. 0 rows in production. OrdersPage detects the empty
            table and falls back to reconstructing "orders" from trays with a customer_id.
```

### Where significant logic lives

A large amount of business logic is in the **database itself**: 27 views (e.g. `daily_flow_aggregated`, `planting_schedule_view`, `order_fulfillment_status`, `harvest_soon_view`) and ~54 functions/triggers (e.g. `complete_soak_task`, `generate_seeding_requests_from_orders`, `handle_tray_creation_request`, `sync_order_schedules`). This is a reasonable architecture choice, **but most of it is not in the repo's migrations** (see §6.3), so the database is effectively an un-versioned second codebase.

### Why the flow feels hard

1. **No single "source of truth for what to do today."** Task state lives in `tray_steps.completed` + `tray_steps.status` (two fields that must agree) + `task_completions` (a third record). COMPLETE_SEEDING_STEP_FIX.md documents 11 separate code locations that had to be patched to keep them in sync. Any new task type re-fights this battle.
2. **No single source of truth for demand.** Standing orders, order_schedules, the planting schedule page, and the mix calculator each compute "what to plant when" — the mix calculator computes sow dates entirely client-side and never persists them.
3. **Recipe duality.** Farm `recipes` and `global_recipes` are merged in UI dropdowns, but after a global recipe is copied, the copy has no link back to its source. Code downstream can't tell which kind of recipe it's holding.
4. **Date math is hand-rolled and duplicated.** `parseLocalDate`/`formatDateString` are copy-pasted into 3 services; `dailyFlowService` alone does 42 date conversions; several pages still use `.toISOString().split('T')[0]` (UTC conversion → off-by-one-day bugs, which is exactly what several of the root-level fix docs were chasing).
5. **The hours→days threshold** (`duration >= 12 ? 1 : 0`, changed to `>= 6` in some places mid-development) appears in ~8 locations with inconsistent values. This is the root cause of the soak-task bugs the SOAKING_TASK_FIX docs describe.

---

## 3. Critical Security Issues (fix this week)

| # | Issue | Evidence | Action |
|---|-------|----------|--------|
| 1 | **Live Resend webhook signing secret committed to a PUBLIC repo** | A `whsec_…` signing secret (redacted here) in [ADMIN_PORTAL_SETUP.md:48](ADMIN_PORTAL_SETUP.md) and [VERIFY_WEBHOOK_SETUP.md:13](VERIFY_WEBHOOK_SETUP.md). Repo `boilermanc/sproutify-micro` is public. | Rotate the secret in Resend now. Scrub the files (and consider the secret burned regardless — it's in git history). Consider making the repo private. |
| 2 | **resend-webhook edge function accepts unsigned payloads** | `supabase/functions/resend-webhook/index.ts` has no svix/HMAC signature check (`verify_jwt` is also false — required for webhooks, which is why signature verification matters). Anyone can inject fake email events; `email_events` has an RLS insert policy of `WITH CHECK (true)`. | Verify the `svix-signature` header against the (rotated) signing secret before processing. |
| 3 | **Admin portal is a single hardcoded email with a fail-open timeout** | `RequireAdmin.tsx` — role check is client-side against localStorage; if the Supabase check times out (~5s) the user is **allowed through**. Admin identity is effectively `team@sproutify.app`. | Fail closed on timeout. Move admin authority to the `profile.is_admin` flag verified server-side (RLS already has `is_admin_user()` — the DB is ahead of the client here). |
| 4 | **Anon key embedded in tracked docs as webhook query param** | [ADMIN_PORTAL_SETUP.md:76](ADMIN_PORTAL_SETUP.md) | Anon keys are public by design, but combined with the loose RLS entries below it lowers the bar. Remove from docs. |

**Corrections to note (good news):** `.env` files and `dist/` are **NOT** committed — `.gitignore` is doing its job. And contrary to a common failure mode, **RLS is enabled on all 45 tables and the policies are generally well-designed** (`farm_uuid = get_user_farm_uuid()` scoping). The client-side `.eq('farm_uuid', …)` filters are performance filters, not the security boundary — the DB actually holds the line.

### RLS soft spots (real, but lower severity)

- `pre_registrations`: **any authenticated user can read all rows** (`SELECT ... true`) — that's a leak of signup emails to every farm customer.
- `test_accounts`: readable by all authenticated users.
- `farms` INSERT: `WITH CHECK (true)` — any authenticated user can create unlimited farms.
- 4 views are `SECURITY DEFINER` (`farm_subscription_status`, `daily_flow_aggregated`, `seed_inventory_status`, `delivery_history`) — they bypass RLS of the querying user; confirm each one filters by farm internally.
- 15 `SECURITY DEFINER` functions are executable by `anon` (e.g. `complete_order_schedule`, `finalize_todays_deliveries`). Revoke anon execute.

---

## 4. Architecture & Code Health Findings

### 4.1 Monolith files (the #1 maintainability problem)

| File | Size | Notes |
|------|------|-------|
| [DailyFlow.tsx](web-admin/src/components/DailyFlow.tsx) | 276KB / ~6,500 lines | 37 useState hooks, ~29 inline Supabase queries, all modals inline |
| [dailyFlowService.ts](web-admin/src/services/dailyFlowService.ts) | 180KB / ~4,500 lines | `fetchDailyTasks` alone is ~2,400 lines |
| [RecipesPage.tsx](web-admin/src/pages/RecipesPage.tsx) | 92KB | |
| [Dashboard.tsx](web-admin/src/pages/Dashboard.tsx) | 82KB | Sage briefing + stats + charts + modals in one file |
| [TraysPage.tsx](web-admin/src/pages/TraysPage.tsx) | 77KB | |
| [PlantingSchedulePage.tsx](web-admin/src/pages/PlantingSchedulePage.tsx) | 71KB | |
| BatchesPage, OrdersPage, SuppliesPage, WeeklyTasksPage | 43–53KB each | |

### 4.2 No data-fetching layer

There is no react-query/SWR. Every page hand-rolls `useEffect` + supabase calls + loading state + manual refetch. Consequences measured in the codebase:

- **~8 independent implementations** of fetchCustomers/fetchProducts/fetchRecipes across pages, each with different error handling and field normalization (`customerid` → `customer_id` mapping is copy-pasted in at least 3 pages).
- **N+1 patterns** (e.g. TraysPage fetches trays, then seedbatches separately; VarietiesPage per-variety batch fetches).
- Stale data across the 5 overlapping task pages, because nothing shares a cache.

### 4.3 Type safety & error handling

- **391 `: any` + 48 `as any`** across 45 files; ESLint has `no-explicit-any` turned **off**.
- **No generated database types** — two hand-maintained, divergent type sets in `web-admin/src/lib/supabaseClient.ts` and `shared/supabaseClient.ts` (the shared one uses `process.env` and can't even run in the browser).
- **~620 console.log calls, ~83 `alert()` calls**, many silent catch blocks. No error boundary, no toast system, no logging service.
- **Zero test files** in the entire repo — for an app whose core value is date arithmetic (sow dates, soak offsets, harvest dates), this is the single biggest quality lever available.

### 4.4 Dead and orphaned code

- `predictiveScheduler.ts` (~400 lines) and most of `taskGeneratorService.ts` — written, never called.
- `weekly_tasks`, `task_templates`, `report_templates` tables — 0 rows.
- `orders` / `order_items` — 0 rows; OrdersPage carries a dual code path (real table + trays-as-orders fallback).
- `mobile-app/` directory is **completely empty** despite README claims.
- 47 unused database indexes (Supabase advisor).

---

## 5. Product & UX Findings

### 5.1 Navigation overload — the biggest UX problem

21 top-level sidebar items, plus a 9-page admin portal. Five pages compete to answer "what do I do now":

| Page | What it actually is |
|------|---------------------|
| Dashboard | KPIs + Sage briefing + task counts + harvest-soon |
| Daily Flow | The real operational hub (task execution) |
| Calendar | Month view of the same tasks |
| Weekly Tasks | Task list grouped by type (backing tables are empty) |
| Planting Schedule | Order-driven seeding planner + print |

A new user cannot tell which one is authoritative, and because there's no shared cache, they can genuinely disagree with each other. **The app's information architecture should collapse to roughly 8 items:** Today (Daily Flow), Plan (Calendar + Planting Schedule merged), Grow (Trays/Batches), Recipes, Sales (Customers/Standing Orders/Products), Inventory (Seeds/Supplies/Vendors), Reports, Settings.

### 5.2 Duplicate ways to do the same action

- **Completing a seeding task** has 3 different code paths (DailyFlow `completeTask`, DailyFlow `completeSeedTask`, PlantingSchedulePage direct tray creation) with different side effects.
- **Checking if a recipe needs soaking** has 2 implementations (RPC `recipe_has_soak` vs. a client-side string search of steps) that can disagree.
- **Creating trays**: New Tray button, seeding request flow, planting schedule flow.

### 5.3 Half-built features that confuse the flow

- **Orders page**: "Add Order" flow is incomplete; the page mostly displays trays reconstructed as orders with hardcoded fallback prices.
- **Product mixes**: `product_mixes` has 0 rows; ProductMixEditor appears to lack a working save path; MixCalculator computes sow dates client-side and throws them away (no "create trays from this plan" action).
- **Standing orders show no fulfillment status** — you can't see which upcoming deliveries are covered, pending, or skipped without going to Daily Flow's gap detection.
- **Demand → planting is not automated end-to-end.** The pieces exist (`generate_order_schedules`, `generate_seeding_requests_from_orders` DB functions, GenerateSeedingRequestsButton) but the chain standing order → schedule → seeding request → tray requires manual triggering and is invisible to the user.

### 5.4 States that can get stuck (from code inspection + fix-doc history)

- Soak tasks reappearing after completion (task_completions not always written — the exact bug family your SOAK fix docs chased).
- `tray_creation_requests` left `pending` after trays were created → duplicate seeding tasks.
- Gap-reallocation modal mutates trays mid-flow; a refresh mid-operation leaves trays half-updated.

---

## 6. Database Findings (from the live project)

### 6.1 Supabase security advisors — 90 findings

- 4 ERROR: `SECURITY DEFINER` views (§3).
- 51 WARN: functions with mutable `search_path` (injection hardening — fix mechanically with `SET search_path = ''`).
- 15+15 WARN: SECURITY DEFINER functions executable by `anon`/`authenticated`.
- 3 WARN: always-true RLS policies (`email_events` insert, `farms` insert, `pre_registrations` insert).
- **Postgres 15.6 has outstanding security patches** — upgrade available.
- Leaked-password protection (HaveIBeenPwned check) is off.

### 6.2 Performance advisors — 296 findings

- 136 multiple-permissive-policy warnings (Admin + User SELECT policies both evaluated on every row — merge them).
- 57 `auth_rls_initplan` warnings — policies re-evaluate `auth.uid()` per row; wrap as `(select auth.uid())` for a large cheap win on big tables like `tray_steps` (1,040 rows and growing fast).
- 55 unindexed foreign keys; 47 unused indexes.

### 6.3 Migration drift (major operational risk)

The remote database tracks only **13 migrations (004–019, with gaps)**. The repo has **45+ migration files including duplicate version numbers** (two 024s, two 025s, two 030s, two 031s). Everything since ~019 — including the entire soaking system, planting schedule view, and calendar views — was applied ad hoc. Consequences: you cannot rebuild this database from the repo, local dev against a fresh DB is impossible, and the 27 views + 54 functions in production are effectively unversioned. One earlier review claim that `daily_flow_aggregated` "doesn't exist" is wrong — it exists in the live DB — but the confusion itself is the symptom: **nobody can tell what's in the database by reading the repo.**

---

## 7. What's Working Well (keep these)

- **RLS is comprehensive and mostly correct** — real multi-tenant security at the DB layer.
- **The domain model is fundamentally sound**: recipes → steps → trays → tray_steps is the right shape; standing orders → schedules is the right shape for recurring produce sales.
- **Putting scheduling logic in DB views/functions** (planting_schedule_view, fulfillment status) is a good instinct — it just needs to be versioned and made the *only* implementation.
- **shadcn/ui + Tailwind** gives a consistent visual base; the onboarding wizard, help center, and Sage chat are genuine product differentiators.
- **Edge functions cover the right jobs** (signup, reports, email, Stripe) and Stripe webhook handling has an audit table.

---

## 8. Recommended Path Forward

### Phase 0 — Stop the bleeding (days)
1. Rotate the Resend webhook secret; scrub secrets from the 3 tracked docs; consider making the repo private.
2. Add signature verification to `resend-webhook`.
3. Make `RequireAdmin` fail closed; base admin on `profile.is_admin` (already exists in DB).
4. Tighten the 3 always-true RLS policies + `pre_registrations`/`test_accounts` read policies; revoke anon execute on SECURITY DEFINER functions; upgrade Postgres.

### Phase 1 — Establish sources of truth (1–2 weeks of decisions, then incremental work)
5. **Decide: tasks live in the database.** Make one view/RPC (`daily_flow_aggregated` or successor) the *only* task feed; make one RPC (`markTaskCompleted`) the *only* completion writer that atomically updates `tray_steps` + `task_completions`. This retires the entire bug family behind the root-level fix docs.
6. **Decide: demand = standing orders → order_schedules.** Delete `orders`/`order_items` and the OrdersPage fallback path, or commit to building them — not both. (Recommendation: delete; you have zero rows and a working alternative.)
7. **Capture the real schema**: `supabase db pull` into a fresh baseline migration; renumber duplicates; from now on all DDL goes through migrations.
8. Centralize date math in one tested `dateUtils` module (one `parseLocalDate`, one hours→days rule) — and add the repo's first unit tests here.

### Phase 2 — Consolidate the UX (the "flow" fix)
9. Collapse navigation to ~8 items; merge Calendar + Planting Schedule into one Plan view; fold or remove Weekly Tasks; make Dashboard read-only summary that links into Daily Flow.
10. Wire demand → planting visibly: standing order page shows schedule/fulfillment status; one button path from schedule → seeding requests → trays.
11. Finish or remove product mixes and the mix calculator (recommendation: persist calculator output as seeding requests, or cut the feature).

### Phase 3 — Pay down structure (ongoing, opportunistic)
12. Introduce react-query and generated Supabase types (`supabase gen types`); migrate pages as you touch them.
13. Break DailyFlow/Dashboard into subcomponents when modifying them (not as a big-bang refactor).
14. Delete dead code (predictiveScheduler, unused taskGenerator paths, empty mobile-app dir, 17 root fix-docs → move anything worth keeping into a `docs/history/` folder).
15. Apply advisor fixes mechanically: RLS initplan wrapping, merge duplicate policies, FK indexes, function search_path.

### The one-sentence version
**Secure the repo this week; then make the database the single source of truth for tasks and demand, collapse five task pages into two, and delete the features that never shipped — the app underneath is worth it.**

---

# Part II — If I Were Rebuilding It

This section answers a different question than the audit above: not "what's wrong," but **"if you started over with everything you now know, what would you build?"** It's written as a design target. You don't have to rebuild from scratch to get there (see §9.7) — but every decision below is worth making even incrementally, because each one removes a whole category of the complexity documented in Part I.

## 9.1 The core insight: model the farmer's loop, not the database

The current app is organized around **tables** — there's a page for trays, a page for batches, a page for recipes, a page for schedules, a page for orders, and five pages that try to stitch them back together into "what do I do." That's backwards. A microgreens farm runs on one simple loop, and the app should *be* that loop:

```
   SELL ──────────► PLAN ──────────► GROW ──────────► DELIVER
   "Who buys what,   "So what do I    "Do today's      "Get it to the
    how often?"       sow, when?"      tasks."          customer, log it."
        ▲                                                    │
        └────────────────────────────────────────────────────┘
```

Everything in the app is either a **fact** you record once (a customer, a recipe, a seed lot) or a **task** the loop generates for you (soak this, sow that, harvest these, deliver those). The farmer's mental model is: *"I told the app who buys what. Every morning it tells me what to do. I tap done as I go."* If a screen doesn't serve that sentence, it shouldn't exist.

The single most important architectural consequence: **the user should almost never create a task manually.** Standing orders generate the plan; the plan generates the tasks; the tasks drive the day. Today the app makes the user participate in that pipeline (generate seeding requests, manage the planting schedule, reconcile gaps across pages). Rebuilt, the pipeline is invisible and the user only sees its output — with an escape hatch ("add ad-hoc tray/task") for the exceptions.

## 9.2 One task engine, one lifecycle

The root cause of most of Part I's bugs is that "a thing to do" has no single representation. Rebuilt, there is exactly one:

**A `tasks` table.** Every unit of work — soak, sow, water, uncover, move to light, harvest, deliver, maintenance — is one row with one lifecycle:

```
pending → done  (or skipped, with a reason)
```

- Each task knows its **type**, its **due date**, what it's **about** (tray, request, delivery), and what **generated** it (which standing order / schedule / recipe step), so lineage is always traceable.
- Completion is **one RPC** (`complete_task`) that atomically does the type-specific side effects (create the tray, decrement seed inventory, mark the delivery). No more three-tables-in-sync problem — the eleven-location fix in COMPLETE_SEEDING_STEP_FIX.md becomes structurally impossible.
- Task **generation is a nightly job (plus on-demand refresh)** that projects the next ~3 weeks of tasks from standing orders + recipes. Deterministic, idempotent, testable: given the same orders and recipes, it always produces the same task list. This replaces the 2,400-line `fetchDailyTasks` that re-derives the world from six sources on every page load.
- The UI reads **one query**: "tasks for my farm where due_date = today" (or this week). Every screen that shows work shows *the same rows*, so Dashboard, Today, and Calendar can never disagree again.

This is the one piece I would build first no matter what, because it collapses DailyFlow's six data sources, the completion-sync bugs, and the five-overlapping-pages problem into a single design decision.

## 9.3 The information architecture: five places, one verb each

The 21-item sidebar becomes five destinations. Each answers exactly one question, and no question is answered twice:

| # | Screen | The question it answers | What it absorbs from today's app |
|---|--------|------------------------|----------------------------------|
| 1 | **Today** | *What do I do right now?* | Daily Flow (the good parts), Dashboard's task counts, Weekly Tasks |
| 2 | **Plan** | *What's coming, and will I have enough?* | Calendar, Planting Schedule, order gap detection, Mix Calculator's math |
| 3 | **Grow** | *What's on my racks?* | Trays, Batches, Varieties (as a tab), Recipes (as a tab) |
| 4 | **Sell** | *Who gets what, and did they get it?* | Customers, Standing Orders, Products, Orders page, delivery reports |
| 5 | **Stock** | *Do I have the seed and supplies?* | Seed batches, Supplies, Vendors, seed usage analytics |

Plus **Settings** (users, farm, billing, help) tucked at the bottom, and the platform-admin portal as a fully separate app. Reports stop being a destination — each screen exports/prints its own data where the user already is (harvest report lives in Today/Grow, delivery report in Sell).

### Screen 1: Today — the home screen and the only place work happens

Opening the app lands here. It is a **checklist, not a dashboard**:

- Tasks grouped in the natural work order of a grow room: **Soak → Sow → Water/Care → Harvest → Pack & Deliver.** Within each group, one line per task with the two or three facts needed to act (variety, tray count, which rack, which seed lot) and a single **Done** action. Tapping Done for a sow task asks only what genuinely varies (which seed batch? actually sowed how many?) — everything else is pre-filled from the plan.
- A thin banner on top for **exceptions only**: "2 deliveries this Friday are short — fix in Plan." Not a stats wall. If nothing is wrong, the banner isn't there.
- **Yesterday's unfinished tasks** roll forward visibly ("overdue" chip) instead of silently vanishing or duplicating.
- Nothing else. No charts, no KPIs, no configuration. A new employee should be able to run the farm's morning from this screen with zero training — that's the acceptance test.

### Screen 2: Plan — one calendar, demand-driven, with capacity awareness

This is the merge of Calendar + Planting Schedule + gap detection into a single week/month view:

- Each day shows what the task engine has projected: sows, harvests, deliveries. **Deliveries are the anchors**; sows and soaks are automatically back-scheduled from them (delivery date − recipe days), which is the calculation the app already does in three places — here it happens in exactly one.
- The **coverage question is answered inline**: each upcoming delivery shows covered / short / at-risk, computed from trays actually growing. "Short" expands to a one-tap fix: *sow N more trays of X by Tuesday → adds tasks.* This replaces DailyFlow's buried gap-reallocation modals with the thing the farmer actually wants: "tell me now, while I can still fix it."
- Manual adjustments (skip a week, bump a sow date, add an ad-hoc batch for a farmers market) happen here by editing the plan — and the task engine regenerates downstream tasks. The user edits *intent*; the app recomputes *work*.
- The mix calculator dies as a page and becomes what it always was: the back-scheduling math inside Plan. A "product mix" is just a product whose recipe list fans out into multiple sow tasks with different dates — plan it like anything else.

### Screen 3: Grow — the living inventory

Tabs: **Trays** (what's growing now, by rack/location, with each tray's current step and days-to-harvest), **Recipes**, **Varieties**. The tray list is read-mostly — trays are born from Plan/Today, not created here (with an "ad-hoc tray" escape hatch). A tray's detail view shows its step timeline and lets you fix reality (died, contaminated, harvested early) — and fixing reality updates coverage in Plan automatically.

**Recipes get one big simplification:** there is only one kind of recipe. The Sproutify template library ("global recipes") becomes a **browse-and-copy catalog** — copying stamps a `copied_from` reference and from then on it's simply *your* recipe. No dual tables in dropdowns, no ambiguity about which kind of recipe an ID refers to, no orphaned linkage. Steps store their offset **in days as a number (0.5 allowed)** — the hours-vs-days conversion with its shifting 6/12-hour threshold disappears entirely; a 9-hour soak is 0.4 days and schedules the evening before, deterministically.

### Screen 4: Sell — from handshake to delivery, one thread

Tabs: **Customers**, **Standing Orders**, **Products**, **Deliveries**. The key rebuild decision: **there is no separate "orders" concept.** A standing order (weekly, biweekly, or even one-time — a one-time order is just a standing order with one occurrence) generates dated **deliveries**, and each delivery shows its status through the whole thread: planned → growing (with tray links) → harvested → delivered/short/skipped. That's the visibility that's missing today, and it's what makes the farmer trust the system: they can click any future delivery and see exactly which trays on the rack are destined for it.

### Screen 5: Stock — seed in, greens out

Seed batches with running balances (the sow tasks already decrement them — here you just see it), low-stock warnings that surface as a Plan banner *before* they break a sow date ("you don't have enough pea seed for next Tuesday's plan"), plus supplies and vendors. This screen exists so seed inventory can be trusted; it is not a workflow.

## 9.4 Rebuilt data model — fewer tables doing more

The current 45 tables shrink to roughly 20 by making a few honest decisions:

| Decision | Replaces |
|----------|----------|
| One `tasks` table + `complete_task` RPC | `tray_steps` status/completed duality, `task_completions`, `tray_creation_requests`, the soak piggyback on requests, `weekly_tasks`, `task_templates`, `maintenance_tasks` (a maintenance task is just a recurring task) |
| One `recipes` + `recipe_steps`, with `copied_from` to the template catalog | `recipes`/`steps` + `global_recipes`/`global_steps` + `farm_global_recipes` duality |
| `standing_orders` → `deliveries` (dated instances with status) | `orders`, `order_items`, `order_schedules`, `order_fulfillment_actions` (actions become an event log column/table on deliveries), the trays-as-orders fallback |
| Dates are **date columns**, offsets are **numeric days** | 42 hand-rolled string↔Date conversions, the toISOString UTC bugs, the hours threshold |
| Soaked seed is a task output (`soak` task completion creates the lot) | the `soaked_seed` side-table choreography |

Keep as-is: customers, products/variants, seedbatches/seed_transactions, supplies, vendors, farms/profile, notifications, the billing tables. The multi-tenant RLS pattern carries over unchanged — it's already good.

And this time the schema lives **entirely in migrations** from day one, with generated TypeScript types, so the database can never again drift away from the repo.

## 9.5 Rebuilt app architecture — boring on purpose

- **One web app** (React + Vite is fine). React-query for all data access — every screen's data is a named query with caching and invalidation, so "two screens disagree" can't happen. No page over ~400 lines; screens compose feature components.
- **All business logic in the database or edge functions** (task generation, completion side effects, coverage math), because the DB already half-lives there — commit to it fully. The client becomes what it should be: forms and lists over RPCs. This is also what makes a future mobile app cheap: it consumes the same task feed and the same `complete_task` RPC. (Decide mobile honestly: either the Today screen is mobile-first responsive web — probably sufficient for a grow room with a wall tablet — or it's a thin native app over the same API. Delete the empty folder either way.)
- **Tests where the money is**: the task generator and date math get unit tests before anything else. Those two things being trustworthy *is* the product.
- Admin portal as a separate small app with real role-based auth.

## 9.6 What deliberately doesn't exist in the rebuild

Saying no is most of the simplification:

- **No Dashboard as a separate page** — Today's banner + Plan's coverage view *are* the dashboard. (Sage's daily briefing can live at the top of Today.)
- **No Orders page, no Weekly Tasks page, no Mix Calculator page, no Reports hub** — absorbed as described above.
- **No user-facing "generate" buttons** (seeding requests, schedules) — projection is the system's job, continuous and invisible.
- **No manual task creation as a primary flow** — only as an escape hatch.
- **No second way to do anything.** One path to sow, one to harvest, one to complete. Where the current app grew three paths, the rebuild's rule is: the second path replaces the first or it doesn't ship.

## 9.7 How to actually get there (without a big-bang rewrite)

A from-scratch rewrite is tempting and usually a trap — you have live farms, working RLS, and a domain model that's 80% right. The realistic route is a **strangler rebuild inside the existing app**, in this order:

1. **Build the task engine first** (new `tasks` table + generator + `complete_task` RPC), populated alongside the old system. Verify for a week or two that it produces the same tasks the old six-source assembly does. This is the highest-risk, highest-value piece — do it while the old system still works.
2. **Build the new Today screen on the task engine** and make it the default landing page. The old DailyFlow stays reachable during the transition, then dies. This single step retires the worst 450KB of code in the app.
3. **Merge Plan** (Calendar + Planting Schedule + gaps) on top of the same engine.
4. **Collapse Sell**: introduce `deliveries` as the renamed/refined `order_schedules`, add the status thread, delete `orders`/`order_items` and the OrdersPage fallback.
5. **Unify recipes** (fold global-recipe copies into one table with `copied_from`), migrate step durations to numeric days.
6. **Trim the nav** to the five destinations as each becomes real; delete the dead pages, services, and tables behind them.

Each step ships value on its own, nothing depends on a rewrite finishing, and at every point the app is simpler than the day before. Steps 1–2 alone — one task engine, one Today screen — would eliminate the majority of what makes the app feel complicated right now.

### The rebuild in one sentence
**Turn the app from a set of windows onto database tables into a single loop — sell → plan → grow → deliver — where standing orders silently generate a plan, the plan generates today's checklist, and the farmer's only job is to tap Done.**
