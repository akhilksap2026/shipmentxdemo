import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { useData } from "@/lib/DataContext"
import type { Event } from "@/data/yard-ops"
import { backendApi } from "@/lib/backend-api"
import type { BackendDisruption, DisruptionType, BackendMove } from "@/lib/backend-api"
import { computePlanDiff, slotAddressById, REASON_LABELS } from "@/lib/backend-adapters"

interface Props {
  focus: string | null
  onNavigate?: (target: string, focus?: string) => void
}

const CATS: Record<string, string> = {
  EQUIPMENT_FAILURE:"Equipment", CUSTOMS_CHANNEL_ASSIGNED:"Customs", SHIP_DELAY:"Vessel",
  DEPOT_REDIRECTION:"Depot", CONTAINER_NOT_FOUND:"Yard audit", APPOINTMENT_NO_SHOW:"Gate",
  DETENTION_BREACH:"Detention", AUDIT_DISCREPANCY:"Yard audit"
}

const DISRUPTION_OPTIONS: { value: DisruptionType; label: string }[] = [
  { value: "truck_accident",          label: "Truck accident" },
  { value: "ship_delay",              label: "Ship delay" },
  { value: "inspection_hold",         label: "Inspection hold" },
  { value: "out_of_sequence_arrival", label: "Out-of-sequence arrival" },
  { value: "jockey_unavailable",      label: "Jockey unavailable" },
]

const DISRUPTION_LABELS: Record<DisruptionType, string> = {
  truck_accident:          "Truck accident",
  ship_delay:              "Ship delay",
  inspection_hold:         "Inspection hold",
  out_of_sequence_arrival: "Out-of-sequence arrival",
  jockey_unavailable:      "Jockey unavailable",
}

const DISRUPTION_SEVERITY: Record<DisruptionType, "high" | "medium" | "low"> = {
  truck_accident:          "high",
  jockey_unavailable:      "high",
  inspection_hold:         "medium",
  ship_delay:              "medium",
  out_of_sequence_arrival: "low",
}

const SEVERITY_COLOR: Record<string, string> = {
  high:   "#dc2626",
  medium: "#d97706",
  low:    "#2563eb",
}

type EngineDiffRow = {
  moveId: string; action: string; type: string; before: string; after: string; note: string
}
type EngineDiffStats = {
  cancelled: number; added: number; reassigned: number; frozenKept: number; deltaMin: number | string; adherence: number | string
}


