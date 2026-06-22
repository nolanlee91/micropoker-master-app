import React, { useState } from 'react'
import { Mail, Lock, Eye, EyeOff } from 'lucide-react'
import { theme } from '../theme/theme'
import { useAuth } from '../context/AuthContext'

// Email + password only — no third-party OAuth (Google's consent screen showed the
// raw supabase.co project domain, which non-technical users read as a scam) and no
// magic link (it sends an email on EVERY sign-in → hits the auth rate limit at scale).
// Password sign-IN sends no email, so logins scale freely; mail is sent only on
// account creation (once) and password reset.
export default function LoginScreen({ onClose }) {
  const { signUpWithPassword, signInWithPassword, resetPassword, continueAsGuest } = useAuth()
  const [mode, setMode] = useState('signin')   // 'signin' | 'signup' | 'forgot'
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [guestBusy, setGuestBusy] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [notice, setNotice] = useState('')      // success message (check inbox)
  const [error, setError] = useState('')

  function switchMode(next) {
    setMode(next); setError(''); setNotice('')
  }

  // "Continue as guest" — keep the user in the app with no login wall.
  // Overlay mode (came from the app): just dismiss, preserving the live guest session.
  // Login gate (after sign-out / failed anon): start a fresh guest session.
  async function handleGuest() {
    if (guestBusy) return
    if (onClose) { onClose(); return }
    setGuestBusy(true)
    const { error } = await continueAsGuest()
    if (error) {
      setGuestBusy(false)
      setError(error.message || 'Could not continue as guest. Please try again.')
    }
    // success → auth state updates → this screen unmounts into the app
  }

  async function handleSubmit(e) {
    e.preventDefault()
    const mail = email.trim()
    if (!mail) return
    setLoading(true); setError(''); setNotice('')

    if (mode === 'forgot') {
      const { error } = await resetPassword(mail)
      setLoading(false)
      if (error) setError(error.message)
      else setNotice(`Password reset link sent to ${mail}. Check your inbox.`)
      return
    }

    if (!password) { setLoading(false); setError('Please enter a password.'); return }
    if (mode === 'signup' && password.length < 6) {
      setLoading(false); setError('Password must be at least 6 characters.'); return
    }

    if (mode === 'signup') {
      const { error } = await signUpWithPassword(mail, password)
      setLoading(false)
      if (error) {
        // Returning user who hit "Create account" by mistake.
        if (/already|registered|exists/i.test(error.message)) {
          setError('This email already has an account. Switch to Sign in.')
        } else setError(error.message)
      } else {
        setNotice(`Check your inbox — we sent a confirmation link to ${mail}. Click it to activate your account and sign in. Your current data will be there.`)
      }
    } else {
      const { error } = await signInWithPassword(mail, password)
      setLoading(false)
      if (error) {
        if (/confirm/i.test(error.message)) setError('Please confirm your email first — check your inbox.')
        else setError('Wrong email or password.')
      } else if (onClose) {
        onClose()   // signed in from the in-app overlay → return to the app
      }
      // else: auth state updates → this screen unmounts into the app
    }
  }

  const title = mode === 'signup' ? 'Create your account'
              : mode === 'forgot' ? 'Reset your password'
              : 'Sign in'
  const cta = mode === 'signup' ? 'Create account'
            : mode === 'forgot' ? 'Send reset link'
            : 'Sign in'

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
        {/* Continue as guest — escape hatch, keeps the user in the app without an account */}
        <button
          onClick={handleGuest}
          disabled={guestBusy}
          style={{
            alignSelf: 'flex-start', background: 'none', border: 'none',
            color: theme.colors.onSurfaceVariant, cursor: guestBusy ? 'wait' : 'pointer',
            fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '6px', padding: 0,
            opacity: guestBusy ? 0.6 : 1,
          }}
        >
          {guestBusy ? 'Connecting…' : 'Continue as guest'}
        </button>

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
          }}>{title}</p>
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
          {notice ? (
            <div style={{ textAlign: 'center', padding: '8px 0' }}>
              <div style={{ fontSize: '1.6rem', marginBottom: '10px' }}>📬</div>
              <p style={{ ...theme.typography.body, color: theme.colors.onSurface, margin: 0, fontSize: '0.85rem', lineHeight: 1.5 }}>
                {notice}
              </p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <Field icon={<Mail size={16} />}>
                <input
                  type="email"
                  placeholder="your@email.com"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  autoComplete="email"
                  required
                  style={inputStyle}
                  onFocus={e => e.target.style.borderColor = 'rgba(84,233,138,0.4)'}
                  onBlur={e => e.target.style.borderColor = 'rgba(255,255,255,0.08)'}
                />
              </Field>

              {mode !== 'forgot' && (
                <Field
                  icon={<Lock size={16} />}
                  trailing={
                    <button
                      type="button"
                      onClick={() => setShowPassword(s => !s)}
                      aria-label={showPassword ? 'Hide password' : 'Show password'}
                      style={{ background: 'none', border: 'none', padding: '4px', cursor: 'pointer', color: theme.colors.onSurfaceVariant, display: 'flex' }}
                    >
                      {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  }
                >
                  <input
                    type={showPassword ? 'text' : 'password'}
                    placeholder={mode === 'signup' ? 'Create a password (min 6)' : 'Password'}
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
                    required
                    style={passwordInputStyle}
                    onFocus={e => e.target.style.borderColor = 'rgba(84,233,138,0.4)'}
                    onBlur={e => e.target.style.borderColor = 'rgba(255,255,255,0.08)'}
                  />
                </Field>
              )}

              {mode === 'signin' && (
                <button type="button" onClick={() => switchMode('forgot')} style={linkBtnStyle('right')}>
                  Forgot password?
                </button>
              )}

              {error && (
                <p style={{ ...theme.typography.body, color: theme.colors.tertiary, margin: 0, fontSize: '0.8rem' }}>
                  {error}
                </p>
              )}

              <button
                type="submit"
                disabled={loading}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
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
                {loading ? 'Please wait…' : cta}
              </button>
            </form>
          )}

          {/* Mode switches */}
          {!notice && mode === 'signin' && (
            <p style={switchTextStyle}>
              New here?{' '}
              <button type="button" onClick={() => switchMode('signup')} style={linkBtnStyle()}>Create an account</button>
            </p>
          )}
          {!notice && mode === 'signup' && (
            <p style={switchTextStyle}>
              Already have an account?{' '}
              <button type="button" onClick={() => switchMode('signin')} style={linkBtnStyle()}>Sign in</button>
            </p>
          )}
          {(notice || mode === 'forgot') && (
            <p style={switchTextStyle}>
              <button type="button" onClick={() => switchMode('signin')} style={linkBtnStyle()}>← Back to sign in</button>
            </p>
          )}
        </div>

        {/* Footer: educational disclaimer + legal links */}
        <div style={{ textAlign: 'center' }}>
          <p style={{
            ...theme.typography.body,
            color: theme.colors.onSurfaceVariant,
            fontSize: '0.7rem',
            lineHeight: 1.5,
            margin: '0 0 8px',
          }}>
            An educational poker training &amp; tracking tool — no real-money gambling.
          </p>
          <div style={{ display: 'flex', justifyContent: 'center', gap: '14px' }}>
            <a href="/privacy" style={{ color: theme.colors.onSurfaceVariant, fontSize: '0.7rem', textDecoration: 'none' }}>Privacy</a>
            <a href="/support" style={{ color: theme.colors.onSurfaceVariant, fontSize: '0.7rem', textDecoration: 'none' }}>Support</a>
          </div>
        </div>
      </div>
    </div>
  )
}

