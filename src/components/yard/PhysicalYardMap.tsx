import { useRef, useState, useCallback, useEffect, useMemo } from "react"
import type { BlockLayout, EquipmentPosition, MoveTrail } from "@/lib/yard-layout"
import { getYardDimensions } from "@/lib/yard-layout"
import BlockTooltip from "./BlockTooltip"

interface Props {
  layouts:          BlockLayout[]
  selectedBlock:    string | null
  onSelectBlock:    (label: string) => void
  zoneNames?:       Record<string, string>
  children?:        React.ReactNode
  equipment?:       EquipmentPosition[]
  showEquipment?:   boolean
  moveTrails?:      MoveTrail[]
  showTrails?:      boolean
  congestionByBlock?: Map<string, number>
  showCongestion?:  boolean
  activeMoveBlocks?: Set<string>
}

// ── Zone visual identity ──────────────────────────────────────────────────────

const ZONE_PANEL: Record<string, {
  bg: string; border: string; headerBg: string; headerText: string; blockBg: string; blockBorder: string
}> = {
  A: { bg: "#eff6ff", border: "#93c5fd", headerBg: "#1e40af", headerText: "#fff", blockBg: "#dbeafe", blockBorder: "#93c5fd" },
  B: { bg: "#f0fdf4", border: "#86efac", headerBg: "#15803d", headerText: "#fff", blockBg: "#dcfce7", blockBorder: "#86efac" },
  C: { bg: "#faf5ff", border: "#d8b4fe", headerBg: "#6d28d9", headerText: "#fff", blockBg: "#f3e8ff", blockBorder: "#d8b4fe" },
  D: { bg: "#fff7ed", border: "#fdba74", headerBg: "#c2410c", headerText: "#fff", blockBg: "#ffedd5", blockBorder: "#fdba74" },
  E: { bg: "#f0fdf4", border: "#bbf7d0", headerBg: "#4d7c0f", headerText: "#fff", blockBg: "#dcfce7", blockBorder: "#bbf7d0" },
  S: { bg: "#fefce8", border: "#fde047", headerBg: "#92400e", headerText: "#fff", blockBg: "#fef9c3", blockBorder: "#fde047" },
  R: { bg: "#f8fafc", border: "#cbd5e1", headerBg: "#475569", headerText: "#fff", blockBg: "#f1f5f9", blockBorder: "#cbd5e1" },
}

const ZONE_SUBTITLES: Record<string, string> = {
  A: "Import full · Zone A", B: "Import full · Zone B", C: "Customs controlled",
  D: "Hazmat / IMDG", E: "Empties", S: "Outbound staging", R: "Receiving lanes",
}

const EQ_STATUS_COLOR: Record<string, string> = {
  idle: "#16a34a", moving: "#f59e0b", lifting: "#dc2626", travelling: "#3b82f6",
}

