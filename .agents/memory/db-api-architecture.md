---
name: DB + API architecture
description: How YardOS wires PostgreSQL → Express API → React DataContext
---

## Stack
- **DB**: Replit PostgreSQL (DATABASE_URL env var)
- **API**: Express on port 8000, workflow "API server" (`npx tsx server/index.ts`)
- **Proxy**: Vite `server.proxy` routes `/api` → `http://localhost:8000`
- **Frontend**: `DataContext.tsx` initialises with static seed data (no loading spinner), then `Promise.all` fetches all 15 endpoints and replaces state silently

## Key files
- `server/db.ts` — pg Pool from DATABASE_URL
- `server/index.ts` — 15 GET endpoints, snake_case → camelCase aliasing, ::float casts on DECIMAL columns
- `server/seed.ts` — truncates all tables, re-seeds from `src/data/yard-data.ts` + `src/data/yard-ops.ts`
- `src/lib/DataContext.tsx` — React context + DataProvider; screens call `useData()`
- `scripts/post-merge.sh` — runs `npm install && npx tsx server/seed.ts` after task-agent merges

## Column naming convention
DB uses snake_case; API SELECT aliases each to camelCase to match TS interfaces.
No FK on visits.container_id / lanes.visit_id (circular reference — stored as plain VARCHAR).

**Why:** Keeps TS interfaces unchanged from the seed era; only the data source changes.

## Fallback behaviour
If the API is unreachable, DataContext logs a warning and keeps seed data — the app never shows a crash or spinner.
