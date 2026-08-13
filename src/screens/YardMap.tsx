import { useState, useEffect, useMemo, useRef } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { useData } from "@/lib/DataContext"
import type { Container } from "@/data/yard-data"
import { OPERATORS } from "@/data/yard-data"
import { backendApi } from "@/lib/backend-api"
import type { BackendContainerDetail, BackendForecast } from "@/lib/backend-api"
import PhysicalYardMap from "@/components/yard/PhysicalYardMap"
import BlockInteriorView from "@/components/yard/BlockInteriorView"
import SlotStackView from "@/components/yard/SlotStackView"
import type { ViewContainer } from "@/components/yard/types"
import {
  computeBlockLayouts, computeLiveBlockLayouts,
  computeEquipmentPositions, computeMoveTrails,
} from "@/lib/yard-layout"
import { containerColor as _containerColor, LEGENDS } from "@/lib/yard-color"
import type { ColorMode } from "@/lib/yard-color"

interface Props {
  focus: string | null
  onNavigate: (target: string, focus?: string) => void
}

type DataSource = "seed" | "live"
type ZoomLevel  = "yard" | "block"   // "slot" removed — slot detail lives in drawer

const containerColor = _containerColor

const COLOR_MODE_LABELS: Record<ColorMode, string> = {
  status:   "Status",
  lfd:      "LFD urgency",
  channel:  "Channel",
  dwell:    "Dwell days",
  priority: "Priority",
  rehandle: "Rehandle risk",
}

