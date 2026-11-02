import type { Config } from "tailwindcss";

// Colours read the RGB channel variables in app/globals.css, so opacity
// modifiers work: `bg-blue/10`, `border-chalk/15`.
const channel = (name: string) => `rgb(var(--${name}-rgb) / <alpha-value>)`;
const names = [
  "void", "deep", "panel", "raised", "hair", "chalk", "mist", "fog", "signal",
  "cyan", "amber", "violet", "violet-glow", "ice", "supply", "return", "exhaust",
  "paper", "white", "ink", "graphite", "silver",
  "red", "blue", "green", "red-ink", "blue-ink", "green-ink", "red-glow", "blue-glow", "green-glow",
];

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./lib/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: Object.fromEntries(names.map((n) => [n, channel(n)])),
      fontFamily: {
        sans: ["var(--font-sans)"],
        mono: ["var(--font-mono)"],
      },
      transitionTimingFunction: {
        out: "var(--ease-out)",
        "in-out": "var(--ease-in-out)",
      },
    },
  },
  plugins: [],
};

export default config;
