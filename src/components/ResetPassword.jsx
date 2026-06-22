import React, { useState } from 'react'
import { Lock } from 'lucide-react'
import { theme } from '../theme/theme'
import { useAuth } from '../context/AuthContext'

// Shown when the user arrives via the password-reset email link (AuthContext catches
// the PASSWORD_RECOVERY event and flips showRecovery). They set a new password, which
// dismisses this screen back into the app.
export default function ResetPassword() {
  const { updatePassword } = useAuth()
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e) {
    e.preventDefault()
    if (password.length < 6) { setError('Password must be at least 6 characters.'); return }
    setLoading(true); setError('')
    const { error } = await updatePassword(password)
    setLoading(false)
    if (error) setError(error.message)
    // success → updatePassword clears showRecovery → app renders
  }

  return (
    <div style={{
      minHeight: '100dvh',
      background: theme.colors.surface,
      backgroundImage: theme.gradients.tableGlow,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: theme.spacing.lg, fontFamily: theme.typography.fontFamily,
    }}>
      <div style={{ width: '100%', maxWidth: '380px', display: 'flex', flexDirection: 'column', gap: theme.spacing.xl }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '2.2rem', marginBottom: '6px' }}>♠</div>
          <h1 style={{ ...theme.typography.headline, color: theme.colors.onSurface, margin: 0, fontSize: '1.4rem' }}>
            Set a new password
          </h1>
        </div>

        <form onSubmit={handleSubmit} style={{
          background: theme.glass.background,
          backdropFilter: theme.glass.backdropFilter,
          border: theme.glass.border,
          borderRadius: theme.radius.xl,
          padding: theme.spacing.xl,
          display: 'flex', flexDirection: 'column', gap: '12px',
        }}>
          <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
            <span style={{ position: 'absolute', left: '12px', color: theme.colors.onSurfaceVariant, display: 'flex', pointerEvents: 'none' }}>
              <Lock size={16} />
            </span>
            <input
              type="password"
              placeholder="New password (min 6)"
              value={password}
              onChange={e => setPassword(e.target.value)}
              autoComplete="new-password"
              required
              style={{
                width: '100%', padding: '11px 14px 11px 38px',
                background: theme.colors.surfaceContainerHigh, color: theme.colors.onSurface,
                border: '1px solid rgba(255,255,255,0.08)', borderRadius: theme.radius.lg,
                fontSize: '0.9rem', fontFamily: theme.typography.fontFamily,
                outline: 'none', boxSizing: 'border-box', transition: 'border-color 0.15s',
              }}
              onFocus={e => e.target.style.borderColor = 'rgba(84,233,138,0.4)'}
              onBlur={e => e.target.style.borderColor = 'rgba(255,255,255,0.08)'}
            />
          </div>

          {error && (
            <p style={{ ...theme.typography.body, color: theme.colors.tertiary, margin: 0, fontSize: '0.8rem' }}>{error}</p>
          )}

          <button
            type="submit"
            disabled={loading}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              width: '100%', padding: '12px',
              background: loading ? theme.colors.primaryContainer : theme.gradients.primary,
              color: loading ? theme.colors.onSurfaceVariant : theme.colors.onPrimary,
              border: 'none', borderRadius: theme.radius.lg,
              fontSize: '0.9rem', fontWeight: 600, fontFamily: theme.typography.fontFamily,
              cursor: loading ? 'not-allowed' : 'pointer',
              boxShadow: loading ? 'none' : theme.shadows.primaryButton,
              transition: 'all 0.15s',
            }}
          >
            {loading ? 'Saving…' : 'Update password'}
          </button>
        </form>
      </div>
    </div>
  )
}
