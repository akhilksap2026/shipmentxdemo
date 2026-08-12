import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"

const FACTORS = [
  { k:"Detention urgency", w:30, scoring:"clamp(0,100,(1 − hoursToLFD/72)×100); breached ⇒ 100" },
  { k:"Detention cost gradient", w:10, scoring:"weighted by the tariff tier the container is entering" },
  { k:"Hazmat handling", w:25, scoring:"outbound-due hazmat ⇒ 100; inbound hazmat ⇒ 80" },
  { k:"Customer / order priority", w:15, scoring:"P1→100, P2→70, P3→40, P4→10" },
  { k:"Dig-out cost (penalty)", w:12, scoring:"100 − (blocking × 33); top of stack ⇒ 100" },
  { k:"Gate / appointment pressure", w:10, scoring:"truck waiting ⇒ 100; appt <60 min ⇒ 80" },
  { k:"Customs channel", w:8, scoring:"cleared ⇒ 100; awaiting inspection ⇒ 0" },
  { k:"Empty-return window", w:8, scoring:"window closing today ⇒ 100; closed ⇒ escalate" },
  { k:"Damage / quarantine", w:5, scoring:"damaged and outbound-due ⇒ 60, routed to inspection" },
  { k:"Dwell time", w:3, scoring:"min(100, daysInYard × 10)" }
]

const ADAPTERS = [
  { name:"SAP — orders & deliveries", mechanism:"IDoc DELVRY / ORDERS", state:"HEALTHY", lag:"4 s", dlq:0, recon:"0 drift", note:"Idempotent by delivery number; replay tested" },
  { name:"SAP — goods receipt", mechanism:"OData, D-03 open", state:"PENDING", lag:"—", dlq:0, recon:"n/a", note:"Blocked on D-03: does YOS own the receipt posting?" },
  { name:"Terminal 4 BACTSSA", mechanism:"REST API", state:"HEALTHY", lag:"31 s", dlq:0, recon:"0 drift", note:"Turnos and gate-out confirmations" },
  { name:"Exolgan Dock Sud", mechanism:"Portal scrape + manual", state:"DEGRADED", lag:"18 min", dlq:3, recon:"2 drift", note:"No API — manual entry is a supported path, not a failure" },
  { name:"Carrier EDI", mechanism:"COPARN / CODECO / COARRI", state:"PHASE 2", lag:"—", dlq:0, recon:"n/a", note:"Manual master fallback for free-time terms until then" },
  { name:"ARCA / broker", mechanism:"Broker system feed", state:"HEALTHY", lag:"2 min", dlq:0, recon:"0 drift", note:"Channel, authorisation, libramiento" },
  { name:"Telematics — driver ETA", mechanism:"Geofence webhook", state:"HEALTHY", lag:"9 s", dlq:0, recon:"0 drift", note:"Replaces the static 90-minute assumption" },
  { name:"Machine telemetry / RTLS", mechanism:"CAN + GPS", state:"PHASE 2", lag:"—", dlq:0, recon:"n/a", note:"Learned travel matrix waits on this" },
  { name:"Weather (wind)", mechanism:"Weather API", state:"HEALTHY", lag:"5 min", dlq:0, recon:"n/a", note:"Feeds hard constraint C11" }
]

