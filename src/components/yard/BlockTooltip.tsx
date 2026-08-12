import type { BlockLayout } from "@/lib/yard-layout"

interface Props {
  layout: BlockLayout
  zoneName: string
  x: number
  y: number
}

export default function BlockTooltip({ layout, zoneName, x, y }: Props) {
  // Keep tooltip on screen — shift left if too close to right edge
  const style: React.CSSProperties = {
    position: "absolute",
    left: x + 14,
    top: Math.max(4, y - 10),
    zIndex: 200,
    pointerEvents: "none",
    minWidth: 180,
  }

  const barColor =
    layout.occupancyPct > 85 ? "#dc2626" :
    layout.occupancyPct > 70 ? "#f59e0b" : "#16a34a"

  return (
    <div style={style}>
      <div
        className="bg-white border border-slate-300"
        style={{ borderRadius: 5, boxShadow: "0 4px 16px rgba(0,0,0,0.13)", padding: "10px 12px" }}
      >
        <div className="font-black tracking-tight" style={{ fontSize: 15 }}>{layout.label}</div>
        <div className="text-neutral-500" style={{ fontSize: 11, marginTop: 1 }}>{zoneName}</div>

        {/* Occupancy bar */}
        <div style={{ marginTop: 8, display: "flex", alignItems: "center", gap: 6 }}>
          <div style={{ flex: 1, height: 6, background: "#e5e7eb", borderRadius: 3 }}>
            <div
              style={{
                height: "100%",
                width: `${layout.occupancyPct}%`,
                background: barColor,
                borderRadius: 3,
              }}
            />
          </div>
          <span
            className="font-bold tabular"
            style={{ fontSize: 11, color: barColor }}
          >
            {layout.occupancyPct}%
          </span>
        </div>

        <div className="text-neutral-500" style={{ fontSize: 10.5, marginTop: 3 }}>
          {layout.containerCount} / {layout.capacity} slots
        </div>

        {layout.topContainerIds.length > 0 && (
          <div style={{ marginTop: 8, paddingTop: 7, borderTop: "1px solid #f3f4f6" }}>
            <div
              className="font-bold tracking-wider text-neutral-400"
              style={{ fontSize: 8.5, marginBottom: 3 }}
            >
              IN BLOCK
            </div>
            {layout.topContainerIds.map(id => (
              <div key={id} className="font-mono text-neutral-700" style={{ fontSize: 11 }}>
                {id}
              </div>
            ))}
            {layout.containerCount > 3 && (
              <div className="text-neutral-400" style={{ fontSize: 10 }}>
                +{layout.containerCount - 3} more
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
