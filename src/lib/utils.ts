import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"

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
export function displayAddress(
  blockName: string,
  baySeq: number,
  rowSeq: number,
  tierLevel: number,
): string {
  return `${blockName}${String(baySeq).padStart(2, "0")}-${rowSeq}-${tierLevel}`
}
