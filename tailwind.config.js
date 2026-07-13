/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: ["class"],
  content: ["./index.html", "./src/**/*.{ts,tsx,js,jsx}"],
  theme: {
    extend: {
      colors: {
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        card: {
          DEFAULT: 'hsl(var(--card))',
          foreground: 'hsl(var(--card-foreground))'
        },
        popover: {
          DEFAULT: 'hsl(var(--popover))',
          foreground: 'hsl(var(--popover-foreground))'
        },
        primary: {
          DEFAULT: 'hsl(var(--primary))',
          foreground: 'hsl(var(--primary-foreground))'
        },
        secondary: {
          DEFAULT: 'hsl(var(--secondary))',
          foreground: 'hsl(var(--secondary-foreground))'
        },
        muted: {
          DEFAULT: 'hsl(var(--muted))',
          foreground: 'hsl(var(--muted-foreground))'
        },
        accent: {
          DEFAULT: 'hsl(var(--accent))',
          foreground: 'hsl(var(--accent-foreground))'
        },
        destructive: {
          DEFAULT: 'hsl(var(--destructive))',
          foreground: 'hsl(var(--destructive-foreground))'
        },
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
        chart: {
          '1': 'hsl(var(--chart-1))',
          '2': 'hsl(var(--chart-2))',
          '3': 'hsl(var(--chart-3))',
          '4': 'hsl(var(--chart-4))',
          '5': 'hsl(var(--chart-5))'
        },
        sidebar: {
          DEFAULT: 'hsl(var(--sidebar-background))',
          foreground: 'hsl(var(--sidebar-foreground))',
          primary: 'hsl(var(--sidebar-primary))',
          'primary-foreground': 'hsl(var(--sidebar-primary-foreground))',
          accent: 'hsl(var(--sidebar-accent))',
          'accent-foreground': 'hsl(var(--sidebar-accent-foreground))',
          border: 'hsl(var(--sidebar-border))',
          ring: 'hsl(var(--sidebar-ring))'
        },
        pane: 'hsl(var(--pane))',
        'pane-amber': 'hsl(var(--pane-amber))',
        'amber-dash': 'hsl(var(--amber-dashboard))',
        // Brand gold — retint Tailwind's amber scale to the Cliqbux dashboard
        // accent (#F0AD4E) so every existing amber-* class lands on-brand.
        amber: {
          300: '#FFD189',
          400: '#F6B453',
          500: '#F0AD4E',
          600: '#DB8F28',
        },
        // ── Design tokens (src/styles/tokens.css) — semantic cb-* utilities.
        // Defined but not yet applied; approved token values live in the CSS
        // file, never here. Usage: bg-cb-surface, border-cb-border, text-cb-accent.
        'cb-bg': 'var(--cb-bg)',
        'cb-surface': {
          DEFAULT: 'var(--cb-surface)',
          raised: 'var(--cb-surface-raised)',
        },
        'cb-border': {
          DEFAULT: 'var(--cb-border)',
          strong: 'var(--cb-border-strong)',
        },
        'cb-accent': {
          DEFAULT: 'var(--cb-accent)',
          muted: 'var(--cb-accent-muted)',
        },
        'cb-success': 'var(--cb-success)',
        'cb-danger': 'var(--cb-danger)',
      },
      fontFamily: {
        heading: ['var(--font-heading)'],
        body: ['var(--font-body)'],
        display: ['var(--font-display)'],
        mono: ['var(--font-mono)']
      },
      // ── Token type scale — the portal's only five sizes (see tokens.css table)
      fontSize: {
        'cb-caption': ['12px', { lineHeight: '16px', letterSpacing: '0.04em', fontWeight: '600' }],
        'cb-body': ['14px', { lineHeight: '20px', letterSpacing: '0', fontWeight: '400' }],
        'cb-body-lg': ['16px', { lineHeight: '24px', letterSpacing: '-0.006em', fontWeight: '400' }],
        'cb-title': ['20px', { lineHeight: '28px', letterSpacing: '-0.015em', fontWeight: '600' }],
        'cb-display': ['28px', { lineHeight: '34px', letterSpacing: '-0.025em', fontWeight: '600' }],
      },
      // ── Token elevation — exactly two levels (cards vs overlays)
      boxShadow: {
        'cb-raised': 'var(--cb-shadow-raised)',
        'cb-overlay': 'var(--cb-shadow-overlay)',
      },
      // ── Token radius — the one radius (rounded-cb); pills use rounded-full
      borderRadius: {
        cb: 'var(--cb-radius)',
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)'
      },
      keyframes: {
        'accordion-down': {
          from: { height: '0' },
          to: { height: 'var(--radix-accordion-content-height)' }
        },
        'accordion-up': {
          from: { height: 'var(--radix-accordion-content-height)' },
          to: { height: '0' }
        }
      },
      animation: {
        'accordion-down': 'accordion-down 0.2s ease-out',
        'accordion-up': 'accordion-up 0.2s ease-out'
      }
    },
  },
  plugins: [require("tailwindcss-animate")],
}
