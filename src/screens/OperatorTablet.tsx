import { useState } from "react"
import { Button } from "@/components/ui/button"
import { useData } from "@/lib/DataContext"

const STEPS = [
  { key:"instruction", title:"Retrieve to staging", tag:"1", label:"Instruction", note:"One instruction per view, large type for cab visibility." },
  { key:"identify", title:"Confirm identity", tag:"2", label:"Identification", note:"Cab OCR read against the instruction — mismatch blocks the lift." },
  { key:"exception", title:"Authorised exception", tag:"3", label:"Exception path", note:"Supervisor approval with photo and reason code, fully audited." },
  { key:"damage", title:"Damage capture", tag:"4", label:"Damage", note:"Photos on the condition record; quarantine flip triggers a replan." },
  { key:"done", title:"Confirm done", tag:"5", label:"Completion", note:"Actual duration recorded against the estimate." },
]

/** Parse "Z-BB-R-S-T" address into its components */
function parseAddress(addr: string) {
  const p = addr.split("-")
  return { zone: p[0], block: parseInt(p[1]), row: parseInt(p[2]), slot: parseInt(p[3]), tier: parseInt(p[4]) }
}

export default function OperatorTablet() {
  const { operatorTasks, refresh } = useData()

  const [step, setStep] = useState(0)
  const [reason, setReason] = useState<string|null>(null)
  const [quarantine, setQuarantine] = useState(false)
  const [offline, setOffline] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [confirmError, setConfirmError] = useState<string|null>(null)

  const go = (i: number) => setStep(Math.max(0, Math.min(STEPS.length-1, i)))
  const current = STEPS[step]
  const task = operatorTasks[0]
  const codes = ["Wrong container in slot","ID plate unreadable","Yard record out of date"]

  if (!task) return null

  async function confirmDone() {
    setConfirming(true)
    setConfirmError(null)
    try {
      // Server derives container ID and destination from the move record — client sends nothing extra
      const res = await fetch(`/api/moves/${task.id}/complete`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({ error: `Server error ${res.status}` }))
        throw new Error((body as { error?: string }).error ?? `Server error ${res.status}`)
      }
      // Re-fetch both slices so every screen reflects the change
      await refresh(["moves", "containers"])
      go(0)
    } catch (err) {
      setConfirmError(String(err).replace("Error: ", ""))
    } finally {
      setConfirming(false)
    }
  }

  const primary: [string, ()=>void] = {
    instruction: ["Accept and start",                                             ()=>go(1)],
    identify:    ["Report mismatch",                                              ()=>go(2)],
    exception:   [reason ? "Submit for supervisor approval" : "Select a reason code", ()=>reason && go(3)],
    damage:      ["Attach and continue",                                          ()=>go(4)],
    done:        [confirming ? "Saving…" : "Next task",                           confirmDone],
  }[current.key] as [string, ()=>void]

  const secondary: [string, ()=>void] = {
    instruction: ["Report a problem",    ()=>go(2)],
    identify:    ["Confirm match",        ()=>go(3)],
    exception:   ["Cancel and escalate", ()=>{ setReason(null); go(0) }],
    damage:      ["No damage",            ()=>go(4)],
    done:        ["View my queue",        ()=>go(0)],
  }[current.key] as [string, ()=>void]

  return (
    <div className="flex flex-col h-full min-h-0 overflow-auto bg-white text-neutral-900">
      {/* Header */}
      <div className="flex items-center gap-4 px-5 pt-3.5 pb-3 border-b-2 border-neutral-200 flex-none">
        <div className="flex flex-col gap-1">
          <span className="font-black text-[19px] tracking-tight">Operator tablet</span>
          <span className="text-[11px] text-neutral-500">OP-114 R. Giménez · RS-01 · shift 06:00–14:00 · device-bound, offline queue armed</span>
        </div>
        <div className="ml-auto flex gap-2">
          <Button variant="ghost" size="sm" className="text-xs" onClick={()=>{setStep(0);setReason(null);setQuarantine(false)}}>Restart run</Button>
          <Button variant="secondary" size="sm" className="text-xs" onClick={()=>setOffline(!offline)}>
            {offline?"Offline — 3 queued":"Simulate offline"}
          </Button>
        </div>
      </div>

      <div className="grid flex-1 min-h-0 overflow-auto" style={{gridTemplateColumns:"minmax(360px,440px) minmax(300px,1fr)"}}>
        {/* Phone mockup */}
        <div className="border-r-2 border-neutral-200 p-5 flex justify-center overflow-auto">
          <div className="w-[340px] border-[12px] border-neutral-900 bg-white self-start">
            {/* Status bar */}
            <div className="flex justify-between px-3 py-1.5 bg-neutral-900 text-white text-[10px] tracking-wider">
              <span>06:24</span>
              <span>{offline?"OFFLINE · queued 3":"4G"} · 84%</span>
            </div>

            {/* Task header */}
            <div className="px-3.5 pt-3.5 pb-2.5 border-b-2 border-neutral-200">
              <div className="flex justify-between text-[11px] text-neutral-500">
                <span>Task {task.seq}</span><span>{task.id}</span>
              </div>
              <div className="font-black text-[23px] leading-tight mt-1.5 tracking-tight">{current.title}</div>
            </div>

            {/* Step content */}
            {current.key==="instruction" && (
              <div>
                <div className="px-3.5 py-3.5 border-b border-neutral-200">
                  <div className="text-[11px] tracking-widest uppercase text-neutral-500">Container</div>
                  <div className="font-black text-[30px] tracking-tight leading-tight tabular">{task.container}</div>
                  <div className="text-[14px] mt-1">{task.size} · {task.weight}</div>
                </div>
                <div className="grid grid-cols-2">
                  <div className="px-3.5 py-3 border-r border-b border-neutral-200">
                    <div className="text-[11px] tracking-widest uppercase text-neutral-500">From</div>
                    <div className="font-black text-[20px] tabular">{task.from}</div>
                  </div>
                  <div className="px-3.5 py-3 border-b border-neutral-200">
                    <div className="text-[11px] tracking-widest uppercase text-neutral-500">To</div>
                    <div className="font-black text-[20px] tabular">{task.to}</div>
                  </div>
                </div>
                <div className="px-3.5 py-3 bg-red-50 border-b border-neutral-200">
                  <div className="text-[13px] leading-relaxed">{task.reason}</div>
                </div>
                <div className="px-3.5 py-3 border-b-2 border-neutral-200 flex gap-2 items-start">
                  <span className="w-1 self-stretch bg-[#d9291c]" />
                  <span className="text-[13px] leading-relaxed">{task.warn}</span>
                </div>
              </div>
            )}

            {current.key==="identify" && (
              <div>
                <div className="px-3.5 py-3.5 border-b border-neutral-200">
                  <div className="text-[13px] leading-relaxed">Cab camera read the container ID on approach. Confirm it matches the instruction.</div>
                </div>
                <div className="px-3.5 py-3.5 flex flex-col gap-2.5">
                  <div>
                    <div className="text-[11px] tracking-widest uppercase text-neutral-500">Expected</div>
                    <div className="font-black text-[26px] tabular">{task.container}</div>
                  </div>
                  <div>
                    <div className="text-[11px] tracking-widest uppercase text-neutral-500">OCR read</div>
                    <div className="font-black text-[26px] tabular text-[#d9291c]">HLXU4406025</div>
                  </div>
                  <div className="text-[13px] leading-relaxed text-[#d9291c]">Mismatch: last two digits transposed (025 vs 052) against the instruction. The lift is blocked until this resolves.</div>
                </div>
              </div>
            )}

            {current.key==="exception" && (
              <div className="px-3.5 py-3.5 flex flex-col gap-3">
                <div className="text-[13px] leading-relaxed">Mismatch blocked the lift. A supervisor-approved manual confirmation needs a photo and a reason code — both are written to the audit trail for {task.container}.</div>
                <div className="flex gap-1.5">
                  <div className="flex-1 h-[74px] bg-neutral-200 border border-neutral-400 flex items-end p-1 text-[10px] text-neutral-600">ID plate photo</div>
                  <div className="flex-1 h-[74px] bg-neutral-200 border border-neutral-400 flex items-end p-1 text-[10px] text-neutral-600">Stack photo</div>
                </div>
                <div>
                  <div className="text-[11px] tracking-widest uppercase text-neutral-500 mb-1.5">Reason code</div>
                  <div className="flex flex-col gap-1.5">
                    {codes.map(c=>(
                      <button key={c} onClick={()=>setReason(c)}
                        className="text-left px-3 py-2.5 border text-[13px] transition-colors"
                        style={{background:reason===c?"#201e1d":"transparent",color:reason===c?"#fff":"#111827",borderColor:reason===c?"#201e1d":"#6b7280"}}>
                        {c}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="text-[12px] text-neutral-500 leading-relaxed">
                  {reason
                    ? "Approved by Yard Manager 06:22 — manual confirmation recorded against "+task.id+" with two photos."
                    : "A reason code from the controlled list is mandatory; free text alone is not accepted."}
                </div>
              </div>
            )}

            {current.key==="damage" && (
              <div className="px-3.5 py-3.5 flex flex-col gap-3">
                <div className="text-[13px] leading-relaxed">Damage found on the right panel. Photos attach to the condition record; the container can be flipped to quarantine, which triggers a replan.</div>
                <div className="flex gap-1.5">
                  <div className="flex-1 h-[74px] bg-neutral-200 border border-neutral-400 flex items-end p-1 text-[10px] text-neutral-600">damage 1</div>
                  <div className="flex-1 h-[74px] bg-neutral-200 border border-neutral-400 flex items-end p-1 text-[10px] text-neutral-600">damage 2</div>
                </div>
                <button onClick={()=>setQuarantine(!quarantine)}
                  className="text-left px-3 py-3 border text-[13px] transition-colors"
                  style={{background:quarantine?"#d9291c":"transparent",color:quarantine?"#fff":"#111827",borderColor:quarantine?"#d9291c":"#6b7280"}}>
                  {quarantine?"Quarantine flagged — replan triggered":"Flag for quarantine"}
                </button>
              </div>
            )}

            {current.key==="done" && (
              <div className="px-3.5 py-3.5 flex flex-col gap-2.5">
                <div className="font-black text-[22px]">Job cycle 4.9′</div>
                <div className="text-[13px] leading-relaxed">Accepted 06:19:20, confirmed 06:24:14. Actual duration written to the audit record against a {task.est}′ estimate.</div>
                <div className="border-t border-neutral-200 pt-2.5 text-[13px] leading-relaxed">Next task will be dispatched to your queue by the planner — check the tablet in 30 seconds.</div>
              </div>
            )}

            {/* Error banner — shown when confirmDone write fails */}
            {confirmError && current.key === "done" && (
              <div className="mx-3.5 mt-3 px-3 py-2.5 bg-red-50 border border-[#d9291c] text-[12px] text-[#9b1c1c] leading-snug">
                <span className="font-bold">Save failed:</span> {confirmError}. Check connection and try again.
              </div>
            )}

            {/* Action buttons */}
            <div className="px-3.5 py-3 border-t-2 border-neutral-200 flex flex-col gap-2">
              <button onClick={primary[1]}
                disabled={confirming || (current.key === "exception" && !reason)}
                className="w-full text-left px-3.5 py-[15px] bg-[#201e1d] text-white text-[15px] font-semibold disabled:opacity-40 disabled:cursor-not-allowed">
                {primary[0]}
              </button>
              <button onClick={secondary[1]}
                className="w-full text-left px-3.5 py-[13px] border border-neutral-400 text-[14px] font-semibold">
                {secondary[0]}
              </button>
            </div>
          </div>
        </div>

        {/* Flow panel */}
        <div className="flex flex-col min-h-0 overflow-auto">
          <div className="px-4 pt-3 pb-2 text-[10px] tracking-widest uppercase text-neutral-500 font-bold">Flow · what the demo shows</div>
          {STEPS.map((st,i)=>(
            <button key={st.key} onClick={()=>go(i)}
              className="block w-full text-left px-4 py-3 border-b border-neutral-200 hover:bg-neutral-50 transition-colors"
              style={{ borderLeft:`3px solid ${i===step?"#d9291c":"transparent"}`, background:i===step?"#fef3f2":undefined }}>
              <div className="flex justify-between text-[12.5px] font-semibold">
                <span>{st.label}</span>
                <span className="text-[11px] text-neutral-500">{st.tag}</span>
              </div>
              <div className="text-[11.5px] text-neutral-600 mt-0.5 leading-relaxed">{st.note}</div>
            </button>
          ))}
          <div className="px-4 pt-3 pb-2 text-[10px] tracking-widest uppercase text-neutral-500 font-bold">Audit written this task</div>
          {[
            {t:"06:19:20",what:"Instruction accepted — job-cycle clock starts"},
            {t:"06:20:05",what:"Cab OCR read HLXU4406025, mismatch against "+task.container},
            {t:"06:21:48",what:"Exception raised: "+(reason||"reason code pending")},
            {t:"06:22:11",what:"Supervisor approval, 2 photos attached"},
            {t:"06:24:14",what:"Confirm done — actual 4.9′ against "+task.est+"′ estimate"},
          ].map(a=>(
            <div key={a.t} className="flex gap-3 px-4 py-1.5 text-[11.5px]">
              <span className="w-14 text-neutral-500 tabular">{a.t}</span>
              <span className="flex-1 leading-relaxed">{a.what}</span>
            </div>
          ))}
          <div className="px-4 py-3.5 text-[11.5px] text-neutral-500 leading-relaxed max-w-lg">Adoption is the pilot's hardest exit criterion: 95% of moves executed through the tablet rather than from memory. Bypass rate is reported to the supervisor dashboard daily.</div>
        </div>
      </div>
    </div>
  )
}
