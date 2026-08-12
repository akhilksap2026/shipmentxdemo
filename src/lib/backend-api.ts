/**
 * Backend API client — typed wrappers matching backend/app/schemas.py.
 * This file is the ONLY place that talks to the backend.
 * Every function returns a Promise. If the backend is unreachable,
 * the caller (DataContext) falls back to seed data — this file never
 * catches errors silently.
 */

const API_BASE = "/api"; // proxied via vite.config.ts

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers || {}) },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    let detail: unknown;
    try { detail = JSON.parse(text)?.detail; } catch { /* not JSON */ }
    throw new Error(typeof detail === "string" ? detail : `API ${res.status} ${path}: ${text}`);
  }
  if (res.status === 204) return undefined as T;
  return res.json();
}

// ─── Types (mirror backend/app/schemas.py exactly) ───────────────────

export type ContainerStatus = "in_transit" | "yard" | "staged" | "departed";
export type DamageStatus = "none" | "minor" | "major" | "hold";
export type OrderType = "inbound_full" | "outbound_empty_to_port" | "outbound_full_to_dc" | "outbound_empty_for_pickup";
export type JockeyStatus = "available" | "busy" | "on_break" | "off_shift";
export type PlanStatus = "draft" | "confirmed" | "in_progress" | "superseded";
export type MoveStatus = "planned" | "in_progress" | "done" | "cancelled";
export type MoveReason = "inbound_placement" | "outbound_staging" | "shuffle" | "re_marshal" | "replan_reassignment";
export type DisruptionType = "truck_accident" | "ship_delay" | "inspection_hold" | "out_of_sequence_arrival" | "jockey_unavailable";
export type SolveStrategy = "cp_sat" | "greedy";

export interface BackendYardSlot {
  id: number; yard_id: number; block: string; bay: number; row: number; tier: number;
  is_hazmat_approved: boolean; is_reefer_capable: boolean; occupied_container_id: number | null;
}
export interface BackendYard { id: number; name: string; rows: number; bays_per_row: number; max_tier: number; }
export interface BackendYardState { yard: BackendYard; slots: BackendYardSlot[]; }
export interface BackendOrder {
  id: number; origin: string; destination: string; eta: string; priority: number;
  order_type: OrderType; customer_name: string;
}
export interface BackendContainer {
  id: number; container_number: string; order_id: number | null; size_ft: number;
  status: ContainerStatus; is_hazmat: boolean; hazmat_class: string | null;
  damage_status: DamageStatus; detention_expiry: string | null; current_slot_id: number | null;
}
export interface BackendContainerDetail extends BackendContainer {
  order?: BackendOrder | null; current_slot?: BackendYardSlot | null;
}
export interface BackendJockey {
  id: number; name: string; speed_factor: number; status: JockeyStatus; restrictions: string[];
}
export interface BackendMove {
  id: number; plan_id: number; container_id: number; jockey_id: number | null;
  from_slot_id: number | null; to_slot_id: number; sequence_number: number;
  estimated_duration_min: number; status: MoveStatus; reason: MoveReason; scanned_confirmed: boolean;
}
export interface BackendMoveDetail extends BackendMove {
  container: BackendContainer; to_slot: BackendYardSlot; from_slot?: BackendYardSlot | null;
}
export interface BackendPlan {
  id: number; plan_date: string; status: PlanStatus; strategy: SolveStrategy;
  generated_at: string; confirmed_at: string | null; parent_plan_id: number | null;
  solve_seconds: number | null; objective_value: number | null; best_bound: number | null;
  gap_percent: number | null; solver_status: string | null; solver_config_id: number | null;
}
export interface BackendPlanDetail extends BackendPlan { moves: BackendMove[]; }
export interface BackendDisruption {
  id: number; event_type: DisruptionType; affected_container_id: number | null;
  affected_order_id: number | null; affected_jockey_id: number | null;
  occurred_at: string; description: string; triggered_replan_id: number | null;
}
export interface BackendWeight {
  id: number; factor_name: string; weight: number; is_hard_constraint: boolean;
  transform_type: string | null; source_field: string | null;
  transform_params: Record<string, unknown> | null; null_default: number | null;
  display_order: number; updated_at: string; updated_by: string;
}
export interface BackendForecastPoint {
  day: string; projected_inbound: number; projected_occupancy: number; capacity: number; over_capacity: boolean;
}
export interface BackendForecast {
  points: BackendForecastPoint[]; first_over_capacity_day: string | null; assumptions: Record<string, unknown>;
}
export interface BackendGateTransaction {
  id: number; gate_type: "in" | "out"; carrier_ref: string | null; container_id: number | null;
  order_id: number | null; truck_license_plate: string | null; driver_ref: string | null;
  scheduled_time: string | null; actual_arrival: string | null; actual_departure: string | null;
  created_at: string;
}

