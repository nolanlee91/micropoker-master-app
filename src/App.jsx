import React, { useState } from 'react'
import { Routes, Route, Navigate, useLocation } from 'react-router-dom'
import Layout from './components/Layout'
import { Terms, PrivacyPolicy, Support } from './components/Legal'
import HandHistory from './components/HandHistory'
import AICoach from './components/AICoach'
import OddsCalculator from './components/OddsCalculator'
import BankrollManager from './components/BankrollManager'
import LeakProfile from './components/LeakProfile'
import Debrief from './components/Debrief'
import Quiz from './components/Quiz'
import LoginScreen from './components/LoginScreen'
import MigratePrompt from './components/MigratePrompt'
import { useAuth } from './context/AuthContext'
import { DataProvider, useData } from './context/DataContext'

export default function App() {
  const { session, showMigrate } = useAuth()
  const { pathname } = useLocation()

  // Public legal/support pages — must be reachable without auth (Stripe + store requirement)
  if (pathname === '/terms')   return <Terms />
  if (pathname === '/privacy') return <PrivacyPolicy />
  if (pathname === '/support') return <Support />

  // session: undefined = loading OR anonymous sign-in in flight → spinner.
  // No login wall: AuthContext signs the user in anonymously so the Paste Hand
  // screen answers directly (KPI: first insight < 60s). LoginScreen is now only a
  // fallback for when anonymous sign-in fails (session resolves to null).
  // Onboarding is no longer a gate — it must not block the 60s flow.
  if (session === undefined) return <Spinner />
  if (!session) return <LoginScreen />

  return (
    <DataProvider>
      {showMigrate && <MigratePrompt />}
      <AppRoutes />
    </DataProvider>
  )
}

function AppRoutes() {
  const { loading } = useData()
  const [analyzingHand, setAnalyzingHand] = useState(null)

  if (loading) return <Spinner />

  return (
    <Layout>
      <Routes>
        <Route path="/" element={<Navigate to="/coach" replace />} />
        <Route path="/history"  element={<HandHistory onAnalyze={hand => setAnalyzingHand(hand)} />} />
        <Route path="/bankroll" element={<BankrollManager />} />
        <Route path="/leaks"    element={<LeakProfile />} />
        <Route path="/debrief"  element={<Debrief />} />
        <Route path="/odds"     element={<OddsCalculator />} />
        <Route path="/quiz"     element={<Quiz />} />
        <Route path="/coach"    element={<AICoach preloadedHand={analyzingHand} onHandConsumed={() => setAnalyzingHand(null)} />} />
      </Routes>
    </Layout>
  )
}

function Spinner() {
  return (
    <div style={{
      minHeight: '100dvh',
      background: '#131313',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
    }}>
      <div style={{
        width: '32px',
        height: '32px',
        border: '2px solid rgba(84,233,138,0.15)',
        borderTopColor: '#54e98a',
        borderRadius: '50%',
        animation: 'spin 0.8s linear infinite',
      }} />
      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
    </div>
  )
}
