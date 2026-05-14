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
          D: "#ef4444",
        },
      },
    },
  },
  plugins: [],
};
