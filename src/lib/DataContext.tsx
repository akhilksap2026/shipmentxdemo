/**
 * DataContext — provides all yard data to every screen.
 *
 * Initialises immediately from the deterministic seed data so screens render
 * without a loading state.  Then fetches from the Postgres API and replaces
 * the seed values, causing a single re-render with live data.
 * If the API is unreachable the seed data stays in place as a fallback.
 */
import { createContext, useContext, useState, useEffect, ReactNode } from 'react'
import {
  MOVES, OPERATORS, ASSUMPTIONS, EXCEPTIONS, CONTAINERS, ZONES,
  type Move, type Container, type Zone,
} from '@/data/yard-data'
import {
  VISITS, LANES, APPOINTMENTS, EVENTS, DIFF_ROWS, OPERATOR_TASKS,
  TURN_BY_HOUR, CYCLE_BY_TYPE, CAPACITY,
  type Visit, type Event,
} from '@/data/yard-ops'

// ── Types ────────────────────────────────────────────────────────────────────

export type Operator  = typeof OPERATORS[number]
export type Assumption = typeof ASSUMPTIONS[number]
export type Exception  = typeof EXCEPTIONS[number]
export type Lane       = typeof LANES[number]
export type Appointment = typeof APPOINTMENTS[number]
export type DiffRow    = typeof DIFF_ROWS[number]
export type OperatorTask = typeof OPERATOR_TASKS[number]
export type TurnByHour   = typeof TURN_BY_HOUR[number]
export type CycleByType  = typeof CYCLE_BY_TYPE[number]
export type Capacity     = typeof CAPACITY[number]

export interface YardData {
  moves:         Move[]
  operators:     Operator[]
  assumptions:   Assumption[]
  exceptions:    Exception[]
  containers:    Container[]
  zones:         Zone[]
  visits:        Visit[]
  lanes:         Lane[]
  appointments:  Appointment[]
  events:        Event[]
  diffRows:      DiffRow[]
  operatorTasks: OperatorTask[]
  turnByHour:    TurnByHour[]
  cycleByType:   CycleByType[]
  capacity:      Capacity[]
  /** true while the first DB fetch is in flight */
  dbLoading: boolean
  /** non-null if DB fetch failed permanently */
  dbError: string | null
}

// ── Seed initial state ────────────────────────────────────────────────────────

const INITIAL: YardData = {
  moves: MOVES,
  operators: OPERATORS,
  assumptions: ASSUMPTIONS,
  exceptions: EXCEPTIONS,
  containers: CONTAINERS,
  zones: ZONES,
  visits: VISITS,
  lanes: LANES,
  appointments: APPOINTMENTS,
  events: EVENTS,
  diffRows: DIFF_ROWS,
  operatorTasks: OPERATOR_TASKS,
  turnByHour: TURN_BY_HOUR,
  cycleByType: CYCLE_BY_TYPE,
  capacity: CAPACITY,
  dbLoading: true,
  dbError: null,
}

// ── Context ───────────────────────────────────────────────────────────────────

const DataContext = createContext<YardData>(INITIAL)

async function fetchJson(path: string) {
  const r = await fetch(path)
  if (!r.ok) throw new Error(`${r.status} ${path}`)
  return r.json()
}

export function DataProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<YardData>(INITIAL)

  useEffect(() => {
    ;(async () => {
      try {
        const [
          moves, operators, assumptions, exceptions, containers, zones,
          visits, lanes, appointments, events, diffRows, operatorTasks,
          turnByHour, cycleByType, capacity,
        ] = await Promise.all([
          fetchJson('/api/moves'),
          fetchJson('/api/operators'),
          fetchJson('/api/assumptions'),
          fetchJson('/api/exceptions'),
          fetchJson('/api/containers'),
          fetchJson('/api/zones'),
          fetchJson('/api/visits'),
          fetchJson('/api/lanes'),
          fetchJson('/api/appointments'),
          fetchJson('/api/events'),
          fetchJson('/api/diff-rows'),
          fetchJson('/api/operator-tasks'),
          fetchJson('/api/turn-by-hour'),
          fetchJson('/api/cycle-by-type'),
          fetchJson('/api/capacity'),
        ])
        setData({
          moves, operators, assumptions, exceptions, containers, zones,
          visits, lanes, appointments, events, diffRows, operatorTasks,
          turnByHour, cycleByType, capacity,
          dbLoading: false,
          dbError: null,
        })
      } catch (err) {
        console.warn('[DataContext] DB fetch failed — seed data in use', err)
        setData(prev => ({ ...prev, dbLoading: false, dbError: String(err) }))
      }
    })()
  }, [])

  return <DataContext.Provider value={data}>{children}</DataContext.Provider>
}

export const useData = () => useContext(DataContext)
