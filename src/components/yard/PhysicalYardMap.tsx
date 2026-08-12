import { useRef, useState, useCallback, useEffect } from "react"
import type { BlockLayout, EquipmentPosition, MoveTrail } from "@/lib/yard-layout"
import { getYardDimensions } from "@/lib/yard-layout"
import BlockTooltip from "./BlockTooltip"

interface Props {
  layouts:          BlockLayout[]
  selectedBlock:    string | null
  onSelectBlock:    (label: string) => void
  zoneNames?:       Record<string, string>
  children?:        React.ReactNode
  // Part 3 — equipment overlay
  equipment?:       EquipmentPosition[]
  showEquipment?:   boolean
  // Part 3 — move trails
  moveTrails?:      MoveTrail[]
  showTrails?:      boolean
  // Part 3 — congestion heat
  congestionByBlock?: Map<string, number>
  showCongestion?:  boolean
  // Part 3 — scrubber active-move highlight
  activeMoveBlocks?: Set<string>
}

const ZONE_COLOR: Record<string, string> = {
  A: "#e0f2fe", B: "#dbeafe", C: "#f3e8ff", D: "#ffedd5", E: "#ecfccb", S: "#fef3c7", R: "#f3f4f6",
}
const ZONE_BORDER: Record<string, string> = {
  A: "#7dd3fc", B: "#93c5fd", C: "#d8b4fe", D: "#fdba74", E: "#bef264", S: "#fcd34d", R: "#d1d5db",
}

const EQ_STATUS_COLOR: Record<string, string> = {
  idle: "#16a34a", moving: "#f59e0b", lifting: "#dc2626", travelling: "#3b82f6",
}

const MINIMAP_W = 128
const MINIMAP_H = 96

