import express from 'express'
import cors from 'cors'
import { pool } from './db.js'

const app = express()
app.use(cors())
app.use(express.json())

// ── Carriers ──────────────────────────────────────────────
app.get('/api/carriers', async (_, res) => {
  const { rows } = await pool.query(
    `SELECT code, name, free_days AS "freeDays", basis FROM carriers ORDER BY code`
  )
  res.json(rows)
})

app.get('/api/carrier-tiers', async (_, res) => {
  const { rows } = await pool.query(
    `SELECT carrier_code AS "carrierCode", day_from AS "dayFrom", day_to AS "dayTo", rate
     FROM carrier_tiers ORDER BY carrier_code, day_from`
  )
  res.json(rows)
})

app.get('/api/depots', async (_, res) => {
  const { rows } = await pool.query(
    `SELECT id, name, carrier_code AS carrier, risk, time_window AS "window" FROM depots ORDER BY id`
  )
  res.json(rows)
})

// ── Yard structure ────────────────────────────────────────
app.get('/api/zones', async (_, res) => {
  const { rows } = await pool.query(
    `SELECT id, name, blocks, rows, slots, max_tiers AS "maxTiers", ceiling::float, hazmat, customs
     FROM zones ORDER BY id`
  )
  res.json(rows)
})

app.get('/api/equipment', async (_, res) => {
  const { rows } = await pool.query(
    `SELECT id, type, model, max_row_depth AS "maxRowDepth", status, hour_meter AS "hourMeter",
            maintenance_due AS "maintenanceDue"
     FROM equipment ORDER BY id`
  )
  res.json(rows)
})

app.get('/api/operators', async (_, res) => {
  const { rows } = await pool.query(
    `SELECT id, name, equipment_id AS equipment, certs, shift, status
     FROM operators ORDER BY id`
  )
  res.json(rows)
})

// ── Containers ────────────────────────────────────────────
app.get('/api/containers', async (_, res) => {
  const { rows } = await pool.query(
    `SELECT id, zone_id AS zone, block, row_num AS row, slot, tier, address, size,
            gross_kg AS "grossKg", carrier_code AS carrier, carrier_name AS "carrierName",
            consignee, vessel, terminal, hazmat, imdg, channel, status,
            hours_to_lfd AS "hoursToLFD", dwell_days AS "dwellDays",
            priority, empty, why_here AS "whyHere", seal
     FROM containers ORDER BY zone_id, block, row_num, slot, tier`
  )
  res.json(rows)
})

// ── Moves ─────────────────────────────────────────────────
app.get('/api/moves', async (_, res) => {
  const { rows } = await pool.query(
    `SELECT id, seq, type, container_id AS "containerId",
            from_loc AS "from", to_loc AS "to",
            equipment_id AS equipment, operator_id AS operator, operator_name AS "operatorName",
            est_min::float AS "estMin", start_time AS start, end_time AS end,
            start_min AS "startMin", end_min AS "endMin",
            state, frozen, priority, reason
     FROM moves ORDER BY seq`
  )
  res.json(rows)
})

// ── Planning ──────────────────────────────────────────────
app.get('/api/exceptions', async (_, res) => {
  const { rows } = await pool.query(`SELECT * FROM exceptions ORDER BY id`)
  res.json(rows)
})

app.get('/api/assumptions', async (_, res) => {
  const { rows } = await pool.query(`SELECT k, v, note FROM assumptions`)
  res.json(rows)
})

// ── Gate ──────────────────────────────────────────────────
app.get('/api/visits', async (_, res) => {
  const { rows } = await pool.query(
    `SELECT id, plate, carrier, driver, purpose,
            appt_time AS appt, queue_in AS "queueIn", check_in AS "checkIn",
            at_position AS "atPosition", served, gate_out AS "gateOut",
            state, turn, lane_id AS lane, container_id AS container, excl
     FROM visits ORDER BY id`
  )
  res.json(rows)
})

app.get('/api/lanes', async (_, res) => {
  const { rows } = await pool.query(
    `SELECT id, type, state, visit_id AS visit, since FROM lanes ORDER BY id`
  )
  res.json(rows)
})

app.get('/api/appointments', async (_, res) => {
  const { rows } = await pool.query(
    `SELECT appt_window AS "window", capacity, booked, no_show AS "noShow", over
     FROM appointments ORDER BY appt_window`
  )
  res.json(rows)
})

// ── Control Tower ─────────────────────────────────────────
app.get('/api/events', async (_, res) => {
  const { rows } = await pool.query(
    `SELECT id, time, type, severity, state, auto, title, detail, diff
     FROM events ORDER BY time`
  )
  res.json(rows)
})

