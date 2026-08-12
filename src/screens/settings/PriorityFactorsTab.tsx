import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { useData } from "@/lib/DataContext"
import type { BackendWeight } from "@/lib/backend-api"

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

export default function PriorityFactorsTab() {
  const { backendConnected, backendWeights, updateWeights } = useData()

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

  const softFactors: BackendWeight[] = backendWeights.filter(w => !w.is_hard_constraint)
  const hardFactors: BackendWeight[] = backendWeights.filter(w => w.is_hard_constraint)
  const weightSum = softFactors.reduce((acc, f) => acc + (localWeights[f.factor_name] ?? f.weight), 0)
  const sumOk    = Math.abs(weightSum - 100) < 0.001
  const sumWarn  = weightSum >= 95 && weightSum <= 105
  const sumValid = weightSum >= 90 && weightSum <= 110
  const sumColor = sumOk ? "#059669" : sumWarn ? "#d97706" : "#dc2626"

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

  return (
    <div className="flex-1 min-h-0 overflow-auto">
      {!backendConnected && (
        <div className="px-5 py-6">
          <div className="border border-neutral-300 bg-[#f9fafb] px-5 py-5 max-w-lg">
            <div className="font-semibold text-[15px] mb-1">Backend not available</div>
            <div className="text-[12.5px] text-neutral-600 leading-relaxed">
              The planning engine is unreachable — using static weights from the seed configuration.
              Start the backend to manage live Regime A priority factors here.
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              {Object.entries(DEFAULT_WEIGHTS).map(([k, v]) => (
                <div key={k} className="border border-neutral-300 px-2 py-1" style={{ minWidth: 140 }}>
                  <div className="ds-label text-neutral-500">{humanize(k)}</div>
                  <div className="font-mono font-semibold text-[13px]">{v}</div>
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
              <div className="ds-label text-neutral-500 font-bold">Soft factors — weighted (0 – 50)</div>
              <div className="ds-label text-neutral-400"><span className="font-mono">{softFactors.length}</span> factors</div>
            </div>
            {/* Priority factors table */}
            <table className="w-full border-collapse">
              <thead>
                <tr>
                  <th className="ds-th text-left" style={{ paddingLeft: 20 }}>Factor</th>
                  <th className="ds-th text-right" style={{ paddingRight: 20 }}>Weight</th>
                </tr>
              </thead>
              <tbody>
                {softFactors.map(f => {
                  const val = localWeights[f.factor_name] ?? f.weight
                  return (
                    <tr key={f.factor_name} className="border-b border-[#f3f4f6]" style={{ minHeight: 38 }}>
                      <td className="px-5 py-2" colSpan={2}>
                        <div className="flex justify-between items-baseline text-[12px]">
                          <span className="font-semibold">{humanize(f.factor_name)}</span>
                          <div className="flex items-center gap-2">
                            {f.transform_type && (
                              <span className="ds-label px-1 py-0 bg-neutral-100 border border-neutral-300 text-neutral-500">{f.transform_type}</span>
                            )}
                            <span className={`font-mono font-bold w-8 text-right ${val !== f.weight ? "text-[#dc2626]" : "text-neutral-500"}`}>
                              {val % 1 === 0 ? val : val.toFixed(1)}
                            </span>
                          </div>
                        </div>
                        <input type="range" min={0} max={50} step={0.5} value={val}
                          onChange={e => setLocalWeights(prev => ({ ...prev, [f.factor_name]: +e.target.value }))}
                          className="w-full mt-1 accent-[#dc2626]" />
                        {f.source_field && <div className="text-[10.5px] text-neutral-400 mt-0"><span className="font-mono">{f.source_field}</span></div>}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
            {hardFactors.length > 0 && (
              <>
                <div className="px-5 pt-4 pb-1 ds-label text-neutral-500 font-bold">Hard constraints — always enforced</div>
                {hardFactors.map(f => (
                  <div key={f.factor_name} className="px-5 py-3 border-b border-[#f3f4f6] flex items-center gap-3" style={{ minHeight: 38 }}>
                    <span className="text-neutral-400 text-base select-none" title="Hard constraint — locked">🔒</span>
                    <div className="flex-1">
                      <div className="text-[12px] font-semibold">{humanize(f.factor_name)}</div>
                      <div className="text-[10.5px] text-neutral-500">Hard constraint — always enforced · not configurable</div>
                    </div>
                  </div>
                ))}
              </>
            )}
            {/* Weights sum indicator */}
            <div className="px-5 pt-4 pb-1">
              <div className="flex justify-between text-[11.5px] mb-1">
                <span className="font-bold">Weight total</span>
                <span className="font-mono font-semibold text-[15px]" style={{ color: sumColor }}>
                  {weightSum % 1 === 0 ? weightSum : weightSum.toFixed(1)}
                  <span className="text-[11px] font-normal text-neutral-400"> / 100</span>
                </span>
              </div>
              <div className="h-3 bg-neutral-200 relative overflow-hidden">
                <div className="h-3 transition-all" style={{
                  width: Math.min(100, (weightSum / 110) * 100).toFixed(1) + "%",
                  background: sumOk ? "#059669" : sumWarn ? "#d97706" : "#dc2626"
                }} />
              </div>
              <div className="text-[10.5px] mt-1 font-mono" style={{ color: sumColor }}>
                {sumOk ? "✓ Weights sum to exactly 100" : sumWarn ? `Within tolerance (90–110 accepted) — ${weightSum < 100 ? (100 - weightSum).toFixed(1) + " short" : (weightSum - 100).toFixed(1) + " over"}` : `Outside acceptable range (90–110) — save disabled`}
              </div>
            </div>
            {saveWarnings.length > 0 && (
              <div className="mx-5 mt-3 px-3 py-3 border text-[12px] leading-relaxed" style={{ background: "#fffbeb", borderColor: "#d97706", color: "#92400e" }}>
                <div className="font-bold mb-1">Warnings from the engine</div>
                {saveWarnings.map((w, i) => <div key={i}>• {w}</div>)}
              </div>
            )}
            {saveStatus === "success" && <div className="mx-5 mt-3 px-3 py-3 border text-[12px] font-semibold" style={{ background: "#f0fdf4", borderColor: "#059669", color: "#059669" }}>✓ Weights saved to the planning engine</div>}
            {saveStatus === "error"   && <div className="mx-5 mt-3 px-3 py-3 border text-[12px] font-semibold" style={{ background: "#fef2f2", borderColor: "#dc2626", color: "#dc2626" }}>Save failed — check console for details</div>}
            <div className="px-5 pt-4 pb-2 flex gap-2">
              <Button size="sm" className="text-xs" style={{ borderRadius: 5 }} onClick={handleSave} disabled={!sumValid || saveStatus === "saving"}>
                {saveStatus === "saving" ? "Saving…" : "Save weights"}
              </Button>
              <Button variant="secondary" size="sm" className="text-xs" style={{ borderRadius: 5 }} onClick={handleReset}>Reset to defaults</Button>
            </div>
            <div className="px-5 pb-4 text-[10.5px] text-neutral-400 leading-relaxed">Save is disabled when the total falls outside 90–110. Changes are applied to the next plan generation.</div>
          </div>
          <div className="overflow-auto px-4 py-3">
            <div className="ds-label text-neutral-500 font-bold mb-2">Factor details</div>
            {backendWeights.map(f => (
              <div key={f.factor_name} className="py-2 border-b border-[#f3f4f6] text-[11.5px]">
                <div className="font-semibold">{humanize(f.factor_name)}</div>
                <div className="text-neutral-500 text-[10.5px] mt-0 space-y-0">
                  {f.is_hard_constraint && <div style={{ color: "#d97706" }} className="font-bold">Hard constraint</div>}
                  {f.source_field && <div>Source: <span className="font-mono text-[10px]">{f.source_field}</span></div>}
                  {f.transform_type && <div>Transform: {f.transform_type}</div>}
                  {f.null_default != null && <div>Null default: <span className="font-mono">{f.null_default}</span></div>}
                  <div className="text-neutral-400">Updated {new Date(f.updated_at).toLocaleDateString()} by {f.updated_by}</div>
                </div>
              </div>
            ))}
            {backendWeights.length === 0 && <div className="text-[12px] text-neutral-400 py-4">Loading weight configuration…</div>}
          </div>
        </div>
      )}
    </div>
  )
}
