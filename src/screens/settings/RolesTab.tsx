export default function RolesTab() {
  return (
    <div className="flex-1 min-h-0 overflow-auto">
      <table className="w-full border-collapse text-[12px]">
        <thead>
          <tr>
            {["PERSONA","SCREENS","USERS","NOTE"].map(h => (
              <th key={h} className="ds-th text-left"
                style={{paddingLeft:h==="PERSONA"?"20px":"12px",paddingRight:h==="NOTE"?"20px":"12px"}}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {[
            {name:"Yard Manager",    screens:"Yard · Plan · Tower · Gate · Operator · Settings", users:6,  note:"Owns the plan and the exceptions; can override with a reason code"},
            {name:"Gate & Yard Ops", screens:"Yard · Gate",                                      users:4,  note:"Gate clerks and yard operators — front line, no config authority"},
            {name:"Operator",        screens:"Operator",                                          users:11, note:"Device-bound; single-instruction view; supervisor-approved exceptions"},
          ].map(p => (
            <tr key={p.name} className="border-b border-[#f3f4f6]" style={{ minHeight: 38 }}>
              <td className="py-3 pl-5 pr-3 font-bold">{p.name}</td>
              <td className="px-3 py-3">{p.screens}</td>
              <td className="px-3 py-3 font-mono">{p.users}</td>
              <td className="px-3 py-3 pr-5 text-neutral-600 leading-relaxed">{p.note}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="px-5 py-4 text-[12px] leading-relaxed text-neutral-700 max-w-3xl">
        Three personas replaces the nine-role matrix from PRD v2.0. Every access is written to the audit log.
        Broker and finance views arrive after Phase 0 — they were external and reporting audiences that don't reshape day-of operations.
      </div>
    </div>
  )
}