app.get('/api/diff-rows', async (_, res) => {
  const { rows } = await pool.query(
    `SELECT move_id AS "moveId", action, type,
            before_val AS before, after_val AS after, note
     FROM diff_rows ORDER BY id`
  )
  res.json(rows)
})

// ── Operator ──────────────────────────────────────────────
app.get('/api/operator-tasks', async (_, res) => {
  const { rows } = await pool.query(
    `SELECT id, seq, type, container_id AS container,
            from_loc AS "from", to_loc AS "to",
            weight, size, est_min AS est, reason, warn
     FROM operator_tasks ORDER BY id`
  )
  res.json(rows)
})

// ── KPIs ──────────────────────────────────────────────────
app.get('/api/turn-by-hour', async (_, res) => {
  const { rows } = await pool.query(
    `SELECT hour, p50::float, p90::float, visits FROM turn_by_hour ORDER BY hour`
  )
  res.json(rows)
})

app.get('/api/cycle-by-type', async (_, res) => {
  const { rows } = await pool.query(
    `SELECT type, p50::float, p90::float, n FROM cycle_by_type`
  )
  res.json(rows)
})

app.get('/api/capacity', async (_, res) => {
  const { rows } = await pool.query(
    `SELECT month, volume, required::float, available::float, breach FROM capacity_forecast`
  )
  res.json(rows)
})

// ── Write paths ───────────────────────────────────────────

// POST /api/moves/:id/complete
// Atomic move completion — server-side only, no client-supplied location data.
// Validates: move exists, is in an executable state, destination address is parseable,
// and the container is still at from_loc (guards against stale / conflicting moves).
// Only this endpoint may transition a move to DONE; the generic PATCH route refuses DONE.
app.post('/api/moves/:id/complete', async (req, res) => {
  const { id } = req.params
  const client = await pool.connect()
  try {
    await client.query('BEGIN')

    // 1. Lock and read the move
    const mv = await client.query(
      `SELECT id, container_id, from_loc, to_loc, state
       FROM moves WHERE id = $1 FOR UPDATE`,
      [id]
    )
    if (!mv.rows.length) {
      await client.query('ROLLBACK')
      return res.status(404).json({ error: `Move ${id} not found` })
    }
    const move = mv.rows[0] as {
      id: string; container_id: string; from_loc: string; to_loc: string; state: string
    }

    // 2. State guard — only PLANNED / ASSIGNED / IN_PROGRESS may complete
    if (move.state === 'DONE') {
      await client.query('ROLLBACK')
      return res.status(409).json({ error: `Move ${id} is already DONE` })
    }
    if (!['PLANNED', 'ASSIGNED', 'IN_PROGRESS'].includes(move.state)) {
      await client.query('ROLLBACK')
      return res.status(409).json({ error: `Move ${id} has state '${move.state}' and cannot be completed` })
    }

    // 3. Validate destination address format: "Z-BB-R-S-T" (5 dash-separated parts)
    const destParts = move.to_loc.split('-')
    if (destParts.length !== 5) {
      await client.query('ROLLBACK')
      return res.status(422).json({ error: `Move ${id} to_loc '${move.to_loc}' is not a valid address` })
    }
    const [zone, block, row, slot, tier] = [
      destParts[0],
      parseInt(destParts[1], 10),
      parseInt(destParts[2], 10),
      parseInt(destParts[3], 10),
      parseInt(destParts[4], 10),
    ]
    if ([block, row, slot, tier].some(n => !Number.isInteger(n) || n < 1)) {
      await client.query('ROLLBACK')
      return res.status(422).json({ error: `Move ${id} to_loc '${move.to_loc}' has invalid numeric components` })
    }

    // 4. Lock container and verify it is still at from_loc (guards against stale/conflicting moves)
    const cr = await client.query(
      `SELECT id, address FROM containers WHERE id = $1 FOR UPDATE`,
      [move.container_id]
    )
    if (!cr.rows.length) {
      await client.query('ROLLBACK')
      return res.status(422).json({ error: `Container ${move.container_id} not found — move rolled back` })
    }
    const container = cr.rows[0] as { id: string; address: string }
    if (container.address !== move.from_loc) {
      await client.query('ROLLBACK')
      return res.status(409).json({
        error: `Container ${move.container_id} is at '${container.address}', not '${move.from_loc}' — move is stale or already superseded`,
      })
    }

    // 5. Mark move DONE
    await client.query(`UPDATE moves SET state = 'DONE' WHERE id = $1`, [id])

    // 6. Relocate container — rowCount guaranteed 1 (row was just locked above)
    await client.query(
      `UPDATE containers
       SET zone_id = $1, block = $2, row_num = $3, slot = $4, tier = $5, address = $6
       WHERE id = $7`,
      [zone, block, row, slot, tier, move.to_loc, move.container_id]
    )

    await client.query('COMMIT')
    res.json({ moveId: id, containerId: move.container_id, destination: move.to_loc, state: 'DONE' })
  } catch (err) {
    await client.query('ROLLBACK')
    throw err
  } finally {
    client.release()
  }
})

