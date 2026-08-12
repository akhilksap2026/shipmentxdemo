import { useState, useEffect, useRef } from "react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { useData } from "@/lib/DataContext"
import { backendApi } from "@/lib/backend-api"
import type { BackendSolverConfig, BackendOptimizerRun, OptimizerLevel } from "@/lib/backend-api"
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ReferenceLine, ReferenceArea, ResponsiveContainer,
} from "recharts"

const FACTORS = [
  { k:"Detention urgency", w:30, scoring:"clamp(0,100,(1 − hoursToLFD/72)×100); breached ⇒ 100" },
  { k:"Detention cost gradient", w:10, scoring:"weighted by the tariff tier the container is entering" },
  { k:"Hazmat handling", w:25, scoring:"outbound-due hazmat ⇒ 100; inbound hazmat ⇒ 80" },
  { k:"Customer / order priority", w:15, scoring:"P1→100, P2→70, P3→40, P4→10" },
  { k:"Dig-out cost (penalty)", w:12, scoring:"100 − (blocking × 33); top of stack ⇒ 100" },
  { k:"Gate / appointment pressure", w:10, scoring:"truck waiting ⇒ 100; appt <60 min ⇒ 80" },
  { k:"Customs channel", w:8, scoring:"cleared ⇒ 100; awaiting inspection ⇒ 0" },
  { k:"Empty-return window", w:8, scoring:"window closing today ⇒ 100; closed ⇒ escalate" },
  { k:"Damage / quarantine", w:5, scoring:"damaged and outbound-due ⇒ 60, routed to inspection" },
  { k:"Dwell time", w:3, scoring:"min(100, daysInYard × 10)" }
]

const ADAPTERS = [
  { name:"SAP — orders & deliveries", mechanism:"IDoc DELVRY / ORDERS", state:"HEALTHY", lag:"4 s", dlq:0, recon:"0 drift", note:"Idempotent by delivery number; replay tested" },
  { name:"SAP — goods receipt", mechanism:"OData, D-03 open", state:"PENDING", lag:"—", dlq:0, recon:"n/a", note:"Blocked on D-03: does YOS own the receipt posting?" },
  { name:"Terminal 4 BACTSSA", mechanism:"REST API", state:"HEALTHY", lag:"31 s", dlq:0, recon:"0 drift", note:"Turnos and gate-out confirmations" },
  { name:"Exolgan Dock Sud", mechanism:"Portal scrape + manual", state:"DEGRADED", lag:"18 min", dlq:3, recon:"2 drift", note:"No API — manual entry is a supported path, not a failure" },
  { name:"Carrier EDI", mechanism:"COPARN / CODECO / COARRI", state:"PHASE 2", lag:"—", dlq:0, recon:"n/a", note:"Manual master fallback for free-time terms until then" },
  { name:"ARCA / broker", mechanism:"Broker system feed", state:"HEALTHY", lag:"2 min", dlq:0, recon:"0 drift", note:"Channel, authorisation, libramiento" },
  { name:"Telematics — driver ETA", mechanism:"Geofence webhook", state:"HEALTHY", lag:"9 s", dlq:0, recon:"0 drift", note:"Replaces the static 90-minute assumption" },
  { name:"Machine telemetry / RTLS", mechanism:"CAN + GPS", state:"PHASE 2", lag:"—", dlq:0, recon:"n/a", note:"Learned travel matrix waits on this" },
  { name:"Weather (wind)", mechanism:"Weather API", state:"HEALTHY", lag:"5 min", dlq:0, recon:"n/a", note:"Feeds hard constraint C11" }
]

// ── Priority factor helpers ────────────────────────────────────────────────────

const FACTOR_LABELS: Record<string, string> = {
  detention_critical:   "Detention critical (LFD breach)",
  detention_horizon:    "Detention horizon (approaching LFD)",
  appointment_pressure: "Gate / appointment pressure",
  customer_priority:    "Customer priority",
  order_priority:       "Order priority",
  dwell_age:            "Dwell age",
  reefer_power_gap:     "Reefer power gap",
  damage_flag:          "Damage / quarantine flag",
  rehandle_debt:        "Rehandle debt (dig-out cost)",
  empty_return:         "Empty-return window",
  vessel_cutoff:        "Vessel cut-off proximity",
}

const DEFAULT_WEIGHTS: Record<string, number> = {
  detention_critical:   20,
  detention_horizon:    11,
  appointment_pressure: 18,
  customer_priority:    12,
  order_priority:       9,
  dwell_age:            7,
  reefer_power_gap:     6,
  damage_flag:          5,
  rehandle_debt:        5,
  empty_return:         4,
  vessel_cutoff:        3,
}

function humanize(name: string): string {
  return FACTOR_LABELS[name] ?? name.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase())
}

type SaveStatus = "idle" | "saving" | "success" | "error"

// ── Solver config knob definitions ────────────────────────────────────────────

const SEARCH_KNOBS: Array<{ key: keyof BackendSolverConfig; label: string; step: number; min: number; max: number }> = [
  { key: "num_search_workers",     label: "Search workers",           step: 1,    min: 1,   max: 32  },
  { key: "candidate_k",            label: "Candidate K",              step: 1,    min: 1,   max: 100 },
  { key: "portfolio_variant_count",label: "Portfolio variant count",  step: 1,    min: 1,   max: 20  },
]

const PHYSICAL_KNOBS: Array<{ key: keyof BackendSolverConfig; label: string; step: number; min: number; max: number }> = [
  { key: "base_move_minutes",              label: "Base move minutes",               step: 0.5,  min: 0.5, max: 30   },
  { key: "gate_bay",                       label: "Gate bay index",                  step: 1,    min: 0,   max: 50   },
  { key: "gate_row",                       label: "Gate row index",                  step: 1,    min: 0,   max: 50   },
  { key: "max_travel_distance",            label: "Max travel distance",             step: 1,    min: 1,   max: 1000 },
  { key: "jockey_speed_distance_divisor",  label: "Jockey speed distance divisor",  step: 0.1,  min: 0.1, max: 20   },
  { key: "detention_urgency_window_days",  label: "Detention urgency window (days)", step: 1,    min: 1,   max: 30   },
  { key: "unplaced_penalty",               label: "Unplaced penalty",                step: 100,  min: 0,   max: 100000 },
  { key: "score_scaling_factor",           label: "Score scaling factor",            step: 0.01, min: 0.01,max: 10   },
  { key: "tier_multiplier",                label: "Tier multiplier",                 step: 0.1,  min: 0.1, max: 5    },
]

// ── Optimizer level presets ───────────────────────────────────────────────────

const OPTIMIZER_LEVELS: Array<{ level: OptimizerLevel; label: string; desc: string; trials: number }> = [
  { level: "low",      label: "Low",      desc: "Quick — ~5 trials, completes in seconds",   trials: 5  },
  { level: "balanced", label: "Balanced", desc: "Recommended — ~20 trials, ~1–2 minutes",    trials: 20 },
  { level: "high",     label: "High",     desc: "Thorough — ~50 trials, may take 5+ minutes", trials: 50 },
]

// ── Component ─────────────────────────────────────────────────────────────────

