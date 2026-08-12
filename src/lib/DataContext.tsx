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
 *
 * Secondarily, after the DB fetch, a non-blocking attempt is made to reach
 * the backend planning engine. If it responds, backendConnected becomes true
 * and the backend-specific state fields populate. If it is unreachable the
 * app continues working exactly as before with seed/DB data.
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
import {
  backendApi,
  type BackendPlanDetail, type BackendPlan, type BackendContainer,
  type BackendYardSlot, type BackendJockey, type BackendWeight, type BackendOrder,
  type BackendDisruption, type SolveStrategy, type DisruptionType,
} from '@/lib/backend-api'

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
  // Backend planning engine slices
  | 'plans' | 'backendContainers' | 'backendSlots' | 'backendWeights'

const SLICE_ENDPOINTS: Record<string, string> = {
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
  // ── Existing seed / DB fields (unchanged) ────────────────────────────────
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

  // ── NEW — backend planning engine fields (coexist with seed data) ─────────
  /** true if the backend planning engine responded on mount */
  backendConnected: boolean
  /** the most recent confirmed/in-progress plan from the engine */
  activePlan: BackendPlanDetail | null
  /** plan history from the engine */
  plans: BackendPlan[]
  backendContainers: BackendContainer[]
  backendSlots: BackendYardSlot[]
  backendJockeys: BackendJockey[]
  backendWeights: BackendWeight[]
  orders: BackendOrder[]

  // ── NEW — planning engine action functions ────────────────────────────────
  generatePlan: (strategy?: SolveStrategy, timeBudget?: number) => Promise<BackendPlanDetail | null>
  confirmPlan: (planId: number) => Promise<boolean>
  createDisruption: (data: {
    event_type: DisruptionType
    affected_container_id?: number
    affected_jockey_id?: number
    description: string
  }) => Promise<BackendDisruption | null>
  updateWeights: (weights: { factor_name: string; weight: number }[]) => Promise<{ warnings: string[] } | null>
  resetBackend: () => Promise<void>
}

// ── Seed initial state ────────────────────────────────────────────────────────

const NOOP_ASYNC = async () => {}

const INITIAL: YardData = {
  // Existing fields
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
  refresh: NOOP_ASYNC,

  // New backend fields — default to empty/false until backend responds
  backendConnected: false,
  activePlan: null,
  plans: [],
  backendContainers: [],
  backendSlots: [],
  backendJockeys: [],
  backendWeights: [],
  orders: [],

  // New action functions — replaced by real implementations inside DataProvider
  generatePlan: async () => null,
  confirmPlan: async () => false,
  createDisruption: async () => null,
  updateWeights: async () => null,
  resetBackend: NOOP_ASYNC,
}

// ── Context ───────────────────────────────────────────────────────────────────

const DataContext = createContext<YardData>(INITIAL)

async function fetchJson(path: string): Promise<unknown> {
  const r = await fetch(path)
  if (!r.ok) throw new Error(`${r.status} ${path}`)
  return r.json()
}

