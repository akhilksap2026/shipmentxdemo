import { useEffect, useState } from "react"
import type { BackendContainer } from "@/lib/backend-api"

interface ContainerPickerProps {
  containers: BackendContainer[]
  value: number | ""
  onChange: (id: number, display: string) => void
  placeholder?: string
  disabled?: boolean
}

export default function ContainerPicker({
  containers,
  value,
  onChange,
  placeholder = "Search container number…",
  disabled,
}: ContainerPickerProps) {
  const [searchQuery, setSearchQuery] = useState("")

  // When value is cleared externally, reset search query
  useEffect(() => {
    if (value === "") {
      setSearchQuery("")
    }
  }, [value])

  const filtered = searchQuery.trim()
    ? containers.filter(c =>
        c.container_number.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : containers.slice(0, 20)

  const showDropdown = searchQuery.trim().length > 0 && value === ""

  return (
    <div>
      <input
        type="text"
        placeholder={placeholder}
        value={searchQuery}
        disabled={disabled}
        onChange={e => {
          setSearchQuery(e.target.value)
        }}
        className="w-full border border-[#e5e7eb] px-2 py-1.5 text-[12px] mb-1"
        style={{ borderRadius: 5 }}
      />
      {showDropdown && (
        <div className="border border-[#e5e7eb] bg-white max-h-36 overflow-auto" style={{ borderRadius: 5 }}>
          {filtered.length === 0 && (
            <div className="px-3 py-2 text-[11.5px] text-neutral-500">No containers match</div>
          )}
          {filtered.map(c => (
            <button
              key={c.id}
              onClick={() => {
                onChange(c.id, c.container_number)
                setSearchQuery(c.container_number)
              }}
              className="block w-full text-left px-3 py-2 text-[11.5px] hover:bg-[#f9fafb] border-b border-[#f3f4f6] last:border-0"
            >
              <span className="font-mono font-semibold">{c.container_number}</span>
              <span className="ml-2 text-neutral-500">{c.size_ft}ft · {c.status.replace(/_/g, " ")}</span>
            </button>
          ))}
        </div>
      )}
      {value !== "" && (
        <div className="text-[11px] mt-0.5" style={{ color: "#059669" }}>✓ {searchQuery}</div>
      )}
    </div>
  )
}
