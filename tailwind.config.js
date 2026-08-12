/** @type {import('tailwindcss').Config} */
export default {
  darkMode: ["class"],
  content: [
    "./index.html",
    "./src/**/*.{ts,tsx,js,jsx}",
  ],
  theme: {
    extend: {
      colors: {
        /* shadcn/ui compat */
        border:      "hsl(var(--border))",
        input:       "hsl(var(--input))",
        ring:        "hsl(var(--ring))",
        background:  "hsl(var(--background))",
        foreground:  "hsl(var(--foreground))",
        primary: {
          DEFAULT:   "hsl(var(--primary))",
          foreground:"hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT:   "hsl(var(--secondary))",
          foreground:"hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT:   "hsl(var(--destructive))",
          foreground:"hsl(var(--destructive-foreground))",
        },
        muted: {
          DEFAULT:   "hsl(var(--muted))",
          foreground:"hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT:   "hsl(var(--accent))",
          foreground:"hsl(var(--accent-foreground))",
        },
        popover: {
          DEFAULT:   "hsl(var(--popover))",
          foreground:"hsl(var(--popover-foreground))",
        },
        card: {
          DEFAULT:   "hsl(var(--card))",
          foreground:"hsl(var(--card-foreground))",
        },

        /* ── Design system tokens ─────────────────────── */
        sidebar: {
          DEFAULT: "#0f1117",
          border:  "rgba(255,255,255,0.06)",
          active:  "rgba(220,38,38,0.08)",
          text:    "#ffffff",
          muted:   "#9ca3af",
          faint:   "#4b5563",
        },
        brand: {
          DEFAULT: "#dc2626",
          bg:      "#fef2f2",
          border:  "#fecaca",
          dark:    "#b91c1c",
        },
        ds: {
          bg:        "#f4f5f7",
          surface:   "#ffffff",
          fg:        "#111827",
          muted:     "#6b7280",
          subtle:    "#9ca3af",
          border:    "#e5e7eb",
          borderlt:  "#f3f4f6",
          /* Status palette */
          blue:      "#2563eb",
          purple:    "#7c3aed",
          amber:     "#d97706",
          green:     "#059669",
          cyan:      "#0891b2",
          red:       "#dc2626",
        },
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
        /* Design system buttons use 5px */
        btn: "5px",
      },
      fontSize: {
        "2xs": ["9px",  { lineHeight: "1.2", letterSpacing: "0.1em" }],
        "xs":  ["11px", { lineHeight: "1.4" }],
        "sm":  ["12px", { lineHeight: "1.5" }],
        "base":["13px", { lineHeight: "1.5" }],
        "lg":  ["15px", { lineHeight: "1.4" }],
        "xl":  ["17px", { lineHeight: "1.3" }],
        "2xl": ["19px", { lineHeight: "1.2" }],
        "3xl": ["22px", { lineHeight: "1.1" }],
        "4xl": ["26px", { lineHeight: "1.0" }],
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
        mono: ["JetBrains Mono", "Menlo", "Courier New", "monospace"],
      },
      spacing: {
        /* 4px grid: 1=4, 2=8, 3=12, 4=16, 5=20, 6=24, 8=32 */
      },
      keyframes: {
        "accordion-down": {
          from: { height: "0" },
          to:   { height: "var(--radix-accordion-content-height)" },
        },
        "accordion-up": {
          from: { height: "var(--radix-accordion-content-height)" },
          to:   { height: "0" },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up":   "accordion-up 0.2s ease-out",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
}
