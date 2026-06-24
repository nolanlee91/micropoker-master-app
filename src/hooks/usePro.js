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
let proCache = { value: false, hasSub: false, comp: null, known: false }

export function usePro() {
  const [isPro, setIsPro]                     = useState(proCache.value)
  // hasSubscription = there's a REAL Stripe billing relationship to MANAGE (active,
  // trialing, OR a broken one: past_due/unpaid). It is NOT the feature entitlement —
  // a past_due user is NOT Pro but MUST still reach the Billing Portal to fix their
  // card. It deliberately EXCLUDES complimentary grants (those have no Stripe
  // customer/portal), so a comped user still sees "Go Pro", never a broken portal.
  const [hasSubscription, setHasSubscription] = useState(proCache.hasSub)
  // complimentaryUntil = ISO string while a free Pro grant is live, else null.
  const [complimentaryUntil, setComplimentaryUntil] = useState(proCache.comp)
  const [loading, setLoading]                 = useState(!proCache.known)

  // Returns the resolved entitlement so callers can poll until it flips true
  // (e.g. right after Stripe Checkout, while the webhook is still writing the row).
  const refresh = useCallback(async () => {
    if (!proCache.known) setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { proCache = { value: false, hasSub: false, comp: null, known: true }; setIsPro(false); setHasSubscription(false); setComplimentaryUntil(null); setLoading(false); return false }

    // Pro = a real active/trialing sub (not expired) OR a live complimentary grant.
    const [{ data }, { data: grant }] = await Promise.all([
      supabase.from('subscriptions').select('status, current_period_end').eq('user_id', user.id).maybeSingle(),
      supabase.from('pro_grants').select('complimentary_until').eq('user_id', user.id).maybeSingle(),
    ])

    const active     = !!data && ['active', 'trialing'].includes(data.status)
    const notExpired = !data?.current_period_end || new Date(data.current_period_end) > new Date()
    const compLive   = !!grant?.complimentary_until && new Date(grant.complimentary_until) > new Date()
    const result = (active && notExpired) || compLive
    const hasSub = !!data && ['active', 'trialing', 'past_due', 'unpaid'].includes(data.status)
    const comp   = compLive ? grant.complimentary_until : null
    proCache = { value: result, hasSub, comp, known: true }
    setIsPro(result)
    setHasSubscription(hasSub)
    setComplimentaryUntil(comp)
    setLoading(false)
    return result
  }, [])

  useEffect(() => {
    refresh()
    // Re-check when auth changes (anon → real account, sign-out, etc.).
    const { data: { subscription } } = supabase.auth.onAuthStateChange(() => { refresh() })
    return () => subscription.unsubscribe()
  }, [refresh])

  return { isPro, hasSubscription, complimentaryUntil, loading, refresh }
}
