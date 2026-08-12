import { useState, useEffect, useRef } from "react"
import { DataProvider, useData } from "@/lib/DataContext"
import type { RefreshSlice } from "@/lib/DataContext"
import NightPlanner from "@/screens/NightPlanner"
import YardMap from "@/screens/YardMap"
import GateConsole from "@/screens/GateConsole"
import ControlTower from "@/screens/ControlTower"
import OperatorTablet from "@/screens/OperatorTablet"
import SettingsScreen from "@/screens/Settings"
import CommandPalette from "@/components/CommandPalette"

type Screen  = "plan" | "yard" | "gate" | "tower" | "operator" | "settings"
type Persona = "manager" | "ops" | "operator"

const PERSONAS: { id: Persona; name: string; sub: string; screens: Screen[] | "*" }[] = [
  { id: "manager",  name: "Manager",  sub: "Yard Manager · full authority", screens: "*" },
  { id: "ops",      name: "Ops",      sub: "Gate & yard front line",        screens: ["yard", "gate"] },
  { id: "operator", name: "Operator", sub: "Tablet · device-bound",         screens: ["operator"] },
]

const NAV_ITEMS: { id: Screen; group: string; name: string; crumb: string; alert?: boolean }[] = [
  { id: "tower",    group: "Today's operations", name: "Control Tower",      crumb: "Control Tower",      alert: true },
  { id: "plan",     group: "Today's operations", name: "Night-before Plan",  crumb: "Night-before Plan"  },
  { id: "yard",     group: "Yard",               name: "Yard Map",           crumb: "Yard Map"           },
  { id: "gate",     group: "Movement",           name: "Gate & Appointments",crumb: "Gate & Appointments",alert: true },
  { id: "operator", group: "Movement",           name: "Operator Tablet",    crumb: "Operator Tablet"    },
  { id: "settings", group: "Configuration",      name: "Settings",           crumb: "Settings"           },
]
const NAV_GROUPS = [...new Set(NAV_ITEMS.map(i => i.group))]

const STORY = [
  { screen: "plan"     as Screen, step: "Step 1 of 5", title: "Night-before plan — 96 moves, ranked",   persona: "Yard Manager · Martín R." },
  { screen: "yard"     as Screen, step: "Step 2 of 5", title: "Yard state at shift start",               persona: "Yard Manager · Martín R." },
  { screen: "gate"     as Screen, step: "Step 3 of 5", title: "Morning arrivals against the plan",       persona: "Gate & Yard Ops · Diego V." },
  { screen: "tower"    as Screen, step: "Step 4 of 5", title: "RS-03 fault — 14 moves replanned",        persona: "Yard Manager · Martín R." },
  { screen: "operator" as Screen, step: "Step 5 of 5", title: "MV-1028 in the cab — OCR mismatch",       persona: "Operator · R. Giménez" },
]

const ALL_SLICES: RefreshSlice[] = [
  "moves", "containers", "events", "visits", "lanes", "appointments", "diffRows", "operatorTasks",
]

function allowed(persona: Persona, screen: Screen): boolean {
  if (screen === "settings") return persona === "manager"
  const p = PERSONAS.find(x => x.id === persona)!
  return p.screens === "*" || (p.screens as Screen[]).includes(screen)
}

