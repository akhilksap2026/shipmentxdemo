import { useState, useEffect, useRef } from "react"
import { Button } from "@/components/ui/button"
import { useData } from "@/lib/DataContext"
import type { Visit } from "@/data/yard-ops"
import { backendApi } from "@/lib/backend-api"
import type { BackendGateTransaction } from "@/lib/backend-api"
import ContainerPicker from "@/components/ContainerPicker"
import { computeRehandleCost } from "@/lib/utils"

interface Props { focus: string | null }

const STEPS = ["EXPECTED","APPROACHING","IN_QUEUE","CHECKED_IN","AT_POSITION","SERVED","GATE_OUT"]

const LANE_STYLE: Record<string, [string,string,string]> = {
  free:     ["transparent","#9ca3af","#374151"],
  occupied: ["#1f2937",   "#1f2937","#fff"],
  assigned: ["#fef2f2",   "#dc2626","#9b1c1c"],
  clearing: ["#f3f4f6",   "#6b7280","#111827"],
  staged:   ["#e5e7eb",   "#6b7280","#111827"],
  loading:  ["#dc2626",   "#dc2626","#fff"],
}

const EXCL_REASONS = [
  "Driver early — appointment not yet open",
  "Container not pre-cleared by customs",
  "Weight discrepancy vs. booking",
  "Driver documents incomplete",
]

// Step 3: visit table column definitions
const VISIT_COLS = ["TRUCK","LIFECYCLE","TURN","PURPOSE","CONTAINER","APPT","EXCLUSION"] as const
type VisitCol = typeof VISIT_COLS[number]
const DEFAULT_VISIT_COLS = new Set<VisitCol>(["TRUCK","LIFECYCLE","TURN"])
const VISIT_COL_LABELS: Record<VisitCol, string> = {
  TRUCK: "TRUCK", LIFECYCLE: "STATE", TURN: "TURN",
  PURPOSE: "PURPOSE", CONTAINER: "CONTAINER", APPT: "APPT", EXCLUSION: "EXCLUSION",
}

