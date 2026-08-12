# YOS Product Analysis & Streamlined Build Plan
## From 13-screen PRD to a clean, commercially viable SaaS

---

## 1. The core problem with the current state

Your PRD is excellent engineering documentation — but it describes an **enterprise system**, not a SaaS product. The gap between what's written and what sells comes down to three things:

**Too many screens.** 13 screens across 9 roles creates a product that feels like an ERP, not a modern SaaS tool. Your reference image (Celsar YMS) shows the right instinct: a dense but navigable left sidebar, a single main workspace, and contextual panels. Your current prototype has the same shell structure but tries to fill 13 separate rooms — most buyers will never see half of them before they stop clicking.

**Too many roles up front.** 9 roles (Yard Manager, Planner, Operator, Gate Clerk, Customs Coordinator, Broker, Finance, IT Admin, Management) is a permissions matrix that belongs in configuration, not in the product demo. For commercial viability, there are really **3 personas**: the person who plans (Planner/Manager), the person who executes (Operator/Gate Clerk), and the person who watches (Management/Finance). Build for these three; let RBAC narrow the view.

**The prototype uses a non-standard framework.** The `.dc.html` files use `DCLogic`, `sc-for`, `sc-if`, `dc-import` — a proprietary templating system that locks you into a specific tool. For a commercially viable SaaS, you need React (or Vue/Svelte), a real component library, and a build pipeline. The seed data layer (`yard-data.js`, `yard-ops.js`) is solid and portable, but the UI layer needs to be rebuilt.

---

## 2. What to keep vs. cut vs. merge

### KEEP — the daily operating loop (5 screens)

| Screen | Why it's essential | Commercial proof |
|---|---|---|
| **S4 Night Planner** | This IS the product. The committed nightly plan with explainable placements and frozen weight snapshots. Without this, there's nothing to sell. | "Show me tomorrow's plan" is the demo moment |
| **S7 Disruption Tower** | The real-time half of the product. Events come in, stability control suppresses or accepts replans, operators see the diff. This is what keeps the plan alive through a real day. | "What happens when something goes wrong?" is the buyer's second question |
| **S6 Operator Mobile** | Proves the system is actually used. Task queue, one-tap confirm, reason strings. Without operator adoption (≥95% target), the plan is fiction. | Mobile-first execution is the adoption lever |
| **S2 Gate Console** | The truck turn timer starts and stops here. Gate-in, identity, EIR, lane assignment, gate-out. This is where the 15-minute KPI lives. | Measurable from day 1 — this is the ROI proof |
| **S1 Yard Map** | Shared context layer. Click a container, see its history, placement reason, LFD, detention exposure. Links into every other screen. | Visual trust — "I can see my yard" |

### MERGE — fold into the core 5

| Current Screen | Merge Into | How |
|---|---|---|
| **S3 Appointments** | S2 Gate Console | Appointment board becomes a tab or panel within the gate view. The gate clerk manages both. |
| **S9 Detention** | S7 Disruption Tower + S1 Yard Map | Detention exposure appears as a filter/overlay on the yard map (colour-coded by LFD band) and as an alert category in the disruption tower. No standalone screen needed. |
| **S5 Config & Weights** | S4 Night Planner sidebar | Weight tuning is a planner activity. Put it in a "Configure" panel that slides out from the planner. The "Simulate weights" button already exists in your prototype. |
| **S8 Customs** | S7 Disruption Tower | Customs channel assignment is an event type. The inspection routing and hold/release workflow lives as a card in the disruption queue. The Compliance SKU enables these event types — it doesn't need its own screen. |

### DEFER — ship without these

| Screen | Why defer | When to build |
|---|---|---|
| **S10 Yard Audit** | Background process. Discrepancy detection runs automatically; results surface as alerts in S7. A dedicated audit screen can come in Release 2 when you have real inventory drift data. | Release 2 |
| **S12 Admin & Integrations** | A settings page behind a gear icon. Integration health is an ops concern, not a daily workflow. | Release 1 as a simple settings panel, not a full screen |
| **S13 Simulation Studio** | Intelligence SKU, priced separately at USD 30k/year. Build this after the core loop proves out during the pilot. | Release 2 |

**Result: 5 primary screens + 1 settings panel.** Down from 13. Same PRD coverage, half the surface area.

---

## 3. The streamlined user flow

The product has one story: **plan → execute → react → measure → plan again.**

```
EVENING                          MORNING                         ALL DAY
┌─────────────┐    publish    ┌──────────────┐    events     ┌──────────────┐
│ S4 PLANNER  │──────────────▶│ S6 OPERATOR  │─────────────▶│ S7 TOWER     │
│             │               │ S2 GATE      │              │              │
│ Generate    │               │              │              │ Suppress or  │
│ Review      │               │ Execute the  │              │ accept replan│
│ Tune weights│               │ plan. Truck  │              │ Diff visible │
│ Publish     │               │ turns happen │              │ Stability    │
└─────────────┘               └──────────────┘              └──────┬───────┘
      ▲                                                            │
      │                        ┌──────────────┐                    │
      │         measure        │ S1 YARD MAP  │◀───────────────────┘
      └────────────────────────│ KPI overlays │   context
                               │ Detention    │
                               │ Occupancy    │
                               └──────────────┘
```

