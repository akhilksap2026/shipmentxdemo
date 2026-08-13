import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { useData } from "@/lib/DataContext"
import { backendApi } from "@/lib/backend-api"
import type { BackendMoveDetail } from "@/lib/backend-api"
import { slotAddress, REASON_LABELS } from "@/lib/backend-adapters"
import { OPERATOR_QUEUES } from "@/data/yard-ops"

const STEPS = [
  { key:"instruction", title:"Retrieve to staging", tag:"1", label:"Instruction",   note:"One instruction per view, large type for cab visibility." },
  { key:"identify",    title:"Confirm identity",    tag:"2", label:"Identification", note:"Cab OCR read against the instruction — mismatch blocks the lift." },
  { key:"exception",   title:"Authorised exception",tag:"3", label:"Exception path", note:"Supervisor approval with photo and reason code, fully audited." },
  { key:"damage",      title:"Damage capture",      tag:"4", label:"Damage",         note:"Photos on the condition record; quarantine flip triggers a replan." },
  { key:"done",        title:"Confirm done",         tag:"5", label:"Completion",     note:"Actual duration recorded against the estimate." },
]

type DisplayTask = {
  id: string | number
  seq: number
  container: string
  size: string
  weight: string
  from: string
  to: string
  reason: string
  warn: string
  est: number
}

