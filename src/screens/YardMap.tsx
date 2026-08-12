import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { useData } from "@/lib/DataContext"
import type { Container, Zone } from "@/data/yard-data"

interface Props {
  focus: string | null
  onNavigate: (target: string, focus?: string) => void
}

type ColorMode = "status" | "lfd" | "channel" | "dwell"

function containerColor(c: Container, mode: ColorMode): string {
  if (mode === "lfd") {
    if (c.hoursToLFD < 0) return "#9b1c1c"
    if (c.hoursToLFD <= 24) return "#d9291c"
    if (c.hoursToLFD <= 72) return "#f59e0b"
    return "#d1d5db"
  }
  if (mode === "channel") {
    return { rojo:"#9b1c1c", naranja:"#f97316", verde:"#d1d5db" }[c.channel] || "#e5e7eb"
  }
  if (mode === "dwell") {
    if (c.dwellDays > 18) return "#111827"
    if (c.dwellDays > 10) return "#374151"
    if (c.dwellDays > 4) return "#6b7280"
    return "#d1d5db"
  }
  return { IN_YARD:"#9ca3af", STAGED:"#fbbf24", AT_RECEIVING_LANE:"#4b5563", CUSTOMS_CONTROLLED:"#9b1c1c" }[c.status] || "#d1d5db"
}

const LEGENDS: Record<ColorMode, [string,string][]> = {
  status: [["In yard","#9ca3af"],["Staged","#fbbf24"],["Receiving","#4b5563"],["Customs held","#9b1c1c"]],
  lfd: [["Breached","#9b1c1c"],["≤24 h","#d9291c"],["≤72 h","#f59e0b"],[">72 h","#d1d5db"]],
  channel: [["Rojo","#9b1c1c"],["Naranja","#f97316"],["Verde","#d1d5db"]],
  dwell: [["<5 d","#d1d5db"],["5–10 d","#6b7280"],["10–18 d","#374151"],[">18 d","#111827"]],
}

