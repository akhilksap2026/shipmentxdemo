import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { useData } from "@/lib/DataContext"
import { backendApi } from "@/lib/backend-api"
import type { BackendSolverConfig } from "@/lib/backend-api"
import BackendUnavailable from "./BackendUnavailable"

type SaveStatus = "idle" | "saving" | "success" | "error"

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

export default function SolverConfigTab() {
  const { backendConnected } = useData()

  const [solverConfig,     setSolverConfig]     = useState<BackendSolverConfig | null>(null)
  const [solverEdits,      setSolverEdits]      = useState<Partial<BackendSolverConfig>>({})
  const [solverLoading,    setSolverLoading]    = useState(false)
  const [solverSaveStatus, setSolverSaveStatus] = useState<SaveStatus>("idle")

  useEffect(() => {
    if (!backendConnected) return
    setSolverLoading(true)
    backendApi.getActiveSolverConfig()
      .then(cfg => { setSolverConfig(cfg); setSolverEdits({}) })
      .catch(err => console.error("[Settings] solver config fetch:", err))
      .finally(() => setSolverLoading(false))
  }, [backendConnected])

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

  return (
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
              <div className="px-5 pt-3 pb-3 flex items-center gap-3 border-b border-neutral-100">
                <div>
                  <div className="ds-label text-neutral-500 font-bold">Active config</div>
                  <div className="font-mono font-semibold leading-none" style={{ fontSize: 26 }}>v<span className="font-mono">{solverConfig.version}</span></div>
                </div>
                <div className="px-2 py-1 border border-neutral-300 text-[11px] font-semibold uppercase tracking-wider text-neutral-600" style={{ borderRadius: 5 }}>
                  {solverConfig.source}
                </div>
                <div className="text-[10.5px] text-neutral-400 ml-1">
                  Created {new Date(solverConfig.created_at).toLocaleDateString()}
                </div>
              </div>

              {/* Search parameters */}
              <div className="px-5 pt-4 pb-1 ds-label text-neutral-500 font-bold">Search parameters</div>
              {SEARCH_KNOBS.map(({ key, label, step, min, max }) => {
                const val = getSolverVal(key)
                const dirty = key in solverEdits
                return (
                  <div key={key} className="px-5 py-2 border-b border-[#f3f4f6]" style={{ minHeight: 38 }}>
                    <div className="flex justify-between items-baseline text-[12px]">
                      <span className="font-semibold">{label}</span>
                      <span className={`font-mono font-bold ${dirty ? "text-[#dc2626]" : "text-neutral-500"}`}>{val}</span>
                    </div>
                    <input type="range" min={min} max={max} step={step} value={val}
                      onChange={e => setSolverVal(key, +e.target.value)}
                      className="w-full mt-1 accent-[#dc2626]" />
                    <div className="flex justify-between text-[9.5px] text-neutral-400">
                      <span className="font-mono">{min}</span>
                      <span className="font-mono">{key}</span>
                      <span className="font-mono">{max}</span>
                    </div>
                  </div>
                )
              })}

              {/* Physical calibration */}
              <div className="px-5 pt-4 pb-1 ds-label text-neutral-500 font-bold">Physical calibration</div>
              {PHYSICAL_KNOBS.map(({ key, label, step, min, max }) => {
                const val = getSolverVal(key)
                const dirty = key in solverEdits
                return (
                  <div key={key} className="px-5 py-2 border-b border-[#f3f4f6]" style={{ minHeight: 38 }}>
                    <div className="flex justify-between items-baseline text-[12px]">
                      <span className="font-semibold">{label}</span>
                      <span className={`font-mono font-bold ${dirty ? "text-[#dc2626]" : "text-neutral-500"}`}>
                        {Number.isInteger(val) ? val : Number(val).toFixed(2)}
                      </span>
                    </div>
                    <input type="range" min={min} max={max} step={step} value={val}
                      onChange={e => setSolverVal(key, +e.target.value)}
                      className="w-full mt-1 accent-[#dc2626]" />
                    <div className="flex justify-between text-[9.5px] text-neutral-400">
                      <span className="font-mono">{min}</span>
                      <span className="font-mono">{key}</span>
                      <span className="font-mono">{max}</span>
                    </div>
                  </div>
                )
              })}

              {/* Status & actions */}
              {solverSaveStatus === "success" && (
                <div className="mx-5 mt-3 px-3 py-3 border text-[12px] font-semibold" style={{ background: "#f0fdf4", borderColor: "#059669", color: "#059669" }}>
                  ✓ Solver config saved (v<span className="font-mono">{solverConfig.version}</span>)
                </div>
              )}
              {solverSaveStatus === "error" && (
                <div className="mx-5 mt-3 px-3 py-3 border text-[12px] font-semibold" style={{ background: "#fef2f2", borderColor: "#dc2626", color: "#dc2626" }}>
                  Save failed — check console for details
                </div>
              )}

              <div className="px-5 pt-4 pb-2 flex gap-2">
                <Button size="sm" className="text-xs" style={{ borderRadius: 5 }} onClick={saveSolverConfig}
                  disabled={Object.keys(solverEdits).length === 0 || solverSaveStatus === "saving"}>
                  {solverSaveStatus === "saving" ? "Saving…" : `Save ${Object.keys(solverEdits).length > 0 ? `(${Object.keys(solverEdits).length} change${Object.keys(solverEdits).length > 1 ? "s" : ""})` : ""}`}
                </Button>
                <Button variant="secondary" size="sm" className="text-xs" style={{ borderRadius: 5 }}
                  disabled={Object.keys(solverEdits).length === 0}
                  onClick={() => setSolverEdits({})}>
                  Discard changes
                </Button>
              </div>
              <div className="px-5 pb-4 text-[10.5px] text-neutral-400 leading-relaxed">Changes apply to the next plan generation. Use the Optimizer tab to auto-tune these knobs.</div>
            </div>

            {/* Right — summary */}
            <div className="overflow-auto px-4 py-3">
              <div className="ds-label text-neutral-500 font-bold mb-3">Current values</div>
              {([...SEARCH_KNOBS, ...PHYSICAL_KNOBS]).map(({ key, label }) => {
                const val = getSolverVal(key)
                const edited = key in solverEdits
                return (
                  <div key={key} className="py-2 border-b border-[#f3f4f6] flex justify-between gap-3 text-[11.5px]">
                    <span className={`text-neutral-600 ${edited ? "font-semibold" : ""}`}>{label}</span>
                    <span className={`font-mono font-semibold ${edited ? "text-[#dc2626]" : ""}`}>
                      {Number.isInteger(val) ? val : Number(val).toFixed(3)}
                      {edited && <span className="ml-1 text-[9px] text-[#dc2626] font-bold">EDITED</span>}
                    </span>
                  </div>
                )
              })}
            </div>
          </div>
        )
      }
    </div>
  )
}