export default function PhysicalYardMap({
  layouts, selectedBlock, onSelectBlock, zoneNames = {}, children,
  equipment = [], showEquipment = false,
  moveTrails = [], showTrails = false,
  congestionByBlock, showCongestion = false,
  activeMoveBlocks,
}: Props) {
  const containerRef    = useRef<HTMLDivElement>(null)
  const dragging        = useRef(false)
  const didDrag         = useRef(false)
  const lastPos         = useRef({ x: 0, y: 0 })

  const [tf,              setTf]             = useState({ x: 16, y: 16, scale: 1 })
  const [hoveredLayout,   setHoveredLayout]  = useState<BlockLayout | null>(null)
  const [tooltipPos,      setTooltipPos]     = useState<{ x: number; y: number } | null>(null)
  const [hoveredEquip,    setHoveredEquip]   = useState<EquipmentPosition | null>(null)
  const [equipTooltipPos, setEquipTooltipPos]= useState<{ x: number; y: number } | null>(null)

  const dims = getYardDimensions(layouts)

  // ── Fit-to-view ─────────────────────────────────────────────────────────────
  const fitView = useCallback(() => {
    if (!containerRef.current || layouts.length === 0) return
    const { width: cw, height: ch } = containerRef.current.getBoundingClientRect()
    const scale = Math.min((cw - 32) / dims.width, (ch - 32) / dims.height, 1)
    setTf({ x: 16, y: 16, scale })
  }, [dims.width, dims.height, layouts.length])

  useEffect(() => { fitView() }, [layouts.length]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Zoom at a point ──────────────────────────────────────────────────────────
  const zoomAt = useCallback((cx: number, cy: number, factor: number) => {
    setTf(t => {
      const newScale = Math.max(0.15, Math.min(5, t.scale * factor))
      const actual   = newScale / t.scale
      return { scale: newScale, x: cx - (cx - t.x) * actual, y: cy - (cy - t.y) * actual }
    })
  }, [])

  // ── Wheel zoom ───────────────────────────────────────────────────────────────
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      const rect = el.getBoundingClientRect()
      zoomAt(e.clientX - rect.left, e.clientY - rect.top, Math.pow(0.999, e.deltaY))
    }
    el.addEventListener("wheel", onWheel, { passive: false })
    return () => el.removeEventListener("wheel", onWheel)
  }, [zoomAt])

  // ── Drag-to-pan ──────────────────────────────────────────────────────────────
  const onMouseDown = (e: React.MouseEvent) => {
    dragging.current = true
    didDrag.current  = false
    lastPos.current  = { x: e.clientX, y: e.clientY }
  }
  const onMouseMove = (e: React.MouseEvent) => {
    if (!dragging.current) return
    const dx = e.clientX - lastPos.current.x
    const dy = e.clientY - lastPos.current.y
    if (Math.abs(dx) + Math.abs(dy) > 2) didDrag.current = true
    lastPos.current = { x: e.clientX, y: e.clientY }
    setTf(t => ({ ...t, x: t.x + dx, y: t.y + dy }))
  }
  const onMouseUp = () => { dragging.current = false }

  // ── Block tooltip helpers ────────────────────────────────────────────────────
  function handleBlockEnter(layout: BlockLayout, e: React.MouseEvent) {
    setHoveredLayout(layout)
    const rect = containerRef.current!.getBoundingClientRect()
    setTooltipPos({ x: e.clientX - rect.left, y: e.clientY - rect.top })
  }
  function handleBlockMove(layout: BlockLayout, e: React.MouseEvent) {
    if (hoveredLayout?.label !== layout.label) return
    const rect = containerRef.current!.getBoundingClientRect()
    setTooltipPos({ x: e.clientX - rect.left, y: e.clientY - rect.top })
  }
  function handleBlockLeave() {
    setHoveredLayout(null)
    setTooltipPos(null)
  }

  // ── Equipment tooltip helpers ────────────────────────────────────────────────
  function handleEquipEnter(eq: EquipmentPosition, e: React.MouseEvent) {
    e.stopPropagation()
    setHoveredEquip(eq)
    const rect = containerRef.current!.getBoundingClientRect()
    setEquipTooltipPos({ x: e.clientX - rect.left + 12, y: e.clientY - rect.top + 4 })
  }
  function handleEquipLeave(e: React.MouseEvent) {
    e.stopPropagation()
    setHoveredEquip(null)
    setEquipTooltipPos(null)
  }

  return (
    <div
      ref={containerRef}
      className="relative overflow-hidden bg-[#f0f4f8]"
      style={{ flex: 1, minHeight: 0, cursor: dragging.current ? "grabbing" : "grab",
        touchAction: "none", userSelect: "none" }}
      onMouseDown={onMouseDown}
      onMouseMove={onMouseMove}
      onMouseUp={onMouseUp}
      onMouseLeave={() => { onMouseUp(); handleBlockLeave(); setHoveredEquip(null) }}
    >
      {/* ── Zoomable canvas ── */}
      <div
        className="absolute"
        style={{
          transform: `translate(${tf.x}px, ${tf.y}px) scale(${tf.scale})`,
          transformOrigin: "0 0",
          width:  dims.width,
          height: dims.height,
        }}
      >
        {/* Terminal / Gate labels */}
        <div className="absolute left-0 right-0 flex items-center px-3 font-bold tracking-widest"
          style={{ top: 0, height: 28, background: "#334155", color: "#fff", fontSize: 10 }}>
          TERMINAL / BERTH
        </div>
        <div className="absolute left-0 right-0 flex items-center px-3 font-bold tracking-widest"
          style={{ bottom: 0, height: 28, background: "#065f46", color: "#fff", fontSize: 10 }}>
          GATE
        </div>

        {/* Zone labels */}
        {Array.from(new Set(layouts.map(l => l.zone))).map(zoneId => {
          const first = layouts.find(l => l.zone === zoneId)
          if (!first) return null
          return (
            <div key={zoneId} className="absolute font-semibold tracking-wider text-slate-400"
              style={{ left: 4, top: first.y - 15, fontSize: 9 }}>
              {zoneNames[zoneId] ? zoneNames[zoneId].split(" — ")[0] : `Zone ${zoneId}`}
            </div>
          )
        })}

        {/* ── Move trails (SVG) ── */}
        {showTrails && moveTrails.length > 0 && (
          <svg className="absolute inset-0 pointer-events-none overflow-visible"
            style={{ left: 0, top: 0, width: dims.width, height: dims.height }}>
            {moveTrails.map((trail, i) => (
              <line
                key={trail.id}
                x1={trail.fromX} y1={trail.fromY}
                x2={trail.toX}   y2={trail.toY}
                stroke="#94a3b8"
                strokeWidth={1}
                strokeDasharray="4 3"
                opacity={0.25 + 0.15 * (i / moveTrails.length)}
              />
            ))}
          </svg>
        )}

        {/* ── Blocks ── */}
        {layouts.map(layout => {
          const isSelected = selectedBlock === layout.label
          const isActive   = activeMoveBlocks?.has(layout.label)
          const bg         = ZONE_COLOR[layout.zone]  ?? "#f9fafb"
          const bdr        = ZONE_BORDER[layout.zone] ?? "#9ca3af"
          const barColor   =
            layout.occupancyPct > 85 ? "#dc2626" :
            layout.occupancyPct > 70 ? "#f59e0b" : "#16a34a"
          const congestion = congestionByBlock?.get(layout.label) ?? 0
          const heatColor  =
            showCongestion && congestion > 0.75 ? "rgba(220,38,38,0.18)"
            : showCongestion && congestion > 0.50 ? "rgba(249,115,22,0.14)"
            : showCongestion && congestion > 0.25 ? "rgba(245,158,11,0.10)"
            : null

          return (
            <div
              key={layout.label}
              className="absolute"
              style={{
                left: layout.x, top: layout.y,
                width: layout.w, height: layout.h,
                background: bg,
                border: `2px solid ${isSelected ? "#dc2626" : isActive ? "#f59e0b" : bdr}`,
                outline: isSelected ? "2px solid rgba(220,38,38,0.22)"
                  : isActive ? "2px solid rgba(245,158,11,0.3)" : "none",
                outlineOffset: 2,
                cursor: "pointer",
                transition: "border-color 400ms, outline 400ms",
              }}
              onClick={e  => { e.stopPropagation(); if (!didDrag.current) onSelectBlock(layout.label) }}
              onMouseDown={e => { if (e.button === 0) e.stopPropagation() }}
              onMouseEnter={e => handleBlockEnter(layout, e)}
              onMouseMove={e  => handleBlockMove(layout, e)}
              onMouseLeave={handleBlockLeave}
            >
              {/* Congestion heat tint */}
              {heatColor && (
                <div className="absolute inset-0 pointer-events-none"
                  style={{ background: heatColor }} />
              )}

              {/* Block label */}
              <div className="absolute font-bold text-slate-600 leading-none"
                style={{ top: 2, left: 3, fontSize: 8 }}>
                {layout.label}
                {showCongestion && congestion > 0.25 && (
                  <span style={{ color: "#dc2626", marginLeft: 2 }}>
                    {Math.round(congestion * 100)}%
                  </span>
                )}
              </div>

              {/* Occupancy bar */}
              <div className="absolute bottom-0 left-0 right-0"
                style={{ height: 3, background: "rgba(255,255,255,0.55)" }}>
                <div style={{ height: "100%", width: `${layout.occupancyPct}%`, background: barColor }} />
              </div>

              {/* Container count */}
              <div className="absolute text-slate-400 leading-none"
                style={{ bottom: 5, right: 3, fontSize: 8 }}>
                {layout.containerCount}
              </div>
            </div>
          )
        })}

        {/* ── Equipment icons (inside transform so coordinates match) ── */}
        {showEquipment && equipment.map(eq => {
          const color = eq.type === "reach-stacker" ? "#374151"
            : eq.type === "empty-handler" ? "#9333ea"
            : EQ_STATUS_COLOR[eq.status] ?? "#9ca3af"

          const SZ = eq.type === "jockey" ? 8 : 10

          return (
            <div
              key={eq.id}
              className="absolute"
              style={{
                left: eq.x - SZ / 2,
                top:  eq.y - SZ / 2,
                width: SZ, height: SZ,
                background: color,
                border: "1.5px solid rgba(255,255,255,0.85)",
                borderRadius: eq.type === "jockey" ? "50%" : eq.type === "empty-handler" ? 0 : 2,
                transform: eq.type === "empty-handler" ? "rotate(45deg)" : undefined,
                cursor: "pointer",
                zIndex: 20,
                transition: "left 1000ms linear, top 1000ms linear",
              }}
              onMouseEnter={e => handleEquipEnter(eq, e)}
              onMouseLeave={handleEquipLeave}
            />
          )
        })}
      </div>

      {/* ── Zoom controls ── */}
      <div className="absolute bottom-3 right-3 flex gap-1" style={{ zIndex: 10 }}>
        <button onMouseDown={e => e.stopPropagation()}
          onClick={() => { const r = containerRef.current!.getBoundingClientRect(); zoomAt(r.width/2, r.height/2, 1.3) }}
          className="w-7 h-7 bg-white border border-slate-300 text-slate-600 text-xs font-bold hover:bg-slate-50 flex items-center justify-center"
          style={{ borderRadius: 4 }}>+</button>
        <button onMouseDown={e => e.stopPropagation()}
          onClick={() => { const r = containerRef.current!.getBoundingClientRect(); zoomAt(r.width/2, r.height/2, 0.77) }}
          className="w-7 h-7 bg-white border border-slate-300 text-slate-600 text-xs font-bold hover:bg-slate-50 flex items-center justify-center"
          style={{ borderRadius: 4 }}>−</button>
        <button onMouseDown={e => e.stopPropagation()} onClick={fitView}
          className="px-2 h-7 bg-white border border-slate-300 text-slate-500 text-[10px] hover:bg-slate-50"
          style={{ borderRadius: 4 }}>fit</button>
      </div>

      {/* ── Minimap ── */}
      {layouts.length > 0 && (
        <MiniMap layouts={layouts} tf={tf} dims={dims} containerRef={containerRef} />
      )}

      {/* ── Block tooltip ── */}
      {hoveredLayout && tooltipPos && !hoveredEquip && (
        <BlockTooltip
          layout={hoveredLayout}
          zoneName={zoneNames[hoveredLayout.zone] ?? `Zone ${hoveredLayout.zone}`}
          x={tooltipPos.x}
          y={tooltipPos.y}
        />
      )}

      {/* ── Equipment tooltip ── */}
      {hoveredEquip && equipTooltipPos && (
        <div
          className="absolute pointer-events-none bg-white border border-slate-200 text-[11px] leading-relaxed"
          style={{
            left: equipTooltipPos.x, top: equipTooltipPos.y,
            padding: "6px 10px", borderRadius: 5, zIndex: 40,
            boxShadow: "0 2px 8px rgba(0,0,0,0.12)", maxWidth: 200,
          }}
        >
          <div className="font-bold text-[12px]">{hoveredEquip.id}</div>
          <div className="text-slate-500">{hoveredEquip.operatorName}</div>
          <div className="mt-1 flex items-center gap-1.5">
            <span
              className="w-2 h-2 rounded-sm inline-block"
              style={{ background: EQ_STATUS_COLOR[hoveredEquip.status] ?? "#9ca3af" }}
            />
            <span className="capitalize">{hoveredEquip.status}</span>
          </div>
          <div className="text-slate-600 mt-0.5">Block: {hoveredEquip.currentBlock}</div>
          {hoveredEquip.destinationBlock && (
            <div className="text-slate-600">→ {hoveredEquip.destinationBlock} ({Math.round(hoveredEquip.progress * 100)}%)</div>
          )}
        </div>
      )}

      {/* ── Extra overlay slot ── */}
      {children}
    </div>
  )
}