export default function GateConsole({ focus }: Props) {
  const { visits, lanes, appointments, refresh, backendConnected, backendContainers, containers } = useData()

  // ── Existing state ────────────────────────────────────────────────────────
  const [tab,          setTab]         = useState("visits")
  const [sel,          setSel]         = useState("V-2043")
  const [apptSel,      setApptSel]     = useState("07:30")
  const [smoothed,     setSmoothed]    = useState(false)
  const [checkingIn,   setCheckingIn]  = useState(false)
  const [checkInDone,  setCheckInDone] = useState(false)
  const [eirDone,      setEirDone]     = useState(false)
  const [exclOpen,     setExclOpen]    = useState(false)
  const [exclReason,   setExclReason]  = useState<string|null>(null)

  // ── Gate transactions state ───────────────────────────────────────────────
  const [transactions,    setTransactions]    = useState<BackendGateTransaction[]>([])
  const [txLoading,       setTxLoading]       = useState(false)
  const [showGateInForm,  setShowGateInForm]  = useState(false)
  const [gateInContId,    setGateInContId]    = useState<number | "">("")
  const [gateInPlate,     setGateInPlate]     = useState("")
  const [gateInDriver,    setGateInDriver]    = useState("")
  const [gateInCarrier,   setGateInCarrier]   = useState("")
  const [submittingGateIn,setSubmittingGateIn]= useState(false)
  const [gateOutLoading,  setGateOutLoading]  = useState<number | null>(null)
  const [turnaroundToast, setTurnaroundToast] = useState<string | null>(null)
  const toastTimeout = useRef<ReturnType<typeof setTimeout> | null>(null)

  // ── New state: Steps 1–4 ─────────────────────────────────────────────────
  const [kpiExpanded,     setKpiExpanded]     = useState(false)          // Step 1
  const [lanesExpanded,   setLanesExpanded]   = useState(false)          // Step 2
  const [visibleCols,     setVisibleCols]     = useState<Set<VisitCol>>(new Set(DEFAULT_VISIT_COLS)) // Step 3
  const [colChooserOpen,  setColChooserOpen]  = useState(false)          // Step 3
  const [receiptOpen,     setReceiptOpen]     = useState(false)          // Step 4
  const [eirPhotosOpen,   setEirPhotosOpen]   = useState(false)          // Step 4
  const [moreActionsOpen, setMoreActionsOpen] = useState(false)          // Step 4
  const colChooserRef  = useRef<HTMLDivElement>(null)
  const moreActionsRef = useRef<HTMLDivElement>(null)

  // ── Outside-click closes ──────────────────────────────────────────────────
  useEffect(() => {
    if (!colChooserOpen) return
    const h = (e: MouseEvent) => {
      if (colChooserRef.current && !colChooserRef.current.contains(e.target as Node)) setColChooserOpen(false)
    }
    document.addEventListener("mousedown", h); return () => document.removeEventListener("mousedown", h)
  }, [colChooserOpen])

  useEffect(() => {
    if (!moreActionsOpen) return
    const h = (e: MouseEvent) => {
      if (moreActionsRef.current && !moreActionsRef.current.contains(e.target as Node)) setMoreActionsOpen(false)
    }
    document.addEventListener("mousedown", h); return () => document.removeEventListener("mousedown", h)
  }, [moreActionsOpen])

  // ── Existing effects ──────────────────────────────────────────────────────
  useEffect(() => {
    if (!focus) return
    const v = visits.find(x => x.container === focus || x.id === focus)
    if (v) { setSel(v.id); setTab("visits") }
  }, [focus, visits])

  useEffect(() => {
    setCheckInDone(false); setEirDone(false); setExclOpen(false); setExclReason(null)
    setReceiptOpen(false); setEirPhotosOpen(false)
  }, [sel])

  useEffect(() => {
    if (tab !== "gtx" || !backendConnected) return
    loadTransactions()
  }, [tab, backendConnected])

  async function loadTransactions() {
    setTxLoading(true)
    try { const data = await backendApi.gateTransactions(); setTransactions(data) }
    catch (err) { console.error("[GateConsole] load transactions:", err) }
    finally { setTxLoading(false) }
  }

  async function handleGateIn() {
    setSubmittingGateIn(true)
    try {
      await backendApi.createGateTransaction({
        gate_type: "in",
        container_id: gateInContId !== "" ? Number(gateInContId) : undefined,
        truck_license_plate: gateInPlate || undefined,
        driver_ref: gateInDriver || undefined,
        carrier_ref: gateInCarrier || undefined,
      })
      setShowGateInForm(false)
      setGateInContId(""); setGateInPlate(""); setGateInDriver(""); setGateInCarrier("")
      await loadTransactions()
    } catch (err) { console.error("[GateConsole] gate in:", err) }
    finally { setSubmittingGateIn(false) }
  }

  async function handleGateOut(containerId: number, inTime: string | null) {
    setGateOutLoading(containerId)
    try {
      const tx = await backendApi.createGateTransaction({ gate_type: "out", container_id: containerId })
      await loadTransactions()
      if (inTime && tx.actual_departure) {
        const diffMs = new Date(tx.actual_departure).getTime() - new Date(inTime).getTime()
        const msg = `Gate out confirmed · turnaround ${Math.round(diffMs/60_000)}′`
        setTurnaroundToast(msg)
        if (toastTimeout.current) clearTimeout(toastTimeout.current)
        toastTimeout.current = setTimeout(() => setTurnaroundToast(null), 6000)
      }
    } catch (err) { console.error("[GateConsole] gate out:", err) }
    finally { setGateOutLoading(null) }
  }

  // ── TxGroups (unchanged) ──────────────────────────────────────────────────
  type TxGroup = { key:string; containerId:number|null; containerNumber:string; inTx:BackendGateTransaction|null; outTx:BackendGateTransaction|null; latestAt:number }
  const txGroups: TxGroup[] = (() => {
    const map = new Map<string,{inTx:BackendGateTransaction|null;outTx:BackendGateTransaction|null;cid:number|null}>()
    for (const tx of transactions) {
      const key = tx.container_id != null ? `c_${tx.container_id}` : `t_${tx.id}`
      if (!map.has(key)) map.set(key,{inTx:null,outTx:null,cid:tx.container_id})
      const g = map.get(key)!
      if (tx.gate_type==="in") g.inTx=tx
      if (tx.gate_type==="out") g.outTx=tx
    }
    return Array.from(map.entries()).map(([key,{inTx,outTx,cid}]) => {
      const c = cid!=null?backendContainers.find(x=>x.id===cid):null
      const latestAt = Math.max(
        inTx?.actual_arrival?new Date(inTx.actual_arrival).getTime():0,
        outTx?.actual_departure?new Date(outTx.actual_departure).getTime():0,
        inTx?new Date(inTx.created_at).getTime():0,
        outTx?new Date(outTx.created_at).getTime():0,
      )
      return { key, containerId:cid, containerNumber:c?.container_number??(cid!=null?`#${cid}`:"—"), inTx, outTx, latestAt }
    }).sort((a,b)=>b.latestAt-a.latestAt)
  })()

  function fmtTime(iso:string|null):string {
    if (!iso) return "—"
    const d=new Date(iso); return d.toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"})
  }
  function fmtTurnaround(inIso:string|null,outIso:string|null):string {
    if (!inIso) return "—"
    const mins=Math.round((( outIso?new Date(outIso).getTime():Date.now())-new Date(inIso).getTime())/60_000)
    return `${mins}′${outIso?"":` (running)`}`
  }

  const pickableContainers = backendContainers.filter(c=>c.status==="in_transit"||c.status==="yard")
  const selVisit: Visit = visits.find(v=>v.id===sel)||visits[0]
  const idx = (v:Visit)=>STEPS.indexOf(v.state)
  const apptData = appointments.find(a=>a.window===apptSel)||appointments[0]
  if (!selVisit) return null

  const isPickup = /pickup|retrieval/i.test(selVisit.purpose)
  const pickupContainer = isPickup ? containers.find(c=>c.id===selVisit.container)??null : null
  const rehandleCheck = pickupContainer ? computeRehandleCost(pickupContainer.address,containers) : null

  // ── Step 2: Lane summary ──────────────────────────────────────────────────
  const laneCountsByState = lanes.reduce<Record<string,number>>((acc,l) => {
    acc[l.state] = (acc[l.state]||0)+1; return acc
  }, {})
  const laneSummaryParts = [
    `${lanes.length} lanes`,
    laneCountsByState.free ? `${laneCountsByState.free} free` : null,
    laneCountsByState.occupied ? `${laneCountsByState.occupied} occupied` : null,
    (laneCountsByState.assigned||0)+(laneCountsByState.loading||0)+(laneCountsByState.staged||0)+(laneCountsByState.clearing||0)
      ? `${(laneCountsByState.assigned||0)+(laneCountsByState.loading||0)+(laneCountsByState.staged||0)+(laneCountsByState.clearing||0)} in use` : null,
  ].filter(Boolean).join(" · ")

  // ── Step 3: Column helpers ────────────────────────────────────────────────
  function toggleVisitCol(col: VisitCol) {
    setVisibleCols(prev => {
      const next = new Set(prev)
      if (next.has(col)) { if (next.size > 1) next.delete(col) }
      else next.add(col)
      return next
    })
  }

  // ── Step 4: Check-in handler ──────────────────────────────────────────────
  async function handleCheckIn() {
    if (checkingIn||checkInDone) return
    setCheckingIn(true)
    try {
      const now=new Date()
      const time=`${String(now.getHours()).padStart(2,"0")}:${String(now.getMinutes()).padStart(2,"0")}`
      const freeLane=lanes.find(l=>l.state==="free")
      const vRes=await fetch(`/api/visits/${selVisit.id}`,{
        method:"PATCH",headers:{"Content-Type":"application/json"},
        body:JSON.stringify({state:"CHECKED_IN",check_in:time,lane_id:freeLane?.id??(selVisit.lane||null)}),
      })
      if (!vRes.ok) throw new Error("Visit update failed")
      if (freeLane) {
        await fetch(`/api/lanes/${freeLane.id}`,{
          method:"PATCH",headers:{"Content-Type":"application/json"},
          body:JSON.stringify({state:"occupied",visit_id:selVisit.id,since:time}),
        })
      }
      await refresh(["visits","lanes"]); setCheckInDone(true)
    } catch (err) { console.error("[GateConsole] check-in failed:",err); setCheckInDone(true) }
    finally { setCheckingIn(false) }
  }

  // ── Step 4: Accordion header ──────────────────────────────────────────────
  function AccordionHeader({ label, open, onToggle, count }: { label:string; open:boolean; onToggle:()=>void; count?:string }) {
    return (
      <button onClick={onToggle}
        className="w-full flex items-center justify-between px-4 py-2 text-left hover:bg-[#f9fafb] transition-colors"
        style={{ borderTop:"1px solid #e5e7eb" }}>
        <div className="flex items-center gap-2">
          <span className="ds-label font-bold text-neutral-500">{label}</span>
          {count && <span className="text-[10px] text-neutral-400">{count}</span>}
        </div>
        <span style={{ fontSize:9, color:"#9ca3af" }}>{open?"▲":"▼"}</span>
      </button>
    )
  }

  return (
    <div className="flex flex-col h-full min-h-0 overflow-auto bg-[#f4f5f7] text-neutral-900">

      {/* Header */}
      <div className="flex items-center gap-4 px-5 pt-4 pb-3 border-b border-[#e5e7eb] flex-none bg-white">
        <div className="flex flex-col gap-1">
          <span className="font-semibold text-[15px] tracking-tight">Gate</span>
          <span className="text-[11px] text-neutral-500">Clock starts at queue geofence · stops at barrier release · exclusions recorded per visit</span>
        </div>
        <div className="flex ml-3" style={{ border:"1px solid #e5e7eb", borderRadius:5, overflow:"hidden" }}>
          {([["visits","Live visits"],["gtx","Gate transactions"],["appts","Appointments"]] as const).map(([k,label])=>(
            <button key={k} onClick={()=>setTab(k)}
              className="text-[11.5px] px-3 py-1.5 font-bold transition-colors"
              style={{ background:tab===k?"#111827":"transparent", color:tab===k?"#fff":"#374151" }}>
              {label}
            </button>
          ))}
        </div>
        <div className="ml-auto">
          {tab==="gtx"&&backendConnected ? (
            <button onClick={()=>setShowGateInForm(f=>!f)}
              style={{ background:"#111827", color:"#fff", border:"none", borderRadius:5, fontSize:12, padding:"5px 14px", fontWeight:600 }}>
              {showGateInForm?"Cancel":"Gate in"}
            </button>
          ) : (
            <button onClick={handleCheckIn} disabled={checkingIn}
              style={{ background:"#111827", color:"#fff", border:"none", borderRadius:5, fontSize:12, padding:"5px 14px", fontWeight:600, opacity:checkingIn?0.5:1 }}>
              {checkInDone?"V-2043 served · gate pass issued":checkingIn?"Checking in…":"Check in next in queue"}
            </button>
          )}
        </div>
      </div>

      {/* ── Step 1: Collapsible KPI bar ──────────────────────────────────────── */}
      <div className="flex-none border-b border-[#e5e7eb] bg-white">
        {/* Primary row */}
        <div className="flex items-stretch">
          {[
            { k:"In queue",       v:"2",     sub:"depth at 06:12", red:false },
            { k:"Turn P50 today", v:"13.8′", sub:"target 15′",     red:false },
          ].map(m => (
            <div key={m.k} className="flex-1 basis-36 px-5 py-2.5 border-r border-[#e5e7eb] flex flex-col gap-0.5">
              <span className="ds-label text-neutral-500">{m.k}</span>
              <div className="flex items-baseline gap-2">
                <span className="font-mono font-semibold leading-none" style={{ fontSize:24, color:m.red?"#dc2626":undefined }}>{m.v}</span>
                <span className="text-[11px] text-neutral-500">{m.sub}</span>
              </div>
            </div>
          ))}
          <button onClick={()=>setKpiExpanded(v=>!v)}
            className="flex items-center gap-1.5 px-4 text-[11px] text-[#6b7280] hover:text-[#374151] hover:bg-[#f9fafb] transition-colors"
            style={{ borderLeft:"1px solid #e5e7eb", whiteSpace:"nowrap" }}>
            {kpiExpanded?"Fewer metrics ▲":"More metrics ▼"}
          </button>
        </div>
        {/* Secondary row */}
        <div style={{ overflow:"hidden", maxHeight:kpiExpanded?120:0, transition:"max-height 200ms ease" }}>
          <div className="flex border-t border-[#e5e7eb]">
            {[
              { k:"Turn P90 today",    v:"21.4′", sub:"target 22′",      red:false },
              { k:"Longest live turn", v:"18′",   sub:"V-2042",          red:true  },
              { k:"Exclusions logged", v:"2",     sub:"driver-caused",   red:false },
            ].map(m => (
              <div key={m.k} className="flex-1 basis-36 px-5 py-2.5 border-r border-[#e5e7eb] flex flex-col gap-0.5">
                <span className="ds-label text-neutral-500">{m.k}</span>
                <div className="flex items-baseline gap-2">
                  <span className="font-mono font-semibold leading-none" style={{ fontSize:24, color:m.red?"#dc2626":undefined }}>{m.v}</span>
                  <span className="text-[11px] text-neutral-500">{m.sub}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ════════════════════ VISITS TAB ════════════════════ */}
      {tab==="visits" && (
        <div className="grid flex-1 min-h-0 overflow-auto" style={{ gridTemplateColumns:"minmax(420px,1fr) clamp(280px,28vw,380px)" }}>
          <div className="flex flex-col min-h-0 overflow-auto bg-white">

            {/* ── Step 2: Lane summary / expandable cards ────────────────── */}
            <div className="flex items-center gap-2.5 px-4 py-2 border-b border-[#e5e7eb]">
              <span className="ds-label text-neutral-500">Lanes</span>
              <span className="text-[11.5px] text-neutral-700 font-medium">{laneSummaryParts}</span>
              <button onClick={()=>setLanesExpanded(v=>!v)}
                className="ml-auto text-[11px] px-2.5 py-1 text-neutral-500 hover:text-neutral-800"
                style={{ border:"1px solid #e5e7eb", borderRadius:5 }}>
                {lanesExpanded?"Hide lanes ▲":"Show lanes ▼"}
              </button>
            </div>
            {/* Lane cards — expandable */}
            <div style={{ overflow:"hidden", maxHeight:lanesExpanded?160:0, transition:"max-height 200ms ease" }}>
              <div className="flex flex-wrap gap-1.5 px-4 py-2 border-b border-[#e5e7eb]">
                {lanes.map(l => {
                  const st=LANE_STYLE[l.state]||LANE_STYLE.free
                  return (
                    <div key={l.id} className="border px-2 py-1 min-w-[86px]"
                      style={{ background:st[0], borderColor:st[1], color:st[2], borderRadius:5 }}>
                      <div className="text-[11px] font-bold font-mono">{l.id}</div>
                      <div className="text-[10px] opacity-80">{l.state+(l.visit?" · "+l.visit:"")}</div>
                    </div>
                  )
                })}
              </div>
            </div>

            {/* ── Step 3: Visit table with column chooser ────────────────── */}
            {/* Table toolbar */}
            <div className="flex items-center gap-2 px-4 py-2 border-b border-[#e5e7eb] flex-none">
              <span className="text-[11px] text-neutral-500"><span className="font-mono">{visits.length}</span> visits active</span>
              <div ref={colChooserRef} className="relative ml-auto">
                <button onClick={()=>setColChooserOpen(v=>!v)}
                  className="flex items-center gap-1 px-2.5 py-1 text-[11px] text-[#374151]"
                  style={{ border:"1px solid #e5e7eb", borderRadius:5 }}>
                  Columns <span style={{ fontSize:8 }}>{colChooserOpen?"▲":"▼"}</span>
                </button>
                {colChooserOpen && (
                  <div className="absolute right-0 top-full mt-1 z-30 bg-white"
                    style={{ border:"1px solid #e5e7eb", borderRadius:5, boxShadow:"0 4px 12px rgba(0,0,0,0.10)", padding:"6px 0", minWidth:150 }}>
                    {VISIT_COLS.map(col => (
                      <label key={col} className="flex items-center gap-2 px-3 py-1.5 cursor-pointer hover:bg-[#f9fafb] text-[11px]">
                        <input type="checkbox" checked={visibleCols.has(col)} onChange={()=>toggleVisitCol(col)} className="accent-[#111827]" />
                        {VISIT_COL_LABELS[col]}
                      </label>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="flex-1 min-h-0 overflow-auto">
              <table className="w-full border-collapse" style={{ fontSize:11 }}>
                <thead>
                  <tr>
                    {VISIT_COLS.filter(h=>visibleCols.has(h)).map(h=>(
                      <th key={h} className="ds-th text-left">{VISIT_COL_LABELS[h]}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {visits.map(v=>(
                    <tr key={v.id} onClick={()=>setSel(v.id)}
                      className="cursor-pointer hover:bg-[#f9fafb] border-b border-[#f3f4f6] transition-colors"
                      style={{ background:v.id===sel?"#fef2f2":undefined, minHeight:44 }}>
                      {/* TRUCK */}
                      {visibleCols.has("TRUCK") && (
                        <td className="py-2.5 pl-4 pr-2" style={{ borderLeft:`3px solid ${v.id===sel?"#dc2626":v.excl?"#d97706":"transparent"}` }}>
                          <div className="font-bold font-mono">{v.plate}</div>
                          <div className="text-[10px] text-neutral-500 font-mono">{v.id} · {v.carrier}</div>
                        </td>
                      )}
                      {/* LIFECYCLE / STATE */}
                      {visibleCols.has("LIFECYCLE") && (
                        <td className="px-2 py-2.5">
                          <div className="flex gap-0.5 items-center">
                            {STEPS.slice(1).map((st,i)=>(
                              <span key={st} title={st} className="w-3 h-1.5 inline-block"
                                style={{ background:i<idx(v)-1?"#111827":i===idx(v)-1?"#dc2626":"#e5e7eb" }} />
                            ))}
                          </div>
                          <div className="text-[10px] text-neutral-500 mt-0.5">{v.state.replace(/_/g," ").toLowerCase()}</div>
                        </td>
                      )}
                      {/* TURN */}
                      {visibleCols.has("TURN") && (
                        <td className={`px-2 py-2.5 font-mono font-bold ${v.turn>=15?"text-[#dc2626]":""}`}>{v.turn?v.turn+"′":"—"}</td>
                      )}
                      {/* PURPOSE */}
                      {visibleCols.has("PURPOSE") && (
                        <td className="px-2 py-2.5" style={{ fontSize:11 }}>{v.purpose}</td>
                      )}
                      {/* CONTAINER */}
                      {visibleCols.has("CONTAINER") && (
                        <td className="px-2 py-2.5 font-mono" style={{ fontSize:11 }}>{v.container}</td>
                      )}
                      {/* APPT */}
                      {visibleCols.has("APPT") && (
                        <td className="px-2 py-2.5 font-mono" style={{ fontSize:11 }}>{v.appt}</td>
                      )}
                      {/* EXCLUSION */}
                      {visibleCols.has("EXCLUSION") && (
                        <td className="px-2 py-2.5 text-[10.5px] text-[#dc2626] leading-tight">{v.excl||""}</td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* ── Detail panel — Step 4: progressive ───────────────────────── */}
          <div className="flex flex-col min-h-0 overflow-auto bg-white" style={{ borderLeft:"1px solid #e5e7eb" }}>
            <div className="px-4 pt-4 pb-3">
              <div className="ds-label text-neutral-500"><span className="font-mono">{selVisit.id}</span> · {selVisit.purpose}</div>
              <div className="font-semibold text-[17px] mt-1 tracking-tight font-mono">{selVisit.plate}</div>
              <div className="text-[12px] text-neutral-600 mt-0.5">{selVisit.carrier} · {selVisit.driver} · lane <span className="font-mono">{selVisit.lane}</span></div>
            </div>

            {/* Step 4: Lifecycle timeline — always visible */}
            <div className="border-t border-[#e5e7eb]">
              {[
                {k:"Queue geofence (t₀)", v:selVisit.queueIn},
                {k:"Check-in",            v:selVisit.checkIn},
                {k:"At position",         v:selVisit.atPosition},
                {k:"Served",              v:selVisit.served},
                {k:"Barrier release (t₁)",v:selVisit.gateOut},
                {k:"Turn time",           v:selVisit.turn?selVisit.turn+" min":"running"},
              ].map((t,i)=>(
                <div key={t.k} className="flex gap-3 items-baseline px-4 py-2 border-b border-[#f3f4f6] text-[11.5px]">
                  <span className="w-2 h-2 flex-none inline-block"
                    style={{ background:!t.v?"#e5e7eb":i===5?"#dc2626":"#1f2937", borderRadius:2 }} />
                  <span className="flex-1" style={{ color:!t.v?"#6b7280":"#111827" }}>{t.k}</span>
                  <span className="font-mono font-semibold" style={{ color:!t.v?"#6b7280":"#111827" }}>{t.v||"—"}</span>
                </div>
              ))}
            </div>

            {/* Step 4: Interchange receipt — accordion */}
            <AccordionHeader label="Interchange receipt" open={receiptOpen} onToggle={()=>setReceiptOpen(v=>!v)} />
            <div style={{ overflow:"hidden", maxHeight:receiptOpen?200:0, transition:"max-height 200ms ease" }}>
              <div className="px-4 py-2">
                <div className="flex gap-1.5 flex-wrap">
                  {[
                    {k:"Direction",    v:selVisit.purpose.includes("Empty")?"Gate-out":"Gate-in",  red:false},
                    {k:"Seal",         v:"AR"+(400000+selVisit.turn*137),                           red:false},
                    {k:"Condition",    v:selVisit.excl?"Incomplete":"Sound",                        red:!!selVisit.excl},
                    {k:"Acknowledged", v:selVisit.excl?"Pending driver":"Driver + clerk",           red:false},
                  ].map(e=>(
                    <div key={e.k} className="border border-[#e5e7eb] px-2 py-1.5 min-w-[90px]" style={{ borderRadius:5 }}>
                      <div className="ds-label text-neutral-500">{e.k}</div>
                      <div className={`text-[11.5px] font-semibold ${e.red?"text-[#dc2626]":""}`}>{e.v}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Step 4: EIR photos — accordion */}
            <AccordionHeader label="EIR photos" open={eirPhotosOpen} onToggle={()=>setEirPhotosOpen(v=>!v)} count={eirDone?"4 captured":undefined} />
            <div style={{ overflow:"hidden", maxHeight:eirPhotosOpen?140:0, transition:"max-height 200ms ease" }}>
              <div className="px-4 py-2">
                <div className="flex gap-1">
                  {["front","left","right","rear"].map(p=>(
                    <div key={p} className="flex-1 h-11 border-2 border-dashed flex flex-col items-center justify-center gap-0.5"
                      style={{ background:eirDone?"#f0fdf4":"transparent", borderColor:eirDone?"#059669":"#d1d5db", borderRadius:5 }}>
                      <span className="text-[9px] text-neutral-500 capitalize">{p}</span>
                      {eirDone && <span className="text-[8px]" style={{ color:"#059669" }}>✓</span>}
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Yard accessibility (pickup visits) — unchanged */}
            {rehandleCheck && (
              <>
                <div className="px-4 pt-3 pb-1.5 ds-label text-neutral-500 font-bold" style={{ borderTop:"1px solid #e5e7eb" }}>Yard accessibility</div>
                <div className="px-4 pb-3 flex flex-col gap-2">
                  <div className="text-[11.5px] text-[#374151]">Container at <span className="font-mono">{pickupContainer!.address}</span></div>
                  {rehandleCheck.accessible ? (
                    <div className="flex items-start gap-2 px-3 py-2 text-[11.5px]" style={{ background:"#f0fdf4", border:"1px solid #059669", borderRadius:5, color:"#065f46" }}>
                      <span className="font-bold leading-none mt-px">✓</span><span>Direct access — no rehandles required</span>
                    </div>
                  ) : (
                    <div className="flex items-start gap-2 px-3 py-2 text-[11.5px]" style={{ background:"#fffbeb", border:"1px solid #d97706", borderRadius:5, color:"#92400e" }}>
                      <span className="font-bold leading-none mt-px">▲</span>
                      <div>
                        <div className="font-semibold">{rehandleCheck.rehandles} rehandle{rehandleCheck.rehandles!==1?"s":""} required<span className="font-normal ml-2">≈ {(rehandleCheck.rehandles*4.8).toFixed(0)}′ added</span></div>
                        <div className="mt-1 text-[10.5px] leading-relaxed">Blocking: {rehandleCheck.blocking.map(c=><span key={c.id} className="font-mono mr-1.5">{c.id}</span>)}</div>
                      </div>
                    </div>
                  )}
                  {rehandleCheck.rehandles>2 && (
                    <div className="px-3 py-2.5 text-[11.5px] leading-snug" style={{ background:"#fef2f2", border:"1px solid #fecaca", borderRadius:5, color:"#991b1b" }}>
                      <span className="font-bold">This pickup requires {rehandleCheck.rehandles} rehandles.</span> Consider staging first or notify the planner.
                    </div>
                  )}
                </div>
              </>
            )}

            {/* Step 4: Actions — primary + more actions dropdown */}
            <div className="px-4 pt-3 pb-4" style={{ borderTop:"1px solid #e5e7eb" }}>
              {/* Primary action */}
              <button className="w-full text-[11.5px] text-left px-3 py-2.5 font-semibold mb-2"
                style={{ background:"#111827", color:"#fff", borderRadius:5 }}
                onClick={handleCheckIn} disabled={checkingIn}>
                {checkInDone?"✓ Checked in and assigned to lane":checkingIn?"Checking in…":"Check in and assign lane"}
              </button>
              {/* More actions dropdown */}
              <div ref={moreActionsRef} className="relative">
                <button onClick={()=>setMoreActionsOpen(v=>!v)}
                  className="w-full text-[11.5px] text-left px-3 py-2 font-semibold flex items-center justify-between"
                  style={{ background:"white", color:"#374151", border:"1px solid #e5e7eb", borderRadius:5 }}>
                  <span>More actions</span>
                  <span style={{ fontSize:9 }}>{moreActionsOpen?"▲":"▼"}</span>
                </button>
                {moreActionsOpen && (
                  <div className="absolute left-0 right-0 top-full mt-1 z-30 bg-white flex flex-col"
                    style={{ border:"1px solid #e5e7eb", borderRadius:5, boxShadow:"0 4px 12px rgba(0,0,0,0.10)", overflow:"hidden" }}>
                    <button className="text-[11.5px] text-left px-3 py-2.5 font-semibold hover:bg-[#f9fafb] transition-colors"
                      style={{ color:"#374151", borderBottom:"1px solid #f3f4f6" }}
                      onClick={()=>{ setEirDone(true); setMoreActionsOpen(false) }}>
                      {eirDone?"✓ EIR photos captured · 4 attached":"Capture EIR photos"}
                    </button>
                    <button className="text-[11.5px] text-left px-3 py-2.5 font-semibold hover:bg-[#f9fafb] transition-colors"
                      style={{ color:"#374151", borderBottom:exclOpen?"1px solid #f3f4f6":"none" }}
                      onClick={()=>{ setExclOpen(o=>!o); setMoreActionsOpen(false) }}>
                      {exclReason?`✓ Exclusion: ${exclReason}`:"Record exclusion reason"}
                    </button>
                  </div>
                )}
              </div>
              {exclOpen && !exclReason && (
                <div className="border border-[#e5e7eb] p-2 flex flex-col gap-1 mt-2" style={{ background:"#f9fafb", borderRadius:5 }}>
                  <div className="ds-label text-neutral-500 mb-1">Select reason</div>
                  {EXCL_REASONS.map(r=>(
                    <button key={r} onClick={()=>{ setExclReason(r); setExclOpen(false) }}
                      className="text-left px-2 py-2 text-[11.5px] transition-colors"
                      style={{ background:"white", border:"1px solid #e5e7eb", borderRadius:5, color:"#374151" }}>
                      {r}
                    </button>
                  ))}
                </div>
              )}
              <div className="text-[11px] text-neutral-500 leading-relaxed mt-2">
                {selVisit.excl
                  ? "Excluded time is measured and shown against the visit — not removed from the record."
                  : `Pre-staged outbound: container already on ground at ${selVisit.lane}.`}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ════════════════════ GATE TRANSACTIONS TAB ════════════════════ */}
      {tab==="gtx" && (
        <div className="flex-1 min-h-0 overflow-auto flex flex-col bg-white">
          {!backendConnected && (
            <div className="px-5 py-6">
              <div className="border border-[#e5e7eb] px-5 py-5 max-w-lg" style={{ background:"#f9fafb", borderRadius:5 }}>
                <div className="font-semibold text-[15px] mb-1.5">Backend not available</div>
                <div className="text-[12.5px] text-neutral-600 leading-relaxed">The planning engine is unreachable. Gate transactions require a live backend connection.</div>
              </div>
            </div>
          )}
          {backendConnected && (
            <>
              {turnaroundToast && (
                <div className="mx-5 mt-3 px-4 py-3 text-[12px] font-semibold flex justify-between items-center"
                  style={{ background:"#f0fdf4", border:"1px solid #059669", color:"#065f46", borderRadius:5 }}>
                  <span>✓ {turnaroundToast}</span>
                  <button onClick={()=>setTurnaroundToast(null)} className="text-[13px] hover:opacity-70" style={{ color:"#059669" }}>✕</button>
                </div>
              )}
              {showGateInForm && (
                <div className="mx-5 mt-3 border border-[#e5e7eb] px-5 py-4" style={{ background:"#f9fafb", borderRadius:5 }}>
                  <div className="ds-label text-neutral-500 font-bold mb-3">Record gate in</div>
                  <div className="grid gap-3" style={{ gridTemplateColumns:"1fr 1fr" }}>
                    <div className="col-span-2">
                      <label className="ds-label text-neutral-500 block mb-1">Container</label>
                      <ContainerPicker containers={pickableContainers} value={gateInContId} onChange={(id)=>setGateInContId(id)} placeholder="Search container number…" />
                    </div>
                    <div>
                      <label className="ds-label text-neutral-500 block mb-1">Truck plate</label>
                      <input type="text" placeholder="e.g. AB 123 CD" value={gateInPlate} onChange={e=>setGateInPlate(e.target.value)}
                        className="w-full border border-[#e5e7eb] px-2 py-1.5 text-[12px] font-mono" style={{ borderRadius:5 }} />
                    </div>
                    <div>
                      <label className="ds-label text-neutral-500 block mb-1">Driver ref</label>
                      <input type="text" placeholder="Driver ID or name" value={gateInDriver} onChange={e=>setGateInDriver(e.target.value)}
                        className="w-full border border-[#e5e7eb] px-2 py-1.5 text-[12px]" style={{ borderRadius:5 }} />
                    </div>
                    <div className="col-span-2">
                      <label className="ds-label text-neutral-500 block mb-1">Carrier ref</label>
                      <input type="text" placeholder="Booking or carrier reference" value={gateInCarrier} onChange={e=>setGateInCarrier(e.target.value)}
                        className="w-full border border-[#e5e7eb] px-2 py-1.5 text-[12px]" style={{ borderRadius:5 }} />
                    </div>
                  </div>
                  <div className="flex gap-2 mt-3">
                    <button onClick={handleGateIn} disabled={submittingGateIn}
                      style={{ background:"#111827", color:"#fff", border:"none", borderRadius:5, fontSize:12, padding:"5px 14px", fontWeight:600, opacity:submittingGateIn?0.5:1 }}>
                      {submittingGateIn?"Submitting…":"Submit gate in"}
                    </button>
                    <button style={{ background:"white", color:"#374151", border:"1px solid #e5e7eb", borderRadius:5, fontSize:12, padding:"5px 14px", fontWeight:600 }}
                      onClick={()=>{ setShowGateInForm(false); setGateInContId(""); setGateInPlate(""); setGateInDriver(""); setGateInCarrier("") }}>
                      Cancel
                    </button>
                  </div>
                </div>
              )}
              {txLoading ? (
                <div className="px-5 py-6 text-[12px] text-neutral-500">Loading transactions…</div>
              ) : txGroups.length===0 ? (
                <div className="px-5 py-6">
                  <div className="border border-[#e5e7eb] px-5 py-5 max-w-md text-center" style={{ background:"#f9fafb", borderRadius:5 }}>
                    <div className="font-bold text-[14px] mb-1">No gate transactions yet</div>
                    <div className="text-[12px] text-neutral-500">Use "Gate in" above to record a truck arrival.</div>
                  </div>
                </div>
              ) : (
                <div className="flex-1 min-h-0 overflow-auto mt-3">
                  <table className="w-full border-collapse text-[12px]">
                    <thead>
                      <tr>{["CONTAINER","GATE IN","GATE OUT","TURNAROUND","TRUCK","DRIVER","CARRIER",""].map(h=>(
                        <th key={h} className="ds-th text-left" style={{ paddingLeft:h==="CONTAINER"?"20px":undefined }}>{h}</th>
                      ))}</tr>
                    </thead>
                    <tbody>
                      {txGroups.map(g=>{
                        const inTime=g.inTx?.actual_arrival??g.inTx?.created_at??null
                        const outTime=g.outTx?.actual_departure??g.outTx?.created_at??null
                        const hasIn=!!g.inTx; const hasOut=!!g.outTx
                        const isRunning=hasIn&&!hasOut
                        return (
                          <tr key={g.key} className="border-b border-[#f3f4f6] hover:bg-[#f9fafb]" style={{ background:hasOut?"#fafafa":undefined }}>
                            <td className="py-2 pl-5 pr-3" style={{ minHeight:38 }}>
                              <div className="font-mono font-bold text-[11.5px]">{g.containerNumber}</div>
                              {g.containerId&&<div className="text-[10px] text-neutral-400 font-mono">ID {g.containerId}</div>}
                            </td>
                            <td className="px-3 py-2 font-mono">
                              {hasIn?<div><div className="font-semibold">{fmtTime(inTime)}</div><div className="text-[10px] text-neutral-400 font-mono">#{g.inTx!.id}</div></div>:<span className="text-neutral-400">—</span>}
                            </td>
                            <td className="px-3 py-2 font-mono">
                              {hasOut?<div><div className="font-semibold">{fmtTime(outTime)}</div><div className="text-[10px] text-neutral-400 font-mono">#{g.outTx!.id}</div></div>:<span className="text-[11px] font-mono" style={{ color:isRunning?"#d97706":"#9ca3af", fontWeight:isRunning?600:400 }}>{isRunning?"In yard":"—"}</span>}
                            </td>
                            <td className="px-3 py-2 font-mono font-semibold" style={{ color:isRunning?"#d97706":undefined }}>{hasIn?fmtTurnaround(inTime,outTime):"—"}</td>
                            <td className="px-3 py-2 font-mono">{g.inTx?.truck_license_plate??g.outTx?.truck_license_plate??"—"}</td>
                            <td className="px-3 py-2">{g.inTx?.driver_ref??g.outTx?.driver_ref??"—"}</td>
                            <td className="px-3 py-2">{g.inTx?.carrier_ref??g.outTx?.carrier_ref??"—"}</td>
                            <td className="px-3 py-2">
                              {isRunning&&g.containerId!=null&&(
                                <button disabled={gateOutLoading===g.containerId} onClick={()=>handleGateOut(g.containerId!,inTime)}
                                  style={{ background:"white", color:"#374151", border:"1px solid #e5e7eb", borderRadius:5, fontSize:10.5, padding:"3px 10px", fontWeight:600, whiteSpace:"nowrap", opacity:gateOutLoading===g.containerId?0.5:1 }}>
                                  {gateOutLoading===g.containerId?"…":"Gate out"}
                                </button>
                              )}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* ════════════════════ APPOINTMENTS TAB ════════════════════ */}
      {tab==="appts" && (
        <div className="grid flex-1 min-h-0 overflow-auto" style={{ gridTemplateColumns:"minmax(360px,1fr) clamp(260px,26vw,360px)" }}>
          <div className="overflow-auto bg-white" style={{ borderRight:"1px solid #e5e7eb" }}>
            <div className="px-4 pt-3 pb-1.5 ds-label text-neutral-500 font-bold">Bookable windows · Tue 12 Aug · capacity from machine-hours, not lanes</div>
            {appointments.map(a=>(
              <button key={a.window} onClick={()=>setApptSel(a.window)}
                className="block w-full text-left px-4 py-2 border-b border-[#f3f4f6] hover:bg-[#f9fafb] transition-colors"
                style={{ borderLeft:`3px solid ${a.window===apptSel?"#dc2626":a.over?"#d97706":"transparent"}`, background:a.window===apptSel?"#fef2f2":undefined }}>
                <div className="flex items-center gap-3">
                  <span className="text-[12.5px] font-bold font-mono w-12">{a.window}</span>
                  <div className="flex gap-0.5 flex-1">
                    {Array.from({length:Math.max(a.capacity,a.booked)},(_,i)=>(
                      <span key={i} className="w-6 h-4 border inline-block"
                        style={{ background:i<a.booked?(i>=a.capacity?"#dc2626":"#111827"):"transparent", borderColor:i>=a.capacity?"#dc2626":"#6b7280" }} />
                    ))}
                  </div>
                  <span className={`text-[11px] font-mono w-32 text-right ${a.over?"text-[#dc2626]":"text-neutral-500"}`}>
                    {a.booked}/{a.capacity}{a.noShow?" · "+a.noShow+" no-show":""}
                  </span>
                </div>
              </button>
            ))}
          </div>
          {apptData && (
            <div className="overflow-auto bg-white">
              <div className="px-4 pt-4 pb-2">
                <div className="ds-label text-neutral-500">Window <span className="font-mono">{apptData.window}</span></div>
                <div className="font-semibold text-[16px] mt-1"><span className="font-mono">{apptData.booked}</span> booked of <span className="font-mono">{apptData.capacity}</span> capacity</div>
              </div>
              {[
                {k:"Capacity basis",           v:"3 RS + 1 EH · 11.4 moves/h"},
                {k:"Machine minutes committed",v:(apptData.booked*4.8).toFixed(1)+"′"},
                {k:"Purpose mix",              v:"2 pickup · 1 empty · 1 drop"},
                {k:"Overbooking policy",       v:apptData.over?"1 over — accepted with queue risk":"within capacity",red:apptData.over},
                {k:"No-show handling",         v:apptData.noShow?"slot released to waitlist":"n/a"},
              ].map(d=>(
                <div key={d.k} className="flex justify-between gap-3 px-4 py-1.5 border-b border-[#f3f4f6] text-[11.5px]">
                  <span className="text-neutral-500">{d.k}</span>
                  <span className={`font-semibold text-right font-mono ${d.red?"text-[#dc2626]":""}`}>{d.v}</span>
                </div>
              ))}
              <div className="px-4 pt-3 pb-1.5 ds-label text-neutral-500 font-bold">Smoothing recommendation</div>
              <div className="px-4 pb-4 text-[12px] leading-relaxed text-neutral-700">
                {smoothed?"Applied: three 07:30 bookings moved to 10:00–11:00. Projected P90 in the peak improves 3.4 minutes.":"Move three bookings out of 07:30 into the 10:00–11:00 trough. The peak consumes 62% of arrivals against 41% of machine capacity."}
              </div>
              <button className="mx-4 mb-4 text-[11.5px] text-left px-3 py-2 font-semibold"
                style={{ background:"white", color:"#374151", border:"1px solid #e5e7eb", borderRadius:5 }}
                onClick={()=>setSmoothed(true)}>
                {smoothed?"Smoothing applied · 3 windows retimed":"Apply smoothing"}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
