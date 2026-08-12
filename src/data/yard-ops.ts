export interface Visit {
  id: string; plate: string; carrier: string; driver: string; purpose: string; appt: string;
  queueIn: string|null; checkIn: string|null; atPosition: string|null; served: string|null;
  gateOut: string|null; state: string; turn: number; lane: string; container: string; excl: string|null;
}

export const VISITS: Visit[] = [
  { id:"V-2041", plate:"AF 421 KL", carrier:"Transportes Rivas", driver:"J. Álvarez", purpose:"Inbound drop", appt:"06:00", queueIn:"05:52", checkIn:"05:58", atPosition:"06:03", served:"06:09", gateOut:"06:11", state:"GATE_OUT", turn:19, lane:"R-03", container:"MSCU4419307", excl:null },
  { id:"V-2042", plate:"AC 883 MN", carrier:"Drayage Sur", driver:"P. Molina", purpose:"Customer pickup", appt:"06:15", queueIn:"06:08", checkIn:"06:14", atPosition:"06:18", served:"06:26", gateOut:null, state:"SERVED", turn:18, lane:"S-02", container:"MAEU5508187", excl:null },
  { id:"V-2043", plate:"AD 190 QT", carrier:"Transportes Rivas", driver:"M. Coronel", purpose:"Empty return", appt:"06:30", queueIn:"06:21", checkIn:"06:29", atPosition:"06:34", served:null, gateOut:null, state:"AT_POSITION", turn:12, lane:"E-01", container:"CMAU9963816", excl:null },
  { id:"V-2044", plate:"AE 552 RB", carrier:"Log. Andina", driver:"R. Paz", purpose:"Inbound drop", appt:"06:30", queueIn:"06:27", checkIn:"06:33", atPosition:null, served:null, gateOut:null, state:"CHECKED_IN", turn:9, lane:"R-05", container:"HLXU7959453", excl:"Missing EIR photo set" },
  { id:"V-2045", plate:"AB 774 JD", carrier:"Drayage Sur", driver:"L. Ferreyra", purpose:"Full transfer", appt:"06:45", queueIn:"06:36", checkIn:null, atPosition:null, served:null, gateOut:null, state:"IN_QUEUE", turn:6, lane:"—", container:"COSU3308834", excl:null },
  { id:"V-2046", plate:"AG 018 WX", carrier:"Transportes Rivas", driver:"S. Ojeda", purpose:"Customer pickup", appt:"07:00", queueIn:"06:41", checkIn:null, atPosition:null, served:null, gateOut:null, state:"IN_QUEUE", turn:1, lane:"—", container:"MSCU7742118", excl:"Early — 19 min before window" },
  { id:"V-2047", plate:"AH 336 PL", carrier:"Log. Andina", driver:"D. Barrios", purpose:"Inbound drop", appt:"07:00", queueIn:null, checkIn:null, atPosition:null, served:null, gateOut:null, state:"APPROACHING", turn:0, lane:"—", container:"MAEU2210554", excl:null },
  { id:"V-2048", plate:"AJ 905 ZR", carrier:"Drayage Sur", driver:"N. Vera", purpose:"Empty return", appt:"07:15", queueIn:null, checkIn:null, atPosition:null, served:null, gateOut:null, state:"EXPECTED", turn:0, lane:"—", container:"CMAU4471902", excl:null }
];

export const LANES = [
  { id:"R-01", type:"Receiving", state:"occupied", visit:"V-2039", since:"05:44" },
  { id:"R-02", type:"Receiving", state:"free", visit:null, since:null },
  { id:"R-03", type:"Receiving", state:"clearing", visit:"V-2041", since:"06:03" },
  { id:"R-04", type:"Receiving", state:"free", visit:null, since:null },
  { id:"R-05", type:"Receiving", state:"assigned", visit:"V-2044", since:"06:33" },
  { id:"S-01", type:"Staging", state:"staged", visit:null, since:"05:20" },
  { id:"S-02", type:"Staging", state:"loading", visit:"V-2042", since:"06:18" },
  { id:"E-01", type:"Empty", state:"occupied", visit:"V-2043", since:"06:34" }
];

