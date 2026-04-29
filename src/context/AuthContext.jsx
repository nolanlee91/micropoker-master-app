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

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      if (session) checkMigration()
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_, session) => {
      setSession(session)
      if (session) checkMigration()
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
          actions:       h.street     || 'Preflop',
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

  async function signOut() {
    localStorage.removeItem('aicoach-messages')
    await supabase.auth.signOut()
  }

  return (
    <AuthContext.Provider value={{
      session,
      showMigrate,
      migrateData,
      skipMigration,
      signInWithGoogle,
      signInWithEmail,
      signOut,
    }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
