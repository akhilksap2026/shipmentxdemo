import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { useData } from "@/lib/DataContext"
import type { Event } from "@/data/yard-ops"

interface Props { focus: string | null }

const CATS: Record<string, string> = {
  EQUIPMENT_FAILURE:"Equipment", CUSTOMS_CHANNEL_ASSIGNED:"Customs", SHIP_DELAY:"Vessel",
  DEPOT_REDIRECTION:"Depot", CONTAINER_NOT_FOUND:"Yard audit", APPOINTMENT_NO_SHOW:"Gate",
  DETENTION_BREACH:"Detention", AUDIT_DISCREPANCY:"Yard audit"
}

export default function ControlTower({ focus }: Props) {
  const { events, diffRows } = useData()

  const [sel,   setSel]   = useState("")
  const [cat,   setCat]   = useState("ALL")
  const [acked, setAcked] = useState<Set<string>>(new Set())

  // Initialise selection to the first event once data loads
  useEffect(() => {
    if (!sel && events.length > 0) setSel(events[0].id)
  }, [events, sel])

  useEffect(() => {
    if (!focus) return
    const e = events.find(x => x.id === focus)
      || events.find(x => x.title.includes(focus) || x.detail.includes(focus))
    if (e) setSel(e.id)
  }, [focus, events])

  const cats = ["ALL", ...Array.from(new Set(events.map(e => CATS[e.type] || e.type)))]
  const filtered = events.filter(e => cat==="ALL" || CATS[e.type]===cat)
  const selEvent = filtered.find(e => e.id===sel) || events.find(e => e.id===sel) || filtered[0] || events[0]

  const ackedEvent = selEvent ? acked.has(selEvent.id) : false
  const awaitingCount = events.filter(e => e.state === "awaiting" && !acked.has(e.id)).length

  function stateLine(e: Event) {
    if (e.state === "replanned")  return "Replanned · " + e.auto
    if (e.state === "suppressed") return "Suppressed by stability rules"
    return acked.has(e.id) ? "Acknowledged" : "Awaiting acknowledgement"
  }

  if (!selEvent) return null

  return (
    <div className="flex flex-col h-full min-h-0 overflow-auto bg-white text-neutral-900">
      {/* Header */}
      <div className="flex items-center gap-4 px-5 pt-3.5 pb-3 border-b-2 border-neutral-200 flex-none">
        <div className="flex flex-col gap-1">
          <span className="font-black text-[19px] tracking-tight">Tower</span>
          <span className="text-[11px] text-neutral-500">Every event that matters — equipment, customs, detention, appointments, yard audit — with the replan diff attached</span>
        </div>
        <div className="ml-auto">
          <Button size="sm" className="text-xs"
            onClick={() => selEvent && setAcked(prev => new Set(prev).add(selEvent.id))}
            disabled={ackedEvent}>
            {ackedEvent ? "Acknowledged" : "Acknowledge selected event"}
          </Button>
        </div>
      </div>

      {/* Metrics */}
      <div className="flex flex-wrap border-b-2 border-neutral-200 flex-none">
        {[
          {k:"Events today",v:String(events.length),sub:"since 05:41"},
          {k:"Replans accepted",v:"5",sub:"1 suppressed"},
          {k:"Stability index",v:"0.31",sub:"cap 0.40"},
          {k:"Plan adherence",v:"89%",sub:"target ≥85%"},
          {k:"Awaiting acknowledgement",v:String(awaitingCount),sub:awaitingCount>0?"needs attention":"all clear",red:awaitingCount>0},
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

      {/* Main grid */}
      <div className="grid flex-1 min-h-0 overflow-auto" style={{gridTemplateColumns:"clamp(260px,26vw,360px) minmax(340px,1fr)"}}>

        {/* Event list */}
        <div className="border-r-2 border-neutral-200 flex flex-col overflow-auto">
          <div className="flex flex-wrap gap-1.5 px-4 py-2.5 border-b border-neutral-200">
            {cats.map(c=>(
              <button key={c} onClick={()=>setCat(c)}
                className="text-[10.5px] px-2 py-1 border border-neutral-300 font-semibold transition-colors"
                style={{background:cat===c?"#201e1d":"transparent",color:cat===c?"#fff":"#333"}}>
                {c==="ALL"?"All events":c}
              </button>
            ))}
          </div>
          {filtered.map(e=>(
            <button key={e.id} onClick={()=>setSel(e.id)}
              className="block w-full text-left px-4 py-3 border-b border-neutral-200 hover:bg-neutral-50 transition-colors"
              style={{ borderLeft:`3px solid ${e.id===sel?"#d9291c":e.state==="awaiting"&&!acked.has(e.id)?"#f59e0b":"transparent"}`, background:e.id===sel?"#fef3f2":undefined }}>
              <div className="flex justify-between gap-2 text-[10px] tracking-wider font-bold">
                <span style={{color:e.severity==="high"?"#d9291c":"#6b7280"}}>{CATS[e.type]||e.type}</span>
                <span className="text-neutral-500 tabular">{e.time}</span>
              </div>
              <div className="text-[12.5px] font-semibold mt-1 leading-tight">{e.title}</div>
              <div className="text-[11px] text-neutral-500 mt-0.5">{stateLine(e)}</div>
            </button>
          ))}
        </div>

        {/* Event detail */}
        <div className="flex flex-col min-h-0 overflow-auto">
          <div className="px-4 pt-3.5 pb-3 border-b border-neutral-200">
            <div className="text-[10px] tracking-widest uppercase text-neutral-500">
              {selEvent.id} · {selEvent.time} · resolution {selEvent.auto}
            </div>
            <div className="font-black text-[17px] mt-1 tracking-tight">{selEvent.title}</div>
            <div className="text-[12.5px] leading-relaxed mt-1.5 max-w-2xl text-neutral-700">{selEvent.detail}</div>
          </div>

          {/* Diff stats */}
          <div className="flex flex-wrap border-b border-neutral-200">
            {[
              {k:"Cancelled",v:selEvent.diff.cancelled},
              {k:"Added",v:selEvent.diff.added},
              {k:"Reassigned",v:selEvent.diff.reassigned},
              {k:"Frozen kept",v:selEvent.diff.frozenKept,muted:true},
              {k:"Δ machine-min",v:selEvent.diff.deltaMin,red:true},
              {k:"Δ adherence",v:(selEvent.diff.adherence>=0?"+":"")+selEvent.diff.adherence+"%",red:selEvent.diff.adherence<0},
            ].map(p=>(
              <div key={p.k} className="flex-1 basis-28 px-4 py-2.5 border-r border-neutral-200">
                <div className="text-[10px] tracking-wider uppercase text-neutral-500">{p.k}</div>
                <div className={`font-black text-[18px] leading-tight ${p.red?"text-[#d9291c]":p.muted?"text-neutral-500":""}`}>{String(p.v)}</div>
              </div>
            ))}
          </div>

          {selEvent.state==="suppressed" ? (
            <div className="px-4 py-4 max-w-2xl">
              <div className="font-black text-[15px]">Replan suppressed by the stability controller</div>
              <div className="text-[12.5px] leading-relaxed mt-2 text-neutral-700">The optimiser found a cheaper sequence, but the saving was 3.2 machine-minutes against a minimum-improvement threshold of 8. Nothing was published, no operator queue changed, and the decision is written to the audit trail with the rejected candidate attached.</div>
              <div className="text-[12.5px] leading-relaxed mt-2.5 text-neutral-500">Suppression is the feature — a plan the operators can trust beats one that oscillates for marginal gains.</div>
            </div>
          ) : (
            <div className="flex-1 min-h-0 overflow-auto">
              <div className="px-4 pt-3 pb-1.5 text-[10px] tracking-widest uppercase text-neutral-500 font-bold">Replan diff against baseline</div>
              <table className="w-full border-collapse text-[12px]">
                <thead>
                  <tr>
                    {["MOVE","BASELINE","REVISED","WHY"].map((h,i)=>(
                      <th key={h} className="text-left py-2 text-[9.5px] font-bold tracking-widest uppercase text-neutral-500 border-b-2 border-neutral-200"
                        style={{paddingLeft:i===0?"18px":"10px",paddingRight:i===3?"18px":"10px"}}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {diffRows.map(r=>(
                    <tr key={r.moveId} className="border-b border-neutral-200">
                      <td className="py-2 pl-4 pr-2.5 align-top">
                        <div className="font-bold tabular">{r.moveId}</div>
                        <div className={`text-[10px] font-bold tracking-wider ${r.action==="CANCELLED"?"text-[#d9291c]":r.action==="HELD"?"text-neutral-500":"text-[#d9291c]"}`}>{r.action}</div>
                        <div className="text-[11px] text-neutral-500">{r.type}</div>
                      </td>
                      <td className="px-2.5 py-2 align-top text-neutral-500 tabular">{r.before}</td>
                      <td className="px-2.5 py-2 align-top tabular font-semibold">{r.after}</td>
                      <td className="px-4 py-2 pl-2.5 align-top text-neutral-700 leading-relaxed">{r.note}</td>
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
