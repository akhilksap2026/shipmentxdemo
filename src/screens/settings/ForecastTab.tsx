import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { useData } from "@/lib/DataContext"
import { backendApi } from "@/lib/backend-api"
import type { BackendForecast } from "@/lib/backend-api"
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ReferenceLine, ReferenceArea, ResponsiveContainer,
} from "recharts"
import BackendUnavailable from "./BackendUnavailable"

export default function ForecastTab() {
  const { backendConnected, backendSlots } = useData()

  const [fcastMonths,     setFcastMonths]     = useState(3)
  const [fcastCapacity,   setFcastCapacity]   = useState<number>(() => Math.max(100, backendSlots.length))
  const [fcastResult,     setFcastResult]     = useState<BackendForecast | null>(null)
  const [fcastLoading,    setFcastLoading]    = useState(false)
  const [assumptionsOpen, setAssumptionsOpen] = useState(false)
  const [resetStatus,     setResetStatus]     = useState<"idle"|"resetting"|"done"|"error">("idle")

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

  return (
    <div className="flex-1 min-h-0 overflow-auto px-5 py-4">
      {!backendConnected
        ? <BackendUnavailable desc="The planning engine is unreachable. Connect the backend to run capacity forecasts." />
        : (
          <>
            {/* Controls */}
            <div className="flex flex-wrap items-end gap-6 mb-4 border-b border-neutral-200 pb-4">
              <div className="flex flex-col gap-1">
                <label className="ds-label text-neutral-500 font-bold">Forecast horizon</label>
                <div className="flex items-center gap-3">
                  <input type="range" min={1} max={12} step={1} value={fcastMonths}
                    onChange={e => setFcastMonths(+e.target.value)}
                    className="w-40 accent-[#dc2626]" />
                  <span className="font-mono font-bold text-[14px] w-16"><span className="font-mono">{fcastMonths}</span> month{fcastMonths !== 1 ? "s" : ""}</span>
                </div>
              </div>
              <div className="flex flex-col gap-1">
                <label className="ds-label text-neutral-500 font-bold">Capacity (slots)</label>
                <input
                  type="number" min={1} max={99999} step={1} value={fcastCapacity}
                  onChange={e => setFcastCapacity(+e.target.value)}
                  className="w-32 h-8 border border-neutral-300 px-2 text-[12px] font-mono font-semibold"
                  style={{ borderRadius: 5 }}
                />
              </div>
              <Button size="sm" className="text-xs" style={{ borderRadius: 5 }} onClick={runForecast} disabled={fcastLoading}>
                {fcastLoading ? "Running…" : "Run forecast"}
              </Button>
            </div>

            {/* Chart area */}
            {!fcastResult && !fcastLoading && (
              <div className="border border-neutral-200 bg-[#f9fafb] px-6 py-10 text-center text-[12px] text-neutral-500 mb-4">
                Set the horizon and capacity above, then click "Run forecast" to see the occupancy projection.
              </div>
            )}
            {fcastLoading && (
              <div className="border border-neutral-200 bg-[#f9fafb] px-6 py-10 text-center text-[12px] text-neutral-500 mb-4">
                Running forecast…
              </div>
            )}
            {fcastResult && !fcastLoading && (
              <div className="mb-4">
                {/* First-over-capacity callout */}
                {fcastResult.first_over_capacity_day && (
                  <div className="mb-3 px-4 py-2 border text-[12px] flex items-baseline gap-3" style={{ background: "#fffbeb", borderColor: "#d97706", color: "#92400e" }}>
                    <span className="font-bold">First over-capacity day:</span>
                    <span className="font-mono font-semibold">{fcastResult.first_over_capacity_day}</span>
                  </div>
                )}
                {!fcastResult.first_over_capacity_day && (
                  <div className="mb-3 px-4 py-2 border text-[12px] font-semibold" style={{ background: "#f0fdf4", borderColor: "#059669", color: "#059669" }}>
                    ✓ No over-capacity days in the forecast horizon
                  </div>
                )}

                {/* Line chart */}
                <div className="border border-neutral-200 bg-white" style={{ height: 280 }}>
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
                          stroke="#dc2626"
                          strokeDasharray="4 3"
                          label={{ value: "First breach", position: "top", fontSize: 9, fill: "#dc2626" }}
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
                        stroke="#dc2626"
                        strokeWidth={1.5}
                        strokeDasharray="5 3"
                        dot={false}
                        name="capacity"
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
                <div className="flex gap-5 mt-2 text-[11px] text-neutral-600">
                  <span className="flex items-center gap-1"><span className="w-6 h-0.5 bg-[#2563eb] inline-block" /> Projected occupancy</span>
                  <span className="flex items-center gap-1"><span className="w-6 h-0.5 bg-[#dc2626] border-t border-dashed border-[#dc2626] inline-block" /> Capacity limit</span>
                  <span className="flex items-center gap-1"><span className="w-4 h-4 inline-block" style={{ background: "#fee2e2", border: "1px solid #fca5a5" }} /> Over capacity</span>
                </div>

                {/* Collapsible assumptions */}
                <div className="mt-4 border border-neutral-200">
                  <button
                    onClick={() => setAssumptionsOpen(v => !v)}
                    className="w-full text-left px-4 py-2 text-[11.5px] font-semibold flex justify-between items-center hover:bg-[#f9fafb] transition-colors"
                    style={{ borderRadius: 0 }}
                  >
                    <span>Forecast assumptions</span>
                    <span className="text-neutral-400 text-[12px]">{assumptionsOpen ? "▲" : "▼"}</span>
                  </button>
                  {assumptionsOpen && (
                    <div className="px-4 pb-4 border-t border-neutral-200">
                      {Object.entries(fcastResult.assumptions).map(([k, v]) => (
                        <div key={k} className="flex justify-between py-1 border-b border-[#f3f4f6] text-[11.5px]">
                          <span className="text-neutral-600 font-mono text-[10.5px]">{k}</span>
                          <span className="font-mono font-semibold">{JSON.stringify(v)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Reset seed data */}
            <div className="border-t border-neutral-200 pt-4 mt-2">
              <div className="ds-label text-neutral-500 font-bold mb-2">Demo data</div>
              <div className="flex items-center gap-4">
                <Button variant="secondary" size="sm" className="text-xs" style={{ borderRadius: 5 }} onClick={resetSeedData} disabled={resetStatus === "resetting"}>
                  {resetStatus === "resetting" ? "Resetting…" : "Reset demo data"}
                </Button>
                {resetStatus === "done"  && <span className="text-[12px] font-semibold" style={{ color: "#059669" }}>✓ Seed data reset — refresh to see changes</span>}
                {resetStatus === "error" && <span className="text-[12px] font-semibold text-[#dc2626]">Reset failed — check console</span>}
                <span className="text-[11.5px] text-neutral-500">Calls <code className="font-mono text-[10.5px]">/seed/reset?randomize=true</code> and refreshes all DataContext slices</span>
              </div>
            </div>
          </>
        )
      }
    </div>
  )
}
