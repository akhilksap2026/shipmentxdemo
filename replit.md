# YardOS — Operations Console

A yard management system (YMS) prototype demonstrating multi-persona workflows for a container terminal yard.

## How to run

**Workflow:** `Start application`  
**Command:** `npm run dev`  
**Entry point:** `http://localhost:5000/`

Start the workflow and open the preview at `/`.

## Stack

- **Runtime:** Vite + React 18 + TypeScript
- **UI components:** shadcn/ui (Radix UI primitives) + Tailwind CSS
- **Data:** Deterministic seed data in `src/data/yard-data.ts` and `src/data/yard-ops.ts` (no backend)
- **Custom components:** Yard map front-view grid, Gantt timeline strip (no shadcn equivalent)

## Screens

| File | Screen |
|---|---|
| `src/App.tsx` | Shell — sidebar nav, persona switcher, demo story bar |
| `src/screens/NightPlanner.tsx` | Night-before Plan |
| `src/screens/YardMap.tsx` | Yard Map |
| `src/screens/GateConsole.tsx` | Gate & Appointments |
| `src/screens/ControlTower.tsx` | Control Tower |
| `src/screens/OperatorTablet.tsx` | Operator Tablet |
| `src/screens/Settings.tsx` | Settings |

## shadcn/ui components used

`Button`, `Badge`, `Input`, `Tabs`/`TabsList`/`TabsTrigger`/`TabsContent`, `Table`/`TableHeader`/`TableBody`/`TableRow`/`TableHead`/`TableCell`, `Select`, `Separator`

## Personas

Three personas selectable in the top bar:

- **Manager** — full access to all screens
- **Ops** — Yard Map + Gate only
- **Operator** — Operator Tablet only

## Demo story

The yellow bar steps through a 5-step narrative (Night-before Plan → Yard Map → Gate → Control Tower → Operator Tablet). Use **Next step →** / **← Back** to navigate.

## User preferences

- UI components should use shadcn/ui where possible; only build custom if shadcn doesn't provide it.
