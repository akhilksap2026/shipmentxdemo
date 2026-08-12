import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"

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

function stateVariant(st: string): "green" | "red" | "muted" {
  return st === "HEALTHY" ? "green" : st === "DEGRADED" ? "red" : "muted"
}

export default function AdapterHealthTab() {
  const [replayed, setReplayed] = useState(false)
  const [degraded, setDegraded] = useState(false)

  return (
    <div className="flex-1 min-h-0 overflow-auto">
      <table className="w-full border-collapse text-[12px]">
        <thead>
          <tr>
            {["ADAPTER","STATE","LAG","DLQ","RECONCILE","NOTE"].map(h => (
              <th key={h} className="ds-th text-left"
                style={{paddingLeft:h==="ADAPTER"?"20px":"12px",paddingRight:h==="NOTE"?"20px":"12px"}}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {ADAPTERS.map(a => (
            <tr key={a.name} className="border-b border-[#f3f4f6]"
              style={{ minHeight: 38, borderLeft:`3px solid ${a.state==="DEGRADED"?"#d97706":"transparent"}`, opacity:a.state==="PENDING"||a.state==="PHASE 2"?0.55:1 }}>
              <td className="py-2 pl-5 pr-3 font-semibold">
                {a.name}
                {(a.state==="PENDING"||a.state==="PHASE 2") && <span className="ml-2 ds-label text-neutral-400 font-normal italic">roadmap</span>}
                <div className="text-[11px] font-normal text-neutral-500">{a.mechanism}</div>
              </td>
              <td className="px-3 py-2"><Badge variant={stateVariant(a.state)} className="text-[10px]">{a.state}</Badge></td>
              <td className="px-3 py-2 font-mono">{a.lag}</td>
              <td className={`px-3 py-2 font-mono ${a.dlq && !replayed ? "text-[#dc2626]" : ""}`}>{a.name==="Exolgan Dock Sud"&&replayed?0:a.dlq}</td>
              <td className="px-3 py-2 font-mono">{a.recon}</td>
              <td className="px-3 py-2 pr-5 text-neutral-600 leading-tight">{a.note}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="px-5 py-4 flex gap-2">
        <Button variant="secondary" size="sm" className="text-xs" style={{ borderRadius: 5 }} onClick={() => setReplayed(true)}>{replayed?"3 messages replayed · DLQ empty":"Replay dead-letter queue"}</Button>
        <Button variant="ghost" size="sm" className="text-xs" style={{ borderRadius: 5 }} onClick={() => setDegraded(!degraded)}>{degraded?"Degraded mode armed":"Enter degraded mode"}</Button>
      </div>
    </div>
  )
}
