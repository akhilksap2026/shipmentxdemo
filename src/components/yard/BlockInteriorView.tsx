import { getSegregation } from "@/data/block-segregation"
import { containerColor } from "@/lib/yard-color"
import type { ColorMode } from "@/lib/yard-color"
import type { ViewContainer } from "./types"

interface Props {
  blockLabel:    string
  zoneName:      string
  numCols:       number    // number of slot/bay columns
  numRows:       number    // number of row rows
  maxTiers:      number
  containers:    ViewContainer[]
  mode:          ColorMode
  searchQuery:   string
  selectedSlot:  { col: number; row: number } | null
  onSlotClick:   (col: number, row: number) => void
  onBack:        () => void
}

const CELL_W = 60
const CELL_H = 52

export default function BlockInteriorView({
  blockLabel, zoneName, numCols, numRows, maxTiers,
  containers, mode, searchQuery, selectedSlot, onSlotClick, onBack,
}: Props) {
  const ql = searchQuery.trim().toLowerCase()

  // Segregation zones for this block
  const segs = getSegregation(blockLabel)

  // Derive unique type labels for legend (deduplicated, excluding transparent)
  const segLegend = segs
    .filter((s, i, a) => a.findIndex(x => x.type === s.type) === i && s.tint !== "transparent")

  // Helper: segregation tint for a given slot column
  function slotTint(col: number): string {
    const seg = segs.find(s => col >= s.bayStart && col <= s.bayEnd)
    return seg?.tint ?? "transparent"
  }

  // Helper: containers in a specific (col, row) cell
  function cellContainers(col: number, row: number): ViewContainer[] {
    return containers
      .filter(c => c.slotCol === col && c.rowNum === row)
      .sort((a, b) => b.tier - a.tier) // top tier first
  }

  // Search match for a container
  function matchesSearch(c: ViewContainer): boolean {
    if (!ql) return true
    return (c.id + c.consignee + c.vessel + c.status).toLowerCase().includes(ql)
  }

  // For rehandle mode we need all containers in the same slot
  function sameSlot(col: number, row: number) {
    return containers.filter(c => c.slotCol === col && c.rowNum === row)
  }

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
          ← Yard
        </button>
        <div className="w-px h-4 bg-neutral-300" />
        <div>
          <span className="font-black text-[18px] tracking-tight">{blockLabel}</span>
          <span className="text-[12px] text-neutral-500 ml-2">{zoneName.replace("Zone ","").replace(" — "," · ")}</span>
        </div>

        {/* Occupancy chip */}
        {(() => {
          const filled = containers.filter(c => !c.empty).length
          const total  = numRows * numCols * maxTiers
          const pct    = total > 0 ? Math.round(filled / total * 100) : 0
          return (
            <span
              className="text-[11px] font-bold px-2 py-0.5"
              style={{
                background: pct > 85 ? "#fef2f2" : "#f0fdf4",
                color:      pct > 85 ? "#dc2626" : "#16a34a",
                border:     `1px solid ${pct > 85 ? "#fca5a5" : "#86efac"}`,
                borderRadius: 5,
              }}
            >
              {pct}% full · {filled} containers
            </span>
          )
        })()}

        {/* Segregation legend */}
        {segLegend.length > 0 && (
          <div className="flex gap-2 ml-auto">
            {segLegend.map(s => (
              <span
                key={s.type}
                className="text-[10px] font-semibold px-2 py-0.5"
                style={{
                  background: s.tint,
                  border: "1px solid rgba(0,0,0,0.1)",
                  borderRadius: 4,
                  color: "#374151",
                }}
              >
                {s.type}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Breadcrumb */}
      <div className="px-5 py-1.5 text-[10.5px] text-neutral-400 flex gap-1.5 border-b border-neutral-100 flex-none">
        <button onClick={onBack} className="hover:text-neutral-700">Yard</button>
        <span>›</span>
        <span className="text-neutral-500 font-medium">{blockLabel}</span>
      </div>

      {/* Grid area */}
      <div className="flex-1 min-h-0 overflow-auto p-4">
        <div className="inline-block">
          {/* Column headers (slot numbers) */}
          <div className="flex" style={{ marginLeft: 28 }}>
            {Array.from({ length: numCols }, (_, i) => i + 1).map(col => (
              <div
                key={col}
                className="flex-none flex items-center justify-center text-[9.5px] text-neutral-400 font-semibold"
                style={{ width: CELL_W, marginRight: 2 }}
              >
                S{col}
              </div>
            ))}
          </div>

          {/* Row grid */}
          {Array.from({ length: numRows }, (_, i) => i + 1).map(row => (
            <div key={row} className="flex items-stretch" style={{ marginBottom: 2 }}>
              {/* Row label */}
              <div
                className="flex-none flex items-center justify-center text-[9.5px] text-neutral-400 font-bold"
                style={{ width: 26, marginRight: 2 }}
              >
                R{row}
              </div>

              {/* Cells */}
              {Array.from({ length: numCols }, (_, i) => i + 1).map(col => {
                const cell      = cellContainers(col, row)
                const top       = cell[0]  // topmost container
                const stackH    = cell.length
                const isSelected = selectedSlot?.col === col && selectedSlot?.row === row
                const tint      = slotTint(col)
                const hasMatch  = ql ? cell.some(matchesSearch) : true
                const dimmed    = ql && !hasMatch

                const barColor = top
                  ? containerColor(top, mode, sameSlot(col, row))
                  : "#d1d5db"
                const fillPct = maxTiers > 0 ? (stackH / maxTiers) * 100 : 0

                return (
                  <div
                    key={col}
                    className="relative flex-none"
                    style={{
                      width:  CELL_W,
                      height: CELL_H,
                      marginRight: 2,
                      background: tint === "transparent" ? "#fafafa" : tint,
                      border: isSelected
                        ? "2px solid #dc2626"
                        : "1px solid #d1d5db",
                      borderRadius: 3,
                      cursor: "pointer",
                      opacity: dimmed ? 0.25 : 1,
                      boxShadow: isSelected ? "0 0 0 2px rgba(220,38,38,0.2)" : "none",
                      transition: "border-color 100ms, opacity 100ms",
                    }}
                    onClick={() => onSlotClick(col, row)}
                    title={top ? `${top.id} · tier ${top.tier}` : `S${col}-R${row} empty`}
                    onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.borderColor = "#dc2626" }}
                    onMouseLeave={e => {
                      (e.currentTarget as HTMLDivElement).style.borderColor =
                        isSelected ? "#dc2626" : "#d1d5db"
                    }}
                  >
                    {/* Stack fill bar (from bottom up) */}
                    {stackH > 0 && (
                      <div
                        className="absolute bottom-0 left-0 right-0"
                        style={{
                          height:  `${fillPct}%`,
                          background: barColor,
                          opacity: 0.7,
                          borderRadius: "0 0 2px 2px",
                        }}
                      />
                    )}

                    {/* Stack count label */}
                    {stackH > 0 && (
                      <div
                        className="absolute top-0.5 right-1 font-mono font-bold leading-none"
                        style={{ fontSize: 9, color: "#374151" }}
                      >
                        {stackH}/{maxTiers}
                      </div>
                    )}

                    {/* Top container ID (first 4 chars) */}
                    {top && (
                      <div
                        className="absolute bottom-1 left-1 font-mono leading-none"
                        style={{ fontSize: 8, color: "#374151" }}
                      >
                        {top.id.slice(0, 4)}
                      </div>
                    )}

                    {/* Hazmat badge */}
                    {top?.hazmat && (
                      <div
                        className="absolute top-0.5 left-0.5 font-bold leading-none"
                        style={{ fontSize: 8, color: "#f97316" }}
                      >
                        ⚠
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          ))}
        </div>

        {containers.length === 0 && (
          <div className="mt-8 text-[13px] text-neutral-400 text-center">
            No containers in this block
          </div>
        )}
      </div>
    </div>
  )
}
