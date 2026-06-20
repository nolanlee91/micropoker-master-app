import { supabase } from './supabase'

// Open the Stripe Billing Portal so a Pro user can manage their subscription.
// On success the browser is redirected to Stripe's hosted page (this function does
// not return); on failure it throws so the caller can surface the message.
export async function openBillingPortal() {
  const { data: { session } } = await supabase.auth.getSession()
  const token = session?.access_token
  if (!token) throw new Error('Please sign in first.')

  const res = await fetch('/api/create-portal-session', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok || !data.url) throw new Error(data.error || 'Could not open billing portal.')

  window.location.href = data.url
}
