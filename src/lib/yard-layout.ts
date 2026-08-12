import type { Container, Zone, Move } from "@/data/yard-data"

export interface BlockLayout {
  zone: string
  block: number
  label: string
  x: number
  y: number
  w: number
  h: number
  occupancyPct: number
  containerCount: number
  capacity: number
  topContainerIds: string[]
}

// ── Layout constants ──────────────────────────────────────────────────────────

const SLOT_WIDTH_PX   = 36   // was 10 — each slot cell
const ROW_HEIGHT_PX   = 55   // was 14 — each row of slots
const LANE_WIDTH_PX   = 52   // aisle between block rows within a zone
const BLOCK_MARGIN_PX = 14   // margin between adjacent blocks in same row
const YARD_WIDTH      = 2400 // used only for live layout

/**
 * Spatial zone configuration — determines where each zone sits on the canvas.
 * xOrigin/yOrigin = top-left of the first block in the zone.
 * cols = blocks per row within the zone.
 *
 * Layout (bird's eye, terminal at top, gate at bottom):
 *
 *  [TERMINAL / BERTH ══════════════════════════════════════════════]
 *
 *  Zone C (customs)   │   Zone A (import full, 6 blocks)   │ Zone D (hazmat)
 *  Zone E (empties)   │   Zone B (import full, 6 blocks)
 *                     │   Zone S (staging, 1 block)
 *  Zone R (receiving lanes, 1 block near gate)
 *
 *  [GATE ══════════════════════════════════════════════════════════]
 */
const ZONE_LAYOUT: Record<string, { x: number; y: number; cols: number }> = {
  C: { x: 50,   y: 80,   cols: 2 },   // Customs      — upper left
  A: { x: 730,  y: 80,   cols: 3 },   // Import full  — upper center
  B: { x: 730,  y: 530,  cols: 3 },   // Import full  — lower center (below A)
  D: { x: 1930, y: 80,   cols: 1 },   // Hazmat       — upper right, isolated
  E: { x: 50,   y: 420,  cols: 2 },   // Empties      — lower left  (below C)
  S: { x: 730,  y: 980,  cols: 5 },   // Staging      — near gate
  R: { x: 50,   y: 1090, cols: 10 },  // Receiving    — near gate, wide strip
}

export function computeBlockLayouts(
  zones: Zone[],
  containers: Container[],
): BlockLayout[] {
  const layouts: BlockLayout[] = []

  for (const zone of zones) {
    const cfg = ZONE_LAYOUT[zone.id]
    if (!cfg) continue

    const blockW = zone.slots * SLOT_WIDTH_PX
    const blockH = zone.rows  * ROW_HEIGHT_PX

    for (let b = 0; b < zone.blocks; b++) {
      const col = b % cfg.cols
      const row = Math.floor(b / cfg.cols)
      const x   = cfg.x + col * (blockW + BLOCK_MARGIN_PX)
      const y   = cfg.y + row * (blockH + LANE_WIDTH_PX)

      const blockContainers = containers.filter(
        c => c.zone === zone.id && c.block === b + 1,
      )
      const capacity     = zone.rows * zone.slots * zone.maxTiers
      const occupancyPct = capacity > 0
        ? Math.round((blockContainers.length / capacity) * 100)
        : 0

      layouts.push({
        zone:    zone.id,
        block:   b + 1,
        label:   `${zone.id}-${String(b + 1).padStart(2, "0")}`,
        x, y, w: blockW, h: blockH,
        occupancyPct,
        containerCount: blockContainers.length,
        capacity,
        topContainerIds: blockContainers.slice(0, 3).map(c => c.id),
      })
    }
  }

  return layouts
}

// ── Equipment overlay ─────────────────────────────────────────────────────────

export interface EquipmentPosition {
  id:               string
  type:             "jockey" | "reach-stacker" | "empty-handler"
  name:             string
  operatorName:     string
  x:                number  // layout-space centre of currentBlock
  y:                number
  status:           "idle" | "moving" | "lifting" | "travelling"
  currentBlock:     string
  destinationBlock?: string
  progress:         number  // 0–1
}

const HOME_BLOCKS: Record<string, string> = {
  "RS-01": "A-01", "RS-02": "A-03", "RS-03": "B-01", "EH-01": "E-01",
}

function blockCenter(label: string, layouts: BlockLayout[]): { x: number; y: number } {
  const l = layouts.find(l => l.label === label)
  return l ? { x: l.x + l.w / 2, y: l.y + l.h / 2 } : { x: 120, y: 120 }
}

function parseBlock(address: string): string {
  return address.match(/^([A-Z]-\d+)/)?.[1] ?? ""
}

