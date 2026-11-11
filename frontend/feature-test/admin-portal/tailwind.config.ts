import type { Config } from "tailwindcss";

// Shared design tokens for every SmartLogi portal (colors / fonts / shadows).
// Portal-specific values, if ever needed, belong in `theme.extend` below.
const uiPreset = require("../../../packages/ui-tokens/tailwind-preset.cjs");

const config: Config = {
  darkMode: "class",
  presets: [uiPreset],
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
    "../../../packages/ui-kit/**/*.{ts,tsx}",
    "../../../packages/ui-components/**/*.{ts,tsx,js,jsx}",
  ],
  plugins: [],
};
export default config;
