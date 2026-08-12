import { useState } from "react"
import { containerColor } from "@/lib/yard-color"
import type { ColorMode } from "@/lib/yard-color"
import type { ViewContainer } from "./types"

interface Props {
  blockLabel: string
  zoneName:   string
  slotCol:    number
  rowNum:     number
  maxTiers:   number
  containers: ViewContainer[]   // all in this slot (one per occupied tier)
  mode:       ColorMode
  onBack:     () => void
  onNavigate?: (screen: string, focusId?: string) => void
}

export default function SlotStackView({
  blockLabel, zoneName, slotCol, rowNum, maxTiers,
  containers, mode, onBack, onNavigate,
}: Props) {
  const [selTier, setSelTier] = useState<number | null>(
    containers.length > 0 ? containers[0].tier : null,
  )

  const slotAddr = `${blockLabel}-${rowNum}-${slotCol}`
  const selC = containers.find(c => c.tier === selTier) ?? containers[0] ?? null

  // All containers in this slot (for rehandle color mode)
  const sameSlot = containers

  // Tiers from top to bottom
  const tierNums = Array.from({ length: maxTiers }, (_, i) => maxTiers - i)

  const isDark = (bg: string) =>
    /^#[0-5]/.test(bg) || ["#4b5563","#374151","#111827","#9b1c1c"].includes(bg)

  return (
    <div className="flex flex-col flex-1 min-h-0 bg-white">
      {/* Header */}
      <div
        className="flex flex-wrap items-center gap-3 px-5 py-3 border-b-2 border-neutral-200 flex-none"
        style={{ background: "#fafafa" }}
      >
        <button
          onClick={onBack}
          className="font-semibold text-[12px] text-neutral-500 hover:text-neutral-900 transition-colors"
        >
          ← {blockLabel}
        </button>
        <div className="w-px h-4 bg-neutral-300" />
        <div>
          <span className="font-black text-[18px] tracking-tight font-mono">{slotAddr}</span>
          <span className="text-[12px] text-neutral-500 ml-2">
            Bay {slotCol} · Row {rowNum} · {zoneName.replace("Zone ","").split(" — ")[0]}
          </span>
        </div>
        <span
          className="text-[11px] font-semibold px-2 py-0.5"
          style={{
            background: "#f9fafb", border: "1px solid #e5e7eb",
            borderRadius: 5, color: "#374151",
          }}
        >
          {containers.length}/{maxTiers} tiers occupied
        </span>
      </div>

      {/* Breadcrumb */}
      <div className="px-5 py-1.5 text-[10.5px] text-neutral-400 flex gap-1.5 border-b border-neutral-100 flex-none">
        <span className="hover:text-neutral-700 cursor-pointer" onClick={() => { onBack(); onBack() }}>Yard</span>
        <span>›</span>
        <span className="hover:text-neutral-700 cursor-pointer" onClick={onBack}>{blockLabel}</span>
        <span>›</span>
        <span className="text-neutral-500 font-medium">Bay {slotCol} / Row {rowNum}</span>
      </div>

      {/* Main split: tier stack + detail */}
      <div className="flex flex-1 min-h-0 overflow-hidden">

        {/* Left: tier stack */}
        <div
          className="flex flex-col gap-1.5 p-4 overflow-auto border-r border-neutral-200"
          style={{ width: 280, flexShrink: 0 }}
        >
          <div className="ds-label text-neutral-400 mb-1">Tier stack — top to bottom</div>
          {tierNums.map(tier => {
            const c  = containers.find(x => x.tier === tier)
            const bg = c ? containerColor(c, mode, sameSlot) : "transparent"
            const selected = selTier === tier
            return (
              <div
                key={tier}
                onClick={() => c && setSelTier(tier)}
                style={{
                  border:       `2px solid ${selected ? "#dc2626" : c ? "#9ca3af" : "#e5e7eb"}`,
                  borderLeft:   c ? `5px solid ${bg}` : `2px solid #e5e7eb`,
                  borderRadius:  5,
                  padding:      "8px 12px",
                  cursor:       c ? "pointer" : "default",
                  background:   selected ? "#fef2f2" : c ? "#fff" : "#fafafa",
                  opacity:      c ? 1 : 0.5,
                  borderStyle:  c ? undefined : "dashed",
                }}
              >
                <div className="flex justify-between items-baseline">
                  <span
                    className="text-[9.5px] font-bold tracking-wider text-neutral-400"
                  >
                    TIER {tier}
                  </span>
                  {c && (
                    <span
                      className="text-[9px] px-1.5 py-0.5 font-semibold"
                      style={{
                        background: bg,
                        color: isDark(bg) ? "#fff" : "#111827",
                        borderRadius: 3,
                      }}
                    >
                      {mode.toUpperCase()}
                    </span>
                  )}
                </div>
                {c ? (
                  <div className="mt-1">
                    <div className="font-mono font-bold text-[15px] tracking-tight">{c.id}</div>
                    <div className="text-[11px] text-neutral-500 mt-0.5">
                      {c.size} · {c.status.replace(/_/g," ").toLowerCase()}
                    </div>
                    {c.hoursToLFD !== -9999 && (
                      <div
                        className="text-[10.5px] mt-0.5 font-medium"
                        style={{ color: c.hoursToLFD < 0 ? "#dc2626" : c.hoursToLFD <= 24 ? "#f59e0b" : "#6b7280" }}
                      >
                        LFD: {c.hoursToLFD < 0 ? `−${Math.abs(c.hoursToLFD)}h breached` : `${c.hoursToLFD}h`}
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="text-[12px] text-neutral-400 mt-1">Empty</div>
                )}
              </div>
            )
          })}
        </div>

        {/* Right: detail panel */}
        <div className="flex-1 min-w-0 overflow-auto">
          {selC ? (
            <div>
              <div className="px-5 pt-4 pb-3 border-b border-neutral-200">
                <div className="ds-label text-neutral-400">{slotAddr} · Tier {selC.tier}</div>
                <div className="font-mono font-black text-[22px] mt-1 tracking-tight">{selC.id}</div>
                <div className="text-[12px] text-neutral-600 mt-0.5">
                  {selC.consignee} · {selC.carrierName} · {selC.vessel}
                </div>
              </div>

              {selC.whyHere && (
                <div className="px-5 py-3 border-b border-neutral-200 bg-red-50">
                  <div className="ds-label text-[#a01f14] mb-1">Why here</div>
                  <div className="text-[12.5px] leading-relaxed">{selC.whyHere}</div>
                </div>
              )}

              {([
                ["Size / gross",   `${selC.size} · ${(selC.grossKg / 1000).toFixed(1)} t`],
                ["Status",         selC.status.replace(/_/g," ").toLowerCase()],
                ...(selC.hoursToLFD !== -9999
                  ? [["Hours to LFD", selC.hoursToLFD < 0
                      ? `breached ${Math.abs(selC.hoursToLFD)} h` : `${selC.hoursToLFD} h`,
                      selC.hoursToLFD <= 24]] as [string, string, boolean?][]
                  : []),
                ...(selC.channel !== "—"
                  ? [["Customs channel", selC.channel, selC.channel === "rojo" || selC.channel === "naranja"]] as [string, string, boolean?][]
                  : []),
                ["Dwell",          `${selC.dwellDays} days`],
                ["Priority",       selC.priority],
                ["Hazmat",         selC.hazmat ? "Yes" : "No", selC.hazmat],
                ...(selC.seal !== "—" ? [["Seal", selC.seal]] as [string, string][] : []),
                ...(selC.terminal !== "—" ? [["Terminal", selC.terminal]] as [string, string][] : []),
              ] as [string, string, boolean?][]).map(([k, v, red]) => (
                <div key={k} className="flex justify-between gap-3 px-5 py-2 border-b border-neutral-100 text-[11.5px]">
                  <span className="text-neutral-500">{k}</span>
                  <span className={`font-semibold text-right ${red ? "text-[#dc2626]" : ""}`}>{v}</span>
                </div>
              ))}

              <div className="px-5 pt-3 pb-1.5 ds-label text-neutral-400">Move history</div>
              {[
                { t:"05:12", what:`Placed at ${blockLabel}-${rowNum}-${slotCol} by OP-207 (RS-02), 4.2′` },
                { t:"04:48", what:"Received from receiving lane R-02" },
                { t:"04:31", what:`Gate-in, EIR captured, seal ${selC.seal !== "—" ? selC.seal : "—"} verified` },
                { t:"02:55", what:`Departed ${selC.terminal !== "—" ? selC.terminal : "origin"}` },
              ].map(h => (
                <div key={h.t} className="flex gap-2.5 px-5 py-1.5 text-[11.5px] border-b border-neutral-100">
                  <span className="text-neutral-400 tabular w-10">{h.t}</span>
                  <span className="flex-1 leading-tight">{h.what}</span>
                </div>
              ))}

              {onNavigate && (
                <>
                  <div className="px-5 pt-3 pb-1.5 ds-label text-neutral-400">Navigate to</div>
                  <div className="flex flex-col gap-1.5 px-5 pb-4">
                    <button
                      className="text-left text-[11.5px] px-3 py-2 font-semibold"
                      style={{ background: "#f9fafb", border: "1px solid #e5e7eb", borderRadius: 5, color: "#374151" }}
                      onClick={() => onNavigate("S4", selC.id)}
                    >
                      View in night plan →
                    </button>
                    <button
                      className="text-left text-[11.5px] px-3 py-2 font-semibold"
                      style={{ background: "#f9fafb", border: "1px solid #e5e7eb", borderRadius: 5, color: "#374151" }}
                      onClick={() => onNavigate("S7", selC.id)}
                    >
                      Related events in the tower →
                    </button>
                    <button
                      className="text-left text-[11.5px] px-3 py-2 font-semibold"
                      style={{ background: "#f9fafb", border: "1px solid #e5e7eb", borderRadius: 5, color: "#374151" }}
                      onClick={() => onNavigate("S2", selC.id)}
                    >
                      Container in the gate console →
                    </button>
                  </div>
                </>
              )}
            </div>
          ) : (
            <div className="px-5 py-6 text-[12px] text-neutral-400">
              Select an occupied tier on the left to see container details.
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
