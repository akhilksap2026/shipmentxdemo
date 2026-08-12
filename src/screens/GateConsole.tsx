import { useState, useEffect, useRef } from "react"
import { Button } from "@/components/ui/button"
import { useData } from "@/lib/DataContext"
import type { Visit } from "@/data/yard-ops"
import { backendApi } from "@/lib/backend-api"
import type { BackendGateTransaction } from "@/lib/backend-api"

interface Props { focus: string | null }

const STEPS = ["EXPECTED","APPROACHING","IN_QUEUE","CHECKED_IN","AT_POSITION","SERVED","GATE_OUT"]

const LANE_STYLE: Record<string, [string,string,string]> = {
  free:     ["transparent","#9ca3af","#374151"],
  occupied: ["#1f2937",   "#1f2937","#fff"],
  assigned: ["#fef3f2",   "#d9291c","#9b1c1c"],
  clearing: ["#f3f4f6",   "#6b7280","#111827"],
  staged:   ["#e5e7eb",   "#6b7280","#111827"],
  loading:  ["#d9291c",   "#d9291c","#fff"],
}

const EXCL_REASONS = [
  "Driver early — appointment not yet open",
  "Container not pre-cleared by customs",
  "Weight discrepancy vs. booking",
  "Driver documents incomplete",
]

