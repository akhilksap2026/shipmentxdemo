# Product Requirements Document — v2.0 (Consolidated)
## Yard Operating System (YOS) — Container Yard Planning & Execution Platform
### Argentine Automotive Parts Import Facility · Buenos Aires Metropolitan Area

| Field | Detail |
|---|---|
| Version | 2.0 — supersedes PRD v1.0 |
| Basis | PRD v1.0 + client call requirements + gap analysis (74 gaps) |
| Structure | 9 modules · 21 entities · 12 screens · 4 phases |
| Positioning | Best-of-breed YMS, TMS-agnostic, OTM-mappable |
| Naming | "Yard Operating System" rather than YMS — the product plans and executes, it does not only track |

---

# PART I — PRODUCT DEFINITION

## 1. Problem statement

A large Argentine automotive parts importer receives 30–35 containers per day from Buenos Aires metropolitan terminals, ~50 miles / ~90 minutes from the facility, holding a peak inventory of up to 1,000 containers stacked 3–4 high. Three things are going wrong or are at risk as volume grows toward 1,200:

1. **Detention leakage** — containers are not returned inside carrier free time because retrieval is not sequenced against last-free-day.
2. **Truck turnaround** — trucks wait because outbound containers are not on the ground when the truck arrives, and because machine capacity in the morning peak is consumed by inbound put-away.
3. **No forward visibility** — management cannot answer whether the yard survives the next quarter's volume, because capacity is understood as a slot count rather than as machine-hours.

Underneath all three is one root cause: **the yard is run reactively, from memory, one move at a time.** There is no plan, so there is nothing to protect and nothing to measure against.

## 2. Product thesis

> A yard operating system with a **published nightly baseline plan** and a **stability-controlled re-optimisation layer** that diffs against it during execution — where every placement and every sequence decision is explainable in one sentence, and where capacity is expressed in machine-hours.

Three buying reasons, and every feature must ladder to one:

| # | Buying reason | Proof required |
|---|---|---|
| B1 | Deterministic, auditable, explainable planning — not a black box | Every move carries a `reason`; every plan reproducible from inputs + frozen weight snapshot |
| B2 | The two contractual KPIs: **15-minute truck turn**, **5-minute machine job cycle** | Formally defined, instrumented, and measured against a pre-go-live baseline |
| B3 | Confidence to scale 600 → 1,200 containers without emergency capex | Machine-hour capacity model + discrete-event simulation, not a trend line |

## 3. Scope

**In scope.** Inbound receiving and gate operations; slot assignment; nightly planning; intraday re-optimisation; machine and operator task execution; outbound pre-staging for all three outbound flows; detention and empty-return control; yard inventory integrity; customs status and (conditionally) on-site inspection support; yard visualisation; KPI and capacity analytics; integration to SAP, terminals, carriers, telematics and a future TMS.

