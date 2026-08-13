import { useState, useEffect, useRef } from "react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import { TYPE_LABEL, VESSEL_SCHEDULES, CONTAINERS, getHotContainers, EQUIPMENT, OPERATORS, type Move } from "@/data/yard-data"
import { useData } from "@/lib/DataContext"
import { adaptMoveForDisplay, REASON_LABELS } from "@/lib/backend-adapters"
import { backendApi } from "@/lib/backend-api"
import type { BackendPlanDetail } from "@/lib/backend-api"

interface Props {
  focus: string | null
  onNavigate: (target: string, focus?: string) => void
}

const WEIGHTS = [
  { k: "Vessel cutoff urgency", v: "0.35", pct: 35 },
  { k: "Machine minutes",       v: "0.40", pct: 40 },
  { k: "Weighted lateness",     v: "0.25", pct: 25 },
  { k: "Predicted rehandles",   v: "0.20", pct: 20 },
  { k: "Detention exposure",    v: "0.15", pct: 15 },
]

const HOURS = ["06","07","08","09","10","11","12","13"]

const PLAN_STATUS_VARIANT: Record<string, "brand" | "muted" | "amber" | "green" | "red"> = {
  draft:       "muted",
  confirmed:   "green",
  in_progress: "brand",
  superseded:  "amber",
}

type PlanSource = "seed" | "engine"

// Step 3: column definitions
const ALL_COLS = ["SEQ","WINDOW","MOVE","ROUTE","ASSIGNED","EST"] as const
type Col = typeof ALL_COLS[number]
const DEFAULT_COLS = new Set<Col>(["SEQ","MOVE","ROUTE","ASSIGNED"])

