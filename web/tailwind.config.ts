import type { Config } from 'tailwindcss';

/**
 * Design tokens for the approved 2026 redesign (`pharmalink_redesign.html`).
 *
 * Two rules that are load-bearing, not style preferences:
 *
 *  1. **Never add an ad-hoc hex to a component** — add a token here. The old
 *     palette leaked raw values into ~40 files and made the redesign a rewrite
 *     rather than a token swap.
 *  2. **Status colours are reserved.** `ok` / `warn` / `danger` mean
 *     good / caution / critical and are never reused as brand or as a chart
 *     series. This is why brand is teal-CYAN rather than the verified-green it
 *     would otherwise collide with.
 *
 * Chart series live in `--series-*` (see globals.css) and are validated steps of
 * this palette — do not read brand colours into a chart.
 */
const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  /**
   * Light only, by product decision. Pharmaceutical procurement is done in lit
   * offices and labs, printed, and shown in audits — a dark surface helps none
   * of that, and half-maintained dark variants are how contrast bugs ship.
   * There is no `dark:` variant available, so one cannot be added by accident.
   */
  theme: {
    extend: {
      colors: {
        /** Deep pharma ink — the dark ground of the marketing site and app rail. */
        ink: {
          DEFAULT: '#06121F',
          2: '#0B1D30',
          3: '#12283E',
        },
        /** Brand teal → cyan. The gradient pair is `from-teal to-cyan`. */
        teal: {
          DEFAULT: '#0FBFA4',
          deep: '#0A8F7C',
          bright: '#12D6B4',
          pale: '#E5F9F3',
        },
        cyan: {
          DEFAULT: '#41B7F0',
          deep: '#0FA3C4',
          pale: '#DBF1FB',
        },
        /** Accents used for emphasis that is NOT a status. */
        gold: { DEFAULT: '#F2B33D', deep: '#B27A16', pale: '#FEF4E4' },
        coral: { DEFAULT: '#F26D6D', deep: '#C4413F', pale: '#FDECEC' },
        violet: { DEFAULT: '#8B7CF6', deep: '#6D5AE0', pale: '#EFECFE' },

        /** Neutrals. `txt` is body copy; `line` is every hairline. */
        paper: '#FFFFFF',
        mist: '#F4F8FB',
        line: { DEFAULT: '#E3ECF3', dark: 'rgba(148,196,232,.14)' },
        txt: { DEFAULT: '#12293D', 2: '#51677B', 3: '#7E93A6', inv: '#EAF4FC', inv2: '#9FB8CC' },

        /** Reserved status tokens — never brand, never a series. */
        ok: { DEFAULT: '#0A8F7C', pale: '#E5F9F3' },
        warn: { DEFAULT: '#B27A16', pale: '#FEF4E4' },
        danger: { DEFAULT: '#C4413F', pale: '#FDECEC' },

        /**
         * COMPATIBILITY ALIASES — deprecated, do not use in new code.
         *
         * 72 files referenced the previous indigo palette by name. Re-pointing
         * those names at the new palette re-skins the whole app in one change
         * instead of a 72-file find-and-replace, which would have been a large
         * diff with no behavioural test to catch a missed one.
         *
         * Migrate call sites to the semantic names above opportunistically, then
         * delete this block. `brand` is now teal, NOT indigo.
         */
        brand: {
          DEFAULT: '#0A8F7C', // was indigo #4F46E5 — now teal-deep, readable on white
          light: '#0FBFA4',
          pale: '#E5F9F3',
          mid: '#9FE3D6',
          deep: '#06121F',
        },
        accent: { DEFAULT: '#41B7F0', dark: '#0FA3C4', pale: '#DBF1FB' },
        surface: '#F4F8FB',
        slate2: '#51677B',
        muted: '#7E93A6',
      },

      /**
       * Three roles, wired to next/font CSS variables in [locale]/layout.tsx.
       * Space Grotesk carries headings and figures; Inter carries body; JetBrains
       * Mono carries every identifier and number in a column.
       *
       * The CJK faces after each are load-bearing — none of these three has
       * Chinese glyphs, so 简体中文 must fall through to the platform CJK font
       * rather than rendering tofu boxes.
       */
      fontFamily: {
        display: ['var(--font-display)', 'PingFang SC', 'Microsoft YaHei', 'Noto Sans SC', 'system-ui', 'sans-serif'],
        sans: ['var(--font-sans)', '-apple-system', 'Segoe UI', 'PingFang SC', 'Microsoft YaHei', 'Noto Sans SC', 'system-ui', 'sans-serif'],
        mono: ['var(--font-mono)', 'ui-monospace', 'SFMono-Regular', 'Consolas', 'monospace'],
      },

      borderRadius: {
        card: '18px',
        panel: '16px',
        control: '12px',
        pill: '99px',
      },
      boxShadow: {
        sm: '0 6px 24px -10px rgba(6,25,43,.16)',
        card: '0 6px 24px -10px rgba(6,25,43,.16)',
        lg: '0 24px 60px -24px rgba(6,25,43,.28)',
        glow: '0 10px 30px -8px rgba(20,224,184,.32)',
        'glow-cyan': '0 10px 30px -8px rgba(65,183,240,.25)',
      },
      backgroundImage: {
        'brand-gradient': 'linear-gradient(135deg,#12D6B4,#0FA3C4)',
        'ink-fade': 'linear-gradient(180deg,#06121F,#0B1D30)',
      },
      keyframes: {
        drift: { from: { transform: 'translate(0,0) scale(1)' }, to: { transform: 'translate(40px,30px) scale(1.08)' } },
        float: { '0%,100%': { transform: 'translateY(0)' }, '50%': { transform: 'translateY(-12px)' } },
        pulseRing: { '70%': { boxShadow: '0 0 0 9px rgba(15,191,164,0)' }, '100%': { boxShadow: '0 0 0 0 rgba(15,191,164,0)' } },
      },
      animation: {
        drift: 'drift 14s ease-in-out infinite alternate',
        float: 'float 7s ease-in-out infinite',
        'pulse-ring': 'pulseRing 2s infinite',
      },
    },
  },
  plugins: [],
};

export default config;