/** Apply a fetched slice to a YardData update object with proper types. */
function applySlice(updates: Partial<YardData>, slice: string, json: unknown): void {
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

  // ── Refresh (stable) — re-fetches named slices and merges them ────────────
  // Handles both DB slices (via fetchJson) and backend engine slices (via backendApi).
  // Individual slice failures are logged but do not affect the other slices.
  const refresh = useCallback(async (slices: RefreshSlice[]) => {
    const updates: Partial<YardData> = {}
    await Promise.all(
      slices.map(async (s) => {
        try {
          if (s === 'plans') {
            const plansList = await backendApi.plans()
            updates.plans = plansList
            if (plansList.length > 0) {
              updates.activePlan = await backendApi.plan(plansList[0].id)
            }
          } else if (s === 'backendContainers') {
            updates.backendContainers = await backendApi.containers()
          } else if (s === 'backendSlots') {
            const yardState = await backendApi.yard()
            updates.backendSlots = yardState.slots
          } else if (s === 'backendWeights') {
            updates.backendWeights = await backendApi.weights()
          } else if (SLICE_ENDPOINTS[s]) {
            const json = await fetchJson(SLICE_ENDPOINTS[s])
            applySlice(updates, s, json)
          }
        } catch (err) {
          console.warn('[DataContext] refresh failed for', s, err)
        }
      })
    )
    setData(prev => ({ ...prev, ...updates }))
  }, [])

  // ── Action functions ──────────────────────────────────────────────────────

  const generatePlan = useCallback(async (
    strategy: SolveStrategy = 'cp_sat',
    timeBudget?: number,
  ): Promise<BackendPlanDetail | null> => {
    try {
      const plan = await backendApi.generatePlan({
        strategy,
        time_budget_seconds: timeBudget ?? null,
      })
      setData(prev => ({
        ...prev,
        activePlan: plan,
        plans: [plan, ...prev.plans.filter(p => p.id !== plan.id)],
      }))
      return plan
    } catch (err) {
      console.error('[DataContext] generatePlan failed:', err)
      return null
    }
  }, [])

  const confirmPlan = useCallback(async (planId: number): Promise<boolean> => {
    try {
      const updated = await backendApi.confirmPlan(planId)
      setData(prev => ({
        ...prev,
        plans: prev.plans.map(p => p.id === planId ? { ...p, ...updated } : p),
        activePlan: prev.activePlan?.id === planId
          ? { ...prev.activePlan, ...updated }
          : prev.activePlan,
      }))
      return true
    } catch (err) {
      console.error('[DataContext] confirmPlan failed:', err)
      return false
    }
  }, [])

  const createDisruption = useCallback(async (data: {
    event_type: DisruptionType
    affected_container_id?: number
    affected_jockey_id?: number
    description: string
  }): Promise<BackendDisruption | null> => {
    try {
      return await backendApi.createDisruption(data)
    } catch (err) {
      console.error('[DataContext] createDisruption failed:', err)
      return null
    }
  }, [])

  const updateWeights = useCallback(async (
    weights: { factor_name: string; weight: number }[],
  ): Promise<{ warnings: string[] } | null> => {
    try {
      const result = await backendApi.updateWeights(weights)
      setData(prev => ({ ...prev, backendWeights: result.weights }))
      return { warnings: result.warnings }
    } catch (err) {
      console.error('[DataContext] updateWeights failed:', err)
      return null
    }
  }, [])

  const resetBackend = useCallback(async (): Promise<void> => {
    try {
      await backendApi.resetSeed(false)
      // Re-fetch all backend slices after reset
      await refresh(['plans', 'backendContainers', 'backendSlots', 'backendWeights'])
    } catch (err) {
      console.error('[DataContext] resetBackend failed:', err)
    }
  }, [refresh])

  // ── Mount effect ──────────────────────────────────────────────────────────
  useEffect(() => {
    ;(async () => {
      // ── Phase 1: DB fetch (existing behavior, unchanged) ─────────────────
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
        setData(prev => ({
          ...prev,
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
        }))
      } catch (err) {
        console.warn('[DataContext] DB fetch failed — seed data in use', err)
        setData(prev => ({ ...prev, dbLoading: false, dbError: String(err) }))
      }

      // ── Phase 2: Backend planning engine fetch (non-blocking) ─────────────
      // Seed / DB data is already showing. This populates backend-specific
      // state fields only. If the backend is unreachable nothing changes.
      try {
        const [yardState, containers, jockeys, plansList, weights, ordersList] = await Promise.all([
          backendApi.yard(),
          backendApi.containers(),
          backendApi.jockeys(),
          backendApi.plans(),
          backendApi.weights(),
          backendApi.orders(),
        ])
        // Load the most recent plan's detail if any plans exist
        let activePlan: BackendPlanDetail | null = null
        if (plansList.length > 0) {
          activePlan = await backendApi.plan(plansList[0].id)
        }
        setData(prev => ({
          ...prev,
          backendConnected: true,
          backendSlots: yardState.slots,
          backendContainers: containers,
          backendJockeys: jockeys,
          plans: plansList,
          activePlan,
          backendWeights: weights,
          orders: ordersList,
        }))
      } catch (err) {
        console.warn('[DataContext] Backend unreachable, continuing with seed data:', err)
        setData(prev => ({ ...prev, backendConnected: false }))
      }
    })()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Inject stable action fns and refresh into context value
  const value: YardData = {
    ...data,
    refresh,
    generatePlan,
    confirmPlan,
    createDisruption,
    updateWeights,
    resetBackend,
  }

  return <DataContext.Provider value={value}>{children}</DataContext.Provider>
}

export const useData = () => useContext(DataContext)
