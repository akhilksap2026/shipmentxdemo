import { useState, useEffect, useRef } from "react"
import { Button } from "@/components/ui/button"
import { useData } from "@/lib/DataContext"
import { backendApi } from "@/lib/backend-api"
import type { BackendOptimizerRun } from "@/lib/backend-api"
import BackendUnavailable from "./BackendUnavailable"

type SaveStatus = "idle" | "saving" | "success" | "error"

const OPTIMIZER_LEVELS: Array<{ label: string; desc: string; trials: number }> = [
  { label: "Quick",       desc: "~5 trials — completes in seconds",        trials: 5  },
  { label: "Balanced",    desc: "~20 trials — recommended, ~1–2 minutes",  trials: 20 },
  { label: "Thorough",    desc: "~50 trials — may take 5+ minutes",        trials: 50 },
]

export default function OptimizerRunsTab() {
  const { backendConnected } = useData()

  const [activeRun,      setActiveRun]      = useState<BackendOptimizerRun | null>(null)
  const [runHistory,     setRunHistory]     = useState<BackendOptimizerRun[]>([])
  const [optimizerBusy,  setOptimizerBusy]  = useState(false)
  const [optimizerError, setOptimizerError] = useState<string | null>(null)
  const [applyStatus,    setApplyStatus]    = useState<SaveStatus>("idle")
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // Load run history when tab mounts
  useEffect(() => {
    if (!backendConnected) return
    backendApi.listOptimizerRuns()
      .then(runs => {
        setRunHistory(runs)
        const live = runs.find(r => r.status === "pending" || r.status === "running")
        if (live) setActiveRun(live)
      })
      .catch(err => console.error("[Settings] list optimizer runs:", err))
  }, [backendConnected])

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

  async function startOptimizerRun(trials: number) {
    setOptimizerBusy(true); setOptimizerError(null)
    try {
      const run = await backendApi.startOptimizerRun({ total_trials: trials })
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
    } catch (err) {
      console.error("[Settings] apply optimizer run:", err)
      setApplyStatus("error")
    }
    setTimeout(() => setApplyStatus("idle"), 4000)
  }

  return (
    <div className="flex-1 min-h-0 overflow-auto">
      {!backendConnected
        ? <BackendUnavailable desc="The planning engine is unreachable. Connect the backend to run optimizer trials." />
        : (
          <div className="grid" style={{gridTemplateColumns:"minmax(380px,1fr) minmax(320px,1fr)"}}>

            {/* Left — start + active run */}
            <div className="border-r-2 border-neutral-200 overflow-auto pb-6">

              {/* Start a run */}
              <div className="px-5 pt-4 pb-1 ds-label text-neutral-500 font-bold">Start optimization</div>
              <div className="px-5 pb-4 flex flex-col gap-2">
                {OPTIMIZER_LEVELS.map(({ label, desc, trials }) => (
                  <button key={label} onClick={() => startOptimizerRun(trials)}
                    disabled={optimizerBusy || (!!activeRun && (activeRun.status === "pending" || activeRun.status === "running"))}
                    className="text-left px-4 py-3 border border-neutral-300 hover:border-neutral-500 hover:bg-[#f9fafb] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                    style={{ borderRadius: 5 }}>
                    <div className="flex justify-between items-baseline">
                      <span className="font-bold text-[13px]">{label}</span>
                      <span className="font-mono text-[10px] text-neutral-400"><span className="font-mono">{trials}</span> trials</span>
                    </div>
                    <div className="text-[11.5px] text-neutral-600 mt-0">{desc}</div>
                  </button>
                ))}
              </div>
              {optimizerError && (
                <div className="mx-5 mb-3 px-3 py-3 border text-[12px]" style={{ background: "#fef2f2", borderColor: "#dc2626", color: "#dc2626" }}>{optimizerError}</div>
              )}

              {/* Active run — optimizer run card */}
              {activeRun && (
                <div className="px-5">
                  <div className="ds-label text-neutral-500 font-bold mb-2">Active run</div>
                  <div className="border border-neutral-300 px-4 py-4 bg-white" style={{ borderRadius: 5 }}>
                    <div className="flex justify-between items-baseline mb-1">
                      <span className="font-semibold text-[15px]">
                        Run <span className="font-mono">#{activeRun.id}</span>
                      </span>
                      <span className={`font-mono text-[11px] font-bold uppercase tracking-wider ${
                        activeRun.status === "running"   ? "text-[#d97706]"  :
                        activeRun.status === "completed" ? "text-[#059669]"  :
                        activeRun.status === "failed"    ? "text-[#dc2626]"  :
                        "text-neutral-500"
                      }`}>
                        {activeRun.status}
                      </span>
                    </div>

                    {/* Trial progress */}
                    {(activeRun.status === "running" || activeRun.status === "completed") && (
                      <div className="text-[12px] text-neutral-600 mb-1">
                        <span className="font-mono">{activeRun.total_trials}</span> trials planned
                        {activeRun.best_score != null && <> · best score <strong className="font-mono">{activeRun.best_score.toFixed(2)}</strong></>}
                      </div>
                    )}
                    {activeRun.status === "pending" && (
                      <div className="text-[12px] text-neutral-500 mt-1">Queued — waiting for engine capacity…</div>
                    )}

                    {/* Completed */}
                    {activeRun.status === "completed" && activeRun.best_knobs && (
                      <div className="mt-3">
                        <div className="ds-label text-neutral-500 font-bold mb-1">Best knobs found</div>
                        <div className="bg-[#f9fafb] border border-neutral-200 px-3 py-2 max-h-32 overflow-auto">
                          {Object.entries(activeRun.best_knobs).map(([k, v]) => (
                            <div key={k} className="flex justify-between text-[11px] py-0">
                              <span className="text-neutral-600 font-mono">{k}</span>
                              <span className="font-mono font-semibold">{typeof v === "number" ? (Number.isInteger(v) ? v : Number(v).toFixed(3)) : String(v)}</span>
                            </div>
                          ))}
                        </div>
                        {applyStatus === "success" && (
                          <div className="mt-2 px-3 py-2 border text-[12px] font-semibold" style={{ background: "#f0fdf4", borderColor: "#059669", color: "#059669" }}>✓ Applied to live solver config</div>
                        )}
                        {applyStatus === "error" && (
                          <div className="mt-2 px-3 py-2 border text-[12px]" style={{ background: "#fef2f2", borderColor: "#dc2626", color: "#dc2626" }}>Apply failed — check console</div>
                        )}
                        <div className="mt-2 flex gap-2">
                          <Button size="sm" className="text-xs" style={{ borderRadius: 5 }} onClick={() => applyOptimizerRun(activeRun.id)} disabled={applyStatus === "saving"}>
                            {applyStatus === "saving" ? "Applying…" : "Apply to live config"}
                          </Button>
                        </div>
                      </div>
                    )}

                    {/* Cancel */}
                    {(activeRun.status === "pending" || activeRun.status === "running") && (
                      <div className="mt-3">
                        <Button variant="secondary" size="sm" className="text-xs" style={{ borderRadius: 5 }} onClick={cancelOptimizer}>Cancel run</Button>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Right — run history */}
            <div className="overflow-auto">
              <div className="px-5 pt-4 pb-1 ds-label text-neutral-500 font-bold">Run history</div>
              {runHistory.length === 0 ? (
                <div className="px-5 py-4 text-[12px] text-neutral-500">No optimizer runs yet. Start one on the left.</div>
              ) : (
                <table className="w-full border-collapse text-[11.5px]">
                  <thead>
                    <tr>
                      {["ID","Status","Trials","Best score","Applied"].map(h => (
                        <th key={h} className="ds-th text-left"
                          style={{paddingLeft:h==="ID"?"20px":undefined}}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {runHistory.map(r => (
                      <tr key={r.id} className="border-b border-[#f3f4f6] hover:bg-[#f9fafb]" style={{ minHeight: 38 }}>
                        <td className="py-2 pl-5 pr-3 font-mono font-bold">#{r.id}</td>
                        <td className="px-3 py-2">
                          <span className={`font-mono font-semibold ${
                            r.status === "completed"                              ? "text-[#059669]" :
                            r.status === "failed" || r.status === "cancelled"    ? "text-[#dc2626]" :
                            "text-[#d97706]"
                          }`}>
                            {r.status}
                          </span>
                        </td>
                        <td className="px-3 py-2 font-mono"><span className="font-mono">{r.total_trials}</span></td>
                        <td className="px-3 py-2 font-mono">{r.best_score != null ? r.best_score.toFixed(2) : "—"}</td>
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
  )
}
