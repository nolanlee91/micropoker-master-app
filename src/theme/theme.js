export const theme = {
  colors: {
    // Surfaces — tonal depth, no border lines
    surface:              '#131313',
    surfaceContainerLow:  '#1a1a1a',
    surfaceContainer:     '#212121',
    surfaceContainerHigh: '#2a2a2a',
    surfaceContainerHighest: '#353535',
    surfaceBright:        '#3e3e3e',

    // Brand
    primary:          '#54e98a',
    primaryContainer: '#1a4d32',
    onPrimary:        '#061a0e',

    secondary:          '#92ccff',
    secondaryContainer: '#1a3350',
    onSecondary:        '#071525',

    tertiary:          '#ffc0ac',
    tertiaryContainer: '#4d2a1f',

    // Text
    onSurface:        '#f0f0f0',
    onSurfaceVariant: '#8a8a8a',
    outline:          'rgba(255,255,255,0.08)',
  },

  typography: {
    fontFamily: "'Inter', sans-serif",

    display: {
      fontSize: '2.8rem',
      fontWeight: 700,
      letterSpacing: '-0.03em',
      lineHeight: 1.05,
    },
    headline: {
      fontSize: '1.2rem',
      fontWeight: 600,
      letterSpacing: '-0.01em',
    },
    title: {
      fontSize: '1rem',
      fontWeight: 500,
    },
    body: {
      fontSize: '0.875rem',
      fontWeight: 400,
      lineHeight: 1.65,
    },
    // ALL CAPS label — watch-face style
    label: {
      fontSize: '0.65rem',
      fontWeight: 600,
      letterSpacing: '0.1em',
      textTransform: 'uppercase',
    },
    labelSm: {
      fontSize: '0.58rem',
      fontWeight: 500,
      letterSpacing: '0.1em',
      textTransform: 'uppercase',
    },
  },

  gradients: {
    // 135° chip-like gradients
    primary:  'linear-gradient(135deg, #67f09a 0%, #54e98a 40%, #2db866 100%)',
    secondary:'linear-gradient(135deg, #aadaff 0%, #92ccff 40%, #5aabf5 100%)',
    primarySubtle:   'linear-gradient(135deg, rgba(84,233,138,0.14) 0%, rgba(84,233,138,0.04) 100%)',
    secondarySubtle: 'linear-gradient(135deg, rgba(146,204,255,0.13) 0%, rgba(146,204,255,0.04) 100%)',
    tertiarySubtle:  'linear-gradient(135deg, rgba(255,192,172,0.13) 0%, rgba(255,192,172,0.04) 100%)',
    // Ambient background glow behind cards
    tableGlow: 'radial-gradient(ellipse 80% 50% at 50% 110%, rgba(84,233,138,0.07) 0%, transparent 70%)',
  },

  // Glassmorphism — HUD panels that bleed table green through
  glass: {
    background:     'rgba(26, 26, 26, 0.55)',
    backdropFilter: 'blur(16px) saturate(180%)',
    border:         '1px solid rgba(255,255,255,0.07)',
    borderHighlight:'1px solid rgba(84,233,138,0.18)',
  },

  // Metric card glass — lighter, more translucent
  glassCard: {
    background:     'rgba(30, 30, 30, 0.5)',
    backdropFilter: 'blur(20px) saturate(160%)',
    border:         '1px solid rgba(255,255,255,0.06)',
  },

  // Shadows & glows — no classic drop-shadow, use colored ambience
  shadows: {
    // Chip inner-glow for primary buttons
    primaryButton: 'inset 0 1px 0 rgba(255,255,255,0.18), inset 0 -1px 0 rgba(0,0,0,0.3), 0 0 20px rgba(84,233,138,0.25), 0 4px 12px rgba(0,0,0,0.4)',
    primaryButtonHover: 'inset 0 1px 0 rgba(255,255,255,0.22), inset 0 -1px 0 rgba(0,0,0,0.3), 0 0 28px rgba(84,233,138,0.38), 0 6px 16px rgba(0,0,0,0.45)',
    // Secondary blue glow
    secondaryButton: 'inset 0 1px 0 rgba(255,255,255,0.15), 0 0 16px rgba(146,204,255,0.2)',
    // Modal ambient — blue tinted
    modal: '0 0 60px rgba(146,204,255,0.06), 0 24px 48px rgba(0,0,0,0.6)',
    // Metric card ambient glow
    metricCard: '0 0 0 1px rgba(255,255,255,0.04), 0 2px 8px rgba(0,0,0,0.3)',
    metricCardProfit: '0 0 0 1px rgba(84,233,138,0.1), 0 0 20px rgba(84,233,138,0.08), 0 2px 8px rgba(0,0,0,0.3)',
    // Selected card slot
    cardSelected: '0 0 12px rgba(84,233,138,0.35)',
  },

  radius: {
    xs: '0.125rem',
    sm: '0.25rem',
    md: '0.375rem',
    lg: '0.5rem',
    xl: '0.75rem',
  },

  spacing: {
    xs: '4px',
    sm: '8px',
    md: '16px',
    lg: '24px',
    xl: '32px',
    xxl: '48px',
  },
}

export default theme
