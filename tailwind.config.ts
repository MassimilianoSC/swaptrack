import type { Config } from "tailwindcss";

// Every color, font, radius and spacing comes from src/styles/tokens.css (§15).
const v = (name: string) => `rgb(var(--${name}) / <alpha-value>)`;

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx,js,jsx}"],
  theme: {
    extend: {
      colors: {
        bg: v("bg"),
        surface: v("surface"),
        "surface-2": v("surface-2"),
        border: v("border"),
        fg: v("fg"),
        muted: v("muted"),
        primary: v("primary"),
        "primary-fg": v("primary-fg"),
        danger: v("danger"),
        success: v("success"),
        warning: v("warning"),
        focus: v("focus"),
      },
      fontFamily: {
        sans: ["var(--font-sans)"],
        mono: ["var(--font-mono)"],
      },
      borderRadius: {
        sm: "var(--radius-sm)",
        DEFAULT: "var(--radius)",
        lg: "var(--radius-lg)",
      },
      borderWidth: { DEFAULT: "var(--border-w)" },
      spacing: { touch: "var(--touch)" },
      minHeight: { touch: "var(--touch)" },
      minWidth: { touch: "var(--touch)" },
    },
  },
  plugins: [],
} satisfies Config;
