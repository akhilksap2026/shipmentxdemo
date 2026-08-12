import { useState } from "react"
import WeightFactorsTab   from "./settings/WeightFactorsTab"
import PriorityFactorsTab from "./settings/PriorityFactorsTab"
import AdapterHealthTab   from "./settings/AdapterHealthTab"
import MasterDataTab      from "./settings/MasterDataTab"
import RolesTab           from "./settings/RolesTab"
import SolverConfigTab    from "./settings/SolverConfigTab"
import OptimizerRunsTab   from "./settings/OptimizerRunsTab"
import ForecastTab        from "./settings/ForecastTab"

const TABS = [
  ["plan",         "Plan weights"],
  ["priority",     "Priority factors"],
  ["integrations", "Integrations"],
  ["data",         "Master data"],
  ["roles",        "Roles"],
  ["solver",       "Solver config"],
  ["optimizer",    "Optimizer"],
  ["forecast",     "Capacity forecast"],
]

export default function SettingsScreen() {
  const [tab, setTab] = useState("plan")

  return (
    <div className="flex flex-col h-full min-h-0 overflow-auto bg-white text-neutral-900">
      {/* Header */}
      <div className="flex items-start gap-3 px-5 pt-3 pb-3 border-b-2 border-neutral-200 flex-none">
        <div className="flex flex-col gap-1 shrink-0">
          <span className="font-mono font-semibold leading-none" style={{ fontSize: 26 }}>Settings</span>
          <span className="text-[11px] text-neutral-500">
            Objective weights, master data, adapters, roles, degraded mode — every operator-relevant switch in one place
          </span>
        </div>
        {/* Tab bar */}
        <div className="flex flex-wrap ml-3"
          style={{ border: "1px solid #e5e7eb", borderRadius: 5, overflow: "hidden", display: "flex" }}>
          {TABS.map(([k, label]) => (
            <button key={k} onClick={() => setTab(k)}
              className="text-[11.5px] px-3 py-1 font-bold transition-colors"
              style={{
                background: tab === k ? "#111827" : "transparent",
                color:      tab === k ? "#fff"    : "#374151",
              }}>
              {label}
            </button>
          ))}
        </div>
        <div className="ml-auto text-[11px] text-neutral-500 shrink-0 pt-1">
          Changes are audited · commit lands on the next generation
        </div>
      </div>

      {tab === "plan"         && <WeightFactorsTab />}
      {tab === "priority"     && <PriorityFactorsTab />}
      {tab === "integrations" && <AdapterHealthTab />}
      {tab === "data"         && <MasterDataTab />}
      {tab === "roles"        && <RolesTab />}
      {tab === "solver"       && <SolverConfigTab />}
      {tab === "optimizer"    && <OptimizerRunsTab />}
      {tab === "forecast"     && <ForecastTab />}
    </div>
  )
}
