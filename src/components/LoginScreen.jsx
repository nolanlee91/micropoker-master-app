import React, { useState } from 'react'
import { Mail } from 'lucide-react'
import { theme } from '../theme/theme'
import { useAuth } from '../context/AuthContext'

export default function LoginScreen() {
  const { signInWithGoogle, signInWithEmail } = useAuth()
  const [email, setEmail] = useState('')
  const [emailSent, setEmailSent] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleEmailSubmit(e) {
    e.preventDefault()
    if (!email.trim()) return
    setLoading(true)
    setError('')
    const { error } = await signInWithEmail(email.trim())
    setLoading(false)
    if (error) {
      setError(error.message)
    } else {
      setEmailSent(true)
    }
  }

  return (
    <div style={{
      minHeight: '100dvh',
      background: theme.colors.surface,
      backgroundImage: theme.gradients.tableGlow,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: theme.spacing.lg,
      fontFamily: theme.typography.fontFamily,
    }}>
      <div style={{
        width: '100%',
        maxWidth: '380px',
        display: 'flex',
        flexDirection: 'column',
        gap: theme.spacing.xl,
      }}>
        {/* Branding */}
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '2.2rem', marginBottom: '6px' }}>♠</div>
          <h1 style={{
            ...theme.typography.headline,
            color: theme.colors.onSurface,
            margin: 0,
            fontSize: '1.4rem',
          }}>MicroPoker Master</h1>
          <p style={{
            ...theme.typography.body,
            color: theme.colors.onSurfaceVariant,
            margin: '6px 0 0',
          }}>Precision Toolkit</p>
        </div>

        {/* Login card */}
        <div style={{
          background: theme.glass.background,
          backdropFilter: theme.glass.backdropFilter,
          border: theme.glass.border,
          borderRadius: theme.radius.xl,
          padding: theme.spacing.xl,
          display: 'flex',
          flexDirection: 'column',
          gap: theme.spacing.md,
        }}>
          {/* Google */}
          <button
            onClick={signInWithGoogle}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '10px',
              width: '100%',
              padding: '12px',
              background: '#fff',
              color: '#1f1f1f',
              border: 'none',
              borderRadius: theme.radius.lg,
              fontSize: '0.9rem',
              fontWeight: 500,
              fontFamily: theme.typography.fontFamily,
              cursor: 'pointer',
              transition: 'opacity 0.15s',
            }}
            onMouseOver={e => e.currentTarget.style.opacity = '0.88'}
            onMouseOut={e => e.currentTarget.style.opacity = '1'}
          >
            <GoogleIcon />
            Continue with Google
          </button>

          {/* Divider */}
          <div style={{ display: 'flex', alignItems: 'center', gap: theme.spacing.sm }}>
            <div style={{ flex: 1, height: '1px', background: 'rgba(255,255,255,0.08)' }} />
            <span style={{ ...theme.typography.label, color: theme.colors.onSurfaceVariant }}>or</span>
            <div style={{ flex: 1, height: '1px', background: 'rgba(255,255,255,0.08)' }} />
          </div>

          {/* Email magic link */}
          {emailSent ? (
            <div style={{ textAlign: 'center', padding: '8px 0' }}>
              <div style={{ fontSize: '1.6rem', marginBottom: '10px' }}>📬</div>
              <p style={{ ...theme.typography.body, color: theme.colors.onSurface, margin: '0 0 4px' }}>
                Check your inbox
              </p>
              <p style={{
                ...theme.typography.body,
                color: theme.colors.onSurfaceVariant,
                margin: 0,
                fontSize: '0.8rem',
              }}>
                Magic link sent to <strong style={{ color: theme.colors.primary }}>{email}</strong>
              </p>
            </div>
          ) : (
            <form onSubmit={handleEmailSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <input
                type="email"
                placeholder="your@email.com"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
                style={{
                  width: '100%',
                  padding: '11px 14px',
                  background: theme.colors.surfaceContainerHigh,
                  color: theme.colors.onSurface,
                  border: '1px solid rgba(255,255,255,0.08)',
                  borderRadius: theme.radius.lg,
                  fontSize: '0.9rem',
                  fontFamily: theme.typography.fontFamily,
                  outline: 'none',
                  boxSizing: 'border-box',
                  transition: 'border-color 0.15s',
                }}
                onFocus={e => e.target.style.borderColor = 'rgba(84,233,138,0.4)'}
                onBlur={e => e.target.style.borderColor = 'rgba(255,255,255,0.08)'}
              />
              {error && (
                <p style={{
                  ...theme.typography.body,
                  color: theme.colors.tertiary,
                  margin: 0,
                  fontSize: '0.8rem',
                }}>{error}</p>
              )}
              <button
                type="submit"
                disabled={loading}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                  width: '100%',
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
                <Mail size={16} />
                {loading ? 'Sending…' : 'Continue with Email'}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  )
}

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
    </svg>
  )
}
