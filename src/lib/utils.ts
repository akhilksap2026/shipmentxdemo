import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"
import type { Container } from "@/data/yard-data"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Format a yard slot address from its components.
 * Equivalent to: f"{block_name}{bay_seq:02d}-{row_seq}-{tier_level}"
 *
 * @param blockName  Zone/block letter(s), e.g. "B"
 * @param baySeq     Bay sequence number (zero-padded to 2 digits)
 * @param rowSeq     Row sequence number
 * @param tierLevel  Tier level
 * @returns          Address string, e.g. "B03-2-4"
 *
 * NOTE: do not use this in display components yet — wired in a later step.
 */
/**
 * Determine how many rehandles are needed to access a container in the yard.
 *
 * Address format: "Z-BB-R-S-T"  (e.g. "A-03-1-9-2")
 *   Z  = zone id   (single letter)
 *   BB = block     (zero-padded 2 digits)
 *   R  = row
 *   S  = slot
 *   T  = tier (1 = ground)
 *
 * Blocking containers are all units in the same stack (same Z-BB-R-S) whose
 * tier is strictly above the target tier — they must be moved before the target
 * can be reached.
 */
export function computeRehandleCost(
  containerAddress: string,
  containers: Container[],
): { rehandles: number; accessible: boolean; blocking: Container[] } {
  const parts = containerAddress.split("-")
  if (parts.length < 5) {
    // Unrecognised address format — treat as accessible
    return { rehandles: 0, accessible: true, blocking: [] }
  }
  const [zone, block, row, slot, tierStr] = parts
  const targetTier = parseInt(tierStr, 10)

  const blocking = containers.filter(c => {
    const cp = c.address.split("-")
    return (
      cp.length >= 5 &&
      cp[0] === zone &&
      cp[1] === block &&
      cp[2] === row &&
      cp[3] === slot &&
      parseInt(cp[4], 10) > targetTier
    )
  })

  return {
    rehandles: blocking.length,
    accessible: blocking.length === 0,
    blocking,
  }
}

export function displayAddress(
  blockName: string,
  baySeq: number,
  rowSeq: number,
  tierLevel: number,
): string {
  return `${blockName}${String(baySeq).padStart(2, "0")}-${rowSeq}-${tierLevel}`
}
