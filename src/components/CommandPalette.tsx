/**
 * CommandPalette — ⌘K search across containers, moves, visits, and events.
 *
 * Uses Radix Dialog for the modal shell and implements its own lightweight
 * list navigation so we avoid adding cmdk as a dependency.
 */
import { useState, useEffect, useRef, useMemo, KeyboardEvent } from "react"
import * as Dialog from "@radix-ui/react-dialog"
import { useData } from "@/lib/DataContext"
import { TYPE_LABEL } from "@/data/yard-data"

// ── Types ─────────────────────────────────────────────────────────────────────

type ResultKind = "container" | "move" | "visit" | "event"

interface SearchResult {
  id: string
  kind: ResultKind
  label: string
  sub: string
  /** Screen to navigate to */
  screen: string
  /** Focus token passed to the screen */
  focus: string
}

interface Props {
  open: boolean
  onClose: () => void
  onNavigate: (screen: string, focus?: string) => void
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const KIND_BADGE: Record<ResultKind, string> = {
  container: "Container",
  move: "Move",
  visit: "Visit",
  event: "Event",
}

// Status palette only — container=blue, move=purple, visit=green, event=red
const KIND_COLOR: Record<ResultKind, string> = {
  container: "#2563eb",
  move: "#7c3aed",
  visit: "#059669",
  event: "#dc2626",
}

const SCREEN_LABEL: Record<string, string> = {
  plan: "Night-before Plan",
  yard: "Yard Map",
  gate: "Gate & Appointments",
  tower: "Control Tower",
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function CommandPalette({ open, onClose, onNavigate }: Props) {
  const data = useData()
  const [query, setQuery] = useState("")
  const [activeIdx, setActiveIdx] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLUListElement>(null)

  // Reset state when dialog opens
  useEffect(() => {
    if (open) {
      setQuery("")
      setActiveIdx(0)
      // Small delay so the dialog animation finishes before focus
      setTimeout(() => inputRef.current?.focus(), 30)
    }
  }, [open])

  // Build search index lazily — memoised so it only runs when data changes
  const allResults = useMemo<SearchResult[]>(() => {
    const out: SearchResult[] = []

    // Containers → Yard Map
    for (const c of data.containers) {
      out.push({
        id: c.id,
        kind: "container",
        label: c.id,
        sub: `${c.address} · ${c.carrierName} · ${c.size} · ${c.status.replace("_", " ")}`,
        screen: "yard",
        focus: c.id,
      })
    }

    // Moves → Night-before Plan — focus by move ID so NightPlanner selects the exact record
    for (const m of data.moves) {
      out.push({
        id: m.id,
        kind: "move",
        label: m.id,
        sub: `${TYPE_LABEL[m.type] ?? m.type} · ${m.containerId} · ${m.from} → ${m.to} · ${m.operatorName}`,
        screen: "plan",
        focus: m.id,
      })
    }

    // Visits → Gate & Appointments — focus by visit ID so GateConsole selects the exact record
    for (const v of data.visits) {
      out.push({
        id: v.id,
        kind: "visit",
        label: v.id,
        sub: `${v.plate} · ${v.driver} · ${v.purpose} · ${v.container}`,
        screen: "gate",
        focus: v.id,
      })
    }

    // Events → Control Tower
    for (const e of data.events) {
      out.push({
        id: e.id,
        kind: "event",
        label: e.id,
        sub: e.title,
        screen: "tower",
        focus: e.id,
      })
    }

    return out
  }, [data.containers, data.moves, data.visits, data.events])

  // Filter by query
  const results = useMemo<SearchResult[]>(() => {
    const q = query.trim().toLowerCase()
    if (!q) return []
    return allResults.filter(r =>
      r.label.toLowerCase().includes(q) || r.sub.toLowerCase().includes(q)
    ).slice(0, 40)
  }, [allResults, query])

  // Keep activeIdx in bounds when results change
  useEffect(() => {
    setActiveIdx(idx => Math.min(idx, Math.max(0, results.length - 1)))
  }, [results.length])

  // Scroll active item into view
  useEffect(() => {
    if (!listRef.current) return
    const el = listRef.current.children[activeIdx] as HTMLElement | undefined
    el?.scrollIntoView({ block: "nearest" })
  }, [activeIdx])

  function select(r: SearchResult) {
    onNavigate(r.screen, r.focus)
    onClose()
  }

  function handleKey(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault()
      setActiveIdx(i => Math.min(i + 1, results.length - 1))
    } else if (e.key === "ArrowUp") {
      e.preventDefault()
      setActiveIdx(i => Math.max(i - 1, 0))
    } else if (e.key === "Enter") {
      e.preventDefault()
      if (results[activeIdx]) select(results[activeIdx])
    }
    // Escape is handled by Radix Dialog
  }

  return (
    <Dialog.Root open={open} onOpenChange={v => !v && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay
          className="fixed inset-0 z-40 bg-black/50"
          style={{ backdropFilter: "blur(2px)" }}
        />
        <Dialog.Content
          className="fixed z-50 left-1/2 top-[18%] -translate-x-1/2 w-full max-w-[600px] bg-white shadow-2xl flex flex-col"
          style={{ maxHeight: "60vh", borderRadius: 5 }}
          aria-label="Search command palette"
          onEscapeKeyDown={onClose}
        >
          {/* Input row */}
          <div className="flex items-center gap-2 px-4 py-3 border-b-2 border-neutral-200 flex-none">
            <span className="text-neutral-400 text-base select-none">⌕</span>
            <input
              ref={inputRef}
              value={query}
              onChange={e => { setQuery(e.target.value); setActiveIdx(0) }}
              onKeyDown={handleKey}
              placeholder="Search container, plate, order, move, event…"
              className="flex-1 text-[13.5px] outline-none bg-transparent placeholder:text-neutral-400"
            />
            {query && (
              <button
                onClick={() => { setQuery(""); inputRef.current?.focus() }}
                className="text-neutral-400 hover:text-neutral-700 text-xs px-1"
                style={{ borderRadius: 5 }}
              >
                ✕
              </button>
            )}
            <kbd className="text-[10px] text-neutral-400 border border-neutral-300 px-1 py-0 font-mono select-none" style={{ borderRadius: 5 }}>
              ESC
            </kbd>
          </div>

          {/* Results */}
          <div className="flex-1 overflow-auto">
            {!query.trim() ? (
              <div className="px-5 py-8 text-center text-[12.5px] text-neutral-400">
                Type to search containers, moves, visits, or events
              </div>
            ) : results.length === 0 ? (
              <div className="px-5 py-8 text-center text-[12.5px] text-neutral-400">
                No results for <strong className="text-neutral-600">"{query}"</strong>
              </div>
            ) : (
              <ul ref={listRef} role="listbox" aria-label="Search results" className="py-1">
                {results.map((r, i) => (
                  <li
                    key={r.id + r.kind}
                    role="option"
                    aria-selected={i === activeIdx}
                    onClick={() => select(r)}
                    onMouseEnter={() => setActiveIdx(i)}
                    className="flex items-baseline gap-2 px-4 cursor-pointer transition-colors border-b"
                    style={{
                      minHeight: 38,
                      borderBottomColor: "#f3f4f6",
                      background: i === activeIdx ? "#fef2f2" : "transparent",
                      borderLeft: `3px solid ${i === activeIdx ? "#dc2626" : "transparent"}`,
                      paddingTop: 8,
                      paddingBottom: 8,
                    }}
                  >
                    {/* Kind badge */}
                    <span
                      className="flex-none text-[9px] font-bold tracking-wider px-1 py-0 uppercase ds-label"
                      style={{
                        color: KIND_COLOR[r.kind],
                        background: KIND_COLOR[r.kind] + "18",
                        paddingLeft: 6,
                        paddingRight: 6,
                        paddingTop: 2,
                        paddingBottom: 2,
                      }}
                    >
                      {KIND_BADGE[r.kind]}
                    </span>

                    {/* Label + sub */}
                    <span className="flex-1 min-w-0">
                      <span className="font-bold text-[13px] text-neutral-900 font-mono">{r.label}</span>
                      <span className="ml-2 text-[11.5px] text-neutral-500 truncate">{r.sub}</span>
                    </span>

                    {/* Destination screen */}
                    <span className="flex-none text-[10px] text-neutral-400 whitespace-nowrap">
                      → {SCREEN_LABEL[r.screen] ?? r.screen}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Footer hint */}
          {results.length > 0 && (
            <div className="flex items-center gap-4 px-4 py-2 border-t border-neutral-200 flex-none bg-[#f9fafb] text-[10.5px] text-neutral-400">
              <span>
                <kbd className="font-mono border border-neutral-300 px-1" style={{ borderRadius: 5 }}>↑</kbd>{" "}
                <kbd className="font-mono border border-neutral-300 px-1" style={{ borderRadius: 5 }}>↓</kbd>{" "}
                navigate
              </span>
              <span><kbd className="font-mono border border-neutral-300 px-1" style={{ borderRadius: 5 }}>↵</kbd> open</span>
              <span><kbd className="font-mono border border-neutral-300 px-1" style={{ borderRadius: 5 }}>Esc</kbd> close</span>
              <span className="ml-auto font-mono">{results.length} result{results.length !== 1 ? "s" : ""}</span>
            </div>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