export const APPOINTMENTS = Array.from({ length: 16 }, (_, i) => {
  const hour = 6 + Math.floor(i / 2);
  const half = i % 2 ? "30" : "00";
  const cap = [4,4,4,4,3,3,3,3,3,3,4,4,4,4,3,3][i];
  const booked = [4,4,4,5,3,2,2,3,1,2,2,3,2,1,1,0][i];
  return { window: String(hour).padStart(2,"0") + ":" + half, capacity: cap, booked, noShow: i===5?1:0, over: booked>cap };
});

export interface Event {
  id: string; time: string; type: string; severity: string; state: string; auto: string;
  title: string; detail: string;
  diff: { cancelled: number; added: number; reassigned: number; frozenKept: number; deltaMin: number; adherence: number };
}

export const EVENTS: Event[] = [
  { id:"EV-7741", time:"06:07", type:"EQUIPMENT_FAILURE", severity:"high", state:"replanned", auto:"Partial", title:"RS-03 hydraulic fault — out of service", detail:"Hyster RS46 reported a hydraulic fault at row C-02. 14 assigned moves redistributed across RS-01 and RS-02; one IMDG retrieval escalated because OP-114 is the sole certified operator on shift.", diff:{cancelled:0,added:2,reassigned:14,frozenKept:5,deltaMin:26,adherence:-4} },
  { id:"EV-7742", time:"06:19", type:"CUSTOMS_CHANNEL_ASSIGNED", severity:"high", state:"replanned", auto:"Auto", title:"MSCU4419307 assigned orange channel", detail:"ARCA selectivity returned naranja. Container routed to inspection bay, reserved staging slot released and backfilled with the next LFD-critical unit. Dwell forecast extended 4.1 days, which re-tiers its slot assignment to deep-and-low.", diff:{cancelled:1,added:3,reassigned:2,frozenKept:0,deltaMin:11,adherence:-1} },
  { id:"EV-7743", time:"06:24", type:"SHIP_DELAY", severity:"medium", state:"suppressed", auto:"Auto", title:"MSC LUCIA V.412E ETA slipped 45 min", detail:"Projected saving from resequencing is 3.2 machine-minutes, below the 8-minute minimum improvement threshold. Replan suppressed by the stability controller; the baseline holds and operators see no change.", diff:{cancelled:0,added:0,reassigned:0,frozenKept:12,deltaMin:3.2,adherence:0} },
  { id:"EV-7744", time:"06:31", type:"DEPOT_REDIRECTION", severity:"medium", state:"replanned", auto:"Auto, notify", title:"CMAU9963816 redirected to Pilar Interior", detail:"CMA CGM redirected the empty return from Dock Sud Depot to Pilar Interior, window 07:30–16:00. Empty-return sequence replanned, driver notified by WhatsApp, depot appointment rebooked.", diff:{cancelled:1,added:1,reassigned:1,frozenKept:0,deltaMin:4,adherence:0} },
  { id:"EV-7745", time:"06:38", type:"CONTAINER_NOT_FOUND", severity:"high", state:"awaiting", auto:"Manual", title:"HLXU7959453 not at B-04-2-7-2", detail:"OP-207 reported the slot empty. Linked order held, guided search raised against Zone B, cycle-count task created. Requires yard manager acknowledgement before the plan is re-cut.", diff:{cancelled:2,added:1,reassigned:0,frozenKept:0,deltaMin:0,adherence:-3} },
  { id:"EV-7746", time:"06:44", type:"APPOINTMENT_NO_SHOW", severity:"low", state:"replanned", auto:"Auto", title:"V-2038 no-show at 06:15 window", detail:"Slot released back to the appointment engine and offered to the 07:00 waitlist. Carrier no-show rate now 6.2% over 30 days.", diff:{cancelled:1,added:0,reassigned:0,frozenKept:0,deltaMin:5,adherence:0} },
  { id:"EV-7747", time:"05:58", type:"DETENTION_BREACH", severity:"high", state:"replanned", auto:"Auto", title:"MSCU4419307 last-free-day passed 6 h ago", detail:"Tariff moved into Tier 2 at $90/day. Retrieval sequenced for 07:10 with the reserved staging slot released to backfill. Accrued $540 posted to the exposure ledger; the empty return window at Depósito Zárate is 07:00–15:00.", diff:{cancelled:0,added:1,reassigned:3,frozenKept:4,deltaMin:6,adherence:-1} },
  { id:"EV-7748", time:"06:38", type:"AUDIT_DISCREPANCY", severity:"medium", state:"awaiting", auto:"Manual", title:"HLXU7959453 not at B-04-2-7-2", detail:"Cycle-count task YA-311 raised. Guided search issued to OP-231 with four ranked candidates. Linked order is held and the retrieval move is cancelled until the map is corrected.", diff:{cancelled:2,added:1,reassigned:0,frozenKept:0,deltaMin:0,adherence:-3} }
];

