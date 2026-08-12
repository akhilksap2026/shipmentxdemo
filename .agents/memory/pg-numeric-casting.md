---
name: PostgreSQL numeric casting
description: pg (node-postgres) returns DECIMAL/NUMERIC columns as strings — must cast in SQL
---

## Rule
Any DECIMAL or NUMERIC column used in JavaScript arithmetic must be cast in the SQL SELECT:

```sql
est_min::float AS "estMin"
ceiling::float
p50::float, p90::float
required::float, available::float
```

## Why
`node-postgres` returns DECIMAL/NUMERIC as JS strings by default to avoid floating-point precision loss. Calling `.toFixed()`, arithmetic operators, or numeric comparisons on them will throw or produce NaN without the cast.

## How to apply
Add `::float` (or `::int` for integer columns that come back as strings) in every SELECT that feeds a TS interface expecting `number`. INT columns (e.g. `gross_kg INT`) are returned as JS numbers automatically — only DECIMAL/NUMERIC need the cast.

## Affected endpoints in YardOS
- `GET /api/moves` — `est_min::float`
- `GET /api/zones` — `ceiling::float`
- `GET /api/turn-by-hour` — `p50::float, p90::float`
- `GET /api/cycle-by-type` — `p50::float, p90::float`
- `GET /api/capacity` — `required::float, available::float`
