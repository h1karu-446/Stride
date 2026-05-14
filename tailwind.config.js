/** @type {import('tailwindcss').Config} */
export default {
  darkMode: "class",
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        cluster: {
          A: "#22c55e",
          B: "#3b82f6",
          C: "#f59e0b",
          D: "#f97316",
          E: "#ef4444",
        },
        notion: {
          bg: "#191919",
          panel: "#202020",
          "panel-hover": "#2A2A2A",
          border: "#2F2F2F",
          "border-strong": "#373737",
          fg: "#E6E6E6",
          muted: "#9B9A97",
          blue: "#2383E2",
          "blue-hover": "#1A6FC4",
        },
      },
    },
  },
  plugins: [],
};
