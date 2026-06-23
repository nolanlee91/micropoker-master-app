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
// Module-level cache so navigating back to a Pro-gated screen doesn't flash the
// non-Pro view for ~300ms while Supabase is re-queried. First load still resolves
// from the network; after that, mounts start from the last known value.
let proCache = { value: false, known: false }

export function usePro() {
  const [isPro, setIsPro]     = useState(proCache.value)
  const [loading, setLoading] = useState(!proCache.known)

  // Returns the resolved entitlement so callers can poll until it flips true
  // (e.g. right after Stripe Checkout, while the webhook is still writing the row).
  const refresh = useCallback(async () => {
    if (!proCache.known) setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { proCache = { value: false, known: true }; setIsPro(false); setLoading(false); return false }

    const { data } = await supabase
      .from('subscriptions')
      .select('status, current_period_end')
      .eq('user_id', user.id)
      .maybeSingle()

    const active     = !!data && ['active', 'trialing'].includes(data.status)
    const notExpired = !data?.current_period_end || new Date(data.current_period_end) > new Date()
    const result = active && notExpired
    proCache = { value: result, known: true }
    setIsPro(result)
    setLoading(false)
    return result
  }, [])

  useEffect(() => {
    refresh()
    // Re-check when auth changes (anon → real account, sign-out, etc.).
    const { data: { subscription } } = supabase.auth.onAuthStateChange(() => { refresh() })
    return () => subscription.unsubscribe()
  }, [refresh])

  return { isPro, loading, refresh }
}
