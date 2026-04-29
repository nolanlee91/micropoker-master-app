import React, { useState } from 'react'
import { theme } from '../theme/theme'
import { useAuth } from '../context/AuthContext'

export default function MigratePrompt() {
  const { migrateData, skipMigration } = useAuth()
  const [loading, setLoading] = useState(false)

  async function handleMigrate() {
    setLoading(true)
    await migrateData()
  }

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      background: 'rgba(0,0,0,0.72)',
      backdropFilter: 'blur(8px)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: theme.spacing.lg,
      zIndex: 1000,
      fontFamily: theme.typography.fontFamily,
    }}>
      <div style={{
        width: '100%',
        maxWidth: '360px',
        background: theme.colors.surfaceContainer,
        border: theme.glass.borderHighlight,
        borderRadius: theme.radius.xl,
        padding: theme.spacing.xl,
        boxShadow: theme.shadows.modal,
        display: 'flex',
        flexDirection: 'column',
        gap: theme.spacing.md,
      }}>
        <div>
          <h2 style={{
            ...theme.typography.headline,
            color: theme.colors.onSurface,
            margin: '0 0 8px',
          }}>
            Save your existing data?
          </h2>
          <p style={{
            ...theme.typography.body,
            color: theme.colors.onSurfaceVariant,
            margin: 0,
          }}>
            We found hand history, sessions and other data on this device.
            Save it to your account so it&apos;s backed up and accessible from anywhere.
          </p>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <button
            onClick={handleMigrate}
            disabled={loading}
            style={{
              padding: '12px',
              background: loading ? theme.colors.primaryContainer : theme.gradients.primary,
              color: loading ? theme.colors.onSurfaceVariant : theme.colors.onPrimary,
              border: 'none',
              borderRadius: theme.radius.lg,
              fontSize: '0.9rem',
              fontWeight: 600,
              fontFamily: theme.typography.fontFamily,
              cursor: loading ? 'not-allowed' : 'pointer',
              boxShadow: loading ? 'none' : theme.shadows.primaryButton,
              transition: 'all 0.15s',
            }}
          >
            {loading ? 'Saving…' : 'Yes, save to my account'}
          </button>
          <button
            onClick={skipMigration}
            disabled={loading}
            style={{
              padding: '12px',
              background: 'transparent',
              color: theme.colors.onSurfaceVariant,
              border: '1px solid rgba(255,255,255,0.08)',
              borderRadius: theme.radius.lg,
              fontSize: '0.9rem',
              fontFamily: theme.typography.fontFamily,
              cursor: loading ? 'not-allowed' : 'pointer',
              transition: 'color 0.15s',
            }}
            onMouseOver={e => { if (!loading) e.currentTarget.style.color = theme.colors.onSurface }}
            onMouseOut={e => e.currentTarget.style.color = theme.colors.onSurfaceVariant}
          >
            Skip, keep data local only
          </button>
        </div>
      </div>
    </div>
  )
}
