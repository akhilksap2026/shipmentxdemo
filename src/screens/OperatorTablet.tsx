import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { useData } from "@/lib/DataContext"
import { backendApi } from "@/lib/backend-api"
import type { BackendMoveDetail } from "@/lib/backend-api"
import { slotAddress, REASON_LABELS } from "@/lib/backend-adapters"

const STEPS = [
  { key:"instruction", title:"Retrieve to staging", tag:"1", label:"Instruction", note:"One instruction per view, large type for cab visibility." },
  { key:"identify", title:"Confirm identity", tag:"2", label:"Identification", note:"Cab OCR read against the instruction — mismatch blocks the lift." },
  { key:"exception", title:"Authorised exception", tag:"3", label:"Exception path", note:"Supervisor approval with photo and reason code, fully audited." },
  { key:"damage", title:"Damage capture", tag:"4", label:"Damage", note:"Photos on the condition record; quarantine flip triggers a replan." },
  { key:"done", title:"Confirm done", tag:"5", label:"Completion", note:"Actual duration recorded against the estimate." },
]

/** Normalised task shape — same fields regardless of source */
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

  // ── Existing state (unchanged) ────────────────────────────────────────────
  const [step,         setStep]         = useState(0)
  const [reason,       setReason]       = useState<string|null>(null)
  const [quarantine,   setQuarantine]   = useState(false)
  const [offline,      setOffline]      = useState(false)
  const [confirming,   setConfirming]   = useState(false)
  const [confirmError, setConfirmError] = useState<string|null>(null)

  // ── Backend engine state ──────────────────────────────────────────────────
  const [selectedJockeyId, setSelectedJockeyId] = useState<number | null>(null)
  const [engineTask,       setEngineTask]       = useState<BackendMoveDetail | null>(null)
  const [fetchingTask,     setFetchingTask]     = useState(false)
  const [noMoreTasks,      setNoMoreTasks]      = useState(false)

  // Identify step — scan
  const [scanInput,   setScanInput]   = useState("")
  const [scanning,    setScanning]    = useState(false)
  const [scanResult,  setScanResult]  = useState<{ match: boolean; scanned: string; expected: string } | null>(null)

  const go = (i: number) => { setStep(Math.max(0, Math.min(STEPS.length-1, i))); setScanResult(null) }
  const current = STEPS[step]
  const seedTask = operatorTasks[0]
  const codes = ["Wrong container in slot","ID plate unreadable","Yard record out of date"]

  // ── Derive normalised displayTask from whichever source is active ─────────
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
        est:       engineTask.estimated_duration_min,
      }
    }
    if (!backendConnected && seedTask) {
      return {
        id:        seedTask.id,
        seq:       Number(seedTask.seq),
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

  // ── Fetch next move from backend ──────────────────────────────────────────
  async function fetchNextTask(jockeyId: number) {
    setFetchingTask(true)
    setNoMoreTasks(false)
    try {
      const move = await backendApi.nextMove(jockeyId)
      if (move) {
        setEngineTask(move)
        setScanInput("")
        setScanResult(null)
      } else {
        setEngineTask(null)
        setNoMoreTasks(true)
      }
    } catch (err) {
      console.error("[OperatorTablet] nextMove failed:", err)
      setEngineTask(null)
      setNoMoreTasks(true)
    } finally {
      setFetchingTask(false)
    }
  }

  // When jockey is selected, immediately fetch their next task
  useEffect(() => {
    if (backendConnected && selectedJockeyId != null) {
      fetchNextTask(selectedJockeyId)
    }
  }, [backendConnected, selectedJockeyId])

  // ── Identify step: scan against backend ───────────────────────────────────
  async function handleScan() {
    if (!displayTask || !scanInput.trim()) return
    if (backendConnected && engineTask) {
      // Backend path
      setScanning(true)
      try {
        const result = await backendApi.scanMove(engineTask.id, scanInput.trim())
        setScanResult({ match: result.match, scanned: scanInput.trim(), expected: engineTask.container.container_number })
        if (result.match) {
          setTimeout(() => go(3), 800) // brief green flash, then advance to damage step
        }
      } catch (err) {
        console.error("[OperatorTablet] scanMove failed — falling back to local check:", err)
        // Fallback: local comparison
        const match = scanInput.trim().toUpperCase() === engineTask.container.container_number.toUpperCase()
        setScanResult({ match, scanned: scanInput.trim(), expected: engineTask.container.container_number })
        if (match) setTimeout(() => go(3), 800)
      } finally {
        setScanning(false)
      }
    } else if (!backendConnected && seedTask) {
      // Seed fallback: compare locally against seed container ID
      const match = scanInput.trim().toUpperCase() === seedTask.container.toUpperCase()
      setScanResult({ match, scanned: scanInput.trim(), expected: seedTask.container })
      if (match) setTimeout(() => go(3), 800)
    }
  }

  // ── Done step: complete move ──────────────────────────────────────────────
  async function confirmDone() {
    if (!displayTask) return
    setConfirming(true)
    setConfirmError(null)
    try {
      if (backendConnected && engineTask) {
        // Backend path
        await backendApi.completeMove(engineTask.id)
        // After 2 seconds, poll for the next task
        go(0)
        setReason(null)
        setQuarantine(false)
        setTimeout(async () => {
          if (selectedJockeyId != null) await fetchNextTask(selectedJockeyId)
        }, 2000)
      } else {
        // Seed / Express fallback (existing behaviour)
        const res = await fetch(`/api/moves/${displayTask.id}/complete`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({}),
        })
        if (!res.ok) {
          const body = await res.json().catch(() => ({ error: `Server error ${res.status}` }))
          throw new Error((body as { error?: string }).error ?? `Server error ${res.status}`)
        }
        await refresh(["moves", "containers"])
        go(0)
      }
    } catch (err) {
      setConfirmError(String(err).replace("Error: ", ""))
    } finally {
      setConfirming(false)
    }
  }

  // ── Button labels / handlers depend on mode ───────────────────────────────
  const useBackendScan = backendConnected && !!engineTask && current.key === "identify"

  const primary: [string, ()=>void] = {
    instruction: ["Accept and start",                                                ()=>go(1)],
    identify:    useBackendScan
      ? ["Report mismatch",                                                          ()=>go(2)]
      : ["Report mismatch",                                                          ()=>go(2)],
    exception:   [reason ? "Submit for supervisor approval" : "Select a reason code",()=>reason && go(3)],
    damage:      ["Attach and continue",                                             ()=>go(4)],
    done:        [confirming ? "Saving…" : "Confirm done",                           confirmDone],
  }[current.key] as [string, ()=>void]

  const secondary: [string, ()=>void] = {
    instruction: ["Report a problem",    ()=>go(2)],
    identify:    ["Confirm match",        ()=>go(3)],
    exception:   ["Cancel and escalate", ()=>{ setReason(null); go(0) }],
    damage:      ["No damage",            ()=>go(4)],
    done:        ["View my queue",        ()=>go(0)],
  }[current.key] as [string, ()=>void]

  // ── Jockey picker (backend only, before task flow) ────────────────────────
  const availableJockeys = backendJockeys.filter(j => j.status === "available" || j.status === "busy")

  if (backendConnected && selectedJockeyId == null) {
    return (
      <div className="flex flex-col h-full min-h-0 overflow-auto bg-white text-neutral-900">
        <div className="flex items-center gap-4 px-5 pt-3.5 pb-3 border-b-2 border-neutral-200 flex-none">
          <div className="flex flex-col gap-1">
            <span className="font-black text-[19px] tracking-tight">Operator tablet</span>
            <span className="text-[11px] text-neutral-500">Backend connected — select your jockey ID to load your task queue</span>
          </div>
        </div>
        <div className="flex flex-1 items-center justify-center">
          <div className="w-[340px] border-[12px] border-neutral-900 bg-white">
            <div className="flex justify-between px-3 py-1.5 bg-neutral-900 text-white text-[10px] tracking-wider">
              <span>—:—</span><span>4G · —%</span>
            </div>
            <div className="px-3.5 pt-4 pb-3 border-b-2 border-neutral-200">
              <div className="font-black text-[22px] tracking-tight">Who are you?</div>
              <div className="text-[12px] text-neutral-600 mt-1 leading-relaxed">Select your jockey ID to load your assigned task queue from the planning engine.</div>
            </div>
            <div className="flex flex-col gap-0">
              {availableJockeys.length === 0 && (
                <div className="px-3.5 py-4 text-[13px] text-neutral-500">
                  No jockeys available from the backend. Check the planning engine.
                </div>
              )}
              {availableJockeys.map(j => (
                <button
                  key={j.id}
                  onClick={() => setSelectedJockeyId(j.id)}
                  className="block w-full text-left px-3.5 py-3.5 border-b border-neutral-200 hover:bg-neutral-50 transition-colors"
                >
                  <div className="font-black text-[16px]">{j.name}</div>
                  <div className="text-[11px] text-neutral-500 mt-0.5 capitalize">{j.status} · speed ×{j.speed_factor}</div>
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
      <div className="flex flex-col h-full min-h-0 overflow-auto bg-white text-neutral-900">
        <div className="flex items-center gap-4 px-5 pt-3.5 pb-3 border-b-2 border-neutral-200 flex-none">
          <div className="flex flex-col gap-1">
            <span className="font-black text-[19px] tracking-tight">Operator tablet</span>
            <span className="text-[11px] text-neutral-500">{jockey?.name ?? "Jockey"} · engine connected</span>
          </div>
          <div className="ml-auto">
            <Button variant="secondary" size="sm" className="text-xs" onClick={() => { setSelectedJockeyId(null); setEngineTask(null) }}>
              Switch jockey
            </Button>
          </div>
        </div>
        <div className="flex flex-1 items-center justify-center">
          <div className="w-[340px] border-[12px] border-neutral-900 bg-white">
            <div className="flex justify-between px-3 py-1.5 bg-neutral-900 text-white text-[10px] tracking-wider">
              <span>—:—</span><span>4G · —%</span>
            </div>
            <div className="px-3.5 py-5 text-center">
              {fetchingTask ? (
                <>
                  <div className="text-[24px] mb-2 animate-spin select-none">⟳</div>
                  <div className="font-black text-[17px]">Loading task…</div>
                  <div className="text-[12px] text-neutral-500 mt-1">Fetching your next move from the engine</div>
                </>
              ) : (
                <>
                  <div className="font-black text-[17px] mb-2">Queue empty</div>
                  <div className="text-[13px] text-neutral-600 leading-relaxed">No more tasks assigned. Check back in 30 seconds or contact the planner.</div>
                  <button
                    onClick={() => selectedJockeyId != null && fetchNextTask(selectedJockeyId)}
                    className="mt-4 w-full text-left px-3.5 py-[14px] bg-[#201e1d] text-white text-[14px] font-semibold"
                  >
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

  // ── No task at all (seed mode with empty operatorTasks) ───────────────────
  if (!displayTask) return null

  const jockeyName = backendConnected
    ? (backendJockeys.find(j => j.id === selectedJockeyId)?.name ?? "Operator")
    : "OP-114 R. Giménez"

  return (
    <div className="flex flex-col h-full min-h-0 overflow-auto bg-white text-neutral-900">
      {/* Header */}
      <div className="flex items-center gap-4 px-5 pt-3.5 pb-3 border-b-2 border-neutral-200 flex-none">
        <div className="flex flex-col gap-1">
          <span className="font-black text-[19px] tracking-tight">Operator tablet</span>
          <span className="text-[11px] text-neutral-500">
            {jockeyName} · {backendConnected ? "engine connected" : "RS-01 · shift 06:00–14:00 · device-bound, offline queue armed"}
          </span>
        </div>
        <div className="ml-auto flex gap-2">
          {backendConnected && (
            <Button variant="ghost" size="sm" className="text-xs" onClick={() => { setSelectedJockeyId(null); setEngineTask(null) }}>
              Switch jockey
            </Button>
          )}
          <Button variant="ghost" size="sm" className="text-xs" onClick={()=>{setStep(0);setReason(null);setQuarantine(false);setScanInput("");setScanResult(null)}}>
            Restart run
          </Button>
          {!backendConnected && (
            <Button variant="secondary" size="sm" className="text-xs" onClick={()=>setOffline(!offline)}>
              {offline?"Offline — 3 queued":"Simulate offline"}
            </Button>
          )}
        </div>
      </div>

      <div className="grid flex-1 min-h-0 overflow-auto" style={{gridTemplateColumns:"minmax(360px,440px) minmax(300px,1fr)"}}>
        {/* Phone mockup */}
        <div className="border-r-2 border-neutral-200 p-5 flex justify-center overflow-auto">
          <div className="w-[340px] border-[12px] border-neutral-900 bg-white self-start">
            {/* Status bar */}
            <div className="flex justify-between px-3 py-1.5 bg-neutral-900 text-white text-[10px] tracking-wider">
              <span>06:24</span>
              <span>{backendConnected ? "engine" : offline ? "OFFLINE · queued 3" : "4G"} · 84%</span>
            </div>

            {/* Task header */}
            <div className="px-3.5 pt-3.5 pb-2.5 border-b-2 border-neutral-200">
              <div className="flex justify-between text-[11px] text-neutral-500">
                <span>Task {displayTask.seq}</span><span>{displayTask.id}</span>
              </div>
              <div className="font-black text-[23px] leading-tight mt-1.5 tracking-tight">{current.title}</div>
            </div>

            {/* ── Step content (unchanged JSX, displayTask fields substituted) ── */}

            {current.key==="instruction" && (
              <div>
                <div className="px-3.5 py-3.5 border-b border-neutral-200">
                  <div className="text-[11px] tracking-widest uppercase text-neutral-500">Container</div>
                  <div className="font-black text-[30px] tracking-tight leading-tight tabular">{displayTask.container}</div>
                  <div className="text-[14px] mt-1">{displayTask.size} · {displayTask.weight}</div>
                </div>
                <div className="grid grid-cols-2">
                  <div className="px-3.5 py-3 border-r border-b border-neutral-200">
                    <div className="text-[11px] tracking-widest uppercase text-neutral-500">From</div>
                    <div className="font-black text-[20px] tabular">{displayTask.from}</div>
                  </div>
                  <div className="px-3.5 py-3 border-b border-neutral-200">
                    <div className="text-[11px] tracking-widest uppercase text-neutral-500">To</div>
                    <div className="font-black text-[20px] tabular">{displayTask.to}</div>
                  </div>
                </div>
                <div className="px-3.5 py-3 bg-red-50 border-b border-neutral-200">
                  <div className="text-[13px] leading-relaxed">{displayTask.reason}</div>
                </div>
                <div className="px-3.5 py-3 border-b-2 border-neutral-200 flex gap-2 items-start">
                  <span className="w-1 self-stretch bg-[#d9291c]" />
                  <span className="text-[13px] leading-relaxed">{displayTask.warn}</span>
                </div>
              </div>
            )}

            {current.key==="identify" && (
              <div>
                <div className="px-3.5 py-3.5 border-b border-neutral-200">
                  <div className="text-[13px] leading-relaxed">
                    {backendConnected
                      ? "Enter or scan the container number shown on the unit."
                      : "Cab camera read the container ID on approach. Confirm it matches the instruction."}
                  </div>
                </div>
                <div className="px-3.5 py-3.5 flex flex-col gap-2.5">
                  <div>
                    <div className="text-[11px] tracking-widest uppercase text-neutral-500">Expected</div>
                    <div className="font-black text-[26px] tabular">{displayTask.container}</div>
                  </div>

                  {backendConnected ? (
                    /* Backend scan UI */
                    <>
                      <div>
                        <div className="text-[11px] tracking-widest uppercase text-neutral-500 mb-1.5">Scan / enter ID</div>
                        <input
                          type="text"
                          value={scanInput}
                          onChange={e => { setScanInput(e.target.value); setScanResult(null) }}
                          onKeyDown={e => e.key === "Enter" && handleScan()}
                          placeholder="e.g. HLXU4406052"
                          className="w-full border border-neutral-400 px-2.5 py-2 text-[15px] font-bold tabular tracking-widest uppercase bg-white"
                        />
                      </div>
                      <button
                        onClick={handleScan}
                        disabled={!scanInput.trim() || scanning}
                        className="w-full text-left px-3 py-2.5 bg-neutral-900 text-white text-[13px] font-semibold disabled:opacity-40"
                      >
                        {scanning ? "Checking…" : "Confirm scan"}
                      </button>
                      {scanResult && (
                        <div className={`px-3 py-2.5 text-[13px] leading-snug ${scanResult.match ? "bg-emerald-50 border border-emerald-400 text-emerald-900" : "bg-red-50 border border-[#d9291c] text-[#9b1c1c]"}`}>
                          {scanResult.match
                            ? `✓ Match confirmed — ${scanResult.scanned}. Advancing…`
                            : `✗ Mismatch: Scanned ${scanResult.scanned} — Expected ${scanResult.expected}`}
                        </div>
                      )}
                    </>
                  ) : (
                    /* Seed / hardcoded display */
                    <>
                      <div>
                        <div className="text-[11px] tracking-widest uppercase text-neutral-500">OCR read</div>
                        <div className="font-black text-[26px] tabular text-[#d9291c]">HLXU4406025</div>
                      </div>
                      <div className="text-[13px] leading-relaxed text-[#d9291c]">Mismatch: last two digits transposed (025 vs 052) against the instruction. The lift is blocked until this resolves.</div>
                    </>
                  )}
                </div>
              </div>
            )}

            {current.key==="exception" && (
              <div className="px-3.5 py-3.5 flex flex-col gap-3">
                <div className="text-[13px] leading-relaxed">Mismatch blocked the lift. A supervisor-approved manual confirmation needs a photo and a reason code — both are written to the audit trail for {displayTask.container}.</div>
                <div className="flex gap-1.5">
                  <div className="flex-1 h-[74px] bg-neutral-200 border border-neutral-400 flex items-end p-1 text-[10px] text-neutral-600">ID plate photo</div>
                  <div className="flex-1 h-[74px] bg-neutral-200 border border-neutral-400 flex items-end p-1 text-[10px] text-neutral-600">Stack photo</div>
                </div>
                <div>
                  <div className="text-[11px] tracking-widests uppercase text-neutral-500 mb-1.5">Reason code</div>
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
                    ? "Approved by Yard Manager 06:22 — manual confirmation recorded against "+displayTask.id+" with two photos."
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
                <div className="font-black text-[22px]">Job cycle {displayTask.est.toFixed(1)}′</div>
                <div className="text-[13px] leading-relaxed">Accepted 06:19:20, confirmed 06:24:14. Actual duration written to the audit record against a {displayTask.est}′ estimate.</div>
                <div className="border-t border-neutral-200 pt-2.5 text-[13px] leading-relaxed">
                  {backendConnected
                    ? "Completing this move with the planning engine. Your next task will load in ~2 seconds."
                    : "Next task will be dispatched to your queue by the planner — check the tablet in 30 seconds."}
                </div>
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
          <div className="px-4 pt-3 pb-2 text-[10px] tracking-widests uppercase text-neutral-500 font-bold">Flow · what the demo shows</div>
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
          <div className="px-4 pt-3 pb-2 text-[10px] tracking-widests uppercase text-neutral-500 font-bold">Audit written this task</div>
          {[
            {t:"06:19:20",what:"Instruction accepted — job-cycle clock starts"},
            {t:"06:20:05",what:"Cab OCR read, mismatch against "+displayTask.container},
            {t:"06:21:48",what:"Exception raised: "+(reason||"reason code pending")},
            {t:"06:22:11",what:"Supervisor approval, 2 photos attached"},
            {t:"06:24:14",what:"Confirm done — actual "+displayTask.est.toFixed(1)+"′ against "+displayTask.est+"′ estimate"},
          ].map(a=>(
            <div key={a.t} className="flex gap-3 px-4 py-1.5 text-[11.5px]">
              <span className="w-14 text-neutral-500 tabular">{a.t}</span>
              <span className="flex-1 leading-relaxed">{a.what}</span>
            </div>
          ))}
          <div className="px-4 py-3.5 text-[11.5px] text-neutral-500 leading-relaxed max-w-lg">
            {backendConnected
              ? `Connected to planning engine · jockey: ${jockeyName} · scan validation live`
              : "Adoption is the pilot's hardest exit criterion: 95% of moves executed through the tablet rather than from memory. Bypass rate is reported to the supervisor dashboard daily."}
          </div>
        </div>
      </div>
    </div>
  )
}
