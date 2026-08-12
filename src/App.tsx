import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import NightPlanner from "@/screens/NightPlanner"
import YardMap from "@/screens/YardMap"
import GateConsole from "@/screens/GateConsole"
import ControlTower from "@/screens/ControlTower"
import OperatorTablet from "@/screens/OperatorTablet"
import SettingsScreen from "@/screens/Settings"

type Screen = "plan" | "yard" | "gate" | "tower" | "operator" | "settings"
type Persona = "manager" | "ops" | "operator"

const PERSONAS: { id: Persona; name: string; sub: string; screens: Screen[] | "*" }[] = [
  { id: "manager", name: "Manager", sub: "Yard Manager · full authority", screens: "*" },
  { id: "ops", name: "Ops", sub: "Gate & yard front line", screens: ["yard", "gate"] },
  { id: "operator", name: "Operator", sub: "Tablet · device-bound", screens: ["operator"] },
]

const NAV_GROUPS = [
  { label: "Today's operations", items: [
    { id: "tower" as Screen, name: "Control Tower", crumb: "Control Tower", badge: 8, badgeBg: "brand" as const },
    { id: "plan" as Screen, name: "Night-before Plan", crumb: "Night-before Plan", badge: 96, badgeBg: "secondary" as const },
  ]},
  { label: "Yard", items: [
    { id: "yard" as Screen, name: "Yard Map", crumb: "Yard Map" },
  ]},
  { label: "Movement", items: [
    { id: "gate" as Screen, name: "Gate & Appointments", crumb: "Gate & Appointments", badge: 2, badgeBg: "brand" as const },
    { id: "operator" as Screen, name: "Operator Tablet", crumb: "Operator Tablet" },
  ]},
  { label: "Configuration", items: [
    { id: "settings" as Screen, name: "Settings", crumb: "Settings" },
  ]},
]

const STORY = [
  { screen: "plan" as Screen, step: "Step 1 of 5", title: "Night-before plan — 96 moves, ranked", persona: "Yard Manager · Martín R." },
  { screen: "yard" as Screen, step: "Step 2 of 5", title: "Yard state at shift start", persona: "Yard Manager · Martín R." },
  { screen: "gate" as Screen, step: "Step 3 of 5", title: "Morning arrivals against the plan", persona: "Gate & Yard Ops · Diego V." },
  { screen: "tower" as Screen, step: "Step 4 of 5", title: "RS-03 fault — 14 moves replanned", persona: "Yard Manager · Martín R." },
  { screen: "operator" as Screen, step: "Step 5 of 5", title: "MV-1044 in the cab — OCR mismatch", persona: "Operator · R. Giménez" },
]

function allowed(persona: Persona, screen: Screen): boolean {
  if (screen === "settings") return persona === "manager"
  const p = PERSONAS.find(x => x.id === persona)!
  return p.screens === "*" || (p.screens as Screen[]).includes(screen)
}

