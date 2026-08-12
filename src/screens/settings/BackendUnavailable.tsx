export default function BackendUnavailable({ desc }: { desc: string }) {
  return (
    <div className="px-5 py-6">
      <div className="border border-neutral-300 bg-[#f9fafb] px-5 py-5 max-w-lg">
        <div className="font-semibold text-[15px] mb-1" style={{ fontFamily: "inherit" }}>Backend not available</div>
        <div className="text-[12.5px] text-neutral-600 leading-relaxed">{desc}</div>
      </div>
    </div>
  )
}
