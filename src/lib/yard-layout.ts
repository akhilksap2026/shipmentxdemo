import type { Container, Zone } from "@/data/yard-data"

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

const SLOT_WIDTH_PX  = 10
const ROW_HEIGHT_PX  = 14
const LANE_WIDTH_PX  = 44
const BLOCK_MARGIN_PX = 6
const YARD_WIDTH     = 1400

function zoneOrder(zoneId: string): number {
  return ({ C: 0, A: 1, B: 2, D: 3, E: 4, S: 5, R: 6 } as Record<string, number>)[zoneId] ?? 99
}

export function computeBlockLayouts(
  zones: Zone[],
  containers: Container[],
): BlockLayout[] {
  const layouts: BlockLayout[] = []
  let currentY = 32 // space for terminal label

  const sortedZones = [...zones]
    .filter(z => !"RS".includes(z.id))
    .sort((a, b) => zoneOrder(a.id) - zoneOrder(b.id))

  for (const zone of sortedZones) {
    const blockW = zone.slots * SLOT_WIDTH_PX
    const blockH = zone.rows  * ROW_HEIGHT_PX
    const blocksPerRow = Math.max(
      1,
      Math.floor((YARD_WIDTH - LANE_WIDTH_PX) / (blockW + BLOCK_MARGIN_PX)),
    )

    for (let b = 0; b < zone.blocks; b++) {
      const rowInZone = Math.floor(b / blocksPerRow)
      const colInRow  = b % blocksPerRow
      const x = LANE_WIDTH_PX + colInRow * (blockW + BLOCK_MARGIN_PX)
      const y = currentY + rowInZone * (blockH + LANE_WIDTH_PX)

      const blockContainers = containers.filter(
        c => c.zone === zone.id && c.block === b + 1,
      )
      const capacity     = zone.rows * zone.slots * zone.maxTiers
      const occupancyPct = capacity > 0
        ? Math.round((blockContainers.length / capacity) * 100)
        : 0

      layouts.push({
        zone: zone.id,
        block: b + 1,
        label: `${zone.id}-${String(b + 1).padStart(2, "0")}`,
        x, y, w: blockW, h: blockH,
        occupancyPct,
        containerCount: blockContainers.length,
        capacity,
        topContainerIds: blockContainers.slice(0, 3).map(c => c.id),
      })
    }

    const rowsNeeded = Math.ceil(zone.blocks / blocksPerRow)
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