### Navigation model

Replace the current 13-item sidebar with a **5-item primary nav**:

```
┌──────────────────────────────────────────────────────┐
│  YOS   Buenos Aires · Parts Import    Role ▾  ⚙️    │
├─────────┬────────────────────────────────────────────┤
│         │                                            │
│  🗺 Map  │                                            │
│  📋 Plan │         [ Active screen content ]          │
│  🚪 Gate │                                            │
│  📱 Ops  │                                            │
│  🔔 Tower│                                            │
│         │                                            │
│─────────│                                            │
│ Settings│                                            │
└─────────┴────────────────────────────────────────────┘
```

The role selector narrows visibility (operators see only Ops; gate clerks see Gate + Map), but the nav structure stays the same. No "locked screen" messages — you simply don't see what you can't access.

---

## 4. What to simplify on each screen

### S4 Night Planner — the money screen

**Keep:**
- Plan generation with metrics row (moves, machine hours, adherence, confidence)
- Move table with sequence, window, type, route, operator, estimated minutes
- Reason strings on every move (this is the P1 differentiator — "never a black box")
- Assumptions panel (frozen weight snapshot, machines available, shift pattern)
- Publish / Regenerate / Simulate actions

**Simplify:**
- Remove the type filter pills from the move table — use a single search box with smart parsing
- Remove the separate "Objective weights" display from the sidebar. Move it into the "Simulate weights" modal
- The exceptions panel (EX-01, EX-02, EX-03) should be inline alerts at the top of the move table, not a separate section

**Add (from reference UI):**
- A "Story mode" summary at the top: "Plan, filter, and fold today's 96 moves across 3 RS, 1 EH. Ranked by free-time urgency, detention cost, and equipment proximity." This is what the Celsar "AI Workload Builder" does well — a one-paragraph human-readable brief.

### S7 Disruption Tower — the trust screen

**Keep:**
- Event timeline with severity indicators
- Replan diff (cancelled, added, reassigned, frozen kept, delta minutes, adherence impact)
- Stability control verdicts (especially suppressed replans — "suppression is the feature")
- Smart recommendations panel

**Simplify:**
- Merge the current S8 Customs events and S9 Detention alerts into this screen as event categories
- Remove the separate "Live activity" ticker from the reference UI — it's noise. The event list IS the live activity
- Combine all event states (replanned, suppressed, awaiting) into a single filterable list with status badges

**Add:**
- A "Stability score" headline metric showing current plan stability index (target ≤0.4). This is your trust metric.

### S2 Gate Console

**Keep:**
- Visit lifecycle (EXPECTED → APPROACHING → IN_QUEUE → CHECKED_IN → AT_POSITION → SERVED → GATE_OUT)
- Turn time clock per visit
- Lane assignment and status
- EIR capture flow

**Simplify:**
- Fold S3 Appointments into a tab: "Visits" | "Appointments"
- Remove carrier performance breakdown from this screen — it belongs in KPI reporting
- The current 8-visit table is right. Don't overload it with detention or customs columns.

### S6 Operator Mobile

**Keep:**
- Current task card with from/to, container ID, weight, size, estimated minutes
- Reason string ("LFD in 9 h — staged ahead of the 08:40 appointment")
- Warning line when relevant ("Heavy unit: tier 3 at row 1 only")
- Queue count ("07 of 24")

**Simplify:**
- This should be one card at a time, not a scrollable list. The operator needs focus, not choice.
- Confirm → next task. That's it.
- Remove any settings or filters from this view entirely

### S1 Yard Map

**Keep:**
- Block/bay/row/tier visualisation with colour coding
- Click-through to container detail (carrier, consignee, LFD, hours remaining, placement reason)
- Zone overlays (hazmat, customs, empties)

**Simplify:**
- Remove the separate "Container 360" concept — the detail panel IS the container view
- Occupancy and detention data should be toggleable overlays, not separate sidebar widgets
- KPI summary (truck turn P50, job cycle P50, occupancy) belongs as a persistent top bar on the map, not a separate S11 screen

**Add:**
- Merge S11 KPI metrics as an overlay/mode toggle on the yard map. "Map" | "Dashboard" — two modes of the same screen.

---

## 5. Data layer — what's portable

Your `yard-data.js` and `yard-ops.js` are well-structured and can transfer directly into a React app:

- **CONTAINERS** (~700 generated) with valid ISO 6346 IDs, placement reasons, LFD bands
- **MOVES** (96 sequenced) with reason strings, operator assignments, state progression
- **VISITS** (8 in lifecycle) covering the full gate flow
- **EVENTS** (6 disruptions) demonstrating suppress, replan, and manual acknowledgement
- **DETENTION** (7 containers) across all risk bands
- **EQUIPMENT**, **OPERATORS**, **ZONES** — complete master data

