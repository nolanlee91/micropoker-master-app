import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'

// Single source of truth for the "Pro" entitlement.
//
// Pro lives in the Supabase `subscriptions` row, written ONLY by the Stripe
// webhook (service-role key). The client can READ its own row but has no RLS
// write policy — so Pro can never be faked from the browser. Returns the same
// { isPro } that callers already used, plus { loading, refresh } for the
// post-checkout sync.
//
// Mobile (phase 2): swap the query below for the RevenueCat entitlement check
// (`customerInfo.entitlements.active['pro']`), keeping this shape unchanged.
export function usePro() {
  const [isPro, setIsPro]     = useState(false)
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setIsPro(false); setLoading(false); return }

    const { data } = await supabase
      .from('subscriptions')
      .select('status, current_period_end')
      .eq('user_id', user.id)
      .maybeSingle()

    const active     = !!data && ['active', 'trialing'].includes(data.status)
    const notExpired = !data?.current_period_end || new Date(data.current_period_end) > new Date()
    setIsPro(active && notExpired)
    setLoading(false)
  }, [])

  useEffect(() => {
    refresh()
    // Re-check when auth changes (anon → real account, sign-out, etc.).
    const { data: { subscription } } = supabase.auth.onAuthStateChange(() => { refresh() })
    return () => subscription.unsubscribe()
  }, [refresh])

  return { isPro, loading, refresh }
}
