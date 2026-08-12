---
name: YardOS design system
description: Design token decisions, utility classes, and gotchas from the dense-operational DS spec applied across all screens
---

# YardOS Design System

## Source
`attached_assets/Pasted-Design-system-Dense-operational-dashboard-Apply-this-vi_1786559643602.txt`

## Utility classes (defined in src/index.css)
- `.ds-label` — 9px, 500 weight, 0.1em letter-spacing, uppercase, #9ca3af
- `.ds-kpi` — font-mono, 26px, 600 weight, leading-none
- `.ds-mono` — font-mono (JetBrains Mono)
- `.ds-th` — table header: bg-[#f9fafb], sticky, 9px uppercase 0.1em #9ca3af, px-3 py-2
- `.ds-td` — table cell: px-3 py-2, border-b #f3f4f6, min-height 38px
- `.ds-callout` — bg #fef2f2, border 1px #fecaca, radius 6px, p-3
- `.ds-callout-label` — 9px uppercase #dc2626

## Color tokens
- Page bg: #f4f5f7
- Card/panel bg: #ffffff  
- Table header bg: #f9fafb
- Completed row bg: #fafafa
- Table separator: #f3f4f6
- Border: #e5e7eb
- Accent: #dc2626 (NOT #d9291c — that was the old value, globally replaced via sed)
- Status (ONLY these six): blue #2563eb, purple #7c3aed, amber #d97706, green #059669, cyan #0891b2, red #dc2626

## Layout
- Sidebar: 220px, bg #0f1117
- Topbar: 44px
- Story bar: 34px
- Detail/side panels: 240–300px wide, white bg, 1px #e5e7eb left border

## Typography
- Base: 13px Inter
- All numbers/IDs/timestamps/routes/measurements: font-mono (JetBrains Mono)
- KPI numerals: font-mono font-semibold text-[26px] leading-none
- Labels: ds-label class (9px uppercase 0.1em #9ca3af)

## Buttons
- borderRadius: 5px on all
- Default: white bg, 1px #e5e7eb border, #374151 text
- Primary: #111827 bg, white text
- Danger: #dc2626 bg, white text
- Toggle groups (tabs, source selector, filter pills): single container with border 1px #e5e7eb + borderRadius 5 + overflow hidden; NO individual pill borders

## Gotchas
- `Number(seedTask.seq)` where seq is "07 of 24" returns NaN → use `parseInt(seedTask.seq)` instead
- shadow-2xl is ONLY permitted on the CommandPalette modal
- No rounded-xl, no gradient backgrounds, no shadows on table rows
- emergald/orange status colors must be mapped to #059669/#d97706 from allowed palette

**Why:**
The spec explicitly bans decorative shadow and gradient patterns to keep the operational dashboard readable under stress. The 6-color status palette is strict for at-a-glance accuracy.
