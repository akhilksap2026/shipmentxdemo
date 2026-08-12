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

// ── Health ────────────────────────────────────────────────
app.get('/api/health', (_, res) => res.json({ ok: true }))

const PORT = 8000
app.listen(PORT, () => console.log(`YardOS API on :${PORT}`))
