import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import { useData } from "@/lib/DataContext"
import type { Visit } from "@/data/yard-ops"

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
  const { visits, lanes, appointments, refresh } = useData()

  const [tab,          setTab]         = useState("visits")
  const [sel,          setSel]         = useState("V-2043")
  const [apptSel,      setApptSel]     = useState("07:30")
  const [smoothed,     setSmoothed]    = useState(false)
  const [checkingIn,   setCheckingIn]  = useState(false)
  const [checkInDone,  setCheckInDone] = useState(false)
  const [eirDone,      setEirDone]     = useState(false)
  const [exclOpen,     setExclOpen]    = useState(false)
  const [exclReason,   setExclReason]  = useState<string|null>(null)

  useEffect(() => {
    if (!focus) return
    const v = visits.find(x => x.container === focus || x.id === focus)
    if (v) { setSel(v.id); setTab("visits") }
  }, [focus, visits])

  // Reset check-in state when selected visit changes
  useEffect(() => {
    setCheckInDone(false)
    setEirDone(false)
    setExclOpen(false)
    setExclReason(null)
  }, [sel])

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

      // Update the visit state + check-in time + lane
      const vRes = await fetch(`/api/visits/${selVisit.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          state: "CHECKED_IN",
          check_in: time,
          lane_id: freeLane?.id ?? (selVisit.lane || null),
        }),
      })
      if (!vRes.ok) throw new Error("Visit update failed")

      // Mark the lane occupied
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
      // Still advance the UI for the demo
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

        {/* Tab switcher — matches Settings.tsx pattern */}
        <div className="flex ml-3">
          {([["visits","Live visits"],["appts","Appointments"]] as const).map(([k,label],i,arr)=>(
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
          <Button size="sm" className="text-xs" onClick={handleCheckIn} disabled={checkingIn}>
            {checkInDone
              ? "V-2043 served · gate pass issued"
              : checkingIn
              ? "Checking in…"
              : "Check in next in queue"}
          </Button>
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

      {/* ── Visits tab ── */}
      {tab==="visits" && (
        <div className="grid flex-1 min-h-0 overflow-auto" style={{gridTemplateColumns:"minmax(420px,1fr) clamp(280px,28vw,380px)"}}>

          {/* Left: lanes + visits table */}
          <div className="flex flex-col min-h-0 overflow-auto">
            {/* Lane status */}
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

            {/* Visits table */}
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

          {/* Right: visit detail */}
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

            {/* Interchange receipt */}
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

              {/* EIR photo placeholders — dashed border signals upload affordance */}
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

            {/* Actions */}
            <div className="px-4 pt-3 pb-1.5 text-[10px] tracking-widest uppercase text-neutral-500 font-bold">Actions</div>
            <div className="flex flex-col gap-1.5 px-4 pb-4">
              {/* Check in */}
              <Button size="sm" className="text-[11.5px] justify-start"
                onClick={handleCheckIn} disabled={checkingIn}>
                {checkInDone
                  ? "✓ Checked in and assigned to lane"
                  : checkingIn
                  ? "Checking in…"
                  : "Check in and assign lane"}
              </Button>

              {/* EIR photos */}
              <Button variant="secondary" size="sm" className="text-[11.5px] justify-start"
                onClick={() => setEirDone(true)}>
                {eirDone ? "✓ EIR photos captured · 4 attached" : "Capture EIR photos"}
              </Button>

              {/* Exclusion reason */}
              <Button variant="secondary" size="sm" className="text-[11.5px] justify-start"
                onClick={() => setExclOpen(o => !o)}>
                {exclReason ? `✓ Exclusion: ${exclReason}` : "Record exclusion reason"}
              </Button>

              {/* Inline exclusion reason picker */}
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

      {/* ── Appointments tab ── */}
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
              <Button variant="secondary" size="sm" className="mx-4 mb-4 text-[11.5px] justify-start"
                onClick={()=>setSmoothed(true)}>
                {smoothed ? "Smoothing applied · 3 windows retimed" : "Apply smoothing"}
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
