import { useRef, useState, useCallback, useEffect } from "react"
import type { BlockLayout } from "@/lib/yard-layout"
import { getYardDimensions } from "@/lib/yard-layout"
import BlockTooltip from "./BlockTooltip"

interface Props {
  layouts: BlockLayout[]
  selectedBlock: string | null
  onSelectBlock: (label: string) => void
  zoneNames?: Record<string, string>
  children?: React.ReactNode
}

const ZONE_COLOR: Record<string, string> = {
  A: "#e0f2fe", B: "#dbeafe", C: "#f3e8ff", D: "#ffedd5", E: "#ecfccb", S: "#fef3c7", R: "#f3f4f6",
}
const ZONE_BORDER: Record<string, string> = {
  A: "#7dd3fc", B: "#93c5fd", C: "#d8b4fe", D: "#fdba74", E: "#bef264", S: "#fcd34d", R: "#d1d5db",
}

const MINIMAP_W = 128
const MINIMAP_H = 96

export default function PhysicalYardMap({
  layouts,
  selectedBlock,
  onSelectBlock,
  zoneNames = {},
  children,
}: Props) {
  const containerRef  = useRef<HTMLDivElement>(null)
  const dragging      = useRef(false)
  const didDrag       = useRef(false)
  const lastPos       = useRef({ x: 0, y: 0 })

  const [tf,           setTf]           = useState({ x: 16, y: 16, scale: 1 })
  const [hoveredLayout, setHoveredLayout] = useState<BlockLayout | null>(null)
  const [tooltipPos,   setTooltipPos]   = useState<{ x: number; y: number } | null>(null)

  const dims = getYardDimensions(layouts)

  // ── Fit-to-view ────────────────────────────────────────────────────────────
  const fitView = useCallback(() => {
    if (!containerRef.current || layouts.length === 0) return
    const { width: cw, height: ch } = containerRef.current.getBoundingClientRect()
    const scale = Math.min((cw - 32) / dims.width, (ch - 32) / dims.height, 1)
    setTf({ x: 16, y: 16, scale })
  }, [dims.width, dims.height, layouts.length])

  useEffect(() => { fitView() }, [layouts.length]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Zoom at a point ────────────────────────────────────────────────────────
  const zoomAt = useCallback((cx: number, cy: number, factor: number) => {
    setTf(t => {
      const newScale = Math.max(0.15, Math.min(5, t.scale * factor))
      const actual   = newScale / t.scale
      return { scale: newScale, x: cx - (cx - t.x) * actual, y: cy - (cy - t.y) * actual }
    })
  }, [])

  // ── Wheel zoom ─────────────────────────────────────────────────────────────
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

  // ── Drag-to-pan ────────────────────────────────────────────────────────────
  const onMouseDown = (e: React.MouseEvent) => {
    dragging.current  = true
    didDrag.current   = false
    lastPos.current   = { x: e.clientX, y: e.clientY }
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

  // ── Tooltip helpers ────────────────────────────────────────────────────────
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

  return (
    <div
      ref={containerRef}
      className="relative overflow-hidden bg-[#f0f4f8]"
      style={{
        flex: 1,
        minHeight: 0,
        cursor: dragging.current ? "grabbing" : "grab",
        touchAction: "none",
        userSelect: "none",
      }}
      onMouseDown={onMouseDown}
      onMouseMove={onMouseMove}
      onMouseUp={onMouseUp}
      onMouseLeave={() => { onMouseUp(); handleBlockLeave() }}
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
        {/* Terminal label */}
        <div
          className="absolute left-0 right-0 flex items-center px-3 font-bold tracking-widest"
          style={{ top: 0, height: 28, background: "#334155", color: "#fff", fontSize: 10 }}
        >
          TERMINAL / BERTH
        </div>

        {/* Gate label */}
        <div
          className="absolute left-0 right-0 flex items-center px-3 font-bold tracking-widest"
          style={{ bottom: 0, height: 28, background: "#065f46", color: "#fff", fontSize: 10 }}
        >
          GATE
        </div>

        {/* Zone labels */}
        {Array.from(new Set(layouts.map(l => l.zone))).map(zoneId => {
          const first = layouts.find(l => l.zone === zoneId)
          if (!first) return null
          return (
            <div
              key={zoneId}
              className="absolute font-semibold tracking-wider text-slate-400"
              style={{ left: 4, top: first.y - 15, fontSize: 9 }}
            >
              {zoneNames[zoneId] ? zoneNames[zoneId].split(" — ")[0] : `Zone ${zoneId}`}
            </div>
          )
        })}

        {/* Blocks */}
        {layouts.map(layout => {
          const isSelected = selectedBlock === layout.label
          const bg     = ZONE_COLOR[layout.zone]  ?? "#f9fafb"
          const border = ZONE_BORDER[layout.zone] ?? "#9ca3af"
          const barColor =
            layout.occupancyPct > 85 ? "#dc2626" :
            layout.occupancyPct > 70 ? "#f59e0b" : "#16a34a"

          return (
            <div
              key={layout.label}
              className="absolute"
              style={{
                left:     layout.x,
                top:      layout.y,
                width:    layout.w,
                height:   layout.h,
                background: bg,
                border: `2px solid ${isSelected ? "#dc2626" : border}`,
                outline:  isSelected ? "2px solid rgba(220,38,38,0.22)" : "none",
                outlineOffset: 2,
                cursor: "pointer",
              }}
              onClick={e  => { e.stopPropagation(); if (!didDrag.current) onSelectBlock(layout.label) }}
              onMouseDown={e => { if (e.button === 0) e.stopPropagation() }}
              onMouseEnter={e => handleBlockEnter(layout, e)}
              onMouseMove={e  => handleBlockMove(layout, e)}
              onMouseLeave={handleBlockLeave}
            >
              {/* Block label */}
              <div
                className="absolute font-bold text-slate-600 leading-none"
                style={{ top: 2, left: 3, fontSize: 8 }}
              >
                {layout.label}
              </div>

              {/* Occupancy bar at bottom */}
              <div
                className="absolute bottom-0 left-0 right-0"
                style={{ height: 3, background: "rgba(255,255,255,0.55)" }}
              >
                <div style={{ height: "100%", width: `${layout.occupancyPct}%`, background: barColor }} />
              </div>

              {/* Container count */}
              <div
                className="absolute text-slate-400 leading-none"
                style={{ bottom: 5, right: 3, fontSize: 8 }}
              >
                {layout.containerCount}
              </div>
            </div>
          )
        })}
      </div>

      {/* ── Zoom controls ── */}
      <div className="absolute bottom-3 right-3 flex gap-1" style={{ zIndex: 10 }}>
        <button
          onMouseDown={e => e.stopPropagation()}
          onClick={() => { const r = containerRef.current!.getBoundingClientRect(); zoomAt(r.width / 2, r.height / 2, 1.3) }}
          className="w-7 h-7 bg-white border border-slate-300 text-slate-600 text-xs font-bold hover:bg-slate-50 flex items-center justify-center"
          style={{ borderRadius: 4 }}
        >+</button>
        <button
          onMouseDown={e => e.stopPropagation()}
          onClick={() => { const r = containerRef.current!.getBoundingClientRect(); zoomAt(r.width / 2, r.height / 2, 0.77) }}
          className="w-7 h-7 bg-white border border-slate-300 text-slate-600 text-xs font-bold hover:bg-slate-50 flex items-center justify-center"
          style={{ borderRadius: 4 }}
        >−</button>
        <button
          onMouseDown={e => e.stopPropagation()}
          onClick={fitView}
          className="px-2 h-7 bg-white border border-slate-300 text-slate-500 text-[10px] hover:bg-slate-50"
          style={{ borderRadius: 4 }}
        >fit</button>
      </div>

      {/* ── Minimap ── */}
      {layouts.length > 0 && (
        <MiniMap layouts={layouts} tf={tf} dims={dims} containerRef={containerRef} />
      )}

      {/* ── Block tooltip ── */}
      {hoveredLayout && tooltipPos && (
        <BlockTooltip
          layout={hoveredLayout}
          zoneName={zoneNames[hoveredLayout.zone] ?? `Zone ${hoveredLayout.zone}`}
          x={tooltipPos.x}
          y={tooltipPos.y}
        />
      )}

      {/* ── Extra overlay slot ── */}
      {children}
    </div>
  )
}

// ── Minimap ───────────────────────────────────────────────────────────────────

function MiniMap({
  layouts,
  tf,
  dims,
  containerRef,
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
    <div
      className="absolute bottom-3 left-3 bg-white border border-slate-300 overflow-hidden"
      style={{ width: MINIMAP_W, height: MINIMAP_H, borderRadius: 4, zIndex: 10 }}
    >
      <div
        className="font-bold tracking-wider text-slate-400 border-b border-slate-200"
        style={{ fontSize: 8, padding: "2px 6px" }}
      >
        MINIMAP
      </div>
      <div className="relative" style={{ width: MINIMAP_W, height: MINIMAP_H - 18, overflow: "hidden" }}>
        {layouts.map(l => (
          <div
            key={l.label}
            className="absolute bg-slate-300"
            style={{
              left:   2 + l.x * scale,
              top:    l.y * scale,
              width:  Math.max(2, l.w * scale),
              height: Math.max(2, l.h * scale),
            }}
          />
        ))}
        {/* Viewport indicator */}
        <div
          className="absolute border border-red-500 pointer-events-none"
          style={{
            background: "rgba(220,38,38,0.08)",
            left:   Math.max(0, 2 + vpX * scale),
            top:    Math.max(0, vpY * scale),
            width:  Math.min(MINIMAP_W - 4, vpW * scale),
            height: Math.min(MINIMAP_H - 22, vpH * scale),
          }}
        />
      </div>
    </div>
  )
}