// PATCH /api/moves/:id  { state: 'PLANNED'|'ASSIGNED'|'IN_PROGRESS' }
// NOTE: 'DONE' is intentionally excluded — use POST /api/moves/:id/complete instead,
// which atomically relocates the container in the same transaction.
app.patch('/api/moves/:id', async (req, res) => {
  const { id } = req.params
  const { state } = req.body
  const VALID = ['PLANNED', 'ASSIGNED', 'IN_PROGRESS']
  if (!state || !VALID.includes(state)) {
    return res.status(400).json({ error: `state must be one of ${VALID.join(', ')} — use POST /api/moves/:id/complete to mark DONE` })
  }
  const { rows } = await pool.query(
    `UPDATE moves SET state = $1 WHERE id = $2
     RETURNING id, state`,
    [state, id]
  )
  if (!rows.length) return res.status(404).json({ error: 'Move not found' })
  res.json(rows[0])
})

// PATCH /api/containers/:id  { zone, block, row, slot, tier, address }
app.patch('/api/containers/:id', async (req, res) => {
  const { id } = req.params
  const { zone, block, row, slot, tier, address } = req.body
  if (!zone || block == null || row == null || slot == null || tier == null || !address) {
    return res.status(400).json({ error: 'zone, block, row, slot, tier and address are required' })
  }
  const { rows } = await pool.query(
    `UPDATE containers
     SET zone_id = $1, block = $2, row_num = $3, slot = $4, tier = $5, address = $6
     WHERE id = $7
     RETURNING id, zone_id AS zone, block, row_num AS row, slot, tier, address`,
    [zone, block, row, slot, tier, address, id]
  )
  if (!rows.length) return res.status(404).json({ error: 'Container not found' })
  res.json(rows[0])
})

// POST /api/events  — record a new tower event
app.post('/api/events', async (req, res) => {
  const { id, time, type, severity, state, auto, title, detail, diff } = req.body
  if (!id || !title) return res.status(400).json({ error: 'id and title are required' })
  const { rows } = await pool.query(
    `INSERT INTO events (id, time, type, severity, state, auto, title, detail, diff)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     ON CONFLICT (id) DO NOTHING
     RETURNING id`,
    [id, time ?? new Date().toTimeString().slice(0, 5),
     type ?? 'PLAN_PUBLISHED', severity ?? 'low',
     state ?? 'replanned', auto ?? 'Auto',
     title, detail ?? '', JSON.stringify(diff ?? {})]
  )
  res.status(201).json(rows[0] ?? { id })
})

// PATCH /api/visits/:id  — update visit state / times / lane assignment
app.patch('/api/visits/:id', async (req, res) => {
  const { id } = req.params
  const { state, check_in, at_position, served, gate_out, lane_id } = req.body
  const { rows } = await pool.query(
    `UPDATE visits
     SET state       = COALESCE($1, state),
         check_in    = COALESCE($2, check_in),
         at_position = COALESCE($3, at_position),
         served      = COALESCE($4, served),
         gate_out    = COALESCE($5, gate_out),
         lane_id     = COALESCE($6, lane_id)
     WHERE id = $7
     RETURNING id, state, check_in AS "checkIn", at_position AS "atPosition",
               served, gate_out AS "gateOut", lane_id AS lane`,
    [state ?? null, check_in ?? null, at_position ?? null,
     served ?? null, gate_out ?? null, lane_id ?? null, id]
  )
  if (!rows.length) return res.status(404).json({ error: 'Visit not found' })
  res.json(rows[0])
})

// PATCH /api/lanes/:id  — update lane occupancy
app.patch('/api/lanes/:id', async (req, res) => {
  const { id } = req.params
  const { state, visit_id, since } = req.body
  const { rows } = await pool.query(
    `UPDATE lanes
     SET state    = COALESCE($1, state),
         visit_id = COALESCE($2, visit_id),
         since    = COALESCE($3, since)
     WHERE id = $4
     RETURNING id, state, visit_id AS visit, since`,
    [state ?? null, visit_id ?? null, since ?? null, id]
  )
  if (!rows.length) return res.status(404).json({ error: 'Lane not found' })
  res.json(rows[0])
})

// ── Health ────────────────────────────────────────────────
app.get('/api/health', (_, res) => res.json({ ok: true }))

const PORT = 8000
app.listen(PORT, () => console.log(`YardOS API on :${PORT}`))
