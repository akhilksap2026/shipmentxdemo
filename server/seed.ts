/**
 * Seed script — truncates all tables and inserts fresh data from the
 * deterministic seed generators in src/data/. Run with:
 *   npx tsx server/seed.ts
 */
import { Pool } from 'pg'
import { CARRIERS, DEPOTS, ZONES, EQUIPMENT, OPERATORS, CONTAINERS, MOVES, EXCEPTIONS, ASSUMPTIONS } from '../src/data/yard-data.js'
import { VISITS, LANES, APPOINTMENTS, EVENTS, DIFF_ROWS, OPERATOR_TASKS, TURN_BY_HOUR, CYCLE_BY_TYPE, CAPACITY } from '../src/data/yard-ops.js'

const pool = new Pool({ connectionString: process.env.DATABASE_URL })

async function run() {
  const client = await pool.connect()
  try {
    console.log('Seeding YardOS database…')

    // Clear all tables in dependency order
    await client.query(`
      TRUNCATE diff_rows RESTART IDENTITY CASCADE;
      TRUNCATE operator_tasks CASCADE;
      TRUNCATE appointments CASCADE;
      TRUNCATE visits CASCADE;
      TRUNCATE lanes CASCADE;
      TRUNCATE events CASCADE;
      TRUNCATE turn_by_hour CASCADE;
      TRUNCATE cycle_by_type CASCADE;
      TRUNCATE capacity_forecast CASCADE;
      TRUNCATE assumptions CASCADE;
      TRUNCATE exceptions CASCADE;
      TRUNCATE moves CASCADE;
      TRUNCATE containers CASCADE;
      TRUNCATE operators CASCADE;
      TRUNCATE equipment CASCADE;
      TRUNCATE carrier_tiers CASCADE;
      TRUNCATE depots CASCADE;
      TRUNCATE zones CASCADE;
      TRUNCATE carriers CASCADE;
    `)

    // Carriers + tiers
    for (const c of CARRIERS) {
      await client.query(
        `INSERT INTO carriers (code, name, free_days, basis) VALUES ($1,$2,$3,$4)`,
        [c.code, c.name, c.freeDays, c.basis]
      )
      for (const [df, dt, rate] of c.tiers) {
        await client.query(
          `INSERT INTO carrier_tiers (carrier_code, day_from, day_to, rate) VALUES ($1,$2,$3,$4)`,
          [c.code, df, dt, rate]
        )
      }
    }
    console.log(`  carriers: ${CARRIERS.length}`)

    // Depots
    for (const d of DEPOTS) {
      await client.query(
        `INSERT INTO depots (id, name, carrier_code, risk, time_window) VALUES ($1,$2,$3,$4,$5)`,
        [d.id, d.name, d.carrier, d.risk, d.window]
      )
    }
    console.log(`  depots: ${DEPOTS.length}`)

    // Zones
    for (const z of ZONES) {
      await client.query(
        `INSERT INTO zones (id, name, blocks, rows, slots, max_tiers, ceiling, hazmat, customs)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        [z.id, z.name, z.blocks, z.rows, z.slots, z.maxTiers, z.ceiling, z.hazmat, z.customs]
      )
    }
    console.log(`  zones: ${ZONES.length}`)

    // Equipment
    for (const e of EQUIPMENT) {
      await client.query(
        `INSERT INTO equipment (id, type, model, max_row_depth, status, hour_meter, maintenance_due)
         VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [e.id, e.type, e.model, e.maxRowDepth, e.status, e.hourMeter, e.maintenanceDue]
      )
    }
    console.log(`  equipment: ${EQUIPMENT.length}`)

    // Operators
    for (const o of OPERATORS) {
      await client.query(
        `INSERT INTO operators (id, name, equipment_id, certs, shift, status)
         VALUES ($1,$2,$3,$4,$5,$6)`,
        [o.id, o.name, o.equipment, o.certs, o.shift, o.status]
      )
    }
    console.log(`  operators: ${OPERATORS.length}`)

    // Containers
    for (const c of CONTAINERS) {
      await client.query(
        `INSERT INTO containers
         (id, zone_id, block, row_num, slot, tier, address, size, gross_kg,
          carrier_code, carrier_name, consignee, vessel, terminal,
          hazmat, imdg, channel, status, hours_to_lfd, dwell_days,
          priority, empty, why_here, seal)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24)`,
        [c.id, c.zone, c.block, c.row, c.slot, c.tier, c.address, c.size, c.grossKg,
         c.carrier, c.carrierName, c.consignee, c.vessel, c.terminal,
         c.hazmat, c.imdg, c.channel, c.status, c.hoursToLFD, c.dwellDays,
         c.priority, c.empty, c.whyHere, c.seal]
      )
    }
    console.log(`  containers: ${CONTAINERS.length}`)

    // Moves
    for (const m of MOVES) {
      await client.query(
        `INSERT INTO moves
         (id, seq, type, container_id, from_loc, to_loc,
          equipment_id, operator_id, operator_name,
          est_min, start_time, end_time, start_min, end_min,
          state, frozen, priority, reason, reason_text)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)`,
        [m.id, m.seq, m.type, m.containerId, m.from, m.to,
         m.equipment, m.operator, m.operatorName,
         m.estMin, m.start, m.end, m.startMin, m.endMin,
         m.state, m.frozen, m.priority, m.reason, m.reason_text ?? null]
      )
    }
    console.log(`  moves: ${MOVES.length}`)

    // Exceptions
    for (const e of EXCEPTIONS) {
      await client.query(
        `INSERT INTO exceptions (id, type, severity, subject, detail, action) VALUES ($1,$2,$3,$4,$5,$6)`,
        [e.id, e.type, e.severity, e.subject, e.detail, e.action]
      )
    }
    console.log(`  exceptions: ${EXCEPTIONS.length}`)

    // Assumptions
    for (const a of ASSUMPTIONS) {
      await client.query(
        `INSERT INTO assumptions (k, v, note) VALUES ($1,$2,$3)`,
        [a.k, a.v, a.note]
      )
    }
    console.log(`  assumptions: ${ASSUMPTIONS.length}`)

    // Gate — Lanes first (visits reference them)
    for (const l of LANES) {
      await client.query(
        `INSERT INTO lanes (id, type, state, visit_id, since) VALUES ($1,$2,$3,$4,$5)`,
        [l.id, l.type, l.state, l.visit, l.since]
      )
    }
    console.log(`  lanes: ${LANES.length}`)

    // Visits
    for (const v of VISITS) {
      await client.query(
        `INSERT INTO visits
         (id, plate, carrier, driver, purpose, appt_time, queue_in, check_in,
          at_position, served, gate_out, state, turn, lane_id, container_id, excl)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)`,
        [v.id, v.plate, v.carrier, v.driver, v.purpose, v.appt,
         v.queueIn, v.checkIn, v.atPosition, v.served, v.gateOut,
         v.state, v.turn, v.lane, v.container, v.excl]
      )
    }
    console.log(`  visits: ${VISITS.length}`)

    // Appointments
    for (const a of APPOINTMENTS) {
      await client.query(
        `INSERT INTO appointments (appt_window, capacity, booked, no_show, over) VALUES ($1,$2,$3,$4,$5)`,
        [a.window, a.capacity, a.booked, a.noShow, a.over]
      )
    }
    console.log(`  appointments: ${APPOINTMENTS.length}`)

    // Events
    for (const e of EVENTS) {
      await client.query(
        `INSERT INTO events (id, time, type, severity, state, auto, title, detail, diff)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        [e.id, e.time, e.type, e.severity, e.state, e.auto, e.title, e.detail, JSON.stringify(e.diff)]
      )
    }
    console.log(`  events: ${EVENTS.length}`)

    // Diff rows
    for (const r of DIFF_ROWS) {
      await client.query(
        `INSERT INTO diff_rows (move_id, action, type, before_val, after_val, note) VALUES ($1,$2,$3,$4,$5,$6)`,
        [r.moveId, r.action, r.type, r.before, r.after, r.note]
      )
    }
    console.log(`  diff_rows: ${DIFF_ROWS.length}`)

    // Operator tasks
    for (const t of OPERATOR_TASKS) {
      await client.query(
        `INSERT INTO operator_tasks (id, seq, type, container_id, from_loc, to_loc, weight, size, est_min, reason, warn)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
        [t.id, t.seq, t.type, t.container, t.from, t.to, t.weight, t.size, t.est, t.reason, t.warn]
      )
    }
    console.log(`  operator_tasks: ${OPERATOR_TASKS.length}`)

    // KPI series
    for (const t of TURN_BY_HOUR) {
      await client.query(
        `INSERT INTO turn_by_hour (hour, p50, p90, visits) VALUES ($1,$2,$3,$4)`,
        [t.hour, t.p50, t.p90, t.visits]
      )
    }
    for (const c of CYCLE_BY_TYPE) {
      await client.query(
        `INSERT INTO cycle_by_type (type, p50, p90, n) VALUES ($1,$2,$3,$4)`,
        [c.type, c.p50, c.p90, c.n]
      )
    }
    for (const c of CAPACITY) {
      await client.query(
        `INSERT INTO capacity_forecast (month, volume, required, available, breach) VALUES ($1,$2,$3,$4,$5)`,
        [c.month, c.volume, c.required, c.available, c.breach]
      )
    }
    console.log(`  kpi series: ${TURN_BY_HOUR.length + CYCLE_BY_TYPE.length + CAPACITY.length}`)

    console.log('Done ✓')
  } finally {
    client.release()
    await pool.end()
  }
}

run().catch(err => { console.error(err); process.exit(1) })
