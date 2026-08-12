import { useState, useEffect, useMemo } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { useData } from "@/lib/DataContext"
import type { Container } from "@/data/yard-data"
import { backendApi } from "@/lib/backend-api"
import type { BackendContainerDetail, BackendForecast } from "@/lib/backend-api"
import PhysicalYardMap from "@/components/yard/PhysicalYardMap"
import BlockInteriorView from "@/components/yard/BlockInteriorView"
import SlotStackView from "@/components/yard/SlotStackView"
import type { ViewContainer } from "@/components/yard/types"
import { computeBlockLayouts, computeLiveBlockLayouts } from "@/lib/yard-layout"
import { containerColor as _containerColor, LEGENDS } from "@/lib/yard-color"
import type { ColorMode } from "@/lib/yard-color"

interface Props {
  focus: string | null
  onNavigate: (target: string, focus?: string) => void
}

type DataSource = "seed" | "live"
type ZoomLevel  = "yard" | "block" | "slot"

// containerColor re-exported so call-sites don't need updating
const containerColor = _containerColor

// ── Main component ────────────────────────────────────────────────────────────

export default function YardMap({ focus, onNavigate }: Props) {
  const {
    containers, zones, moves, turnByHour, cycleByType, capacity,
    backendConnected, backendSlots, backendContainers,
  } = useData()

  // ── Existing seed state (unchanged) ──────────────────────────────────────
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

  // ── Physical map + drill-down state ─────────────────────────────────────
  const [selectedBlockLabel, setSelectedBlockLabel] = useState<string | null>(null)
  const [zoomLevel, setZoomLevel] = useState<ZoomLevel>("yard")
  const [selectedSlot, setSelectedSlot] = useState<{ col: number; row: number } | null>(null)

  // ── New live-yard state ───────────────────────────────────────────────────
  const [dataSource,   setDataSource]   = useState<DataSource>("seed")
  const [liveBlock,    setLiveBlock]    = useState<string | null>(null)
  const [liveRow,      setLiveRow]      = useState(1)
  const [selSlot,      setSelSlot]      = useState<number | null>(null)
  const [liveDetail,   setLiveDetail]   = useState<BackendContainerDetail | null>(null)
  const [loadingDetail,setLoadingDetail]= useState(false)
  const [forecast,     setForecast]     = useState<BackendForecast | null>(null)
  const [loadingFcast, setLoadingFcast] = useState(false)

  // ── Existing effects (unchanged) ──────────────────────────────────────────
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

  // Reset live detail when slot changes
  useEffect(() => { setLiveDetail(null) }, [selSlot])

  // ── Live-yard derived data ────────────────────────────────────────────────
  // Group slots by block string
  const liveBlockMap = (() => {
    const map = new Map<string, typeof backendSlots>()
    for (const s of backendSlots) {
      if (!map.has(s.block)) map.set(s.block, [])
      map.get(s.block)!.push(s)
    }
    return map
  })()

  const liveBlockKeys = Array.from(liveBlockMap.keys()).sort()

  // Zone list: each unique block becomes a "zone" entry
  const liveZones = liveBlockKeys.map(blk => {
    const slots = liveBlockMap.get(blk)!
    const total = slots.length
    const occupied = slots.filter(s => s.occupied_container_id != null).length
    const pct = total > 0 ? Math.round(occupied / total * 100) : 0
    const hasHazmat = slots.some(s => s.is_hazmat_approved)
    return { blk, total, occupied, pct, hasHazmat }
  })

  // Active live block = first one if none selected
  const activeLiveBlock = liveBlock ?? liveBlockKeys[0] ?? null
  const activeLiveSlots = activeLiveBlock ? (liveBlockMap.get(activeLiveBlock) ?? []) : []


  // Front view for live block: tiers × bays, filtered to selected row
  const liveBays = Array.from(new Set(activeLiveSlots.map(s => s.bay))).sort((a, b) => a - b)
  const liveTiers = Array.from(new Set(activeLiveSlots.map(s => s.tier))).sort((a, b) => b - a)
  const liveRows = Array.from(new Set(activeLiveSlots.map(s => s.row))).sort((a, b) => a - b)
  const activeRow = liveRows.includes(liveRow) ? liveRow : (liveRows[0] ?? 1)

  // Selected slot's container
  const selSlotData = backendSlots.find(s => s.id === selSlot)
  const liveContainer = selSlotData?.occupied_container_id != null
    ? backendContainers.find(c => c.id === selSlotData.occupied_container_id)
    : null

  // Hours to detention from detention_expiry ISO string
  function hoursToDetention(expiry: string | null): number | null {
    if (!expiry) return null
    const ms = new Date(expiry).getTime() - Date.now()
    return Math.round(ms / 3_600_000)
  }

  async function loadLiveDetail() {
    if (!liveContainer || loadingDetail) return
    setLoadingDetail(true)
    try {
      const detail = await backendApi.container(liveContainer.id)
      setLiveDetail(detail)
    } catch (err) {
      console.error("[YardMap] container detail fetch failed:", err)
    } finally {
      setLoadingDetail(false)
    }
  }

  async function loadForecast() {
    if (loadingFcast) return
    setLoadingFcast(true)
    try {
      const f = await backendApi.forecast(3)
      setForecast(f)
    } catch (err) {
      console.error("[YardMap] forecast fetch failed:", err)
    } finally {
      setLoadingFcast(false)
    }
  }

  // ── Physical map layouts (seed) ───────────────────────────────────────────
  const blockLayouts = useMemo(() => computeBlockLayouts(zones, containers), [zones, containers])

  // Zone name map for tooltips
  const zoneNames = useMemo(() =>
    Object.fromEntries(zones.map(z => [z.id, z.name])),
  [zones])

  // ── Computed KPI values ───────────────────────────────────────────────────
  const seedContainers  = useMemo(() => containers.filter(c => !"RS".includes(c.zone)), [containers])
  const totalCapacity   = useMemo(() =>
    zones.filter(z => !"RS".includes(z.id))
         .reduce((s, z) => s + z.blocks * z.rows * z.slots * z.maxTiers, 0),
  [zones])
  const occupancyPct    = totalCapacity > 0 ? Math.round(seedContainers.length / totalCapacity * 100) : 0
  const totalTEU        = useMemo(() =>
    seedContainers.reduce((s, c) => s + (c.size.startsWith("40") ? 2 : 1), 0),
  [seedContainers])
  const avgTier         = seedContainers.length > 0
    ? (seedContainers.reduce((s, c) => s + c.tier, 0) / seedContainers.length).toFixed(1)
    : "—"
  const totalBlocks     = useMemo(() =>
    zones.filter(z => !"RS".includes(z.id)).reduce((s, z) => s + z.blocks, 0),
  [zones])
  const totalZones      = zones.filter(z => !"RS".includes(z.id)).length

  // Detail panel data for selected block
  const selectedLayout  = blockLayouts.find(l => l.label === selectedBlockLabel) ?? null
  const selectedZoneDef = selectedLayout ? zones.find(z => z.id === selectedLayout.zone) : null

  // ── Search (all zoom levels) ───────────────────────────────────────────────
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

  // ── Live block layouts + interior containers ───────────────────────────────
  const liveBlockLayouts = useMemo(
    () => computeLiveBlockLayouts(liveZones, zones),
    [liveZones, zones],
  )

  const liveBlockViewContainers = useMemo((): ViewContainer[] => {
    if (!activeLiveBlock) return []
    return activeLiveSlots
      .filter(s => s.occupied_container_id != null)
      .map(s => {
        const bc = backendContainers.find(c => c.id === s.occupied_container_id)
        return {
          id:          bc?.container_number ?? String(s.occupied_container_id),
          tier:        s.tier,
          slotCol:     s.bay,
          rowNum:      s.row,
          zone:        activeLiveBlock[0] ?? "?",
          block:       parseInt(activeLiveBlock.split("-")[1] ?? "1", 10) || 1,
          size:        bc ? `${bc.size_ft}ft` : "?",
          status:      bc?.status ?? "UNKNOWN",
          hoursToLFD:  -9999,
          priority:    "—",
          consignee:   "—",
          vessel:      "—",
          carrierName: "—",
          hazmat:      bc?.is_hazmat ?? s.is_hazmat_approved,
          channel:     "verde",
          dwellDays:   0,
          grossKg:     0,
          whyHere:     "",
          seal:        "—",
          terminal:    "—",
          empty:       false,
        } satisfies ViewContainer
      })
  }, [activeLiveBlock, activeLiveSlots, backendContainers])

  const liveBlockNumCols    = liveBays.length  > 0 ? Math.max(...liveBays)  : 10
  const liveBlockNumRows    = liveRows.length  > 0 ? Math.max(...liveRows)  : 3
  const liveBlockMaxTiers   = liveTiers.length > 0 ? Math.max(...liveTiers) : 4
  const activeLiveZoneDef   = zones.find(z => z.id === (activeLiveBlock?.[0] ?? ""))

  // Blocks with search matches — used for yard-level highlight rings
  const matchingBlockLabels = useMemo(() => {
    if (!ql) return new Set<string>()
    return new Set(
      containers
        .filter(c => (c.id + c.consignee + c.vessel + c.address + c.carrierName)
          .toLowerCase().includes(ql))
        .map(c => `${c.zone}-${String(c.block).padStart(2, "0")}`),
    )
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ql, containers])

  // ── Render ────────────────────────────────────────────────────────────────
  const isLive = dataSource === "live"

  return (
    <div className="flex flex-col h-full min-h-0 overflow-auto bg-white text-neutral-900">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2.5 px-5 py-3 border-b-2 border-neutral-200 flex-none">
        <div className="flex flex-col gap-0.5 mr-1.5">
          <span className="font-black text-[19px] tracking-tight">Yard</span>
          <span className="text-[11px] text-neutral-500">
            {isLive
              ? `${backendSlots.length} slots · ${backendContainers.length} containers · live yard`
              : `${all.length} containers · ${ql ? `${all.filter(match).length} match "${q}"` : "7 zones · overlay: "+mode}`}
          </span>
        </div>

        {/* Map / Dashboard toggle */}
        <div className="flex">
          {(["map","dash"] as const).map((k,i)=>(
            <button key={k} onClick={()=>setView(k)}
              className="text-[10.5px] px-3 py-1.5 border border-neutral-300 font-bold transition-colors"
              style={{ borderRight:i===0?"none":undefined, background:view===k?"#201e1d":"transparent", color:view===k?"#fff":"#333" }}>
              {k==="map"?"Map":"Dashboard"}
            </button>
          ))}
        </div>

        {/* Data source toggle */}
        <div className="flex items-center gap-1.5">
          <span className="ds-label text-neutral-500 whitespace-nowrap">Source</span>
          {(["seed","live"] as DataSource[]).map((src, i, arr) => (
            <button
              key={src}
              disabled={src === "live" && !backendConnected}
              title={src === "live" && !backendConnected ? "Backend unavailable" : undefined}
              onClick={() => setDataSource(src)}
              className="text-[10.5px] px-3 py-1.5 border border-neutral-300 font-bold transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              style={{ borderRight:i<arr.length-1?"none":undefined, background:dataSource===src?"#201e1d":"transparent", color:dataSource===src?"#fff":"#201e1d" }}
            >
              {src === "seed" ? "Seed data" : backendConnected ? "Live yard" : "Engine offline"}
            </button>
          ))}
        </div>

        {view==="map" && (
          <Input
            placeholder="Container, consignee, vessel, slot…"
            value={q} onChange={e => setQ(e.target.value)}
            className="w-48 h-7 text-xs"
          />
        )}

        {view==="map" && !isLive && (
          <div className="flex flex-wrap gap-px">
            {(["status","lfd","channel","dwell","priority","rehandle"] as ColorMode[]).map((k,i,arr)=>(
              <button key={k} onClick={()=>setMode(k)}
                className="text-[10px] px-2 py-1.5 border border-neutral-300 font-semibold capitalize transition-colors"
                style={{ borderRight:i<arr.length-1?"none":undefined, background:mode===k?"#201e1d":"transparent", color:mode===k?"#fff":"#333" }}>
                {k}
              </button>
            ))}
          </div>
        )}

        {/* Breadcrumb — visible when drilled below yard level */}
        {view==="map" && zoomLevel !== "yard" && (
          <div className="flex items-center gap-1.5 text-[11px] text-neutral-500 font-medium ml-1">
            <button
              onClick={() => { setZoomLevel("yard"); setSelectedSlot(null) }}
              className="hover:text-neutral-900 transition-colors"
            >Yard</button>
            {(selectedBlockLabel || activeLiveBlock) && (
              <>
                <span className="text-neutral-300">›</span>
                <button
                  onClick={() => { setZoomLevel("block"); setSelectedSlot(null) }}
                  className="hover:text-neutral-900 transition-colors"
                >{selectedBlockLabel ?? activeLiveBlock}</button>
              </>
            )}
            {zoomLevel === "slot" && selectedSlot && (
              <>
                <span className="text-neutral-300">›</span>
                <span className="text-neutral-900">Bay {selectedSlot.col} · Row {selectedSlot.row}</span>
              </>
            )}
          </div>
        )}

        {view==="map" && !isLive && (
          <div className="flex gap-2.5 ml-auto items-center flex-wrap">
            {LEGENDS[mode].map(([label,color])=>(
              <span key={label} className="flex items-center gap-1.5 text-[11px] text-neutral-600">
                <span className="w-2.5 h-2.5 border border-neutral-400 inline-block" style={{background:color}} />
                {label}
              </span>
            ))}
          </div>
        )}

        {view==="map" && isLive && (
          <div className="flex gap-3.5 ml-auto items-center">
            {[["Occupied","#374151"],["Empty","#e5e7eb"],["Hazmat + occupied","#f97316"],["Hazmat empty","#fed7aa"]].map(([l,c])=>(
              <span key={l} className="flex items-center gap-1.5 text-[11px] text-neutral-600">
                <span className="w-2.5 h-2.5 border border-neutral-400 inline-block" style={{background:c}} />
                {l}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* ════════════════════════════════════════════════════════════════
          SEED MAP MODE — physical yard canvas
          ════════════════════════════════════════════════════════════════ */}
      {view==="map" && !isLive && (
        <>
          {/* KPI bar — only at yard level */}
          {zoomLevel === "yard" && (
            <div className="flex flex-wrap border-b-2 border-neutral-200 flex-none">
              {([
                { k:"Occupancy",             v:`${occupancyPct}%`,          sub:`${seedContainers.length} of ${totalCapacity} slots · ceiling 85%`, red: occupancyPct > 85 },
                { k:"TEU on terminal",       v:String(totalTEU),            sub:`${seedContainers.length} units` },
                { k:"Avg stack height",      v:`${avgTier} tiers`,          sub:"across all blocks" },
                { k:"Blocks · Zones",        v:`${totalBlocks} · ${totalZones}`, sub:"in physical yard" },
                { k:"Detention at risk 72 h",v:"$8.4k",                    sub:"31 containers", red: true },
              ] as { k:string; v:string; sub:string; red?:boolean }[]).map(m => (
                <div key={m.k} className="flex-1 basis-36 px-5 py-2.5 border-r border-neutral-200 flex flex-col gap-0.5">
                  <span className="ds-label text-neutral-500">{m.k}</span>
                  <div className="flex items-baseline gap-2">
                    <span className={`font-black text-[19px] leading-none tracking-tight ${m.red ? "text-[#dc2626]" : ""}`}>{m.v}</span>
                    <span className="text-[11px] text-neutral-500">{m.sub}</span>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Zoom-level view */}
          <div className="flex flex-1 min-h-0 overflow-hidden" style={{ transition: "opacity 200ms" }}>

            {/* Yard level — physical map */}
            {zoomLevel === "yard" && (
              <PhysicalYardMap
                layouts={blockLayouts}
                selectedBlock={null}
                onSelectBlock={label => {
                  setSelectedBlockLabel(label)
                  setZoomLevel("block")
                  setSelectedSlot(null)
                }}
                zoneNames={zoneNames}
              />
            )}

            {/* Block level — interior grid */}
            {zoomLevel === "block" && selectedBlockLabel && selectedZoneDef && (
              <BlockInteriorView
                blockLabel={selectedBlockLabel}
                zoneName={selectedZoneDef.name}
                numCols={selectedZoneDef.slots}
                numRows={selectedZoneDef.rows}
                maxTiers={selectedZoneDef.maxTiers}
                containers={selectedBlockViewContainers}
                mode={mode}
                searchQuery={q}
                selectedSlot={selectedSlot}
                onSlotClick={(col, row) => { setSelectedSlot({ col, row }); setZoomLevel("slot") }}
                onBack={() => { setZoomLevel("yard"); setSelectedSlot(null); setSelectedBlockLabel(null) }}
              />
            )}

            {/* Slot level — tier stack */}
            {zoomLevel === "slot" && selectedSlot && selectedBlockLabel && selectedZoneDef && (
              <SlotStackView
                blockLabel={selectedBlockLabel}
                zoneName={selectedZoneDef.name}
                slotCol={selectedSlot.col}
                rowNum={selectedSlot.row}
                maxTiers={selectedZoneDef.maxTiers}
                containers={selectedBlockViewContainers.filter(
                  c => c.slotCol === selectedSlot.col && c.rowNum === selectedSlot.row,
                )}
                mode={mode}
                onBack={() => setZoomLevel("block")}
                onNavigate={onNavigate}
              />
            )}
          </div>
        </>
      )}

      {/* ════════════════════════════════════════════════════════════════
          LIVE YARD MAP MODE
          ════════════════════════════════════════════════════════════════ */}
      {view==="map" && isLive && (
        <>
          {/* Live KPI bar — only at yard level */}
          {zoomLevel === "yard" && (
            <div className="flex flex-wrap border-b-2 border-neutral-200 flex-none">
              {[
                {k:"Total slots",    v:String(backendSlots.length),   sub:"in yard"},
                {k:"Occupied",       v:String(backendSlots.filter(s=>s.occupied_container_id!=null).length), sub:`of ${backendSlots.length}`},
                {k:"Occupancy",      v:backendSlots.length?Math.round(backendSlots.filter(s=>s.occupied_container_id!=null).length/backendSlots.length*100)+"%":"—", sub:"live"},
                {k:"Hazmat slots",   v:String(backendSlots.filter(s=>s.is_hazmat_approved).length), sub:"approved"},
                {k:"Reefer slots",   v:String(backendSlots.filter(s=>s.is_reefer_capable).length), sub:"capable"},
              ].map(m=>(
                <div key={m.k} className="flex-1 basis-36 px-5 py-2.5 border-r border-neutral-200 flex flex-col gap-0.5">
                  <span className="text-[10px] tracking-widests uppercase text-neutral-500">{m.k}</span>
                  <div className="flex items-baseline gap-2">
                    <span className="font-black text-[19px] leading-none tracking-tight">{m.v}</span>
                    <span className="text-[11px] text-neutral-500">{m.sub}</span>
                  </div>
                </div>
              ))}
            </div>
          )}

          {backendSlots.length === 0 ? (
            <div className="flex-1 flex items-center justify-center">
              <div className="border border-neutral-300 bg-neutral-50 px-8 py-6 max-w-sm text-center">
                <div className="font-black text-[16px] mb-1.5">No slot data from backend</div>
                <div className="text-[12.5px] text-neutral-600 leading-relaxed">
                  Backend connected but returned no yard slots. Check the planning engine.
                </div>
              </div>
            </div>
          ) : (
            <div className="flex flex-1 min-h-0 overflow-hidden" style={{ transition: "opacity 200ms" }}>

              {/* Yard level — physical map (live data) */}
              {zoomLevel === "yard" && (
                <PhysicalYardMap
                  layouts={liveBlockLayouts}
                  selectedBlock={null}
                  onSelectBlock={blk => {
                    setLiveBlock(blk)
                    setZoomLevel("block")
                    setSelectedSlot(null)
                  }}
                  zoneNames={zoneNames}
                />
              )}

              {/* Block level — interior grid (live data) */}
              {zoomLevel === "block" && activeLiveBlock && (
                <BlockInteriorView
                  blockLabel={activeLiveBlock}
                  zoneName={activeLiveZoneDef?.name ?? activeLiveBlock}
                  numCols={liveBlockNumCols}
                  numRows={liveBlockNumRows}
                  maxTiers={liveBlockMaxTiers}
                  containers={liveBlockViewContainers}
                  mode={mode}
                  searchQuery={q}
                  selectedSlot={selectedSlot}
                  onSlotClick={(col, row) => { setSelectedSlot({ col, row }); setLiveRow(row); setZoomLevel("slot") }}
                  onBack={() => { setZoomLevel("yard"); setSelectedSlot(null) }}
                />
              )}

              {/* Slot level — tier stack (live data) */}
              {zoomLevel === "slot" && selectedSlot && activeLiveBlock && (
                <SlotStackView
                  blockLabel={activeLiveBlock}
                  zoneName={activeLiveZoneDef?.name ?? activeLiveBlock}
                  slotCol={selectedSlot.col}
                  rowNum={selectedSlot.row}
                  maxTiers={liveBlockMaxTiers}
                  containers={liveBlockViewContainers.filter(
                    c => c.slotCol === selectedSlot.col && c.rowNum === selectedSlot.row,
                  )}
                  mode={mode}
                  onBack={() => setZoomLevel("block")}
                />
              )}
            </div>
          )}
        </>
      )}

      {/* ════════════════════════════════════════════════════════════════
          DASHBOARD — seed charts unchanged, add forecast load button
          ════════════════════════════════════════════════════════════════ */}
      {view==="dash" && (
        <div className="flex-1 min-h-0 overflow-auto">
          <div className="flex flex-wrap border-b-2 border-neutral-200">
            {[
              {k:"Truck turn P50",v:"13.8′",target:"15.0′",baseline:"31.4′",verdict:"WITHIN",red:false},
              {k:"Truck turn P90",v:"21.4′",target:"22.0′",baseline:"52.8′",verdict:"WITHIN",red:false},
              {k:"Job cycle P50",v:"4.9′",target:"5.0′",baseline:"8.7′",verdict:"WITHIN",red:false},
              {k:"Job cycle P90",v:"7.6′",target:"7.5′",baseline:"14.2′",verdict:"OVER 0.1′",red:true},
            ].map(c=>(
              <div key={c.k} className="flex-1 basis-52 px-5 py-3.5 border-r border-neutral-200">
                <div className="flex justify-between items-baseline">
                  <span className="text-[10px] tracking-widests uppercase text-neutral-500">{c.k}</span>
                  <span className={`text-[10px] font-bold tracking-wider ${c.red?"text-[#dc2626]":""}`}>{c.verdict}</span>
                </div>
                <div className="flex items-baseline gap-2 mt-1.5">
                  <span className={`font-black text-[26px] leading-none tracking-tight ${c.red?"text-[#dc2626]":""}`}>{c.v}</span>
                  <span className="text-[11.5px] text-neutral-500">target {c.target} · baseline {c.baseline}</span>
                </div>
              </div>
            ))}
          </div>
          <div className="grid min-h-80" style={{gridTemplateColumns:"minmax(360px,1fr) minmax(320px,1fr)"}}>
            {/* Left: turn + cycle charts (unchanged) */}
            <div className="border-r-2 border-neutral-200 px-5 py-3">
              <div className="text-[10px] tracking-widests uppercase text-neutral-500 font-bold">Truck turn by hour</div>
              <div className="flex items-end gap-2 h-40 mt-2.5">
                {turnByHour.map(t=>(
                  <div key={t.hour} className="flex-1 flex flex-col justify-end gap-0.5 h-full">
                    <div className="bg-neutral-300" style={{height:((t.p90-t.p50)/28*100).toFixed(1)+"%"}} />
                    <div className={t.p50>15?"bg-[#dc2626]":"bg-neutral-800"} style={{height:(t.p50/28*100).toFixed(1)+"%"}} />
                    <span className="text-[9.5px] text-neutral-500">{t.hour}</span>
                  </div>
                ))}
              </div>
              <p className="text-[11px] text-neutral-500 mt-2.5 leading-relaxed">Grey is P90, solid is P50. The 08:00 hour breaches — inbound put-away competes with outbound loading.</p>
              <div className="mt-3.5 text-[10px] tracking-widests uppercase text-neutral-500 font-bold">Machine job cycle by move type</div>
              {cycleByType.map(r=>(
                <div key={r.type} className="py-1.5 border-b border-neutral-200">
                  <div className="flex justify-between text-[11.5px]">
                    <span>{r.type}</span>
                    <span className="tabular text-neutral-500">P50 <strong className={r.p50>5?"text-[#dc2626]":""}>{r.p50.toFixed(1)}′</strong> · P90 {r.p90.toFixed(1)}′ · n={r.n}</span>
                  </div>
                </div>
              ))}
            </div>

            {/* Right: capacity — seed data OR live forecast */}
            <div className="px-5 py-3">
              <div className="flex items-baseline gap-3 mb-3">
                <div className="text-[10px] tracking-widests uppercase text-neutral-500 font-bold">
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
                <div key={c.month} className="py-2.5 border-b border-neutral-200">
                  <div className="flex justify-between text-[11.5px]">
                    <span className="font-semibold">{c.month} · {c.volume} containers</span>
                    <span className={`tabular ${c.breach?"text-[#dc2626]":"text-neutral-600"}`}>{c.required.toFixed(1)} req / {c.available.toFixed(1)} avail</span>
                  </div>
                  <div className="relative h-2 bg-neutral-100 mt-1.5">
                    <div className={c.breach?"bg-[#dc2626]":"bg-neutral-600"} style={{position:"absolute",left:0,top:0,bottom:0,width:Math.min(100,c.required/55*100).toFixed(0)+"%"}} />
                    <div className="absolute top-[-2px] h-3 w-0.5 bg-neutral-900" style={{left:(c.available/55*100).toFixed(0)+"%"}} />
                  </div>
                  <div className="text-[10.5px] text-neutral-500 mt-1">{c.breach?"breach — "+(c.required-c.available).toFixed(1)+" machine-hours short":"within available hours"}</div>
                </div>
              ))}

              {forecast && (
                <>
                  {forecast.first_over_capacity_day && (
                    <div className="mb-3 px-3 py-2 bg-amber-50 border border-amber-300 text-[11.5px] text-amber-900">
                      First over-capacity day: <strong>{forecast.first_over_capacity_day}</strong>
                    </div>
                  )}
                  <div className="flex items-end gap-1.5 h-36 mt-1 mb-3">
                    {forecast.points.map(p => {
                      const maxOcc = Math.max(...forecast.points.map(x => x.projected_occupancy), p.capacity)
                      const occH = (p.projected_occupancy / maxOcc * 100).toFixed(1)
                      const capH = (p.capacity / maxOcc * 100).toFixed(1)
                      return (
                        <div key={p.day} className="flex-1 flex flex-col justify-end items-center gap-0.5 h-full min-w-[18px]">
                          <div className="w-full relative flex items-end justify-center h-full">
                            <div className="absolute bottom-0 w-full opacity-30 bg-neutral-400" style={{height:capH+"%"}} />
                            <div className={`w-[60%] ${p.over_capacity?"bg-[#dc2626]":"bg-neutral-700"}`} style={{height:occH+"%"}} />
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
    </div>
  )
}
