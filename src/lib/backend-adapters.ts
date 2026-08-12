/**
 * Adapter functions that convert backend API responses (FK-based) into
 * the display-friendly shapes that existing Replit screens consume.
 *
 * These adapters are the BRIDGE — they let existing screens keep working
 * with their current data shapes while reading from the real backend.
 */
import type {
  BackendMove, BackendContainer, BackendYardSlot, BackendJockey, BackendPlanDetail,
} from "./backend-api";

export const REASON_LABELS: Record<string, string> = {
  inbound_placement: "Place inbound",
  outbound_staging: "Stage outbound",
  shuffle: "Reshuffle",
  re_marshal: "Pre-marshal",
  replan_reassignment: "Replan reassignment",
};

export function slotAddress(slot: BackendYardSlot | null | undefined): string {
  if (!slot) return "—";
  return `${slot.block}-${String(slot.bay).padStart(2, "0")}-${slot.row}-${slot.tier}`;
}

export function slotAddressById(slotId: number | null, slots: BackendYardSlot[]): string {
  if (slotId == null) return "—";
  const slot = slots.find(s => s.id === slotId);
  return slotAddress(slot);
}

export function adaptMoveForDisplay(
  m: BackendMove,
  containers: BackendContainer[],
  slots: BackendYardSlot[],
  jockeys: BackendJockey[],
) {
  const container = containers.find(c => c.id === m.container_id);
  const jockey = jockeys.find(j => j.id === m.jockey_id);
  return {
    // Original backend fields preserved
    ...m,
    // Display-friendly additions (what existing screens read)
    containerId: container?.container_number ?? `#${m.container_id}`,
    from: slotAddressById(m.from_slot_id, slots),
    to: slotAddressById(m.to_slot_id, slots),
    operatorName: jockey?.name ?? "Unassigned",
    equipment: "—", // backend doesn't track equipment separately
    typeLabel: REASON_LABELS[m.reason] ?? m.reason,
    stateLabel: m.status.toUpperCase(),
    estMin: m.estimated_duration_min,
    frozen: m.status === "in_progress" || m.status === "done",
    seq: m.sequence_number,
  };
}

export function computePlanDiff(
  oldMoves: BackendMove[],
  newMoves: BackendMove[],
) {
  const oldByContainer = new Map(oldMoves.map(m => [m.container_id, m]));
  const newByContainer = new Map(newMoves.map(m => [m.container_id, m]));

  const added = newMoves.filter(m => !oldByContainer.has(m.container_id));
  const cancelled = oldMoves.filter(m => !newByContainer.has(m.container_id));
  const reassigned = newMoves.filter(m => {
    const old = oldByContainer.get(m.container_id);
    return old && (old.to_slot_id !== m.to_slot_id || old.jockey_id !== m.jockey_id);
  });
  const held = newMoves.filter(m => {
    const old = oldByContainer.get(m.container_id);
    return old && old.to_slot_id === m.to_slot_id && old.jockey_id === m.jockey_id;
  });

  return { added, cancelled, reassigned, held };
}