export default function SettingsScreen() {
  const { backendConnected, backendWeights, backendSlots, updateWeights } = useData()

  // ── Existing plan-weights tab state (unchanged) ────────────────────────────
  const [tab, setTab] = useState("plan")
  const [weights, setWeights] = useState(FACTORS.map(f=>f.w))
  const [committed, setCommitted] = useState(false)
  const [replayed, setReplayed] = useState(false)
  const [degraded, setDegraded] = useState(false)
  const [bonded, setBonded] = useState(false)
  const [dropGo, setDropGo] = useState(true)

  // ── Priority factors tab state (unchanged) ────────────────────────────────
  const [localWeights, setLocalWeights] = useState<Record<string, number>>(DEFAULT_WEIGHTS)
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle")
  const [saveWarnings, setSaveWarnings] = useState<string[]>([])

  useEffect(() => {
    if (backendWeights.length === 0) return
    const init: Record<string, number> = {}
    for (const w of backendWeights) {
      if (!w.is_hard_constraint) init[w.factor_name] = w.weight
    }
    if (Object.keys(init).length > 0) setLocalWeights(init)
  }, [backendWeights])

  const softFactors = backendWeights.filter(w => !w.is_hard_constraint)
  const hardFactors = backendWeights.filter(w => w.is_hard_constraint)
  const weightSum = softFactors.reduce((acc, f) => acc + (localWeights[f.factor_name] ?? f.weight), 0)
  const sumOk    = Math.abs(weightSum - 100) < 0.001
  const sumWarn  = weightSum >= 95 && weightSum <= 105
  const sumValid = weightSum >= 90 && weightSum <= 110
  const sumBg    = sumOk ? "#d1fae5" : sumWarn ? "#fef9c3" : "#fee2e2"
  const sumColor = sumOk ? "#065f46" : sumWarn ? "#854d0e" : "#9b1c1c"

  async function handleSave() {
    setSaveStatus("saving"); setSaveWarnings([])
    try {
      const payload = softFactors.map(f => ({ factor_name: f.factor_name, weight: localWeights[f.factor_name] ?? f.weight }))
      const result = await updateWeights(payload)
      if (result) { setSaveWarnings(result.warnings); setSaveStatus("success") }
      else setSaveStatus("error")
    } catch { setSaveStatus("error") }
    setTimeout(() => setSaveStatus(prev => prev !== "idle" ? "idle" : "idle"), 4000)
  }

  function handleReset() { setLocalWeights({ ...DEFAULT_WEIGHTS }); setSaveStatus("idle"); setSaveWarnings([]) }

  // ── Solver config tab state ────────────────────────────────────────────────
  const [solverConfig,   setSolverConfig]   = useState<BackendSolverConfig | null>(null)
  const [solverEdits,    setSolverEdits]    = useState<Partial<BackendSolverConfig>>({})
  const [solverLoading,  setSolverLoading]  = useState(false)
  const [solverSaveStatus, setSolverSaveStatus] = useState<SaveStatus>("idle")

  useEffect(() => {
    if (tab !== "solver" || !backendConnected) return
    setSolverLoading(true)
    backendApi.getActiveSolverConfig()
      .then(cfg => { setSolverConfig(cfg); setSolverEdits({}) })
      .catch(err => console.error("[Settings] solver config fetch:", err))
      .finally(() => setSolverLoading(false))
  }, [tab, backendConnected])

  function getSolverVal(key: keyof BackendSolverConfig): number {
    if (key in solverEdits) return solverEdits[key] as number
    if (solverConfig) return solverConfig[key] as number
    return 0
  }

  function setSolverVal(key: keyof BackendSolverConfig, val: number) {
    setSolverEdits(prev => ({ ...prev, [key]: val }))
  }

  async function saveSolverConfig() {
    if (!solverConfig || Object.keys(solverEdits).length === 0) return
    setSolverSaveStatus("saving")
    try {
      const updated = await backendApi.updateSolverConfig(solverEdits)
      setSolverConfig(updated)
      setSolverEdits({})
      setSolverSaveStatus("success")
    } catch (err) {
      console.error("[Settings] solver save:", err)
      setSolverSaveStatus("error")
    }
    setTimeout(() => setSolverSaveStatus("idle"), 4000)
  }

  // ── Optimizer tab state ────────────────────────────────────────────────────
  const [activeRun,      setActiveRun]      = useState<BackendOptimizerRun | null>(null)
  const [runHistory,     setRunHistory]     = useState<BackendOptimizerRun[]>([])
  const [optimizerBusy,  setOptimizerBusy]  = useState(false)
  const [optimizerError, setOptimizerError] = useState<string | null>(null)
  const [applyStatus,    setApplyStatus]    = useState<SaveStatus>("idle")
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // Load run history when tab mounts
  useEffect(() => {
    if (tab !== "optimizer" || !backendConnected) return
    backendApi.listOptimizerRuns()
      .then(runs => {
        setRunHistory(runs)
        const live = runs.find(r => r.status === "pending" || r.status === "running")
        if (live) setActiveRun(live)
      })
      .catch(err => console.error("[Settings] list optimizer runs:", err))
  }, [tab, backendConnected])

  // Poll active run
  useEffect(() => {
    if (!activeRun || (activeRun.status !== "pending" && activeRun.status !== "running")) {
      if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null }
      return
    }
    if (pollRef.current) clearInterval(pollRef.current)
    pollRef.current = setInterval(async () => {
      try {
        const updated = await backendApi.getOptimizerRun(activeRun.id)
        setActiveRun(updated)
        if (updated.status !== "pending" && updated.status !== "running") {
          clearInterval(pollRef.current!); pollRef.current = null
          setRunHistory(prev => prev.map(r => r.id === updated.id ? updated : r))
        }
      } catch (err) {
        console.error("[Settings] poll optimizer run:", err)
      }
    }, 3000)
    return () => { if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null } }
  }, [activeRun?.id, activeRun?.status])

  async function startOptimizerRun(level: OptimizerLevel) {
    setOptimizerBusy(true); setOptimizerError(null)
    try {
      const run = await backendApi.startOptimizerRun({ level })
      setActiveRun(run)
      setRunHistory(prev => [run, ...prev])
    } catch (err) {
      setOptimizerError(err instanceof Error ? err.message : "Failed to start optimizer run")
    } finally { setOptimizerBusy(false) }
  }

  async function cancelOptimizer() {
    // Cancellation: best-effort — mark locally and stop polling
    if (!activeRun) return
    setActiveRun(prev => prev ? { ...prev, status: "cancelled" } : null)
  }

  async function applyOptimizerRun(id: number) {
    setApplyStatus("saving")
    try {
      await backendApi.applyOptimizerRun(id)
      setApplyStatus("success")
      // Refresh config if on solver tab
      if (tab === "solver") {
        const cfg = await backendApi.getActiveSolverConfig()
        setSolverConfig(cfg); setSolverEdits({})
      }
    } catch (err) {
      console.error("[Settings] apply optimizer run:", err)
      setApplyStatus("error")
    }
    setTimeout(() => setApplyStatus("idle"), 4000)
  }

  // ── Capacity forecast tab state ────────────────────────────────────────────
  const [fcastMonths,    setFcastMonths]    = useState(3)
  const [fcastCapacity,  setFcastCapacity]  = useState<number>(() => Math.max(100, backendSlots.length))
  const [fcastResult,    setFcastResult]    = useState<ReturnType<typeof Object.entries> extends never ? never : import("@/lib/backend-api").BackendForecast | null>(null)
  const [fcastLoading,   setFcastLoading]   = useState(false)
  const [assumptionsOpen,setAssumptionsOpen]= useState(false)
  const [resetStatus,    setResetStatus]    = useState<"idle"|"resetting"|"done"|"error">("idle")

  // keep default capacity in sync with slot data
  useEffect(() => {
    if (backendSlots.length > 0 && fcastCapacity === 100) {
      setFcastCapacity(backendSlots.length)
    }
  }, [backendSlots.length])

  async function runForecast() {
    setFcastLoading(true)
    try {
      const f = await backendApi.forecast(fcastMonths, fcastCapacity)
      setFcastResult(f)
    } catch (err) {
      console.error("[Settings] forecast:", err)
    } finally { setFcastLoading(false) }
  }

  async function resetSeedData() {
    setResetStatus("resetting")
    try {
      await backendApi.resetSeed(true)
      setResetStatus("done")
    } catch (err) {
      console.error("[Settings] seed reset:", err)
      setResetStatus("error")
    }
    setTimeout(() => setResetStatus("idle"), 4000)
  }

  // Compute over-capacity spans for chart shading
  const overSpans: Array<{ x1: string; x2: string }> = []
  if (fcastResult) {
    let spanStart: string | null = null
    for (let i = 0; i < fcastResult.points.length; i++) {
      const p = fcastResult.points[i]
      if (p.over_capacity && !spanStart) spanStart = p.day
      if (!p.over_capacity && spanStart) {
        overSpans.push({ x1: spanStart, x2: fcastResult.points[i - 1].day })
        spanStart = null
      }
    }
    if (spanStart) overSpans.push({ x1: spanStart, x2: fcastResult.points[fcastResult.points.length - 1].day })
  }

  // ── Shared helpers (unchanged) ────────────────────────────────────────────
  const dirty = weights.some((w,i)=>w!==FACTORS[i].w)
  const stateColor = (st: string) => st==="HEALTHY"?"text-neutral-800":st==="DEGRADED"?"text-[#d9291c]":"text-neutral-400"
  const stateVariant = (st: string): "green"|"red"|"muted" => st==="HEALTHY"?"green":st==="DEGRADED"?"red":"muted"
  void stateColor

  const TABS = [
    ["plan",        "Plan weights"],
    ["priority",    "Priority factors"],
    ["integrations","Integrations"],
    ["data",        "Master data"],
    ["roles",       "Roles"],
    ["solver",      "Solver config"],
    ["optimizer",   "Optimizer"],
    ["forecast",    "Capacity forecast"],
  ]

  // ── Shared "backend unavailable" card ────────────────────────────────────
  function BackendUnavailable({ desc }: { desc: string }) {
    return (
      <div className="px-5 py-6">
        <div className="border border-neutral-300 bg-neutral-50 px-5 py-5 max-w-lg">
          <div className="font-black text-[15px] mb-1.5">Backend not available</div>
          <div className="text-[12.5px] text-neutral-600 leading-relaxed">{desc}</div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full min-h-0 overflow-auto bg-white text-neutral-900">
      {/* Header */}
      <div className="flex items-start gap-3 px-5 pt-3.5 pb-3 border-b-2 border-neutral-200 flex-none">
        <div className="flex flex-col gap-1 shrink-0">
          <span className="font-black text-[19px] tracking-tight">Settings</span>
          <span className="text-[11px] text-neutral-500">Objective weights, master data, adapters, roles, degraded mode — every operator-relevant switch in one place</span>
        </div>
        <div className="flex flex-wrap gap-y-px ml-3">
          {TABS.map(([k,label],i,arr)=>(
            <button key={k} onClick={()=>setTab(k)}
              className="text-[11.5px] px-3 py-1.5 border border-neutral-300 font-bold transition-colors"
              style={{ borderRight:i<arr.length-1?"none":undefined, background:tab===k?"#201e1d":"transparent", color:tab===k?"#fff":"#201e1d" }}>
              {label}
            </button>
          ))}
        </div>
        <div className="ml-auto text-[11px] text-neutral-500 shrink-0 pt-1">Changes are audited · commit lands on the next generation</div>
      </div>

      {/* ══════════════════════════════════════════════════════════════════
          EXISTING TABS — completely unchanged
          ══════════════════════════════════════════════════════════════════ */}

      {/* Plan weights tab */}
      {tab==="plan" && (
        <div className="grid flex-1 min-h-0 overflow-auto" style={{gridTemplateColumns:"minmax(360px,1fr) clamp(280px,28vw,380px)"}}>
          <div className="border-r-2 border-neutral-200 overflow-auto pb-4">
            <div className="px-5 pt-3 pb-1 text-[10px] tracking-widest uppercase text-neutral-500 font-bold">Retrieval priority factors</div>
            {FACTORS.map((f,i)=>(
              <div key={f.k} className="px-5 py-2.5 border-b border-neutral-200">
                <div className="flex justify-between items-baseline text-[12px]">
                  <span className="font-semibold">{f.k}</span>
                  <span className={`tabular ${weights[i]!==f.w?"text-[#d9291c]":"text-neutral-500"}`}>W {weights[i]}</span>
                </div>
                <input type="range" min={0} max={40} value={weights[i]}
                  onChange={e=>{const w=[...weights];w[i]=+e.target.value;setWeights(w);setCommitted(false)}}
                  className="w-full mt-1.5 accent-[#d9291c]" />
                <div className="text-[10.5px] text-neutral-500">{f.scoring}</div>
              </div>
            ))}
          </div>
          <div className="overflow-auto">
            <div className="px-4 pt-3 pb-1 text-[10px] tracking-widest uppercase text-neutral-500 font-bold">Stability parameters</div>
            {[
              {k:"Freeze window",v:"20 min"},{k:"Minimum improvement",v:"8 machine-min"},
              {k:"Reassign cap",v:"2 / operator / hour"},{k:"Event debounce",v:"90 s"},
              {k:"Replan cooldown",v:"10 min"},{k:"Zone ceiling",v:"85%"}
            ].map(p=>(
              <div key={p.k} className="flex justify-between gap-3 px-4 py-1.5 border-b border-neutral-200 text-[11.5px]">
                <span className="text-neutral-600">{p.k}</span><span className="font-semibold">{p.v}</span>
              </div>
            ))}
            <div className="px-4 pt-3.5 pb-1 text-[10px] tracking-widest uppercase text-neutral-500 font-bold">Impact preview</div>
            {[
              {k:"Detention exposure 72 h",current:"$8.4k",candidate:dirty?"$6.1k":"$8.4k",better:dirty},
              {k:"Predicted rehandles / move",current:"0.31",candidate:dirty?"0.36":"0.31",better:!dirty},
              {k:"Turn P50",current:"13.4′",candidate:dirty?"13.9′":"13.4′",better:!dirty},
              {k:"Moves resequenced",current:"—",candidate:dirty?"34 of 96":"—",better:false},
            ].map(s=>(
              <div key={s.k} className="px-4 py-2 border-b border-neutral-200">
                <div className="text-[11.5px] font-semibold">{s.k}</div>
                <div className="flex justify-between text-[11.5px] mt-0.5 tabular">
                  <span className="text-neutral-500">current {s.current}</span>
                  <span className={`font-bold ${dirty&&!s.better?"text-[#d9291c]":""}`}>candidate {s.candidate}</span>
                </div>
              </div>
            ))}
            <div className="px-4 py-3.5 text-[12px] leading-relaxed text-neutral-700">
              {dirty
                ? "Raising detention urgency buys $2.3k of exposure for 42 extra machine-minutes and 0.05 rehandles per move. Worth it while the tariff tier is escalating, not once the container is inside free time."
                : "Move a weight to see the trade-off priced in machine-minutes against detention exposure. Nothing is applied until you commit, and the commit lands on the next generation."}
            </div>
            <div className="px-4 pb-4">
              <Button size="sm" className="text-xs" onClick={()=>setCommitted(true)}>
                {committed?"Committed · snapshot #b70e12":dirty?"Commit to next generation":"No changes to commit"}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Priority factors tab */}
      {tab==="priority" && (
        <div className="flex-1 min-h-0 overflow-auto">
          {!backendConnected && (
            <div className="px-5 py-6">
              <div className="border border-neutral-300 bg-neutral-50 px-5 py-5 max-w-lg">
                <div className="font-black text-[15px] mb-1.5">Backend not available</div>
                <div className="text-[12.5px] text-neutral-600 leading-relaxed">
                  The planning engine is unreachable — using static weights from the seed configuration.
                  Start the backend to manage live Regime A priority factors here.
                </div>
                <div className="mt-4 flex flex-wrap gap-2.5">
                  {Object.entries(DEFAULT_WEIGHTS).map(([k, v]) => (
                    <div key={k} className="border border-neutral-300 px-2.5 py-1.5 min-w-[140px]">
                      <div className="text-[10px] text-neutral-500">{humanize(k)}</div>
                      <div className="text-[13px] font-bold tabular">{v}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
          {backendConnected && (
            <div className="grid" style={{gridTemplateColumns:"minmax(400px,1fr) clamp(260px,26vw,340px)"}}>
              <div className="border-r-2 border-neutral-200 pb-6 overflow-auto">
                <div className="px-5 pt-3 pb-1 flex items-baseline justify-between">
                  <div className="text-[10px] tracking-widest uppercase text-neutral-500 font-bold">Soft factors — weighted (0 – 50)</div>
                  <div className="text-[10px] text-neutral-400">{softFactors.length} factors</div>
                </div>
                {softFactors.map(f => {
                  const val = localWeights[f.factor_name] ?? f.weight
                  return (
                    <div key={f.factor_name} className="px-5 py-2.5 border-b border-neutral-200">
                      <div className="flex justify-between items-baseline text-[12px]">
                        <span className="font-semibold">{humanize(f.factor_name)}</span>
                        <div className="flex items-center gap-2">
                          {f.transform_type && (
                            <span className="text-[9px] px-1.5 py-0.5 bg-neutral-100 border border-neutral-300 text-neutral-500 uppercase tracking-wider font-bold">{f.transform_type}</span>
                          )}
                          <span className={`tabular font-bold w-8 text-right ${val !== f.weight ? "text-[#d9291c]" : "text-neutral-500"}`}>
                            {val % 1 === 0 ? val : val.toFixed(1)}
                          </span>
                        </div>
                      </div>
                      <input type="range" min={0} max={50} step={0.5} value={val}
                        onChange={e => setLocalWeights(prev => ({ ...prev, [f.factor_name]: +e.target.value }))}
                        className="w-full mt-1.5 accent-[#d9291c]" />
                      {f.source_field && <div className="text-[10.5px] text-neutral-400 mt-0.5">source: {f.source_field}</div>}
                    </div>
                  )
                })}
                {hardFactors.length > 0 && (
                  <>
                    <div className="px-5 pt-4 pb-1 text-[10px] tracking-widest uppercase text-neutral-500 font-bold">Hard constraints — always enforced</div>
                    {hardFactors.map(f => (
                      <div key={f.factor_name} className="px-5 py-3 border-b border-neutral-200 flex items-center gap-3">
                        <span className="text-neutral-400 text-base select-none" title="Hard constraint — locked">🔒</span>
                        <div className="flex-1">
                          <div className="text-[12px] font-semibold">{humanize(f.factor_name)}</div>
                          <div className="text-[10.5px] text-neutral-500">Hard constraint — always enforced · not configurable</div>
                        </div>
                      </div>
                    ))}
                  </>
                )}
                <div className="px-5 pt-4 pb-1">
                  <div className="flex justify-between text-[11.5px] mb-1.5">
                    <span className="font-bold">Weight total</span>
                    <span className="tabular font-black text-[15px]" style={{ color: sumColor }}>
                      {weightSum % 1 === 0 ? weightSum : weightSum.toFixed(1)}
                      <span className="text-[11px] font-normal text-neutral-400"> / 100</span>
                    </span>
                  </div>
                  <div className="h-3 bg-neutral-200 relative overflow-hidden">
                    <div className="h-3 transition-all" style={{ width: Math.min(100, (weightSum / 110) * 100).toFixed(1) + "%", background: sumBg === "#d1fae5" ? "#10b981" : sumBg === "#fef9c3" ? "#f59e0b" : "#ef4444" }} />
                  </div>
                  <div className="text-[10.5px] mt-1" style={{ color: sumColor }}>
                    {sumOk ? "✓ Weights sum to exactly 100" : sumWarn ? `Within tolerance (90–110 accepted) — ${weightSum < 100 ? (100 - weightSum).toFixed(1) + " short" : (weightSum - 100).toFixed(1) + " over"}` : `Outside acceptable range (90–110) — save disabled`}
                  </div>
                </div>
                {saveWarnings.length > 0 && (
                  <div className="mx-5 mt-3 px-3.5 py-3 bg-amber-50 border border-amber-300 text-[12px] text-amber-900 leading-relaxed">
                    <div className="font-bold mb-1">Warnings from the engine</div>
                    {saveWarnings.map((w, i) => <div key={i}>• {w}</div>)}
                  </div>
                )}
                {saveStatus === "success" && <div className="mx-5 mt-3 px-3.5 py-3 bg-emerald-50 border border-emerald-300 text-[12px] text-emerald-900 font-semibold">✓ Weights saved to the planning engine</div>}
                {saveStatus === "error"   && <div className="mx-5 mt-3 px-3.5 py-3 bg-red-50 border border-[#d9291c] text-[12px] text-[#9b1c1c] font-semibold">Save failed — check console for details</div>}
                <div className="px-5 pt-4 pb-2 flex gap-2">
                  <Button size="sm" className="text-xs" onClick={handleSave} disabled={!sumValid || saveStatus === "saving"}>{saveStatus === "saving" ? "Saving…" : "Save weights"}</Button>
                  <Button variant="secondary" size="sm" className="text-xs" onClick={handleReset}>Reset to defaults</Button>
                </div>
                <div className="px-5 pb-4 text-[10.5px] text-neutral-400 leading-relaxed">Save is disabled when the total falls outside 90–110. Changes are applied to the next plan generation.</div>
              </div>
              <div className="overflow-auto px-4 py-3">
                <div className="text-[10px] tracking-widest uppercase text-neutral-500 font-bold mb-2">Factor details</div>
                {backendWeights.map(f => (
                  <div key={f.factor_name} className="py-2 border-b border-neutral-200 text-[11.5px]">
                    <div className="font-semibold">{humanize(f.factor_name)}</div>
                    <div className="text-neutral-500 text-[10.5px] mt-0.5 space-y-0.5">
                      {f.is_hard_constraint && <div className="text-amber-700 font-bold">Hard constraint</div>}
                      {f.source_field && <div>Source: <span className="font-mono text-[10px]">{f.source_field}</span></div>}
                      {f.transform_type && <div>Transform: {f.transform_type}</div>}
                      {f.null_default != null && <div>Null default: {f.null_default}</div>}
                      <div className="text-neutral-400">Updated {new Date(f.updated_at).toLocaleDateString()} by {f.updated_by}</div>
                    </div>
                  </div>
                ))}
                {backendWeights.length === 0 && <div className="text-[12px] text-neutral-400 py-4">Loading weight configuration…</div>}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Integrations tab */}
      {tab==="integrations" && (
        <div className="flex-1 min-h-0 overflow-auto">
          <table className="w-full border-collapse text-[12px]">
            <thead>
              <tr>
                {["ADAPTER","STATE","LAG","DLQ","RECONCILE","NOTE"].map(h=>(
                  <th key={h} className="text-left py-2.5 text-[9.5px] font-bold tracking-widest uppercase text-neutral-500 border-b-2 border-neutral-200 sticky top-0 bg-white z-10"
                    style={{paddingLeft:h==="ADAPTER"?"20px":"12px",paddingRight:h==="NOTE"?"20px":"12px"}}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {ADAPTERS.map(a=>(
                <tr key={a.name} className="border-b border-neutral-200"
                  style={{ borderLeft:`3px solid ${a.state==="DEGRADED"?"#f59e0b":"transparent"}`, opacity:a.state==="PENDING"||a.state==="PHASE 2"?0.55:1 }}>
                  <td className="py-2.5 pl-5 pr-3 font-semibold">
                    {a.name}
                    {(a.state==="PENDING"||a.state==="PHASE 2") && <span className="ml-2 text-[9px] tracking-widest uppercase text-neutral-400 font-normal italic">roadmap</span>}
                    <div className="text-[11px] font-normal text-neutral-500">{a.mechanism}</div>
                  </td>
                  <td className="px-3 py-2.5"><Badge variant={stateVariant(a.state)} className="text-[10px]">{a.state}</Badge></td>
                  <td className="px-3 py-2.5 tabular">{a.lag}</td>
                  <td className={`px-3 py-2.5 tabular ${a.dlq&&!replayed?"text-[#d9291c]":""}`}>{a.name==="Exolgan Dock Sud"&&replayed?0:a.dlq}</td>
                  <td className="px-3 py-2.5 tabular">{a.recon}</td>
                  <td className="px-3 py-2.5 pr-5 text-neutral-600 leading-tight">{a.note}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="px-5 py-4 flex gap-2.5">
            <Button variant="secondary" size="sm" className="text-xs" onClick={()=>setReplayed(true)}>{replayed?"3 messages replayed · DLQ empty":"Replay dead-letter queue"}</Button>
            <Button variant="ghost" size="sm" className="text-xs" onClick={()=>setDegraded(!degraded)}>{degraded?"Degraded mode armed":"Enter degraded mode"}</Button>
          </div>
        </div>
      )}

      {/* Master data tab */}
      {tab==="data" && (
        <div className="flex-1 min-h-0 overflow-auto px-5 py-4">
          <div className="text-[10px] tracking-widest uppercase text-neutral-500 font-bold">Master data</div>
          <div className="flex flex-wrap gap-2.5 mt-2.5">
            {[
              {k:"Carriers",v:"5 · tariffs current"},{k:"Consignees",v:"7 active"},
              {k:"Depots",v:"4 · windows set"},{k:"Equipment",v:"5 · capacity charts loaded"},
              {k:"Operators",v:"5 · certs verified"},{k:"Zones & slots",v:"7 zones · 1,124 slots"},
              {k:"Holidays",v:"AR 2026 · 1 moved"},{k:"Reason codes",v:"22 controlled"}
            ].map(m=>(
              <div key={m.k} className="border border-neutral-300 px-3 py-2 min-w-[158px]">
                <div className="text-[12px] font-semibold">{m.k}</div>
                <div className="text-[11px] text-neutral-500 tabular">{m.v}</div>
              </div>
            ))}
          </div>
          <div className="mt-5 text-[10px] tracking-widest uppercase text-neutral-500 font-bold">Assumptions</div>
          {[
            {k:"Bonded (D-02)", opts:[{v:false,label:"No"},{v:true,label:"Yes"}], val:bonded, set:(v:boolean)=>setBonded(v)},
            {k:"Inbound mode (D-01)", opts:[{v:true,label:"Drop-and-go"},{v:false,label:"Live unload"}], val:dropGo, set:(v:boolean)=>setDropGo(v)},
            {k:"Degraded mode drill", opts:[{v:false,label:"Idle"},{v:true,label:"Armed"}], val:degraded, set:(v:boolean)=>setDegraded(v)},
          ].map(a=>(
            <div key={a.k} className="flex justify-between items-center py-2 border-b border-neutral-200 text-[11.5px]">
              <span>{a.k}</span>
              <div className="flex gap-1">
                {a.opts.map(o=>(
                  <button key={o.label} onClick={()=>a.set(o.v as boolean)}
                    className="text-[10.5px] px-2.5 py-1 border border-neutral-300 font-semibold transition-colors"
                    style={{background:a.val===o.v?"#201e1d":"transparent",color:a.val===o.v?"#fff":"#201e1d"}}>
                    {o.label}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Roles tab */}
      {tab==="roles" && (
        <div className="flex-1 min-h-0 overflow-auto">
          <table className="w-full border-collapse text-[12px]">
            <thead>
              <tr>
                {["PERSONA","SCREENS","USERS","NOTE"].map(h=>(
                  <th key={h} className="text-left py-2.5 text-[9.5px] font-bold tracking-widest uppercase text-neutral-500 border-b-2 border-neutral-200 sticky top-0 bg-white z-10"
                    style={{paddingLeft:h==="PERSONA"?"20px":"12px",paddingRight:h==="NOTE"?"20px":"12px"}}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {[
                {name:"Yard Manager",screens:"Yard · Plan · Tower · Gate · Operator · Settings",users:6,note:"Owns the plan and the exceptions; can override with a reason code"},
                {name:"Gate & Yard Ops",screens:"Yard · Gate",users:4,note:"Gate clerks and yard operators — front line, no config authority"},
                {name:"Operator",screens:"Operator",users:11,note:"Device-bound; single-instruction view; supervisor-approved exceptions"},
              ].map(p=>(
                <tr key={p.name} className="border-b border-neutral-200">
                  <td className="py-3 pl-5 pr-3 font-bold">{p.name}</td>
                  <td className="px-3 py-3">{p.screens}</td>
                  <td className="px-3 py-3 tabular">{p.users}</td>
                  <td className="px-3 py-3 pr-5 text-neutral-600 leading-relaxed">{p.note}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="px-5 py-4 text-[12px] leading-relaxed text-neutral-700 max-w-3xl">Three personas replaces the nine-role matrix from PRD v2.0. Every access is written to the audit log. Broker and finance views arrive after Phase 0 — they were external and reporting audiences that don't reshape day-of operations.</div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════
          NEW TAB: Solver config
          ══════════════════════════════════════════════════════════════════ */}
      {tab==="solver" && (
        <div className="flex-1 min-h-0 overflow-auto">
          {!backendConnected
            ? <BackendUnavailable desc="The planning engine is unreachable. Solver configuration is read-only when the backend is offline. Connect the engine to tune knobs here." />
            : solverLoading
            ? <div className="px-5 py-6 text-[12px] text-neutral-500">Loading solver configuration…</div>
            : !solverConfig
            ? <div className="px-5 py-6 text-[12px] text-neutral-500">No solver configuration returned from backend.</div>
            : (
              <div className="grid" style={{gridTemplateColumns:"minmax(420px,1fr) clamp(260px,28vw,360px)"}}>
                {/* Left — knob editor */}
                <div className="border-r-2 border-neutral-200 pb-6 overflow-auto">

                  {/* Version badge */}
                  <div className="px-5 pt-3.5 pb-3 flex items-center gap-3 border-b border-neutral-100">
                    <div>
                      <div className="text-[10px] tracking-widest uppercase text-neutral-500 font-bold">Active config</div>
                      <div className="font-black text-[17px] leading-snug">v{solverConfig.version}</div>
                    </div>
                    <div className="px-2.5 py-1 border border-neutral-300 text-[11px] font-semibold uppercase tracking-wider text-neutral-600">
                      {solverConfig.source}
                    </div>
                    <div className="text-[10.5px] text-neutral-400 ml-1">
                      Updated {new Date(solverConfig.updated_at).toLocaleDateString()}
                    </div>
                  </div>

                  {/* Search parameters */}
                  <div className="px-5 pt-4 pb-1 text-[10px] tracking-widest uppercase text-neutral-500 font-bold">Search parameters</div>
                  {SEARCH_KNOBS.map(({ key, label, step, min, max }) => {
                    const val = getSolverVal(key)
                    const dirty = key in solverEdits
                    return (
                      <div key={key} className="px-5 py-2.5 border-b border-neutral-200">
                        <div className="flex justify-between items-baseline text-[12px]">
                          <span className="font-semibold">{label}</span>
                          <span className={`tabular font-bold ${dirty ? "text-[#d9291c]" : "text-neutral-500"}`}>{val}</span>
                        </div>
                        <input type="range" min={min} max={max} step={step} value={val}
                          onChange={e => setSolverVal(key, +e.target.value)}
                          className="w-full mt-1.5 accent-[#d9291c]" />
                        <div className="flex justify-between text-[9.5px] text-neutral-400">
                          <span>{min}</span>
                          <span className="font-mono">{key}</span>
                          <span>{max}</span>
                        </div>
                      </div>
                    )
                  })}

                  {/* Physical calibration */}
                  <div className="px-5 pt-4 pb-1 text-[10px] tracking-widest uppercase text-neutral-500 font-bold">Physical calibration</div>
                  {PHYSICAL_KNOBS.map(({ key, label, step, min, max }) => {
                    const val = getSolverVal(key)
                    const dirty = key in solverEdits
                    return (
                      <div key={key} className="px-5 py-2.5 border-b border-neutral-200">
                        <div className="flex justify-between items-baseline text-[12px]">
                          <span className="font-semibold">{label}</span>
                          <span className={`tabular font-bold ${dirty ? "text-[#d9291c]" : "text-neutral-500"}`}>
                            {Number.isInteger(val) ? val : Number(val).toFixed(2)}
                          </span>
                        </div>
                        <input type="range" min={min} max={max} step={step} value={val}
                          onChange={e => setSolverVal(key, +e.target.value)}
                          className="w-full mt-1.5 accent-[#d9291c]" />
                        <div className="flex justify-between text-[9.5px] text-neutral-400">
                          <span>{min}</span>
                          <span className="font-mono">{key}</span>
                          <span>{max}</span>
                        </div>
                      </div>
                    )
                  })}

                  {/* Status & actions */}
                  {solverSaveStatus === "success" && <div className="mx-5 mt-3 px-3.5 py-3 bg-emerald-50 border border-emerald-300 text-[12px] text-emerald-900 font-semibold">✓ Solver config saved (v{solverConfig.version})</div>}
                  {solverSaveStatus === "error"   && <div className="mx-5 mt-3 px-3.5 py-3 bg-red-50 border border-[#d9291c] text-[12px] text-[#9b1c1c] font-semibold">Save failed — check console for details</div>}

                  <div className="px-5 pt-4 pb-2 flex gap-2">
                    <Button size="sm" className="text-xs" onClick={saveSolverConfig}
                      disabled={Object.keys(solverEdits).length === 0 || solverSaveStatus === "saving"}>
                      {solverSaveStatus === "saving" ? "Saving…" : `Save ${Object.keys(solverEdits).length > 0 ? `(${Object.keys(solverEdits).length} change${Object.keys(solverEdits).length > 1 ? "s" : ""})` : ""}`}
                    </Button>
                    <Button variant="secondary" size="sm" className="text-xs"
                      disabled={Object.keys(solverEdits).length === 0}
                      onClick={() => setSolverEdits({})}>
                      Discard changes
                    </Button>
                  </div>
                  <div className="px-5 pb-4 text-[10.5px] text-neutral-400 leading-relaxed">Changes apply to the next plan generation. Use the Optimizer tab to auto-tune these knobs.</div>
                </div>

                {/* Right — summary */}
                <div className="overflow-auto px-4 py-3">
                  <div className="text-[10px] tracking-widests uppercase text-neutral-500 font-bold mb-3">Current values</div>
                  {([...SEARCH_KNOBS, ...PHYSICAL_KNOBS]).map(({ key, label }) => {
                    const val = getSolverVal(key)
                    const edited = key in solverEdits
                    return (
                      <div key={key} className="py-2 border-b border-neutral-200 flex justify-between gap-3 text-[11.5px]">
                        <span className={`text-neutral-600 ${edited ? "font-semibold" : ""}`}>{label}</span>
                        <span className={`tabular font-semibold ${edited ? "text-[#d9291c]" : ""}`}>
                          {Number.isInteger(val) ? val : Number(val).toFixed(3)}
                          {edited && <span className="ml-1 text-[9px] text-[#d9291c] font-bold">EDITED</span>}
                        </span>
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          }
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════
          NEW TAB: Optimizer
          ══════════════════════════════════════════════════════════════════ */}
      {tab==="optimizer" && (
        <div className="flex-1 min-h-0 overflow-auto">
          {!backendConnected
            ? <BackendUnavailable desc="The planning engine is unreachable. Connect the backend to run optimizer trials." />
            : (
              <div className="grid" style={{gridTemplateColumns:"minmax(380px,1fr) minmax(320px,1fr)"}}>

                {/* Left — start + active run */}
                <div className="border-r-2 border-neutral-200 overflow-auto pb-6">

                  {/* Start a run */}
                  <div className="px-5 pt-4 pb-1 text-[10px] tracking-widests uppercase text-neutral-500 font-bold">Start optimization</div>
                  <div className="px-5 pb-4 flex flex-col gap-2">
                    {OPTIMIZER_LEVELS.map(({ level, label, desc, trials }) => (
                      <button key={level} onClick={() => startOptimizerRun(level)}
                        disabled={optimizerBusy || (!!activeRun && (activeRun.status === "pending" || activeRun.status === "running"))}
                        className="text-left px-4 py-3 border border-neutral-300 hover:border-neutral-500 hover:bg-neutral-50 transition-colors disabled:opacity-40 disabled:cursor-not-allowed">
                        <div className="flex justify-between items-baseline">
                          <span className="font-bold text-[13px]">{label}</span>
                          <span className="text-[10px] text-neutral-400">{trials} trials</span>
                        </div>
                        <div className="text-[11.5px] text-neutral-600 mt-0.5">{desc}</div>
                      </button>
                    ))}
                  </div>
                  {optimizerError && (
                    <div className="mx-5 mb-3 px-3.5 py-3 bg-red-50 border border-[#d9291c] text-[12px] text-[#9b1c1c]">{optimizerError}</div>
                  )}

                  {/* Active run */}
                  {activeRun && (
                    <div className="px-5">
                      <div className="text-[10px] tracking-widests uppercase text-neutral-500 font-bold mb-2">Active run</div>
                      <div className="border border-neutral-300 px-4 py-4">
                        <div className="flex justify-between items-baseline mb-1">
                          <span className="font-black text-[15px]">Run #{activeRun.id} · {activeRun.level}</span>
                          <span className={`text-[11px] font-bold uppercase tracking-wider ${activeRun.status === "running" ? "text-amber-700" : activeRun.status === "completed" ? "text-emerald-700" : activeRun.status === "failed" ? "text-[#d9291c]" : "text-neutral-500"}`}>
                            {activeRun.status}
                          </span>
                        </div>

                        {/* Trial progress */}
                        {(activeRun.status === "running" || activeRun.status === "completed") && (
                          <>
                            <div className="text-[12px] text-neutral-600 mb-2">
                              Trial {activeRun.completed_trials} of {activeRun.total_trials}
                              {activeRun.best_score != null && <> · best score <strong>{activeRun.best_score.toFixed(2)}</strong></>}
                            </div>
                            <div className="relative h-2 bg-neutral-100">
                              <div className="absolute left-0 top-0 bottom-0 bg-neutral-700 transition-all"
                                style={{ width: activeRun.total_trials > 0 ? (activeRun.completed_trials / activeRun.total_trials * 100).toFixed(1) + "%" : "0%" }} />
                            </div>
                          </>
                        )}
                        {activeRun.status === "pending" && (
                          <div className="text-[12px] text-neutral-500 mt-1">Queued — waiting for engine capacity…</div>
                        )}

                        {/* Completed */}
                        {activeRun.status === "completed" && activeRun.best_knobs && (
                          <div className="mt-3">
                            <div className="text-[10.5px] text-neutral-500 font-bold mb-1.5">Best knobs found</div>
                            <div className="bg-neutral-50 border border-neutral-200 px-3 py-2 max-h-32 overflow-auto">
                              {Object.entries(activeRun.best_knobs).map(([k, v]) => (
                                <div key={k} className="flex justify-between text-[11px] py-0.5">
                                  <span className="text-neutral-600 font-mono">{k}</span>
                                  <span className="tabular font-semibold">{typeof v === "number" ? (Number.isInteger(v) ? v : Number(v).toFixed(3)) : String(v)}</span>
                                </div>
                              ))}
                            </div>
                            {applyStatus === "success" && <div className="mt-2 px-3 py-2 bg-emerald-50 border border-emerald-300 text-[12px] text-emerald-900 font-semibold">✓ Applied to live solver config</div>}
                            {applyStatus === "error"   && <div className="mt-2 px-3 py-2 bg-red-50 border border-[#d9291c] text-[12px] text-[#9b1c1c]">Apply failed — check console</div>}
                            <div className="mt-2 flex gap-2">
                              <Button size="sm" className="text-xs" onClick={() => applyOptimizerRun(activeRun.id)} disabled={applyStatus === "saving"}>
                                {applyStatus === "saving" ? "Applying…" : "Apply to live config"}
                              </Button>
                            </div>
                          </div>
                        )}

                        {/* Cancel */}
                        {(activeRun.status === "pending" || activeRun.status === "running") && (
                          <div className="mt-3">
                            <Button variant="secondary" size="sm" className="text-xs" onClick={cancelOptimizer}>Cancel run</Button>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>

                {/* Right — run history */}
                <div className="overflow-auto">
                  <div className="px-5 pt-4 pb-1 text-[10px] tracking-widests uppercase text-neutral-500 font-bold">Run history</div>
                  {runHistory.length === 0 ? (
                    <div className="px-5 py-4 text-[12px] text-neutral-500">No optimizer runs yet. Start one on the left.</div>
                  ) : (
                    <table className="w-full border-collapse text-[11.5px]">
                      <thead>
                        <tr>
                          {["ID","Level","Status","Trials","Best score","Applied"].map(h => (
                            <th key={h} className="text-left py-2 px-3 text-[9.5px] font-bold tracking-widest uppercase text-neutral-500 border-b-2 border-neutral-200 sticky top-0 bg-white"
                              style={{paddingLeft:h==="ID"?"20px":undefined}}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {runHistory.map(r => (
                          <tr key={r.id} className="border-b border-neutral-200 hover:bg-neutral-50">
                            <td className="py-2 pl-5 pr-3 font-mono font-bold">#{r.id}</td>
                            <td className="px-3 py-2 capitalize">{r.level}</td>
                            <td className="px-3 py-2">
                              <span className={`font-semibold ${r.status === "completed" ? "text-emerald-700" : r.status === "failed" || r.status === "cancelled" ? "text-[#d9291c]" : "text-amber-700"}`}>
                                {r.status}
                              </span>
                            </td>
                            <td className="px-3 py-2 tabular">{r.completed_trials} / {r.total_trials}</td>
                            <td className="px-3 py-2 tabular">{r.best_score != null ? r.best_score.toFixed(2) : "—"}</td>
                            <td className="px-3 py-2 text-neutral-500">{r.applied_at ? new Date(r.applied_at).toLocaleDateString() : "—"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              </div>
            )
          }
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════
          NEW TAB: Capacity forecast
          ══════════════════════════════════════════════════════════════════ */}
      {tab==="forecast" && (
        <div className="flex-1 min-h-0 overflow-auto px-5 py-4">
          {!backendConnected
            ? <BackendUnavailable desc="The planning engine is unreachable. Connect the backend to run capacity forecasts." />
            : (
              <>
                {/* Controls */}
                <div className="flex flex-wrap items-end gap-6 mb-4 border-b border-neutral-200 pb-4">
                  <div className="flex flex-col gap-1.5">
                    <label className="text-[10px] tracking-widests uppercase text-neutral-500 font-bold">Forecast horizon</label>
                    <div className="flex items-center gap-3">
                      <input type="range" min={1} max={12} step={1} value={fcastMonths}
                        onChange={e => setFcastMonths(+e.target.value)}
                        className="w-40 accent-[#d9291c]" />
                      <span className="font-bold text-[14px] tabular w-16">{fcastMonths} month{fcastMonths !== 1 ? "s" : ""}</span>
                    </div>
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <label className="text-[10px] tracking-widests uppercase text-neutral-500 font-bold">Capacity (slots)</label>
                    <input
                      type="number" min={1} max={99999} step={1} value={fcastCapacity}
                      onChange={e => setFcastCapacity(+e.target.value)}
                      className="w-32 h-8 border border-neutral-300 px-2 text-[12px] tabular font-semibold"
                    />
                  </div>
                  <Button size="sm" className="text-xs mb-0.5" onClick={runForecast} disabled={fcastLoading}>
                    {fcastLoading ? "Running…" : "Run forecast"}
                  </Button>
                </div>

                {/* Chart */}
                {!fcastResult && !fcastLoading && (
                  <div className="border border-neutral-200 bg-neutral-50 px-6 py-10 text-center text-[12px] text-neutral-500 mb-4">
                    Set the horizon and capacity above, then click "Run forecast" to see the occupancy projection.
                  </div>
                )}
                {fcastLoading && (
                  <div className="border border-neutral-200 bg-neutral-50 px-6 py-10 text-center text-[12px] text-neutral-500 mb-4">
                    Running forecast…
                  </div>
                )}
                {fcastResult && !fcastLoading && (
                  <div className="mb-4">
                    {/* First-over-capacity callout */}
                    {fcastResult.first_over_capacity_day && (
                      <div className="mb-3 px-4 py-2.5 bg-amber-50 border border-amber-300 text-[12px] text-amber-900 flex items-baseline gap-3">
                        <span className="font-bold">First over-capacity day:</span>
                        <span className="tabular font-semibold">{fcastResult.first_over_capacity_day}</span>
                      </div>
                    )}
                    {!fcastResult.first_over_capacity_day && (
                      <div className="mb-3 px-4 py-2.5 bg-emerald-50 border border-emerald-300 text-[12px] text-emerald-900 font-semibold">
                        ✓ No over-capacity days in the forecast horizon
                      </div>
                    )}

                    {/* Line chart */}
                    <div className="border border-neutral-200" style={{ height: 280 }}>
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={fcastResult.points} margin={{ top: 16, right: 24, bottom: 8, left: 8 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                          <XAxis
                            dataKey="day"
                            tick={{ fontSize: 9, fill: "#9ca3af" }}
                            tickFormatter={d => d.slice(5)}
                            interval={Math.floor(fcastResult.points.length / 8)}
                          />
                          <YAxis tick={{ fontSize: 9, fill: "#9ca3af" }} />
                          <Tooltip
                            contentStyle={{ fontSize: 11, borderColor: "#d1d5db" }}
                            formatter={(val, name) => [
                              val,
                              name === "projected_occupancy" ? "Projected occupancy" : "Capacity"
                            ]}
                          />
                          {/* Over-capacity shading */}
                          {overSpans.map(({ x1, x2 }, i) => (
                            <ReferenceArea key={i} x1={x1} x2={x2} fill="#fee2e2" fillOpacity={0.5} />
                          ))}
                          {/* First-over-capacity vertical line */}
                          {fcastResult.first_over_capacity_day && (
                            <ReferenceLine
                              x={fcastResult.first_over_capacity_day}
                              stroke="#d9291c"
                              strokeDasharray="4 3"
                              label={{ value: "First breach", position: "top", fontSize: 9, fill: "#d9291c" }}
                            />
                          )}
                          <Line
                            type="monotone"
                            dataKey="projected_occupancy"
                            stroke="#2563eb"
                            strokeWidth={2}
                            dot={false}
                            name="projected_occupancy"
                          />
                          <Line
                            type="monotone"
                            dataKey="capacity"
                            stroke="#d9291c"
                            strokeWidth={1.5}
                            strokeDasharray="5 3"
                            dot={false}
                            name="capacity"
                          />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                    <div className="flex gap-5 mt-2 text-[11px] text-neutral-600">
                      <span className="flex items-center gap-1.5"><span className="w-6 h-0.5 bg-blue-600 inline-block" /> Projected occupancy</span>
                      <span className="flex items-center gap-1.5"><span className="w-6 h-0.5 bg-[#d9291c] border-t border-dashed border-[#d9291c] inline-block" /> Capacity limit</span>
                      <span className="flex items-center gap-1.5"><span className="w-4 h-4 bg-red-100 border border-red-300 inline-block" /> Over capacity</span>
                    </div>

                    {/* Collapsible assumptions */}
                    <div className="mt-4 border border-neutral-200">
                      <button
                        onClick={() => setAssumptionsOpen(v => !v)}
                        className="w-full text-left px-4 py-2.5 text-[11.5px] font-semibold flex justify-between items-center hover:bg-neutral-50 transition-colors"
                      >
                        <span>Forecast assumptions</span>
                        <span className="text-neutral-400 text-[12px]">{assumptionsOpen ? "▲" : "▼"}</span>
                      </button>
                      {assumptionsOpen && (
                        <div className="px-4 pb-4 border-t border-neutral-200">
                          {Object.entries(fcastResult.assumptions).map(([k, v]) => (
                            <div key={k} className="flex justify-between py-1.5 border-b border-neutral-100 text-[11.5px]">
                              <span className="text-neutral-600 font-mono text-[10.5px]">{k}</span>
                              <span className="tabular font-semibold">{JSON.stringify(v)}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Reset seed data */}
                <div className="border-t border-neutral-200 pt-4 mt-2">
                  <div className="text-[10px] tracking-widests uppercase text-neutral-500 font-bold mb-2">Demo data</div>
                  <div className="flex items-center gap-4">
                    <Button variant="secondary" size="sm" className="text-xs" onClick={resetSeedData} disabled={resetStatus === "resetting"}>
                      {resetStatus === "resetting" ? "Resetting…" : "Reset demo data"}
                    </Button>
                    {resetStatus === "done"  && <span className="text-[12px] text-emerald-700 font-semibold">✓ Seed data reset — refresh to see changes</span>}
                    {resetStatus === "error" && <span className="text-[12px] text-[#9b1c1c] font-semibold">Reset failed — check console</span>}
                    <span className="text-[11.5px] text-neutral-500">Calls <code className="font-mono text-[10.5px]">/seed/reset?randomize=true</code> and refreshes all DataContext slices</span>
                  </div>
                </div>
              </>
            )
          }
        </div>
      )}
    </div>
  )
}
