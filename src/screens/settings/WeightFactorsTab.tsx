import { useState } from "react"
import { Button } from "@/components/ui/button"

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

export default function WeightFactorsTab() {
  const [weights, setWeights] = useState(FACTORS.map(f => f.w))
  const [committed, setCommitted] = useState(false)

  const dirty = weights.some((w, i) => w !== FACTORS[i].w)

  return (
    <div className="grid flex-1 min-h-0 overflow-auto" style={{gridTemplateColumns:"minmax(360px,1fr) clamp(280px,28vw,380px)"}}>
      <div className="border-r-2 border-neutral-200 overflow-auto pb-4">
        <div className="px-5 pt-3 pb-1 ds-label text-neutral-500 font-bold">Retrieval priority factors</div>
        {FACTORS.map((f, i) => (
          <div key={f.k} className="px-5 py-2 border-b border-[#f3f4f6]" style={{ minHeight: 38 }}>
            <div className="flex justify-between items-baseline text-[12px]">
              <span className="font-semibold">{f.k}</span>
              <span className={`font-mono ${weights[i] !== f.w ? "text-[#dc2626]" : "text-neutral-500"}`}>W <span className="font-mono">{weights[i]}</span></span>
            </div>
            <input type="range" min={0} max={40} value={weights[i]}
              onChange={e => { const w = [...weights]; w[i] = +e.target.value; setWeights(w); setCommitted(false) }}
              className="w-full mt-1 accent-[#dc2626]" />
            <div className="text-[10.5px] text-neutral-500">{f.scoring}</div>
          </div>
        ))}
      </div>
      <div className="overflow-auto">
        <div className="px-4 pt-3 pb-1 ds-label text-neutral-500 font-bold">Stability parameters</div>
        {[
          {k:"Freeze window",v:"20 min"},{k:"Minimum improvement",v:"8 machine-min"},
          {k:"Reassign cap",v:"2 / operator / hour"},{k:"Event debounce",v:"90 s"},
          {k:"Replan cooldown",v:"10 min"},{k:"Zone ceiling",v:"85%"}
        ].map(p => (
          <div key={p.k} className="flex justify-between gap-3 px-4 py-1 border-b border-[#f3f4f6] text-[11.5px]" style={{ minHeight: 38, alignItems: "center" }}>
            <span className="text-neutral-600">{p.k}</span>
            <span className="font-mono font-semibold">{p.v}</span>
          </div>
        ))}
        <div className="px-4 pt-3 pb-1 ds-label text-neutral-500 font-bold">Impact preview</div>
        {[
          {k:"Detention exposure 72 h",current:"$8.4k",candidate:dirty?"$6.1k":"$8.4k",better:dirty},
          {k:"Predicted rehandles / move",current:"0.31",candidate:dirty?"0.36":"0.31",better:!dirty},
          {k:"Turn P50",current:"13.4′",candidate:dirty?"13.9′":"13.4′",better:!dirty},
          {k:"Moves resequenced",current:"—",candidate:dirty?"34 of 96":"—",better:false},
        ].map(s => (
          <div key={s.k} className="px-4 py-2 border-b border-[#f3f4f6]">
            <div className="text-[11.5px] font-semibold">{s.k}</div>
            <div className="flex justify-between text-[11.5px] mt-0 font-mono">
              <span className="text-neutral-500">current {s.current}</span>
              <span className={`font-bold ${dirty && !s.better ? "text-[#dc2626]" : ""}`}>candidate {s.candidate}</span>
            </div>
          </div>
        ))}
        <div className="px-4 py-3 text-[12px] leading-relaxed text-neutral-700">
          {dirty
            ? "Raising detention urgency buys $2.3k of exposure for 42 extra machine-minutes and 0.05 rehandles per move. Worth it while the tariff tier is escalating, not once the container is inside free time."
            : "Move a weight to see the trade-off priced in machine-minutes against detention exposure. Nothing is applied until you commit, and the commit lands on the next generation."}
        </div>
        <div className="px-4 pb-4">
          <Button size="sm" className="text-xs" style={{ borderRadius: 5 }} onClick={() => setCommitted(true)}>
            {committed ? "Committed · snapshot #b70e12" : dirty ? "Commit to next generation" : "No changes to commit"}
          </Button>
        </div>
      </div>
    </div>
  )
}
