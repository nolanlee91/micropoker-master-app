import { supabase } from './supabase'

// Kick off Stripe Checkout for the given plan. On success the browser is
// redirected to Stripe's hosted page (this function does not return); on failure
// it throws so the caller can surface the message.
export async function startCheckout(plan = 'monthly') {
  const { data: { session } } = await supabase.auth.getSession()
  const token = session?.access_token
  if (!token) throw new Error('Please sign in first.')

  const res = await fetch('/api/create-checkout-session', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ plan }),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok || !data.url) throw new Error(data.error || 'Could not start checkout.')

  window.location.href = data.url
}
