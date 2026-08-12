import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table"
import { MOVES, OPERATORS, ASSUMPTIONS, EXCEPTIONS, TYPE_LABEL, Move } from "@/data/yard-data"

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

export default function NightPlanner({ focus, onNavigate }: Props) {
  const [sel, setSel] = useState<string>(MOVES[8].id)
  const [tab, setTab] = useState("detail")
  const [q, setQ] = useState("")
  const [filter, setFilter] = useState("ALL")
  const [published, setPublished] = useState(false)
  const [configOpen, setConfigOpen] = useState(false)
  const [wRaw, setWRaw] = useState([40, 25, 20, 15])

  useEffect(() => {
    if (!focus) return
    const m = MOVES.find(x => x.containerId === focus)
    if (m) { setSel(m.id); setTab("detail"); setFilter("ALL"); setQ("") }
    else { setQ(focus); setFilter("ALL"); setSel(""); setTab("detail") }
  }, [focus])

  const types = ["ALL","RETRIEVE_STAGE","PLACE_INBOUND","RESHUFFLE","LOAD_OUTBOUND"]
  const ql = q.trim().toLowerCase()
  const rows = MOVES.filter(m =>
    (filter === "ALL" || m.type === filter) &&
    (!ql || (m.containerId+m.from+m.to+m.operatorName+m.equipment+m.type).toLowerCase().includes(ql))
  )
  const selMove = MOVES.find(m => m.id === sel) || null
  const onShift = OPERATORS.filter(o => o.status === "on shift")
  const totalMin = MOVES.reduce((a,m) => a+m.estMin, 0)

  const projection = [
    { k:"Truck turn P50", target:"15.0′", opt:"11.8′", exp:"13.4′", pes:"17.1′", bandLeft:20, bandWidth:48, mark:66 },
    { k:"Truck turn P90", target:"22.0′", opt:"18.2′", exp:"21.0′", pes:"27.4′", bandLeft:26, bandWidth:52, mark:70 },
    { k:"Job cycle P50", target:"5.0′", opt:"4.2′", exp:"4.8′", pes:"6.1′", bandLeft:18, bandWidth:50, mark:62 },
    { k:"Plan adherence", target:"≥85%", opt:"94%", exp:"89%", pes:"78%", bandLeft:22, bandWidth:56, mark:58 },
    { k:"Detention breaches", target:"0", opt:"0", exp:"0", pes:"2", bandLeft:10, bandWidth:40, mark:22 },
  ]

  return (
    <div className="relative flex flex-col h-full min-h-0 overflow-auto bg-white text-neutral-900">

      {/* Config overlay */}
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

      {/* Header */}
      <div className="flex items-center gap-4 px-5 pt-3.5 pb-3 border-b-2 border-neutral-200 flex-none">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2.5">
            <span className="font-black text-[19px] tracking-tight">Night-before plan</span>
            <Badge variant={published ? "brand" : "muted"}>{published ? "PUBLISHED" : "DRAFT"}</Badge>
          </div>
          <div className="flex gap-3 text-[11px] text-neutral-500">
            <span>P-2026-08-11</span><span>Generated 22:14</span><span>Engine 41.8 s</span><span>Snapshot #a41f9c</span><span>Horizon 06:00–14:00</span>
          </div>
        </div>
        <div className="ml-auto flex gap-2">
          <Button variant="ghost" size="sm" className="text-xs" onClick={() => setConfigOpen(true)}>Configure</Button>
          <Button variant="secondary" size="sm" className="text-xs" onClick={() => setPublished(false)}>Regenerate</Button>
          <Button size="sm" className="text-xs" onClick={() => setPublished(true)}>{published ? "Published · view diff" : "Approve & publish"}</Button>
        </div>
      </div>

      {/* Plan banner */}
      <div className="px-5 py-2.5 bg-neutral-100 border-b border-neutral-200 text-[12.5px] leading-relaxed text-neutral-700 max-w-5xl flex-none">
        Plan, filter, and sequence today's 96 moves across 3 reach stackers and 1 empty handler, ranked by free-time urgency, detention cost, hazmat handling, order priority, dig-out cost, gate pressure, customs channel, empty-return windows, damage state and dwell — with every placement carrying a one-sentence reason.
      </div>

      {/* Metrics row */}
      <div className="flex flex-wrap border-b-2 border-neutral-200 flex-none bg-white">
        {[
          { k:"Moves planned", v:"96", sub:"of 284 today" },
          { k:"Machine-hours", v:(totalMin/60).toFixed(1), sub:"of 32.0" },
          { k:"Truck turn P50", v:"13.4′", sub:"target 15′" },
          { k:"Job cycle P50", v:"4.8′", sub:"target 5′" },
          { k:"Detention at risk", v:"$8.4k", sub:"next 72 h", red:true },
          { k:"Exceptions", v:"3", sub:"unresolved", red:true },
        ].map(m => (
          <div key={m.k} className="flex-1 basis-36 px-5 py-2.5 border-r border-neutral-200 flex flex-col gap-0.5">
            <span className="text-[10px] tracking-widest uppercase text-neutral-500">{m.k}</span>
            <div className="flex items-baseline gap-2">
              <span className={`font-black text-[22px] leading-none tracking-tight ${m.red?"text-[#d9291c]":""}`}>{m.v}</span>
              <span className="text-[11px] text-neutral-500">{m.sub}</span>
            </div>
          </div>
        ))}
      </div>

      {/* Main 3-col grid */}
      <div className="grid flex-1 min-h-0 overflow-auto" style={{ gridTemplateColumns: "clamp(170px,15vw,220px) minmax(340px,1fr) clamp(250px,24vw,340px)" }}>

        {/* Left: assumptions + weights */}
        <div className="border-r-2 border-neutral-200 flex flex-col min-h-0 overflow-auto">
          <div className="px-4 pt-3 pb-2 text-[10px] tracking-widest uppercase text-neutral-500 font-bold">Assumptions</div>
          {ASSUMPTIONS.map(a => (
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
            <span className="ml-auto text-[11px] text-neutral-500">{rows.length} of {MOVES.length} moves · 12 frozen</span>
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
                  <tr key={m.id}
                    onClick={() => { setSel(m.id); setTab("detail") }}
                    className="cursor-pointer hover:bg-neutral-50 border-b border-neutral-200 transition-colors"
                    style={{ background: m.id===sel?"#fef3f2":undefined }}
                  >
                    <td className="py-2 pl-4 pr-2.5 tabular text-neutral-500" style={{ borderLeft: `3px solid ${m.id===sel?"#d9291c":m.frozen?"#ccc":"transparent"}` }}>
                      {String(m.seq).padStart(3,"0")}
                    </td>
                    <td className="px-2.5 py-2 tabular whitespace-nowrap">{m.start}–{m.end}</td>
                    <td className="px-2.5 py-2">
                      <div className="font-bold">{TYPE_LABEL[m.type]}</div>
                      <div className="text-[11px] text-neutral-500 tabular">{m.containerId}</div>
                    </td>
                    <td className="px-2.5 py-2 tabular text-neutral-600 whitespace-nowrap">{m.from} → {m.to}</td>
                    <td className="px-2.5 py-2 whitespace-nowrap">
                      <div>{m.operatorName}</div>
                      <div className="text-[11px] text-neutral-500">{m.equipment} · {m.state.toLowerCase()}</div>
                    </td>
                    <td className="px-2.5 py-2 pl-2.5 pr-4 text-right tabular font-semibold">{m.estMin.toFixed(1)}′</td>
                  </tr>
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
              <TabsTrigger value="exceptions">Exceptions 3</TabsTrigger>
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
                  {focus || q || "This container"} has no move in plan P-2026-08-11 — 96 of 897 containers are moved today.
                </div>
              )}
            </TabsContent>

            <TabsContent value="exceptions">
              <div>
                {EXCEPTIONS.map(e => (
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

      {/* Gantt strip */}
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
                {MOVES.filter(m => m.operator === op.id).map(m => (
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
    </div>
  )
}
