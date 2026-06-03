import { useLocalStorage } from './useLocalStorage'

// Single source of truth for the "Pro" entitlement.
//
// For now this is a local flag so the paywall + gating can be built and tested
// before a native build exists. When the app is packaged (Capacitor / Expo),
// replace the body with the real entitlement check — e.g. RevenueCat
// `customerInfo.entitlements.active['pro']` or a Supabase subscription row —
// keeping the same { isPro, setIsPro } shape so callers don't change.
export function usePro() {
  const [isPro, setIsPro] = useLocalStorage('is-pro', false)
  return { isPro, setIsPro }
}