export default function GateConsole({ focus }: Props) {
  const { visits, lanes, appointments, refresh, backendConnected, backendContainers } = useData()

  // ── Existing state (unchanged) ────────────────────────────────────────────
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
  const [gateInCq,        setGateInCq]        = useState("")   // container search query
  const [submittingGateIn,setSubmittingGateIn]= useState(false)
  const [gateOutLoading,  setGateOutLoading]  = useState<number | null>(null)
  const [turnaroundToast, setTurnaroundToast] = useState<string | null>(null)
  const toastTimeout = useRef<ReturnType<typeof setTimeout> | null>(null)

  // ── Existing effects (unchanged) ──────────────────────────────────────────
  useEffect(() => {
    if (!focus) return
    const v = visits.find(x => x.container === focus || x.id === focus)
    if (v) { setSel(v.id); setTab("visits") }
  }, [focus, visits])

  useEffect(() => {
    setCheckInDone(false)
    setEirDone(false)
    setExclOpen(false)
    setExclReason(null)
  }, [sel])

  // ── Load transactions when tab is active ──────────────────────────────────
  useEffect(() => {
    if (tab !== "gtx" || !backendConnected) return
    loadTransactions()
  }, [tab, backendConnected])

  async function loadTransactions() {
    setTxLoading(true)
    try {
      const data = await backendApi.gateTransactions()
      setTransactions(data)
    } catch (err) {
      console.error("[GateConsole] load transactions:", err)
    } finally {
      setTxLoading(false)
    }
  }

  // ── Gate in form submit ───────────────────────────────────────────────────
  async function handleGateIn() {
    setSubmittingGateIn(true)
    try {
      await backendApi.createGateTransaction({
        gate_type: "in",
        container_id: gateInContId !== "" ? Number(gateInContId) : undefined,
        truck_license_plate: gateInPlate || undefined,
        driver_ref:          gateInDriver || undefined,
        carrier_ref:         gateInCarrier || undefined,
      })
      setShowGateInForm(false)
      setGateInContId(""); setGateInPlate(""); setGateInDriver(""); setGateInCarrier(""); setGateInCq("")
      await loadTransactions()
    } catch (err) {
      console.error("[GateConsole] gate in:", err)
    } finally {
      setSubmittingGateIn(false)
    }
  }

  // ── Gate out action ───────────────────────────────────────────────────────
  async function handleGateOut(containerId: number, inTime: string | null) {
    setGateOutLoading(containerId)
    try {
      const tx = await backendApi.createGateTransaction({ gate_type: "out", container_id: containerId })
      await loadTransactions()
      // Compute turnaround
      if (inTime && tx.actual_departure) {
        const diffMs = new Date(tx.actual_departure).getTime() - new Date(inTime).getTime()
        const mins = Math.round(diffMs / 60_000)
        const msg = `Gate out confirmed · turnaround ${mins}′`
        setTurnaroundToast(msg)
        if (toastTimeout.current) clearTimeout(toastTimeout.current)
        toastTimeout.current = setTimeout(() => setTurnaroundToast(null), 6000)
      }
    } catch (err) {
      console.error("[GateConsole] gate out:", err)
    } finally {
      setGateOutLoading(null)
    }
  }

  // ── Derive grouped transaction rows ──────────────────────────────────────
  // Group by container_id; containers with no id get their own entry keyed by tx.id
  type TxGroup = {
    key: string
    containerId: number | null
    containerNumber: string
    inTx: BackendGateTransaction | null
    outTx: BackendGateTransaction | null
    latestAt: number   // ms timestamp for sorting
  }

  const txGroups: TxGroup[] = (() => {
    const map = new Map<string, { inTx: BackendGateTransaction | null; outTx: BackendGateTransaction | null; cid: number | null }>()

    for (const tx of transactions) {
      const key = tx.container_id != null ? `c_${tx.container_id}` : `t_${tx.id}`
      if (!map.has(key)) map.set(key, { inTx: null, outTx: null, cid: tx.container_id })
      const g = map.get(key)!
      if (tx.gate_type === "in")  g.inTx  = tx
      if (tx.gate_type === "out") g.outTx = tx
    }

    return Array.from(map.entries()).map(([key, { inTx, outTx, cid }]) => {
      const c = cid != null ? backendContainers.find(x => x.id === cid) : null
      const latestAt = Math.max(
        inTx?.actual_arrival  ? new Date(inTx.actual_arrival).getTime()  : 0,
        outTx?.actual_departure ? new Date(outTx.actual_departure).getTime() : 0,
        inTx  ? new Date(inTx.created_at).getTime()  : 0,
        outTx ? new Date(outTx.created_at).getTime() : 0,
      )
      return {
        key,
        containerId: cid,
        containerNumber: c?.container_number ?? (cid != null ? `#${cid}` : "—"),
        inTx,
        outTx,
        latestAt,
      }
    }).sort((a, b) => b.latestAt - a.latestAt)
  })()

  function fmtTime(iso: string | null): string {
    if (!iso) return "—"
    const d = new Date(iso)
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
  }

  function fmtTurnaround(inIso: string | null, outIso: string | null): string {
    if (!inIso) return "—"
    const inMs  = new Date(inIso).getTime()
    const outMs = outIso ? new Date(outIso).getTime() : Date.now()
    const mins  = Math.round((outMs - inMs) / 60_000)
    return `${mins}′${outIso ? "" : " (running)"}`
  }

  // Container picker options — only in_transit or yard
  const pickableContainers = backendContainers.filter(c => c.status === "in_transit" || c.status === "yard")
  const filteredContainers = gateInCq.trim()
    ? pickableContainers.filter(c => c.container_number.toLowerCase().includes(gateInCq.toLowerCase()))
    : pickableContainers.slice(0, 20)

  // ── Existing derived values (unchanged) ───────────────────────────────────
  const selVisit: Visit = visits.find(v => v.id === sel) || visits[0]
  const idx = (v: Visit) => STEPS.indexOf(v.state)
  const apptData = appointments.find(a => a.window === apptSel) || appointments[0]

  if (!selVisit) return null

  async function handleCheckIn() {
    if (checkingIn || checkInDone) return
    setCheckingIn(true)
    try {
      const now = new Date()
      const time = `${String(now.getHours()).padStart(2,"0")}:${String(now.getMinutes()).padStart(2,"0")}`
      const freeLane = lanes.find(l => l.state === "free")

      const vRes = await fetch(`/api/visits/${selVisit.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ state: "CHECKED_IN", check_in: time, lane_id: freeLane?.id ?? (selVisit.lane || null) }),
      })
      if (!vRes.ok) throw new Error("Visit update failed")

      if (freeLane) {
        await fetch(`/api/lanes/${freeLane.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ state: "occupied", visit_id: selVisit.id, since: time }),
        })
      }

      await refresh(["visits", "lanes"])
      setCheckInDone(true)
    } catch (err) {
      console.error("[GateConsole] check-in failed:", err)
      setCheckInDone(true)
    } finally {
      setCheckingIn(false)
    }
  }

  return (
    <div className="flex flex-col h-full min-h-0 overflow-auto bg-white text-neutral-900">
      {/* Header */}
      <div className="flex items-center gap-4 px-5 pt-3.5 pb-3 border-b-2 border-neutral-200 flex-none">
        <div className="flex flex-col gap-1">
          <span className="font-black text-[19px] tracking-tight">Gate</span>
          <span className="text-[11px] text-neutral-500">
            Clock starts at the queue geofence and stops at barrier release · exclusions recorded per visit, never hidden
          </span>
        </div>

        {/* Tab switcher — "Gate transactions" inserted between visits and appts */}
        <div className="flex ml-3">
          {([["visits","Live visits"],["gtx","Gate transactions"],["appts","Appointments"]] as const).map(([k,label],i,arr)=>(
            <button key={k} onClick={()=>setTab(k)}
              className="text-[11.5px] px-3.5 py-1.5 border border-neutral-300 font-bold transition-colors"
              style={{
                borderRight: i < arr.length-1 ? "none" : undefined,
                background: tab===k ? "#201e1d" : "transparent",
                color:      tab===k ? "#fff"    : "#201e1d",
              }}>
              {label}
            </button>
          ))}
        </div>

        <div className="ml-auto">
          {tab === "gtx" && backendConnected ? (
            <Button size="sm" className="text-xs" onClick={() => setShowGateInForm(f => !f)}>
              {showGateInForm ? "Cancel" : "Gate in"}
            </Button>
          ) : (
            <Button size="sm" className="text-xs" onClick={handleCheckIn} disabled={checkingIn}>
              {checkInDone ? "V-2043 served · gate pass issued" : checkingIn ? "Checking in…" : "Check in next in queue"}
            </Button>
          )}
        </div>
      </div>

      {/* Metrics */}
      <div className="flex flex-wrap border-b-2 border-neutral-200 flex-none">
        {[
          { k:"In queue",          v:"2",    sub:"depth at 06:12" },
          { k:"Turn P50 today",    v:"13.8′",sub:"target 15′" },
          { k:"Turn P90 today",    v:"21.4′",sub:"target 22′" },
          { k:"Longest live turn", v:"18′",  sub:"V-2042", red:true },
          { k:"Exclusions logged", v:"2",    sub:"driver-caused, early" },
        ].map(m=>(
          <div key={m.k} className="flex-1 basis-36 px-5 py-2.5 border-r border-neutral-200 flex flex-col gap-0.5">
            <span className="text-[10px] tracking-widest uppercase text-neutral-500">{m.k}</span>
            <div className="flex items-baseline gap-2">
              <span className={`font-black text-[22px] leading-none tracking-tight ${m.red?"text-[#d9291c]":""}`}>{m.v}</span>
              <span className="text-[11px] text-neutral-500">{m.sub}</span>
            </div>
          </div>
        ))}
      </div>

      {/* ════════════════════════════════════════════════════════════════
          VISITS TAB — completely unchanged
          ════════════════════════════════════════════════════════════════ */}
      {tab==="visits" && (
        <div className="grid flex-1 min-h-0 overflow-auto" style={{gridTemplateColumns:"minmax(420px,1fr) clamp(280px,28vw,380px)"}}>
          <div className="flex flex-col min-h-0 overflow-auto">
            <div className="flex flex-wrap gap-1.5 px-4 py-2.5 border-b border-neutral-200">
              <span className="text-[10px] tracking-widest uppercase text-neutral-500 self-center mr-1">Lanes</span>
              {lanes.map(l=>{
                const st = LANE_STYLE[l.state] || LANE_STYLE.free
                return (
                  <div key={l.id} className="border px-2 py-1 min-w-[86px]"
                    style={{background:st[0],borderColor:st[1],color:st[2]}}>
                    <div className="text-[11px] font-bold">{l.id}</div>
                    <div className="text-[10px] opacity-80">{l.state+(l.visit?" · "+l.visit:"")}</div>
                  </div>
                )
              })}
            </div>
            <div className="flex-1 min-h-0 overflow-auto">
              <table className="w-full border-collapse text-[12px]">
                <thead>
                  <tr>
                    {["TRUCK","PURPOSE","CONTAINER","APPT","LIFECYCLE","TURN","EXCLUSION"].map(h=>(
                      <th key={h} className="text-left px-2.5 py-2 text-[9.5px] font-bold tracking-widest uppercase text-neutral-500 sticky top-0 bg-white border-b-2 border-neutral-200 z-10">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {visits.map(v=>(
                    <tr key={v.id} onClick={()=>setSel(v.id)}
                      className="cursor-pointer hover:bg-neutral-50 border-b border-neutral-200 transition-colors"
                      style={{background:v.id===sel?"#fef3f2":undefined}}>
                      <td className="py-2 pl-4 pr-2.5" style={{borderLeft:`3px solid ${v.id===sel?"#d9291c":v.excl?"#f59e0b":"transparent"}`}}>
                        <div className="font-bold tabular">{v.plate}</div>
                        <div className="text-[11px] text-neutral-500">{v.id} · {v.carrier}</div>
                      </td>
                      <td className="px-2.5 py-2">{v.purpose}</td>
                      <td className="px-2.5 py-2 tabular">{v.container}</td>
                      <td className="px-2.5 py-2 tabular">{v.appt}</td>
                      <td className="px-2.5 py-2">
                        <div className="flex gap-0.5 items-center">
                          {STEPS.slice(1).map((st,i)=>(
                            <span key={st} title={st} className="w-4 h-2 inline-block"
                              style={{background:i<idx(v)-1?"#201e1d":i===idx(v)-1?"#d9291c":"#e5e7eb"}} />
                          ))}
                        </div>
                        <div className="text-[10.5px] text-neutral-500 mt-0.5">{v.state.replace(/_/g," ").toLowerCase()}</div>
                      </td>
                      <td className={`px-2.5 py-2 tabular font-bold ${v.turn>=15?"text-[#d9291c]":""}`}>{v.turn?v.turn+"′":"—"}</td>
                      <td className="px-2.5 py-2 text-[11px] text-[#d9291c] leading-tight">{v.excl||""}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="border-l-2 border-neutral-200 flex flex-col min-h-0 overflow-auto">
            <div className="px-4 pt-3.5 pb-3">
              <div className="text-[10px] tracking-widest uppercase text-neutral-500">{selVisit.id} · {selVisit.purpose}</div>
              <div className="font-black text-[19px] mt-1 tracking-tight">{selVisit.plate}</div>
              <div className="text-[12px] text-neutral-600 mt-0.5">{selVisit.carrier} · {selVisit.driver} · lane {selVisit.lane}</div>
            </div>
            <div className="border-t-2 border-neutral-200">
              {[
                {k:"Queue geofence (t₀)",v:selVisit.queueIn},
                {k:"Check-in",           v:selVisit.checkIn},
                {k:"At position",        v:selVisit.atPosition},
                {k:"Served",             v:selVisit.served},
                {k:"Barrier release (t₁)",v:selVisit.gateOut},
                {k:"Turn time",          v:selVisit.turn?selVisit.turn+" min":"running"},
              ].map((t,i)=>(
                <div key={t.k} className="flex gap-3 items-baseline px-4 py-2 border-b border-neutral-200 text-[11.5px]">
                  <span className="w-2 h-2 flex-none inline-block rounded-sm"
                    style={{background:!t.v?"#e5e7eb":i===5?"#d9291c":"#1f2937"}} />
                  <span className="flex-1" style={{color:!t.v?"#6b7280":"#111827"}}>{t.k}</span>
                  <span className="tabular font-semibold" style={{color:!t.v?"#6b7280":"#111827"}}>{t.v||"—"}</span>
                </div>
              ))}
            </div>
            <div className="px-4 pt-3 pb-1.5 text-[10px] tracking-widest uppercase text-neutral-500 font-bold">Interchange receipt</div>
            <div className="px-4 pb-2.5">
              <div className="flex gap-1.5 flex-wrap">
                {[
                  {k:"Direction",    v:selVisit.purpose.includes("Empty")?"Gate-out":"Gate-in",  red:false},
                  {k:"Seal",         v:"AR"+(400000+selVisit.turn*137),                           red:false},
                  {k:"Condition",    v:selVisit.excl?"Incomplete":"Sound",                        red:!!selVisit.excl},
                  {k:"Acknowledged", v:selVisit.excl?"Pending driver":"Driver + clerk",           red:false},
                ].map(e=>(
                  <div key={e.k} className="border border-neutral-300 px-2 py-1.5 min-w-[96px]">
                    <div className="text-[10px] text-neutral-500 tracking-wider">{e.k}</div>
                    <div className={`text-[11.5px] font-semibold ${e.red?"text-[#d9291c]":""}`}>{e.v}</div>
                  </div>
                ))}
              </div>
              <div className="flex gap-1 mt-2">
                {["front","left","right","rear"].map(p=>(
                  <div key={p}
                    className="flex-1 h-11 border-2 border-dashed border-neutral-300 flex flex-col items-center justify-center gap-0.5"
                    style={{background: eirDone ? "#f0fdf4" : "transparent", borderColor: eirDone ? "#86efac" : undefined}}>
                    <span className="text-[9px] text-neutral-500 capitalize">{p}</span>
                    {eirDone && <span className="text-[8px] text-emerald-600">✓</span>}
                  </div>
                ))}
              </div>
            </div>
            <div className="px-4 pt-3 pb-1.5 text-[10px] tracking-widest uppercase text-neutral-500 font-bold">Actions</div>
            <div className="flex flex-col gap-1.5 px-4 pb-4">
              <Button size="sm" className="text-[11.5px] justify-start" onClick={handleCheckIn} disabled={checkingIn}>
                {checkInDone ? "✓ Checked in and assigned to lane" : checkingIn ? "Checking in…" : "Check in and assign lane"}
              </Button>
              <Button variant="secondary" size="sm" className="text-[11.5px] justify-start" onClick={() => setEirDone(true)}>
                {eirDone ? "✓ EIR photos captured · 4 attached" : "Capture EIR photos"}
              </Button>
              <Button variant="secondary" size="sm" className="text-[11.5px] justify-start" onClick={() => setExclOpen(o => !o)}>
                {exclReason ? `✓ Exclusion: ${exclReason}` : "Record exclusion reason"}
              </Button>
              {exclOpen && !exclReason && (
                <div className="border border-neutral-300 bg-neutral-50 p-2 flex flex-col gap-1">
                  <div className="text-[10px] tracking-widest uppercase text-neutral-500 mb-1">Select reason</div>
                  {EXCL_REASONS.map(r => (
                    <button key={r} onClick={() => { setExclReason(r); setExclOpen(false) }}
                      className="text-left px-2.5 py-2 border border-neutral-200 bg-white text-[11.5px] hover:bg-neutral-100 transition-colors">
                      {r}
                    </button>
                  ))}
                </div>
              )}
              <div className="text-[11px] text-neutral-500 leading-relaxed mt-1">
                {selVisit.excl
                  ? "Excluded time is measured and shown against the visit — it is not removed from the record."
                  : `Pre-staged outbound: the container is already on the ground at ${selVisit.lane}, so the visit consumes no machine time in the peak.`}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════════
          NEW TAB: Gate transactions
          ════════════════════════════════════════════════════════════════ */}
      {tab==="gtx" && (
        <div className="flex-1 min-h-0 overflow-auto flex flex-col">

          {/* Backend unavailable */}
          {!backendConnected && (
            <div className="px-5 py-6">
              <div className="border border-neutral-300 bg-neutral-50 px-5 py-5 max-w-lg">
                <div className="font-black text-[15px] mb-1.5">Backend not available</div>
                <div className="text-[12.5px] text-neutral-600 leading-relaxed">
                  The planning engine is unreachable. Gate transactions require a live backend connection.
                  The existing Visits and Appointments tabs continue to work with seed data.
                </div>
              </div>
            </div>
          )}

          {backendConnected && (
            <>
              {/* Turnaround toast */}
              {turnaroundToast && (
                <div className="mx-5 mt-3 px-4 py-3 bg-emerald-50 border border-emerald-300 text-[12px] text-emerald-900 font-semibold flex justify-between items-center">
                  <span>✓ {turnaroundToast}</span>
                  <button onClick={() => setTurnaroundToast(null)} className="text-emerald-700 text-[13px] hover:text-emerald-900">✕</button>
                </div>
              )}

              {/* Gate in form */}
              {showGateInForm && (
                <div className="mx-5 mt-3 border border-neutral-300 bg-neutral-50 px-5 py-4">
                  <div className="text-[10px] tracking-widest uppercase text-neutral-500 font-bold mb-3">Record gate in</div>
                  <div className="grid gap-3" style={{gridTemplateColumns:"1fr 1fr"}}>

                    {/* Container picker */}
                    <div className="col-span-2">
                      <label className="text-[10px] tracking-widest uppercase text-neutral-500 block mb-1">Container</label>
                      <input
                        type="text"
                        placeholder="Search container number…"
                        value={gateInCq}
                        onChange={e => { setGateInCq(e.target.value); setGateInContId("") }}
                        className="w-full border border-neutral-300 px-2.5 py-1.5 text-[12px] mb-1"
                      />
                      {gateInCq && gateInContId === "" && (
                        <div className="border border-neutral-300 bg-white max-h-36 overflow-auto">
                          {filteredContainers.length === 0 && (
                            <div className="px-3 py-2 text-[11.5px] text-neutral-500">No containers match</div>
                          )}
                          {filteredContainers.map(c => (
                            <button key={c.id}
                              onClick={() => { setGateInContId(c.id); setGateInCq(c.container_number) }}
                              className="block w-full text-left px-3 py-2 text-[11.5px] hover:bg-neutral-100 border-b border-neutral-100 last:border-0">
                              <span className="font-mono font-semibold">{c.container_number}</span>
                              <span className="ml-2 text-neutral-500">{c.size_ft}ft · {c.status.replace(/_/g," ")}</span>
                            </button>
                          ))}
                        </div>
                      )}
                      {gateInContId !== "" && (
                        <div className="text-[11px] text-emerald-700 mt-0.5">✓ Container {gateInCq} selected (ID {gateInContId})</div>
                      )}
                    </div>

                    <div>
                      <label className="text-[10px] tracking-widests uppercase text-neutral-500 block mb-1">Truck plate</label>
                      <input type="text" placeholder="e.g. AB 123 CD"
                        value={gateInPlate} onChange={e => setGateInPlate(e.target.value)}
                        className="w-full border border-neutral-300 px-2.5 py-1.5 text-[12px]" />
                    </div>
                    <div>
                      <label className="text-[10px] tracking-widests uppercase text-neutral-500 block mb-1">Driver ref</label>
                      <input type="text" placeholder="Driver ID or name"
                        value={gateInDriver} onChange={e => setGateInDriver(e.target.value)}
                        className="w-full border border-neutral-300 px-2.5 py-1.5 text-[12px]" />
                    </div>
                    <div className="col-span-2">
                      <label className="text-[10px] tracking-widests uppercase text-neutral-500 block mb-1">Carrier ref</label>
                      <input type="text" placeholder="Booking or carrier reference"
                        value={gateInCarrier} onChange={e => setGateInCarrier(e.target.value)}
                        className="w-full border border-neutral-300 px-2.5 py-1.5 text-[12px]" />
                    </div>
                  </div>
                  <div className="flex gap-2 mt-3">
                    <Button size="sm" className="text-xs" onClick={handleGateIn} disabled={submittingGateIn}>
                      {submittingGateIn ? "Submitting…" : "Submit gate in"}
                    </Button>
                    <Button variant="secondary" size="sm" className="text-xs"
                      onClick={() => { setShowGateInForm(false); setGateInContId(""); setGateInPlate(""); setGateInDriver(""); setGateInCarrier(""); setGateInCq("") }}>
                      Cancel
                    </Button>
                  </div>
                </div>
              )}

              {/* Transactions table */}
              {txLoading ? (
                <div className="px-5 py-6 text-[12px] text-neutral-500">Loading transactions…</div>
              ) : txGroups.length === 0 ? (
                <div className="px-5 py-6">
                  <div className="border border-neutral-200 bg-neutral-50 px-5 py-5 max-w-md text-center">
                    <div className="font-bold text-[14px] mb-1">No gate transactions yet</div>
                    <div className="text-[12px] text-neutral-500">Use "Gate in" above to record a truck arrival.</div>
                  </div>
                </div>
              ) : (
                <div className="flex-1 min-h-0 overflow-auto mt-3">
                  <table className="w-full border-collapse text-[12px]">
                    <thead>
                      <tr>
                        {["CONTAINER","GATE IN","GATE OUT","TURNAROUND","TRUCK","DRIVER","CARRIER",""].map(h => (
                          <th key={h} className="text-left px-3 py-2 text-[9.5px] font-bold tracking-widest uppercase text-neutral-500 border-b-2 border-neutral-200 sticky top-0 bg-white z-10"
                            style={{paddingLeft:h==="CONTAINER"?"20px":undefined}}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {txGroups.map(g => {
                        const inTime  = g.inTx?.actual_arrival  ?? g.inTx?.created_at  ?? null
                        const outTime = g.outTx?.actual_departure ?? g.outTx?.created_at ?? null
                        const hasIn   = !!g.inTx
                        const hasOut  = !!g.outTx
                        const turnaround = hasIn ? fmtTurnaround(inTime, outTime) : "—"
                        const isRunning = hasIn && !hasOut
                        const plate  = g.inTx?.truck_license_plate ?? g.outTx?.truck_license_plate ?? "—"
                        const driver = g.inTx?.driver_ref          ?? g.outTx?.driver_ref          ?? "—"
                        const carrier= g.inTx?.carrier_ref         ?? g.outTx?.carrier_ref         ?? "—"
                        return (
                          <tr key={g.key} className="border-b border-neutral-200 hover:bg-neutral-50">
                            <td className="py-2.5 pl-5 pr-3">
                              <div className="font-mono font-bold text-[11.5px]">{g.containerNumber}</div>
                              {g.containerId && <div className="text-[10px] text-neutral-400">ID {g.containerId}</div>}
                            </td>
                            <td className="px-3 py-2.5 tabular">
                              {hasIn ? (
                                <div>
                                  <div className="font-semibold">{fmtTime(inTime)}</div>
                                  <div className="text-[10px] text-neutral-400">#{g.inTx!.id}</div>
                                </div>
                              ) : <span className="text-neutral-400">—</span>}
                            </td>
                            <td className="px-3 py-2.5 tabular">
                              {hasOut ? (
                                <div>
                                  <div className="font-semibold">{fmtTime(outTime)}</div>
                                  <div className="text-[10px] text-neutral-400">#{g.outTx!.id}</div>
                                </div>
                              ) : (
                                <span className={`text-[11px] ${isRunning ? "text-amber-700 font-semibold" : "text-neutral-400"}`}>
                                  {isRunning ? "In yard" : "—"}
                                </span>
                              )}
                            </td>
                            <td className={`px-3 py-2.5 tabular font-semibold ${isRunning ? "text-amber-700" : ""}`}>
                              {turnaround}
                            </td>
                            <td className="px-3 py-2.5 tabular">{plate}</td>
                            <td className="px-3 py-2.5">{driver}</td>
                            <td className="px-3 py-2.5">{carrier}</td>
                            <td className="px-3 py-2.5">
                              {isRunning && g.containerId != null && (
                                <Button
                                  variant="secondary"
                                  size="sm"
                                  className="text-[10.5px] whitespace-nowrap"
                                  disabled={gateOutLoading === g.containerId}
                                  onClick={() => handleGateOut(g.containerId!, inTime)}
                                >
                                  {gateOutLoading === g.containerId ? "…" : "Gate out"}
                                </Button>
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

      {/* ════════════════════════════════════════════════════════════════
          APPOINTMENTS TAB — completely unchanged
          ════════════════════════════════════════════════════════════════ */}
      {tab==="appts" && (
        <div className="grid flex-1 min-h-0 overflow-auto" style={{gridTemplateColumns:"minmax(360px,1fr) clamp(260px,26vw,360px)"}}>
          <div className="border-r-2 border-neutral-200 overflow-auto">
            <div className="px-4 pt-3 pb-1.5 text-[10px] tracking-widest uppercase text-neutral-500 font-bold">
              Bookable windows · Tue 12 Aug · capacity from machine-hours, not lanes
            </div>
            {appointments.map(a=>(
              <button key={a.window} onClick={()=>setApptSel(a.window)}
                className="block w-full text-left px-4 py-2 border-b border-neutral-200 hover:bg-neutral-50 transition-colors"
                style={{
                  borderLeft: `3px solid ${a.window===apptSel?"#d9291c":a.over?"#f59e0b":"transparent"}`,
                  background: a.window===apptSel?"#fef3f2":undefined,
                }}>
                <div className="flex items-center gap-3">
                  <span className="text-[12.5px] font-bold tabular w-12">{a.window}</span>
                  <div className="flex gap-0.5 flex-1">
                    {Array.from({length:Math.max(a.capacity,a.booked)},(_,i)=>(
                      <span key={i} className="w-6 h-4 border inline-block"
                        style={{
                          background:  i<a.booked?(i>=a.capacity?"#d9291c":"#1f2937"):"transparent",
                          borderColor: i>=a.capacity?"#d9291c":"#6b7280",
                        }} />
                    ))}
                  </div>
                  <span className={`text-[11px] tabular w-32 text-right ${a.over?"text-[#d9291c]":"text-neutral-500"}`}>
                    {a.booked} / {a.capacity}{a.noShow?" · "+a.noShow+" no-show":""}
                  </span>
                </div>
              </button>
            ))}
          </div>

          {apptData && (
            <div className="overflow-auto">
              <div className="px-4 pt-3.5 pb-2.5">
                <div className="text-[10px] tracking-widest uppercase text-neutral-500">Window {apptData.window}</div>
                <div className="font-black text-[18px] mt-1">{apptData.booked} booked of {apptData.capacity} capacity</div>
              </div>
              {[
                {k:"Capacity basis",           v:"3 RS + 1 EH · 11.4 moves/h"},
                {k:"Machine minutes committed",v:(apptData.booked*4.8).toFixed(1)+"′"},
                {k:"Purpose mix",              v:"2 pickup · 1 empty · 1 drop"},
                {k:"Overbooking policy",       v:apptData.over?"1 over — accepted with queue risk":"within capacity", red:apptData.over},
                {k:"No-show handling",         v:apptData.noShow?"slot released to waitlist":"n/a"},
              ].map(d=>(
                <div key={d.k} className="flex justify-between gap-3 px-4 py-1.5 border-b border-neutral-200 text-[11.5px]">
                  <span className="text-neutral-500">{d.k}</span>
                  <span className={`font-semibold text-right ${d.red?"text-[#d9291c]":""}`}>{d.v}</span>
                </div>
              ))}
              <div className="px-4 pt-3 pb-1.5 text-[10px] tracking-widest uppercase text-neutral-500 font-bold">
                Smoothing recommendation
              </div>
              <div className="px-4 pb-3.5 text-[12px] leading-relaxed text-neutral-700">
                {smoothed
                  ? "Applied: three 07:30 bookings moved to 10:00–11:00. Projected P90 in the peak improves 3.4 minutes."
                  : "Move three bookings out of 07:30 into the 10:00–11:00 trough. The peak consumes 62% of arrivals against 41% of machine capacity."}
              </div>
              <Button variant="secondary" size="sm" className="mx-4 mb-4 text-[11.5px] justify-start" onClick={()=>setSmoothed(true)}>
                {smoothed ? "Smoothing applied · 3 windows retimed" : "Apply smoothing"}
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