export default function NightPlanner({ focus, onNavigate }: Props) {
  const {
    moves, operators, assumptions, exceptions, refresh,
    backendConnected, activePlan, plans,
    backendContainers, backendSlots, backendJockeys,
    generatePlan, confirmPlan,
  } = useData()

  // ── Existing state ────────────────────────────────────────────────────────
  const [sel,          setSel]          = useState<string>(() => moves[8]?.id || "")
  const [tab,          setTab]          = useState("detail")
  const [q,            setQ]            = useState("")
  const [filter,       setFilter]       = useState("ALL")
  const [published,    setPublished]    = useState(false)
  const [publishing,   setPublishing]   = useState(false)
  const [configOpen,   setConfigOpen]   = useState(false)
  const [wRaw,         setWRaw]         = useState([35, 40, 25, 20, 15])
  const [planSource,   setPlanSource]   = useState<PlanSource>("seed")
  const [generating,   setGenerating]   = useState(false)
  const [confirming,   setConfirming]   = useState(false)
  const [viewedPlan,   setViewedPlan]   = useState<BackendPlanDetail | null>(null)
  const [historyLoading, setHistoryLoading] = useState(false)
  const [engineSel,    setEngineSel]    = useState<number | null>(null)

  // ── New state: Steps 1–5 ─────────────────────────────────────────────────
  const [kpiExpanded,       setKpiExpanded]       = useState(false)          // Step 1
  const [drawerOpen,        setDrawerOpen]         = useState(false)          // Step 2
  const [visibleCols,       setVisibleCols]        = useState<Set<Col>>(new Set(DEFAULT_COLS)) // Step 3
  const [colChooserOpen,    setColChooserOpen]     = useState(false)          // Step 3
  const [constraintsOpen,   setConstraintsOpen]    = useState(false)          // Step 4
  const [moveHistoryOpen,   setMoveHistoryOpen]    = useState(false)          // Step 4
  const [ganttExpanded,     setGanttExpanded]      = useState(false)          // Step 5
  const colChooserRef = useRef<HTMLDivElement>(null)

  // ── Manual edit state ────────────────────────────────────────────────────
  const [editOpen,      setEditOpen]      = useState(false)
  const [editEquip,     setEditEquip]     = useState("")
  const [editOpId,      setEditOpId]      = useState("")
  const [editStart,     setEditStart]     = useState("")
  const [editEnd,       setEditEnd]       = useState("")
  // overrides keyed by move id — merged at display time
  const [moveOverrides, setMoveOverrides] = useState<Record<string, {
    equipment?: string; operator?: string; operatorName?: string
    start?: string; end?: string; passed?: boolean
  }>>({})

  // Reset edit draft whenever the selected move changes
  useEffect(() => {
    setEditOpen(false)
  }, [sel])

  // ── Keep viewedPlan in sync with activePlan ───────────────────────────────
  useEffect(() => { setViewedPlan(prev => prev ?? activePlan) }, [activePlan])

  // ── Column chooser outside-click close ───────────────────────────────────
  useEffect(() => {
    if (!colChooserOpen) return
    function handler(e: MouseEvent) {
      if (colChooserRef.current && !colChooserRef.current.contains(e.target as Node)) {
        setColChooserOpen(false)
      }
    }
    document.addEventListener("mousedown", handler)
    return () => document.removeEventListener("mousedown", handler)
  }, [colChooserOpen])

  // ── Publish handler ───────────────────────────────────────────────────────
  async function handlePublish() {
    if (published || publishing) return
    setPublishing(true)
    try {
      const now = new Date()
      const hh = String(now.getHours()).padStart(2,"0")
      const mm = String(now.getMinutes()).padStart(2,"0")
      const res = await fetch("/api/events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: "EV-PUB-" + String(Date.now()).slice(-6),
          time: `${hh}:${mm}`,
          type: "PLAN_PUBLISHED", severity: "low", state: "replanned", auto: "Manual",
          title: `Plan P-2026-08-11 approved — ${moves.length} moves published`,
          detail: `Yard Manager approved the night-before plan. ${moves.filter(m => m.frozen).length} moves frozen, ${moves.length} total.`,
          diff: { cancelled:0, added:0, reassigned:0, frozenKept:moves.filter(m=>m.frozen).length, deltaMin:0, adherence:0 },
        }),
      })
      if (!res.ok) console.error("[NightPlanner] publish failed:", res.status)
      else await refresh(["events"])
      setPublished(true)
    } catch (err) {
      console.error("[NightPlanner] publish failed:", err)
      setPublished(true)
    } finally { setPublishing(false) }
  }

  // ── Engine handlers ───────────────────────────────────────────────────────
  async function handleGenerate() {
    if (generating) return
    setGenerating(true)
    try { const plan = await generatePlan("cp_sat"); if (plan) setViewedPlan(plan) }
    finally { setGenerating(false) }
  }

  async function handleConfirm() {
    if (!viewedPlan || confirming) return
    setConfirming(true)
    try {
      const ok = await confirmPlan(viewedPlan.id)
      if (ok) setViewedPlan(prev => prev ? { ...prev, status: "confirmed" } : prev)
    } finally { setConfirming(false) }
  }

  async function handleHistorySelect(planId: number) {
    if (historyLoading) return
    setHistoryLoading(true)
    try { const detail = await backendApi.plan(planId); setViewedPlan(detail) }
    catch (err) { console.error("[NightPlanner] history fetch failed:", err) }
    finally { setHistoryLoading(false) }
  }

  // ── Focus handling ────────────────────────────────────────────────────────
  useEffect(() => {
    if (moves.length > 8 && !sel) setSel(moves[8].id)
  }, [moves])

  useEffect(() => {
    if (!focus) return
    const m = moves.find(x => x.id === focus) || moves.find(x => x.containerId === focus)
    if (m) { setSel(m.id); setTab("detail"); setFilter("ALL"); setQ("") }
    else { setQ(focus); setFilter("ALL"); setSel(""); setTab("detail") }
  }, [focus, moves])

  // ── Seed derived values ───────────────────────────────────────────────────
  const types = ["ALL","RETRIEVE_STAGE","PLACE_INBOUND","RESHUFFLE","LOAD_OUTBOUND"]
  const ql    = q.trim().toLowerCase()
  const rows  = moves.filter(m =>
    (filter === "ALL" || m.type === filter) &&
    (!ql || (m.containerId+m.from+m.to+m.operatorName+m.equipment+m.type).toLowerCase().includes(ql))
  )
  const selMoveRaw = moves.find(m => m.id === sel) || null
  const selMove    = selMoveRaw
    ? { ...selMoveRaw, ...(moveOverrides[selMoveRaw.id] || {}) }
    : null
  const onShift    = operators.filter(o => o.status === "on shift")
  const totalMin   = moves.reduce((a,m) => a+m.estMin, 0)
  const frozenCount = moves.filter(m => m.frozen).length
  const hotContainerIds = getHotContainers(CONTAINERS, 6)

  // ── Engine derived values ─────────────────────────────────────────────────
  const engineMoves = viewedPlan
    ? viewedPlan.moves.map(m => adaptMoveForDisplay(m, backendContainers, backendSlots, backendJockeys))
    : []
  const engineSelMove = engineMoves.find(m => m.id === engineSel) || engineMoves[0] || null

  const projection = [
    { k:"Truck turn P50",    target:"15.0′", opt:"11.8′", exp:"13.4′", pes:"17.1′", bandLeft:20, bandWidth:48, mark:66 },
    { k:"Truck turn P90",    target:"22.0′", opt:"18.2′", exp:"21.0′", pes:"27.4′", bandLeft:26, bandWidth:52, mark:70 },
    { k:"Job cycle P50",     target:"5.0′",  opt:"4.2′",  exp:"4.8′",  pes:"6.1′",  bandLeft:18, bandWidth:50, mark:62 },
    { k:"Plan adherence",    target:"≥85%",  opt:"94%",   exp:"89%",   pes:"78%",   bandLeft:22, bandWidth:56, mark:58 },
    { k:"Detention breaches",target:"0",     opt:"0",     exp:"0",     pes:"2",     bandLeft:10, bandWidth:40, mark:22 },
  ]

  // ── Step 3: Column toggle helper ─────────────────────────────────────────
  function toggleCol(col: Col) {
    setVisibleCols(prev => {
      const next = new Set(prev)
      if (next.has(col)) { if (next.size > 2) next.delete(col) } // keep at least 2
      else next.add(col)
      return next
    })
  }

  // ── Step 3: MoveRow — column-aware, 44px height, 11px font ───────────────
  type MoveRowData =
    | { source: "seed"; move: Move }
    | { source: "engine"; move: ReturnType<typeof adaptMoveForDisplay> }

  function MoveRow({ m, isSelected, onClick }: { m: MoveRowData; isSelected: boolean; onClick: () => void }) {
    const typeDisplay  = m.source === "seed" ? (TYPE_LABEL[m.move.type] ?? m.move.type) : m.move.typeLabel
    const stateDisplay = m.source === "seed" ? (m.move.state ?? "").toLowerCase() : m.move.stateLabel.toLowerCase()
    const isCompleted  = m.source === "seed"
      ? (m.move.state === "done" || m.move.state === "complete" || m.move.state === "completed")
      : (m.move.status === "done" || m.move.status === "cancelled")
    const frozen       = m.move.frozen
    const windowStr    = m.source === "seed" ? `${m.move.start}–${m.move.end}` : `seq ${m.move.sequence_number}`
    const isHot        = hotContainerIds.has(m.move.containerId)

    return (
      <tr
        onClick={onClick}
        className="cursor-pointer hover:bg-[#f9fafb] transition-colors"
        style={{
          background: isSelected ? "#fef3f2" : isHot ? "#fff8f5" : isCompleted ? "#fafafa" : undefined,
          borderBottom: "1px solid #f3f4f6",
          minHeight: 44,    // Step 3: increased from 38
        }}
      >
        {/* SEQ */}
        {visibleCols.has("SEQ") && (
          <td className="py-2.5 pl-4 pr-2.5 font-mono text-[#9ca3af]" style={{ fontSize: 11, borderLeft: `3px solid ${isSelected ? "#dc2626" : isHot ? "#f97316" : frozen ? "#ccc" : "transparent"}` }}>
            {String(m.move.seq).padStart(3,"0")}
          </td>
        )}
        {/* WINDOW */}
        {visibleCols.has("WINDOW") && (
          <td className="px-3 py-2.5 font-mono whitespace-nowrap" style={{ fontSize: 11 }}>{windowStr}</td>
        )}
        {/* MOVE */}
        {visibleCols.has("MOVE") && (
          <td className="px-3 py-2.5" style={{ fontSize: 11 }}>
            <div className="font-bold">{typeDisplay}</div>
            <div className="text-[10px] text-[#9ca3af] font-mono">
              {isHot && <span title="Hot container" className="mr-1">🔥</span>}
              {m.move.containerId}
            </div>
          </td>
        )}
        {/* ROUTE */}
        {visibleCols.has("ROUTE") && (
          <td className="px-3 py-2.5 font-mono text-[#374151] whitespace-nowrap" style={{ fontSize: 11 }}>{m.move.from} → {m.move.to}</td>
        )}
        {/* ASSIGNED */}
        {visibleCols.has("ASSIGNED") && (
          <td className="px-3 py-2.5 whitespace-nowrap" style={{ fontSize: 11 }}>
            <div>{m.move.operatorName}</div>
            <div className="text-[10px] text-[#9ca3af]">{m.move.equipment} · {stateDisplay}</div>
          </td>
        )}
        {/* EST */}
        {visibleCols.has("EST") && (
          <td className="px-3 py-2.5 text-right font-mono font-semibold" style={{ fontSize: 11 }}>{m.move.estMin.toFixed(1)}′</td>
        )}
      </tr>
    )
  }

  // ── Step 1: KPI data arrays ───────────────────────────────────────────────
  const primaryKpis = [
    { k:"Moves planned",    v:String(moves.length),        sub:"of 284 today",  red:false },
    { k:"Detention at risk",v:"$8.4k",                     sub:"next 72 h",     red:true  },
  ]
  const secondaryKpis = [
    { k:"Machine-hours",    v:(totalMin/60).toFixed(1),    sub:"of 32.0",       red:false },
    { k:"Truck turn P50",   v:"13.4′",                     sub:"target 15′",    red:false },
    { k:"Job cycle P50",    v:"4.8′",                      sub:"target 5′",     red:false },
    { k:"Exceptions",       v:String(exceptions.length),   sub:"unresolved",    red:true  },
  ]
  const engineKpis = viewedPlan ? [
    { k:"Moves",     v:String(viewedPlan.moves.length),                                         sub:"in this plan",  red:false },
    { k:"Strategy",  v:viewedPlan.strategy,                                                     sub:"solver",        red:false },
    { k:"Solve time",v:viewedPlan.solve_seconds != null ? viewedPlan.solve_seconds.toFixed(1)+"s":"—", sub:"wall clock",  red:false },
    { k:"Objective", v:viewedPlan.objective_value != null ? viewedPlan.objective_value.toFixed(2):"—", sub:"minimised",   red:false },
    { k:"Gap",       v:viewedPlan.gap_percent != null ? viewedPlan.gap_percent.toFixed(1)+"%":"—",     sub:"optimality",  red:false },
    { k:"Status",    v:viewedPlan.status.replace("_"," "),                                      sub:"plan state",    red:false },
  ] : []

  function KpiCell({ m }: { m: { k:string; v:string; sub:string; red:boolean } }) {
    return (
      <div className="flex-1 basis-36 px-5 py-2.5 border-r border-[#e5e7eb] flex flex-col gap-1">
        <span className="ds-label">{m.k}</span>
        <div className="flex items-baseline gap-2">
          <span className="font-mono font-semibold leading-none" style={{ fontSize: 24, color: m.red ? "#dc2626" : undefined }}>{m.v}</span>
          <span className="text-[11px] text-[#9ca3af]">{m.sub}</span>
        </div>
      </div>
    )
  }

  // ── Accordion helper ──────────────────────────────────────────────────────
  function AccordionHeader({ label, open, onToggle }: { label: string; open: boolean; onToggle: () => void }) {
    return (
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between px-4 py-2 text-left hover:bg-[#f9fafb] transition-colors"
        style={{ borderTop: "1px solid #e5e7eb" }}
      >
        <span className="ds-label font-bold">{label}</span>
        <span style={{ fontSize: 9, color: "#9ca3af" }}>{open ? "▲" : "▼"}</span>
      </button>
    )
  }

  return (
    <div className="relative flex flex-col h-full min-h-0 overflow-auto bg-[#f4f5f7] text-neutral-900">

      {/* ── Config overlay ───────────────────────────────────────────────────── */}
      {configOpen && (
        <>
          <div className="absolute inset-0 z-10 bg-black/40" onClick={() => setConfigOpen(false)} />
          <div className="absolute top-0 right-0 bottom-0 w-96 z-20 bg-white overflow-auto p-4" style={{ borderLeft: "1px solid #e5e7eb" }}>
            <div className="flex justify-between items-baseline">
              <div className="font-semibold text-base">Configure this plan</div>
              <button onClick={() => setConfigOpen(false)} className="text-xs text-[#9ca3af] hover:text-neutral-800">Close ✕</button>
            </div>
            <p className="text-[11px] text-[#9ca3af] mt-2 leading-relaxed">Weight changes take effect on the next generation, never against a published plan.</p>
            <div className="mt-4 ds-label font-bold">Objective weights</div>
            {["Vessel cutoff urgency","Machine minutes","Weighted lateness","Predicted rehandles","Detention exposure"].map((k, i) => (
              <div key={k} className="py-2 border-b border-[#f3f4f6]">
                <div className="flex justify-between text-[11.5px]"><span>{k}</span><span className="font-bold font-mono">{(wRaw[i]/100).toFixed(2)}</span></div>
                <input type="range" min={0} max={50} value={wRaw[i]}
                  onChange={e => { const w=[...wRaw]; w[i]=+e.target.value; setWRaw(w) }}
                  className="w-full mt-2 accent-[#dc2626]" />
              </div>
            ))}
            <div className="mt-4 ds-label font-bold">Stability</div>
            {[["Freeze window","20 min"],["In-progress immutable","true"],["Minimum improvement","8 machine-min"],["Reassign cap","2 / operator / hour"]].map(([k,v]) => (
              <div key={k} className="flex justify-between py-2 border-b border-[#f3f4f6] text-[11.5px]">
                <span className="text-[#374151]">{k}</span><span className="font-semibold font-mono">{v}</span>
              </div>
            ))}
            <Button className="w-full mt-4 text-xs" style={{ borderRadius:5, background:"#111827", color:"#fff" }} onClick={() => setConfigOpen(false)}>
              Apply on next regenerate
            </Button>
          </div>
        </>
      )}

      {/* ── Step 2: Assumptions & weights drawer ─────────────────────────────── */}
      {drawerOpen && (
        <>
          <div className="absolute inset-0 z-20 bg-black/30" onClick={() => setDrawerOpen(false)} />
          <div
            className="absolute top-0 left-0 bottom-0 z-30 bg-white flex flex-col overflow-auto"
            style={{ width: 300, borderRight: "1px solid #e5e7eb", boxShadow: "4px 0 16px rgba(0,0,0,0.12)" }}
          >
            <div className="flex items-center justify-between px-4 py-3 border-b border-[#e5e7eb]">
              <span className="font-semibold text-[13px]">Assumptions & weights</span>
              <button onClick={() => setDrawerOpen(false)} className="text-[#9ca3af] hover:text-neutral-800 text-[12px]">✕</button>
            </div>
            <div className="px-4 pt-3 pb-2 ds-label font-bold">Assumptions</div>
            {assumptions.map(a => (
              <div key={a.k} className="px-4 pb-2">
                <div className="text-[12px] font-semibold leading-tight">{a.v}</div>
                <div className="text-[10.5px] text-[#9ca3af] leading-tight">
                  {a.k} · <span className={/unanswered|unconfirmed|maintenance/.test(a.note)?"text-[#dc2626]":"text-[#9ca3af]"}>{a.note}</span>
                </div>
              </div>
            ))}
            <div className="h-px bg-[#e5e7eb] my-1 mx-4" />
            <div className="px-4 pt-3 pb-2 ds-label font-bold">Objective weights</div>
            {WEIGHTS.map(w => (
              <div key={w.k} className="px-4 pb-3 flex flex-col gap-1">
                <div className="flex justify-between text-[11.5px]">
                  <span>{w.k}</span><span className="font-bold font-mono">{w.v}</span>
                </div>
                <div className="h-px bg-[#e5e7eb] relative">
                  <div className="absolute left-0 top-0 h-px bg-[#111827]" style={{ width: w.pct+"%" }} />
                </div>
              </div>
            ))}
            <div className="h-px bg-[#e5e7eb] my-1 mx-4" />
            <div className="px-4 pt-3 pb-2 ds-label font-bold">Stability</div>
            {[["Freeze window","20 min"],["In-progress immutable","true"],["Min improvement","8 machine-min"],["Reassign cap","2 / op / h"]].map(([k,v]) => (
              <div key={k} className="flex justify-between px-4 pb-2 text-[11.5px]">
                <span className="text-[#374151]">{k}</span><span className="font-semibold font-mono">{v}</span>
              </div>
            ))}
          </div>
        </>
      )}

      {/* ── Header ───────────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-3 px-5 pt-3 pb-3 border-b border-[#e5e7eb] flex-none bg-white">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-base tracking-tight">Night-before plan</span>
            {planSource === "seed" && (
              <Badge variant={published ? "brand" : "muted"}>{published ? "PUBLISHED" : "DRAFT"}</Badge>
            )}
            {planSource === "engine" && viewedPlan && (
              <Badge variant={PLAN_STATUS_VARIANT[viewedPlan.status] ?? "muted"}>
                {viewedPlan.status.replace("_"," ").toUpperCase()}
              </Badge>
            )}
          </div>
          <div className="flex gap-3 text-[11px] text-[#9ca3af]">
            {planSource === "seed"
              ? <><span className="font-mono">P-2026-08-11</span><span>Generated <span className="font-mono">22:14</span></span><span>Engine <span className="font-mono">41.8 s</span></span><span>Snapshot <span className="font-mono">#a41f9c</span></span><span>Horizon <span className="font-mono">06:00–14:00</span></span></>
              : viewedPlan
              ? <><span>Plan <span className="font-mono">#{viewedPlan.id}</span></span><span className="font-mono">{viewedPlan.plan_date}</span>{viewedPlan.solve_seconds != null && <span>Solved in <span className="font-mono">{viewedPlan.solve_seconds.toFixed(1)} s</span></span>}{viewedPlan.solver_status && <span>Solver: {viewedPlan.solver_status}</span>}<span><span className="font-mono">{viewedPlan.moves.length}</span> moves</span></>
              : <span>No plan generated</span>
            }
          </div>
        </div>

        {/* Plan source toggle */}
        <div className="flex items-center gap-2 ml-2">
          <span className="ds-label whitespace-nowrap">Source</span>
          <div style={{ border:"1px solid #e5e7eb", borderRadius:5, overflow:"hidden", display:"flex" }}>
            {(["seed","engine"] as PlanSource[]).map(src => (
              <button key={src} disabled={src==="engine" && !backendConnected}
                onClick={() => setPlanSource(src)}
                className="text-[10.5px] px-3 py-1 font-semibold transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                style={{ background: planSource===src ? "#111827":"transparent", color: planSource===src ? "#fff":"#374151" }}
              >
                {src === "seed" ? "Seed data" : backendConnected ? "Planning engine" : "Engine offline"}
              </button>
            ))}
          </div>
        </div>

        {/* Step 2: Assumptions & weights button */}
        {planSource === "seed" && (
          <button
            onClick={() => setDrawerOpen(true)}
            className="text-xs px-3 py-1.5 text-[#374151] bg-white"
            style={{ border: "1px solid #e5e7eb", borderRadius: 5, whiteSpace: "nowrap" }}
          >
            Assumptions &amp; weights
          </button>
        )}

        {/* Action buttons */}
        <div className="ml-auto flex gap-2">
          {planSource === "seed" ? (
            <>
              <button className="text-xs px-3 py-1 text-[#374151] bg-white" style={{ border:"1px solid #e5e7eb", borderRadius:5 }} onClick={() => setConfigOpen(true)}>Configure</button>
              <button className="text-xs px-3 py-1 text-[#374151] bg-white" style={{ border:"1px solid #e5e7eb", borderRadius:5 }} onClick={() => setPublished(false)}>Regenerate</button>
              <button className="text-xs px-3 py-1 text-white disabled:opacity-50" style={{ background:"#111827", borderRadius:5, border:"1px solid #111827" }} onClick={handlePublish} disabled={publishing}>
                {publishing ? "Publishing…" : published ? "Published · view diff" : "Approve & publish"}
              </button>
            </>
          ) : (
            <>
              {plans.length > 0 && (
                <select disabled={historyLoading} onChange={e => handleHistorySelect(Number(e.target.value))} value={viewedPlan?.id ?? ""}
                  className="text-[11px] px-2 py-1 bg-white text-[#374151] disabled:opacity-50 font-mono" style={{ border:"1px solid #e5e7eb", borderRadius:5 }}>
                  <option value="" disabled>Plan history ({plans.length})</option>
                  {plans.map(p => <option key={p.id} value={p.id}>#{p.id} · {p.plan_date} · {p.status}</option>)}
                </select>
              )}
              <button className="text-xs px-3 py-1 text-[#374151] bg-white disabled:opacity-50" style={{ border:"1px solid #e5e7eb", borderRadius:5 }} onClick={handleGenerate} disabled={generating}>
                {generating ? "⟳ Solver running…" : "Generate plan"}
              </button>
              {viewedPlan?.status === "draft" && (
                <button className="text-xs px-3 py-1 text-white disabled:opacity-50" style={{ background:"#111827", borderRadius:5, border:"1px solid #111827" }} onClick={handleConfirm} disabled={confirming}>
                  {confirming ? "Confirming…" : "Confirm plan"}
                </button>
              )}
            </>
          )}
        </div>
      </div>

      {/* ── Plan banner ──────────────────────────────────────────────────────── */}
      {planSource === "seed" && (
        <div className="px-5 py-2 bg-[#f9fafb] border-b border-[#e5e7eb] text-[12px] leading-relaxed text-[#374151] flex-none">
          Plan, filter, and sequence today's {moves.length} moves across 3 reach stackers and 1 empty handler, ranked by free-time urgency, detention cost, hazmat handling, order priority, dig-out cost, gate pressure, customs channel, empty-return windows, damage state and dwell — with every placement carrying a one-sentence reason.
        </div>
      )}

      {/* ── Vessel schedule (seed mode) ──────────────────────────────────────── */}
      {planSource === "seed" && (
        <div className="flex-none overflow-x-auto border-b border-[#e5e7eb] bg-white" style={{ scrollbarWidth:"none" }}>
          <div className="flex gap-0 min-w-max">
            <div className="flex items-center px-4 py-2 border-r border-[#e5e7eb] flex-none">
              <span className="ds-label whitespace-nowrap">Vessel schedule</span>
            </div>
            {VESSEL_SCHEDULES.map(v => {
              const onBoardSet   = new Set(v.containersOnBoard)
              const inPlan       = moves.filter(m => onBoardSet.has(m.containerId)).length
              const isHotVessel  = hotContainerIds.size > 0 && v.containersOnBoard.some(id => hotContainerIds.has(id))
              return (
                <div key={v.voyage} className="flex items-center gap-4 px-4 py-2 border-r border-[#e5e7eb] flex-none" style={{ background: isHotVessel ? "#fff8f5" : undefined }}>
                  <div>
                    <div className="text-[12px] font-semibold leading-tight whitespace-nowrap">
                      {isHotVessel && <span className="mr-1">🔥</span>}{v.vesselName}
                      <span className="ml-1.5 font-mono text-[10.5px] text-[#9ca3af]">{v.voyage}</span>
                    </div>
                    <div className="flex gap-3 mt-0.5 text-[10.5px] text-[#9ca3af]">
                      <span>Berth <span className="font-mono text-[#374151]">{v.berthWindow}</span></span>
                      <span>Cutoff <span className="font-mono text-[#374151]">{v.cutoffTime}</span></span>
                      <span><span className="font-mono text-[#374151]">{inPlan}</span> moves in plan</span>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* ── Engine: no plan / spinner ─────────────────────────────────────────── */}
      {planSource === "engine" && !viewedPlan && !generating && (
        <div className="flex-1 flex items-center justify-center bg-[#f4f5f7]">
          <div className="bg-white px-8 py-8 max-w-sm text-center" style={{ border:"1px solid #e5e7eb", borderRadius:5 }}>
            <div className="font-semibold text-base mb-2">No plan generated yet</div>
            <div className="text-[12.5px] text-[#374151] leading-relaxed mb-5">The planning engine has no plan on record. Generate one to see the solver's move sequence.</div>
            <button className="text-xs px-4 py-2 text-white" style={{ background:"#111827", borderRadius:5 }} onClick={handleGenerate}>Generate plan (CP-SAT)</button>
          </div>
        </div>
      )}
      {planSource === "engine" && generating && (
        <div className="flex-1 flex items-center justify-center bg-[#f4f5f7]">
          <div className="text-center">
            <div className="text-[28px] mb-3 animate-spin select-none">⟳</div>
            <div className="font-semibold text-base">Solver running…</div>
            <div className="text-[12px] text-[#9ca3af] mt-1">CP-SAT optimising the move sequence</div>
          </div>
        </div>
      )}

      {/* ── Step 1: Collapsible KPI bar ──────────────────────────────────────── */}
      {(planSource === "seed" || (planSource === "engine" && viewedPlan && !generating)) && (
        <div className="flex-none border-b border-[#e5e7eb] bg-white">
          {/* Primary row: always visible */}
          <div className="flex items-stretch">
            {(planSource === "seed" ? primaryKpis : engineKpis.slice(0,2)).map(m => <KpiCell key={m.k} m={m} />)}
            <button
              onClick={() => setKpiExpanded(v => !v)}
              className="flex items-center gap-1.5 px-4 text-[11px] text-[#6b7280] hover:text-[#374151] hover:bg-[#f9fafb] transition-colors"
              style={{ borderLeft: "1px solid #e5e7eb", whiteSpace: "nowrap" }}
            >
              {kpiExpanded ? "Fewer metrics ▲" : "More metrics ▼"}
            </button>
          </div>
          {/* Secondary row: expandable with height transition */}
          <div style={{ overflow:"hidden", maxHeight: kpiExpanded ? 120 : 0, transition:"max-height 200ms ease" }}>
            <div className="flex border-t border-[#e5e7eb]">
              {(planSource === "seed" ? secondaryKpis : engineKpis.slice(2)).map(m => <KpiCell key={m.k} m={m} />)}
            </div>
          </div>
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════════════
          SEED MODE — Step 2: 2-column layout (no left col)
          ════════════════════════════════════════════════════════════════════ */}
      {planSource === "seed" && (
        <div className="grid flex-1 min-h-0 overflow-hidden" style={{ gridTemplateColumns: "minmax(360px,1fr) clamp(280px,28vw,380px)" }}>

          {/* ── Center: moves table ─────────────────────────────────────────── */}
          <div className="flex flex-col min-h-0 bg-white">
            {/* Table toolbar */}
            <div className="flex flex-wrap items-center gap-2 px-4 py-2 border-b border-[#e5e7eb] flex-none">
              <Input placeholder="Filter container, slot, operator…" value={q} onChange={e => setQ(e.target.value)} className="w-48 h-7 text-xs" />
              {/* Type filter */}
              <div style={{ border:"1px solid #e5e7eb", borderRadius:5, overflow:"hidden", display:"flex" }}>
                {types.map(t => (
                  <button key={t} onClick={() => setFilter(t)} className="text-[10.5px] px-2 py-1 font-semibold transition-colors"
                    style={{ background: filter===t ? "#111827":"transparent", color: filter===t ? "#fff":"#374151" }}>
                    {t === "ALL" ? "All" : TYPE_LABEL[t]}
                  </button>
                ))}
              </div>
              {/* Step 3: Column chooser */}
              <div ref={colChooserRef} className="relative">
                <button
                  onClick={() => setColChooserOpen(v => !v)}
                  className="flex items-center gap-1 px-2.5 py-1 text-[11px] text-[#374151]"
                  style={{ border:"1px solid #e5e7eb", borderRadius:5 }}
                >
                  Columns <span style={{ fontSize:8 }}>{colChooserOpen ? "▲" : "▼"}</span>
                </button>
                {colChooserOpen && (
                  <div className="absolute left-0 top-full mt-1 z-30 bg-white" style={{ border:"1px solid #e5e7eb", borderRadius:5, boxShadow:"0 4px 12px rgba(0,0,0,0.10)", padding:"6px 0", minWidth:140 }}>
                    {ALL_COLS.map(col => (
                      <label key={col} className="flex items-center gap-2 px-3 py-1.5 cursor-pointer hover:bg-[#f9fafb] text-[11px]">
                        <input type="checkbox" checked={visibleCols.has(col)} onChange={() => toggleCol(col)} className="accent-[#111827]" />
                        {col}
                      </label>
                    ))}
                  </div>
                )}
              </div>
              <span className="ml-auto text-[11px] text-[#9ca3af]">
                <span className="font-mono">{rows.length}</span> of <span className="font-mono">{moves.length}</span> · <span className="font-mono">{frozenCount}</span> frozen
              </span>
            </div>

            {/* Table */}
            <div className="flex-1 min-h-0 overflow-auto">
              <table className="w-full border-collapse" style={{ fontSize:11 }}>
                <thead>
                  <tr>
                    {ALL_COLS.filter(h => visibleCols.has(h)).map((h,i) => (
                      <th key={h} className="ds-th text-left sticky top-0 z-10"
                        style={{ paddingLeft: i===0 ? 16 : undefined, textAlign: h==="EST" ? "right" : undefined }}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.length === 0 ? (
                    <tr><td colSpan={visibleCols.size} className="px-4 py-4 text-[11px] text-[#9ca3af]">No moves match {q ? `"${q}"` : "this filter"}.</td></tr>
                  ) : rows.map(m => (
                    <MoveRow key={m.id} m={{ source:"seed", move:m }} isSelected={m.id===sel} onClick={() => { setSel(m.id); setTab("detail") }} />
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* ── Right: detail panel with accordions (Step 4) ───────────────── */}
          <div className="bg-white flex flex-col min-h-0" style={{ borderLeft:"1px solid #e5e7eb" }}>
            <Tabs value={tab} onValueChange={setTab} className="flex flex-col flex-1 min-h-0">
              <TabsList className="flex-none">
                <TabsTrigger value="detail">Move</TabsTrigger>
                <TabsTrigger value="exceptions">Exceptions {exceptions.length}</TabsTrigger>
                <TabsTrigger value="projection">Projected KPI</TabsTrigger>
              </TabsList>

              <TabsContent value="detail" className="flex-1 overflow-auto">
                {selMove ? (
                  <div>
                    {/* Move header */}
                    <div className="px-4 pt-3 pb-3 flex items-start justify-between gap-2">
                      <div>
                        <div className="ds-label"><span className="font-mono">{selMove.id}</span> · seq <span className="font-mono">{selMove.seq}</span></div>
                        <div className="font-semibold text-base mt-1 tracking-tight">{TYPE_LABEL[selMove.type]}</div>
                        <div className="text-[12px] mt-1 font-mono text-[#374151]">{selMove.containerId}</div>
                        <div className="text-[12px] font-mono text-[#9ca3af]">{selMove.from} → {selMove.to}</div>
                      </div>
                      {!editOpen && (
                        <button
                          onClick={() => {
                            setEditEquip(selMove.equipment)
                            const op = OPERATORS.find(o => o.equipment === selMove.equipment) || OPERATORS[0]
                            setEditOpId(selMove.operator || op.id)
                            setEditStart(selMove.start)
                            setEditEnd(selMove.end)
                            setEditOpen(true)
                          }}
                          className="flex-none flex items-center gap-1 text-[11px] font-medium text-[#374151] px-2 py-1 mt-0.5"
                          style={{ border:"1px solid #e5e7eb", borderRadius:5, background:"#fff", whiteSpace:"nowrap" }}
                          title="Edit assignment"
                        >
                          <span style={{ fontSize:12 }}>✎</span> Edit
                        </button>
                      )}
                    </div>

                    {/* Step 4: WHY THIS MOVE — always visible */}
                    <div className="ds-callout mx-4 mb-3">
                      <div className="ds-callout-label">Why this move</div>
                      <div className="text-[12.5px] leading-relaxed">{selMove.reason}</div>
                    </div>

                    {/* ── Inline edit form ─────────────────────────────────── */}
                    {editOpen && (() => {
                      const machineOps = OPERATORS.filter(o => o.equipment === editEquip)
                      const selectedOp = OPERATORS.find(o => o.id === editOpId)
                      return (
                        <div className="mx-4 mb-3 rounded-lg" style={{ border:"1px solid #e5e7eb", background:"#fafafa" }}>
                          <div className="px-3 pt-3 pb-2 flex items-center justify-between">
                            <span className="text-[11px] font-bold tracking-wider text-[#374151] uppercase">Edit assignment</span>
                            <button
                              onClick={() => setEditOpen(false)}
                              className="text-[#9ca3af] hover:text-[#374151] text-[13px] leading-none"
                              style={{ padding:"2px 5px" }}
                            >✕</button>
                          </div>

                          {/* Machine */}
                          <div className="px-3 pb-2">
                            <label className="text-[10.5px] text-[#9ca3af] font-medium block mb-1">Machine</label>
                            <select
                              value={editEquip}
                              onChange={e => {
                                setEditEquip(e.target.value)
                                const first = OPERATORS.find(o => o.equipment === e.target.value)
                                if (first) setEditOpId(first.id)
                              }}
                              className="w-full text-[12px] font-mono px-2 py-1.5 rounded"
                              style={{ border:"1px solid #e5e7eb", background:"#fff", color:"#374151" }}
                            >
                              {EQUIPMENT.map(eq => (
                                <option key={eq.id} value={eq.id}>
                                  {eq.id} — {eq.type} ({eq.status})
                                </option>
                              ))}
                            </select>
                          </div>

                          {/* Operator */}
                          <div className="px-3 pb-2">
                            <label className="text-[10.5px] text-[#9ca3af] font-medium block mb-1">Operator</label>
                            {machineOps.length > 0 ? (
                              <select
                                value={editOpId}
                                onChange={e => setEditOpId(e.target.value)}
                                className="w-full text-[12px] font-mono px-2 py-1.5 rounded"
                                style={{ border:"1px solid #e5e7eb", background:"#fff", color:"#374151" }}
                              >
                                {machineOps.map(op => (
                                  <option key={op.id} value={op.id}>
                                    {op.name} · {op.id} ({op.status})
                                  </option>
                                ))}
                              </select>
                            ) : (
                              <div className="text-[11.5px] text-[#9ca3af] px-2 py-1.5 rounded font-mono"
                                style={{ border:"1px solid #e5e7eb", background:"#f9fafb" }}>
                                No operators certified for {editEquip}
                              </div>
                            )}
                          </div>

                          {/* Window */}
                          <div className="px-3 pb-2">
                            <label className="text-[10.5px] text-[#9ca3af] font-medium block mb-1">Window</label>
                            <div className="flex items-center gap-2">
                              <input
                                type="text"
                                value={editStart}
                                onChange={e => setEditStart(e.target.value)}
                                placeholder="HH:MM"
                                className="flex-1 text-[12px] font-mono px-2 py-1.5 rounded text-center"
                                style={{ border:"1px solid #e5e7eb", background:"#fff", color:"#374151" }}
                              />
                              <span className="text-[11px] text-[#9ca3af]">→</span>
                              <input
                                type="text"
                                value={editEnd}
                                onChange={e => setEditEnd(e.target.value)}
                                placeholder="HH:MM"
                                className="flex-1 text-[12px] font-mono px-2 py-1.5 rounded text-center"
                                style={{ border:"1px solid #e5e7eb", background:"#fff", color:"#374151" }}
                              />
                            </div>
                          </div>

                          {/* Actions */}
                          <div className="px-3 pb-3 pt-1 flex gap-2">
                            <button
                              onClick={() => {
                                const op = OPERATORS.find(o => o.id === editOpId)
                                setMoveOverrides(prev => ({
                                  ...prev,
                                  [sel]: {
                                    ...prev[sel],
                                    equipment: editEquip,
                                    operator: editOpId,
                                    operatorName: op?.name || editOpId,
                                    start: editStart,
                                    end: editEnd,
                                  }
                                }))
                                setEditOpen(false)
                              }}
                              className="flex-1 text-[12px] font-semibold py-1.5 rounded text-white"
                              style={{ background:"#111827" }}
                            >
                              Save changes
                            </button>
                            <button
                              onClick={() => {
                                setMoveOverrides(prev => ({
                                  ...prev,
                                  [sel]: { ...prev[sel], passed: true }
                                }))
                                setEditOpen(false)
                              }}
                              className="flex-none text-[12px] font-semibold px-3 py-1.5 rounded"
                              style={{ border:"1px solid #dc2626", color:"#dc2626", background:"#fff5f5" }}
                            >
                              Pass move
                            </button>
                          </div>
                        </div>
                      )
                    })()}

                    {/* Key-value detail rows */}
                    {(() => {
                      const isPassed = !!(moveOverrides[sel]?.passed)
                      return [
                        ["Machine / operator", selMove.equipment+" · "+selMove.operatorName],
                        ["Window", selMove.start+"–"+selMove.end+" ("+selMove.estMin.toFixed(1)+"′)"],
                        ["Travel / lift / set-down", (selMove.estMin*0.45).toFixed(1)+" / "+(selMove.estMin*0.3).toFixed(1)+" / "+(selMove.estMin*0.25).toFixed(1)],
                        ["Order priority", selMove.priority],
                        ["State", isPassed ? "passed" : (selMove.frozen ? selMove.state.toLowerCase()+" · frozen" : selMove.state.toLowerCase())],
                        ["Weight snapshot", "WS-2026-08-10#a41f9c"],
                      ].map(([k,v]) => (
                        <div key={k} className="flex justify-between gap-3 px-4 py-2 border-b border-[#f3f4f6] text-[11.5px]">
                          <span className="text-[#9ca3af]">{k}</span>
                          <span className={`font-semibold font-mono text-right ${k==="State" && isPassed ? "text-[#9ca3af] line-through" : ""}`}>{v}</span>
                        </div>
                      ))
                    })()}

                    {/* Step 4: Hard constraints — accordion, default closed */}
                    <AccordionHeader label="Hard constraints" open={constraintsOpen} onToggle={() => setConstraintsOpen(v => !v)} />
                    <div style={{ overflow:"hidden", maxHeight: constraintsOpen ? 300 : 0, transition:"max-height 200ms ease" }}>
                      {[
                        ["C2","Stack height within zone max and reach envelope","PASS"],
                        ["C3","Row depth within machine reach","PASS"],
                        ["C4","Gross weight against capacity chart","PASS"],
                        ["C9","Operator certified for cargo class","PASS"],
                        ["C12","Destination zone below utilisation ceiling",selMove.to[0]==="C"?"AT CEILING":"PASS"],
                      ].map(([id,label,verdict]) => (
                        <div key={id} className="flex gap-2 items-baseline px-4 py-1.5 text-[11.5px]">
                          <span className="w-6 font-bold font-mono text-[#9ca3af]">{id}</span>
                          <span className="flex-1 text-[#374151] leading-tight">{label}</span>
                          <span className={`text-[10px] font-bold tracking-wider ${verdict==="AT CEILING"?"text-[#dc2626]":"text-[#9ca3af]"}`}>{verdict}</span>
                        </div>
                      ))}
                    </div>

                    {/* Step 4: Move history — accordion, default closed */}
                    <AccordionHeader label="Move history" open={moveHistoryOpen} onToggle={() => setMoveHistoryOpen(v => !v)} />
                    <div style={{ overflow:"hidden", maxHeight: moveHistoryOpen ? 200 : 0, transition:"max-height 200ms ease" }}>
                      {[
                        ["22:14","Sequenced by engine","auto"],
                        ["22:18","Weight snapshot locked","auto"],
                        ["05:48","Reviewed by dispatcher","manual"],
                      ].map(([time,event,src]) => (
                        <div key={time} className="flex items-baseline gap-3 px-4 py-1.5 text-[11.5px] border-b border-[#f9fafb]">
                          <span className="font-mono text-[#9ca3af] w-10">{time}</span>
                          <span className="flex-1 text-[#374151]">{event}</span>
                          <span className="text-[10px] text-[#9ca3af]">{src}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="px-4 py-4 text-[12.5px] leading-relaxed text-[#374151]">
                    {focus || q || "This container"} has no move in plan P-2026-08-11 — {moves.length} of 897 containers are moved today.
                  </div>
                )}
              </TabsContent>

              <TabsContent value="exceptions">
                <div>
                  {exceptions.map(e => (
                    <div key={e.id} className="px-4 py-3 border-b border-[#f3f4f6]">
                      <div className="flex justify-between items-baseline">
                        <span className={`text-[10px] font-bold tracking-wider ${e.severity==="high"?"text-[#dc2626]":"text-[#9ca3af]"}`}>{e.type}</span>
                        <span className="text-[10px] font-mono text-[#9ca3af]">{e.id}</span>
                      </div>
                      <div className="text-[13px] font-bold mt-1">{e.subject}</div>
                      <div className="text-[12px] leading-relaxed text-[#374151] mt-1">{e.detail}</div>
                      <button className="mt-2 text-[11.5px] px-3 py-1 text-[#374151] bg-white" style={{ border:"1px solid #e5e7eb", borderRadius:5 }}>{e.action}</button>
                    </div>
                  ))}
                  <div className="px-4 py-3 text-[11.5px] text-[#374151] leading-relaxed">Infeasible assignments escalate after three resequencing iterations.</div>
                </div>
              </TabsContent>

              <TabsContent value="projection">
                <div>
                  {projection.map(p => (
                    <div key={p.k} className="px-4 py-3 border-b border-[#f3f4f6]">
                      <div className="flex justify-between text-[11.5px]">
                        <span className="font-bold">{p.k}</span>
                        <span className="text-[#9ca3af]">target <span className="font-mono">{p.target}</span></span>
                      </div>
                      <div className="flex items-baseline gap-3 mt-1 text-[11px] text-[#9ca3af]">
                        <span className="font-mono">{p.opt}</span>
                        <span className="font-mono font-semibold leading-none text-neutral-900" style={{ fontSize:24 }}>{p.exp}</span>
                        <span className="font-mono">{p.pes}</span>
                      </div>
                      <div className="relative h-1 bg-[#f3f4f6] mt-2">
                        <div className="absolute top-0 h-1" style={{ left:p.bandLeft+"%", width:p.bandWidth+"%", background:"#fca5a5" }} />
                        <div className="absolute top-[-3px] h-2 w-px bg-neutral-900" style={{ left:p.mark+"%" }} />
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
          ENGINE MODE — two-column (unchanged)
          ════════════════════════════════════════════════════════════════════ */}
      {planSource === "engine" && viewedPlan && !generating && (
        <div className="grid flex-1 min-h-0 overflow-auto" style={{ gridTemplateColumns: "minmax(400px,1fr) clamp(280px,28vw,380px)" }}>
          <div className="flex flex-col min-h-0 bg-white">
            <div className="flex items-center gap-2 px-4 py-2 border-b border-[#e5e7eb] flex-none">
              <span className="text-[11px] text-[#9ca3af]"><span className="font-mono">{engineMoves.length}</span> moves · Plan <span className="font-mono">#{viewedPlan.id}</span></span>
            </div>
            <div className="flex-1 min-h-0 overflow-auto">
              <table className="w-full border-collapse" style={{ fontSize:11 }}>
                <thead>
                  <tr>
                    {ALL_COLS.filter(h => visibleCols.has(h)).map((h,i) => (
                      <th key={h} className="ds-th text-left sticky top-0 z-10"
                        style={{ paddingLeft: i===0 ? 16 : undefined, textAlign: h==="EST" ? "right" : undefined }}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {engineMoves.length === 0 ? (
                    <tr><td colSpan={visibleCols.size} className="px-4 py-4 text-[11px] text-[#9ca3af]">No moves in this plan.</td></tr>
                  ) : engineMoves.map(m => (
                    <MoveRow key={m.id} m={{ source:"engine", move:m }} isSelected={m.id===engineSel} onClick={() => setEngineSel(m.id)} />
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          <div className="bg-white flex flex-col min-h-0 overflow-auto" style={{ borderLeft:"1px solid #e5e7eb", width:300 }}>
            {engineSelMove ? (
              <div>
                <div className="px-4 pt-3 pb-3">
                  <div className="ds-label">Move <span className="font-mono">#{engineSelMove.id}</span> · seq <span className="font-mono">{engineSelMove.seq}</span></div>
                  <div className="font-semibold text-base mt-1 tracking-tight">{REASON_LABELS[engineSelMove.reason] ?? engineSelMove.typeLabel ?? "Move"}</div>
                  <div className="text-[12px] mt-1 font-mono text-[#374151]">{engineSelMove.containerId}</div>
                  <div className="text-[12px] font-mono text-[#9ca3af]">{engineSelMove.from} → {engineSelMove.to}</div>
                </div>
                {engineSelMove.reason && (
                  <div className="ds-callout mx-4 mb-3">
                    <div className="ds-callout-label">Why this move</div>
                    <div className="text-[12.5px] leading-relaxed">{REASON_LABELS[engineSelMove.reason] ?? engineSelMove.reason}</div>
                  </div>
                )}
                {[
                  ["Jockey / operator", engineSelMove.operatorName],
                  ["Est. duration", engineSelMove.estMin.toFixed(1)+"′"],
                  ["State", engineSelMove.stateLabel ?? "—"],
                  ["Frozen", engineSelMove.frozen ? "yes" : "no"],
                ].map(([k,v]) => (
                  <div key={k} className="flex justify-between gap-3 px-4 py-2 border-b border-[#f3f4f6] text-[11.5px]">
                    <span className="text-[#9ca3af]">{k}</span>
                    <span className="font-semibold font-mono text-right">{v}</span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="px-4 py-4 text-[12px] text-[#9ca3af] leading-relaxed">Select a move from the table to see its details.</div>
            )}
          </div>
        </div>
      )}

      {/* ── Step 5: Operator schedule — collapsed summary ─────────────────────── */}
      {planSource === "seed" && (
        <div className="flex-none border-t border-[#e5e7eb] bg-white">
          {/* Summary bar — always visible */}
          <div className="flex items-center gap-3 px-4 py-2">
            <span className="ds-label font-bold">Operator schedule</span>
            <span className="text-[11px] text-[#374151]">
              <span className="font-semibold">{onShift.length}</span> operators on shift
              <span className="text-[#9ca3af] mx-1.5">·</span>
              <span className="font-semibold">{frozenCount}</span> moves frozen
              <span className="text-[#9ca3af] mx-1.5">·</span>
              next break <span className="font-mono font-semibold">09:30</span>
            </span>
            <button
              onClick={() => setGanttExpanded(v => !v)}
              className="ml-auto text-[11px] px-2.5 py-1 text-[#374151]"
              style={{ border:"1px solid #e5e7eb", borderRadius:5 }}
            >
              {ganttExpanded ? "Collapse ▲" : "Show Gantt ▼"}
            </button>
          </div>

          {/* Full Gantt — expanded via max-height transition */}
          <div style={{ overflow:"hidden", maxHeight: ganttExpanded ? 200 : 0, transition:"max-height 220ms ease" }}>
            <div className="border-t border-[#e5e7eb]">
              <div className="px-4 py-1 text-[11px] text-[#9ca3af]">
                {published ? "Frozen window 20 min · in-progress moves immutable" : "Preview — freeze applies at publication"}
              </div>
              <div className="grid" style={{ gridTemplateColumns:"132px 1fr" }}>
                <div />
                <div className="flex border-b border-[#e5e7eb]">
                  {HOURS.map(h => (
                    <div key={h} className="flex-1 font-mono text-[9px] text-[#9ca3af] border-l border-[#e5e7eb] px-1 py-1">{h}</div>
                  ))}
                </div>
                {onShift.map(op => (
                  <div key={op.id} className="contents">
                    <div className="px-4 py-1 text-[11.5px] border-b border-[#e5e7eb] flex justify-between gap-2">
                      <span className="font-semibold">{op.name}</span>
                      <span className="text-[#9ca3af]">{op.equipment}</span>
                    </div>
                    <div className="relative h-8 border-b border-[#e5e7eb] border-l border-[#e5e7eb]">
                      {moves.filter(m => m.operator === op.id).map(m => (
                        <div key={m.id}
                          onClick={() => { setSel(m.id); setTab("detail") }}
                          title={m.id+" "+TYPE_LABEL[m.type]+" "+m.start+"–"+m.end}
                          className="absolute top-2 h-3 cursor-pointer hover:opacity-80"
                          style={{
                            left: ((m.startMin-360)/480*100).toFixed(2)+"%",
                            width: Math.max(0.5,(m.endMin-m.startMin)/480*100).toFixed(2)+"%",
                            background: m.id===sel ? "#dc2626" : m.frozen ? "#9ca3af" : "#111827",
                          }}
                        />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
