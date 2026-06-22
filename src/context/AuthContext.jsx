import React, { createContext, useContext, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

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

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        setSession(session)
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

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_, session) => {
      setSession(session)
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

  async function signInWithGoogle() {
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.origin },
    })
  }

  async function signInWithEmail(email) {
    return supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: window.location.origin },
    })
  }

  // Convert the current ANONYMOUS user into a real Google account by linking the
  // identity to the SAME user id — so the accumulated leak profile is preserved,
  // not replaced by a fresh account. (Requires "Manual linking" enabled in the
  // Supabase Auth settings.) Used by the "save your Leak Profile" prompt.
  async function linkGoogle() {
    return supabase.auth.linkIdentity({
      provider: 'google',
      options: { redirectTo: window.location.origin },
    })
  }

  async function signOut() {
    localStorage.removeItem('aicoach-messages')
    await supabase.auth.signOut()
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
      migrateData,
      skipMigration,
      signInWithGoogle,
      signInWithEmail,
      linkGoogle,
      signOut,
      deleteAccount,
    }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