// ─── API functions ───────────────────────────────────────────────────

export const backendApi = {
  // Yard
  yard: () => request<BackendYardState>("/yard"),

  // Containers
  containers: (params?: { status?: ContainerStatus }) => {
    const q = new URLSearchParams();
    if (params?.status) q.set("status", params.status);
    const qs = q.toString();
    return request<BackendContainer[]>(`/containers${qs ? `?${qs}` : ""}`);
  },
  container: (id: number) => request<BackendContainerDetail>(`/containers/${id}`),

  // Orders
  orders: () => request<BackendOrder[]>("/orders"),

  // Jockeys (= operators in old seed data)
  jockeys: () => request<BackendJockey[]>("/jockeys"),

  // Plans — THE PLANNING ENGINE
  plans: () => request<BackendPlan[]>("/plans"),
  plan: (id: number) => request<BackendPlanDetail>(`/plans/${id}`),
  generatePlan: (body: { plan_date?: string | null; strategy: SolveStrategy; time_budget_seconds?: number | null }) =>
    request<BackendPlanDetail>("/plans/generate", { method: "POST", body: JSON.stringify(body) }),
  confirmPlan: (id: number) => request<BackendPlan>(`/plans/${id}/confirm`, { method: "POST" }),
  replan: (id: number, reason: string, timeBudget?: number) =>
    request<BackendPlanDetail>(`/plans/${id}/replan`, { method: "POST", body: JSON.stringify({ reason, time_budget_seconds: timeBudget }) }),
  deletePlan: (id: number) => request<void>(`/plans/${id}`, { method: "DELETE" }),

  // Disruptions
  disruptions: () => request<BackendDisruption[]>("/disruptions"),
  createDisruption: (body: { event_type: DisruptionType; affected_container_id?: number | null; affected_jockey_id?: number | null; description: string }) =>
    request<BackendDisruption>("/disruptions", { method: "POST", body: JSON.stringify(body) }),

  // Moves (operator tablet)
  nextMove: (jockeyId: number) => request<BackendMoveDetail | null>(`/moves/next?jockey_id=${jockeyId}`),
  scanMove: (moveId: number, containerNumber: string) =>
    request<{ match: boolean; move: BackendMove }>(`/moves/${moveId}/scan`, { method: "POST", body: JSON.stringify({ scanned_container_number: containerNumber }) }),
  completeMove: (moveId: number) => request<BackendMove>(`/moves/${moveId}/complete`, { method: "POST" }),

  // Weights (priority factors)
  weights: () => request<BackendWeight[]>("/weights"),
  updateWeights: (weights: { factor_name: string; weight: number }[], updatedBy = "yard_manager") =>
    request<{ weights: BackendWeight[]; warnings: string[] }>("/weights/batch", { method: "PUT", body: JSON.stringify({ weights, updated_by: updatedBy }) }),

  // Forecast
  forecast: (months = 3, capacity?: number) => {
    const q = new URLSearchParams({ months: String(months) });
    if (capacity) q.set("capacity", String(capacity));
    return request<BackendForecast>(`/forecast?${q}`);
  },

  // Gate
  gateTransactions: (containerId?: number) => {
    const q = containerId ? `?container_id=${containerId}` : "";
    return request<BackendGateTransaction[]>(`/gate/transactions${q}`);
  },
  createGateTransaction: (body: { gate_type: "in" | "out"; container_id?: number; truck_license_plate?: string; driver_ref?: string; carrier_ref?: string }) =>
    request<BackendGateTransaction>("/gate/transactions", { method: "POST", body: JSON.stringify(body) }),

  // Seed reset (demo)
  resetSeed: (randomize = false) =>
    request<{ status: string }>(`/seed/reset?randomize=${randomize}`, { method: "POST" }),
};