This is excellent demo data. The only changes needed:
- Convert from ES module exports to a JSON seed file or React context provider
- Add a few more containers in the "breached" detention band to make the demo more dramatic
- Add 2-3 more visits in the "IN_QUEUE" and "CHECKED_IN" states to show gate pressure

---

## 6. Technical recommendation for the rebuild

**Framework:** React + TypeScript + Tailwind CSS + Shadcn/UI components
**Why:** Fastest path to a professional, themeable, accessible product. Shadcn gives you the data tables, command palettes, sheets, and dialogs you need without writing component infrastructure.

**State:** React Context for global state (current plan, container inventory, events), local state for UI concerns
**Routing:** 5 routes matching the 5 primary screens
**Mobile:** S6 Operator is a separate responsive layout; everything else is desktop-first

**The reference UI (Celsar) gets right:**
- Dense data tables with inline actions (not modals for everything)
- Persistent left sidebar with clear hierarchy
- Top summary bar with 3-4 headline metrics
- Status badges that use colour + text (not colour alone)
- A "story brief" paragraph at the top of planning screens

**The reference UI gets wrong (avoid these):**
- Too many sidebar items (the Celsar nav has ~15 items including sub-items)
- "Role preview" badges that clutter the header
- Separate screens for things that should be panels (AFIP & Documents is really a card in a queue)

---

## 7. What the final product information architecture looks like

```
YOS
├── Yard map (S1)
│   ├── Container detail panel (slide-out)
│   ├── Overlay toggles: Occupancy | Detention | Hazmat | Customs
│   └── Mode toggle: Map | Dashboard (replaces S11)
│
├── Plan (S4)
│   ├── Plan summary + story brief
│   ├── Move table with inline reason strings
│   ├── Configure panel (slide-out, replaces S5)
│   └── Actions: Simulate | Regenerate | Publish
│
├── Gate (S2)
│   ├── Tab: Live visits
│   ├── Tab: Appointments (absorbs S3)
│   └── Lane status bar
│
├── Execute (S6) — mobile-first
│   └── Single task card with confirm flow
│
├── Tower (S7)
│   ├── Event queue with status filters
│   ├── Replan diff panel
│   ├── Stability score metric
│   └── Includes: customs events (S8), detention alerts (S9), audit alerts (S10)
│
└── Settings (⚙️) — not a full screen
    ├── Weight configuration
    ├── Integration health
    ├── User management
    └── Shift and schedule rules
```

**5 screens. 1 settings panel. Everything else is a panel, overlay, tab, or event type within these.**

---

## 8. Recommended build sequence

| Phase | What | Duration | Demo moment |
|---|---|---|---|
| **1** | S4 Planner + data layer | 2 weeks | "Here's tomorrow's plan with 96 moves, every one explained" |
| **2** | S7 Tower + event engine | 2 weeks | "Equipment fails → 14 moves redistribute → stability holds" |
| **3** | S1 Yard Map + container detail | 1.5 weeks | "Click any container, see why it's there" |
| **4** | S6 Operator Mobile | 1 week | "One card, one confirm. That's the operator's whole day." |
| **5** | S2 Gate + Appointments | 1.5 weeks | "Truck in, truck out, 15 minutes, measured." |
| **6** | Settings + KPI overlay | 1 week | "Here's the value: turn time down 22%, detention avoided." |

**Total: ~9 weeks to a demo-ready product** that covers the full daily operating loop.

---

## 9. Elements to remove entirely

These add complexity without commercial value at launch:

1. **Broker (external) role** — defer to Release 2. External access requires auth infrastructure that slows the build.
2. **Detention standalone screen** (`S9Detention-standalone.dc.html`) — duplicate of S9, which itself gets merged.
3. **Detention & Empty Return standalone** (`Detention and Empty Return.html` — 400-line standalone) — same content, third copy.
4. **The "Bonded: YES/NO" toggle in the prototype header** — this is a configuration flag, not a runtime toggle. Move it to settings.
5. **The "Drop-and-go / Live Unload" toggle in the header** — same. Configuration, not a daily control.
6. **9 named roles in the demo** — show 3 personas in the demo (Planner, Operator, Manager). Full RBAC is backend logic, not demo UI.
7. **YardOS.dc.html's `dc-import` component system** — rebuild in React. The templating engine is a dependency you don't want.

---

## 10. Summary

The PRD is thorough and well-reasoned. The commercial challenge isn't what to build — it's what to show. A buyer looking at 13 screens sees an implementation project. A buyer looking at 5 screens that tell the story of their day sees a product they can adopt.

**The product thesis hasn't changed:** a committed nightly plan, a stability-controlled re-optimiser, explainable placements, and capacity measured in machine-hours.

**What changes is the surface:** fewer screens, merged workflows, contextual panels instead of standalone views, and a navigation model that mirrors the daily rhythm (plan → execute → react → observe) instead of the architectural layers (L1–L6).

Build the operating loop first. Everything else is a configuration screen or a reporting overlay.
