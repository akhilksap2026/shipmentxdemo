import { describe, it, expect } from "vitest"
import { displayAddress } from "./utils"

describe("displayAddress", () => {
  it('formats a single-digit bay with zero-padding: ("B", 3, 2, 4) → "B03-2-4"', () => {
    expect(displayAddress("B", 3, 2, 4)).toBe("B03-2-4")
  })

  it('formats a double-digit bay without extra padding: ("A", 12, 1, 1) → "A12-1-1"', () => {
    expect(displayAddress("A", 12, 1, 1)).toBe("A12-1-1")
  })

  it('handles zone E with tier 3: ("E", 1, 3, 3) → "E01-3-3"', () => {
    expect(displayAddress("E", 1, 3, 3)).toBe("E01-3-3")
  })
})
