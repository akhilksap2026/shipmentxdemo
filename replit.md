# YardOS — Operations Console

A yard management system (YMS) prototype demonstrating multi-persona workflows for a container terminal yard.

## How to run

The app is pure static HTML/JS — no build step required.

**Workflow:** `Start application`  
**Command:** `python3 -m http.server 5000`  
**Entry point:** `http://localhost:5000/YardOS.dc.html`

Start the workflow and open the preview at `/YardOS.dc.html`.

## Stack

- **Runtime:** Custom `dc-runtime` (compiled React template engine, bundled in `support.js`)
- **Design system:** Modernist (`_ds/modernist-*/`) — flat, Archivo-typeface, red-on-white
- **Data:** Deterministic seed data in `yard-data.js` and `yard-ops.js` (no backend)
- **Templates:** `*.dc.html` files — each is a self-contained screen

## Screens

| File | Screen |
|---|---|
| `YardOS.dc.html` | Shell — nav, persona switcher, demo story bar |
| `S1YardMap.dc.html` | Yard Map |
| `S2GateConsole.dc.html` | Gate & Appointments |
| `S4NightPlanner.dc.html` | Night-before Plan |
| `S6OperatorMobile.dc.html` | Operator Tablet |
| `S7DisruptionTower.dc.html` | Disruption Control Tower |
| `Settings.dc.html` | Settings |

## Personas

Three personas selectable in the top bar:

- **Manager** — full access to all screens
- **Ops** — Yard Map + Gate only
- **Operator** — Operator Tablet only

## Demo story

The yellow bar steps through a 5-step narrative (Night-before Plan → Yard Map → Gate → Control Tower → Operator Tablet). Use **Next step →** / **← Back to story** to navigate.

## User preferences

- UI components should use shadcn/ui where possible; only build custom if shadcn doesn't provide it.