const MINIMAP_W = 148
const MINIMAP_H = 108
const PANEL_PAD_X = 16
const PANEL_PAD_TOP = 36  // space for zone header label
const PANEL_PAD_BOT = 12

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

  const [tf,               setTf]             = useState({ x: 16, y: 16, scale: 1 })
  const [hoveredLayout,    setHoveredLayout]  = useState<BlockLayout | null>(null)
  const [tooltipPos,       setTooltipPos]     = useState<{ x: number; y: number } | null>(null)
  const [hoveredEquip,     setHoveredEquip]   = useState<EquipmentPosition | null>(null)
  const [equipTooltipPos,  setEquipTooltipPos]= useState<{ x: number; y: number } | null>(null)

  const dims = getYardDimensions(layouts)

  // ── Zone panel bounding boxes ─────────────────────────────────────────────
  const zoneBounds = useMemo(() => {
    const map = new Map<string, { x1: number; y1: number; x2: number; y2: number }>()
    for (const l of layouts) {
      const p = map.get(l.zone)
      if (!p) { map.set(l.zone, { x1: l.x, y1: l.y, x2: l.x + l.w, y2: l.y + l.h }); continue }
      map.set(l.zone, {
        x1: Math.min(p.x1, l.x), y1: Math.min(p.y1, l.y),
        x2: Math.max(p.x2, l.x + l.w), y2: Math.max(p.y2, l.y + l.h),
      })
    }
    return map
  }, [layouts])

  // ── Fit-to-view ───────────────────────────────────────────────────────────
  const fitView = useCallback(() => {
    if (!containerRef.current || layouts.length === 0) return
    const { width: cw, height: ch } = containerRef.current.getBoundingClientRect()
    const scale = Math.min((cw - 32) / dims.width, (ch - 32) / dims.height, 1)
    setTf({ x: 16, y: 16, scale })
  }, [dims.width, dims.height, layouts.length])

  useEffect(() => { fitView() }, [layouts.length]) // eslint-disable-line

  // ── Zoom at a point ───────────────────────────────────────────────────────
  const zoomAt = useCallback((cx: number, cy: number, factor: number) => {
    setTf(t => {
      const newScale = Math.max(0.10, Math.min(5, t.scale * factor))
      const actual   = newScale / t.scale
      return { scale: newScale, x: cx - (cx - t.x) * actual, y: cy - (cy - t.y) * actual }
    })
  }, [])

  // ── Wheel zoom ────────────────────────────────────────────────────────────
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

  // ── Drag-to-pan ───────────────────────────────────────────────────────────
  const onMouseDown = (e: React.MouseEvent) => {
    dragging.current = true; didDrag.current = false
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

  // ── Tooltip helpers ───────────────────────────────────────────────────────
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
  function handleBlockLeave() { setHoveredLayout(null); setTooltipPos(null) }

  function handleEquipEnter(eq: EquipmentPosition, e: React.MouseEvent) {
    e.stopPropagation()
    setHoveredEquip(eq)
    const rect = containerRef.current!.getBoundingClientRect()
    setEquipTooltipPos({ x: e.clientX - rect.left + 14, y: e.clientY - rect.top + 4 })
  }
  function handleEquipLeave(e: React.MouseEvent) {
    e.stopPropagation(); setHoveredEquip(null); setEquipTooltipPos(null)
  }

  return (
    <div
      ref={containerRef}
      className="relative overflow-hidden"
      style={{
        flex: 1, minHeight: 0,
        background: "#d4d8dc",   // yard ground colour
        cursor: dragging.current ? "grabbing" : "grab",
        touchAction: "none", userSelect: "none",
      }}
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
          width: dims.width, height: dims.height,
        }}
      >
        {/* ── Terminal / berth strip ── */}
        <div
          className="absolute left-0 right-0 flex items-center justify-center font-black tracking-widest"
          style={{ top: 0, height: 34, background: "#1e293b", color: "#94a3b8", fontSize: 11, letterSpacing: "0.2em" }}
        >
          TERMINAL · BERTH SIDE
        </div>

        {/* ── Gate strip ── */}
        <div
          className="absolute left-0 right-0 flex items-center justify-center font-black tracking-widest"
          style={{ bottom: 0, height: 34, background: "#14532d", color: "#86efac", fontSize: 11, letterSpacing: "0.2em" }}
        >
          GATE · TRUCK ENTRY
        </div>

        {/* ── Zone panels (behind blocks) ── */}
        {Array.from(zoneBounds.entries()).map(([zoneId, b]) => {
          const panel = ZONE_PANEL[zoneId]
          if (!panel) return null
          const px = b.x1 - PANEL_PAD_X
          const py = b.y1 - PANEL_PAD_TOP
          const pw = (b.x2 - b.x1) + PANEL_PAD_X * 2
          const ph = (b.y2 - b.y1) + PANEL_PAD_TOP + PANEL_PAD_BOT
          const name = zoneNames[zoneId]?.split(" — ")[0] ?? `Zone ${zoneId}`
          const sub  = ZONE_SUBTITLES[zoneId] ?? ""

          return (
            <div
              key={`panel-${zoneId}`}
              className="absolute pointer-events-none"
              style={{
                left: px, top: py, width: pw, height: ph,
                background: panel.bg,
                border: `1.5px solid ${panel.border}`,
                borderRadius: 8,
              }}
            >
              {/* Zone header label */}
              <div
                className="absolute top-0 left-0 flex items-center gap-3 px-4"
                style={{
                  height: PANEL_PAD_TOP - 4,
                  background: panel.headerBg,
                  color: panel.headerText,
                  borderRadius: "6px 6px 0 0",
                  width: "100%",
                }}
              >
                <span className="font-black tracking-wider" style={{ fontSize: 16 }}>{name}</span>
                <span className="opacity-70 font-semibold tracking-wide" style={{ fontSize: 12 }}>{sub}</span>
              </div>
            </div>
          )
        })}

        {/* ── Move trails (SVG) ── */}
        {showTrails && moveTrails.length > 0 && (
          <svg className="absolute inset-0 pointer-events-none overflow-visible"
            style={{ left: 0, top: 0, width: dims.width, height: dims.height }}>
            {moveTrails.map((trail, i) => (
              <line key={trail.id}
                x1={trail.fromX} y1={trail.fromY} x2={trail.toX} y2={trail.toY}
                stroke="#94a3b8" strokeWidth={1.5} strokeDasharray="5 4"
                opacity={0.2 + 0.2 * (i / moveTrails.length)}
              />
            ))}
          </svg>
        )}

        {/* ── Blocks ── */}
        {layouts.map(layout => {
          const isSelected  = selectedBlock === layout.label
          const isActive    = activeMoveBlocks?.has(layout.label)
          const panel       = ZONE_PANEL[layout.zone]
          const bg          = panel?.blockBg ?? "#f9fafb"
          const bdr         = panel?.blockBorder ?? "#9ca3af"
          const barColor    =
            layout.occupancyPct > 85 ? "#dc2626" :
            layout.occupancyPct > 70 ? "#f59e0b" : "#16a34a"
          const congestion  = congestionByBlock?.get(layout.label) ?? 0
          const heatTint    =
            showCongestion && congestion > 0.75 ? "rgba(220,38,38,0.20)"
            : showCongestion && congestion > 0.50 ? "rgba(249,115,22,0.16)"
            : showCongestion && congestion > 0.25 ? "rgba(245,158,11,0.12)"
            : null

          return (
            <div
              key={layout.label}
              className="absolute"
              style={{
                left: layout.x, top: layout.y, width: layout.w, height: layout.h,
                background: bg,
                border: `2px solid ${isSelected ? "#dc2626" : isActive ? "#f59e0b" : bdr}`,
                outline: isSelected ? "3px solid rgba(220,38,38,0.25)"
                  : isActive ? "2px solid rgba(245,158,11,0.4)" : "none",
                outlineOffset: 2,
                borderRadius: 4,
                cursor: "pointer",
                transition: "border-color 300ms, outline 300ms",
              }}
              onClick={e => { e.stopPropagation(); if (!didDrag.current) onSelectBlock(layout.label) }}
              onMouseDown={e => { if (e.button === 0) e.stopPropagation() }}
              onMouseEnter={e => handleBlockEnter(layout, e)}
              onMouseMove={e  => handleBlockMove(layout, e)}
              onMouseLeave={handleBlockLeave}
            >
              {heatTint && <div className="absolute inset-0 pointer-events-none rounded" style={{ background: heatTint }} />}

              {/* Block label — large, same weight as page title */}
              <div className="absolute font-black tracking-wider leading-none"
                style={{ top: 7, left: 8, fontSize: 18, color: "#1e293b" }}>
                {layout.label}
              </div>

              {/* Congestion % */}
              {showCongestion && congestion > 0.25 && (
                <div className="absolute leading-none font-bold"
                  style={{ top: 8, right: 8, fontSize: 14, color: "#dc2626" }}>
                  {Math.round(congestion * 100)}%
                </div>
              )}

              {/* Occupancy fill bar — left side vertical */}
              <div className="absolute left-0 top-0 bottom-0 w-1.5 rounded-l" style={{ background: "rgba(255,255,255,0.4)" }}>
                <div
                  className="absolute bottom-0 left-0 right-0 rounded-l"
                  style={{ height: `${layout.occupancyPct}%`, background: barColor }}
                />
              </div>

              {/* Container count + occupancy */}
              <div
                className="absolute font-bold tabular leading-none"
                style={{ bottom: 8, left: 10, fontSize: 15, color: "#374151" }}
              >
                {layout.containerCount}
                <span style={{ fontSize: 12, color: "#9ca3af", marginLeft: 3 }}>/ {layout.capacity}</span>
              </div>

              <div className="absolute font-bold leading-none"
                style={{ bottom: 8, right: 8, fontSize: 15, color: barColor }}>
                {layout.occupancyPct}%
              </div>

              {/* Top container ID preview */}
              {layout.topContainerIds.length > 0 && (
                <div
                  className="absolute font-mono truncate leading-none"
                  style={{ top: 30, left: 8, right: 8, fontSize: 11, color: "#64748b" }}
                >
                  {layout.topContainerIds[0]}
                </div>
              )}
            </div>
          )
        })}

        {/* ── Equipment icons ── */}
        {showEquipment && equipment.map(eq => {
          const color = eq.type === "reach-stacker" ? "#374151"
            : eq.type === "empty-handler" ? "#9333ea"
            : EQ_STATUS_COLOR[eq.status] ?? "#9ca3af"
          const SZ = 14

          return (
            <div
              key={eq.id}
              className="absolute flex items-center justify-center"
              style={{
                left: eq.x - SZ / 2, top: eq.y - SZ / 2, width: SZ, height: SZ,
                background: color,
                border: "2px solid rgba(255,255,255,0.9)",
                borderRadius: eq.type === "jockey" ? "50%" : eq.type === "empty-handler" ? 0 : 3,
                transform: eq.type === "empty-handler" ? "rotate(45deg)" : undefined,
                cursor: "pointer", zIndex: 20,
                transition: "left 1000ms linear, top 1000ms linear",
                boxShadow: "0 1px 4px rgba(0,0,0,0.25)",
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
          onClick={() => { const r = containerRef.current!.getBoundingClientRect(); zoomAt(r.width/2, r.height/2, 1.25) }}
          className="w-8 h-8 bg-white border border-slate-300 text-slate-600 text-sm font-bold hover:bg-slate-50 flex items-center justify-center shadow-sm"
          style={{ borderRadius: 5 }}>+</button>
        <button onMouseDown={e => e.stopPropagation()}
          onClick={() => { const r = containerRef.current!.getBoundingClientRect(); zoomAt(r.width/2, r.height/2, 0.8) }}
          className="w-8 h-8 bg-white border border-slate-300 text-slate-600 text-sm font-bold hover:bg-slate-50 flex items-center justify-center shadow-sm"
          style={{ borderRadius: 5 }}>−</button>
        <button onMouseDown={e => e.stopPropagation()} onClick={fitView}
          className="px-2.5 h-8 bg-white border border-slate-300 text-slate-500 text-[10px] font-semibold hover:bg-slate-50 shadow-sm"
          style={{ borderRadius: 5 }}>fit</button>
      </div>

      {/* ── Minimap ── */}
      {layouts.length > 0 && (
        <MiniMap layouts={layouts} tf={tf} dims={dims} containerRef={containerRef} zoneBounds={zoneBounds} />
      )}

      {/* ── Block tooltip ── */}
      {hoveredLayout && tooltipPos && !hoveredEquip && (
        <BlockTooltip
          layout={hoveredLayout}
          zoneName={zoneNames[hoveredLayout.zone] ?? `Zone ${hoveredLayout.zone}`}
          x={tooltipPos.x} y={tooltipPos.y}
        />
      )}

      {/* ── Equipment tooltip ── */}
      {hoveredEquip && equipTooltipPos && (
        <div className="absolute pointer-events-none bg-white border border-slate-200 text-[11px] leading-relaxed"
          style={{ left: equipTooltipPos.x, top: equipTooltipPos.y, padding: "6px 10px",
            borderRadius: 5, zIndex: 40, boxShadow: "0 2px 8px rgba(0,0,0,0.12)", maxWidth: 200 }}>
          <div className="font-bold text-[12px]">{hoveredEquip.id}</div>
          <div className="text-slate-500">{hoveredEquip.operatorName}</div>
          <div className="mt-1 flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-sm inline-block"
              style={{ background: EQ_STATUS_COLOR[hoveredEquip.status] ?? "#9ca3af" }} />
            <span className="capitalize">{hoveredEquip.status}</span>
          </div>
          <div className="text-slate-600 mt-0.5">Block: {hoveredEquip.currentBlock}</div>
          {hoveredEquip.destinationBlock && (
            <div className="text-slate-600">→ {hoveredEquip.destinationBlock} ({Math.round(hoveredEquip.progress * 100)}%)</div>
          )}
        </div>
      )}

      {children}
    </div>
  )
}

// ── Minimap ───────────────────────────────────────────────────────────────────

function MiniMap({
  layouts, tf, dims, containerRef, zoneBounds,
}: {
  layouts:    BlockLayout[]
  tf:         { x: number; y: number; scale: number }
  dims:       { width: number; height: number }
  containerRef: React.RefObject<HTMLDivElement>
  zoneBounds: Map<string, { x1: number; y1: number; x2: number; y2: number }>
}) {
  const scaleX = (MINIMAP_W - 4) / dims.width
  const scaleY = (MINIMAP_H - 20) / dims.height
  const scale  = Math.min(scaleX, scaleY)

  const el = containerRef.current
  const cw = el ? el.getBoundingClientRect().width  : 0
  const ch = el ? el.getBoundingClientRect().height : 0
  const vpX = -tf.x / tf.scale
  const vpY = -tf.y / tf.scale
  const vpW =  cw / tf.scale
  const vpH =  ch / tf.scale

  const ZONE_MINI_COLOR: Record<string, string> = {
    A: "#93c5fd", B: "#86efac", C: "#d8b4fe", D: "#fdba74", E: "#bbf7d0", S: "#fde047", R: "#cbd5e1",
  }

  return (
    <div className="absolute bottom-3 left-3 bg-white border border-slate-300 overflow-hidden shadow-sm"
      style={{ width: MINIMAP_W, height: MINIMAP_H, borderRadius: 5, zIndex: 10 }}>
      <div className="font-bold tracking-wider text-slate-400 border-b border-slate-200"
        style={{ fontSize: 8, padding: "2px 6px" }}>MINIMAP</div>
      <div className="relative" style={{ width: MINIMAP_W, height: MINIMAP_H - 18, overflow: "hidden", background: "#d4d8dc" }}>
        {/* Zone panels in minimap */}
        {Array.from(zoneBounds.entries()).map(([zoneId, b]) => (
          <div key={`mini-zone-${zoneId}`} className="absolute"
            style={{
              left:   2 + b.x1 * scale,
              top:    b.y1 * scale,
              width:  Math.max(3, (b.x2 - b.x1) * scale),
              height: Math.max(3, (b.y2 - b.y1) * scale),
              background: ZONE_MINI_COLOR[zoneId] ?? "#e5e7eb",
              borderRadius: 1,
              opacity: 0.7,
            }} />
        ))}
        {/* Viewport rect */}
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
