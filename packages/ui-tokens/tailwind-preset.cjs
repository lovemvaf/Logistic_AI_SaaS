/**
 * SmartLogi — canonical UI tokens (single source of truth).
 *
 * Every portal imports this preset from its own tailwind.config.ts:
 *
 *   const uiPreset = require('../../../packages/ui-tokens/tailwind-preset.cjs');
 *   const config: Config = { presets: [uiPreset], content: [...] };
 *
 * Phase 2.5 visual language: "warm operational editorial".
 * Paper + ink + one sage accent. Dense tables, hairline rules, no decorative
 * icons, no gradients, no heavy card shadows.
 */

/**
 * Canonical neutral ramp. Legacy screens still use `slate-*`, `gray-*`,
 * `zinc-*`, `neutral-*` and `stone-*` interchangeably; mapping all five
 * families to the same warm ramp keeps those pages visually consistent without
 * a risky 1:1 rewrite of every class name.
 *
 * The ramp is intentionally warm (paper, not blue-grey). 500+ values are
 * contrast-checked against the canvas; 400 is reserved for borders, icons and
 * non-essential metadata.
 */
const neutralPalette = {
  50: '#fbf9f5',
  100: '#f4f0e8',
  200: '#e8e1d6',
  300: '#d2c7b8',
  400: '#8a8174',
  500: '#6f695f',
  600: '#5e5a51',
  700: '#46443e',
  800: '#30332e',
  900: '#20241f',
  950: '#141612',
};

/** @type {import('tailwindcss').Config} */
module.exports = {
  theme: {
    extend: {
      colors: {
        // One warm neutral ramp for every legacy palette family (see above).
        slate: neutralPalette,
        gray: neutralPalette,
        zinc: neutralPalette,
        neutral: neutralPalette,
        stone: neutralPalette,

        // Pure white/black are replaced with paper/ink variants. This keeps
        // legacy `bg-white` / `text-white` classes inside the warm system
        // without a risky rewrite of every page.
        white: '#fbf9f5',
        black: '#20241f',

        // Semantic surface tokens used by the shared shell and new pages.
        canvas: '#f6f3ee',
        background: '#f6f3ee',
        surface: '#fbf9f5',
        'surface-alt': '#efeae2',
        border: '#ded7cb',
        line: '#ded7cb',
        'line-strong': '#c9c0b2',
        ink: '#20241f',
        'ink-soft': '#6a6e64',
        'ink-faint': '#62665c',

        // One accent only. Everything else is semantic status.
        primary: {
          DEFAULT: '#2f4a3c',
          50: '#eef2ee',
          100: '#dde6df',
          200: '#bccfc1',
          300: '#93b09c',
          400: '#6b8f78',
          500: '#4c7259',
          600: '#263d31',
          700: '#1f3328',
          800: '#19291f',
          900: '#132018',
        },
        'primary-hover': '#263d31',
        'primary-soft': '#e4eae4',
        accent: '#2f4a3c',
        'accent-hover': '#263d31',
        'accent-soft': '#e4eae4',
        secondary: '#4c6570',
        ember: '#a3483f',

        // Status colours are muted so they sit on paper without glowing.
        success: '#3f6b4f',
        warning: '#8a5d28',
        danger: '#a3483f',
        info: '#4c6570',

        // Compatibility aliases for legacy class names still present in the
        // apps (e.g. `text-inkSoft`, `bg-surfaceMuted`).
        inkSoft: '#6a6e64',
        surfaceMuted: '#efeae2',
        primaryHover: '#263d31',
      },
      fontFamily: {
        sans: [
          '"Plus Jakarta Sans"',
          'system-ui',
          '-apple-system',
          'BlinkMacSystemFont',
          '"Segoe UI"',
          'Roboto',
          'sans-serif',
        ],
        editorial: [
          '"Cormorant Garamond"',
          'Georgia',
          'ui-serif',
          '"Times New Roman"',
          'serif',
        ],
        heading: [
          '"Cormorant Garamond"',
          'Georgia',
          'ui-serif',
          '"Times New Roman"',
          'serif',
        ],
        mono: [
          'ui-monospace',
          'SFMono-Regular',
          'Menlo',
          'Monaco',
          'Consolas',
          '"Liberation Mono"',
          'monospace',
        ],
      },
      boxShadow: {
        // Cards are almost flat. Elevation is reserved for modals/dropdowns.
        card: '0 1px 2px 0 rgb(32 36 31 / 0.04)',
        cardHover: '0 2px 6px -2px rgb(32 36 31 / 0.06)',
        glass: '0 1px 2px 0 rgb(32 36 31 / 0.03)',
        soft: '0 1px 2px 0 rgb(32 36 31 / 0.05)',
        floating: '0 8px 24px rgb(32 36 31 / 0.08)',
      },
      fontVariantNumeric: {
        tabular: 'tabular-nums',
      },
    },
  },
};
