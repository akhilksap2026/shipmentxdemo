import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import { TYPE_LABEL, type Move } from "@/data/yard-data"
import { useData } from "@/lib/DataContext"
import { adaptMoveForDisplay, REASON_LABELS } from "@/lib/backend-adapters"
import { backendApi } from "@/lib/backend-api"
import type { BackendPlanDetail } from "@/lib/backend-api"

interface Props {
  focus: string | null
  onNavigate: (target: string, focus?: string) => void
}

const WEIGHTS = [
  { k: "Machine minutes", v: "0.40", pct: 40 },
  { k: "Weighted lateness", v: "0.25", pct: 25 },
  { k: "Predicted rehandles", v: "0.20", pct: 20 },
  { k: "Detention exposure", v: "0.15", pct: 15 },
]

const HOURS = ["06","07","08","09","10","11","12","13"]

const PLAN_STATUS_VARIANT: Record<string, "brand" | "muted" | "amber" | "green" | "red"> = {
  draft:       "muted",
  confirmed:   "green",
  in_progress: "brand",
  superseded:  "amber",
}

type PlanSource = "seed" | "engine"

export default function NightPlanner({ focus, onNavigate }: Props) {
  const {
    moves, operators, assumptions, exceptions, refresh,
    // Backend engine
    backendConnected, activePlan, plans,
    backendContainers, backendSlots, backendJockeys,
    generatePlan, confirmPlan,
  } = useData()

  // ── Seed-mode state (existing, unchanged) ──────────────────────────────────
  const [sel, setSel] = useState<string>(() => moves[8]?.id || "")
  const [tab, setTab] = useState("detail")
  const [q, setQ] = useState("")
  const [filter, setFilter] = useState("ALL")
  const [published, setPublished] = useState(false)
  const [publishing, setPublishing] = useState(false)
  const [configOpen, setConfigOpen] = useState(false)
  const [wRaw, setWRaw] = useState([40, 25, 20, 15])

  // ── New plan-source toggle & engine state ──────────────────────────────────
  const [planSource, setPlanSource] = useState<PlanSource>("seed")
  const [generating, setGenerating] = useState(false)
  const [confirming, setConfirming] = useState(false)
  /** Plan currently displayed in engine mode — starts from activePlan, can be overridden by history pick */
  const [viewedPlan, setViewedPlan] = useState<BackendPlanDetail | null>(null)
  const [historyLoading, setHistoryLoading] = useState(false)

  // Keep viewedPlan in sync with activePlan from context (unless user has picked a historical one)
  useEffect(() => {
    setViewedPlan(prev => prev ?? activePlan)
  }, [activePlan])

  // ── Publish handler (seed mode, unchanged) ─────────────────────────────────
  async function handlePublish() {
    if (published || publishing) return
    setPublishing(true)
    try {
      const now = new Date()
      const hh = String(now.getHours()).padStart(2, "0")
      const mm = String(now.getMinutes()).padStart(2, "0")
      const res = await fetch("/api/events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: "EV-PUB-" + String(Date.now()).slice(-6),
          time: `${hh}:${mm}`,
          type: "PLAN_PUBLISHED",
          severity: "low",
          state: "replanned",
          auto: "Manual",
          title: `Plan P-2026-08-11 approved — ${moves.length} moves published`,
          detail: `Yard Manager approved the night-before plan. ${moves.filter(m => m.frozen).length} moves frozen, ${moves.length} total sequenced across 3 reach stackers and 1 empty handler.`,
          diff: { cancelled: 0, added: 0, reassigned: 0, frozenKept: moves.filter(m => m.frozen).length, deltaMin: 0, adherence: 0 },
        }),
      })
      if (!res.ok) {
        console.error("[NightPlanner] publish event write failed:", res.status)
      } else {
        await refresh(["events"])
      }
      setPublished(true)
    } catch (err) {
      console.error("[NightPlanner] publish event write failed:", err)
      setPublished(true)
    } finally {
      setPublishing(false)
    }
  }

  // ── Engine mode handlers ───────────────────────────────────────────────────
  async function handleGenerate() {
    if (generating) return
    setGenerating(true)
    try {
      const plan = await generatePlan("cp_sat")
      if (plan) setViewedPlan(plan)
    } finally {
      setGenerating(false)
    }
  }

  async function handleConfirm() {
    if (!viewedPlan || confirming) return
    setConfirming(true)
    try {
      const ok = await confirmPlan(viewedPlan.id)
      if (ok) setViewedPlan(prev => prev ? { ...prev, status: "confirmed" } : prev)
    } finally {
      setConfirming(false)
    }
  }

  async function handleHistorySelect(planId: number) {
    if (historyLoading) return
    setHistoryLoading(true)
    try {
      const detail = await backendApi.plan(planId)
      setViewedPlan(detail)
    } catch (err) {
      console.error("[NightPlanner] history fetch failed:", err)
    } finally {
      setHistoryLoading(false)
    }
  }

  // ── Focus handling (seed mode, unchanged) ─────────────────────────────────
  useEffect(() => {
    if (moves.length > 8 && !sel) setSel(moves[8].id)
  }, [moves])

  useEffect(() => {
    if (!focus) return
    const m = moves.find(x => x.id === focus)
      || moves.find(x => x.containerId === focus)
    if (m) { setSel(m.id); setTab("detail"); setFilter("ALL"); setQ("") }
    else { setQ(focus); setFilter("ALL"); setSel(""); setTab("detail") }
  }, [focus, moves])

  // ── Seed mode derived values ───────────────────────────────────────────────
  const types = ["ALL","RETRIEVE_STAGE","PLACE_INBOUND","RESHUFFLE","LOAD_OUTBOUND"]
  const ql = q.trim().toLowerCase()
  const rows = moves.filter(m =>
    (filter === "ALL" || m.type === filter) &&
    (!ql || (m.containerId+m.from+m.to+m.operatorName+m.equipment+m.type).toLowerCase().includes(ql))
  )
  const selMove = moves.find(m => m.id === sel) || null
  const onShift = operators.filter(o => o.status === "on shift")
  const totalMin = moves.reduce((a,m) => a+m.estMin, 0)

  const projection = [
    { k:"Truck turn P50", target:"15.0′", opt:"11.8′", exp:"13.4′", pes:"17.1′", bandLeft:20, bandWidth:48, mark:66 },
    { k:"Truck turn P90", target:"22.0′", opt:"18.2′", exp:"21.0′", pes:"27.4′", bandLeft:26, bandWidth:52, mark:70 },
    { k:"Job cycle P50", target:"5.0′", opt:"4.2′", exp:"4.8′", pes:"6.1′", bandLeft:18, bandWidth:50, mark:62 },
    { k:"Plan adherence", target:"≥85%", opt:"94%", exp:"89%", pes:"78%", bandLeft:22, bandWidth:56, mark:58 },
    { k:"Detention breaches", target:"0", opt:"0", exp:"0", pes:"2", bandLeft:10, bandWidth:40, mark:22 },
  ]

  // ── Engine mode derived values ─────────────────────────────────────────────
  const engineMoves = viewedPlan
    ? viewedPlan.moves.map(m => adaptMoveForDisplay(m, backendContainers, backendSlots, backendJockeys))
    : []

  // ── Shared move-table row renderer (works for both seed and engine rows) ───
  // For seed rows: uses m.type → TYPE_LABEL, m.state
  // For engine rows: uses m.typeLabel (from adapter), m.stateLabel (from adapter)
  function MoveRow({ m, isSelected, onClick }: {
    m: Move & { typeLabel?: string; stateLabel?: string }
    isSelected: boolean
    onClick: () => void
  }) {
    const typeDisplay = (m as { typeLabel?: string }).typeLabel ?? TYPE_LABEL[m.type] ?? m.type
    const stateDisplay = ((m as { stateLabel?: string }).stateLabel ?? m.state ?? "").toLowerCase()
    return (
      <tr
        onClick={onClick}
        className="cursor-pointer hover:bg-neutral-50 border-b border-neutral-200 transition-colors"
        style={{ background: isSelected ? "#fef3f2" : undefined }}
      >
        <td className="py-2 pl-4 pr-2.5 tabular text-neutral-500" style={{ borderLeft: `3px solid ${isSelected ? "#d9291c" : m.frozen ? "#ccc" : "transparent"}` }}>
          {String(m.seq).padStart(3, "0")}
        </td>
        <td className="px-2.5 py-2 tabular whitespace-nowrap">{m.start}–{m.end}</td>
        <td className="px-2.5 py-2">
          <div className="font-bold">{typeDisplay}</div>
          <div className="text-[11px] text-neutral-500 tabular">{m.containerId}</div>
        </td>
        <td className="px-2.5 py-2 tabular text-neutral-600 whitespace-nowrap">{m.from} → {m.to}</td>
        <td className="px-2.5 py-2 whitespace-nowrap">
          <div>{m.operatorName}</div>
          <div className="text-[11px] text-neutral-500">{m.equipment} · {stateDisplay}</div>
        </td>
        <td className="px-2.5 py-2 pl-2.5 pr-4 text-right tabular font-semibold">{m.estMin.toFixed(1)}′</td>
      </tr>
    )
  }

  // ── Engine-mode selected move detail ───────────────────────────────────────
  const [engineSel, setEngineSel] = useState<number | null>(null)
  const engineSelMove = engineMoves.find(m => m.id === engineSel) || engineMoves[0] || null

  return (
    <div className="relative flex flex-col h-full min-h-0 overflow-auto bg-white text-neutral-900">

      {/* Config overlay (seed mode only, unchanged) */}
      {configOpen && (
        <>
          <div className="absolute inset-0 z-10 bg-black/40" onClick={() => setConfigOpen(false)} />
          <div className="absolute top-0 right-0 bottom-0 w-96 z-20 bg-white border-l-2 border-neutral-200 overflow-auto p-4">
            <div className="flex justify-between items-baseline">
              <div className="font-black text-base">Configure this plan</div>
              <button onClick={() => setConfigOpen(false)} className="text-xs text-neutral-500 hover:text-neutral-800">Close ✕</button>
            </div>
            <p className="text-[11px] text-neutral-500 mt-1.5 leading-relaxed">Weight changes take effect on the next generation, never against a published plan.</p>
            <div className="mt-3.5 text-[10px] tracking-widest uppercase text-neutral-500 font-bold">Objective weights</div>
            {["Machine minutes","Weighted lateness","Predicted rehandles","Detention exposure"].map((k, i) => (
              <div key={k} className="py-2 border-b border-neutral-200">
                <div className="flex justify-between text-[11.5px]">
                  <span>{k}</span><span className="font-bold tabular">{(wRaw[i]/100).toFixed(2)}</span>
                </div>
                <input type="range" min={0} max={40} value={wRaw[i]}
                  onChange={e => { const w=[...wRaw]; w[i]=+e.target.value; setWRaw(w) }}
                  className="w-full mt-1.5 accent-[#d9291c]" />
              </div>
            ))}
            <div className="mt-3.5 text-[10px] tracking-widest uppercase text-neutral-500 font-bold">Stability</div>
            {[["Freeze window","20 min"],["In-progress immutable","true"],["Minimum improvement","8 machine-min"],["Reassign cap","2 / operator / hour"]].map(([k,v]) => (
              <div key={k} className="flex justify-between py-1.5 border-b border-neutral-200 text-[11.5px]">
                <span className="text-neutral-600">{k}</span><span className="font-semibold">{v}</span>
              </div>
            ))}
            <Button className="w-full mt-4 text-xs" onClick={() => setConfigOpen(false)}>Apply on next regenerate</Button>
          </div>
        </>
      )}

      {/* ── Header ───────────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-4 px-5 pt-3.5 pb-3 border-b-2 border-neutral-200 flex-none">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2.5">
            <span className="font-black text-[19px] tracking-tight">Night-before plan</span>
            {planSource === "seed" && (
              <Badge variant={published ? "brand" : "muted"}>{published ? "PUBLISHED" : "DRAFT"}</Badge>
            )}
            {planSource === "engine" && viewedPlan && (
              <Badge variant={PLAN_STATUS_VARIANT[viewedPlan.status] ?? "muted"}>
                {viewedPlan.status.replace("_", " ").toUpperCase()}
              </Badge>
            )}
          </div>
          <div className="flex gap-3 text-[11px] text-neutral-500">
            {planSource === "seed"
              ? <><span>P-2026-08-11</span><span>Generated 22:14</span><span>Engine 41.8 s</span><span>Snapshot #a41f9c</span><span>Horizon 06:00–14:00</span></>
              : viewedPlan
              ? <><span>Plan #{viewedPlan.id}</span><span>{viewedPlan.plan_date}</span>{viewedPlan.solve_seconds != null && <span>Solved in {viewedPlan.solve_seconds.toFixed(1)} s</span>}{viewedPlan.solver_status && <span>Solver: {viewedPlan.solver_status}</span>}{viewedPlan.gap_percent != null && <span>Gap: {viewedPlan.gap_percent.toFixed(1)}%</span>}<span>{viewedPlan.moves.length} moves</span></>
              : <span>No plan generated</span>
            }
          </div>
        </div>

        {/* ── Plan source toggle ──────────────────────────────────────────── */}
        <div className="flex items-center gap-1.5 ml-2">
          <span className="text-[10px] tracking-widest uppercase text-neutral-500 whitespace-nowrap">Source</span>
          {(["seed", "engine"] as PlanSource[]).map((src, i, arr) => (
            <button
              key={src}
              disabled={src === "engine" && !backendConnected}
              onClick={() => setPlanSource(src)}
              title={src === "engine" && !backendConnected ? "Planning engine unreachable" : undefined}
              className="text-[10.5px] px-3 py-1.5 border border-neutral-300 font-bold transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              style={{
                borderRight: i < arr.length - 1 ? "none" : undefined,
                background: planSource === src ? "#201e1d" : "transparent",
                color: planSource === src ? "#fff" : "#201e1d",
              }}
            >
              {src === "seed" ? "Seed data" : backendConnected ? "Planning engine" : "Engine offline"}
            </button>
          ))}
        </div>

        {/* ── Action buttons ──────────────────────────────────────────────── */}
        <div className="ml-auto flex gap-2">
          {planSource === "seed" ? (
            <>
              <Button variant="ghost" size="sm" className="text-xs" onClick={() => setConfigOpen(true)}>Configure</Button>
              <Button variant="secondary" size="sm" className="text-xs" onClick={() => setPublished(false)}>Regenerate</Button>
              <Button size="sm" className="text-xs" onClick={handlePublish} disabled={publishing}>
                {publishing ? "Publishing…" : published ? "Published · view diff" : "Approve & publish"}
              </Button>
            </>
          ) : (
            <>
              {/* Plan history dropdown */}
              {plans.length > 0 && (
                <select
                  disabled={historyLoading}
                  onChange={e => handleHistorySelect(Number(e.target.value))}
                  value={viewedPlan?.id ?? ""}
                  className="text-[11px] border border-neutral-300 px-2 py-1.5 bg-white text-neutral-900 disabled:opacity-50"
                >
                  <option value="" disabled>Plan history ({plans.length})</option>
                  {plans.map(p => (
                    <option key={p.id} value={p.id}>
                      #{p.id} · {p.plan_date} · {p.status}
                    </option>
                  ))}
                </select>
              )}
              <Button variant="secondary" size="sm" className="text-xs" onClick={handleGenerate} disabled={generating}>
                {generating ? "⟳ Solver running…" : "Generate plan"}
              </Button>
              {viewedPlan?.status === "draft" && (
                <Button size="sm" className="text-xs" onClick={handleConfirm} disabled={confirming}>
                  {confirming ? "Confirming…" : "Confirm plan"}
                </Button>
              )}
            </>
          )}
        </div>
      </div>

      {/* ── Plan banner (seed mode only, unchanged) ───────────────────────── */}
      {planSource === "seed" && (
        <div className="px-5 py-2.5 bg-neutral-100 border-b border-neutral-200 text-[12.5px] leading-relaxed text-neutral-700 max-w-5xl flex-none">
          Plan, filter, and sequence today's {moves.length} moves across 3 reach stackers and 1 empty handler, ranked by free-time urgency, detention cost, hazmat handling, order priority, dig-out cost, gate pressure, customs channel, empty-return windows, damage state and dwell — with every placement carrying a one-sentence reason.
        </div>
      )}

      {/* ── Engine mode — no plan yet ─────────────────────────────────────── */}
      {planSource === "engine" && !viewedPlan && !generating && (
        <div className="flex-1 flex items-center justify-center">
          <div className="border border-neutral-300 bg-neutral-50 px-8 py-8 max-w-sm text-center">
            <div className="font-black text-[17px] mb-2">No plan generated yet</div>
            <div className="text-[12.5px] text-neutral-600 leading-relaxed mb-5">
              The planning engine has no plan on record. Generate one to see the solver's move sequence.
            </div>
            <Button onClick={handleGenerate} className="text-xs">
              Generate plan (CP-SAT)
            </Button>
          </div>
        </div>
      )}

      {/* ── Engine mode — solver running spinner ──────────────────────────── */}
      {planSource === "engine" && generating && (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <div className="text-[28px] mb-3 animate-spin select-none">⟳</div>
            <div className="font-black text-[17px]">Solver running…</div>
            <div className="text-[12px] text-neutral-500 mt-1">CP-SAT optimising the move sequence</div>
          </div>
        </div>
      )}

      {/* ── Metrics row ───────────────────────────────────────────────────── */}
      {(planSource === "seed" || (planSource === "engine" && viewedPlan && !generating)) && (
        <div className="flex flex-wrap border-b-2 border-neutral-200 flex-none bg-white">
          {planSource === "seed"
            ? [
                { k:"Moves planned", v:String(moves.length), sub:"of 284 today" },
                { k:"Machine-hours", v:(totalMin/60).toFixed(1), sub:"of 32.0" },
                { k:"Truck turn P50", v:"13.4′", sub:"target 15′" },
                { k:"Job cycle P50", v:"4.8′", sub:"target 5′" },
                { k:"Detention at risk", v:"$8.4k", sub:"next 72 h", red:true },
                { k:"Exceptions", v:String(exceptions.length), sub:"unresolved", red:true },
              ].map(m => (
                <div key={m.k} className="flex-1 basis-36 px-5 py-2.5 border-r border-neutral-200 flex flex-col gap-0.5">
                  <span className="text-[10px] tracking-widest uppercase text-neutral-500">{m.k}</span>
                  <div className="flex items-baseline gap-2">
                    <span className={`font-black text-[22px] leading-none tracking-tight ${m.red?"text-[#d9291c]":""}`}>{m.v}</span>
                    <span className="text-[11px] text-neutral-500">{m.sub}</span>
                  </div>
                </div>
              ))
            : viewedPlan
            ? [
                { k:"Moves", v:String(viewedPlan.moves.length), sub:"in this plan" },
                { k:"Strategy", v:viewedPlan.strategy, sub:"solver" },
                { k:"Solve time", v:viewedPlan.solve_seconds != null ? viewedPlan.solve_seconds.toFixed(1)+"s" : "—", sub:"wall clock" },
                { k:"Objective", v:viewedPlan.objective_value != null ? viewedPlan.objective_value.toFixed(2) : "—", sub:"minimised" },
                { k:"Gap", v:viewedPlan.gap_percent != null ? viewedPlan.gap_percent.toFixed(1)+"%" : "—", sub:"optimality" },
                { k:"Status", v:viewedPlan.status.replace("_"," "), sub:"plan state" },
              ].map(m => (
                <div key={m.k} className="flex-1 basis-36 px-5 py-2.5 border-r border-neutral-200 flex flex-col gap-0.5">
                  <span className="text-[10px] tracking-widest uppercase text-neutral-500">{m.k}</span>
                  <div className="flex items-baseline gap-2">
                    <span className="font-black text-[22px] leading-none tracking-tight capitalize">{m.v}</span>
                    <span className="text-[11px] text-neutral-500">{m.sub}</span>
                  </div>
                </div>
              ))
            : null
          }
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════════════
          SEED MODE — original 3-column layout, completely unchanged
          ════════════════════════════════════════════════════════════════════ */}
      {planSource === "seed" && (
        <div className="grid flex-1 min-h-0 overflow-auto" style={{ gridTemplateColumns: "clamp(170px,15vw,220px) minmax(340px,1fr) clamp(250px,24vw,340px)" }}>

          {/* Left: assumptions + weights */}
          <div className="border-r-2 border-neutral-200 flex flex-col min-h-0 overflow-auto">
            <div className="px-4 pt-3 pb-2 text-[10px] tracking-widest uppercase text-neutral-500 font-bold">Assumptions</div>
            {assumptions.map(a => (
              <div key={a.k} className="px-4 pb-2.5">
                <div className="text-[12px] font-semibold leading-tight">{a.v}</div>
                <div className="text-[10.5px] text-neutral-500 leading-tight">
                  {a.k} · <span className={/unanswered|unconfirmed|maintenance/.test(a.note)?"text-[#d9291c]":"text-neutral-500"}>{a.note}</span>
                </div>
              </div>
            ))}
            <div className="h-0.5 bg-neutral-200 my-0.5" />
            <div className="px-4 pt-3 pb-2 text-[10px] tracking-widest uppercase text-neutral-500 font-bold">Objective weights</div>
            {WEIGHTS.map(w => (
              <div key={w.k} className="px-4 pb-2.5 flex flex-col gap-1">
                <div className="flex justify-between text-[11.5px]"><span>{w.k}</span><span className="font-bold tabular">{w.v}</span></div>
                <div className="h-0.5 bg-neutral-200 relative">
                  <div className="absolute left-0 top-0 h-0.5 bg-neutral-900" style={{ width: w.pct+"%" }} />
                </div>
              </div>
            ))}
          </div>

          {/* Center: moves table */}
          <div className="flex flex-col min-h-0">
            <div className="flex flex-wrap items-center gap-2 px-4 py-2.5 border-b border-neutral-200 flex-none">
              <Input
                placeholder="Filter container, slot, operator…"
                value={q}
                onChange={e => setQ(e.target.value)}
                className="w-56 h-7 text-xs"
              />
              <div className="flex">
                {types.map((t, i) => (
                  <button key={t}
                    onClick={() => setFilter(t)}
                    className="text-[10.5px] px-2.5 py-1.5 border border-neutral-300 font-semibold transition-colors"
                    style={{ borderRight: i < types.length-1 ? "none" : undefined, background: filter===t?"#201e1d":"transparent", color: filter===t?"#fff":"#333" }}
                  >
                    {t==="ALL"?"All":TYPE_LABEL[t]}
                  </button>
                ))}
              </div>
              <span className="ml-auto text-[11px] text-neutral-500">{rows.length} of {moves.length} moves · 12 frozen</span>
            </div>
            <div className="flex-1 min-h-0 overflow-auto">
              <table className="w-full border-collapse text-[12px]">
                <thead>
                  <tr>
                    {["SEQ","WINDOW","MOVE","ROUTE","ASSIGNED","EST"].map((h,i) => (
                      <th key={h} className="text-left px-2.5 py-2 text-[9.5px] font-bold tracking-widest uppercase text-neutral-500 sticky top-0 bg-white border-b-2 border-neutral-200 z-10" style={{ paddingLeft: i===0?"16px":undefined, textAlign: i===5?"right":undefined }}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.length === 0 ? (
                    <tr><td colSpan={6} className="px-4 py-4 text-[12px] text-neutral-500">No moves match {q ? `"${q}"` : "this filter"}.</td></tr>
                  ) : rows.map(m => (
                    <MoveRow
                      key={m.id}
                      m={m}
                      isSelected={m.id === sel}
                      onClick={() => { setSel(m.id); setTab("detail") }}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Right: detail panel */}
          <div className="border-l-2 border-neutral-200 flex flex-col min-h-0">
            <Tabs value={tab} onValueChange={setTab} className="flex flex-col flex-1 min-h-0">
              <TabsList className="flex-none">
                <TabsTrigger value="detail">Move</TabsTrigger>
                <TabsTrigger value="exceptions">Exceptions {exceptions.length}</TabsTrigger>
                <TabsTrigger value="projection">Projected KPI</TabsTrigger>
              </TabsList>

              <TabsContent value="detail">
                {selMove ? (
                  <div>
                    <div className="px-4 pt-3.5 pb-3">
                      <div className="text-[10px] tracking-widest uppercase text-neutral-500">{selMove.id} · seq {selMove.seq}</div>
                      <div className="font-black text-[17px] mt-1 tracking-tight">{TYPE_LABEL[selMove.type]}</div>
                      <div className="text-[12px] mt-1 tabular text-neutral-700">{selMove.containerId}</div>
                      <div className="text-[12px] tabular text-neutral-600">{selMove.from} → {selMove.to}</div>
                    </div>
                    <div className="px-4 py-3 border-t-2 border-b border-neutral-200 bg-red-50">
                      <div className="text-[10px] tracking-widest uppercase text-[#a01f14] mb-1">Why this move</div>
                      <div className="text-[12.5px] leading-relaxed">{selMove.reason}</div>
                    </div>
                    {[
                      ["Machine / operator", selMove.equipment+" · "+selMove.operatorName],
                      ["Window", selMove.start+"–"+selMove.end+" ("+selMove.estMin.toFixed(1)+"′)"],
                      ["Travel / lift / set-down", (selMove.estMin*0.45).toFixed(1)+" / "+(selMove.estMin*0.3).toFixed(1)+" / "+(selMove.estMin*0.25).toFixed(1)],
                      ["Order priority", selMove.priority],
                      ["State", selMove.frozen?selMove.state.toLowerCase()+" · frozen":selMove.state.toLowerCase()],
                      ["Weight snapshot", "WS-2026-08-10#a41f9c"],
                    ].map(([k,v]) => (
                      <div key={k} className="flex justify-between gap-3 px-4 py-2 border-b border-neutral-200 text-[11.5px]">
                        <span className="text-neutral-500">{k}</span>
                        <span className="font-semibold text-right">{v}</span>
                      </div>
                    ))}
                    <div className="px-4 pt-3 pb-1.5 text-[10px] tracking-widest uppercase text-neutral-500 font-bold">Hard constraints</div>
                    {[
                      ["C2","Stack height within zone max and reach envelope","PASS"],
                      ["C3","Row depth within machine reach","PASS"],
                      ["C4","Gross weight against capacity chart","PASS"],
                      ["C9","Operator certified for cargo class","PASS"],
                      ["C12","Destination zone below utilisation ceiling",selMove.to[0]==="C"?"AT CEILING":"PASS"],
                    ].map(([id,label,verdict]) => (
                      <div key={id} className="flex gap-2.5 items-baseline px-4 py-1.5 text-[11.5px]">
                        <span className="w-6 font-bold text-neutral-500">{id}</span>
                        <span className="flex-1 text-neutral-700 leading-tight">{label}</span>
                        <span className={`text-[10px] font-bold tracking-wider ${verdict==="AT CEILING"?"text-[#d9291c]":"text-neutral-500"}`}>{verdict}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="px-4 py-3.5 text-[12.5px] leading-relaxed text-neutral-600">
                    {focus || q || "This container"} has no move in plan P-2026-08-11 — {moves.length} of 897 containers are moved today.
                  </div>
                )}
              </TabsContent>

              <TabsContent value="exceptions">
                <div>
                  {exceptions.map(e => (
                    <div key={e.id} className="px-4 py-3.5 border-b border-neutral-200">
                      <div className="flex justify-between items-baseline">
                        <span className={`text-[10px] font-bold tracking-wider ${e.severity==="high"?"text-[#d9291c]":"text-neutral-500"}`}>{e.type}</span>
                        <span className="text-[10px] text-neutral-500">{e.id}</span>
                      </div>
                      <div className="text-[13px] font-bold mt-1">{e.subject}</div>
                      <div className="text-[12px] leading-relaxed text-neutral-700 mt-1">{e.detail}</div>
                      <Button variant="secondary" size="sm" className="mt-2.5 text-[11.5px]">{e.action}</Button>
                    </div>
                  ))}
                  <div className="px-4 py-3.5 text-[11.5px] text-neutral-600 leading-relaxed">Infeasible assignments escalate after three resequencing iterations.</div>
                </div>
              </TabsContent>

              <TabsContent value="projection">
                <div>
                  {projection.map(p => (
                    <div key={p.k} className="px-4 py-3 border-b border-neutral-200">
                      <div className="flex justify-between text-[11.5px]">
                        <span className="font-bold">{p.k}</span>
                        <span className="text-neutral-500">target {p.target}</span>
                      </div>
                      <div className="flex items-baseline gap-3 mt-1.5 text-[11px] tabular text-neutral-500">
                        <span>{p.opt}</span>
                        <span className="font-black text-[17px] leading-none text-neutral-900">{p.exp}</span>
                        <span>{p.pes}</span>
                      </div>
                      <div className="relative h-1 bg-neutral-200 mt-2">
                        <div className="absolute top-0 h-1 bg-red-200" style={{ left:p.bandLeft+"%", width:p.bandWidth+"%" }} />
                        <div className="absolute top-[-3px] h-2.5 w-0.5 bg-neutral-900" style={{ left:p.mark+"%" }} />
                      </div>
                    </div>
                  ))}
                </div>
              </TabsContent>
            </Tabs>
          </div>
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════════════
          ENGINE MODE — two-column layout (move table + detail)
          Only shown when viewedPlan exists and not generating
          ════════════════════════════════════════════════════════════════════ */}
      {planSource === "engine" && viewedPlan && !generating && (
        <div className="grid flex-1 min-h-0 overflow-auto" style={{ gridTemplateColumns: "minmax(400px,1fr) clamp(280px,28vw,380px)" }}>

          {/* Center: engine move table */}
          <div className="flex flex-col min-h-0">
            <div className="flex items-center gap-2 px-4 py-2.5 border-b border-neutral-200 flex-none">
              <span className="text-[11px] text-neutral-500">{engineMoves.length} moves · Plan #{viewedPlan.id}</span>
            </div>
            <div className="flex-1 min-h-0 overflow-auto">
              <table className="w-full border-collapse text-[12px]">
                <thead>
                  <tr>
                    {["SEQ","WINDOW","MOVE","ROUTE","ASSIGNED","EST"].map((h,i) => (
                      <th key={h} className="text-left px-2.5 py-2 text-[9.5px] font-bold tracking-widest uppercase text-neutral-500 sticky top-0 bg-white border-b-2 border-neutral-200 z-10" style={{ paddingLeft: i===0?"16px":undefined, textAlign: i===5?"right":undefined }}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {engineMoves.length === 0 ? (
                    <tr><td colSpan={6} className="px-4 py-4 text-[12px] text-neutral-500">No moves in this plan.</td></tr>
                  ) : engineMoves.map(m => (
                    <MoveRow
                      key={m.id}
                      m={m as unknown as Move}
                      isSelected={m.id === engineSel}
                      onClick={() => setEngineSel(m.id)}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Right: engine move detail */}
          <div className="border-l-2 border-neutral-200 flex flex-col min-h-0 overflow-auto">
            {engineSelMove ? (
              <div>
                <div className="px-4 pt-3.5 pb-3">
                  <div className="text-[10px] tracking-widest uppercase text-neutral-500">Move #{engineSelMove.id} · seq {engineSelMove.seq}</div>
                  <div className="font-black text-[17px] mt-1 tracking-tight">
                    {REASON_LABELS[(engineSelMove as {reason?: string}).reason ?? ""] ?? (engineSelMove as {typeLabel?: string}).typeLabel ?? "Move"}
                  </div>
                  <div className="text-[12px] mt-1 tabular text-neutral-700">{engineSelMove.containerId}</div>
                  <div className="text-[12px] tabular text-neutral-600">{engineSelMove.from} → {engineSelMove.to}</div>
                </div>
                {[
                  ["Jockey / operator", engineSelMove.operatorName],
                  ["Est. duration", engineSelMove.estMin.toFixed(1)+"′"],
                  ["State", (engineSelMove as {stateLabel?: string}).stateLabel ?? "—"],
                  ["Frozen", engineSelMove.frozen ? "yes" : "no"],
                ].map(([k,v]) => (
                  <div key={k} className="flex justify-between gap-3 px-4 py-2 border-b border-neutral-200 text-[11.5px]">
                    <span className="text-neutral-500">{k}</span>
                    <span className="font-semibold text-right">{v}</span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="px-4 py-4 text-[12px] text-neutral-500 leading-relaxed">
                Select a move from the table to see its details.
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Gantt strip (seed mode only, unchanged) ───────────────────────── */}
      {planSource === "seed" && (
        <div className="flex-none border-t-2 border-neutral-200 max-h-44 overflow-auto">
          <div className="flex items-baseline gap-3 px-4 py-2">
            <span className="text-[10px] tracking-widest uppercase text-neutral-500 font-bold">Operator schedule</span>
            <span className="text-[11px] text-neutral-500">{published?"Frozen window 20 min · in-progress moves immutable":"Preview — freeze applies at publication"}</span>
          </div>
          <div className="grid" style={{ gridTemplateColumns: "132px 1fr" }}>
            <div />
            <div className="flex border-b border-neutral-200">
              {HOURS.map(h => <div key={h} className="flex-1 text-[9.5px] text-neutral-500 border-l border-neutral-200 px-1 py-0.5">{h}</div>)}
            </div>
            {onShift.map(op => (
              <div key={op.id} className="contents">
                <div className="px-4 py-1.5 text-[11.5px] border-b border-neutral-200 flex justify-between gap-2">
                  <span className="font-semibold">{op.name}</span>
                  <span className="text-neutral-500">{op.equipment}</span>
                </div>
                <div className="relative h-8 border-b border-neutral-200 border-l border-neutral-200">
                  {moves.filter(m => m.operator === op.id).map(m => (
                    <div key={m.id}
                      onClick={() => { setSel(m.id); setTab("detail") }}
                      title={m.id+" "+TYPE_LABEL[m.type]+" "+m.start+"–"+m.end}
                      className="absolute top-2 h-3.5 cursor-pointer hover:opacity-80"
                      style={{
                        left: ((m.startMin-360)/480*100).toFixed(2)+"%",
                        width: Math.max(0.5,(m.endMin-m.startMin)/480*100).toFixed(2)+"%",
                        background: m.id===sel?"#d9291c":m.frozen?"#888":"#201e1d",
                      }}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