export const DIFF_ROWS = [
  { moveId:"MV-1032", action:"REASSIGNED", type:"Retrieve to staging", before:"RS-03 · L. Duarte · 06:42", after:"RS-01 · R. Giménez · 06:48", note:"Nearest capable machine; sequence continuity kept." },
  { moveId:"MV-1034", action:"REASSIGNED", type:"Reshuffle", before:"RS-03 · L. Duarte · 06:51", after:"RS-02 · M. Sosa · 06:55", note:"Within reassignment cap (2/hour) for this operator." },
  { moveId:"MV-1039", action:"ADDED", type:"Move to inspection", before:"—", after:"RS-01 · R. Giménez · 07:10", note:"Orange channel: inspection bay booked 10:00." },
  { moveId:"MV-1041", action:"CANCELLED", type:"Retrieve to staging", before:"RS-02 · M. Sosa · 07:04", after:"—", note:"Reserved staging slot released, order re-promised." },
  { moveId:"MV-1044", action:"HELD", type:"Load outbound", before:"RS-01 · R. Giménez · 06:22", after:"unchanged", note:"In progress on the spreader — never cancelled." },
  { moveId:"MV-1047", action:"ADDED", type:"Pre-marshal", before:"—", after:"RS-02 · M. Sosa · 07:22", note:"Idle window absorbs the redistributed load." }
];

export const OPERATOR_TASKS = [
  { id:"MV-1028", seq:"07 of 24", type:"LOAD OUTBOUND", container:"HLXU4406052", from:"B-03-3-4-3", to:"S-01-1-2-1", weight:"27.8 t", size:"40GP", est:"4.6", reason:"Truck booked 08:15; container pre-staged at S-01-1-2-1, 15-min turn protected.", warn:"Heavy unit: 27.8 t — check capacity chart before lift. Tier 3 at row 1 only." }
];

export const TURN_BY_HOUR = [
  { hour:"06", p50:12.1, p90:18.4, visits:9 },
  { hour:"07", p50:14.8, p90:22.6, visits:14 },
  { hour:"08", p50:16.9, p90:26.1, visits:17 },
  { hour:"09", p50:15.2, p90:23.8, visits:15 },
  { hour:"10", p50:12.6, p90:19.0, visits:11 },
  { hour:"11", p50:11.4, p90:17.2, visits:8 },
  { hour:"12", p50:10.9, p90:16.4, visits:6 },
  { hour:"13", p50:11.8, p90:17.9, visits:7 }
];

export const CYCLE_BY_TYPE = [
  { type:"Retrieve to staging", p50:4.6, p90:6.9, n:142 },
  { type:"Load outbound", p50:3.9, p90:5.4, n:96 },
  { type:"Place inbound", p50:5.1, p90:7.6, n:121 },
  { type:"Reshuffle", p50:6.4, p90:9.8, n:38 },
  { type:"Pre-marshal", p50:5.8, p90:8.2, n:17 }
];

export const CAPACITY = [
  { month:"Aug", volume:640, required:28.4, available:32, breach:false },
  { month:"Sep", volume:720, required:31.1, available:32, breach:false },
  { month:"Oct", volume:810, required:35.6, available:32, breach:true },
  { month:"Nov", volume:900, required:40.2, available:32, breach:true },
  { month:"Dec", volume:980, required:44.8, available:40, breach:true },
  { month:"Jan", volume:1050, required:49.1, available:40, breach:true }
];
