import React, { createContext, useContext, useEffect, useRef, useState } from 'react'
import { createClient } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'
import { captureAttribution, trackAttribution } from '../lib/attribution'

const AuthContext = createContext(null)

const MIGRATE_KEYS = [
  'hand-history', 'brm-sessions', 'brm-bankroll',
  'brm-stakes', 'brm-style', 'aicoach-messages',
  'aicoach-ctx', 'quiz-daily-v2',
]
const MIGRATION_FLAG = 'supabase-migration-v1'

export function AuthProvider({ children }) {
  const [session, setSession] = useState(undefined) // undefined = loading
  const [showMigrate, setShowMigrate] = useState(false)
  const [showLogin, setShowLogin] = useState(false) // on-demand login overlay (header "Sign in")
  const [showRecovery, setShowRecovery] = useState(false) // password-reset screen (from email link)
  const stamped = useRef(false) // one marketing-attribution stamp per app load

  useEffect(() => {
    // Capture marketing attribution (utm_*/referrer forwarded from the landing) as
    // early as possible, then stamp it once we have a session (anon or real).
    captureAttribution()
    const stampOnce = (s) => {
      if (!s?.access_token || stamped.current) return
      stamped.current = true
      trackAttribution({ token: s.access_token, mode: 'stamp' })
    }

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        setSession(session)
        stampOnce(session)
        // Migration prompt only matters for real accounts, not the silent anon user.
        if (!session.user?.is_anonymous) checkMigration()
      } else {
        // No session → sign in anonymously so the app works with NO login wall.
        // Identity exists from second 1 (powers the leak profile); the user can
        // upgrade to a real account later to keep it. See PROJECT/v1-60s-flow.md.
        // onAuthStateChange fires with the new anon session on success.
        supabase.auth.signInAnonymously().then(({ error }) => {
          if (error) {
            // Anonymous sign-ins must be enabled in the Supabase dashboard
            // (Authentication → Providers → Anonymous). Fall back to login wall.
            console.error('Anonymous sign-in failed:', error.message)
            setSession(null)
          }
        })
      }
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      // Clicking the password-reset link signs the user in with a recovery token and
      // fires this event — show the "set a new password" screen.
      if (event === 'PASSWORD_RECOVERY') setShowRecovery(true)
      setSession(session)
      if (session) stampOnce(session)
      if (session && !session.user?.is_anonymous) checkMigration()
    })

    return () => subscription.unsubscribe()
  }, [])

  function checkMigration() {
    if (localStorage.getItem(MIGRATION_FLAG)) return
    const hasData = MIGRATE_KEYS.some(key => {
      const raw = localStorage.getItem(key)
      if (!raw) return false
      try {
        const val = JSON.parse(raw)
        if (Array.isArray(val)) return val.length > 0
        if (val && typeof val === 'object') return Object.keys(val).length > 0
        return val !== null && val !== undefined
      } catch {
        return false
      }
    })
    if (hasData) {
      setShowMigrate(true)
    } else {
      localStorage.setItem(MIGRATION_FLAG, 'done')
    }
  }

  async function migrateData() {
    try {
      const { data: { user } } = await supabase.auth.getUser()

      const rawSessions = JSON.parse(localStorage.getItem('brm-sessions') || '[]')
      const rawHands    = JSON.parse(localStorage.getItem('hand-history')  || '[]')

      // Migrate sessions first — build local-id → UUID map for hand FK
      const sessionIdMap = {}
      for (const s of rawSessions) {
        const { data } = await supabase.from('sessions').insert({
          user_id:          user.id,
          date:             s.date             || new Date().toISOString().split('T')[0],
          stake:            s.stakes           || '$1/$2',
          location:         s.location         || 'Live',
          duration_minutes: Math.round((s.hours || 0) * 60),
          buy_in:           s.buyIn            || 0,
          cash_out:         s.cashOut          || 0,
          profit_loss:      s.profit           || 0,
        }).select('id').single()
        if (data) sessionIdMap[s.id] = data.id
      }

      // Migrate hands
      for (const h of rawHands) {
        await supabase.from('hand_history').insert({
          user_id:       user.id,
          session_id:    h.sessionId ? (sessionIdMap[h.sessionId] || null) : null,
          game_type:     'Live Cash',
          position:      h.position  || 'BTN',
          hole_cards:    h.holeCards  || [],
          board:         h.boardCards || [],
          result_amount: h.result     || 0,
          notes:         h.notes      || null,
          street:        h.street     || 'Preflop',
          actions:       h.action     || null,
          created_at:    h.date       || new Date().toISOString(),
        })
      }
    } catch (err) {
      console.error('Migration failed:', err)
    }

    localStorage.setItem(MIGRATION_FLAG, 'done')
    setShowMigrate(false)
    window.location.reload()
  }

  function skipMigration() {
    localStorage.setItem(MIGRATION_FLAG, 'done')
    setShowMigrate(false)
  }

  // Create an account with email + password. Email confirmation is REQUIRED (a typo'd
  // address must not lock the user out of a later, paid account), so we always use
  // signUp: it sends the standard "Confirm signup" email, which works. We deliberately
  // do NOT use updateUser to link the email onto the guest — that triggers an email-CHANGE
  // confirmation which crashes for a guest (empty current email).
  //
  // Best-effort, instead: right after signUp (while the guest token is still valid) we
  // copy the guest's hands/sessions onto the new account so the leak profile carries
  // over. If that fails, the account is still created — we accept losing the (free-tier)
  // guest data over blocking sign-up.
  async function signUpWithPassword(email, password) {
    // Capture the guest identity BEFORE signUp so we can carry its data over.
    const { data: { session: guest } } = await supabase.auth.getSession()
    const guestId    = guest?.user?.is_anonymous ? guest.user.id : null
    const guestToken = guestId ? guest.access_token : null

    // Sign up on an ISOLATED, sessionless client. Calling signUp() on the main client
    // (which holds the anonymous session) makes GoTrue act on the CURRENT anon user
    // instead of creating a fresh one — we want a brand-new account whose id differs
    // from the guest's, so the migrate step below has a distinct source→target. The
    // sessionless client guarantees that, and keeps the guest session alive on the
    // main client (token still valid) so we can copy the guest's data afterward.
    //
    // (History note: the old "Error sending confirmation email" 500 at signup was NOT
    // this — it was MailerSend rejecting the confirmation email. Switching SMTP to
    // Brevo fixed it. This sessionless client is about account identity, not email.)
    const fresh = createClient(
      import.meta.env.VITE_SUPABASE_URL,
      import.meta.env.VITE_SUPABASE_ANON_KEY,
      { auth: { persistSession: false, autoRefreshToken: false } },
    )
    const result = await fresh.auth.signUp({
      email, password,
      options: { emailRedirectTo: window.location.origin },
    })

    // guestDataMigrated: null = there was nothing to migrate (no guest data);
    // true = copied OK; false = there WAS guest data but the copy failed. The caller
    // uses this so it never promises "your data will be there" when it isn't.
    let guestDataMigrated = null
    const newId = result.data?.user?.id
    if (!result.error && guestId && guestToken && newId && newId !== guestId) {
      guestDataMigrated = false
      // Light retry — a transient network blip shouldn't silently lose the leak
      // profile. Still best-effort: the account is created regardless.
      for (let attempt = 0; attempt < 2 && !guestDataMigrated; attempt++) {
        try {
          const r = await fetch('/api/migrate-guest-data', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${guestToken}` },
            body: JSON.stringify({ targetUserId: newId }),
          })
          if (r.ok) guestDataMigrated = true
        } catch { /* retry, then give up — account still created */ }
      }
    }
    // Carry marketing attribution onto the new account (best-effort, not awaited) so
    // the funnel can tie this signup back to the channel that first brought the guest
    // in. Uses the still-valid guest token, like the migrate call above.
    if (!result.error && newId && guestToken && newId !== guestId) {
      trackAttribution({ token: guestToken, mode: 'link', targetUserId: newId })
    }

    return { ...result, guestDataMigrated }
  }

  async function signInWithPassword(email, password) {
    return supabase.auth.signInWithPassword({ email, password })
  }

  // Send a password-reset email. The link returns to the app and fires the
  // PASSWORD_RECOVERY event (handled above) → shows the set-new-password screen.
  async function resetPassword(email) {
    return supabase.auth.resetPasswordForEmail(email, {
      redirectTo: window.location.origin,
    })
  }

  // Re-send the signup confirmation email (e.g. it didn't arrive / went to spam).
  async function resendConfirmation(email) {
    return supabase.auth.resend({
      type: 'signup',
      email,
      options: { emailRedirectTo: window.location.origin },
    })
  }

  // Set a new password during the recovery flow, then dismiss the recovery screen.
  async function updatePassword(password) {
    const res = await supabase.auth.updateUser({ password })
    if (!res.error) setShowRecovery(false)
    return res
  }

  async function signOut() {
    localStorage.removeItem('aicoach-messages')
    await supabase.auth.signOut()
  }

  // Start a fresh guest session — used by "Continue as guest" so signing out doesn't
  // dead-end on a login gate; the app stays usable with no login wall.
  async function continueAsGuest() {
    return supabase.auth.signInAnonymously()
  }

  // Permanently delete the account + all cloud data (App Store requirement).
  // The RPC deletes auth.users → cascades to profiles/sessions/hand_history.
  async function deleteAccount() {
    // Route through the server endpoint so it can cancel any Stripe subscription
    // BEFORE wiping the account — deleting the user directly (old delete_current_user
    // RPC) would leave a live subscription billing the card with no way back in.
    const { data: { session } } = await supabase.auth.getSession()
    const token = session?.access_token
    if (!token) return new Error('Please sign in again, then try deleting your account.')

    try {
      const res = await fetch('/api/delete-account', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) return new Error(data.error || 'Could not delete your account. Please try again.')
    } catch {
      return new Error('Could not reach the server to delete your account. Please try again.')
    }

    MIGRATE_KEYS.forEach(k => localStorage.removeItem(k))
    localStorage.removeItem('aicoach-messages')
    localStorage.removeItem(MIGRATION_FLAG)
    await supabase.auth.signOut()
    return null
  }

  return (
    <AuthContext.Provider value={{
      session,
      // true while the user is on the silent anonymous identity (no real account yet).
      // Used to decide when to surface the "create account to save your profile" prompt.
      isAnonymous: !!session?.user?.is_anonymous,
      showMigrate,
      showLogin,
      setShowLogin,
      showRecovery,
      migrateData,
      skipMigration,
      signUpWithPassword,
      signInWithPassword,
      resetPassword,
      resendConfirmation,
      updatePassword,
      signOut,
      continueAsGuest,
      deleteAccount,
    }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
