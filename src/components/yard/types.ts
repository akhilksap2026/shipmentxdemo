/** Unified container representation used by BlockInteriorView and SlotStackView.
 *  Works for both seed (full data) and live (partial data).
 *  hoursToLFD = -9999 means unavailable (live mode).
 *  priority = "—" means unavailable.
 */
export interface ViewContainer {
  id:          string
  tier:        number
  slotCol:     number   // slot / bay column (1-based)
  rowNum:      number
  zone:        string
  block:       number
  size:        string
  status:      string
  hoursToLFD:  number
  priority:    string
  consignee:   string
  vessel:      string
  carrierName: string
  hazmat:      boolean
  channel:     string
  dwellDays:   number
  grossKg:     number
  whyHere:     string
  seal:        string
  terminal:    string
  empty:       boolean
}