export function computeEquipmentPositions(
  operators: Array<{ id: string; name: string; equipment: string; status: string }>,
  moves: Move[],
  layouts: BlockLayout[],
): EquipmentPosition[] {
  return operators
    .filter(op => op.status === "on shift")
    .map((op, idx) => {
      const type: EquipmentPosition["type"] =
        op.equipment.startsWith("RS") ? "reach-stacker"
        : op.equipment.startsWith("EH") ? "empty-handler"
        : "jockey"

      const inProg   = moves.find(m => m.operator === op.id && m.state === "IN_PROGRESS")
      const assigned = moves.find(m => m.operator === op.id && m.state === "ASSIGNED")

      let status: EquipmentPosition["status"] = "idle"
      let currentBlock = HOME_BLOCKS[op.equipment] ?? "A-01"
      let destinationBlock: string | undefined
      const progress = assigned ? 0.4 : 0

      if (inProg) {
        currentBlock = parseBlock(inProg.from) || currentBlock
        status = "lifting"
      } else if (assigned) {
        currentBlock        = parseBlock(assigned.from) || currentBlock
        destinationBlock    = parseBlock(assigned.to) || undefined
        status = "travelling"
      }

      const { x, y } = blockCenter(currentBlock, layouts)
      // Small spread so multiple units in same block don't completely overlap
      const spread = (idx % 3) * 6 - 6

      return {
        id: op.equipment, type, name: op.equipment, operatorName: op.name,
        x: x + spread, y: y + (idx % 2 === 0 ? 3 : -3),
        status, currentBlock, destinationBlock, progress,
      }
    })
}

// ── Move trails ───────────────────────────────────────────────────────────────

export interface MoveTrail {
  id:          string
  fromBlock:   string
  toBlock:     string
  fromX:       number
  fromY:       number
  toX:         number
  toY:         number
  completedAt: string
  operatorId:  string
}

export function computeMoveTrails(moves: Move[], layouts: BlockLayout[]): MoveTrail[] {
  return moves
    .filter(m => m.state === "DONE")
    .slice(-10)
    .map(m => {
      const from = parseBlock(m.from)
      const to   = parseBlock(m.to)
      const fPos = blockCenter(from, layouts)
      const tPos = blockCenter(to, layouts)
      return {
        id: m.id, fromBlock: from, toBlock: to,
        fromX: fPos.x, fromY: fPos.y,
        toX:   tPos.x, toY:   tPos.y,
        completedAt: m.end,
        operatorId:  m.operator,
      }
    })
}

// (BlockLayout interface and computeBlockLayouts moved above equipment section)

/** Compute BlockLayouts from live backend block summaries.
 *  Parses zone letter from block ID (e.g. "A" from "A-01") and uses
 *  the matching Zone definition for physical dimensions.
 */
export function computeLiveBlockLayouts(
  liveBlocks: Array<{ blk: string; occupied: number; total: number; pct: number }>,
  zones: Zone[],
): BlockLayout[] {
  const byZone = new Map<string, typeof liveBlocks>()
  for (const b of liveBlocks) {
    const zoneId = b.blk[0] ?? "?"
    if (!byZone.has(zoneId)) byZone.set(zoneId, [])
    byZone.get(zoneId)!.push(b)
  }

  const layouts: BlockLayout[] = []
  let currentY = 32

  const liveZoneOrder = (id: string) =>
    ({ C: 0, A: 1, B: 2, D: 3, E: 4, S: 5, R: 6 } as Record<string, number>)[id] ?? 99
  const sortedZoneIds = Array.from(byZone.keys()).sort(
    (a, b) => liveZoneOrder(a) - liveZoneOrder(b),
  )

  for (const zoneId of sortedZoneIds) {
    const zone = zones.find(z => z.id === zoneId)
    const slots    = zone?.slots    ?? 10
    const rows     = zone?.rows     ?? 3
    const maxTiers = zone?.maxTiers ?? 4

    const blockW = slots * SLOT_WIDTH_PX
    const blockH = rows  * ROW_HEIGHT_PX
    const blocksPerRow = Math.max(
      1,
      Math.floor((YARD_WIDTH - LANE_WIDTH_PX) / (blockW + BLOCK_MARGIN_PX)),
    )

    const zoneBlocks = byZone.get(zoneId)!
    zoneBlocks.forEach((b, idx) => {
      const rowInZone = Math.floor(idx / blocksPerRow)
      const colInRow  = idx % blocksPerRow
      const x = LANE_WIDTH_PX + colInRow * (blockW + BLOCK_MARGIN_PX)
      const y = currentY + rowInZone * (blockH + LANE_WIDTH_PX)
      const capacity = rows * slots * maxTiers

      layouts.push({
        zone: zoneId, block: idx + 1, label: b.blk,
        x, y, w: blockW, h: blockH,
        occupancyPct: b.pct, containerCount: b.occupied,
        capacity, topContainerIds: [],
      })
    })

    const rowsNeeded = Math.ceil(zoneBlocks.length / blocksPerRow)
    currentY += rowsNeeded * (blockH + LANE_WIDTH_PX) + LANE_WIDTH_PX
  }

  return layouts
}

export function getYardDimensions(
  layouts: BlockLayout[],
): { width: number; height: number } {
  if (layouts.length === 0) return { width: YARD_WIDTH, height: 600 }
  const maxX = Math.max(...layouts.map(l => l.x + l.w))
  const maxY = Math.max(...layouts.map(l => l.y + l.h))
  return { width: maxX + LANE_WIDTH_PX, height: maxY + LANE_WIDTH_PX + 40 }
}