// Input wrapper with a leading icon and an optional trailing element (e.g. show/hide).
function Field({ icon, trailing, children }) {
  return (
    <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
      <span style={{ position: 'absolute', left: '12px', color: theme.colors.onSurfaceVariant, display: 'flex', pointerEvents: 'none' }}>
        {icon}
      </span>
      {children}
      {trailing && (
        <span style={{ position: 'absolute', right: '8px', display: 'flex' }}>{trailing}</span>
      )}
    </div>
  )
}

const inputStyle = {
  width: '100%',
  padding: '11px 14px 11px 38px',
  background: theme.colors.surfaceContainerHigh,
  color: theme.colors.onSurface,
  border: '1px solid rgba(255,255,255,0.08)',
  borderRadius: theme.radius.lg,
  fontSize: '0.9rem',
  fontFamily: theme.typography.fontFamily,
  outline: 'none',
  boxSizing: 'border-box',
  transition: 'border-color 0.15s',
}

// Password variant — extra right padding so text doesn't run under the eye toggle.
const passwordInputStyle = { ...inputStyle, padding: '11px 40px 11px 38px' }

const switchTextStyle = {
  ...theme.typography.body,
  color: theme.colors.onSurfaceVariant,
  fontSize: '0.8rem',
  textAlign: 'center',
  margin: 0,
}

function linkBtnStyle(align) {
  return {
    background: 'none', border: 'none', padding: 0,
    color: theme.colors.primary, cursor: 'pointer',
    fontSize: '0.8rem', fontFamily: theme.typography.fontFamily, fontWeight: 600,
    ...(align === 'right' ? { alignSelf: 'flex-end' } : {}),
  }
}