export default function App() {
  const [persona, setPersona] = useState<Persona>("manager")
  const [screen, setScreen] = useState<Screen>("plan")
  const [focus, setFocus] = useState<string | null>(null)
  const [storyIdx, setStoryIdx] = useState(0)

  const story = STORY[storyIdx]
  const p = PERSONAS.find(x => x.id === persona)!
  const ok = allowed(persona, screen)
  let crumb = ""
  NAV_GROUPS.forEach(g => g.items.forEach(i => { if (i.id === screen) crumb = i.crumb }))

  function goStory(delta: number) {
    const next = Math.max(0, Math.min(STORY.length - 1, storyIdx + delta))
    setStoryIdx(next)
    setScreen(STORY[next].screen)
  }

  function navigate(target: string, f?: string) {
    const map: Record<string, Screen> = { S1:"yard", S2:"gate", S4:"plan", S6:"operator", S7:"tower", SET:"settings" }
    const s = (map[target] || target) as Screen
    if (!allowed(persona, s)) { setPersona("manager"); setScreen(s); setFocus(f || null); return }
    setScreen(s); setFocus(f || null)
  }

  function switchPersona(id: Persona) {
    const p2 = PERSONAS.find(x => x.id === id)!
    const first: Screen = p2.screens === "*" ? screen : (p2.screens as Screen[]).includes(screen) ? screen : p2.screens[0]
    setPersona(id); setScreen(first)
  }

  return (
    <div className="grid h-screen" style={{ gridTemplateColumns: "232px minmax(0,1fr)", gridTemplateRows: "48px 34px minmax(0,1fr)" }}>

      {/* Sidebar */}
      <div className="row-span-3 bg-sidebar-bg text-sidebar-text flex flex-col overflow-auto" style={{ gridRow: "1 / -1" }}>
        {/* Logo */}
        <div className="flex items-center gap-2.5 px-4 py-3 border-b border-sidebar-border">
          <div className="flex-none w-8 h-8 bg-[#d9291c] text-white flex items-center justify-center text-xs font-black tracking-tight">YO</div>
          <div className="flex flex-col gap-px leading-tight">
            <span className="font-black text-[13.5px] tracking-tight">YardOS</span>
            <span className="text-[9.5px] tracking-widest uppercase text-sidebar-faint">Operations Console</span>
          </div>
        </div>
        {/* Search */}
        <div className="px-3 py-2.5">
          <div className="flex items-center gap-2 bg-sidebar-active border border-[#253656] px-2 py-1.5 text-[11.5px] text-sidebar-faint">
            <span className="opacity-70">⌕</span>
            <span>Search container, plate, order…</span>
            <span className="ml-auto text-[10px] text-[#5c6c8a]">⌘K</span>
          </div>
        </div>
        {/* Nav */}
        {NAV_GROUPS.map(g => (
          <div key={g.label} className="mt-2.5">
            <div className="px-4 pb-1.5 text-[9.5px] tracking-[0.14em] uppercase text-sidebar-faint">{g.label}</div>
            {g.items.map(item => {
              const isAllowed = allowed(persona, item.id)
              const isActive = screen === item.id
              return (
                <button
                  key={item.id}
                  onClick={() => setScreen(item.id)}
                  className="w-full flex items-center gap-2.5 px-4 py-[7px] text-left text-[12.5px] transition-colors hover:bg-sidebar-active"
                  style={{
                    borderLeft: `3px solid ${isActive ? "#d9291c" : "transparent"}`,
                    background: isActive ? "#1a2842" : "transparent",
                    color: isActive ? "#fff" : isAllowed ? "#e6ebf2" : "#5c6c8a",
                    fontWeight: isActive ? 700 : 500,
                    opacity: isAllowed ? 1 : 0.5,
                  }}
                >
                  <span className="flex-none w-4 h-4 border border-current inline-block" style={{ borderColor: isActive ? "#d9291c" : "#5c6c8a" }} />
                  <span className="flex-1">{item.name}</span>
                  {"badge" in item && item.badge && (
                    <Badge variant={item.badgeBg === "brand" ? "brand" : "secondary"} className="text-[10px]">
                      {item.badge}
                    </Badge>
                  )}
                </button>
              )
            })}
          </div>
        ))}
        {/* Persona footer */}
        <div className="mt-auto px-3.5 py-3 border-t border-sidebar-border flex items-center gap-2.5">
          <div className="w-8 h-8 bg-[#d9291c] text-white flex items-center justify-center text-[11px] font-black">{p.name[0]}</div>
          <div className="flex flex-col leading-tight">
            <span className="text-[12px] font-bold">{p.name}</span>
            <span className="text-[10px] text-sidebar-muted">{p.sub}</span>
          </div>
        </div>
      </div>

      {/* Top bar */}
      <div className="col-start-2 flex items-center gap-3.5 px-4 border-b border-neutral-200 bg-white">
        <div className="flex items-baseline gap-2 text-[12.5px]">
          <span className="text-neutral-500">Today's Operations</span>
          <span className="text-neutral-400">/</span>
          <span className="font-bold text-neutral-900">{crumb}</span>
        </div>
        <div className="ml-auto flex items-center gap-2.5">
          <span className="flex items-center gap-1.5 text-[11px] text-neutral-600 px-2.5 py-1 bg-neutral-100 border border-neutral-200">
            <span className="w-1.5 h-1.5 bg-emerald-500 inline-block rounded-full" />
            Live sync · 12 s ago
          </span>
          <span className="text-[10px] tracking-widest uppercase text-neutral-500">Persona</span>
          <div className="flex">
            {PERSONAS.map((px, i) => (
              <button
                key={px.id}
                onClick={() => switchPersona(px.id)}
                className="text-[11px] px-3 py-1.5 border border-neutral-300 font-bold transition-colors"
                style={{
                  borderRight: i < PERSONAS.length - 1 ? "none" : undefined,
                  background: persona === px.id ? "#201e1d" : "transparent",
                  color: persona === px.id ? "#fff" : "#201e1d",
                }}
              >
                {px.name}
              </button>
            ))}
          </div>
          <button className="text-[11.5px] px-3 py-1.5 border border-neutral-300 bg-transparent text-neutral-900 hover:bg-neutral-50">↻ Refresh</button>
          <span className="text-base text-neutral-600 cursor-pointer">🔔</span>
        </div>
      </div>

      {/* Story bar */}
      <div className="col-start-2 flex items-center gap-3 px-4 border-b-2 border-amber-300 bg-amber-50">
        <Badge variant="amber" className="text-[9.5px]">Demo story</Badge>
        <span className="text-[12px] text-amber-900">
          {story.step} — <strong>{story.title}</strong> · {story.persona}
        </span>
        {focus && (
          <button
            onClick={() => setFocus(null)}
            className="text-[10.5px] px-2 py-0.5 border border-[#d9291c] bg-red-50 text-red-800 font-bold"
          >
            following {focus} ✕
          </button>
        )}
        <div className="ml-auto flex gap-2">
          <Button variant="outline" size="sm" onClick={() => goStory(-1)} className="text-amber-900 border-amber-400 text-[11.5px]">← Back</Button>
          <Button variant="default" size="sm" onClick={() => goStory(1)} className="text-[11.5px]">Next step →</Button>
        </div>
      </div>

      {/* Main content */}
      <div className="col-start-2 row-start-3 min-w-0 min-h-0 overflow-hidden relative">
        {!ok ? (
          <div className="h-full flex items-center px-6">
            <div className="max-w-md">
              <div className="font-black text-base">{p.name} cannot access {crumb}</div>
              <div className="text-[12.5px] leading-relaxed mt-2 text-neutral-600">Switch persona in the top bar to continue.</div>
            </div>
          </div>
        ) : screen === "plan" ? (
          <NightPlanner focus={focus} onNavigate={navigate} />
        ) : screen === "yard" ? (
          <YardMap focus={focus} onNavigate={navigate} />
        ) : screen === "gate" ? (
          <GateConsole focus={focus} />
        ) : screen === "tower" ? (
          <ControlTower focus={focus} />
        ) : screen === "operator" ? (
          <OperatorTablet />
        ) : screen === "settings" ? (
          <SettingsScreen />
        ) : null}
      </div>
    </div>
  )
}
