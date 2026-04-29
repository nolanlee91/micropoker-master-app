import React, { createContext, useContext, useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from './AuthContext'
import { rowToHand, handToRow, rowToSession, sessionToRow } from '../lib/db'

const DataContext = createContext(null)

export function DataProvider({ children }) {
  const { session } = useAuth()
  const [hands,    setHands]    = useState([])
  const [sessions, setSessions] = useState([])
  const [loading,  setLoading]  = useState(true)

  const fetchAll = useCallback(async () => {
    if (!session) { setHands([]); setSessions([]); setLoading(false); return }
    setLoading(true)
    const [handsRes, sessionsRes] = await Promise.all([
      supabase.from('hand_history').select('*').order('created_at', { ascending: false }),
      supabase.from('sessions').select('*').order('created_at', { ascending: false }),
    ])

    const rawHands    = handsRes.data    || []
    const rawSessions = sessionsRes.data || []

    const localHands = rawHands.map(rowToHand)

    const localSessions = rawSessions.map(s => ({
      ...rowToSession(s),
      linkedHandIds: rawHands.filter(h => h.session_id === s.id).map(h => h.id),
    }))

    setHands(localHands)
    setSessions(localSessions)
    setLoading(false)
  }, [session])

  useEffect(() => { fetchAll() }, [fetchAll])

  // ── Hands ────────────────────────────────────────────────────

  const addHand = async (hand) => {
    const { data: { user } } = await supabase.auth.getUser()
    const { data, error } = await supabase
      .from('hand_history')
      .insert({ ...handToRow(hand), user_id: user.id })
      .select()
      .single()
    if (!error) setHands(prev => [rowToHand(data), ...prev])
    return error
  }

  const updateHand = async (id, hand) => {
    const { data, error } = await supabase
      .from('hand_history')
      .update(handToRow(hand))
      .eq('id', id)
      .select()
      .single()
    if (!error) setHands(prev => prev.map(h => h.id === id ? rowToHand(data) : h))
    return error
  }

  const deleteHand = async (id) => {
    const { error } = await supabase.from('hand_history').delete().eq('id', id)
    if (!error) {
      setHands(prev => prev.filter(h => h.id !== id))
      setSessions(prev => prev.map(s => ({
        ...s,
        linkedHandIds: (s.linkedHandIds || []).filter(hid => hid !== id),
      })))
    }
  }

  const linkHandToSession = async (handId, sessionId) => {
    const { error } = await supabase
      .from('hand_history')
      .update({ session_id: sessionId })
      .eq('id', handId)
    if (!error) {
      const oldHand = hands.find(h => h.id === handId)
      const oldSessionId = oldHand?.sessionId
      setHands(prev => prev.map(h => h.id === handId ? { ...h, sessionId } : h))
      setSessions(prev => prev.map(s => {
        const linked = s.linkedHandIds || []
        if (s.id === sessionId)    return { ...s, linkedHandIds: [...new Set([...linked, handId])] }
        if (s.id === oldSessionId) return { ...s, linkedHandIds: linked.filter(id => id !== handId) }
        return s
      }))
    }
  }

  // ── Sessions ─────────────────────────────────────────────────

  const addSession = async (session) => {
    const { data: { user } } = await supabase.auth.getUser()
    const { data, error } = await supabase
      .from('sessions')
      .insert({ ...sessionToRow(session), user_id: user.id })
      .select()
      .single()
    if (!error) setSessions(prev => [...prev, { ...rowToSession(data), linkedHandIds: [] }])
    return error
  }

  const updateSession = async (id, session) => {
    const { data, error } = await supabase
      .from('sessions')
      .update(sessionToRow(session))
      .eq('id', id)
      .select()
      .single()
    if (!error) {
      setSessions(prev => prev.map(s => s.id === id
        ? { ...rowToSession(data), linkedHandIds: s.linkedHandIds || [] }
        : s
      ))
    }
    return error
  }

  const deleteSession = async (id) => {
    const { error } = await supabase.from('sessions').delete().eq('id', id)
    if (!error) {
      setSessions(prev => prev.filter(s => s.id !== id))
      setHands(prev => prev.map(h => h.sessionId === id ? { ...h, sessionId: null } : h))
    }
  }

  // Replaces all hand links for a session in one operation
  const linkHandsToSession = async (sessionId, handIds) => {
    // Unlink all hands currently linked to this session
    await supabase.from('hand_history').update({ session_id: null }).eq('session_id', sessionId)
    // Link the new set
    if (handIds.length > 0) {
      await supabase.from('hand_history').update({ session_id: sessionId }).in('id', handIds)
    }
    setSessions(prev => prev.map(s => s.id === sessionId ? { ...s, linkedHandIds: handIds } : s))
    setHands(prev => prev.map(h => ({
      ...h,
      sessionId: handIds.includes(h.id)
        ? sessionId
        : (h.sessionId === sessionId ? null : h.sessionId),
    })))
  }

  return (
    <DataContext.Provider value={{
      hands, sessions, loading,
      addHand, updateHand, deleteHand, linkHandToSession,
      addSession, updateSession, deleteSession, linkHandsToSession,
      refetch: fetchAll,
    }}>
      {children}
    </DataContext.Provider>
  )
}

export const useData = () => useContext(DataContext)
