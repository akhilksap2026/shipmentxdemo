import { describe, it, expect } from "vitest"
import { buildRetrievalMoves, type Container } from "./yard-data"

// Minimal container factory — only the fields buildRetrievalMoves reads
function makeContainer(overrides: Partial<Container> & Pick<Container, "id" | "hoursToLFD" | "status" | "empty" | "address" | "priority">): Container {
  return {
    zone: "B", block: 1, row: 1, slot: 1, tier: 1,
    size: "40GP", grossKg: 15000,
    carrier: "MSCU", carrierName: "MSC",
    consignee: "Test Co", vessel: "TEST V.1", terminal: "Terminal 1",
    hazmat: false, imdg: null, channel: "verde",
    dwellDays: 5, seal: "AR123456", whyHere: "test",
    ...overrides,
  }
}

const IN_YARD  = "IN_YARD"
const STAGED   = "STAGED"

describe("buildRetrievalMoves", () => {
  it("returns an empty array when no containers qualify", () => {
    const containers: Container[] = [
      makeContainer({ id: "C1", hoursToLFD: 120, status: IN_YARD,  empty: false, address: "B-01-1-1-1", priority: "P2" }),
      makeContainer({ id: "C2", hoursToLFD: 48,  status: STAGED,   empty: false, address: "B-01-1-2-1", priority: "P2" }),
      makeContainer({ id: "C3", hoursToLFD: 24,  status: IN_YARD,  empty: true,  address: "E-01-1-1-1", priority: "P3" }),
    ]
    expect(buildRetrievalMoves(containers)).toHaveLength(0)
  })

  it("includes only IN_YARD, non-empty containers with hoursToLFD ≤ 72", () => {
    const containers: Container[] = [
      makeContainer({ id: "MATCH1", hoursToLFD: 12,  status: IN_YARD, empty: false, address: "B-01-1-1-1", priority: "P1" }),
      makeContainer({ id: "MATCH2", hoursToLFD: 72,  status: IN_YARD, empty: false, address: "B-01-1-2-1", priority: "P2" }),
      makeContainer({ id: "SKIP1",  hoursToLFD: 73,  status: IN_YARD, empty: false, address: "B-01-1-3-1", priority: "P2" }),  // > 72
      makeContainer({ id: "SKIP2",  hoursToLFD: 48,  status: STAGED,  empty: false, address: "B-01-1-4-1", priority: "P2" }),  // wrong status
      makeContainer({ id: "SKIP3",  hoursToLFD: 6,   status: IN_YARD, empty: true,  address: "E-01-1-1-1", priority: "P3" }),  // empty
    ]
    const moves = buildRetrievalMoves(containers)
    expect(moves).toHaveLength(2)
    const ids = moves.map(m => m.containerId)
    expect(ids).toContain("MATCH1")
    expect(ids).toContain("MATCH2")
  })

  it("sorts by hoursToLFD ascending (most urgent first)", () => {
    const containers: Container[] = [
      makeContainer({ id: "C_60", hoursToLFD: 60, status: IN_YARD, empty: false, address: "B-01-1-3-1", priority: "P2" }),
      makeContainer({ id: "C_12", hoursToLFD: 12, status: IN_YARD, empty: false, address: "B-01-1-1-1", priority: "P1" }),
      makeContainer({ id: "C_36", hoursToLFD: 36, status: IN_YARD, empty: false, address: "B-01-1-2-1", priority: "P2" }),
    ]
    const moves = buildRetrievalMoves(containers)
    expect(moves.map(m => m.containerId)).toEqual(["C_12", "C_36", "C_60"])
  })

  it("sets type to RETRIEVE_STAGE", () => {
    const containers: Container[] = [
      makeContainer({ id: "C1", hoursToLFD: 48, status: IN_YARD, empty: false, address: "B-01-1-1-1", priority: "P2" }),
    ]
    const [move] = buildRetrievalMoves(containers)
    expect(move.type).toBe("RETRIEVE_STAGE")
  })

  it("sets from = container address and to = empty string (destination TBD)", () => {
    const containers: Container[] = [
      makeContainer({ id: "C1", hoursToLFD: 48, status: IN_YARD, empty: false, address: "B-02-3-4-2", priority: "P2" }),
    ]
    const [move] = buildRetrievalMoves(containers)
    expect(move.from).toBe("B-02-3-4-2")
    expect(move.to).toBe("")
  })

  it("sets reason_text with the correct LFD hours and message", () => {
    const containers: Container[] = [
      makeContainer({ id: "C1", hoursToLFD: 36, status: IN_YARD, empty: false, address: "B-01-1-1-1", priority: "P2" }),
    ]
    const [move] = buildRetrievalMoves(containers)
    expect(move.reason_text).toBe("LFD in 36h — retrieval sequenced to protect free time.")
    expect(move.reason).toBe(move.reason_text)
  })

  it("clamps negative hoursToLFD to 0 in the reason string", () => {
    const containers: Container[] = [
      makeContainer({ id: "C1", hoursToLFD: -5, status: IN_YARD, empty: false, address: "B-01-1-1-1", priority: "P1" }),
    ]
    const [move] = buildRetrievalMoves(containers)
    expect(move.reason_text).toBe("LFD in 0h — retrieval sequenced to protect free time.")
  })

  it("assigns sequential IDs starting at RTV-0001", () => {
    const containers: Container[] = [
      makeContainer({ id: "C1", hoursToLFD: 10, status: IN_YARD, empty: false, address: "B-01-1-1-1", priority: "P1" }),
      makeContainer({ id: "C2", hoursToLFD: 20, status: IN_YARD, empty: false, address: "B-01-1-2-1", priority: "P2" }),
    ]
    const moves = buildRetrievalMoves(containers)
    expect(moves[0].id).toBe("RTV-0001")
    expect(moves[1].id).toBe("RTV-0002")
  })

  it("sets state = PLANNED and frozen = false on all retrieval moves", () => {
    const containers: Container[] = [
      makeContainer({ id: "C1", hoursToLFD: 24, status: IN_YARD, empty: false, address: "B-01-1-1-1", priority: "P2" }),
    ]
    const [move] = buildRetrievalMoves(containers)
    expect(move.state).toBe("PLANNED")
    expect(move.frozen).toBe(false)
  })
})
