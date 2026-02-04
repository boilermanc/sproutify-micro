# Claude Code Instructions for Sproutify Micro

> Optimize for correctness, minimalism, and developer experience.

---

## Operating Principles (Non-Negotiable)

- **Correctness over cleverness**: Prefer boring, readable solutions that are easy to maintain.
- **Smallest change that works**: Minimize blast radius; don't refactor adjacent code unless it meaningfully reduces risk.
- **Leverage existing patterns**: Follow established project conventions before introducing new abstractions.
- **Prove it works**: "Seems right" is not done. Validate with tests/build/lint and/or manual repro.
- **Be explicit about uncertainty**: If you cannot verify something, say so and propose the safest next step.

---

## Workflow Orchestration

### 1. Plan Mode Default
- Enter plan mode for ANY non-trivial task (3+ steps, multi-file change, architectural decision)
- Include verification steps in the plan (not as an afterthought)
- If something goes sideways: **STOP**, update the plan, then continue
- Write a crisp spec first when requirements are ambiguous

### 2. Subagent Strategy
- Use subagents to keep main context clean and parallelize work
- Give each subagent **one focused objective** with a concrete deliverable
- Good: "Find where X is implemented and list files + key functions"
- Bad: "Look around"
- Merge subagent outputs into a short, actionable synthesis before coding

### 3. Incremental Delivery
- Prefer **thin vertical slices** over big-bang changes
- Land work in small, verifiable increments: implement → test → verify → expand
- Keep changes behind feature flags or safe defaults when feasible

### 4. Self-Improvement Loop
- After ANY correction from the user: update `tasks/lessons.md` with:
  - The failure mode
  - The detection signal
  - A prevention rule
- Review `tasks/lessons.md` at session start and before major refactors

### 5. Verification Before Done
- Never mark complete without evidence: tests, lint, build, logs, or manual repro
- Compare baseline vs changed behavior when relevant
- Ask: "Would a staff engineer approve this diff and the verification story?"

### 6. Demand Elegance (Balanced)
- For non-trivial changes: pause and ask "Is there a simpler structure?"
- If a fix feels hacky, rewrite elegantly **if** it doesn't expand scope materially
- Don't over-engineer simple fixes; keep momentum

### 7. Autonomous Bug Fixing
- When given a bug report: reproduce → isolate root cause → fix → add regression coverage → verify
- Do NOT offload debugging work to the user unless truly blocked
- If blocked, ask for **one** missing detail with a recommended default

### 8. Database Schema First (MANDATORY)
- **NEVER write SQL queries without first checking the live schema**
- Before ANY database work, run introspection queries to verify table/column names
- No exceptions. No guessing. No "I think the column is called..."
- If a query fails due to schema mismatch, that's a process failure

**How to run queries:**

```bash
node scripts/db-query.js "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'"
```

**Required introspection queries to run BEFORE writing any SQL:**
```sql
-- Step 1: Find the table(s) you need
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
ORDER BY table_name;

-- Step 2: Get exact column names for target table
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'TABLE_NAME_HERE'
ORDER BY ordinal_position;

-- Step 3: Check foreign keys if doing joins
SELECT
    tc.table_name,
    kcu.column_name,
    ccu.table_name AS foreign_table,
    ccu.column_name AS foreign_column
FROM information_schema.table_constraints tc
JOIN information_schema.key_column_usage kcu
    ON tc.constraint_name = kcu.constraint_name
JOIN information_schema.constraint_column_usage ccu
    ON ccu.constraint_name = tc.constraint_name
WHERE tc.constraint_type = 'FOREIGN KEY'
    AND tc.table_schema = 'public'
    AND (tc.table_name = 'TABLE_NAME_HERE' OR ccu.table_name = 'TABLE_NAME_HERE');

-- Step 4: Check views if needed
SELECT table_name as view_name
FROM information_schema.views
WHERE table_schema = 'public';
```

**Common Sproutify schema mistakes to prevent:**
- `farm_id` vs `farm_uuid` – always verify
- `customer_orders` vs `orders` – table naming varies
- `sow_date` vs `scheduled_sow_date` – different purposes
- Views vs tables – know which you're querying

---

## Task Management (File-Based)

1. **Plan First**: Write checklist to `tasks/todo.md` with checkable items
2. **Define Success**: Add acceptance criteria (what must be true when done)
3. **Track Progress**: Mark items complete as you go; one "in progress" at a time
4. **Checkpoint Notes**: Capture discoveries, decisions, constraints as you learn them
5. **Document Results**: Add "Results" section: what changed, where, how verified
6. **Capture Lessons**: Update `tasks/lessons.md` after corrections

