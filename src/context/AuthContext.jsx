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
    const data = {}
    MIGRATE_KEYS.forEach(key => {
      const raw = localStorage.getItem(key)
      if (!raw) return
      try { data[key] = JSON.parse(raw) } catch {}
    })

    try {
      const { data: { user } } = await supabase.auth.getUser()
      const { error } = await supabase.from('user_data').upsert({
        user_id: user.id,
        data,
        updated_at: new Date().toISOString(),
      })
      if (error) throw error
    } catch (err) {
      console.error('Migration failed:', err)
    }

    localStorage.setItem(MIGRATION_FLAG, 'done')
    setShowMigrate(false)
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