export default function SettingsScreen() {
  const [tab, setTab] = useState("plan")
  const [weights, setWeights] = useState(FACTORS.map(f=>f.w))
  const [committed, setCommitted] = useState(false)
  const [replayed, setReplayed] = useState(false)
  const [degraded, setDegraded] = useState(false)
  const [bonded, setBonded] = useState(false)
  const [dropGo, setDropGo] = useState(true)

  const dirty = weights.some((w,i)=>w!==FACTORS[i].w)
  const stateColor = (st: string) => st==="HEALTHY"?"text-neutral-800":st==="DEGRADED"?"text-[#d9291c]":"text-neutral-400"
  const stateVariant = (st: string): "green"|"red"|"muted" => st==="HEALTHY"?"green":st==="DEGRADED"?"red":"muted"

  return (
    <div className="flex flex-col h-full min-h-0 overflow-auto bg-white text-neutral-900">
      {/* Header */}
      <div className="flex items-center gap-3 px-5 pt-3.5 pb-3 border-b-2 border-neutral-200 flex-none">
        <div className="flex flex-col gap-1">
          <span className="font-black text-[19px] tracking-tight">Settings</span>
          <span className="text-[11px] text-neutral-500">Objective weights, master data, adapters, roles, degraded mode — every operator-relevant switch in one place</span>
        </div>
        <div className="flex ml-3">
          {[["plan","Plan weights"],["integrations","Integrations"],["data","Master data"],["roles","Roles"]].map(([k,label],i,arr)=>(
            <button key={k} onClick={()=>setTab(k)}
              className="text-[11.5px] px-3.5 py-1.5 border border-neutral-300 font-bold transition-colors"
              style={{ borderRight:i<arr.length-1?"none":undefined, background:tab===k?"#201e1d":"transparent", color:tab===k?"#fff":"#201e1d" }}>
              {label}
            </button>
          ))}
        </div>
        <div className="ml-auto text-[11px] text-neutral-500">Changes are audited · commit lands on the next generation</div>
      </div>

      {tab==="plan" && (
        <div className="grid flex-1 min-h-0 overflow-auto" style={{gridTemplateColumns:"minmax(360px,1fr) clamp(280px,28vw,380px)"}}>
          <div className="border-r-2 border-neutral-200 overflow-auto pb-4">
            <div className="px-5 pt-3 pb-1 text-[10px] tracking-widest uppercase text-neutral-500 font-bold">Retrieval priority factors</div>
            {FACTORS.map((f,i)=>(
              <div key={f.k} className="px-5 py-2.5 border-b border-neutral-200">
                <div className="flex justify-between items-baseline text-[12px]">
                  <span className="font-semibold">{f.k}</span>
                  <span className={`tabular ${weights[i]!==f.w?"text-[#d9291c]":"text-neutral-500"}`}>W {weights[i]}</span>
                </div>
                <input type="range" min={0} max={40} value={weights[i]}
                  onChange={e=>{const w=[...weights];w[i]=+e.target.value;setWeights(w);setCommitted(false)}}
                  className="w-full mt-1.5 accent-[#d9291c]" />
                <div className="text-[10.5px] text-neutral-500">{f.scoring}</div>
              </div>
            ))}
          </div>
          <div className="overflow-auto">
            <div className="px-4 pt-3 pb-1 text-[10px] tracking-widest uppercase text-neutral-500 font-bold">Stability parameters</div>
            {[
              {k:"Freeze window",v:"20 min"},{k:"Minimum improvement",v:"8 machine-min"},
              {k:"Reassign cap",v:"2 / operator / hour"},{k:"Event debounce",v:"90 s"},
              {k:"Replan cooldown",v:"10 min"},{k:"Zone ceiling",v:"85%"}
            ].map(p=>(
              <div key={p.k} className="flex justify-between gap-3 px-4 py-1.5 border-b border-neutral-200 text-[11.5px]">
                <span className="text-neutral-600">{p.k}</span><span className="font-semibold">{p.v}</span>
              </div>
            ))}
            <div className="px-4 pt-3.5 pb-1 text-[10px] tracking-widest uppercase text-neutral-500 font-bold">Impact preview</div>
            {[
              {k:"Detention exposure 72 h",current:"$8.4k",candidate:dirty?"$6.1k":"$8.4k",better:dirty},
              {k:"Predicted rehandles / move",current:"0.31",candidate:dirty?"0.36":"0.31",better:!dirty},
              {k:"Turn P50",current:"13.4′",candidate:dirty?"13.9′":"13.4′",better:!dirty},
              {k:"Moves resequenced",current:"—",candidate:dirty?"34 of 96":"—",better:false},
            ].map(s=>(
              <div key={s.k} className="px-4 py-2 border-b border-neutral-200">
                <div className="text-[11.5px] font-semibold">{s.k}</div>
                <div className="flex justify-between text-[11.5px] mt-0.5 tabular">
                  <span className="text-neutral-500">current {s.current}</span>
                  <span className={`font-bold ${dirty&&!s.better?"text-[#d9291c]":""}`}>candidate {s.candidate}</span>
                </div>
              </div>
            ))}
            <div className="px-4 py-3.5 text-[12px] leading-relaxed text-neutral-700">
              {dirty
                ? "Raising detention urgency buys $2.3k of exposure for 42 extra machine-minutes and 0.05 rehandles per move. Worth it while the tariff tier is escalating, not once the container is inside free time."
                : "Move a weight to see the trade-off priced in machine-minutes against detention exposure. Nothing is applied until you commit, and the commit lands on the next generation."}
            </div>
            <div className="px-4 pb-4">
              <Button size="sm" className="text-xs" onClick={()=>setCommitted(true)}>
                {committed?"Committed · snapshot #b70e12":dirty?"Commit to next generation":"No changes to commit"}
              </Button>
            </div>
          </div>
        </div>
      )}

      {tab==="integrations" && (
        <div className="flex-1 min-h-0 overflow-auto">
          <table className="w-full border-collapse text-[12px]">
            <thead>
              <tr>
                {["ADAPTER","STATE","LAG","DLQ","RECONCILE","NOTE"].map(h=>(
                  <th key={h} className="text-left py-2.5 text-[9.5px] font-bold tracking-widest uppercase text-neutral-500 border-b-2 border-neutral-200 sticky top-0 bg-white z-10"
                    style={{paddingLeft:h==="ADAPTER"?"20px":"12px",paddingRight:h==="NOTE"?"20px":"12px"}}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {ADAPTERS.map(a=>(
                <tr key={a.name} className="border-b border-neutral-200"
                  style={{
                    borderLeft: `3px solid ${a.state==="DEGRADED"?"#f59e0b":"transparent"}`,
                    opacity: a.state==="PENDING"||a.state==="PHASE 2" ? 0.55 : 1,
                  }}>
                  <td className="py-2.5 pl-5 pr-3 font-semibold">
                    {a.name}
                    {(a.state==="PENDING"||a.state==="PHASE 2") && (
                      <span className="ml-2 text-[9px] tracking-widest uppercase text-neutral-400 font-normal italic">roadmap</span>
                    )}
                    <div className="text-[11px] font-normal text-neutral-500">{a.mechanism}</div>
                  </td>
                  <td className="px-3 py-2.5">
                    <Badge variant={stateVariant(a.state)} className="text-[10px]">{a.state}</Badge>
                  </td>
                  <td className="px-3 py-2.5 tabular">{a.lag}</td>
                  <td className={`px-3 py-2.5 tabular ${a.dlq&&!replayed?"text-[#d9291c]":""}`}>
                    {a.name==="Exolgan Dock Sud"&&replayed?0:a.dlq}
                  </td>
                  <td className="px-3 py-2.5 tabular">{a.recon}</td>
                  <td className="px-3 py-2.5 pr-5 text-neutral-600 leading-tight">{a.note}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="px-5 py-4 flex gap-2.5">
            <Button variant="secondary" size="sm" className="text-xs" onClick={()=>setReplayed(true)}>
              {replayed?"3 messages replayed · DLQ empty":"Replay dead-letter queue"}
            </Button>
            <Button variant="ghost" size="sm" className="text-xs" onClick={()=>setDegraded(!degraded)}>
              {degraded?"Degraded mode armed":"Enter degraded mode"}
            </Button>
          </div>
        </div>
      )}

      {tab==="data" && (
        <div className="flex-1 min-h-0 overflow-auto px-5 py-4">
          <div className="text-[10px] tracking-widest uppercase text-neutral-500 font-bold">Master data</div>
          <div className="flex flex-wrap gap-2.5 mt-2.5">
            {[
              {k:"Carriers",v:"5 · tariffs current"},{k:"Consignees",v:"7 active"},
              {k:"Depots",v:"4 · windows set"},{k:"Equipment",v:"5 · capacity charts loaded"},
              {k:"Operators",v:"5 · certs verified"},{k:"Zones & slots",v:"7 zones · 1,124 slots"},
              {k:"Holidays",v:"AR 2026 · 1 moved"},{k:"Reason codes",v:"22 controlled"}
            ].map(m=>(
              <div key={m.k} className="border border-neutral-300 px-3 py-2 min-w-[158px]">
                <div className="text-[12px] font-semibold">{m.k}</div>
                <div className="text-[11px] text-neutral-500 tabular">{m.v}</div>
              </div>
            ))}
          </div>
          <div className="mt-5 text-[10px] tracking-widest uppercase text-neutral-500 font-bold">Assumptions</div>
          {[
            {k:"Bonded (D-02)", opts:[{v:false,label:"No"},{v:true,label:"Yes"}], val:bonded, set:(v:boolean)=>setBonded(v)},
            {k:"Inbound mode (D-01)", opts:[{v:true,label:"Drop-and-go"},{v:false,label:"Live unload"}], val:dropGo, set:(v:boolean)=>setDropGo(v)},
            {k:"Degraded mode drill", opts:[{v:false,label:"Idle"},{v:true,label:"Armed"}], val:degraded, set:(v:boolean)=>setDegraded(v)},
          ].map(a=>(
            <div key={a.k} className="flex justify-between items-center py-2 border-b border-neutral-200 text-[11.5px]">
              <span>{a.k}</span>
              <div className="flex gap-1">
                {a.opts.map(o=>(
                  <button key={o.label} onClick={()=>a.set(o.v as boolean)}
                    className="text-[10.5px] px-2.5 py-1 border border-neutral-300 font-semibold transition-colors"
                    style={{background:a.val===o.v?"#201e1d":"transparent",color:a.val===o.v?"#fff":"#201e1d"}}>
                    {o.label}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {tab==="roles" && (
        <div className="flex-1 min-h-0 overflow-auto">
          <table className="w-full border-collapse text-[12px]">
            <thead>
              <tr>
                {["PERSONA","SCREENS","USERS","NOTE"].map(h=>(
                  <th key={h} className="text-left py-2.5 text-[9.5px] font-bold tracking-widest uppercase text-neutral-500 border-b-2 border-neutral-200 sticky top-0 bg-white z-10"
                    style={{paddingLeft:h==="PERSONA"?"20px":"12px",paddingRight:h==="NOTE"?"20px":"12px"}}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {[
                {name:"Yard Manager",screens:"Yard · Plan · Tower · Gate · Operator · Settings",users:6,note:"Owns the plan and the exceptions; can override with a reason code"},
                {name:"Gate & Yard Ops",screens:"Yard · Gate",users:4,note:"Gate clerks and yard operators — front line, no config authority"},
                {name:"Operator",screens:"Operator",users:11,note:"Device-bound; single-instruction view; supervisor-approved exceptions"},
              ].map(p=>(
                <tr key={p.name} className="border-b border-neutral-200">
                  <td className="py-3 pl-5 pr-3 font-bold">{p.name}</td>
                  <td className="px-3 py-3">{p.screens}</td>
                  <td className="px-3 py-3 tabular">{p.users}</td>
                  <td className="px-3 py-3 pr-5 text-neutral-600 leading-relaxed">{p.note}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="px-5 py-4 text-[12px] leading-relaxed text-neutral-700 max-w-3xl">Three personas replaces the nine-role matrix from PRD v2.0. Every access is written to the audit log. Broker and finance views arrive after Phase 0 — they were external and reporting audiences that don't reshape day-of operations.</div>
        </div>
      )}
    </div>
  )
}