export default function YardMap({ focus, onNavigate }: Props) {
  const {
    containers, zones, moves, turnByHour, cycleByType, capacity,
    backendConnected, backendSlots, backendContainers,
  } = useData()

  // ── Existing seed state ───────────────────────────────────────────────────
  const [view,  setView]  = useState<"map"|"dash">("map")
  const [mode,  setMode]  = useState<ColorMode>("status")
  const [q,     setQ]     = useState("")
  const [zone,  setZone]  = useState("A")
  const [block, setBlock] = useState(1)
  const [row,   setRow]   = useState(1)
  const [sel,   setSel]   = useState<string|null>(() => {
    const first = containers.find(c => c.zone==="A"&&c.block===1&&c.row===1)
    return first?.id || null
  })

  // ── Physical map + drill-down state ──────────────────────────────────────
  const [selectedBlockLabel, setSelectedBlockLabel] = useState<string | null>(null)
  const [zoomLevel, setZoomLevel] = useState<ZoomLevel>("yard")
  const [selectedSlot, setSelectedSlot] = useState<{ col: number; row: number } | null>(null)

  // ── Overlay / planner state ───────────────────────────────────────────────
  const [showEquipment,  setShowEquipment]  = useState(false)
  const [showTrails,     setShowTrails]     = useState(false)
  const [showCongestion, setShowCongestion] = useState(false)
  const [plannerMode,    setPlannerMode]    = useState(false)
  const [plannerToast,   setPlannerToast]   = useState<string | null>(null)
  const [scrubberMin,    setScrubberMin]    = useState<number | null>(null)

  // ── Live-yard state ───────────────────────────────────────────────────────
  const [dataSource,    setDataSource]    = useState<DataSource>("seed")
  const [liveBlock,     setLiveBlock]     = useState<string | null>(null)
  const [liveRow,       setLiveRow]       = useState(1)
  const [selSlot,       setSelSlot]       = useState<number | null>(null)
  const [liveDetail,    setLiveDetail]    = useState<BackendContainerDetail | null>(null)
  const [loadingDetail, setLoadingDetail] = useState(false)
  const [forecast,      setForecast]      = useState<BackendForecast | null>(null)
  const [loadingFcast,  setLoadingFcast]  = useState(false)

  // ── Step 1: toolbar dropdown / switch state ───────────────────────────────
  const [colorDropdownOpen, setColorDropdownOpen] = useState(false)
  const colorDropdownRef = useRef<HTMLDivElement>(null)

  // ── Step 2: floating legend ───────────────────────────────────────────────
  const [legendExpanded, setLegendExpanded] = useState(false)

  // ── Step 3: drawer ────────────────────────────────────────────────────────
  const [drawerOpen, setDrawerOpen] = useState(false)

  // ── Outside-click: color dropdown ────────────────────────────────────────
  useEffect(() => {
    if (!colorDropdownOpen) return
    const h = (e: MouseEvent) => {
      if (colorDropdownRef.current && !colorDropdownRef.current.contains(e.target as Node))
        setColorDropdownOpen(false)
    }
    document.addEventListener("mousedown", h)
    return () => document.removeEventListener("mousedown", h)
  }, [colorDropdownOpen])

  // ── Keyboard shortcuts ────────────────────────────────────────────────────
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.closest?.("input,textarea,select")) return
      if (view !== "map") return
      switch (e.key) {
        case "Escape":
          if (drawerOpen) { setDrawerOpen(false); setSelectedSlot(null) }
          else if (zoomLevel === "block") { setZoomLevel("yard"); setSelectedSlot(null) }
          break
        case "1": setZoomLevel("yard"); setSelectedSlot(null); setDrawerOpen(false); break
        case "2": if (selectedBlockLabel || activeLiveBlock) setZoomLevel("block"); break
        case "e": case "E": setShowEquipment(v => !v); break
        case "t": case "T": setShowTrails(v => !v); break
      }
    }
    window.addEventListener("keydown", handler)
    return () => window.removeEventListener("keydown", handler)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, zoomLevel, drawerOpen, selectedBlockLabel, selectedSlot])

  // ── Auto-clear planner toast ──────────────────────────────────────────────
  useEffect(() => {
    if (!plannerToast) return
    const t = setTimeout(() => setPlannerToast(null), 3500)
    return () => clearTimeout(t)
  }, [plannerToast])

  // ── Existing effects ──────────────────────────────────────────────────────
  useEffect(() => {
    if (!sel && containers.length) {
      const first = containers.find(c => c.zone==="A"&&c.block===1&&c.row===1)
      if (first) setSel(first.id)
    }
  }, [containers])

  useEffect(() => {
    if (!focus) return
    const c = containers.find(x => x.id === focus)
    if (c) { setSel(c.id); setZone(c.zone); setBlock(c.block); setRow(c.row); setView("map"); setDataSource("seed") }
  }, [focus, containers])

  useEffect(() => { setLiveDetail(null) }, [selSlot])

  // ── Live-yard derived data ────────────────────────────────────────────────
  const liveBlockMap = (() => {
    const map = new Map<string, typeof backendSlots>()
    for (const s of backendSlots) {
      if (!map.has(s.block)) map.set(s.block, [])
      map.get(s.block)!.push(s)
    }
    return map
  })()

  const liveBlockKeys = Array.from(liveBlockMap.keys()).sort()

  const liveZones = liveBlockKeys.map(blk => {
    const slots = liveBlockMap.get(blk)!
    const total = slots.length
    const occupied = slots.filter(s => s.occupied_container_id != null).length
    const pct = total > 0 ? Math.round(occupied / total * 100) : 0
    const hasHazmat = slots.some(s => s.is_hazmat_approved)
    return { blk, total, occupied, pct, hasHazmat }
  })

  const activeLiveBlock = liveBlock ?? liveBlockKeys[0] ?? null
  const activeLiveSlots = activeLiveBlock ? (liveBlockMap.get(activeLiveBlock) ?? []) : []

  const liveBays  = Array.from(new Set(activeLiveSlots.map(s => s.bay))).sort((a, b) => a - b)
  const liveTiers = Array.from(new Set(activeLiveSlots.map(s => s.tier))).sort((a, b) => b - a)
  const liveRows  = Array.from(new Set(activeLiveSlots.map(s => s.row))).sort((a, b) => a - b)
  const activeRow = liveRows.includes(liveRow) ? liveRow : (liveRows[0] ?? 1)

  const selSlotData   = backendSlots.find(s => s.id === selSlot)
  const liveContainer = selSlotData?.occupied_container_id != null
    ? backendContainers.find(c => c.id === selSlotData.occupied_container_id)
    : null

  function hoursToDetention(expiry: string | null): number | null {
    if (!expiry) return null
    return Math.round((new Date(expiry).getTime() - Date.now()) / 3_600_000)
  }

  async function loadLiveDetail() {
    if (!liveContainer || loadingDetail) return
    setLoadingDetail(true)
    try { const detail = await backendApi.container(liveContainer.id); setLiveDetail(detail) }
    catch (err) { console.error("[YardMap] container detail:", err) }
    finally { setLoadingDetail(false) }
  }

  async function loadForecast() {
    if (loadingFcast) return
    setLoadingFcast(true)
    try { const f = await backendApi.forecast(3); setForecast(f) }
    catch (err) { console.error("[YardMap] forecast:", err) }
    finally { setLoadingFcast(false) }
  }

  // ── Block layouts (seed) ──────────────────────────────────────────────────
  const blockLayouts = useMemo(() => computeBlockLayouts(zones, containers), [zones, containers])
  const zoneNames    = useMemo(() => Object.fromEntries(zones.map(z => [z.id, z.name])), [zones])

  // ── KPI values ────────────────────────────────────────────────────────────
  const seedContainers = useMemo(() => containers.filter(c => !"RS".includes(c.zone)), [containers])
  const totalCapacity  = useMemo(() => zones.filter(z => !"RS".includes(z.id)).reduce((s, z) => s + z.blocks * z.rows * z.slots * z.maxTiers, 0), [zones])
  const occupancyPct   = totalCapacity > 0 ? Math.round(seedContainers.length / totalCapacity * 100) : 0
  const totalTEU       = useMemo(() => seedContainers.reduce((s, c) => s + (c.size.startsWith("40") ? 2 : 1), 0), [seedContainers])
  const avgTier        = seedContainers.length > 0 ? (seedContainers.reduce((s, c) => s + c.tier, 0) / seedContainers.length).toFixed(1) : "—"
  const totalBlocks    = useMemo(() => zones.filter(z => !"RS".includes(z.id)).reduce((s, z) => s + z.blocks, 0), [zones])
  const totalZones     = zones.filter(z => !"RS".includes(z.id)).length

  const selectedLayout  = blockLayouts.find(l => l.label === selectedBlockLabel) ?? null
  const selectedZoneDef = selectedLayout ? zones.find(z => z.id === selectedLayout.zone) : null

  // ── Search ────────────────────────────────────────────────────────────────
  const all   = containers
  const ql    = q.trim().toLowerCase()
  const match = (c: Container) =>
    !ql || (c.id + c.consignee + c.vessel + c.address + c.carrierName).toLowerCase().includes(ql)

  // ── Block interior containers (seed) ──────────────────────────────────────
  const selectedBlockViewContainers = useMemo((): ViewContainer[] =>
    selectedLayout
      ? containers
          .filter(c => c.zone === selectedLayout.zone && c.block === selectedLayout.block)
          .map(c => ({
            id: c.id, tier: c.tier, slotCol: c.slot, rowNum: c.row,
            zone: c.zone, block: c.block, size: c.size, status: c.status,
            hoursToLFD: c.hoursToLFD, priority: c.priority, consignee: c.consignee,
            vessel: c.vessel, carrierName: c.carrierName, hazmat: c.hazmat,
            channel: c.channel, dwellDays: c.dwellDays, grossKg: c.grossKg,
            whyHere: c.whyHere, seal: c.seal, terminal: c.terminal, empty: c.empty,
          }))
      : [],
    [containers, selectedLayout],
  )

  // ── Live block layouts + containers ───────────────────────────────────────
  const liveBlockLayouts = useMemo(() => computeLiveBlockLayouts(liveZones, zones), [liveZones, zones])

  const liveBlockViewContainers = useMemo((): ViewContainer[] => {
    if (!activeLiveBlock) return []
    return activeLiveSlots
      .filter(s => s.occupied_container_id != null)
      .map(s => {
        const bc = backendContainers.find(c => c.id === s.occupied_container_id)
        return {
          id:          bc?.container_number ?? String(s.occupied_container_id),
          tier:        s.tier, slotCol: s.bay, rowNum: s.row,
          zone:        activeLiveBlock[0] ?? "?",
          block:       parseInt(activeLiveBlock.split("-")[1] ?? "1", 10) || 1,
          size:        bc ? `${bc.size_ft}ft` : "?",
          status:      bc?.status ?? "UNKNOWN",
          hoursToLFD:  -9999, priority: "—", consignee: "—", vessel: "—", carrierName: "—",
          hazmat:      bc?.is_hazmat ?? s.is_hazmat_approved,
          channel:     "verde", dwellDays: 0, grossKg: 0, whyHere: "", seal: "—", terminal: "—", empty: false,
        } satisfies ViewContainer
      })
  }, [activeLiveBlock, activeLiveSlots, backendContainers])

  const liveBlockNumCols  = liveBays.length  > 0 ? Math.max(...liveBays)  : 10
  const liveBlockNumRows  = liveRows.length  > 0 ? Math.max(...liveRows)  : 3
  const liveBlockMaxTiers = liveTiers.length > 0 ? Math.max(...liveTiers) : 4
  const activeLiveZoneDef = zones.find(z => z.id === (activeLiveBlock?.[0] ?? ""))

  const matchingBlockLabels = useMemo(() => {
    if (!ql) return new Set<string>()
    return new Set(
      containers
        .filter(c => (c.id + c.consignee + c.vessel + c.address + c.carrierName).toLowerCase().includes(ql))
        .map(c => `${c.zone}-${String(c.block).padStart(2, "0")}`),
    )
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ql, containers])

  // ── Computed overlays ─────────────────────────────────────────────────────
  const equipmentPositions = useMemo(() => computeEquipmentPositions(OPERATORS, moves, blockLayouts), [moves, blockLayouts])
  const moveTrails         = useMemo(() => computeMoveTrails(moves, blockLayouts), [moves, blockLayouts])

  const congestionByBlock = useMemo(() => {
    const map = new Map<string, number>()
    for (const layout of blockLayouts) {
      const active = moves.filter(m =>
        (m.state === "IN_PROGRESS" || m.state === "ASSIGNED") &&
        (m.from.startsWith(layout.label) || m.to.startsWith(layout.label))
      ).length
      const eq = equipmentPositions.filter(e => e.currentBlock === layout.label).length
      map.set(layout.label, Math.min(1, (active + eq) / 4))
    }
    return map
  }, [blockLayouts, moves, equipmentPositions])

  const activeMoveBlocks = useMemo(() => {
    if (scrubberMin === null) return new Set<string>()
    const active = moves.filter(m => m.startMin <= scrubberMin && m.endMin >= scrubberMin)
    return new Set(
      active.flatMap(m => {
        const from = m.from.match(/^([A-Z]-\d+)/)?.[1]
        const to   = m.to.match(/^([A-Z]-\d+)/)?.[1]
        return [from, to].filter(Boolean) as string[]
      }),
    )
  }, [moves, scrubberMin])

  function lowestOccupancyInZone(zone: string): string {
    const zoneLayouts = blockLayouts.filter(l => l.zone === zone)
    if (!zoneLayouts.length) return "S-01"
    return zoneLayouts.sort((a, b) => a.occupancyPct - b.occupancyPct)[0].label
  }

  function handlePlannerAction(action: string, containerId: string) {
    const c = containers.find(x => x.id === containerId)
    const zone = c?.zone ?? "A"
    const dest = action === "reposition" ? lowestOccupancyInZone(zone) : "S-01"
    const verb = action === "retrieval" ? "Retrieval planned" : action === "reposition" ? "Reposition planned" : "Outbound staging planned"
    setPlannerToast(`${verb}: ${containerId} → ${dest}`)
  }

  const isLive = dataSource === "live"

  // ── Drawer slot content ───────────────────────────────────────────────────
  function drawerSlotView() {
    if (!selectedSlot) return null
    if (!isLive && selectedBlockLabel && selectedZoneDef) {
      return (
        <SlotStackView
          blockLabel={selectedBlockLabel}
          zoneName={selectedZoneDef.name}
          slotCol={selectedSlot.col}
          rowNum={selectedSlot.row}
          maxTiers={selectedZoneDef.maxTiers}
          containers={selectedBlockViewContainers.filter(c => c.slotCol === selectedSlot.col && c.rowNum === selectedSlot.row)}
          mode={mode}
          onBack={() => { setDrawerOpen(false); setSelectedSlot(null) }}
          onNavigate={onNavigate}
          plannerMode={plannerMode}
          onPlannerAction={handlePlannerAction}
        />
      )
    }
    if (isLive && activeLiveBlock) {
      return (
        <SlotStackView
          blockLabel={activeLiveBlock}
          zoneName={activeLiveZoneDef?.name ?? activeLiveBlock}
          slotCol={selectedSlot.col}
          rowNum={selectedSlot.row}
          maxTiers={liveBlockMaxTiers}
          containers={liveBlockViewContainers.filter(c => c.slotCol === selectedSlot.col && c.rowNum === selectedSlot.row)}
          mode={mode}
          onBack={() => { setDrawerOpen(false); setSelectedSlot(null) }}
        />
      )
    }
    return null
  }

  // ── Floating legend items ─────────────────────────────────────────────────
  const legendItems: [string, string][] = isLive
    ? [["Occupied","#374151"],["Empty","#e5e7eb"],["Hazmat + occupied","#f97316"],["Hazmat empty","#fed7aa"]]
    : LEGENDS[mode]

  return (
    <div className="flex flex-col h-full min-h-0 overflow-auto bg-white text-neutral-900">

      {/* ── Toolbar ──────────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-2.5 px-5 py-3 border-b border-[#e5e7eb] flex-none">

        {/* Title */}
        <div className="flex flex-col gap-0.5 mr-1.5">
          <span className="font-black text-[19px] tracking-tight">Yard</span>
          <span className="text-[11px] text-neutral-500">
            {isLive
              ? `${backendSlots.length} slots · ${backendContainers.length} containers · live yard`
              : `${all.length} containers · ${ql ? `${all.filter(match).length} match "${q}"` : "7 zones · overlay: "+mode}`}
          </span>
        </div>

        {/* Map / Dashboard toggle */}
        <div className="flex" style={{ border:"1px solid #e5e7eb", borderRadius:5, overflow:"hidden" }}>
          {(["map","dash"] as const).map((k,i)=>(
            <button key={k} onClick={()=>setView(k)}
              className="text-[11px] px-3 py-1.5 font-bold transition-colors"
              style={{ borderRight:i===0?"1px solid #e5e7eb":undefined, background:view===k?"#111827":"transparent", color:view===k?"#fff":"#374151" }}>
              {k==="map"?"Map":"Dashboard"}
            </button>
          ))}
        </div>

        {/* Step 1a: Data source toggle — compact switch */}
        <div className="flex items-center gap-2">
          <span className="text-[11px] text-neutral-500">Source</span>
          <button
            disabled={!backendConnected}
            title={!backendConnected ? "Backend unavailable" : undefined}
            onClick={() => setDataSource(ds => ds === "seed" ? "live" : "seed")}
            className="relative inline-flex h-5 w-9 items-center flex-none transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            style={{ background: dataSource === "live" ? "#111827" : "#d1d5db", borderRadius: 10 }}
          >
            <span className="inline-block h-3.5 w-3.5 bg-white shadow transition-transform flex-none"
              style={{ borderRadius: "50%", transform: dataSource === "live" ? "translateX(20px)" : "translateX(2px)" }} />
          </button>
          <span className="text-[11px] text-neutral-700 font-medium">
            {dataSource === "live" ? (backendConnected ? "Live yard" : "Engine offline") : "Seed data"}
          </span>
        </div>

        {/* Search */}
        {view==="map" && (
          <Input
            placeholder="Container, consignee, vessel, slot…"
            value={q} onChange={e => setQ(e.target.value)}
            className="w-48 h-7 text-xs"
          />
        )}

        {/* Step 1b: Color by dropdown */}
        {view==="map" && !isLive && (
          <div ref={colorDropdownRef} className="relative">
            <button
              onClick={() => setColorDropdownOpen(v => !v)}
              className="flex items-center gap-1.5 text-[11px] px-2.5 py-1.5 font-semibold transition-colors"
              style={{ border:"1px solid #e5e7eb", borderRadius:5, color:"#374151" }}
            >
              Color by: <span className="capitalize">{COLOR_MODE_LABELS[mode]}</span>
              <span style={{ fontSize:8, color:"#9ca3af" }}>{colorDropdownOpen?"▲":"▼"}</span>
            </button>
            {colorDropdownOpen && (
              <div className="absolute top-full left-0 mt-1 z-30 bg-white"
                style={{ border:"1px solid #e5e7eb", borderRadius:5, boxShadow:"0 4px 12px rgba(0,0,0,0.10)", minWidth:160, overflow:"hidden" }}>
                {(["status","lfd","channel","dwell","priority","rehandle"] as ColorMode[]).map(k => (
                  <button key={k} onClick={() => { setMode(k); setColorDropdownOpen(false) }}
                    className="w-full text-left px-3 py-2 text-[11px] transition-colors hover:bg-[#f9fafb]"
                    style={{ fontWeight: mode===k ? 700 : 400, color: mode===k ? "#111827" : "#374151", background: mode===k ? "#f9fafb" : "transparent", borderBottom:"1px solid #f3f4f6" }}>
                    {COLOR_MODE_LABELS[k]}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Overlay toggles */}
        {view==="map" && (
          <div className="flex items-center gap-px">
            {([
              { key:"equip",  label:"Equipment", k:"E", on:showEquipment,  set:setShowEquipment  },
              { key:"trails", label:"Trails",    k:"T", on:showTrails,     set:setShowTrails     },
              { key:"heat",   label:"Heat",      k:"",  on:showCongestion, set:setShowCongestion },
              { key:"plan",   label:"Planner",   k:"",  on:plannerMode,    set:setPlannerMode    },
            ] as { key:string; label:string; k:string; on:boolean; set:(v:boolean)=>void }[]).map((t,i,arr)=>(
              <button key={t.key} onClick={() => t.set(!t.on)}
                title={t.k ? `Shortcut: ${t.k}` : undefined}
                className="text-[10px] px-2 py-1.5 font-semibold transition-colors"
                style={{ borderLeft:"1px solid #e5e7eb", borderTop:"1px solid #e5e7eb", borderBottom:"1px solid #e5e7eb", borderRight:i<arr.length-1?"none":"1px solid #e5e7eb", borderRadius:i===0?"5px 0 0 5px":i===arr.length-1?"0 5px 5px 0":0, background:t.on?"#16a34a":"transparent", color:t.on?"#fff":"#555" }}>
                {t.label}{t.k ? ` [${t.k}]` : ""}
              </button>
            ))}
          </div>
        )}

        {/* Breadcrumb */}
        {view==="map" && zoomLevel !== "yard" && (
          <div className="flex items-center gap-1.5 text-[11px] text-neutral-500 font-medium ml-1">
            <button onClick={() => { setZoomLevel("yard"); setSelectedSlot(null); setDrawerOpen(false) }}
              className="hover:text-neutral-900 transition-colors">Yard</button>
            {(selectedBlockLabel || activeLiveBlock) && (
              <>
                <span className="text-neutral-300">›</span>
                <button onClick={() => { setDrawerOpen(false); setSelectedSlot(null) }}
                  className="hover:text-neutral-900 transition-colors">
                  {selectedBlockLabel ?? activeLiveBlock}
                </button>
              </>
            )}
            {drawerOpen && selectedSlot && (
              <>
                <span className="text-neutral-300">›</span>
                <span className="text-neutral-900">Bay {selectedSlot.col} · Row {selectedSlot.row}</span>
              </>
            )}
          </div>
        )}
      </div>

      {/* ── Map view — single relative wrapper for legend + drawer ──────────── */}
      {view==="map" && (
        <div className="relative flex flex-col flex-1 min-h-0">

          {/* SEED map content */}
          {!isLive && (
            <>
              {/* KPI bar — no internal separator borders, use spacing */}
              {zoomLevel === "yard" && (
                <div className="flex flex-wrap flex-none">
                  {([
                    { k:"Occupancy",             v:`${occupancyPct}%`,           sub:`${seedContainers.length} of ${totalCapacity} slots · ceiling 85%`, red: occupancyPct > 85 },
                    { k:"TEU on terminal",       v:String(totalTEU),             sub:`${seedContainers.length} units` },
                    { k:"Avg stack height",      v:`${avgTier} tiers`,           sub:"across all blocks" },
                    { k:"Blocks · Zones",        v:`${totalBlocks} · ${totalZones}`, sub:"in physical yard" },
                    { k:"Detention at risk 72 h",v:"$8.4k",                     sub:"31 containers", red: true },
                  ] as { k:string; v:string; sub:string; red?:boolean }[]).map(m => (
                    <div key={m.k} className="flex-1 basis-36 px-5 py-3 flex flex-col gap-0.5">
                      <span className="ds-label text-neutral-500">{m.k}</span>
                      <div className="flex items-baseline gap-2">
                        <span className={`font-black text-[20px] leading-none tracking-tight ${m.red?"text-[#dc2626]":""}`}>{m.v}</span>
                        <span className="text-[11px] text-neutral-500">{m.sub}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Zoom-level views (no slot level — slot is in drawer) */}
              <div className="flex flex-1 min-h-0 overflow-hidden" style={{ transition:"opacity 200ms" }}>
                {zoomLevel === "yard" && (
                  <PhysicalYardMap
                    layouts={blockLayouts} selectedBlock={null}
                    onSelectBlock={label => { setSelectedBlockLabel(label); setZoomLevel("block"); setSelectedSlot(null); setDrawerOpen(false) }}
                    zoneNames={zoneNames} equipment={equipmentPositions}
                    showEquipment={showEquipment} moveTrails={moveTrails}
                    showTrails={showTrails} congestionByBlock={congestionByBlock}
                    showCongestion={showCongestion}
                    activeMoveBlocks={scrubberMin !== null ? activeMoveBlocks : undefined}
                  />
                )}
                {zoomLevel === "block" && selectedBlockLabel && selectedZoneDef && (
                  <BlockInteriorView
                    blockLabel={selectedBlockLabel} zoneName={selectedZoneDef.name}
                    numCols={selectedZoneDef.slots} numRows={selectedZoneDef.rows} maxTiers={selectedZoneDef.maxTiers}
                    containers={selectedBlockViewContainers} mode={mode} searchQuery={q}
                    selectedSlot={selectedSlot}
                    onSlotClick={(col, row) => { setSelectedSlot({ col, row }); setDrawerOpen(true) }}
                    onBack={() => { setZoomLevel("yard"); setSelectedSlot(null); setSelectedBlockLabel(null); setDrawerOpen(false) }}
                  />
                )}
              </div>

              {/* Time scrubber */}
              {zoomLevel === "yard" && (
                <div className="flex-none px-5 py-2.5 flex items-center gap-4" style={{ background:"#fafafa" }}>
                  <span className="text-[10px] font-bold tracking-widest text-neutral-500 whitespace-nowrap">SHIFT TIMELINE</span>
                  <span className="text-[10.5px] text-neutral-400 tabular whitespace-nowrap">06:00</span>
                  <div className="flex-1 relative flex items-center">
                    <input type="range" min={360} max={1320} step={5}
                      value={scrubberMin ?? (6*60)}
                      onChange={e => setScrubberMin(Number(e.target.value))}
                      className="w-full accent-neutral-800" />
                    {scrubberMin !== null && (
                      <span className="absolute -top-5 text-[9px] font-bold text-amber-700 bg-amber-100 px-1.5 py-px whitespace-nowrap pointer-events-none"
                        style={{ left:`${((scrubberMin-360)/(1320-360))*100}%`, transform:"translateX(-50%)", borderRadius:3 }}>
                        {activeMoveBlocks.size} active block{activeMoveBlocks.size!==1?"s":""}
                      </span>
                    )}
                  </div>
                  <span className="text-[10.5px] text-neutral-400 tabular whitespace-nowrap">
                    {scrubberMin !== null
                      ? `${String(Math.floor(scrubberMin/60)).padStart(2,"0")}:${String(scrubberMin%60).padStart(2,"0")}`
                      : "22:00"}
                  </span>
                  {scrubberMin !== null && (
                    <button onClick={() => setScrubberMin(null)} className="text-[10px] text-neutral-400 hover:text-neutral-700 whitespace-nowrap">✕ reset</button>
                  )}
                </div>
              )}
            </>
          )}

          {/* LIVE map content */}
          {isLive && (
            <>
              {/* Live KPI bar */}
              {zoomLevel === "yard" && (
                <div className="flex flex-wrap flex-none">
                  {[
                    {k:"Total slots",   v:String(backendSlots.length),  sub:"in yard"},
                    {k:"Occupied",      v:String(backendSlots.filter(s=>s.occupied_container_id!=null).length), sub:`of ${backendSlots.length}`},
                    {k:"Occupancy",     v:backendSlots.length?Math.round(backendSlots.filter(s=>s.occupied_container_id!=null).length/backendSlots.length*100)+"%":"—", sub:"live"},
                    {k:"Hazmat slots",  v:String(backendSlots.filter(s=>s.is_hazmat_approved).length), sub:"approved"},
                    {k:"Reefer slots",  v:String(backendSlots.filter(s=>s.is_reefer_capable).length), sub:"capable"},
                  ].map(m=>(
                    <div key={m.k} className="flex-1 basis-36 px-5 py-3 flex flex-col gap-0.5">
                      <span className="ds-label text-neutral-500">{m.k}</span>
                      <div className="flex items-baseline gap-2">
                        <span className="font-black text-[20px] leading-none tracking-tight">{m.v}</span>
                        <span className="text-[11px] text-neutral-500">{m.sub}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {backendSlots.length === 0 ? (
                <div className="flex-1 flex items-center justify-center">
                  <div className="bg-neutral-50 px-8 py-6 max-w-sm text-center" style={{ border:"1px solid #e5e7eb", borderRadius:5 }}>
                    <div className="font-black text-[16px] mb-2">No slot data from backend</div>
                    <div className="text-[12.5px] text-neutral-600 leading-relaxed">Backend connected but returned no yard slots. Check the planning engine.</div>
                  </div>
                </div>
              ) : (
                <div className="flex flex-1 min-h-0 overflow-hidden" style={{ transition:"opacity 200ms" }}>
                  {zoomLevel === "yard" && (
                    <PhysicalYardMap
                      layouts={liveBlockLayouts} selectedBlock={null}
                      onSelectBlock={blk => { setLiveBlock(blk); setZoomLevel("block"); setSelectedSlot(null); setDrawerOpen(false) }}
                      zoneNames={zoneNames} showEquipment={false} showTrails={false} showCongestion={false}
                    />
                  )}
                  {zoomLevel === "block" && activeLiveBlock && (
                    <BlockInteriorView
                      blockLabel={activeLiveBlock} zoneName={activeLiveZoneDef?.name ?? activeLiveBlock}
                      numCols={liveBlockNumCols} numRows={liveBlockNumRows} maxTiers={liveBlockMaxTiers}
                      containers={liveBlockViewContainers} mode={mode} searchQuery={q}
                      selectedSlot={selectedSlot}
                      onSlotClick={(col, row) => { setSelectedSlot({ col, row }); setLiveRow(row); setDrawerOpen(true) }}
                      onBack={() => { setZoomLevel("yard"); setSelectedSlot(null); setDrawerOpen(false) }}
                    />
                  )}
                </div>
              )}
            </>
          )}

          {/* ── Step 2: Floating legend ────────────────────────────────────── */}
          <div className="absolute bottom-4 left-4 z-20" style={{ pointerEvents:"auto" }}>
            <div className="bg-white/90 backdrop-blur-sm"
              style={{ borderRadius:8, border:"1px solid rgba(0,0,0,0.08)", boxShadow:"0 2px 8px rgba(0,0,0,0.08)" }}>
              <button onClick={() => setLegendExpanded(v => !v)}
                className="flex items-center gap-2 px-3 py-2 text-[11px] font-semibold text-neutral-700 w-full">
                <span style={{ fontSize:9 }}>{legendExpanded ? "▼" : "▶"}</span>
                Legend
                {!legendExpanded && (
                  <span className="ml-1 text-[10px] font-normal text-neutral-400 capitalize">
                    {isLive ? "live yard" : COLOR_MODE_LABELS[mode]}
                  </span>
                )}
              </button>
              {legendExpanded && (
                <div className="px-3 pb-3 flex flex-col gap-1.5">
                  {legendItems.map(([label, color]) => (
                    <span key={label} className="flex items-center gap-2 text-[11px] text-neutral-600">
                      <span className="w-2.5 h-2.5 flex-none inline-block"
                        style={{ background:color, border:"1px solid rgba(0,0,0,0.12)", borderRadius:2 }} />
                      {label}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* ── Step 3: Slide-out drawer (560px from right) ────────────────── */}
          <div
            className="absolute top-0 right-0 bottom-0 z-30 bg-white flex flex-col"
            style={{
              width: 560,
              transform: drawerOpen ? "translateX(0)" : "translateX(560px)",
              transition: "transform 250ms ease",
              boxShadow: drawerOpen ? "-4px 0 24px rgba(0,0,0,0.12)" : "none",
            }}
          >
            {/* Floating close button — always visible at top-right */}
            <button
              onClick={() => { setDrawerOpen(false); setSelectedSlot(null) }}
              className="absolute top-3 right-3 z-10 text-neutral-400 hover:text-neutral-800 transition-colors"
              style={{
                width: 28, height: 28, borderRadius: "50%",
                background: "#f3f4f6", border: "none",
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 13, cursor: "pointer",
              }}
              title="Close"
            >
              ✕
            </button>

            {/* Slot stack view fills the drawer */}
            <div className="flex flex-col flex-1 min-h-0">
              {drawerOpen && selectedSlot
                ? drawerSlotView()
                : drawerOpen && (
                  <div className="px-5 py-8 text-[12.5px] text-neutral-400 leading-relaxed">
                    Click a slot in the block view to see the container stack at that position.
                  </div>
                )
              }
            </div>
          </div>
        </div>
      )}

      {/* ── Dashboard ─────────────────────────────────────────────────────────── */}
      {view==="dash" && (
        <div className="flex-1 min-h-0 overflow-auto">
          {/* Top KPI row — spacing only, no internal borders */}
          <div className="flex flex-wrap py-1">
            {[
              {k:"Truck turn P50",v:"13.8′",target:"15.0′",baseline:"31.4′",verdict:"WITHIN",red:false},
              {k:"Truck turn P90",v:"21.4′",target:"22.0′",baseline:"52.8′",verdict:"WITHIN",red:false},
              {k:"Job cycle P50", v:"4.9′", target:"5.0′", baseline:"8.7′", verdict:"WITHIN",red:false},
              {k:"Job cycle P90", v:"7.6′", target:"7.5′", baseline:"14.2′",verdict:"OVER 0.1′",red:true},
            ].map(c=>(
              <div key={c.k} className="flex-1 basis-52 px-5 py-4">
                <div className="flex justify-between items-baseline">
                  <span className="ds-label text-neutral-500">{c.k}</span>
                  <span className={`text-[10px] font-bold tracking-wider ${c.red?"text-[#dc2626]":""}`}>{c.verdict}</span>
                </div>
                <div className="flex items-baseline gap-2 mt-1.5">
                  <span className={`font-black text-[26px] leading-none tracking-tight ${c.red?"text-[#dc2626]":""}`}>{c.v}</span>
                  <span className="text-[11.5px] text-neutral-500">target {c.target} · baseline {c.baseline}</span>
                </div>
              </div>
            ))}
          </div>

          {/* Chart grid — subtle background instead of border */}
          <div className="grid min-h-80" style={{ gridTemplateColumns:"minmax(360px,1fr) minmax(320px,1fr)" }}>
            {/* Left: turn + cycle charts */}
            <div className="px-5 py-4" style={{ borderRight:"1px solid #f3f4f6" }}>
              <div className="ds-label text-neutral-500 font-bold mb-3">Truck turn by hour</div>
              <div className="flex items-end gap-2 h-40">
                {turnByHour.map(t=>(
                  <div key={t.hour} className="flex-1 flex flex-col justify-end gap-0.5 h-full">
                    <div className="bg-neutral-300" style={{height:((t.p90-t.p50)/28*100).toFixed(1)+"%"}} />
                    <div className={t.p50>15?"bg-[#dc2626]":"bg-neutral-800"} style={{height:(t.p50/28*100).toFixed(1)+"%"}} />
                    <span className="text-[9.5px] text-neutral-500">{t.hour}</span>
                  </div>
                ))}
              </div>
              <p className="text-[11px] text-neutral-500 mt-3 leading-relaxed">Grey is P90, solid is P50. The 08:00 hour breaches — inbound put-away competes with outbound loading.</p>

              <div className="mt-5 ds-label text-neutral-500 font-bold mb-2">Machine job cycle by move type</div>
              {cycleByType.map(r=>(
                <div key={r.type} className="py-2.5">
                  <div className="flex justify-between text-[11.5px]">
                    <span>{r.type}</span>
                    <span className="tabular text-neutral-500">P50 <strong className={r.p50>5?"text-[#dc2626]":""}>{r.p50.toFixed(1)}′</strong> · P90 {r.p90.toFixed(1)}′ · n={r.n}</span>
                  </div>
                </div>
              ))}
            </div>

            {/* Right: capacity / forecast */}
            <div className="px-5 py-4">
              <div className="flex items-baseline gap-3 mb-4">
                <div className="ds-label text-neutral-500 font-bold">
                  {forecast ? "Forecast from planning engine" : "Machine-hours required vs available"}
                </div>
                {backendConnected && !forecast && (
                  <Button variant="secondary" size="sm" className="text-[10.5px]" onClick={loadForecast} disabled={loadingFcast}>
                    {loadingFcast ? "Loading…" : "Load forecast"}
                  </Button>
                )}
                {forecast && (
                  <button className="text-[10.5px] text-neutral-400 hover:text-neutral-700" onClick={() => setForecast(null)}>← seed data</button>
                )}
              </div>

              {!forecast && capacity.map(c=>(
                <div key={c.month} className="py-3">
                  <div className="flex justify-between text-[11.5px]">
                    <span className="font-semibold">{c.month} · {c.volume} containers</span>
                    <span className={`tabular ${c.breach?"text-[#dc2626]":"text-neutral-600"}`}>{c.required.toFixed(1)} req / {c.available.toFixed(1)} avail</span>
                  </div>
                  <div className="relative h-2 bg-neutral-100 mt-2">
                    <div className={c.breach?"bg-[#dc2626]":"bg-neutral-600"} style={{position:"absolute",left:0,top:0,bottom:0,width:Math.min(100,c.required/55*100).toFixed(0)+"%"}} />
                    <div className="absolute top-[-2px] h-3 w-0.5 bg-neutral-900" style={{left:(c.available/55*100).toFixed(0)+"%"}} />
                  </div>
                  <div className="text-[10.5px] text-neutral-500 mt-1.5">{c.breach?"breach — "+(c.required-c.available).toFixed(1)+" machine-hours short":"within available hours"}</div>
                </div>
              ))}

              {forecast && (
                <>
                  {forecast.first_over_capacity_day && (
                    <div className="mb-4 px-3 py-2.5 text-[11.5px] text-amber-900" style={{ background:"#fffbeb", border:"1px solid #fcd34d", borderRadius:5 }}>
                      First over-capacity day: <strong>{forecast.first_over_capacity_day}</strong>
                    </div>
                  )}
                  <div className="flex items-end gap-1.5 h-36 mb-4">
                    {forecast.points.map(p => {
                      const maxOcc = Math.max(...forecast.points.map(x => x.projected_occupancy), p.capacity)
                      return (
                        <div key={p.day} className="flex-1 flex flex-col justify-end items-center gap-0.5 h-full min-w-[18px]">
                          <div className="w-full relative flex items-end justify-center h-full">
                            <div className="absolute bottom-0 w-full opacity-30 bg-neutral-400" style={{height:(p.capacity/maxOcc*100).toFixed(1)+"%"}} />
                            <div className={`w-[60%] ${p.over_capacity?"bg-[#dc2626]":"bg-neutral-700"}`} style={{height:(p.projected_occupancy/maxOcc*100).toFixed(1)+"%"}} />
                          </div>
                          <span className="text-[8px] text-neutral-500 rotate-45 origin-left mt-1">{p.day.slice(5)}</span>
                        </div>
                      )
                    })}
                  </div>
                  <p className="text-[11px] text-neutral-500 leading-relaxed">Dark bar is projected occupancy vs grey cap bar. Red = over capacity.</p>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Planner toast */}
      {plannerToast && (
        <div className="fixed top-4 right-4 z-50 flex items-center gap-2.5 px-4 py-2.5 text-[12px] font-semibold text-green-900"
          style={{ background:"#f0fdf4", border:"1px solid #bbf7d0", borderRadius:6, boxShadow:"0 4px 12px rgba(0,0,0,0.10)", animation:"slideInRight 200ms ease-out" }}>
          <span style={{ color:"#16a34a", fontSize:16 }}>✓</span>
          {plannerToast}
        </div>
      )}
    </div>
  )
}