export default function YardMap({ focus, onNavigate }: Props) {
  const { containers, zones, moves, turnByHour, cycleByType, capacity } = useData()

  const [view, setView] = useState<"map"|"dash">("map")
  const [mode, setMode] = useState<ColorMode>("status")
  const [q, setQ] = useState("")
  const [zone, setZone] = useState("A")
  const [block, setBlock] = useState(1)
  const [row, setRow] = useState(1)
  const [sel, setSel] = useState<string|null>(() => {
    const first = containers.find(c => c.zone==="A"&&c.block===1&&c.row===1)
    return first?.id || null
  })

  // When DB data replaces seed, update initial selection if needed
  useEffect(() => {
    if (!sel && containers.length) {
      const first = containers.find(c => c.zone==="A"&&c.block===1&&c.row===1)
      if (first) setSel(first.id)
    }
  }, [containers])

  useEffect(() => {
    if (!focus) return
    const c = containers.find(x => x.id === focus)
    if (c) { setSel(c.id); setZone(c.zone); setBlock(c.block); setRow(c.row); setView("map") }
  }, [focus, containers])

  const zoneDef: Zone = zones.find(z => z.id === zone) || zones[0] || { id:"A", name:"", blocks:6, rows:3, slots:10, maxTiers:4, ceiling:0.85, hazmat:false, customs:false }
  const ql = q.trim().toLowerCase()
  const match = (c: Container) => !ql || (c.id+c.consignee+c.vessel+c.address+c.carrierName).toLowerCase().includes(ql)
  const all = containers
  const selC = all.find(c => c.id === sel)

  const mapZones = zones.filter(z => !"RS".includes(z.id)).map(z => {
    const cap = z.blocks*z.rows*z.slots*z.maxTiers
    const used = all.filter(c => c.zone===z.id).length
    const pct = Math.round(used/cap*100)
    const over = pct > z.ceiling*100
    return { z, pct, over, used, cap }
  })

  const blocks = Array.from({length:zoneDef.blocks},(_,i)=>i+1).map(b => {
    const inBlock = all.filter(c=>c.zone===zoneDef.id&&c.block===b)
    const cells = Array.from({length:zoneDef.slots},(_,i)=>{
      const stack = inBlock.filter(c=>c.slot===i+1).sort((x,y)=>y.tier-x.tier)
      return stack[0] ? containerColor(stack[0],mode) : "#e5e7eb"
    })
    return { b, label:`${zoneDef.id}-${String(b).padStart(2,"0")}`, count:inBlock.length, cells }
  })

  const tiers = Array.from({length:zoneDef.maxTiers},(_,i)=>zoneDef.maxTiers-i).map(tier => ({
    tier,
    cells: Array.from({length:zoneDef.slots},(_,i)=>{
      const c = all.find(x=>x.zone===zoneDef.id&&x.block===block&&x.row===row&&x.slot===i+1&&x.tier===tier)
      if (!c) return { c:null, bg:"transparent", border:"#d1d5db", fg:"#6b7280", cursor:"default", dim:false }
      const selected = c.id===sel
      const dim = !!ql && !match(c)
      const bg = containerColor(c,mode)
      const dark = /^#[0-6]/.test(bg) || bg==="#4b5563"||bg==="#374151"||bg==="#111827"||bg==="#9b1c1c"
      return { c, bg, border:selected?"#d9291c":"#9ca3af", fg:dark?"#fff":"#111827", cursor:"pointer", dim }
    })
  }))

  return (
    <div className="flex flex-col h-full min-h-0 overflow-auto bg-white text-neutral-900">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2.5 px-5 py-3 border-b-2 border-neutral-200 flex-none">
        <div className="flex flex-col gap-0.5 mr-1.5">
          <span className="font-black text-[19px] tracking-tight">Yard</span>
          <span className="text-[11px] text-neutral-500">
            {all.length} containers · {ql ? `${all.filter(match).length} match "${q}"` : "7 zones · overlay: "+mode}
          </span>
        </div>
        <div className="flex">
          {(["map","dash"] as const).map((k,i)=>(
            <button key={k} onClick={()=>setView(k)}
              className="text-[10.5px] px-3 py-1.5 border border-neutral-300 font-bold transition-colors"
              style={{ borderRight:i===0?"none":undefined, background:view===k?"#201e1d":"transparent", color:view===k?"#fff":"#333" }}>
              {k==="map"?"Map":"Dashboard"}
            </button>
          ))}
        </div>
        {view==="map" && (
          <>
            <Input placeholder="Container, consignee, vessel, slot…" value={q} onChange={e=>setQ(e.target.value)} className="w-56 h-7 text-xs" />
            <div className="flex">
              {(["status","lfd","channel","dwell"] as ColorMode[]).map((k,i,arr)=>(
                <button key={k} onClick={()=>setMode(k)}
                  className="text-[10.5px] px-2.5 py-1.5 border border-neutral-300 font-semibold capitalize transition-colors"
                  style={{ borderRight:i<arr.length-1?"none":undefined, background:mode===k?"#201e1d":"transparent", color:mode===k?"#fff":"#333" }}>
                  {k}
                </button>
              ))}
            </div>
          </>
        )}
        <div className="flex gap-3.5 ml-auto items-center">
          {view==="map" && LEGENDS[mode].map(([label,color])=>(
            <span key={label} className="flex items-center gap-1.5 text-[11px] text-neutral-600">
              <span className="w-2.5 h-2.5 border border-neutral-400 inline-block" style={{background:color}} />
              {label}
            </span>
          ))}
        </div>
      </div>

      {view==="map" && (
        <>
          {/* KPI bar */}
          <div className="flex flex-wrap border-b-2 border-neutral-200 flex-none">
            {[{k:"Truck turn P50",v:"13.8′",sub:"target 15′"},{k:"Job cycle P50",v:"4.9′",sub:"target 5′"},{k:"Occupancy",v:"72%",sub:"ceiling 85%"},{k:"Detention at risk 72 h",v:"$8.4k",sub:"31 containers",red:true},{k:"Plan adherence",v:"89%",sub:"target ≥85%"}].map(m=>(
              <div key={m.k} className="flex-1 basis-36 px-5 py-2.5 border-r border-neutral-200 flex flex-col gap-0.5">
                <span className="text-[10px] tracking-widest uppercase text-neutral-500">{m.k}</span>
                <div className="flex items-baseline gap-2">
                  <span className={`font-black text-[19px] leading-none tracking-tight ${m.red?"text-[#d9291c]":""}`}>{m.v}</span>
                  <span className="text-[11px] text-neutral-500">{m.sub}</span>
                </div>
              </div>
            ))}
          </div>

          <div className="grid flex-1 min-h-0 overflow-auto" style={{gridTemplateColumns:"clamp(180px,16vw,230px) minmax(360px,1fr) clamp(260px,25vw,350px)"}}>
            {/* Zone list */}
            <div className="border-r-2 border-neutral-200 overflow-auto">
              <div className="px-4 pt-3 pb-2 text-[10px] tracking-widest uppercase text-neutral-500 font-bold">Zones · occupancy vs ceiling</div>
              {mapZones.map(({z,pct,over,used,cap})=>(
                <button key={z.id} onClick={()=>{setZone(z.id);setBlock(1);setRow(1)}}
                  className="block w-full text-left px-4 py-2.5 hover:bg-neutral-50 transition-colors"
                  style={{ borderLeft:`3px solid ${zone===z.id?"#d9291c":"transparent"}`, background:zone===z.id?"#fef3f2":undefined }}>
                  <div className="flex justify-between text-[12px] font-semibold">
                    <span>{z.name.replace("Zone ","").replace(" — "," · ")}</span>
                    <span className={`tabular ${over?"text-[#d9291c]":"text-neutral-500"}`}>{pct}%</span>
                  </div>
                  <div className="relative h-1 bg-neutral-200 mt-1.5">
                    <div className="absolute left-0 top-0 h-1" style={{background:over?"#d9291c":"#374151",width:pct+"%"}} />
                    <div className="absolute top-[-2px] h-2 w-0.5 bg-neutral-900" style={{left:Math.round(z.ceiling*100)+"%"}} />
                  </div>
                  <div className="text-[10.5px] text-neutral-500 mt-1">{used} of {cap} slots · ceiling {Math.round(z.ceiling*100)}%</div>
                </button>
              ))}
            </div>

            {/* Block grid + front view */}
            <div className="flex flex-col min-h-0 overflow-auto">
              <div className="px-4 pt-3 pb-1.5 flex items-baseline gap-2.5">
                <span className="text-[10px] tracking-widest uppercase text-neutral-500 font-bold">Blocks · {zoneDef.name}</span>
                <span className="text-[11px] text-neutral-500">click a block to open its front view</span>
              </div>
              <div className="flex flex-wrap gap-2.5 px-4 pb-3">
                {blocks.map(({b,label,count,cells})=>(
                  <button key={b} onClick={()=>{setBlock(b);setRow(1)}}
                    className="border-2 p-2 text-left min-w-[104px] hover:bg-neutral-50 transition-colors"
                    style={{borderColor:block===b?"#d9291c":"#d1d5db"}}>
                    <div className="flex justify-between text-[11px] font-bold">
                      <span>{label}</span><span className="text-neutral-500 tabular">{count}</span>
                    </div>
                    <div className="flex gap-0.5 mt-1.5">
                      {cells.map((c,i)=><span key={i} className="w-1.5 h-5 inline-block" style={{background:c}} />)}
                    </div>
                  </button>
                ))}
              </div>

              <div className="border-t-2 border-neutral-200 px-4 pt-3 pb-1.5 flex items-baseline gap-3 flex-wrap">
                <span className="text-[10px] tracking-widest uppercase text-neutral-500 font-bold">
                  Front view · block {zoneDef.id}-{String(block).padStart(2,"0")}
                </span>
                <div className="flex">
                  {Array.from({length:zoneDef.rows},(_,i)=>i+1).map((r,i,arr)=>(
                    <button key={r} onClick={()=>setRow(r)}
                      className="text-[10.5px] px-2.5 py-1 border border-neutral-300 font-semibold"
                      style={{ borderRight:i<arr.length-1?"none":undefined, background:row===r?"#201e1d":"transparent", color:row===r?"#fff":"#333" }}>
                      Row {r}
                    </button>
                  ))}
                </div>
                <span className="text-[11px] text-neutral-500">row {row} of {zoneDef.rows} · max tier {zoneDef.maxTiers}</span>
              </div>
              <div className="px-4 pb-4 overflow-auto">
                {tiers.map(({tier,cells})=>(
                  <div key={tier} className="flex items-stretch gap-0.5 mb-0.5">
                    <span className="w-9 text-[10px] text-neutral-500 self-center">T{tier}</span>
                    {cells.map(({c,bg,border,fg,cursor,dim},i)=>(
                      <button key={i} onClick={()=>c&&setSel(c.id)}
                        className="flex-1 min-w-[52px] h-9 border text-[9.5px] flex flex-col justify-center items-start px-1.5 gap-px hover:outline hover:outline-2 hover:outline-[#d9291c] transition-all"
                        style={{background:bg,borderColor:border,color:fg,cursor,opacity:dim?0.3:1}}>
                        {c && <>
                          <span className="font-bold">{c.id.slice(0,4)}</span>
                          <span className="opacity-75">{c.id.slice(4)} · {c.hoursToLFD<0?"−"+Math.abs(c.hoursToLFD):c.hoursToLFD}h</span>
                        </>}
                      </button>
                    ))}
                  </div>
                ))}
                <div className="flex gap-0.5 mt-1">
                  <span className="w-9" />
                  {Array.from({length:zoneDef.slots},(_,i)=>(
                    <span key={i} className="flex-1 min-w-[52px] text-[9.5px] text-neutral-500">S{i+1}</span>
                  ))}
                </div>
              </div>
            </div>

            {/* Container detail */}
            <div className="border-l-2 border-neutral-200 flex flex-col min-h-0 overflow-auto">
              {selC ? (
                <div>
                  <div className="px-4 pt-3.5 pb-3">
                    <div className="text-[10px] tracking-widest uppercase text-neutral-500">{selC.address}</div>
                    <div className="font-black text-[19px] mt-1 tabular tracking-tight">{selC.id}</div>
                    <div className="text-[12px] text-neutral-600 mt-0.5">{selC.consignee} · {selC.carrierName} · {selC.vessel}</div>
                  </div>
                  <div className="px-4 py-3 border-t-2 border-b border-neutral-200 bg-red-50">
                    <div className="text-[10px] tracking-widest uppercase text-[#a01f14] mb-1">Why here</div>
                    <div className="text-[12.5px] leading-relaxed">{selC.whyHere}</div>
                  </div>
                  {[
                    ["Size / gross", selC.size+" · "+(selC.grossKg/1000).toFixed(1)+" t"],
                    ["Status", selC.status.replace(/_/g," ").toLowerCase()],
                    ["Hours to LFD", selC.hoursToLFD<0?"breached "+Math.abs(selC.hoursToLFD)+" h":selC.hoursToLFD+" h", selC.hoursToLFD<=24],
                    ["Customs channel", selC.channel, selC.channel==="rojo"||selC.channel==="naranja"],
                    ["Dwell", selC.dwellDays+" days"],
                    ["Order priority", selC.priority],
                    ["Hazmat", selC.hazmat?"IMDG "+selC.imdg:"no"],
                    ["Seal", selC.seal],
                    ["Terminal", selC.terminal],
                  ].map(([k,v,red])=>(
                    <div key={String(k)} className="flex justify-between gap-3 px-4 py-2 border-b border-neutral-200 text-[11.5px]">
                      <span className="text-neutral-500">{k}</span>
                      <span className={`font-semibold text-right ${red?"text-[#d9291c]":""}`}>{String(v)}</span>
                    </div>
                  ))}
                  <div className="px-4 pt-3 pb-1.5 text-[10px] tracking-widest uppercase text-neutral-500 font-bold">Move history</div>
                  {[
                    {t:"05:12",what:"Placed at "+selC.address+" by OP-207 (RS-02), 4.2′"},
                    {t:"04:48",what:"Received from receiving lane R-02"},
                    {t:"04:31",what:"Gate-in, EIR captured, seal "+selC.seal+" verified"},
                    {t:"02:55",what:"Departed "+selC.terminal},
                  ].map(h=>(
                    <div key={h.t} className="flex gap-2.5 px-4 py-1.5 text-[11.5px]">
                      <span className="text-neutral-500 tabular w-10">{h.t}</span>
                      <span className="flex-1 leading-tight">{h.what}</span>
                    </div>
                  ))}
                  <div className="px-4 pt-3 pb-1.5 text-[10px] tracking-widest uppercase text-neutral-500 font-bold">Open in</div>
                  <div className="flex flex-col gap-1.5 px-4 pb-4">
                    <Button variant="secondary" size="sm" className="text-[11.5px] justify-start" onClick={()=>onNavigate("S4",selC.id)}>
                      {moves.some(m=>m.containerId===selC.id)?"Planned move in the night plan →":"No planned move today · open the plan →"}
                    </Button>
                    <Button variant="secondary" size="sm" className="text-[11.5px] justify-start" onClick={()=>onNavigate("S7",selC.id)}>Related events in the tower →</Button>
                    <Button variant="secondary" size="sm" className="text-[11.5px] justify-start" onClick={()=>onNavigate("S2",selC.id)}>Container in the gate console →</Button>
                  </div>
                </div>
              ) : (
                <div className="px-4 py-4 text-[12px] text-neutral-500 leading-relaxed">Select a container in the front view to see its record, the sentence explaining why the planner put it there, and its links into the plan and the tower.</div>
              )}
            </div>
          </div>
        </>
      )}

      {view==="dash" && (
        <div className="flex-1 min-h-0 overflow-auto">
          <div className="flex flex-wrap border-b-2 border-neutral-200">
            {[
              {k:"Truck turn P50",v:"13.8′",target:"15.0′",baseline:"31.4′",verdict:"WITHIN",red:false},
              {k:"Truck turn P90",v:"21.4′",target:"22.0′",baseline:"52.8′",verdict:"WITHIN",red:false},
              {k:"Job cycle P50",v:"4.9′",target:"5.0′",baseline:"8.7′",verdict:"WITHIN",red:false},
              {k:"Job cycle P90",v:"7.6′",target:"7.5′",baseline:"14.2′",verdict:"OVER 0.1′",red:true},
            ].map(c=>(
              <div key={c.k} className="flex-1 basis-52 px-5 py-3.5 border-r border-neutral-200">
                <div className="flex justify-between items-baseline">
                  <span className="text-[10px] tracking-widest uppercase text-neutral-500">{c.k}</span>
                  <span className={`text-[10px] font-bold tracking-wider ${c.red?"text-[#d9291c]":""}`}>{c.verdict}</span>
                </div>
                <div className="flex items-baseline gap-2 mt-1.5">
                  <span className={`font-black text-[26px] leading-none tracking-tight ${c.red?"text-[#d9291c]":""}`}>{c.v}</span>
                  <span className="text-[11.5px] text-neutral-500">target {c.target} · baseline {c.baseline}</span>
                </div>
              </div>
            ))}
          </div>
          <div className="grid min-h-80" style={{gridTemplateColumns:"minmax(360px,1fr) minmax(320px,1fr)"}}>
            <div className="border-r-2 border-neutral-200 px-5 py-3">
              <div className="text-[10px] tracking-widest uppercase text-neutral-500 font-bold">Truck turn by hour</div>
              <div className="flex items-end gap-2 h-40 mt-2.5">
                {turnByHour.map(t=>(
                  <div key={t.hour} className="flex-1 flex flex-col justify-end gap-0.5 h-full">
                    <div className="bg-neutral-300" style={{height:((t.p90-t.p50)/28*100).toFixed(1)+"%"}} />
                    <div className={t.p50>15?"bg-[#d9291c]":"bg-neutral-800"} style={{height:(t.p50/28*100).toFixed(1)+"%"}} />
                    <span className="text-[9.5px] text-neutral-500">{t.hour}</span>
                  </div>
                ))}
              </div>
              <p className="text-[11px] text-neutral-500 mt-2.5 leading-relaxed">Grey is P90, solid is P50. The 08:00 hour breaches — inbound put-away competes with outbound loading.</p>
              <div className="mt-3.5 text-[10px] tracking-widest uppercase text-neutral-500 font-bold">Machine job cycle by move type</div>
              {cycleByType.map(r=>(
                <div key={r.type} className="py-1.5 border-b border-neutral-200">
                  <div className="flex justify-between text-[11.5px]">
                    <span>{r.type}</span>
                    <span className="tabular text-neutral-500">P50 <strong className={r.p50>5?"text-[#d9291c]":""}>{r.p50.toFixed(1)}′</strong> · P90 {r.p90.toFixed(1)}′ · n={r.n}</span>
                  </div>
                </div>
              ))}
            </div>
            <div className="px-5 py-3">
              <div className="text-[10px] tracking-widest uppercase text-neutral-500 font-bold">Machine-hours required vs available</div>
              {capacity.map(c=>(
                <div key={c.month} className="py-2.5 border-b border-neutral-200">
                  <div className="flex justify-between text-[11.5px]">
                    <span className="font-semibold">{c.month} · {c.volume} containers</span>
                    <span className={`tabular ${c.breach?"text-[#d9291c]":"text-neutral-600"}`}>{c.required.toFixed(1)} req / {c.available.toFixed(1)} avail</span>
                  </div>
                  <div className="relative h-2 bg-neutral-100 mt-1.5">
                    <div className={c.breach?"bg-[#d9291c]":"bg-neutral-600"} style={{position:"absolute",left:0,top:0,bottom:0,width:Math.min(100,c.required/55*100).toFixed(0)+"%"}} />
                    <div className="absolute top-[-2px] h-3 w-0.5 bg-neutral-900" style={{left:(c.available/55*100).toFixed(0)+"%"}} />
                  </div>
                  <div className="text-[10.5px] text-neutral-500 mt-1">{c.breach?"breach — "+(c.required-c.available).toFixed(1)+" machine-hours short":"within available hours"}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