**Out of scope.** Warehouse operations inside the building (WMS territory); transport procurement, tendering, rating and freight audit (TMS/OTM territory); customs declaration filing (broker's system); financial accounting.

**Conditional scope — resolves on client answer.** Bonded-depot (depósito fiscal) customs operations, including on-site red/orange-channel inspection under RG 5644/2025. If confirmed, this adds Module M3 in full and is the largest single scope item in the programme.

**Explicitly deferred.** Reefer management, weighbridge/VGM, multi-facility rollout, autonomous/automated handling.

## 4. Positioning: YMS-first, TMS-ready

The platform runs standalone against SAP plus terminal and carrier feeds. A TMS-agnostic integration layer publishes and consumes shipment events in an OTM-compatible object model, so a later OTM or Blue Yonder implementation can take drayage tendering, outbound routing and freight audit without reworking the yard core.

This is a defensible position on the merits, and it is also the answer to "why not Blue Yonder YMS": TMS-native yard modules are built around dock-door appointment scheduling for trailer-based operations. Multi-stack container yards with reach-stacker reach envelopes, dig-out prediction, IMDG segregation and detention-driven retrieval sequencing are a different problem class. **No TMS vendor dependency is permitted in the yard core** — the integration layer translates.

```
┌─────────┐  orders, ETAs, GR    ┌──────────────────────────────────────────────┐
│   SAP   │◄────────────────────►│                                              │
└─────────┘                      │            YARD OPERATING SYSTEM             │
┌─────────┐  COPARN / CODECO     │  ┌────────────┐  ┌──────────────────────┐    │
│ Carrier │◄────────────────────►│  │  Nightly   │  │  Stability-Controlled│    │
│ Terminal│  turnos, LFD, holds  │  │  Baseline  │◄─┤   Re-Optimiser       │    │
└─────────┘                      │  │  Planner   │  └──────────────────────┘    │
┌─────────┐  channel, PEMA,      │  └────────────┘             ▲                │
│  ARCA / │◄────────────────────►│  ┌──────────────────────────┴────────────┐   │
│  broker │  libramiento         │  │ Constraint & Scoring Core             │   │
└─────────┘                      │  │ hard constraints → weighted factors   │   │
┌─────────┐  GPS ETA, machine    │  │ → deterministic tie-breaks            │   │
│Telematic│─────────────────────►│  └───────────────────────────────────────┘   │
│ OCR/RTLS│  position, telemetry │  ┌──────┐┌──────┐┌──────┐┌──────┐┌───────┐   │
└─────────┘                      │  │ Yard ││ Gate ││Mobile││Audit ││ Sim   │   │
┌─────────┐  shipment, stop,     │  │ Model││Visit ││ Exec ││ KPI  ││ Twin  │   │
│ OTM/TMS │◄────────────────────►│  └──────┘└──────┘└──────┘└──────┘└───────┘   │
│ (future)│  equipment, event    └──────────────────────────────────────────────┘
└─────────┘
```

---

# PART II — CONSOLIDATED PRODUCT STRUCTURE

Nine modules. Each feature carries a phase (**0** demo prototype, **1** pilot MVP, **2** production, **3** optimise/extend) and, where applicable, the gap ID it closes.

## M1 — Yard Model & Layout Twin

The digital representation of the physical yard, including equipment physics.

| # | Feature | Phase | Closes |
|---|---|---|---|
| M1.1 | Zone / block / row / tier / slot hierarchy with the address convention `{zone}-{block:02}-{row}-{slot}-{tier}` | 0 | |
| M1.2 | **Reach-envelope model** — per zone, maximum row depth reachable and maximum tier by row position | 1 | C2 |
| M1.3 | **Equipment capacity chart** — per machine model, permissible gross weight by (row, tier); drives hard eligibility | 1 | C1, C3 |
| M1.4 | Slot geometry by container size — 20ft/40ft slot typing, 40HC height rules, no-mixed-size stacking rules | 1 | C4 |
| M1.5 | Zone rules — max tiers, hazmat permitted, IMDG segregation matrix, customs-controlled flag, ground-only flag | 0 | |
| M1.6 | **Usable vs. nominal capacity** — utilisation ceiling per zone (default 85%), working-slack reservation | 1 | C8, C9 |
| M1.7 | Aisle and traffic model — aisle segments, one-way rules, machine exclusion during lifts | 2 | C7 |
| M1.8 | Receiving lanes and staging positions as first-class zones with independent capacity | 1 | A5, A8 |
| M1.9 | Inspection bays (customs), quarantine/damage area, empty block | 1 | B3 |
| M1.10 | Layout editor — Yard Manager configures blocks, rows, tiers, aisles; map re-renders; changes versioned | 1 | |
| M1.11 | Travel-time matrix between zone pairs, seeded from geometry then **replaced by learned actuals** | 2 | D7 |

**Design rule.** No slot exists in the model unless it is reachable by at least one machine in the fleet at the container weights the facility actually handles. Blocks are cut to ≤3 rows deep against a reach-stacker fleet.

## M2 — Inbound & Gate Operations

The module PRD v1.0 omitted. Owns the 15-minute KPI end to end.

| # | Feature | Phase | Closes |
|---|---|---|---|
| M2.1 | **Visit lifecycle** — the unit of turn-time measurement: `EXPECTED → APPROACHING → IN_QUEUE → CHECKED_IN → AT_POSITION → SERVED → GATE_OUT` | 1 | A3, A4 |
| M2.2 | Truck / driver / tractor / chassis registry with carrier linkage | 1 | A3 |
| M2.3 | **Appointment (turno) engine** — bookable windows with capacity derived from *machine* availability, not lane count; no-show, late, overbooking policies | 1 | A2 |
| M2.4 | Pre-advice intake — from SAP order, drayage dispatch, or carrier portal | 1 | |
| M2.5 | **Arrival ETA from geofence / driver app / telematics**, replacing the static 90-minute assumption | 1 | G4 |
| M2.6 | Gate-in: identification (OCR portal or handheld ground check), document check, seal number capture, lane/position assignment | 1 | A1, F1 |
| M2.7 | **EIR / interchange receipt** — structured condition survey with photos at gate-in and gate-out, digitally acknowledged, immutable | 1 | A7 |
| M2.8 | Receiving-lane management for drop-and-go inbound; decoupled put-away task generation | 1 | A5 |
| M2.9 | Outbound pre-staging orchestration for all three flows; staged-ready confirmation before appointment | 1 | |
| M2.10 | Gate-out: verification against work order, seal, EIR, gate pass release | 1 | |
| M2.11 | **Turn-time instrumentation** with formally defined clock and exclusions (see §14) | 1 | A4, I1 |
| M2.12 | Gate console (Screen S2) with live queue, lane state, exception handling | 1 | A1, H1 |
| M2.13 | Driver experience — QR gate pass, arrival and ready notifications, self-service kiosk | 2 | A9, H3 |
| M2.14 | Gate queue-depth monitoring with peak-hour smoothing recommendations back into the appointment engine | 2 | A6 |
| M2.15 | Weighbridge / VGM | 3 | A10 |

**Design decision required before build (D-01).** Live unload vs. drop-and-go. The reference design assumes **drop-and-go into grounded receiving lanes**, with put-away decoupled as a separate machine task, because live unload cannot hold a 15-minute turn through the morning peak. If the client mandates live unload, the appointment engine must hard-throttle inbound arrivals to machine capacity and the KPI must be renegotiated.

## M3 — Customs & Compliance *(conditional module)*

| # | Feature | Phase | Closes |
|---|---|---|---|
| M3.1 | Customs state model — destinación reference and subregime (IC04/IC05), **selectivity channel** (verde / naranja / rojo), verification status, libramiento | 1 | B2, X7 |
| M3.2 | **Hard constraint: no movement or opening of a container under customs control without recorded authorisation** | 1 | B5 |
| M3.3 | Channel-driven dwell prediction — red/orange channel materially extends expected dwell and must feed slot assignment and capacity forecasting | 1 | B2 |
| M3.4 | **PEMA electronic seal tracking** — seal applied at port, integrity monitored to arrival, break recorded as a customs event | 1 (if bonded) | B3 |
| M3.5 | Summary declaration references (TLMD / TLAT) captured against the transfer | 1 (if bonded) | B3 |
| M3.6 | **Customs jurisdiction validation** — reject or flag transfers from a terminal outside the facility's customs jurisdiction | 1 | B4 |
| M3.7 | Inspection bay scheduling — customs inspector appointment, container positioned and opened under supervision, results recorded | 2 (if bonded) | B3 |
| M3.8 | Statutory inventory reporting to ARCA; permanence-limit monitoring and alerting | 2 (if bonded) | B3 |
| M3.9 | Broker (*despachante*) portal role — visibility of channel, position, inspection schedule | 2 | B7 |
| M3.10 | Dangerous goods compliance — DG declaration and SDS attachment, placarding checklist, aggregate quantity limit per zone, spill response reference | 2 | B8 |
| M3.11 | Customs record retention per statutory period, with legal hold | 2 | B6 |
| M3.12 | Argentine holiday calendar and stoppage register — feeds free-time counting and plan validity | 1 | B9 |

**Scope gate.** M3.4, M3.5, M3.7, M3.8 activate only if the facility is or becomes a depósito fiscal. This is decision **D-02** and must be answered before Phase 1 design closes.

## M4 — Planning & Optimisation Engine

| # | Feature | Phase | Closes |
|---|---|---|---|
| M4.1 | **Stated objective function** — minimise `w₁·machine-minutes + w₂·weighted lateness + w₃·predicted rehandles + w₄·detention-risk exposure`, subject to hard constraints | 1 | D1 |
| M4.2 | Hard-constraint eligibility pass (see §11.1) | 0 | |
| M4.3 | Retrieval priority scoring — weighted soft factors, normalised | 0 | |
| M4.4 | Slot assignment scoring with dig-out look-ahead | 0 | |
| M4.5 | **Move chaining / sequencing** — construct routes so each drop-off is near the next pick-up; deadhead travel is the dominant lever on the 5-minute target | 1 | D2 |
| M4.6 | Improvement pass — local search (move-exchange, 2-opt on sequence, slot swap) under an explicit time budget | 1 | D1 |
| M4.7 | Operator/machine assignment — proximity, certification, capacity chart, workload balance, sequence continuity, labour rules | 1 | F6 |
| M4.8 | Deterministic tie-breakers, guaranteeing reproducible plans | 0 | |
| M4.9 | **Explainability** — mandatory one-sentence `reason` / `whyHere` on every assignment | 0 | |
| M4.10 | Nightly baseline plan generation, approval and publication with frozen weight snapshot | 0 | |
| M4.11 | **Plan stability control** — freeze window on imminent moves, minimum-improvement threshold before accepting a replan, reassignment cap per operator per hour, event debounce (see §11.5) | 1 | D3 |
| M4.12 | Event-driven replanning with typed triggers and auto/manual resolution matrix | 0 | |
| M4.13 | **Robustness to ETA uncertainty** — protective slack policy, optimistic/expected/pessimistic scenario bands on projected KPIs | 1 | D4 |
| M4.14 | **Housekeeping / pre-marshalling** — planned into idle windows to reduce future rehandles | 2 | D5 |
| M4.15 | **Infeasibility handling** — no eligible slot, zone full, no certified operator: overflow policy, exception queue, degraded rules with authorisation | 1 | D6 |
| M4.16 | Weight console — sliders, toggles, forced-rule editor, no-code custom-factor builder, simulate-before-commit | 0 | |
| M4.17 | **Calibration loop** — learned job durations, travel matrix, gate service times, per-carrier/vessel ETA bias | 2 | D7 |
| M4.18 | Trade-off frontier view — show the cost of a weight change in machine-minutes vs. detention exposure | 3 | D15 |

## M5 — Execution & Mobile

| # | Feature | Phase | Closes |
|---|---|---|---|
| M5.1 | Operator task queue — one instruction per view, large type for cab visibility, es-AR | 0 | |
| M5.2 | **Identification chain** — gate-side OCR or handheld as the authoritative identity event; cab camera OCR or spreader confirmation in-yard; position tracking between | 1 | F1 |
| M5.3 | **Authorised exception path** — supervisor-approved manual confirmation with mandatory photo and reason code, fully audited. No unbounded "no manual entry ever" rule | 1 | F1 |
| M5.4 | Damage capture — photos attached to condition record, optional quarantine flip, replan trigger | 0 | |
| M5.5 | Confirm-done with actual duration recorded to audit | 0 | |
| M5.6 | Mid-shift re-sequence with explicit banner — subject to M4.11 stability rules | 0 | D3 |
| M5.7 | Offline queue with local cache and conflict resolution on resync | 1 | F2 |
| M5.8 | **Exception reporting from the cab** — container not found, wrong container in slot, cannot reach, blocked, damage, machine fault | 1 | F4 |
| M5.9 | Pre-shift machine check and fault reporting | 2 | C11 |
| M5.10 | Safety interlocks — no-go zone alerts, lift-in-progress exclusion, proximity warning | 2 | F5 |
| M5.11 | Device specification: ruggedisation, sunlight-readable display, glove-sized targets, cab mount, charging | 1 | H5 |

## M6 — Detention & Equipment Cost Control

| # | Feature | Phase | Closes |
|---|---|---|---|
| M6.1 | **Instrument separation** — detention, demurrage, chassis per diem modelled distinctly | 1 | E1 |
| M6.2 | **Free-time rule engine** — per carrier: free days, calendar vs. working days, clock-start basis, holiday calendar, stoppage exclusions, combined free time | 1 | E2 |
| M6.3 | **Tiered tariff model** — escalating rate bands per carrier and equipment type | 1 | E3 |
| M6.4 | Derived last-free-day and hours-to-LFD (computed, never stored) with amber/red banding | 1 | D14 |
| M6.5 | **Empty return management** — nominated depot, return window, release/acceptance reference, *libre deuda* check, depot appointment | 1 | E4 |
| M6.6 | **Redirection (*derivación*) handling** — depot change events, replan of the empty-return sequence, notification | 1 | E4 |
| M6.7 | Depot capacity and acceptance-risk tracking; alternate depot recommendation | 2 | E4 |
| M6.8 | **Detention invoice audit** — reconcile carrier invoices against system gate timestamps; produce a dispute pack | 2 | E5 |
| M6.9 | Exposure dashboard — detention at risk today / 7 days / 30 days, in USD, by carrier | 1 | |
| M6.10 | **Baseline capture** — pre-go-live detention spend and dwell distribution, for ROI attribution | 1 | E6 |

## M7 — Inventory Integrity

Non-negotiable. Without this the map drifts, and every plan built on a drifted map is invalid.

| # | Feature | Phase | Closes |
|---|---|---|---|
| M7.1 | **Cycle count / yard audit** — scheduled zone-by-zone verification tasks with a defined coverage cycle | 1 | F3 |
| M7.2 | Discrepancy workflow — expected vs. found, categorised, resolved, audited | 1 | F3 |
| M7.3 | **Container-not-found search** — guided search by probable location, last known move, similar ID | 1 | F3, F4 |
| M7.4 | Reconciliation against SAP inventory and against carrier equipment records | 2 | G3 |
| M7.5 | Integrity KPI — position accuracy %, mean time to detect a discrepancy | 1 | I2 |
| M7.6 | **Exception taxonomy and resolution workflows** — unknown container, ID mismatch, not in SAP, duplicate, overweight, missing documents, wrong container delivered, damage dispute | 1 | F4 |
| M7.7 | **Initial inventory load** — wall-to-wall physical audit tooling for cutover | 1 | J3 |

## M8 — Visibility, KPI & Capacity Simulation

| # | Feature | Phase | Closes |
|---|---|---|---|
| M8.1 | Yard map — front-view per block, tiers, status colour coding, occupancy heat | 0 | |
| M8.2 | Container detail panel — owner, consignee, contents, LFD countdown, customs channel, scheduled retrieval, move history, `whyHere` | 0 | |
| M8.3 | **Map search and filter** — by container ID, consignee, vessel, order, LFD band, customs channel, status | 1 | H2 |
| M8.4 | Plan view — sequenced moves, operator Gantt, projected slot map, gate schedule | 0 | |
| M8.5 | Disruption feed and replan diff panel | 0 | |
| M8.6 | Audit swim-lane — baseline vs. actual vs. revisions, variance categorised, weight snapshot on drill-down | 0 | |
| M8.7 | **KPI dashboard against formally defined metrics** (§14) with drill-through to audit records | 1 | I1, I2 |
| M8.8 | **Machine-hour capacity model** — required vs. available machine-hours by day/week/month, occupancy-dependent rehandle curve | 1 | C10, D8 |
| M8.9 | **Discrete-event simulation studio** — vary volume, machine count, shift pattern, layout, appointment profile; answer "can we handle 1,200?" with a model | 2 | D8 |
| M8.10 | 1–3 month capacity forecast with breach detection and specific recommendation (machines / shifts / slots) | 1 | |
| M8.11 | Management summary view, mobile-friendly | 2 | H4 |
| M8.12 | Analytics export and BI feed | 2 | I3 |

## M9 — Platform & Operations

| # | Feature | Phase | Closes |
|---|---|---|---|
| M9.1 | Integration layer — adapter pattern, idempotency, replay, dead-letter queue, reconciliation jobs | 1 | G3 |
| M9.2 | SAP integration (orders, deliveries, priorities, goods receipt trigger, master data) | 1 | G3 |
| M9.3 | **Per-terminal adapters** with capability matrix and manual/portal fallback | 1 | G2 |
| M9.4 | Carrier EDI — **COPARN, CODECO, COARRI, IFTSTA** (SMDG/EDIFACT); X12 only where a partner requires | 2 | G1 |
| M9.5 | Telematics and OCR ingestion — machine position and telemetry, gate OCR reads | 2 | G6 |
| M9.6 | **OTM-compatible event publication and consumption** (§13.3) | 3 | G5 |
| M9.7 | **Master data management** — carriers, consignees, depots, tariffs, holidays, equipment, zones, reason codes | 1 | G8 |
| M9.8 | RBAC, authentication, SSO-readiness, device binding, immutable append-only audit | 1 | |
| M9.9 | **Integration health console** | 1 | G7 |
| M9.10 | Notification and escalation engine — in-app, email, SMS, **WhatsApp**; configurable escalation matrix | 2 | H3 |
| M9.11 | **Degraded-mode operation** — printable fallback plan and gate log, manual capture forms, reconciliation on recovery | 1 | F8 |
| M9.12 | Observability — logging, tracing, SLO alerting | 1 | |
| M9.13 | Backup, DR with stated RTO/RPO, data residency, retention and legal hold | 1 | J9 |

---

# PART III — DOMAIN MODEL

## 10. Entities (21)

Entities marked **new** did not exist in PRD v1.0.

| # | Entity | Purpose | Key fields |
|---|---|---|---|
| E01 | `Facility` | Site, port references, customs jurisdiction, bonded status | `id, customsJurisdiction, bondedStatus, timezone` |
| E02 | `Zone` | Logical area with rules | `maxTiers, maxRowDepth, hazmatAllowed, segregationMatrix, customsControlled, utilisationCeiling` |
| E03 | `Slot` | Addressable position | `address, zone, block, row, slot, tier, sizeType, reachableBy[], maxGrossKg` |
| E04 | **`Equipment`** *(new)* | Machine master | `id, type, model, capacityChart[{row,tier,maxKg}], maxRowDepth, status, maintenanceDue, hourMeter` |
| E05 | `Operator` | Jockey / machine operator | `id, certifications[], shift, labourRules, currentEquipment, position, status` |
| E06 | `Container` | Equipment unit in yard | `containerId (ISO 6346), sizeType, grossKg, carrier, owner, consignee, hazmat, condition, sealNumber, status, currentSlot, whyHere` |
| E07 | `Order` | Demand from SAP | `orderId, type, priority, containerIds[], vesselRef, etaChain, etaConfidence` |
| E08 | **`Visit`** *(new)* | A truck's presence at the facility — **unit of turn-time measurement** | `visitId, truck, driver, chassis, appointmentId, purpose, timestamps{queueIn, checkIn, atPosition, served, gateOut}, turnMinutes` |
| E09 | **`Appointment`** *(new)* | Bookable window | `apptId, window, type, capacityConsumed, status, noShowFlag, carrier` |
| E10 | **`Truck` / `Driver` / `Chassis`** *(new)* | Road assets and people | `plate, carrier, driverId, licence, chassisId` |
| E11 | **`EIR`** *(new)* | Interchange receipt | `eirId, visitId, containerId, direction, conditionSurvey, photos[], sealNumber, acknowledgedBy, timestamp` |
| E12 | `Plan` | Published baseline | `planId, status, weightsSnapshot, assumptions, moves[], kpisProjected{expected, optimistic, pessimistic}` |
| E13 | `Move` | Atomic machine task | `moveId, seq, type, containerId, fromSlot, toSlot, equipmentId, operatorId, estJobMin, reason, state, frozen` |
| E14 | `Event` | Disruption or external signal | `eventId, type, payload, replanResult, autoResolved, requiresAck, debounceGroup` |
| E15 | `AuditRecord` | Baseline vs. actual vs. revisions | `moveId, baseline, actual, revisions[], variance{delayMin, category}` |
| E16 | **`CustomsRecord`** *(new)* | Customs state per container | `destinacionRef, subregime, channel, pemaSeal, summaryDeclRef, verificationStatus, libramientoAt, movementAuthorised` |
| E17 | **`DetentionTerms`** *(new)* | Free-time and tariff | `carrier, equipType, freeDays, dayBasis, clockStart, tiers[{fromDay,toDay,rateUSD}], combinedFreeTime` |
| E18 | **`EmptyReturn`** *(new)* | Return instruction | `containerId, depotId, returnWindow, releaseRef, libreDeudaStatus, redirectionHistory[]` |
| E19 | **`Depot`** *(new)* | Empty return location | `depotId, carrier, address, jurisdiction, windows[], acceptanceRisk` |
| E20 | **`YardAuditTask`** *(new)* | Cycle count | `taskId, zone, scheduledFor, expected[], found[], discrepancies[], resolution` |
| E21 | `Config` | Weights, rules, thresholds, parameter register | `retrievalWeights, slotWeights, forcedRules[], customFactors[], stabilityParams, thresholds, parameterRegister` |

**Modelling rules.**
- `facilityId` on every entity from day one (multi-facility ready).
- All time-derived values (`hoursToLFD`, `turnMinutes`, `dwellHours`) are **computed, never stored**.
- Container `priority` is derived from its order with a documented precedence rule; it is not independently editable.
- `Move.frozen` is set by the stability controller and blocks re-optimisation of that move.

## 10.1 Status lifecycles

**Container.** `ON_VESSEL → AT_TERMINAL → IN_TRANSIT → AT_GATE → AT_RECEIVING_LANE → IN_YARD → STAGED → LOADED → DEPARTED`
Side states: `CUSTOMS_CONTROLLED`, `AWAITING_INSPECTION`, `QUARANTINE`, `DAMAGED`, `NOT_FOUND`, `EMPTY_RETURNED`.

**Move type.** `RECEIVE_FROM_LANE | PLACE_INBOUND | RESHUFFLE | PRE_MARSHAL | RETRIEVE_STAGE | LOAD_OUTBOUND | MOVE_INSPECTION | MOVE_QUARANTINE | AUDIT_VERIFY`

**Move state.** `PLANNED → ASSIGNED → IN_PROGRESS → DONE`, plus `CANCELLED | REPLANNED | BLOCKED | EXCEPTION`

**Event type.** `SHIP_DELAY | TERMINAL_HOLD | CUSTOMS_CHANNEL_ASSIGNED | INSPECTION_SCHEDULED | GATE_INCIDENT | OUT_OF_SEQUENCE_ARRIVAL | EQUIPMENT_FAILURE | OPERATOR_UNAVAILABLE | PRIORITY_OVERRIDE | DAMAGE_REPORTED | DEPOT_REDIRECTION | APPOINTMENT_NO_SHOW | CONTAINER_NOT_FOUND | WEATHER_LIMIT | LABOUR_ACTION | ZONE_FULL | SYSTEM_DEGRADED`

---

# PART IV — ENGINE SPECIFICATION

## 11. Planning engine

### 11.1 Pass 1 — Hard constraints (binary eligibility)

A soft weight may never override a hard constraint. This is the formal meaning of "hazmat overrides everything".

| ID | Constraint | Rule |
|---|---|---|
| C1 | Hazmat segregation | IMDG class compatibility against zone matrix and adjacent slots |
| C2 | Stack height | `tier ≤ zone.maxTiers` **and** `tier ≤ reachEnvelope(row)` |
| C3 | **Reach depth** | `row ≤ equipment.maxRowDepth` for at least one available machine |
| C4 | **Weight vs. reach** | `container.grossKg ≤ equipment.capacityChart(row, tier)` |
| C5 | Weight distribution | Heavier never above lighter in the same stack |
| C6 | Slot size compatibility | Container size type matches slot type; no mixed-size stacking |
| C7 | Customs control | Container under customs control is immovable and unopenable without recorded authorisation |
| C8 | Status locks | Quarantine, inspection hold, not-found ⇒ not retrievable |
| C9 | Certification | Hazmat tasks only to certified operators |
| C10 | Labour rules | Assignment must respect shift, break and overtime limits |
| C11 | **Wind limit** | Above threshold wind speed, no placement at tier ≥ 3; empties restricted further |
| C12 | **Utilisation ceiling** | Zone cannot be filled beyond its configured ceiling without authorised override |

### 11.2 Pass 2 — Retrieval priority

`Score(c) = Σ(Wᵢ · Fᵢ(c)) / ΣWᵢ`, normalised 0–100.

| Factor | Default W | Scoring |
|---|---|---|
| Detention urgency | 30 | `clamp(0, 100, (1 − hoursToLFD/72) × 100)`; breached ⇒ 100 — **note the `max(0,…)` floor, absent in v1.0** |
| Detention cost gradient | *(new)* 10 | Weighted by the tier band the container is about to enter, not a flat rate |
| Hazmat handling | 25 | Outbound-due hazmat ⇒ 100; inbound hazmat ⇒ 80 |
| Customer / order priority | 15 | P1→100, P2→70, P3→40, P4→10 |
| Dig-out cost (penalty) | 12 | `100 − (blockingContainers × 33)`; top-of-stack ⇒ 100 |
| Gate / appointment pressure | 10 | Truck waiting ⇒ 100; appointment <60 min ⇒ 80; <3 h ⇒ 40 |
| **Customs channel** *(new)* | 8 | Cleared ⇒ 100; awaiting inspection ⇒ 0 (not retrievable) |
| **Empty-return window** *(new)* | 8 | Depot window closing today ⇒ 100; window closed ⇒ escalate |
| Damage / quarantine | 5 | Damaged and outbound-due ⇒ 60, routed to inspection not gate |
| Dwell time | 3 | `min(100, daysInYard × 10)` |

**Forced rules** (auditable, badged in the UI): `hoursToLFD ≤ 12`, `isHazmat && dwellHours > 24`, `emptyReturnWindow closes < 8h` ⇒ injected at queue front.

### 11.3 Pass 2b — Slot assignment

| Factor | Default W | Scoring |
|---|---|---|
| Future rehandle avoidance | 30 | No buried earlier-due box ⇒ 100; each predicted reshuffle −30 |
| Machine travel distance | 20 | Calibrated to actual yard dimensions from the learned travel matrix |
| Stack stability | 15 | Ground tier ⇒ 100; tier 3+ ⇒ 40 |
| Zone compatibility | 15 | Contents/zone match ⇒ 100 / 50 / 0 |
| Detention pre-positioning | 10 | LFD <48 h ⇒ gate-adjacent ⇒ 100 |
| **Dwell-based tiering** *(new)* | 8 | Long-expected-dwell (e.g. red channel) placed deep and low; short-dwell placed shallow |
| Weight tiering | 5 | Heavy-at-bottom fit |
| Block balancing | 5 | Even machine workload across zones |

**Dig-out look-ahead.** Before any tier ≥ 2 assignment, for each container `x` in the target stack, if `x.plannedRetrieval < new.plannedRetrieval` then `predictedRehandles += 1`. Rule: never stack a later-due box over an earlier-due box unless the alternative costs more than one full rehandle *at the learned rehandle cost for that location*, not a flat 5 minutes.

### 11.4 Pass 2c — Sequencing and assignment

Two stages, and v1.0 only had the second:

**Stage 1 — Sequence construction.** Build move chains such that each drop-off is close to the next pick-up. Precedence constraints (dig-out before retrieve; retrieve before load) are respected. Travel is sequence-dependent. This is where the 5-minute target is won or lost — deadhead travel between unrelated tasks is typically the largest component of a poor job cycle.

**Stage 2 — Machine/operator assignment.**
`AssignScore = 0.40·Proximity + 0.20·Certification + 0.15·CapacityFit + 0.15·SequenceContinuity + 0.10·WorkloadBalance`

Projected job time = travel (learned matrix) + lift + positioning + confirmation. Assignments projecting above the threshold are resequenced, subject to a **maximum of 3 iterations then escalate to the exception queue** — closing the non-termination risk in v1.0.

**Stage 3 — Improvement pass.** Local search (move exchange, slot swap, chain reversal) against the objective function in §M4.1, under a hard time budget: 45 s for the nightly plan, 10 s for an intraday replan.

### 11.5 Plan stability control *(entirely new)*

The single most important addition to the engine.

| Parameter | Default | Purpose |
|---|---|---|
| `freezeWindowMin` | 20 | Moves starting within this window cannot be re-sequenced |
| `inProgressImmutable` | true | A container on the spreader is never cancelled |
| `minImprovementMin` | 8 | A replan is accepted only if it saves at least this much projected machine time, **or** resolves a hard-constraint violation or a detention breach |
| `maxReassignPerOperatorPerHour` | 2 | Prevents queue thrash |
| `eventDebounceSec` | 90 | Batches event storms into a single replan |
| `replanCooldownMin` | 10 | Minimum interval between voluntary replans |

**Override.** Hard-constraint violations, imminent detention breach, safety events and customs holds bypass all stability limits and replan immediately.

### 11.6 Replanning matrix

| Trigger | Scope | Resolution |
|---|---|---|
| Ship ETA slip > 60 min | Resequence inbound placements and queues | Auto |
| Customs channel assigned red/orange | Route to inspection area; lock; release reserved slot; backfill | Auto |
| Terminal or customs hold | Lock container; release slot; re-promise linked order | Auto |
| Gate incident | Freeze lanes, reroute staging, retime appointments | Partial — requires acknowledgement |
| Out-of-sequence arrival | Re-run slot assignment from current machine positions | Auto |
| Equipment failure | Redistribute queue; escalate if sole capable machine | Partial |
| Operator unavailable | Reassign; escalate if sole certified | Partial |
| **Depot redirection** | Replan empty-return sequence to new depot and window | Auto, notify |
| **Container not found** | Raise audit task; hold linked order; escalate | Manual |
| **Weather limit breached** | Invalidate high-tier placements; replan to lower tiers | Auto |
| **Zone full** | Apply overflow policy; request ceiling override | Manual |
| SAP priority override | Rescore affected orders; forced-rule check | Auto |
| **Labour action / stoppage** | Suspend affected flows; recompute free-time exclusions | Manual |

**Invariant.** Every replan writes a diff to the audit trail with the triggering event, the moves cancelled/added/reassigned, and the resulting plan adherence — displayed honestly, including when it degrades.

---

# PART V — PRODUCT SURFACE

## 12. Screens (12)

| # | Screen | Primary users | Phase |
|---|---|---|---|
| S1 | **Yard map & container detail** — blocks, tiers, status colours, occupancy heat, search/filter, click-through detail with `whyHere` | Yard Manager, Planner, Management | 0 |
| S2 | **Gate & visit console** *(new)* — live queue, lane state, check-in, EIR capture, seal, position assignment, gate-out, turn-time clock per visit | Gate Clerk | 1 |
| S3 | **Appointment board** *(new)* — bookable windows against machine capacity, no-shows, smoothing recommendations | Gate Clerk, Planner | 1 |
| S4 | **Night-before planner** — generate, review assumptions, sequenced moves, operator Gantt, projected KPIs with confidence bands, exception queue, approve & publish | Planner, Yard Manager | 0 |
| S5 | **Configuration & weight console** — sliders, toggles, forced rules, custom-factor builder, stability parameters, simulate-before-commit, **Parameter Register coverage view** | Yard Manager | 0 |
| S6 | **Operator mobile** — one instruction per view, identification, damage capture, done, exception reporting, offline | Operator | 0 |
| S7 | **Disruption control tower** — live event feed, replan diff, acknowledgement queue, audit swim-lane | Yard Manager, Planner | 0 |
| S8 | **Customs & inspection workboard** *(new)* — channel status, PEMA integrity, inspection schedule, authorisation state, permanence alerts | Customs Coordinator, Broker | 1 |
| S9 | **Detention & empty-return console** *(new)* — exposure by carrier, LFD bands, depot windows, redirections, invoice audit and dispute packs | Yard Manager, Finance | 1 |
| S10 | **Yard audit** *(new)* — cycle-count tasks, discrepancy resolution, container search, position accuracy | Yard Manager, Operator | 1 |
| S11 | **KPI & capacity dashboard** — the two contractual KPIs against target, machine-hour capacity model, 1–3 month forecast with breach recommendations, drill-through | Management, Yard Manager | 1 |
| S12 | **Admin: master data, users, integration health** *(new)* — MDM, RBAC, adapter status, replay, error queues, degraded-mode controls | IT Admin | 1 |
| S13 | **Simulation studio** *(new)* — scenario builder for volume, machines, shifts, layout, appointment profile; discrete-event results | Management, Planner | 2 |

## 12.1 Roles

Nine roles, up from six. New: **Customs Coordinator**, **Broker (external, read-mostly)**, **Finance (detention audit)**. Retained: Yard Manager, Planner, Operator, Gate Clerk, IT Admin, Management.

**RBAC rules.** Every action attributed to an authenticated user; audit immutable and append-only. Weight changes take effect at the next plan generation, never retroactively against a published plan. Manual overrides require a reason code from a controlled list. Operator sessions device-bound; operators see only their own queue. Permission changes are themselves audited. External broker access scoped to their own consignments only.

---

# PART VI — INTEGRATION

## 13. Integration architecture

### 13.1 Interfaces

| Interface | Direction | Standard / mechanism | Phase |
|---|---|---|---|
| SAP inbound deliveries, orders, priorities | In | IDoc (DELVRY / DESADV / ORDERS) or OData via SAP Integration Suite | 1 |
| SAP outbound orders — all three flows | In | IDoc / OData | 1 |
| **SAP goods receipt trigger** | Out | Confirm unload / receipt posting — **decision D-03: does YMS own this?** | 1 |
| Terminal appointment (*turno*) and gate-out | In/Out | Per-terminal adapter; API where available, portal fallback where not | 1 |
| Vessel schedule and ETA | In | Carrier/terminal feed; **IFTSTA** where available | 1 |
| Detention terms and last-free-day | In | Carrier API/EDI; manual master fallback | 1 |
| **Empty release / acceptance authorisation** | In | **COPARN** | 2 |
| **Gate-in / gate-out confirmation** | Out | **CODECO** (including internal facility moves via the dedicated qualifier) | 2 |
| Vessel discharge confirmation | In | **COARRI** | 2 |
| Customs channel, authorisation, libramiento | In | Broker system or ARCA service integration | 1 |
| **PEMA seal integrity** | In | Seal provider feed | 1 (if bonded) |
| Drayage driver ETA / geofence | In | Telematics or driver app | 1 |
| Machine position and telemetry | In | RTLS / GPS / CAN telemetry | 2 |
| Gate and cab OCR reads | In | OCR platform | 2 |
| Weather (wind) | In | Weather API | 1 |
| **TMS-ready shipment events** | Out/In | OTM-compatible object model, REST/JSON or GLogXML | 3 |
| BI / analytics feed | Out | Event stream + reporting store | 2 |

### 13.2 Integration engineering rules

Every inbound interface: idempotent by natural key; replayable; failures to a dead-letter queue with alerting; a scheduled reconciliation job that compares system state against source of record and reports drift. No interface is considered complete without its reconciliation job — this is what prevents silent divergence.

### 13.3 OTM object mapping (Phase 3 readiness)

| YOS object | OTM object | Direction |
|---|---|---|
| `Order` (inbound/outbound) | Order Release | In |
| Drayage or transfer leg | Shipment / Order Movement | In |
| `Facility`, `Depot`, terminal | Location | Both |
| `Container` | Equipment / Equipment Reference Unit | Both |
| `Visit`, gate-in/out, staged, loaded | Shipment Status / Tracking Event | Out |
| `Appointment` | Appointment / Stop time window | Both |
| Carrier | Service Provider | In |

**Division of responsibility.** OTM (or Blue Yonder) would own drayage tendering, rating, outbound routing and freight audit. YOS retains slot assignment, sequencing, machine and operator dispatch, dig-out prediction, segregation compliance and yard inventory — none of which TMS yard modules model at the required depth. Publication mechanism: GLogXML transmissions or REST via an integration cloud service, with YOS as the authoritative source of yard events.

---

# PART VII — NON-FUNCTIONAL REQUIREMENTS

| Category | Requirement |
|---|---|
| Performance | Nightly plan (≤300 moves, 1,200 containers) < 60 s; intraday replan < 10 s; map interaction < 200 ms; gate transaction screen response < 500 ms |
| Availability | 99.5% target, and **the yard must remain operable when the system is not** — see degraded mode |
| **Degraded mode** | Printable plan and gate log; manual capture forms; reconciliation workflow on recovery; drill tested quarterly |
| Auditability | Immutable append-only; every plan reproducible from inputs plus weight snapshot; customs records retained per statutory period with legal hold |
| Security | RBAC per §12.1; device binding; SSO-ready; least privilege on integrations; external broker access strictly scoped |
| Data protection | Driver and operator personal data handled under Argentine personal-data law; documented lawful basis, retention limits, subject-access process |
| Data residency | **Decision D-04** — confirm whether Argentine hosting is required |
| DR | RTO 4 h, RPO 15 min (to confirm); documented and tested runbook |
| Localisation | es-AR primary for operators, gate and management; metric units; CUIT identifiers; Argentine date/number formats; America/Argentina/Buenos_Aires throughout |
| Configurability | Coverage measured against the client-signed **Parameter Register**, not an internal factor list (see §16) |
| Scalability | Single facility at Phase 1; `facilityId` on all entities from day one; capacity model validated to 2,000 containers and 6 machines |
| Observability | Structured logging, distributed tracing, SLO alerting on plan generation, replan latency, integration lag and gate transaction time |
| Devices | Ruggedised tablets, sunlight-readable, glove-operable, cab-mounted, charging provisioned; connectivity coverage survey completed before Phase 1 build |

---

# PART VIII — KPI DEFINITIONS

## 14. The contractual metrics, formally defined

Two of these are contractual. They must be defined before build, not after dispute.

### 14.1 Truck turnaround time — target 15 minutes

- **Clock start (t₀):** truck's arrival at the facility queue geofence, or first appearance in the gate queue, whichever is earlier.
- **Clock stop (t₁):** exit gate barrier release.
- **Reported as:** P50 and P90, separately by visit purpose (inbound drop, empty return, full transfer, customer pickup) and by hour of day.
- **Documented exclusions:** driver-caused delay (missing documents, wrong container, unauthorised driver), customs intervention, appointment no-show or early arrival outside the booked window, force majeure. **Exclusions are recorded per visit and reported transparently — excluded time is shown, not hidden.**
- **Instrument:** geofence plus gate transaction timestamps plus barrier events.
- **Baseline requirement:** minimum 4 weeks of current-state measurement before go-live. No improvement claim without it.

### 14.2 Machine job cycle — target 5 minutes

- **Clock start:** operator accepts the instruction.
- **Clock stop:** operator confirms completion.
- **Includes:** travel to pick-up, lift, travel to set-down, set-down, confirmation.
- **Excludes:** idle time between instructions, breaks, refuelling, faults — reported separately as utilisation.
- **Reported as:** P50 and P90 by move type, zone pair and machine. A single blended average is not accepted, because a `LOAD_OUTBOUND` from staging and a `RESHUFFLE` at tier 4 are not comparable work.

### 14.3 Supporting KPI set

**Plan quality:** plan adherence %, plan stability index (revisions per published move), rehandles per productive move, predicted vs. actual rehandles, ETA forecast bias by carrier.
**Flow:** on-time staging %, gate queue depth by hour, appointment adherence by carrier, no-show rate, dwell distribution by consignee and by customs channel.
**Capacity:** machine-hours required vs. available, moves per machine-hour, machine utilisation %, occupancy % by zone against ceiling.
**Cost:** detention exposure at risk (USD), detention invoiced vs. avoided vs. disputed, cost per move.
**Integrity:** position accuracy %, mean time to detect a discrepancy, exceptions by type.
**Safety:** incidents, near-misses, no-go-zone violations.

Every KPI carries a written formula, an owner, and drill-through to the underlying audit records.

---

# PART IX — WHAT HAS TO BE DONE

## 15. Workstreams and phasing

Eight workstreams. Durations are indicative and assume the team shape in §15.6.

### Phase 0 — Discovery + demonstrable prototype · 5–6 weeks

**Purpose:** close the blocking unknowns and put a working narrative in front of the client.

| Workstream | Deliverables |
|---|---|
| WS1 Discovery | Answers to decisions **D-01 to D-05** (§17); site survey (geometry, aisles, equipment, connectivity); 4-week baseline measurement started; peak-hour arrival profile; detention tariff extract; terminal capability matrix |
| WS2 Prototype | Screens S1, S4, S5, S6, S7 on seeded simulation data; engine passes 1, 2, 2b, deterministic tie-breaks, explainability; three disruption scenarios; role switcher |
| WS3 Analysis | **Machine-hour capacity model** for current and 1,200-container states; staging sizing calculation; layout re-cut proposal against reach envelopes |
| WS4 Commercial | Parameter Register v1 drafted with the client; competitive positioning vs. Blue Yonder YMS; phased cost and effort estimate |

**Phase 0 exit criteria:** D-01 and D-02 answered; capacity model reviewed and accepted by the client's operations lead; prototype demonstrates the night-plan → smooth-morning → disruption → replan → KPI narrative end to end; Parameter Register signed in draft.

### Phase 1 — Pilot MVP · 16–20 weeks

**Purpose:** run one zone and two machines in real operation, with real integration, and prove the KPIs.

| Priority | Scope |
|---|---|
| P0 | M1 (layout twin with reach envelopes and capacity charts) · M2 (gate, visit, appointment, EIR — full) · M4 (engine with stability control, robustness, infeasibility handling) · M5 (mobile with identification chain and exception path) · M6 (free-time engine, tiered tariffs, empty return) · M7 (yard audit, exception taxonomy, initial inventory load) · M8 (map, plan view, KPI dashboard, machine-hour capacity model) · M9 (SAP, terminal adapter for the primary terminal, MDM, RBAC, audit, integration health, degraded mode) |
| P0 conditional | M3 in full if the facility is bonded |
| Deferred to Phase 2 | Simulation studio, WhatsApp notifications, telematics, EDI, invoice audit, safety interlocks |

**Pilot definition:** one zone, two machines, one shift, four weeks of parallel running against the current manual process, with the yard-audit module reconciling nightly.

**Pilot exit criteria:**
- Truck turn P50 within 15 min and P90 within 22 min for pre-staged outbound visits
- Machine job cycle P50 within 5.5 min for `RETRIEVE_STAGE` and `LOAD_OUTBOUND`
- Plan adherence ≥ 85%; plan stability index ≤ 0.4 revisions per published move
- Position accuracy ≥ 99% at nightly audit
- Zero detention breaches attributable to sequencing
- Operator adoption ≥ 95% of moves executed through the tablet, not from memory

The last criterion is the one that actually predicts success.

### Phase 2 — Production rollout · 14–18 weeks

Full yard, all zones, all shifts. Adds: simulation studio (M8.9); telematics and OCR (M9.5); carrier EDI — COPARN, CODECO, COARRI (M9.4); detention invoice audit (M6.8); housekeeping/pre-marshalling (M4.14); calibration loop (M4.17); notification and escalation including WhatsApp (M9.10); safety interlocks (M5.10); driver self-service (M2.13); remaining terminal adapters; broker portal.

**Cutover.** Wall-to-wall physical inventory audit of the full yard using M7.7, executed over a weekend with a documented freeze; parallel run for two weeks; degraded-mode drill before go-live.

### Phase 3 — Optimise & extend · continuous

OTM/TMS event integration (M9.6); trade-off frontier view (M4.18); advanced analytics and BI; multi-facility; reefer and weighbridge if brought into scope; ML-based ETA and dwell prediction on accumulated data.

### 15.6 Team shape (Phase 1)

Product Manager · Solution Architect · Optimisation Engineer (2) · Backend (3) · Frontend (2) · Mobile (1) · Integration/SAP (2) · QA (2) · UX (1) · Domain SME — Argentine customs & port operations (part-time, essential) · Change Manager (part-time from mid-Phase 1).

The Argentine customs and port SME is not optional. Half the P0 gaps in this document exist because that perspective was missing from v1.0.

## 16. The "80% out of the box" commitment

PRD v1.0 claimed 80% coverage by counting 16 of its own 20 factors. That is self-referential and, as a contractual commitment, unbounded.

**Replace with:** a **Parameter Register** — a client-signed list of every operational factor the client considers relevant to placement and sequencing, each classified as:

| Classification | Meaning |
|---|---|
| **Covered OOB** | Ships as a standard weighted factor or hard constraint |
| **Configurable** | Achievable through the no-code custom-factor builder |
| **Custom development** | Requires code; scoped and priced separately |
| **Out of scope** | Agreed as not applicable |

The 80% commitment is then measured as `(Covered OOB + Configurable) / Total Register`, against a signed, closed list. This converts an open liability into a testable acceptance criterion. Register drafted in Phase 0, signed before Phase 1 build starts.

## 17. Decisions required from the client

| ID | Decision | Blocks | Needed by |
|---|---|---|---|
| **D-01** | Live unload vs. drop-and-go inbound; number of receiving positions | Gate design, machine capacity model, the 15-min KPI itself | Phase 0 wk 2 |
| **D-02** | Depósito fiscal status; on-site red/orange inspection under RG 5644/2025 | Whether M3 is in scope — largest scope item in the programme | Phase 0 wk 3 |
| **D-03** | Does YOS trigger SAP goods receipt and own unload-to-dock handoff? | SAP integration scope | Phase 0 wk 4 |
| **D-04** | Hosting and data residency | Architecture, procurement | Phase 0 wk 4 |
| **D-05** | Equipment fleet: models, capacity charts, count, shift pattern | Hard constraints C3/C4, entire capacity model | Phase 0 wk 2 |
| D-06 | Which terminals feed the facility, and therefore customs jurisdiction | Terminal adapters, jurisdiction validation | Phase 0 wk 3 |
| D-07 | Reefers in or out of scope | Schema, zones, monitoring | Phase 0 wk 5 |
| D-08 | Devices: existing or procurement | Mobile build, procurement lead time | Phase 1 wk 1 |
| D-09 | Blue Yonder: what is deployed and contracted; is BY YMS a live alternative | Positioning, architecture assumptions | Phase 0 wk 4 |
| D-10 | Labour agreement constraints on shifts, breaks, overtime | Constraint C10, planning feasibility | Phase 1 wk 2 |

## 18. Top risks

| # | Risk | Impact | Mitigation |
|---|---|---|---|
| R1 | **Machine capacity, not software, is the real constraint at 1,200 containers** | Client expects software to solve a physics problem; KPIs missed | Present the machine-hour model in Phase 0. Be explicit that software delivers 15–25% of machine-minutes, not a doubling |
| R2 | Bonded status discovered late | Major rework; potential regulatory non-compliance | D-02 answered in Phase 0 week 3; design M3 interfaces even if deferred |
| R3 | **Operator non-adoption** — working from memory instead of the tablet | Product delivers nothing regardless of quality | Change management from mid-Phase 1; operators in design sessions; adoption as a pilot exit criterion; supervisor dashboard on bypass rate |
| R4 | Container identification unreliable in practice | Yard stalls or data corrupts | Gate-side OCR as authoritative; authorised exception path with photo; yard audit as the safety net |
| R5 | Terminal integration unavailable — no API, portal only | Manual data entry undermines the plan | Capability matrix in Phase 0; portal fallback designed in; manual entry treated as a supported path, not a failure |
| R6 | **Plan nervousness destroys operator trust** | Adoption collapses | Stability control (§11.5) is P0, tuned during pilot, with stability index as a monitored KPI |
| R7 | Detention baseline unavailable or unreliable | ROI unprovable, commercial claim collapses | Baseline measurement starts Phase 0 week 1; invoice audit provides independent verification |
| R8 | Yard inventory drift from day one | Every plan invalid | Yard audit is P0, not Phase 2; wall-to-wall count at cutover; position accuracy monitored daily |
| R9 | Parameter Register unsigned, 80% claim disputed | Contractual exposure | Signed before Phase 1 build; classification method agreed in writing |
| R10 | Regulatory change (Argentine trade and customs rules have moved repeatedly since 2023) | Compliance logic outdated | Externalise all regulatory rules to configuration; retain the customs SME; quarterly regulatory review |

## 19. Acceptance criteria

### Phase 0 (prototype)
| # | Criterion |
|---|---|
| AC-0.1 | All nine roles selectable, each showing role-appropriate screens per the RBAC matrix |
| AC-0.2 | Nightly plan generation produces a sequenced move list, operator Gantt, projected KPIs with confidence bands, and a frozen weight snapshot |
| AC-0.3 | Yard map renders configurable blocks/rows/tiers **within valid reach envelopes**, with status colours, search/filter and click-through detail including `whyHere` |
| AC-0.4 | Operator flow completes instruction → identification (including one rejected mismatch and one authorised exception) → damage photo → done |
| AC-0.5 | Each disruption type produces a visible replan diff and an audit entry; in-progress moves are never cancelled; **stability rules demonstrably suppress a low-value replan** |
| AC-0.6 | Weight changes and a new custom factor change a simulated plan with no code edits, shown side-by-side against current weights |
| AC-0.7 | Machine-hour capacity model produces a defensible answer to "can we handle 1,200?" with stated assumptions |
| AC-0.8 | All seed container IDs pass ISO 6346 check-digit validation |

### Phase 1 (pilot go-live)
| # | Criterion |
|---|---|
| AC-1.1 | Visit lifecycle instrumented end to end; turn time computed per §14.1 with exclusions recorded and visible |
| AC-1.2 | Both contractual KPIs measured against the pre-go-live baseline and reported to the pilot exit thresholds |
| AC-1.3 | Hard constraints C1–C12 enforced; every attempted violation logged with the blocking constraint named |
| AC-1.4 | Free-time engine reproduces last-free-day for a sample of 50 containers across ≥3 carriers, matching carrier records exactly |
| AC-1.5 | Empty return executes against a nominated depot and window, including one redirection event handled without manual replanning |
| AC-1.6 | Yard audit detects a deliberately introduced position discrepancy within one audit cycle and resolves it through the workflow |
| AC-1.7 | SAP integration is idempotent under replay; reconciliation job reports zero unexplained drift over 14 days |
| AC-1.8 | Degraded-mode drill executed: yard operated for 2 hours on fallback, then reconciled with no data loss |
| AC-1.9 | Plan stability index ≤ 0.4 revisions per published move over the pilot period |
| AC-1.10 | Parameter Register coverage verified at ≥ 80% (Covered OOB + Configurable) |
| AC-1.11 | Operator adoption ≥ 95% of moves executed through the tablet |
| AC-1.12 | Full es-AR localisation on operator and gate surfaces, reviewed by a native operational user |

---

## 20. Summary of changes from v1.0

| | v1.0 | v2.0 |
|---|---|---|
| Modules | Implicit, 5 screens | **9 explicit modules** |
| Entities | 8 | **21** |
| Screens | 5 | **13** |
| Roles | 6 | **9** |
| Hard constraints | 6 | **12** (adds reach depth, weight-vs-reach, size compatibility, customs control, labour, wind, utilisation ceiling) |
| Engine passes | 3 | **3 + sequencing stage + improvement pass + stability controller** |
| Gate module | absent | **full module, owns the 15-min KPI** |
| Customs | one status field | **full module, conditional on bonded status** |
| Equipment | text string on operator record | **first-class entity with capacity chart** |
| Capacity story | slot count vs. trend line | **machine-hour model + discrete-event simulation** |
| Detention | flat rate, "return to port" | **tiered tariffs, free-time rule engine, depot and window management, invoice audit** |
| Inventory integrity | absent | **module M7, P0** |
| Degraded mode | absent | **specified and drill-tested** |
| Programme | absent | **4 phases, 8 workstreams, exit criteria, 10 decisions, 10 risks** |
| 80% claim | 16 of our own 20 factors | **client-signed Parameter Register** |

*End of PRD v2.0.*