// ── Inner shell — lives inside DataProvider so it can call useData() ──────────
function AppShell() {
  const { moves, events, visits, refresh } = useData()

  const [persona,     setPersona]     = useState<Persona>("manager")
  const [screen,      setScreen]      = useState<Screen>("plan")
  const [focus,       setFocus]       = useState<string | null>(null)
  const [storyIdx,    setStoryIdx]    = useState(0)
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [refreshing,  setRefreshing]  = useState(false)
  const [syncLabel,   setSyncLabel]   = useState("just now")
  const lastSyncRef = useRef(Date.now())

  // ── Badge counts ─────────────────────────────────────────────────────────────
  const BADGE_COUNT: Partial<Record<Screen, number>> = {
    tower: events.filter(e => e.state === "awaiting").length || events.length,
    plan:  moves.length,
    gate:  visits.filter(v => ["IN_QUEUE", "APPROACHING", "EXPECTED"].includes(v.state)).length,
  }

  // ── Live-sync label ───────────────────────────────────────────────────────────
  useEffect(() => {
    const t = setInterval(() => {
      const s = Math.floor((Date.now() - lastSyncRef.current) / 1000)
      setSyncLabel(s < 60 ? `${s}s ago` : `${Math.floor(s / 60)}m ago`)
    }, 10_000)
    return () => clearInterval(t)
  }, [])

  // ── ⌘K shortcut ──────────────────────────────────────────────────────────────
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault()
        setPaletteOpen(v => !v)
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [])

  // ── Handlers ─────────────────────────────────────────────────────────────────
  async function handleRefresh() {
    if (refreshing) return
    setRefreshing(true)
    setSyncLabel("syncing…")
    try {
      await refresh(ALL_SLICES)
      lastSyncRef.current = Date.now()
      setSyncLabel("just now")
    } finally {
      setRefreshing(false)
    }
  }

  function goStory(delta: number) {
    const next = Math.max(0, Math.min(STORY.length - 1, storyIdx + delta))
    setStoryIdx(next)
    setScreen(STORY[next].screen)
  }

  function navigate(target: string, f?: string) {
    const map: Record<string, Screen> = {
      S1: "yard", S2: "gate", S4: "plan", S6: "operator", S7: "tower", SET: "settings",
    }
    const s = (map[target] || target) as Screen
    if (!allowed(persona, s)) { setPersona("manager"); setScreen(s); setFocus(f || null); return }
    setScreen(s); setFocus(f || null)
  }

  function switchPersona(id: Persona) {
    const p2 = PERSONAS.find(x => x.id === id)!
    const first: Screen = p2.screens === "*"
      ? screen
      : (p2.screens as Screen[]).includes(screen) ? screen : (p2.screens as Screen[])[0]
    setPersona(id); setScreen(first)
  }

  const story = STORY[storyIdx]
  const p     = PERSONAS.find(x => x.id === persona)!
  const ok    = allowed(persona, screen)
  const crumb = NAV_ITEMS.find(i => i.id === screen)?.crumb ?? ""

  return (
    <>
      <CommandPalette
        open={paletteOpen}
        onClose={() => setPaletteOpen(false)}
        onNavigate={(target, f) => { navigate(target, f); setPaletteOpen(false) }}
      />

      <div
        className="grid h-screen overflow-hidden"
        style={{ gridTemplateColumns: "220px minmax(0,1fr)", gridTemplateRows: "44px 34px minmax(0,1fr)" }}
      >
        {/* ── Sidebar ───────────────────────────────────────────────────────── */}
        <div
          className="flex flex-col overflow-y-auto overflow-x-hidden"
          style={{ gridRow: "1 / -1", background: "#0f1117", borderRight: "1px solid rgba(255,255,255,0.06)" }}
        >
          {/* Logo */}
          <div className="flex items-center gap-2.5 px-4 py-3" style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
            <div
              className="flex-none flex items-center justify-center text-white font-black text-[11px] tracking-tight"
              style={{ width: 32, height: 32, background: "#dc2626" }}
            >
              YO
            </div>
            <div className="flex flex-col gap-0.5 leading-none">
              <span className="font-bold text-[13px] tracking-tight text-white">YardOS</span>
              <span className="ds-label" style={{ color: "#6b7280" }}>Operations Console</span>
            </div>
          </div>

          {/* Search */}
          <div className="px-3 py-2.5">
            <button
              onClick={() => setPaletteOpen(true)}
              className="w-full flex items-center gap-2 px-2.5 py-1.5 text-left"
              style={{
                background: "rgba(255,255,255,0.06)",
                border: "1px solid rgba(255,255,255,0.06)",
                fontSize: 11,
                color: "#6b7280",
              }}
            >
              <span style={{ opacity: 0.6, fontSize: 13 }}>⌕</span>
              <span>Search container, plate…</span>
              <span className="ml-auto font-mono" style={{ fontSize: 10, color: "#4b5563" }}>⌘K</span>
            </button>
          </div>

          {/* Nav */}
          {NAV_GROUPS.map(group => (
            <div key={group} className="mt-2">
              {/* Group label */}
              <div className="px-4 pb-1.5 ds-label" style={{ color: "#4b5563" }}>
                {group}
              </div>
              {NAV_ITEMS.filter(item => item.group === group).map(item => {
                const isAllowed = allowed(persona, item.id)
                const isActive  = screen === item.id
                const badge     = BADGE_COUNT[item.id]
                return (
                  <button
                    key={item.id}
                    onClick={() => { if (isAllowed) setScreen(item.id) }}
                    title={!isAllowed ? `${p.name} cannot access ${item.name}` : undefined}
                    className="w-full flex items-center gap-2 px-4 py-[7px] text-left"
                    style={{
                      fontSize: 12,
                      fontWeight: isActive ? 600 : 400,
                      color: isActive ? "#ffffff" : isAllowed ? "#9ca3af" : "#374151",
                      background: isActive ? "rgba(220,38,38,0.08)" : "transparent",
                      borderLeft: `2px solid ${isActive ? "#dc2626" : "transparent"}`,
                      opacity: isAllowed ? 1 : 0.4,
                      cursor: isAllowed ? "pointer" : "not-allowed",
                      paddingLeft: isActive ? 14 : 16,  /* account for 2px border */
                    }}
                  >
                    <span className="flex-1 truncate">{item.name}</span>
                    {badge != null && badge > 0 && (
                      <span
                        className="flex-none flex items-center justify-center font-semibold"
                        style={{
                          minWidth: 18,
                          height: 18,
                          borderRadius: 9,
                          fontSize: 10,
                          background: item.alert ? "#dc2626" : "rgba(255,255,255,0.15)",
                          color: "#fff",
                          padding: "0 5px",
                        }}
                      >
                        {badge}
                      </span>
                    )}
                  </button>
                )
              })}
            </div>
          ))}

          {/* User row — pinned to bottom */}
          <div
            className="mt-auto flex items-center gap-2.5 px-3.5 py-3"
            style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}
          >
            <div
              className="flex-none flex items-center justify-center text-white font-black text-[11px]"
              style={{ width: 32, height: 32, background: "#dc2626", borderRadius: 2 }}
            >
              {p.name[0]}
            </div>
            <div className="flex flex-col leading-tight min-w-0">
              <span className="text-[12px] font-semibold text-white truncate">{p.name}</span>
              <span className="text-[10px] truncate" style={{ color: "#6b7280" }}>{p.sub}</span>
            </div>
          </div>
        </div>

        {/* ── Topbar ────────────────────────────────────────────────────────── */}
        <div
          className="col-start-2 flex items-center gap-3 px-5 bg-white"
          style={{ borderBottom: "1px solid #e5e7eb", height: 44 }}
        >
          {/* Breadcrumb */}
          <div className="flex items-baseline gap-1.5" style={{ fontSize: 12 }}>
            <span style={{ color: "#6b7280" }}>Operations</span>
            <span style={{ color: "#d1d5db" }}>/</span>
            <span className="font-semibold" style={{ color: "#111827" }}>{crumb}</span>
          </div>

          <div className="ml-auto flex items-center gap-2">
            {/* Live sync */}
            <span
              className="flex items-center gap-1.5 px-2.5 py-1"
              style={{ fontSize: 11, color: "#6b7280", background: "#f9fafb", border: "1px solid #e5e7eb" }}
            >
              <span
                className="flex-none rounded-full"
                style={{ width: 6, height: 6, background: refreshing ? "#d97706" : "#22c55e" }}
              />
              Live · {syncLabel}
            </span>

            {/* Persona toggle group */}
            <div className="flex items-center gap-0 border" style={{ borderColor: "#e5e7eb", borderRadius: 5, overflow: "hidden" }}>
              <span className="ds-label px-2" style={{ color: "#9ca3af", borderRight: "1px solid #e5e7eb" }}>
                PERSONA
              </span>
              {PERSONAS.map(px => (
                <button
                  key={px.id}
                  onClick={() => switchPersona(px.id)}
                  className="px-3 py-1.5 font-semibold"
                  style={{
                    fontSize: 11,
                    background: persona === px.id ? "#111827" : "transparent",
                    color: persona === px.id ? "#fff" : "#374151",
                    borderRight: px.id !== "operator" ? "1px solid #e5e7eb" : "none",
                  }}
                >
                  {px.name}
                </button>
              ))}
            </div>

            {/* Refresh */}
            <button
              onClick={handleRefresh}
              disabled={refreshing}
              className="px-3 py-1.5 font-medium disabled:opacity-50"
              style={{
                fontSize: 11,
                background: "transparent",
                border: "1px solid #e5e7eb",
                color: "#374151",
                borderRadius: 5,
              }}
            >
              {refreshing ? "↻ Syncing…" : "↻ Refresh"}
            </button>

            {/* Bell */}
            <button
              aria-label="Notifications"
              className="px-1.5"
              style={{ fontSize: 14, color: "#9ca3af" }}
              onClick={() => {}}
            >
              🔔
            </button>
          </div>
        </div>

        {/* ── Story bar ─────────────────────────────────────────────────────── */}
        <div
          className="col-start-2 flex items-center gap-3 px-5"
          style={{
            background: "#fffbeb",
            borderBottom: "2px solid #fcd34d",
            height: 34,
          }}
        >
          <span
            className="font-semibold px-1.5 py-0.5 ds-label"
            style={{ background: "#fcd34d", color: "#92400e", letterSpacing: "0.06em" }}
          >
            DEMO
          </span>
          <span style={{ fontSize: 12, color: "#92400e" }}>
            {story.step} — <strong>{story.title}</strong>
          </span>
          <span style={{ fontSize: 11, color: "#a16207" }}>· {story.persona}</span>
          {focus && (
            <button
              onClick={() => setFocus(null)}
              className="font-semibold"
              style={{ fontSize: 10.5, padding: "1px 8px", border: "1px solid #dc2626", background: "#fef2f2", color: "#dc2626" }}
            >
              tracking {focus} ✕
            </button>
          )}
          <div className="ml-auto flex gap-2">
            <button
              onClick={() => goStory(-1)}
              className="px-3 py-1 font-medium"
              style={{ fontSize: 11, border: "1px solid #fcd34d", background: "transparent", color: "#92400e", borderRadius: 5 }}
            >
              ← Back
            </button>
            <button
              onClick={() => goStory(1)}
              className="px-3 py-1 font-semibold"
              style={{ fontSize: 11, background: "#111827", color: "#fff", border: "1px solid #111827", borderRadius: 5 }}
            >
              Next step →
            </button>
          </div>
        </div>

        {/* ── Main content ──────────────────────────────────────────────────── */}
        <div className="col-start-2 row-start-3 min-w-0 min-h-0 overflow-hidden relative" style={{ background: "#f4f5f7" }}>
          {!ok ? (
            <div className="h-full flex items-start p-5">
              <div
                className="p-4"
                style={{ background: "#fff", border: "1px solid #e5e7eb", maxWidth: 420 }}
              >
                <div className="font-semibold text-[13px] mb-1" style={{ color: "#111827" }}>
                  {p.name} cannot access {crumb}
                </div>
                <div style={{ fontSize: 12, color: "#6b7280" }}>
                  Switch persona in the top bar to continue.
                </div>
              </div>
            </div>
          ) : screen === "plan"     ? <NightPlanner  focus={focus} onNavigate={navigate} />
            : screen === "yard"     ? <YardMap        focus={focus} onNavigate={navigate} />
            : screen === "gate"     ? <GateConsole    focus={focus} />
            : screen === "tower"    ? <ControlTower   focus={focus} />
            : screen === "operator" ? <OperatorTablet />
            : screen === "settings" ? <SettingsScreen />
            : null}
        </div>
      </div>
    </>
  )
}

// ── Root ──────────────────────────────────────────────────────────────────────
export default function App() {
  return (
    <DataProvider>
      <AppShell />
    </DataProvider>
  )
}