// ── Minimap ───────────────────────────────────────────────────────────────────

function MiniMap({
  layouts, tf, dims, containerRef,
}: {
  layouts: BlockLayout[]
  tf: { x: number; y: number; scale: number }
  dims: { width: number; height: number }
  containerRef: React.RefObject<HTMLDivElement>
}) {
  const scaleX = (MINIMAP_W - 4) / dims.width
  const scaleY = (MINIMAP_H - 20) / dims.height
  const scale  = Math.min(scaleX, scaleY)

  const el = containerRef.current
  const cw = el ? el.getBoundingClientRect().width  : 0
  const ch = el ? el.getBoundingClientRect().height : 0

  const vpX = -tf.x / tf.scale
  const vpY = -tf.y / tf.scale
  const vpW =  cw   / tf.scale
  const vpH =  ch   / tf.scale

  return (
    <div className="absolute bottom-3 left-3 bg-white border border-slate-300 overflow-hidden"
      style={{ width: MINIMAP_W, height: MINIMAP_H, borderRadius: 4, zIndex: 10 }}>
      <div className="font-bold tracking-wider text-slate-400 border-b border-slate-200"
        style={{ fontSize: 8, padding: "2px 6px" }}>MINIMAP</div>
      <div className="relative" style={{ width: MINIMAP_W, height: MINIMAP_H - 18, overflow: "hidden" }}>
        {layouts.map(l => (
          <div key={l.label} className="absolute bg-slate-300"
            style={{ left: 2 + l.x * scale, top: l.y * scale,
              width: Math.max(2, l.w * scale), height: Math.max(2, l.h * scale) }} />
        ))}
        <div className="absolute border border-red-500 pointer-events-none"
          style={{
            background: "rgba(220,38,38,0.08)",
            left:   Math.max(0, 2 + vpX * scale),
            top:    Math.max(0, vpY * scale),
            width:  Math.min(MINIMAP_W - 4, vpW * scale),
            height: Math.min(MINIMAP_H - 22, vpH * scale),
          }} />
      </div>
    </div>
  )
}
