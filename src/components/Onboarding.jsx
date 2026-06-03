import React, { useState } from 'react'
import { Spade, BrainCircuit, Wallet, Zap } from 'lucide-react'
import { theme } from '../theme/theme'

// First-run intro. Shown once after login; finishing sets the
// `onboarding-done-v1` flag (handled by the caller in App.jsx).

const SLIDES = [
  {
    icon: Spade,
    title: 'Welcome to MicroPoker Master',
    body: 'Your study companion for micro-stakes cash poker. An educational training & tracking tool — there is no real-money gambling.',
  },
  {
    icon: BrainCircuit,
    title: 'Log hands, get AI coaching',
    body: 'Record the hands you play, then send them to the AI coach to find your biggest leaks and the better line.',
  },
  {
    icon: Wallet,
    title: 'Track your bankroll',
    body: 'Log sessions with buy-in, cash-out and hours. See your profit curve and where you’re leaking money.',
  },
  {
    icon: Zap,
    title: 'Train every day',
    body: 'Daily GTO quizzes, streaks, and an odds calculator to sharpen your decisions away from the table.',
  },
]

export default function Onboarding({ onDone }) {
  const [i, setI] = useState(0)
  const slide = SLIDES[i]
  const Icon = slide.icon
  const last = i === SLIDES.length - 1

  const next = () => (last ? onDone() : setI(i + 1))

  return (
    <div style={{
      minHeight: '100dvh', background: theme.colors.surface,
      backgroundImage: theme.gradients.tableGlow,
      display: 'flex', flexDirection: 'column',
      fontFamily: theme.typography.fontFamily, color: theme.colors.onSurface,
    }}>
      {/* Skip */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', padding: '16px 20px' }}>
        <button onClick={onDone} style={{
          background: 'none', border: 'none', color: theme.colors.onSurfaceVariant,
          fontSize: '0.8rem', fontWeight: 600, cursor: 'pointer',
          fontFamily: theme.typography.fontFamily,
        }}>Skip</button>
      </div>

      {/* Slide */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', padding: '0 28px', gap: '20px' }}>
        <div style={{
          width: '88px', height: '88px', borderRadius: '24px',
          background: theme.gradients.primarySubtle,
          border: theme.glass.borderHighlight,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <Icon size={40} color={theme.colors.primary} />
        </div>
        <h1 style={{ ...theme.typography.display, fontSize: '1.7rem', margin: 0, maxWidth: '340px' }}>{slide.title}</h1>
        <p style={{ ...theme.typography.body, color: theme.colors.onSurfaceVariant, margin: 0, maxWidth: '320px' }}>{slide.body}</p>
      </div>

      {/* Dots + CTA */}
      <div style={{ padding: '0 28px 40px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '22px' }}>
        <div style={{ display: 'flex', gap: '7px' }}>
          {SLIDES.map((_, idx) => (
            <div key={idx} style={{
              width: idx === i ? '20px' : '7px', height: '7px', borderRadius: '4px',
              background: idx === i ? theme.colors.primary : 'rgba(255,255,255,0.18)',
              transition: 'all 0.2s',
            }} />
          ))}
        </div>
        <button onClick={next} style={{
          width: '100%', maxWidth: '380px', padding: '14px',
          background: theme.gradients.primary, color: theme.colors.onPrimary,
          border: 'none', borderRadius: theme.radius.lg,
          fontSize: '0.95rem', fontWeight: 700, cursor: 'pointer',
          fontFamily: theme.typography.fontFamily,
          boxShadow: theme.shadows.primaryButton,
        }}>
          {last ? 'Get started' : 'Next'}
        </button>
      </div>
    </div>
  )
}
