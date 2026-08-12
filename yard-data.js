// Seed data for the YOS prototype. Deterministic — same output every load.
const rnd = (() => { let s = 0x5f3a91; return () => { s |= 0; s = s + 0x6D2B79F5 | 0; let t = Math.imul(s ^ s >>> 15, 1 | s); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; })();
const pick = a => a[Math.floor(rnd() * a.length)];
const int = (a, b) => a + Math.floor(rnd() * (b - a + 1));

// ISO 6346 check digit
const LETTER = {};
"ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("").forEach((c, i) => { let v = 10 + i; if (v >= 11) v += Math.floor((v - 11) / 10) * 0; LETTER[c] = [10,12,13,14,15,16,17,18,19,20,21,23,24,25,26,27,28,29,30,31,32,34,35,36,37,38][i]; });
function checkDigit(pfx) {
  let sum = 0;
  for (let i = 0; i < 10; i++) {
    const ch = pfx[i];
    const v = /[0-9]/.test(ch) ? +ch : LETTER[ch];
    sum += v * Math.pow(2, i);
  }
  const cd = sum % 11;
  return cd === 10 ? 0 : cd;
}
function makeId(owner) {
  const serial = String(int(100000, 999999));
  const pfx = owner + "U" + serial;
  return pfx + checkDigit(pfx);
}

export const CARRIERS = [
  { code: "MSCU", name: "MSC", freeDays: 7, basis: "calendar", tiers: [[8,14,45],[15,21,90],[22,99,150]] },
  { code: "MAEU", name: "Maersk", freeDays: 10, basis: "working", tiers: [[11,17,40],[18,24,85],[25,99,140]] },
  { code: "CMAU", name: "CMA CGM", freeDays: 7, basis: "calendar", tiers: [[8,14,50],[15,21,95],[22,99,160]] },
  { code: "HLXU", name: "Hapag-Lloyd", freeDays: 5, basis: "calendar", tiers: [[6,12,55],[13,20,100],[21,99,165]] },
  { code: "COSU", name: "COSCO", freeDays: 14, basis: "calendar", tiers: [[15,21,38],[22,28,80],[29,99,135]] }
];
export const CONSIGNEES = ["Autopartes del Sur SA", "Bosch Argentina", "Denso Sudamérica", "Magna Rosario", "Valeo BA", "ZF Pilar", "Continental Arg."];
export const VESSELS = ["MSC LUCIA V.412E", "MAERSK SALINA V.238W", "CMA CGM ANDES V.117N", "SANTOS EXPRESS V.902", "CAP SAN LORENZO V.331"];
export const TERMINALS = ["TRP Terminal 5", "Terminal 4 BACTSSA", "Exolgan Dock Sud", "Terminales Río de la Plata"];
export const DEPOTS = [
  { id: "DEP-01", name: "Depósito Zárate", carrier: "MSCU", risk: "low", window: "07:00–15:00" },
  { id: "DEP-02", name: "Sur Empty Park", carrier: "MAEU", risk: "medium", window: "08:00–17:00" },
  { id: "DEP-03", name: "Dock Sud Depot", carrier: "CMAU", risk: "high", window: "06:00–12:00" },
  { id: "DEP-04", name: "Pilar Interior", carrier: "HLXU", risk: "low", window: "07:30–16:00" }
];

export const ZONES = [
  { id: "A", name: "Zone A — Import full", blocks: 6, rows: 3, slots: 10, maxTiers: 4, ceiling: 0.85, hazmat: false, customs: false },
  { id: "B", name: "Zone B — Import full", blocks: 6, rows: 3, slots: 10, maxTiers: 4, ceiling: 0.85, hazmat: false, customs: false },
  { id: "C", name: "Zone C — Customs controlled", blocks: 4, rows: 2, slots: 8, maxTiers: 3, ceiling: 0.80, hazmat: false, customs: true },
  { id: "D", name: "Zone D — Hazmat / IMDG", blocks: 2, rows: 2, slots: 6, maxTiers: 2, ceiling: 0.70, hazmat: true, customs: false },
  { id: "E", name: "Zone E — Empties", blocks: 4, rows: 3, slots: 10, maxTiers: 4, ceiling: 0.90, hazmat: false, customs: false },
  { id: "R", name: "Receiving lanes", blocks: 1, rows: 1, slots: 12, maxTiers: 1, ceiling: 1.0, hazmat: false, customs: false },
  { id: "S", name: "Outbound staging", blocks: 1, rows: 1, slots: 10, maxTiers: 1, ceiling: 1.0, hazmat: false, customs: false }
];

export const EQUIPMENT = [
  { id: "RS-01", type: "Reach stacker", model: "Kalmar DRG450", maxRowDepth: 3, status: "available", hourMeter: 11840, maintenanceDue: "in 140 h" },
  { id: "RS-02", type: "Reach stacker", model: "Kalmar DRG450", maxRowDepth: 3, status: "available", hourMeter: 9620, maintenanceDue: "in 380 h" },
  { id: "RS-03", type: "Reach stacker", model: "Hyster RS46", maxRowDepth: 2, status: "available", hourMeter: 14210, maintenanceDue: "in 60 h" },
  { id: "EH-01", type: "Empty handler", model: "SMV 4.5", maxRowDepth: 4, status: "available", hourMeter: 7330, maintenanceDue: "in 500 h" },
  { id: "TT-01", type: "Terminal tractor", model: "Terberg YT223", maxRowDepth: 0, status: "maintenance", hourMeter: 20110, maintenanceDue: "in service" }
];

export const OPERATORS = [
  { id: "OP-114", name: "R. Giménez", equipment: "RS-01", certs: ["IMDG", "RS"], shift: "06:00–14:00", status: "on shift" },
  { id: "OP-207", name: "M. Sosa", equipment: "RS-02", certs: ["RS"], shift: "06:00–14:00", status: "on shift" },
  { id: "OP-231", name: "L. Duarte", equipment: "RS-03", certs: ["RS"], shift: "06:00–14:00", status: "on shift" },
  { id: "OP-308", name: "F. Ríos", equipment: "EH-01", certs: ["EH"], shift: "06:00–14:00", status: "on shift" },
  { id: "OP-402", name: "C. Ledesma", equipment: "RS-01", certs: ["IMDG", "RS"], shift: "14:00–22:00", status: "off shift" }
];

const CHANNELS = ["verde", "verde", "verde", "naranja", "rojo"];
const STATUSES = ["IN_YARD", "IN_YARD", "IN_YARD", "IN_YARD", "STAGED", "AT_RECEIVING_LANE", "CUSTOMS_CONTROLLED"];

function buildContainers() {
  const out = [];
  ZONES.filter(z => !"RS".includes(z.id)).forEach(z => {
    for (let b = 1; b <= z.blocks; b++) {
      for (let r = 1; r <= z.rows; r++) {
        for (let s = 1; s <= z.slots; s++) {
          const stack = int(0, z.maxTiers);
          for (let t = 1; t <= stack; t++) {
            if (rnd() > 0.88) continue;
            const carrier = pick(CARRIERS);
            const empty = z.id === "E";
            const hoursToLFD = empty ? int(4, 60) : int(-18, 190);
            const channel = z.id === "C" ? pick(["naranja", "rojo"]) : pick(CHANNELS);
            out.push({
              id: makeId(carrier.code.slice(0, 3)),
              zone: z.id, block: b, row: r, slot: s, tier: t,
              address: `${z.id}-${String(b).padStart(2, "0")}-${r}-${s}-${t}`,
              size: rnd() > 0.75 ? "20GP" : (rnd() > 0.5 ? "40HC" : "40GP"),
              grossKg: empty ? int(2200, 3900) : int(9800, 30400),
              carrier: carrier.code, carrierName: carrier.name,
              consignee: empty ? "—" : pick(CONSIGNEES),
              vessel: pick(VESSELS), terminal: pick(TERMINALS),
              hazmat: z.id === "D",
              imdg: z.id === "D" ? pick(["3", "8", "9", "5.1"]) : null,
              channel: empty ? "—" : channel,
              status: empty ? "IN_YARD" : pick(STATUSES),
              hoursToLFD, dwellDays: int(1, 26), priority: pick(["P1", "P2", "P2", "P3", "P3", "P4"]),
              empty,
              whyHere: null, seal: "AR" + int(200000, 999999)
            });
          }
        }
      }
    }
  });
  const reasons = [
    "Gate-adjacent: LFD in {h} h, pre-positioned for retrieval without a dig-out.",
    "Ground tier in {z}: 30.4 t exceeds the RS46 capacity chart above tier 2.",
    "Deep and low: red-channel dwell forecast 9.2 days, kept clear of short-dwell stacks.",
    "Stacked over a later-due box; zero predicted rehandles before its retrieval window.",
    "IMDG {c} segregation: only Zone D satisfies the class matrix against neighbours.",
    "Block balanced: Zone B at 81% against an 85% ceiling, workload spread from A."
  ];
  out.forEach(c => {
    c.whyHere = pick(reasons).replace("{h}", Math.max(0, c.hoursToLFD)).replace("{z}", c.zone).replace("{c}", c.imdg || "3");
  });
  return out;
}

export const CONTAINERS = buildContainers();

export const lfdBand = h => h < 0 ? "breached" : h <= 24 ? "red" : h <= 72 ? "amber" : "green";

const MOVE_TYPES = ["RETRIEVE_STAGE", "PLACE_INBOUND", "RESHUFFLE", "LOAD_OUTBOUND", "PRE_MARSHAL", "RECEIVE_FROM_LANE", "MOVE_INSPECTION"];
const MOVE_REASONS = {
  RETRIEVE_STAGE: "LFD in {h} h — staged ahead of the 08:40 appointment to protect free time.",
  PLACE_INBOUND: "Slot scores 92: no buried earlier-due box, 140 m travel, ground tier fit.",
  RESHUFFLE: "Dig-out: one box above an earlier-due unit; cheaper now than at retrieval.",
  LOAD_OUTBOUND: "Truck booked 08:15; container pre-staged at S-01-1-{s}-1, 15-min turn protected.",
  PRE_MARSHAL: "Idle window 11:20–11:50 — removes two predicted rehandles this afternoon.",
  RECEIVE_FROM_LANE: "Receiving lane R-{s} clears before the 07:30 arrival wave.",
  MOVE_INSPECTION: "Orange channel: inspection bay booked 10:00 with ARCA verifier."
};

function buildMoves() {
  const out = [];
  let t = 6 * 60 + 0;
  for (let i = 1; i <= 96; i++) {
    const type = pick(MOVE_TYPES);
    const c = pick(CONTAINERS);
    const op = pick(OPERATORS.filter(o => o.status === "on shift"));
    const est = +(2.6 + rnd() * 4.4).toFixed(1);
    const start = t;
    t += Math.round(est) + int(0, 2);
    if (i % 4 === 0) t += 1;
    const hh = m => String(Math.floor(m / 60)).padStart(2, "0") + ":" + String(m % 60).padStart(2, "0");
    out.push({
      id: "MV-" + String(1000 + i),
      seq: i, type, containerId: c.id, from: type === "PLACE_INBOUND" ? "R-01-1-" + int(1, 12) + "-1" : c.address,
      to: type === "RETRIEVE_STAGE" || type === "LOAD_OUTBOUND" ? "S-01-1-" + int(1, 10) + "-1" : c.address.replace(/-\d$/, "-" + int(1, 3)),
      equipment: op.equipment, operator: op.id, operatorName: op.name,
      estMin: est, start: hh(start), end: hh(start + Math.round(est)),
      startMin: start, endMin: start + Math.round(est),
      state: i <= 6 ? "DONE" : i <= 8 ? "IN_PROGRESS" : i <= 30 ? "ASSIGNED" : "PLANNED",
      frozen: i <= 12,
      priority: c.priority,
      reason: MOVE_REASONS[type].replace("{h}", Math.max(0, c.hoursToLFD)).replace("{s}", int(1, 10))
    });
  }
  return out;
}

export const MOVES = buildMoves();

export const EXCEPTIONS = [
  { id: "EX-01", type: "ZONE_FULL", severity: "high", subject: "Zone C at 80% ceiling", detail: "Two orange-channel arrivals have no eligible customs-controlled slot. Overflow policy requires a ceiling override.", action: "Request override" },
  { id: "EX-02", type: "NO_CERTIFIED_OPERATOR", severity: "high", subject: "IMDG class 5.1 retrieval 09:20", detail: "Only OP-114 is IMDG certified on shift and is committed to a frozen chain until 09:40.", action: "Escalate" },
  { id: "EX-03", type: "WEIGHT_VS_REACH", severity: "medium", subject: "MSCU4419307 — 30.4 t at row 3", detail: "C4 violation against the Hyster RS46 capacity chart. Re-sited to row 1, tier 1 in Zone B.", action: "Accept re-site" }
];

export const ASSUMPTIONS = [
  { k: "Weight snapshot", v: "WS-2026-08-10#a41f9c", note: "frozen at generation" },
  { k: "Machines available", v: "3 RS + 1 EH", note: "TT-01 in maintenance" },
  { k: "Shift pattern", v: "1 shift · 06:00–14:00", note: "D-10 unconfirmed" },
  { k: "Inbound mode", v: "Drop-and-go", note: "D-01 assumption" },
  { k: "Bonded status", v: "Not bonded", note: "D-02 unanswered" },
  { k: "Arrival profile", v: "34 containers · peak 07:00–09:30", note: "from terminal feed" },
  { k: "Wind forecast", v: "22 km/h peak", note: "below tier-3 limit" },
  { k: "Travel matrix", v: "Geometry-seeded", note: "learned actuals from wk 6" }
];

export const ROLES = [
  { id: "yard_manager", name: "Yard Manager", screens: "*" },
  { id: "planner", name: "Planner", screens: ["S1", "S3", "S4", "S7", "S11", "S13"] },
  { id: "gate_clerk", name: "Gate Clerk", screens: ["S1", "S2", "S3"] },
  { id: "operator", name: "Operator", screens: ["S6", "S10"] },
  { id: "customs", name: "Customs Coordinator", screens: ["S1", "S8"] },
  { id: "broker", name: "Broker (external)", screens: ["S8"] },
  { id: "finance", name: "Finance", screens: ["S9", "S11"] },
  { id: "management", name: "Management", screens: ["S1", "S11", "S13"] },
  { id: "it_admin", name: "IT Admin", screens: ["S12", "S5"] }
];

export const SCREENS = [
  { id: "S1", name: "Yard map", group: "Operate" },
  { id: "S2", name: "Gate & visit console", group: "Operate" },
  { id: "S3", name: "Appointment board", group: "Operate" },
  { id: "S4", name: "Night-before planner", group: "Plan" },
  { id: "S5", name: "Config & weight console", group: "Plan" },
  { id: "S6", name: "Operator mobile", group: "Execute" },
  { id: "S7", name: "Disruption control tower", group: "Execute" },
  { id: "S8", name: "Customs workboard", group: "Control" },
  { id: "S9", name: "Detention & empty return", group: "Control" },
  { id: "S10", name: "Yard audit", group: "Control" },
  { id: "S11", name: "KPI & capacity", group: "Analyse" },
  { id: "S12", name: "Admin & integrations", group: "Analyse" },
  { id: "S13", name: "Simulation studio", group: "Analyse" }
];
