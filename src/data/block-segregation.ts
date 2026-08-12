export interface SegregationZone {
  bayStart: number
  bayEnd:   number
  type:     string
  tint:     string // CSS background color
}

export const BLOCK_SEGREGATION: Record<string, SegregationZone[]> = {
  "A-01": [
    { bayStart: 1,  bayEnd: 2,  type: "Reefer",           tint: "#dbeafe" },
    { bayStart: 3,  bayEnd: 8,  type: "Dry Import",        tint: "transparent" },
    { bayStart: 9,  bayEnd: 10, type: "Outbound Staging",  tint: "#fef3c7" },
  ],
  "A-02": [
    { bayStart: 1,  bayEnd: 10, type: "Dry Import",        tint: "transparent" },
  ],
  "A-03": [
    { bayStart: 1,  bayEnd: 3,  type: "Reefer",            tint: "#dbeafe" },
    { bayStart: 4,  bayEnd: 10, type: "Dry Import",        tint: "transparent" },
  ],
  "B-01": [
    { bayStart: 1,  bayEnd: 5,  type: "Dry Import",        tint: "transparent" },
    { bayStart: 6,  bayEnd: 8,  type: "Customs Hold",      tint: "#f3e8ff" },
    { bayStart: 9,  bayEnd: 10, type: "Inspection",        tint: "#ffedd5" },
  ],
  "B-02": [
    { bayStart: 1,  bayEnd: 10, type: "Dry Import",        tint: "transparent" },
  ],
  "C-01": [
    { bayStart: 1,  bayEnd: 8,  type: "Customs Controlled",tint: "#f3e8ff" },
  ],
  "C-02": [
    { bayStart: 1,  bayEnd: 8,  type: "Customs Controlled",tint: "#f3e8ff" },
  ],
  "D-01": [
    { bayStart: 1,  bayEnd: 6,  type: "Hazmat IMDG",       tint: "#ffedd5" },
  ],
  "D-02": [
    { bayStart: 1,  bayEnd: 6,  type: "Hazmat IMDG",       tint: "#ffedd5" },
  ],
  "E-01": [
    { bayStart: 1,  bayEnd: 10, type: "Empties",           tint: "#ecfccb" },
  ],
  "E-02": [
    { bayStart: 1,  bayEnd: 10, type: "Empties",           tint: "#ecfccb" },
  ],
  "E-03": [
    { bayStart: 1,  bayEnd: 5,  type: "Empties",           tint: "#ecfccb" },
    { bayStart: 6,  bayEnd: 10, type: "Damaged / Repair",  tint: "#fee2e2" },
  ],
  "S-01": [
    { bayStart: 1,  bayEnd: 10, type: "Outbound Staging",  tint: "#fef3c7" },
  ],
  "R-01": [
    { bayStart: 1,  bayEnd: 12, type: "Receiving Lane",    tint: "#f3f4f6" },
  ],
}

export function getSegregation(blockLabel: string): SegregationZone[] {
  return BLOCK_SEGREGATION[blockLabel]
    ?? [{ bayStart: 1, bayEnd: 99, type: "General", tint: "transparent" }]
}