---

## Error Handling and Recovery

### "Stop-the-Line" Rule
If anything unexpected happens (test failures, build errors, behavior regressions):
- Stop adding features
- Preserve evidence (error output, repro steps)
- Return to diagnosis and re-plan

### Triage Checklist (Use in Order)
1. **Reproduce** reliably (test, script, or minimal steps)
2. **Localize** the failure (which layer: UI, API, DB, network, build)
3. **Reduce** to a minimal failing case
4. **Fix** root cause (not symptoms)
5. **Guard** with regression coverage
6. **Verify** end-to-end for the original report

### Safe Fallbacks
- Prefer "safe default + warning" over partial behavior
- Degrade gracefully: return actionable errors, not silent failure
- Avoid broad refactors as "fixes"

---

## Communication Guidelines

### Be Concise, High-Signal
- Lead with outcome and impact, not process
- Reference concrete artifacts: file paths, commands, error messages
- Avoid dumping large logs; summarize and point to evidence

### Ask Questions Only When Blocked
- Ask **exactly one** targeted question
- Provide a recommended default
- State what changes depending on the answer

### Show the Verification Story
- Always include: what you ran, and the outcome
- If you didn't run something, give a minimal command list user can run

### Avoid Busywork Updates
- Don't narrate every step
- Do provide checkpoints when: scope changes, risks appear, verification fails

### Sproutify-Specific Communication
- Give steps one at a time
- Always provide SSH commands when relevant
- Explain root causes, not just fixes
- Use SQL queries to verify database states before implementing fixes

---

## Engineering Best Practices

### Testing Strategy
- Add the smallest test that would have caught the bug
- Prefer: unit tests for pure logic, integration tests for DB boundaries
- Avoid brittle tests tied to implementation details

### Type Safety
- Avoid `any` and type suppressions unless no alternative
- Encode invariants at boundaries, not scattered checks

### Dependency Discipline
- Do not add new dependencies unless existing stack can't solve it cleanly
- Prefer standard library / existing utilities

### Security
- Never introduce secrets into code, logs, or output
- Treat user input as untrusted: validate, sanitize, constrain
- Prefer least privilege for DB access

### Performance (Pragmatic)
- Avoid premature optimization
- Do fix: obvious N+1 patterns, unbounded loops, repeated heavy computation
- Measure when in doubt

---

## Project-Specific Context

### Tech Stack
- **Frontend**: React/TypeScript
- **Backend**: Supabase (PostgreSQL)
- **AI Assistant**: Google Gemini (Sage)
- **Payments**: Stripe
- **Email**: Resend API
- **Automation**: n8n workflows

### Database Principles
- Database integrity is critical – incorrect tray assignments or missed seeding schedules have real consequences for customer deliveries
- Prefer views over stored procedures for dynamic data (avoid stale data issues)
- Use database triggers for data integrity, application code for user workflows
- Test database changes incrementally with verification queries
- `sow_date` = actual seeding date (for growth calculations)
- `scheduled_sow_date` = original planned date

### Architecture Guidelines
- Separate global vs farm-specific data (recipes, varieties need both templates and customization)
- Use pg_cron for time-based transitions (auto-completing passive growth phases)
- Reduce database query waterfalls and eliminate duplicate requests
- Implement proper caching strategies

### Testing Environment
- Carson Farm Two (farm_uuid: 31790d3f-2d76-4f2d-a7a2-1e8310dd7c65)
- Test customers: Marie's Deli, Scottsdale Cafe

---

## Definition of Done

A task is done when:
- [ ] Behavior matches acceptance criteria
- [ ] Tests/lint/typecheck/build pass (or documented reason they weren't run)
- [ ] Risky changes have rollback/flag strategy
- [ ] Code follows existing conventions and is readable
- [ ] Verification story exists: "what changed + how we know it works"

---

## Templates

### Plan Template (`tasks/todo.md`)
```markdown
## Goal
[Restate goal + acceptance criteria]

## Tasks
- [ ] Locate existing implementation / patterns
- [ ] Design: minimal approach + key decisions
- [ ] Implement smallest safe slice
- [ ] Add/adjust tests
- [ ] Run verification (lint/tests/build/manual repro)
- [ ] Summarize changes + verification story
- [ ] Record lessons (if any)

## Results
[Fill in when complete]
```

### Bugfix Template
```markdown
## Bug Report
- **Repro steps**:
- **Expected vs actual**:
- **Root cause**:
- **Fix**:
- **Regression coverage**:
- **Verification performed**:
- **Risk/rollback notes**:
```