export default function OperatorTablet() {
  const { operatorTasks, refresh, backendConnected, backendJockeys } = useData()

  // ── Existing state ────────────────────────────────────────────────────────
  const [step,         setStep]         = useState(0)
  const [reason,       setReason]       = useState<string|null>(null)
  const [quarantine,   setQuarantine]   = useState(false)
  const [offline,      setOffline]      = useState(false)
  const [confirming,   setConfirming]   = useState(false)
  const [confirmError, setConfirmError] = useState<string|null>(null)

  // ── Queue state ───────────────────────────────────────────────────────────
  const [queueIdx,     setQueueIdx]     = useState(0)
  const [completedIds, setCompletedIds] = useState<Set<string>>(new Set())
  const [queueToast,   setQueueToast]   = useState<string|null>(null)

  // ── Backend engine state ──────────────────────────────────────────────────
  const [selectedJockeyId, setSelectedJockeyId] = useState<number | null>(null)
  const [engineTask,       setEngineTask]       = useState<BackendMoveDetail | null>(null)
  const [fetchingTask,     setFetchingTask]     = useState(false)
  const [noMoreTasks,      setNoMoreTasks]      = useState(false)

  // Identify step — scan
  const [scanInput,   setScanInput]   = useState("")
  const [scanning,    setScanning]    = useState(false)
  const [scanResult,  setScanResult]  = useState<{ match: boolean; scanned: string; expected: string } | null>(null)

  // ── New state: Steps 2–3 ─────────────────────────────────────────────────
  const [flowExpanded, setFlowExpanded] = useState(false)   // Step 2
  const [auditOpen,    setAuditOpen]    = useState(false)   // Step 3

  const go = (i: number) => { setStep(Math.max(0, Math.min(STEPS.length-1, i))); setScanResult(null) }
  const current = STEPS[step]
  const seedTask = operatorTasks[queueIdx] ?? operatorTasks[operatorTasks.length - 1]
  const codes = ["Wrong container in slot","ID plate unreadable","Yard record out of date"]

  const displayTask: DisplayTask | null = (() => {
    if (backendConnected && engineTask) {
      return {
        id:        engineTask.id,
        seq:       engineTask.sequence_number,
        container: engineTask.container.container_number,
        size:      `${engineTask.container.size_ft}ft`,
        weight:    "—",
        from:      slotAddress(engineTask.from_slot ?? null),
        to:        slotAddress(engineTask.to_slot),
        reason:    REASON_LABELS[engineTask.reason] ?? engineTask.reason,
        warn:      engineTask.container.is_hazmat
          ? `HAZMAT class ${engineTask.container.hazmat_class ?? "?"} — follow hazmat protocol`
          : "Follow all standard lift protocols",
        est: engineTask.estimated_duration_min,
      }
    }
    if (!backendConnected && seedTask) {
      return {
        id:        seedTask.id,
        seq:       parseInt(seedTask.seq) || 0,
        container: seedTask.container,
        size:      seedTask.size,
        weight:    seedTask.weight,
        from:      seedTask.from,
        to:        seedTask.to,
        reason:    seedTask.reason,
        warn:      seedTask.warn,
        est:       Number(seedTask.est),
      }
    }
    return null
  })()

  async function fetchNextTask(jockeyId: number) {
    setFetchingTask(true); setNoMoreTasks(false)
    try {
      const move = await backendApi.nextMove(jockeyId)
      if (move) { setEngineTask(move); setScanInput(""); setScanResult(null) }
      else { setEngineTask(null); setNoMoreTasks(true) }
    } catch (err) {
      console.error("[OperatorTablet] nextMove failed:", err)
      setEngineTask(null); setNoMoreTasks(true)
    } finally { setFetchingTask(false) }
  }

  useEffect(() => {
    if (backendConnected && selectedJockeyId != null) fetchNextTask(selectedJockeyId)
  }, [backendConnected, selectedJockeyId])

  async function handleScan() {
    if (!displayTask || !scanInput.trim()) return
    if (backendConnected && engineTask) {
      setScanning(true)
      try {
        const result = await backendApi.scanMove(engineTask.id, scanInput.trim())
        setScanResult({ match: result.match, scanned: scanInput.trim(), expected: engineTask.container.container_number })
        if (result.match) setTimeout(() => go(3), 800)
      } catch (err) {
        console.error("[OperatorTablet] scanMove fallback:", err)
        const match = scanInput.trim().toUpperCase() === engineTask.container.container_number.toUpperCase()
        setScanResult({ match, scanned: scanInput.trim(), expected: engineTask.container.container_number })
        if (match) setTimeout(() => go(3), 800)
      } finally { setScanning(false) }
    } else if (!backendConnected && seedTask) {
      const match = scanInput.trim().toUpperCase() === seedTask.container.toUpperCase()
      setScanResult({ match, scanned: scanInput.trim(), expected: seedTask.container })
      if (match) setTimeout(() => go(3), 800)
    }
  }

  async function confirmDone() {
    if (!displayTask) return
    setConfirming(true); setConfirmError(null)
    try {
      if (backendConnected && engineTask) {
        await backendApi.completeMove(engineTask.id)
        go(0); setReason(null); setQuarantine(false)
        setTimeout(async () => { if (selectedJockeyId != null) await fetchNextTask(selectedJockeyId) }, 2000)
      } else {
        const res = await fetch(`/api/moves/${displayTask.id}/complete`, {
          method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({}),
        })
        if (!res.ok) {
          const body = await res.json().catch(() => ({ error: `Server error ${res.status}` }))
          throw new Error((body as { error?: string }).error ?? `Server error ${res.status}`)
        }
        await refresh(["moves","containers"])
        setCompletedIds(prev => new Set([...prev, String(displayTask.id)]))
        setTimeout(() => { setQueueIdx(prev => prev+1); go(0); setReason(null); setQuarantine(false); setScanInput(""); setScanResult(null) }, 2000)
      }
    } catch (err) { setConfirmError(String(err).replace("Error: ","")) }
    finally { setConfirming(false) }
  }

  const useBackendScan = backendConnected && !!engineTask && current.key === "identify"

  const primary: [string, ()=>void] = {
    instruction: ["Accept and start",                                                  ()=>go(1)],
    identify:    ["Report mismatch",                                                   ()=>go(2)],
    exception:   [reason ? "Submit for supervisor approval" : "Select a reason code", ()=>reason && go(3)],
    damage:      ["Attach and continue",                                               ()=>go(4)],
    done:        [confirming ? "Saving…" : "Confirm done",                             confirmDone],
  }[current.key] as [string, ()=>void]

  const secondary: [string, ()=>void] = {
    instruction: ["Report a problem",    ()=>go(2)],
    identify:    ["Confirm match",        ()=>go(3)],
    exception:   ["Cancel and escalate", ()=>{ setReason(null); go(0) }],
    damage:      ["No damage",            ()=>go(4)],
    done:        ["View my queue",        ()=>go(0)],
  }[current.key] as [string, ()=>void]

  const availableJockeys = backendJockeys.filter(j => j.status === "available" || j.status === "busy")

  // ── Step 1: Shared phone frame style (4px border, no status bar) ──────────
  const phoneFrame = "w-[340px] border-[4px] border-neutral-900 bg-white self-start"

  // ── Jockey picker (backend only) ──────────────────────────────────────────
  if (backendConnected && selectedJockeyId == null) {
    return (
      <div className="flex flex-col h-full min-h-0 overflow-auto bg-[#f4f5f7] text-neutral-900">
        <div className="flex items-center gap-4 px-5 pt-4 pb-3 border-b border-[#e5e7eb] flex-none bg-white">
          <div className="flex flex-col gap-1">
            <span className="font-semibold text-[15px] tracking-tight">Operator tablet</span>
            <span className="text-[11px] text-neutral-500">Backend connected — select your jockey ID to load your task queue</span>
          </div>
        </div>
        <div className="flex flex-1 items-center justify-center p-8">
          <div className={phoneFrame} style={{ borderRadius:5 }}>
            <div className="px-4 pt-4 pb-3 border-b border-[#e5e7eb]">
              <div className="font-semibold text-[18px] tracking-tight">Who are you?</div>
              <div className="text-[12px] text-neutral-600 mt-1 leading-relaxed">Select your jockey ID to load your assigned task queue from the planning engine.</div>
            </div>
            <div className="flex flex-col gap-0">
              {availableJockeys.length === 0 && (
                <div className="px-4 py-4 text-[13px] text-neutral-500">No jockeys available. Check the planning engine.</div>
              )}
              {availableJockeys.map(j => (
                <button key={j.id} onClick={() => setSelectedJockeyId(j.id)}
                  className="block w-full text-left px-4 py-3 border-b border-[#f3f4f6] hover:bg-[#f9fafb] transition-colors">
                  <div className="font-semibold text-[15px]">{j.name}</div>
                  <div className="text-[11px] text-neutral-500 mt-0.5 capitalize font-mono">{j.status} · speed ×{j.speed_factor}</div>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    )
  }

  // ── Loading / no tasks (backend mode) ─────────────────────────────────────
  if (backendConnected && (fetchingTask || (noMoreTasks && !engineTask))) {
    const jockey = backendJockeys.find(j => j.id === selectedJockeyId)
    return (
      <div className="flex flex-col h-full min-h-0 overflow-auto bg-[#f4f5f7] text-neutral-900">
        <div className="flex items-center gap-4 px-5 pt-4 pb-3 border-b border-[#e5e7eb] flex-none bg-white">
          <div className="flex flex-col gap-1">
            <span className="font-semibold text-[15px] tracking-tight">Operator tablet</span>
            <span className="text-[11px] text-neutral-500">{jockey?.name ?? "Jockey"} · engine connected</span>
          </div>
          <div className="ml-auto">
            <button style={{ background:"transparent", color:"#374151", border:"1px solid #e5e7eb", borderRadius:5, fontSize:12, padding:"4px 12px" }}
              onClick={() => { setSelectedJockeyId(null); setEngineTask(null) }}>
              Switch jockey
            </button>
          </div>
        </div>
        <div className="flex flex-1 items-center justify-center p-8">
          <div className={phoneFrame} style={{ borderRadius:5 }}>
            <div className="px-4 py-5 text-center">
              {fetchingTask ? (
                <>
                  <div className="text-[24px] mb-2 animate-spin select-none">⟳</div>
                  <div className="font-semibold text-[15px]">Loading task…</div>
                  <div className="text-[12px] text-neutral-500 mt-1">Fetching your next move from the engine</div>
                </>
              ) : (
                <>
                  <div className="font-semibold text-[15px] mb-2">Queue empty</div>
                  <div className="text-[13px] text-neutral-600 leading-relaxed">No more tasks assigned. Check back in 30 seconds or contact the planner.</div>
                  <button onClick={() => selectedJockeyId != null && fetchNextTask(selectedJockeyId)}
                    className="mt-4 w-full text-left px-4 py-5 text-white text-[14px] font-semibold"
                    style={{ background:"#111827", borderRadius:5 }}>
                    Check again
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    )
  }

  if (!displayTask) return null

  const jockeyName = backendConnected
    ? (backendJockeys.find(j => j.id === selectedJockeyId)?.name ?? "Operator")
    : "OP-114 R. Giménez"

  const auditEntries = [
    {t:"06:19:20", what:"Instruction accepted — job-cycle clock starts"},
    {t:"06:20:05", what:"Cab OCR read, mismatch against "+displayTask.container},
    {t:"06:21:48", what:"Exception raised: "+(reason||"reason code pending")},
    {t:"06:22:11", what:"Supervisor approval, 2 photos attached"},
    {t:"06:24:14", what:"Confirm done — actual "+displayTask.est.toFixed(1)+"′ against "+displayTask.est+"′ estimate"},
  ]

  return (
    <div className="flex flex-col h-full min-h-0 overflow-auto bg-[#f4f5f7] text-neutral-900">
      {/* Header */}
      <div className="flex items-center gap-4 px-5 pt-4 pb-3 border-b border-[#e5e7eb] flex-none bg-white">
        <div className="flex flex-col gap-1">
          <span className="font-semibold text-[15px] tracking-tight">Operator tablet</span>
          <span className="text-[11px] text-neutral-500">
            {jockeyName} · {backendConnected ? "engine connected" : <><span className="font-mono">RS-01</span> · shift <span className="font-mono">06:00–14:00</span> · offline queue armed</>}
          </span>
        </div>
        <div className="ml-auto flex gap-2">
          {backendConnected && (
            <button style={{ background:"transparent", color:"#374151", border:"1px solid #e5e7eb", borderRadius:5, fontSize:12, padding:"4px 12px" }}
              onClick={() => { setSelectedJockeyId(null); setEngineTask(null) }}>
              Switch jockey
            </button>
          )}
          <button style={{ background:"transparent", color:"#374151", border:"1px solid #e5e7eb", borderRadius:5, fontSize:12, padding:"4px 12px" }}
            onClick={()=>{setStep(0);setReason(null);setQuarantine(false);setScanInput("");setScanResult(null);setQueueIdx(0);setCompletedIds(new Set())}}>
            Restart run
          </button>
          {!backendConnected && (
            <button style={{ background:"#111827", color:"#fff", border:"none", borderRadius:5, fontSize:12, padding:"4px 12px" }}
              onClick={()=>setOffline(!offline)}>
              {offline ? "Offline — 3 queued" : "Simulate offline"}
            </button>
          )}
        </div>
      </div>

      <div className="grid flex-1 min-h-0 overflow-auto" style={{ gridTemplateColumns:"minmax(360px,440px) minmax(300px,1fr)" }}>

        {/* ── Phone viewport ─────────────────────────────────────────────── */}
        <div className="border-r border-[#e5e7eb] p-5 flex justify-center overflow-auto bg-[#f4f5f7]">
          {/* Step 1: 4px border, no status bar */}
          <div className={phoneFrame} style={{ borderRadius:5 }}>

            {/* Queue strip */}
            <div className="border-b border-[#e5e7eb]" style={{ background:"#f9fafb" }}>
              {backendConnected && engineTask ? (
                <div className="px-4 py-2 text-[11px] text-neutral-500 italic">Queue loading from engine…</div>
              ) : (
                <div className="flex gap-1.5 px-3 py-2.5" style={{ overflowX:"auto", scrollbarWidth:"none" }}>
                  {operatorTasks.map((task,i)=>{
                    const isDone = completedIds.has(task.id)
                    const isCurrent = i===queueIdx
                    const fromShort = task.from.split("-").slice(0,2).join("-")
                    const toShort   = task.to.split("-").slice(0,2).join("-")
                    const cnShort   = task.container.slice(0,4)
                    return (
                      <button key={task.id}
                        onClick={()=>{
                          if (!isCurrent && !isDone) {
                            setQueueToast(`Task ${i+1} is locked — complete the current task first`)
                            setTimeout(()=>setQueueToast(null),2500)
                          }
                        }}
                        className="flex-none flex flex-col gap-0.5 px-2 py-1.5"
                        style={{ minWidth:70, background:isCurrent?"#111827":"transparent", border:`1px solid ${isCurrent?"#111827":"#d1d5db"}`, borderRadius:5, opacity:isDone?0.45:1, cursor:!isCurrent&&!isDone?"not-allowed":"default" }}>
                        <div className="text-[9px] font-bold tracking-wider" style={{ color:isCurrent?"#6b7280":"#9ca3af" }}>{isDone?"✓ done":`#${i+1}`}</div>
                        <div className="font-mono font-bold leading-none" style={{ fontSize:10, color:isCurrent?"#fff":isDone?"#9ca3af":"#374151" }}>{cnShort}</div>
                        <div className="text-[9px] font-mono leading-none" style={{ color:isCurrent?"#6b7280":"#9ca3af" }}>{fromShort}→{toShort}</div>
                      </button>
                    )
                  })}
                </div>
              )}
              {queueToast && (
                <div className="mx-3 mb-2 px-2.5 py-1.5 text-[11px] leading-snug"
                  style={{ background:"#fffbeb", border:"1px solid #fcd34d", color:"#92400e", borderRadius:5 }}>
                  {queueToast}
                </div>
              )}
            </div>

            {/* Task header */}
            <div className="px-4 pt-4 pb-3 border-b border-[#e5e7eb]">
              <div className="flex justify-between text-[11px] text-neutral-500">
                <span>Task <span className="font-mono">{displayTask.seq}</span></span>
                <span className="font-mono">{displayTask.id}</span>
              </div>
              <div className="font-semibold text-[20px] leading-tight mt-1.5 tracking-tight">{current.title}</div>
            </div>

            {/* ── Instruction step ── */}
            {current.key==="instruction" && (
              <div>
                <div className="px-4 py-4 border-b border-[#e5e7eb]">
                  <div className="ds-label text-neutral-500">Container</div>
                  <div className="font-mono font-semibold leading-none tracking-tight mt-1" style={{ fontSize:26 }}>{displayTask.container}</div>
                  <div className="text-[14px] mt-1"><span className="font-mono">{displayTask.size}</span> · <span className="font-mono">{displayTask.weight}</span></div>
                </div>
                <div className="grid grid-cols-2">
                  <div className="px-4 py-3 border-r border-b border-[#e5e7eb]">
                    <div className="ds-label text-neutral-500">From</div>
                    <div className="font-mono font-semibold text-[18px]">{displayTask.from}</div>
                  </div>
                  <div className="px-4 py-3 border-b border-[#e5e7eb]">
                    <div className="ds-label text-neutral-500">To</div>
                    <div className="font-mono font-semibold text-[18px]">{displayTask.to}</div>
                  </div>
                </div>
                <div className="px-4 py-3 border-b border-[#e5e7eb]" style={{ background:"#fef2f2" }}>
                  <div className="text-[13px] leading-relaxed">{displayTask.reason}</div>
                </div>
                <div className="px-4 py-3 border-b border-[#e5e7eb] flex gap-2 items-start">
                  <span className="w-1 self-stretch bg-[#dc2626]" />
                  <span className="text-[13px] leading-relaxed">{displayTask.warn}</span>
                </div>
              </div>
            )}

            {/* ── Identify step ── */}
            {current.key==="identify" && (
              <div>
                <div className="px-4 py-4 border-b border-[#e5e7eb]">
                  <div className="text-[13px] leading-relaxed">
                    {backendConnected
                      ? "Enter or scan the container number shown on the unit."
                      : "Cab camera read the container ID on approach. Confirm it matches the instruction."}
                  </div>
                </div>
                <div className="px-4 py-4 flex flex-col gap-2">
                  <div>
                    <div className="ds-label text-neutral-500">Expected</div>
                    <div className="font-mono font-semibold leading-none mt-1" style={{ fontSize:26 }}>{displayTask.container}</div>
                  </div>
                  {backendConnected ? (
                    <>
                      <div>
                        <div className="ds-label text-neutral-500 mb-1.5">Scan / enter ID</div>
                        <input type="text" value={scanInput}
                          onChange={e=>{ setScanInput(e.target.value); setScanResult(null) }}
                          onKeyDown={e=>e.key==="Enter"&&handleScan()}
                          placeholder="e.g. HLXU4406052"
                          className="w-full border border-neutral-400 px-2 py-2 font-mono font-bold tracking-widest uppercase bg-white"
                          style={{ fontSize:15, borderRadius:5 }} />
                      </div>
                      <button onClick={handleScan} disabled={!scanInput.trim()||scanning}
                        className="w-full text-left px-3 py-2 text-white font-semibold disabled:opacity-40"
                        style={{ background:"#111827", fontSize:13, borderRadius:5 }}>
                        {scanning?"Checking…":"Confirm scan"}
                      </button>
                      {scanResult && (
                        <div className="px-3 py-2 text-[13px] leading-snug"
                          style={{ background:scanResult.match?"#f0fdf4":"#fef2f2", border:`1px solid ${scanResult.match?"#059669":"#dc2626"}`, color:scanResult.match?"#065f46":"#7f1d1d", borderRadius:5 }}>
                          {scanResult.match
                            ? `✓ Match confirmed — ${scanResult.scanned}. Advancing…`
                            : `✗ Mismatch: Scanned ${scanResult.scanned} — Expected ${scanResult.expected}`}
                        </div>
                      )}
                    </>
                  ) : (
                    <>
                      <div>
                        <div className="ds-label text-neutral-500">OCR read</div>
                        <div className="font-mono font-semibold leading-none mt-1 text-[#dc2626]" style={{ fontSize:26 }}>HLXU4406025</div>
                      </div>
                      <div className="text-[13px] leading-relaxed text-[#dc2626]">Mismatch: last two digits transposed (025 vs 052). The lift is blocked until this resolves.</div>
                    </>
                  )}
                </div>
              </div>
            )}

            {/* ── Exception step ── */}
            {current.key==="exception" && (
              <div className="px-4 py-4 flex flex-col gap-3">
                <div className="text-[13px] leading-relaxed">Mismatch blocked the lift. A supervisor-approved manual confirmation needs a photo and a reason code — both are written to the audit trail for <span className="font-mono">{displayTask.container}</span>.</div>
                <div className="flex gap-1.5">
                  <div className="flex-1 h-[74px] bg-[#f9fafb] border border-[#e5e7eb] flex items-end p-1 text-[10px] text-neutral-600">ID plate photo</div>
                  <div className="flex-1 h-[74px] bg-[#f9fafb] border border-[#e5e7eb] flex items-end p-1 text-[10px] text-neutral-600">Stack photo</div>
                </div>
                <div>
                  <div className="ds-label text-neutral-500 mb-1.5">Reason code</div>
                  {/* Step 4: reason code buttons px-4 py-3 */}
                  <div className="flex flex-col gap-1.5">
                    {codes.map(c=>(
                      <button key={c} onClick={()=>setReason(c)}
                        className="text-left px-4 py-3 text-[13px] transition-colors"
                        style={{ background:reason===c?"#111827":"transparent", color:reason===c?"#fff":"#374151", border:`1px solid ${reason===c?"#111827":"#e5e7eb"}`, borderRadius:5 }}>
                        {c}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="text-[12px] text-neutral-500 leading-relaxed">
                  {reason
                    ? <>Approved by Yard Manager 06:22 — manual confirmation recorded against <span className="font-mono">{displayTask.id}</span> with two photos.</>
                    : "A reason code from the controlled list is mandatory; free text alone is not accepted."}
                </div>
              </div>
            )}

            {/* ── Damage step ── */}
            {current.key==="damage" && (
              <div className="px-4 py-4 flex flex-col gap-3">
                <div className="text-[13px] leading-relaxed">Damage found on the right panel. Photos attach to the condition record; the container can be flipped to quarantine, which triggers a replan.</div>
                <div className="flex gap-1.5">
                  <div className="flex-1 h-[74px] bg-[#f9fafb] border border-[#e5e7eb] flex items-end p-1 text-[10px] text-neutral-600">damage 1</div>
                  <div className="flex-1 h-[74px] bg-[#f9fafb] border border-[#e5e7eb] flex items-end p-1 text-[10px] text-neutral-600">damage 2</div>
                </div>
                <button onClick={()=>setQuarantine(!quarantine)}
                  className="text-left px-4 py-3 text-[13px] transition-colors"
                  style={{ background:quarantine?"#dc2626":"transparent", color:quarantine?"#fff":"#374151", border:`1px solid ${quarantine?"#dc2626":"#e5e7eb"}`, borderRadius:5 }}>
                  {quarantine?"Quarantine flagged — replan triggered":"Flag for quarantine"}
                </button>
              </div>
            )}

            {/* ── Done step ── */}
            {current.key==="done" && (
              <div className="px-4 py-4 flex flex-col gap-2">
                <div>
                  <div className="ds-label text-neutral-500 mb-1">Job cycle</div>
                  <div className="font-mono font-semibold leading-none" style={{ fontSize:26 }}>{displayTask.est.toFixed(1)}′</div>
                </div>
                <div className="text-[13px] leading-relaxed">Accepted <span className="font-mono">06:19:20</span>, confirmed <span className="font-mono">06:24:14</span>. Actual duration written to the audit record against a <span className="font-mono">{displayTask.est}′</span> estimate.</div>
                <div className="border-t border-[#e5e7eb] pt-2 text-[13px] leading-relaxed">
                  {backendConnected
                    ? "Completing this move with the planning engine. Your next task will load in ~2 seconds."
                    : "Next task will be dispatched to your queue by the planner — check the tablet in 30 seconds."}
                </div>
              </div>
            )}

            {/* Error banner */}
            {confirmError && current.key==="done" && (
              <div className="mx-4 mt-3 px-3 py-2 text-[12px] leading-snug"
                style={{ background:"#fef2f2", border:"1px solid #dc2626", color:"#7f1d1d", borderRadius:5 }}>
                <span className="font-bold">Save failed:</span> {confirmError}. Check connection and try again.
              </div>
            )}

            {/* ── Step 4: Larger action buttons ── */}
            <div className="px-4 py-3 border-t border-[#e5e7eb] flex flex-col gap-2">
              {/* Primary: py-5 */}
              <button onClick={primary[1]}
                disabled={confirming || (current.key==="exception" && !reason)}
                className="w-full text-left px-4 py-5 text-white text-[15px] font-semibold disabled:opacity-40 disabled:cursor-not-allowed"
                style={{ background:"#111827", borderRadius:5 }}>
                {primary[0]}
              </button>
              {/* Secondary: py-4 */}
              <button onClick={secondary[1]}
                className="w-full text-left px-4 py-4 text-[14px] font-semibold"
                style={{ background:"white", color:"#374151", border:"1px solid #e5e7eb", borderRadius:5 }}>
                {secondary[0]}
              </button>
            </div>
          </div>
        </div>

        {/* ── Right panel ────────────────────────────────────────────────── */}
        <div className="flex flex-col min-h-0 overflow-auto bg-white">

          {/* Step 2: Compact step indicator */}
          <div className="px-4 py-3 border-b border-[#e5e7eb]">
            <div className="flex items-center gap-3">
              {/* 5 progress dots */}
              <div className="flex gap-1.5 flex-none">
                {STEPS.map((_,i)=>(
                  <span key={i} className="w-2.5 h-2.5 rounded-full inline-block"
                    style={{ background:i<step?"#111827":i===step?"#dc2626":"#e5e7eb" }} />
                ))}
              </div>
              <span className="text-[12.5px] font-semibold text-neutral-700 flex-1">
                Step {step+1} of 5: {STEPS[step].label}
              </span>
              <button onClick={()=>setFlowExpanded(v=>!v)}
                className="flex-none text-[11px] text-neutral-500 hover:text-neutral-800 transition-colors"
                style={{ border:"1px solid #e5e7eb", borderRadius:5, padding:"3px 10px" }}>
                {flowExpanded?"Hide ▲":"Show flow ▼"}
              </button>
            </div>
          </div>

          {/* Expandable flow list */}
          <div style={{ overflow:"hidden", maxHeight:flowExpanded?400:0, transition:"max-height 220ms ease" }}>
            <div className="border-b border-[#e5e7eb]">
              {STEPS.map((st,i)=>(
                <button key={st.key} onClick={()=>go(i)}
                  className="block w-full text-left px-4 py-3 border-b border-[#f3f4f6] hover:bg-[#f9fafb] transition-colors"
                  style={{ borderLeft:`3px solid ${i===step?"#dc2626":"transparent"}`, background:i===step?"#fef2f2":undefined }}>
                  <div className="flex justify-between text-[12.5px] font-semibold">
                    <span>{st.label}</span>
                    <span className="text-[11px] text-neutral-500 font-mono">{st.tag}</span>
                  </div>
                  <div className="text-[11.5px] text-neutral-600 mt-0.5 leading-relaxed">{st.note}</div>
                </button>
              ))}
            </div>
          </div>

          {/* Step 3: Audit trail accordion */}
          <button onClick={()=>setAuditOpen(v=>!v)}
            className="flex items-center justify-between w-full px-4 py-3 border-b border-[#e5e7eb] hover:bg-[#f9fafb] transition-colors text-left">
            <div className="flex items-center gap-2">
              <span className="ds-label font-bold text-neutral-500">Audit log</span>
              <span className="text-[10px] text-neutral-400">{auditEntries.length} entries</span>
            </div>
            <span style={{ fontSize:9, color:"#9ca3af" }}>{auditOpen?"▲":"▼"}</span>
          </button>
          <div style={{ overflow:"hidden", maxHeight:auditOpen?300:0, transition:"max-height 200ms ease" }}>
            <div className="border-b border-[#e5e7eb]">
              {auditEntries.map(a=>(
                <div key={a.t} className="flex gap-3 px-4 py-1.5 text-[11.5px] border-b border-[#f3f4f6]">
                  <span className="w-14 text-neutral-500 font-mono flex-none">{a.t}</span>
                  <span className="flex-1 leading-relaxed">{a.what}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Footer note */}
          <div className="px-4 py-4 text-[11.5px] text-neutral-500 leading-relaxed max-w-lg">
            {backendConnected
              ? `Connected to planning engine · jockey: ${jockeyName} · scan validation live`
              : "Adoption is the pilot's hardest exit criterion: 95% of moves executed through the tablet rather than from memory. Bypass rate is reported to the supervisor dashboard daily."}
          </div>
        </div>
      </div>
    </div>
  )
}
