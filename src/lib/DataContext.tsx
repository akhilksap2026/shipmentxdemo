/**
 * DataContext — provides all yard data to every screen.
 *
 * Initialises immediately from the deterministic seed data so screens render
 * without a loading state.  Then fetches from the Postgres API and replaces
 * the seed values, causing a single re-render with live data.
 * If the API is unreachable the seed data stays in place as a fallback.
 *
 * After a write (PATCH move, PATCH container, POST event) call
 *   refresh(['moves', 'containers'])
 * to pull updated slices from the DB without a full reload.
 */
import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react'
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

export type Operator    = typeof OPERATORS[number]
export type Assumption  = typeof ASSUMPTIONS[number]
export type Exception   = typeof EXCEPTIONS[number]
export type Lane        = typeof LANES[number]
export type Appointment = typeof APPOINTMENTS[number]
export type DiffRow     = typeof DIFF_ROWS[number]
export type OperatorTask = typeof OPERATOR_TASKS[number]
export type TurnByHour  = typeof TURN_BY_HOUR[number]
export type CycleByType = typeof CYCLE_BY_TYPE[number]
export type Capacity    = typeof CAPACITY[number]

/** Slice keys that can be individually refreshed after a write. */
export type RefreshSlice =
  | 'moves' | 'containers' | 'events' | 'visits'
  | 'lanes' | 'appointments' | 'diffRows' | 'operatorTasks'

const SLICE_ENDPOINTS: Record<RefreshSlice, string> = {
  moves:         '/api/moves',
  containers:    '/api/containers',
  events:        '/api/events',
  visits:        '/api/visits',
  lanes:         '/api/lanes',
  appointments:  '/api/appointments',
  diffRows:      '/api/diff-rows',
  operatorTasks: '/api/operator-tasks',
}

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
  /** Re-fetch specific slices after a write; silently ignores individual failures. */
  refresh: (slices: RefreshSlice[]) => Promise<void>
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
  refresh: async () => {},
}

// ── Context ───────────────────────────────────────────────────────────────────

const DataContext = createContext<YardData>(INITIAL)

async function fetchJson(path: string): Promise<unknown> {
  const r = await fetch(path)
  if (!r.ok) throw new Error(`${r.status} ${path}`)
  return r.json()
}

/** Apply a fetched slice to a YardData update object with proper types. */
function applySlice(updates: Partial<YardData>, slice: RefreshSlice, json: unknown): void {
  switch (slice) {
    case 'moves':         updates.moves         = json as Move[];         break
    case 'containers':    updates.containers     = json as Container[];    break
    case 'events':        updates.events         = json as Event[];        break
    case 'visits':        updates.visits         = json as Visit[];        break
    case 'lanes':         updates.lanes          = json as Lane[];         break
    case 'appointments':  updates.appointments   = json as Appointment[];  break
    case 'diffRows':      updates.diffRows       = json as DiffRow[];      break
    case 'operatorTasks': updates.operatorTasks  = json as OperatorTask[]; break
  }
}

export function DataProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<YardData>(INITIAL)

  // Stable refresh — re-fetches only the named slices and merges them.
  // Individual slice failures are logged but do not affect the other slices.
  const refresh = useCallback(async (slices: RefreshSlice[]) => {
    const updates: Partial<YardData> = {}
    await Promise.all(
      slices.map(async (s) => {
        try {
          const json = await fetchJson(SLICE_ENDPOINTS[s])
          applySlice(updates, s, json)
        } catch (err) {
          console.warn('[DataContext] refresh failed for', s, err)
        }
      })
    )
    setData(prev => ({ ...prev, ...updates }))
  }, [])

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
          moves:         moves         as Move[],
          operators:     operators     as Operator[],
          assumptions:   assumptions   as Assumption[],
          exceptions:    exceptions    as Exception[],
          containers:    containers    as Container[],
          zones:         zones         as Zone[],
          visits:        visits        as Visit[],
          lanes:         lanes         as Lane[],
          appointments:  appointments  as Appointment[],
          events:        events        as Event[],
          diffRows:      diffRows      as DiffRow[],
          operatorTasks: operatorTasks as OperatorTask[],
          turnByHour:    turnByHour    as TurnByHour[],
          cycleByType:   cycleByType   as CycleByType[],
          capacity:      capacity      as Capacity[],
          dbLoading: false,
          dbError: null,
          refresh,
        })
      } catch (err) {
        console.warn('[DataContext] DB fetch failed — seed data in use', err)
        setData(prev => ({ ...prev, dbLoading: false, dbError: String(err), refresh }))
      }
    })()
  }, [refresh])

  return <DataContext.Provider value={data}>{children}</DataContext.Provider>
}

export const useData = () => useContext(DataContext)