export default function ControlTower({ focus, onNavigate }: Props) {
  const {
    events, diffRows,
    backendConnected, activePlan, backendContainers, backendSlots, backendJockeys,
    createDisruption,
  } = useData()

  // ── Existing state (unchanged) ────────────────────────────────────────────
  const [sel,   setSel]   = useState("")
  const [cat,   setCat]   = useState("ALL")
  const [acked, setAcked] = useState<Set<string>>(new Set())

  // ── New engine state ──────────────────────────────────────────────────────
  const [modalOpen,        setModalOpen]        = useState(false)
  const [modalType,        setModalType]        = useState<DisruptionType>("truck_accident")
  const [modalContainer,   setModalContainer]   = useState<number | "">("")
  const [modalJockey,      setModalJockey]      = useState<number | "">("")
  const [modalDescription, setModalDescription] = useState("")
  const [modalSearch,      setModalSearch]      = useState("")
  const [injecting,        setInjecting]        = useState(false)

  const [localDisruptions, setLocalDisruptions] = useState<BackendDisruption[]>([])
  const [replanBanner,     setReplanBanner]     = useState<{ id: number; added: number; cancelled: number; reassigned: number } | null>(null)
  const [engineDiffRows,   setEngineDiffRows]   = useState<EngineDiffRow[] | null>(null)
  const [engineDiffStats,  setEngineDiffStats]  = useState<EngineDiffStats | null>(null)

  // ── Existing effects (unchanged) ──────────────────────────────────────────
  useEffect(() => {
    if (!sel && events.length > 0) setSel(events[0].id)
  }, [events, sel])

  useEffect(() => {
    if (!focus) return
    const e = events.find(x => x.id === focus)
      || events.find(x => x.title.includes(focus) || x.detail.includes(focus))
    if (e) setSel(e.id)
  }, [focus, events])

  // ── Derived (unchanged) ───────────────────────────────────────────────────
  const cats = ["ALL", ...Array.from(new Set(events.map(e => CATS[e.type] || e.type)))]
  const filtered = events.filter(e => cat==="ALL" || CATS[e.type]===cat)
  const selEvent = filtered.find(e => e.id===sel) || events.find(e => e.id===sel) || filtered[0] || events[0]

  const ackedEvent     = selEvent ? acked.has(selEvent.id) : false
  const awaitingCount  = events.filter(e => e.state === "awaiting" && !acked.has(e.id)).length

  function stateLine(e: Event) {
    if (e.state === "replanned")  return "Replanned · " + e.auto
    if (e.state === "suppressed") return "Suppressed by stability rules"
    return acked.has(e.id) ? "Acknowledged" : "Awaiting acknowledgement"
  }

  // ── Engine: inject disruption ─────────────────────────────────────────────
  async function handleInject() {
    if (injecting) return
    setInjecting(true)
    try {
      const disruption = await createDisruption({
        event_type:             modalType,
        affected_container_id:  modalContainer !== "" ? modalContainer : undefined,
        affected_jockey_id:     modalType === "jockey_unavailable" && modalJockey !== "" ? modalJockey : undefined,
        description:            modalDescription || DISRUPTION_LABELS[modalType],
      })
      if (!disruption) return

      // Record locally
      setLocalDisruptions(prev => [disruption, ...prev])

      // If a replan was triggered, fetch it and compute diff
      if (disruption.triggered_replan_id != null) {
        try {
          const newPlan = await backendApi.plan(disruption.triggered_replan_id)
          const oldMoves: BackendMove[] = activePlan?.moves ?? []
          const newMoves: BackendMove[] = newPlan.moves

          const diff = computePlanDiff(oldMoves, newMoves)

          // Build engine diff rows
          const rows: EngineDiffRow[] = [
            ...diff.cancelled.map(m => ({
              moveId: `M-${m.id}`,
              action: "CANCELLED",
              type:   REASON_LABELS[m.reason] ?? m.reason,
              before: slotAddressById(m.to_slot_id, backendSlots),
              after:  "—",
              note:   "Removed in replan",
            })),
            ...diff.added.map(m => ({
              moveId: `M-${m.id}`,
              action: "ADDED",
              type:   REASON_LABELS[m.reason] ?? m.reason,
              before: "—",
              after:  slotAddressById(m.to_slot_id, backendSlots),
              note:   "New move in replan",
            })),
            ...diff.reassigned.map(m => {
              const old = oldMoves.find(o => o.container_id === m.container_id)
              return {
                moveId: `M-${m.id}`,
                action: "REASSIGNED",
                type:   REASON_LABELS[m.reason] ?? m.reason,
                before: slotAddressById(old?.to_slot_id ?? null, backendSlots),
                after:  slotAddressById(m.to_slot_id, backendSlots),
                note:   old?.jockey_id !== m.jockey_id ? "Jockey reassigned" : "Route changed",
              }
            }),
          ]

          setEngineDiffRows(rows)
          setEngineDiffStats({
            cancelled:  diff.cancelled.length,
            added:      diff.added.length,
            reassigned: diff.reassigned.length,
            frozenKept: diff.held.length,
            deltaMin:   `+${diff.added.length * 5}`,
            adherence:  diff.reassigned.length > 0 ? "-3" : "0",
          })
          setReplanBanner({
            id:         disruption.triggered_replan_id,
            added:      diff.added.length,
            cancelled:  diff.cancelled.length,
            reassigned: diff.reassigned.length,
          })
        } catch (err) {
          console.error("[ControlTower] failed to fetch replan detail:", err)
          setReplanBanner({ id: disruption.triggered_replan_id, added: 0, cancelled: 0, reassigned: 0 })
        }
      }

      // Reset and close modal
      setModalOpen(false)
      setModalDescription("")
      setModalSearch("")
      setModalContainer("")
      setModalJockey("")
      setModalType("truck_accident")
    } finally {
      setInjecting(false)
    }
  }

  // ── Filtered container list for modal picker ──────────────────────────────
  const containerOptions = backendContainers.filter(c =>
    !modalSearch || c.container_number.toLowerCase().includes(modalSearch.toLowerCase())
  ).slice(0, 20)

  // ── Active diff rows and stats (engine overrides seed) ────────────────────
  const activeDiffRows = engineDiffRows ?? diffRows
  const activeDiffStats = engineDiffStats ?? (selEvent ? selEvent.diff : null)

  if (!selEvent) return null

  return (
    <div className="flex flex-col h-full min-h-0 overflow-auto bg-[#f4f5f7] text-neutral-900">

      {/* ── Disruption modal ─────────────────────────────────────────────── */}
      {modalOpen && (
        <>
          <div className="fixed inset-0 z-20 bg-black/40" onClick={() => setModalOpen(false)} />
          <div
            className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-30 w-[420px] bg-white"
            style={{ border: "1px solid #e5e7eb", borderRadius: 5 }}
          >
            <div className="flex items-center justify-between px-5 pt-4 pb-3 border-b border-[#e5e7eb]">
              <div className="font-semibold text-[15px]">Simulate disruption</div>
              <button onClick={() => setModalOpen(false)} className="text-neutral-400 hover:text-neutral-800 text-sm">✕</button>
            </div>
            <div className="px-5 py-4 flex flex-col gap-4">

              {/* Event type */}
              <div>
                <div className="ds-label mb-1">Event type</div>
                <select
                  value={modalType}
                  onChange={e => { setModalType(e.target.value as DisruptionType); setModalJockey("") }}
                  className="w-full border border-[#e5e7eb] px-3 py-2 text-[12.5px] bg-white"
                  style={{ borderRadius: 5 }}
                >
                  {DISRUPTION_OPTIONS.map(o => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </div>

              {/* Container picker */}
              <div>
                <div className="ds-label mb-1">
                  Affected container <span className="normal-case text-neutral-400 tracking-normal">(optional)</span>
                </div>
                <input
                  type="text"
                  placeholder="Search container number…"
                  value={modalSearch}
                  onChange={e => { setModalSearch(e.target.value); setModalContainer("") }}
                  className="w-full border border-[#e5e7eb] px-3 py-2 text-[12.5px] mb-1"
                  style={{ borderRadius: 5 }}
                />
                {modalSearch && containerOptions.length > 0 && (
                  <div className="border border-[#e5e7eb] max-h-28 overflow-auto" style={{ borderRadius: 5 }}>
                    {containerOptions.map(c => (
                      <button
                        key={c.id}
                        onClick={() => { setModalContainer(c.id); setModalSearch(c.container_number) }}
                        className="block w-full text-left px-3 py-1 text-[12px] hover:bg-[#f9fafb]"
                        style={{ background: modalContainer === c.id ? "#fef3f2" : undefined }}
                      >
                        <span className="font-mono">{c.container_number}</span> · <span className="font-mono">{c.size_ft}</span>ft · {c.status}
                      </button>
                    ))}
                  </div>
                )}
                {backendContainers.length === 0 && (
                  <div className="text-[11px] text-neutral-400">No containers loaded from backend</div>
                )}
              </div>

              {/* Jockey picker — only for jockey_unavailable */}
              {modalType === "jockey_unavailable" && (
                <div>
                  <div className="ds-label mb-1">Affected jockey</div>
                  <select
                    value={modalJockey}
                    onChange={e => setModalJockey(e.target.value === "" ? "" : Number(e.target.value))}
                    className="w-full border border-[#e5e7eb] px-3 py-2 text-[12.5px] bg-white"
                    style={{ borderRadius: 5 }}
                  >
                    <option value="">— none —</option>
                    {backendJockeys.map(j => (
                      <option key={j.id} value={j.id}>{j.name} · {j.status}</option>
                    ))}
                  </select>
                </div>
              )}

              {/* Description */}
              <div>
                <div className="ds-label mb-1">
                  Description <span className="normal-case text-neutral-400 tracking-normal">(optional)</span>
                </div>
                <textarea
                  rows={2}
                  placeholder={`Describe the ${DISRUPTION_LABELS[modalType].toLowerCase()}…`}
                  value={modalDescription}
                  onChange={e => setModalDescription(e.target.value)}
                  className="w-full border border-[#e5e7eb] px-3 py-2 text-[12.5px] resize-none"
                  style={{ borderRadius: 5 }}
                />
              </div>
            </div>
            <div className="px-5 pb-4 flex justify-between items-center">
              <button
                onClick={() => setModalOpen(false)}
                className="text-xs px-3 py-2 border border-[#e5e7eb] text-[#374151] bg-white"
                style={{ borderRadius: 5 }}
              >
                Cancel
              </button>
              <button
                onClick={handleInject}
                disabled={injecting}
                className="text-xs px-3 py-2 text-white"
                style={{ background: "#111827", borderRadius: 5, opacity: injecting ? 0.6 : 1 }}
              >
                {injecting ? "Injecting…" : "Inject disruption"}
              </button>
            </div>
          </div>
        </>
      )}

      {/* ── Header ───────────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-4 px-5 pt-3 pb-3 border-b border-[#e5e7eb] flex-none bg-white">
        <div className="flex flex-col gap-1">
          <span className="font-semibold text-[19px] tracking-tight">Tower</span>
          <span className="text-[11px] text-neutral-500">Every event that matters — equipment, customs, detention, appointments, yard audit — with the replan diff attached</span>
        </div>
        <div className="ml-auto flex gap-2">
          {/* Simulate disruption button */}
          <div title={!backendConnected ? "Requires backend connection" : undefined}>
            <button
              disabled={!backendConnected}
              onClick={() => setModalOpen(true)}
              className="text-xs px-3 py-2 border border-[#e5e7eb] text-[#374151] bg-white"
              style={{ borderRadius: 5, opacity: !backendConnected ? 0.5 : 1 }}
            >
              Simulate disruption
            </button>
          </div>
          <button
            onClick={() => selEvent && setAcked(prev => new Set(prev).add(selEvent.id))}
            disabled={ackedEvent}
            className="text-xs px-3 py-2 text-white"
            style={{ background: "#111827", borderRadius: 5, opacity: ackedEvent ? 0.5 : 1 }}
          >
            {ackedEvent ? "Acknowledged" : "Acknowledge selected event"}
          </button>
        </div>
      </div>

      {/* ── Replan banner ─────────────────────────────────────────────────── */}
      {replanBanner && (
        <div className="flex items-center gap-3 px-5 py-2 border-b border-[#e5e7eb] flex-none bg-white">
          <span className="text-[11px] font-semibold tracking-wide" style={{ color: "#059669" }}>REPLAN GENERATED</span>
          <span className="text-[12.5px] text-neutral-700">
            Plan <span className="font-mono">#{replanBanner.id}</span> — <span className="font-mono">{replanBanner.reassigned}</span> reassigned · <span className="font-mono">{replanBanner.added}</span> added · <span className="font-mono">{replanBanner.cancelled}</span> cancelled
          </span>
          <button
            className="ml-auto text-[10.5px] font-semibold"
            style={{ color: "#059669" }}
            onClick={() => { setReplanBanner(null); setEngineDiffRows(null); setEngineDiffStats(null) }}
          >
            Dismiss ✕
          </button>
        </div>
      )}

      {/* ── Metrics ───────────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap border-b border-[#e5e7eb] flex-none bg-white">
        {[
          {k:"Events today",v:String(events.length + localDisruptions.length),sub:"since 05:41"},
          {k:"Replans accepted",v:String(5 + (replanBanner ? 1 : 0)),sub:"1 suppressed"},
          {k:"Stability index",v:"0.31",sub:"cap 0.40"},
          {k:"Plan adherence",v:"89%",sub:"target ≥85%"},
          {k:"Awaiting acknowledgement",v:String(awaitingCount),sub:awaitingCount>0?"needs attention":"all clear",red:awaitingCount>0},
        ].map(m=>(
          <div key={m.k} className="flex-1 basis-36 px-5 py-2 border-r border-[#e5e7eb] flex flex-col gap-1">
            <span className="ds-label">{m.k}</span>
            <div className="flex items-baseline gap-2">
              <span
                className="font-mono font-semibold leading-none"
                style={{ fontSize: 26, color: m.red ? "#dc2626" : undefined }}
              >{m.v}</span>
              <span className="text-[11px] text-neutral-500">{m.sub}</span>
            </div>
          </div>
        ))}
      </div>

      {/* ── Main grid ─────────────────────────────────────────────────────────── */}
      <div className="grid flex-1 min-h-0 overflow-auto" style={{gridTemplateColumns:"clamp(260px,26vw,360px) minmax(340px,1fr)"}}>

        {/* Event list (left column) */}
        <div className="border-r border-[#e5e7eb] flex flex-col overflow-auto bg-white">

          {/* ── Category filter pills ─────────────────────────────────────── */}
          <div className="px-4 py-2 border-b border-[#e5e7eb]">
            <div style={{ border: "1px solid #e5e7eb", borderRadius: 5, overflow: "hidden", display: "flex", flexWrap: "wrap" }}>
              {cats.map(c=>(
                <button
                  key={c}
                  onClick={()=>setCat(c)}
                  className="text-[10.5px] px-2 py-1 font-semibold transition-colors"
                  style={{
                    background: cat===c ? "#111827" : "transparent",
                    color: cat===c ? "#fff" : "#374151",
                    border: "none",
                    outline: "none",
                  }}
                >
                  {c==="ALL"?"All events":c}
                </button>
              ))}
            </div>
          </div>

          {/* ── Seed events ───────────────────────────────────────────────── */}
          {filtered.map(e=>(
            <button key={e.id} onClick={()=>setSel(e.id)}
              className="block w-full text-left px-4 py-3 border-b border-[#f3f4f6] hover:bg-[#f9fafb] transition-colors"
              style={{
                borderLeft:`3px solid ${e.id===sel?"#dc2626":e.state==="awaiting"&&!acked.has(e.id)?"#d97706":"transparent"}`,
                background: e.id===sel ? "#fef3f2" : (e.state === "replanned" ? "#fafafa" : undefined),
                minHeight: 38,
              }}>
              <div className="flex justify-between gap-2">
                <span className="ds-label" style={{color:e.severity==="high"?"#dc2626":"#9ca3af"}}>{CATS[e.type]||e.type}</span>
                <span className="ds-label font-mono">{e.time}</span>
              </div>
              <div className="text-[12.5px] font-semibold mt-1 leading-tight">{e.title}</div>
              <div className="text-[11px] text-neutral-500 mt-1">{stateLine(e)}</div>
            </button>
          ))}

          {/* ── Backend disruptions section ───────────────────────────────── */}
          {localDisruptions.length > 0 && (
            <>
              <div className="px-4 py-2 bg-[#f9fafb] border-b border-t border-[#e5e7eb]">
                <span className="ds-label">Backend disruptions</span>
                <span className="ml-2 text-[10px] text-neutral-400 font-mono">{localDisruptions.length} this session</span>
              </div>
              {localDisruptions.map(d => {
                const sev = DISRUPTION_SEVERITY[d.event_type] ?? "low"
                const color = SEVERITY_COLOR[sev]
                const ts = new Date(d.occurred_at)
                const timeStr = `${String(ts.getHours()).padStart(2,"0")}:${String(ts.getMinutes()).padStart(2,"0")}`
                return (
                  <div key={d.id} className="px-4 py-3 border-b border-[#f3f4f6]"
                    style={{ borderLeft: `3px solid ${color}`, minHeight: 38 }}>
                    <div className="flex justify-between gap-2">
                      <span className="ds-label" style={{ color }}>{DISRUPTION_LABELS[d.event_type]}</span>
                      <span className="ds-label font-mono">{timeStr}</span>
                    </div>
                    <div className="text-[12px] mt-1 leading-tight text-neutral-800">{d.description}</div>
                    {d.triggered_replan_id != null && (
                      <button
                        className="mt-1 text-[11px] font-semibold hover:underline"
                        style={{ color: "#2563eb" }}
                        onClick={() => onNavigate?.("plan", String(d.triggered_replan_id))}
                      >
                        → Replan <span className="font-mono">#{d.triggered_replan_id}</span>
                      </button>
                    )}
                    {d.triggered_replan_id == null && (
                      <div className="mt-1 text-[10.5px] text-neutral-400">No replan triggered</div>
                    )}
                  </div>
                )
              })}
            </>
          )}
        </div>

        {/* Event detail (right column) */}
        <div className="flex flex-col min-h-0 overflow-auto bg-white" style={{ borderLeft: "1px solid #e5e7eb" }}>
          <div className="px-4 pt-3 pb-3 border-b border-[#e5e7eb]">
            <div className="ds-label">
              <span className="font-mono">{selEvent.id}</span> · <span className="font-mono">{selEvent.time}</span> · resolution <span className="font-mono">{selEvent.auto}</span>
            </div>
            <div className="font-semibold text-[17px] mt-1 tracking-tight">{selEvent.title}</div>
            <div className="text-[12.5px] leading-relaxed mt-1 max-w-2xl text-neutral-700">{selEvent.detail}</div>
          </div>

          {/* Diff stats (engine overrides seed) */}
          {activeDiffStats && (
            <div className="flex flex-wrap border-b border-[#e5e7eb]">
              {[
                {k:"Cancelled",   v:activeDiffStats.cancelled},
                {k:"Added",       v:activeDiffStats.added},
                {k:"Reassigned",  v:activeDiffStats.reassigned},
                {k:"Frozen kept", v:activeDiffStats.frozenKept, muted:true},
                {k:"Δ machine-min",v:activeDiffStats.deltaMin,  red:true},
                {k:"Δ adherence", v:typeof activeDiffStats.adherence === "number"
                  ? (activeDiffStats.adherence>=0?"+":"")+activeDiffStats.adherence+"%"
                  : String(activeDiffStats.adherence)+"%",
                  red: typeof activeDiffStats.adherence === "number" ? activeDiffStats.adherence < 0 : String(activeDiffStats.adherence).startsWith("-")},
              ].map(p=>(
                <div key={p.k} className="flex-1 basis-28 px-4 py-2 border-r border-[#e5e7eb]">
                  <div className="ds-label">{p.k}</div>
                  <div
                    className="font-mono font-semibold leading-none"
                    style={{ fontSize: 26, color: p.red ? "#dc2626" : p.muted ? "#9ca3af" : undefined }}
                  >{String(p.v)}</div>
                </div>
              ))}
            </div>
          )}

          {selEvent.state==="suppressed" ? (
            <div className="px-4 py-4 max-w-2xl">
              <div className="font-semibold text-[15px]">Replan suppressed by the stability controller</div>
              <div className="text-[12.5px] leading-relaxed mt-2 text-neutral-700">The optimiser found a cheaper sequence, but the saving was <span className="font-mono">3.2</span> machine-minutes against a minimum-improvement threshold of <span className="font-mono">8</span>. Nothing was published, no operator queue changed, and the decision is written to the audit trail with the rejected candidate attached.</div>
              <div className="text-[12.5px] leading-relaxed mt-2 text-neutral-500">Suppression is the feature — a plan the operators can trust beats one that oscillates for marginal gains.</div>
            </div>
          ) : (
            <div className="flex-1 min-h-0 overflow-auto">
              <div className="px-4 pt-3 pb-1 flex items-baseline gap-2">
                <span className="ds-label">
                  {engineDiffRows ? "Engine replan diff" : "Replan diff against baseline"}
                </span>
                {engineDiffRows && (
                  <span className="text-[10px] font-semibold font-mono" style={{ color: "#059669" }}>
                    from live replan · {engineDiffRows.length} rows
                  </span>
                )}
              </div>
              <table className="w-full border-collapse text-[12px]">
                <thead>
                  <tr>
                    {["MOVE","BASELINE","REVISED","WHY"].map((h,i)=>(
                      <th key={h} className="ds-th text-left"
                        style={{paddingLeft:i===0?"18px":"12px",paddingRight:i===3?"18px":"12px"}}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {activeDiffRows.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="px-4 py-4 text-[12px] text-neutral-400">
                        {engineDiffRows !== null ? "No diff — plan is identical to baseline." : "No diff rows for this event."}
                      </td>
                    </tr>
                  ) : activeDiffRows.map((r, idx) => (
                    <tr
                      key={(r as {moveId:string}).moveId + idx}
                      className="border-b border-[#f3f4f6]"
                      style={{ minHeight: 38 }}
                    >
                      <td className="py-2 pl-4 pr-2 align-top">
                        <div className="font-mono font-semibold">{(r as {moveId:string}).moveId}</div>
                        <div className="ds-label" style={{
                          color:
                            (r as {action:string}).action==="CANCELLED" ? "#dc2626" :
                            (r as {action:string}).action==="ADDED"     ? "#059669" :
                            (r as {action:string}).action==="HELD"      ? "#9ca3af" : "#d97706"
                        }}>{(r as {action:string}).action}</div>
                        <div className="text-[11px] text-neutral-500">{(r as {type:string}).type}</div>
                      </td>
                      <td className="px-3 py-2 align-top text-neutral-500 font-mono">{(r as {before:string}).before}</td>
                      <td className="px-3 py-2 align-top font-mono font-semibold">{(r as {after:string}).after}</td>
                      <td className="px-4 py-2 pl-3 align-top text-neutral-700 leading-relaxed">{(r as {note:string}).note}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
