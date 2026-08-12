export type ColorMode = "status" | "lfd" | "channel" | "dwell" | "priority" | "rehandle"

export const LEGENDS: Record<ColorMode, [string, string][]> = {
  status:   [["In yard","#9ca3af"],["Staged","#fbbf24"],["Receiving","#4b5563"],["Customs held","#9b1c1c"]],
  lfd:      [["Breached","#9b1c1c"],["≤24 h","#dc2626"],["≤72 h","#f59e0b"],[">72 h","#d1d5db"]],
  channel:  [["Rojo","#9b1c1c"],["Naranja","#f97316"],["Verde","#d1d5db"]],
  dwell:    [["<5 d","#d1d5db"],["5–10 d","#6b7280"],["10–18 d","#374151"],[">18 d","#111827"]],
  priority: [["P1 — critical","#dc2626"],["P2 — high","#f97316"],["P3 — normal","#3b82f6"],["P4 — low","#9ca3af"]],
  rehandle: [["0 rehandles","#16a34a"],["1 rehandle","#f59e0b"],["2+ rehandles","#dc2626"]],
}

export interface ColorInput {
  status:     string
  hoursToLFD: number
  channel:    string
  dwellDays:  number
  priority?:  string
  tier?:      number
}

/**
 * Returns a fill color for a container cell given the current color mode.
 * `sameSlot` is the list of all containers in the same (zone,block,row,slot)
 * — required only for "rehandle" mode.
 */
export function containerColor(
  c:        ColorInput,
  mode:     ColorMode,
  sameSlot?: Array<{ tier: number }>,
): string {
  switch (mode) {
    case "lfd":
      if (c.hoursToLFD < 0)   return "#9b1c1c"
      if (c.hoursToLFD <= 24) return "#dc2626"
      if (c.hoursToLFD <= 72) return "#f59e0b"
      return "#d1d5db"

    case "channel":
      return (
        ({ rojo:"#9b1c1c", naranja:"#f97316", verde:"#d1d5db" } as Record<string,string>)[c.channel]
        ?? "#e5e7eb"
      )

    case "dwell":
      if (c.dwellDays > 18) return "#111827"
      if (c.dwellDays > 10) return "#374151"
      if (c.dwellDays > 4)  return "#6b7280"
      return "#d1d5db"

    case "priority":
      return (
        ({ P1:"#dc2626", P2:"#f97316", P3:"#3b82f6", P4:"#9ca3af" } as Record<string,string>)[c.priority ?? "P4"]
        ?? "#9ca3af"
      )

    case "rehandle": {
      const above = (sameSlot ?? []).filter(x => x.tier > (c.tier ?? 0)).length
      if (above === 0) return "#16a34a"
      if (above === 1) return "#f59e0b"
      return "#dc2626"
    }

    default: // "status"
      return (
        ({ IN_YARD:"#9ca3af", STAGED:"#fbbf24", AT_RECEIVING_LANE:"#4b5563", CUSTOMS_CONTROLLED:"#9b1c1c" } as Record<string,string>)[c.status]
        ?? "#d1d5db"
      )
  }
}
