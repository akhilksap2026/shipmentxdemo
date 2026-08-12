import { useState } from "react"

export default function MasterDataTab() {
  const [bonded,  setBonded]  = useState(false)
  const [dropGo,  setDropGo]  = useState(true)
  const [degraded, setDegraded] = useState(false)

  return (
    <div className="flex-1 min-h-0 overflow-auto px-5 py-4">
      <div className="ds-label text-neutral-500 font-bold">Master data</div>
      <div className="flex flex-wrap gap-2 mt-2">
        {[
          {k:"Carriers",v:"5 · tariffs current"},{k:"Consignees",v:"7 active"},
          {k:"Depots",v:"4 · windows set"},{k:"Equipment",v:"5 · capacity charts loaded"},
          {k:"Operators",v:"5 · certs verified"},{k:"Zones & slots",v:"7 zones · 1,124 slots"},
          {k:"Holidays",v:"AR 2026 · 1 moved"},{k:"Reason codes",v:"22 controlled"}
        ].map(m => (
          <div key={m.k} className="border border-neutral-300 px-3 py-2" style={{ minWidth: 158 }}>
            <div className="text-[12px] font-semibold">{m.k}</div>
            <div className="text-[11px] text-neutral-500 font-mono">{m.v}</div>
          </div>
        ))}
      </div>
      <div className="mt-5 ds-label text-neutral-500 font-bold">Assumptions</div>
      {[
        {k:"Bonded (D-02)",       opts:[{v:false,label:"No"},{v:true,label:"Yes"}],              val:bonded,  set:(v:boolean)=>setBonded(v)},
        {k:"Inbound mode (D-01)", opts:[{v:true,label:"Drop-and-go"},{v:false,label:"Live unload"}], val:dropGo,  set:(v:boolean)=>setDropGo(v)},
        {k:"Degraded mode drill", opts:[{v:false,label:"Idle"},{v:true,label:"Armed"}],           val:degraded, set:(v:boolean)=>setDegraded(v)},
      ].map(a => (
        <div key={a.k} className="flex justify-between items-center py-2 border-b border-[#f3f4f6] text-[11.5px]">
          <span>{a.k}</span>
          <div style={{ border: "1px solid #e5e7eb", borderRadius: 5, overflow: "hidden", display: "flex" }}>
            {a.opts.map(o => (
              <button key={o.label} onClick={() => a.set(o.v as boolean)}
                className="text-[10.5px] px-2 py-1 font-semibold transition-colors"
                style={{
                  background: a.val === o.v ? "#111827" : "transparent",
                  color:      a.val === o.v ? "#fff"     : "#374151",
                }}>
                {o.label}
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}
