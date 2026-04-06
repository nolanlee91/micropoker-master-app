import React, { useState } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import Layout from './components/Layout'
import HandHistory from './components/HandHistory'
import AICoach from './components/AICoach'
import OddsCalculator from './components/OddsCalculator'
import BankrollManager from './components/BankrollManager'
import Quiz from './components/Quiz'

export default function App() {
  const [analyzingHand, setAnalyzingHand] = useState(null)
  return (
    <Layout>
      <Routes>
        <Route path="/" element={<Navigate to="/history" replace />} />
        <Route path="/history"  element={<HandHistory onAnalyze={hand => setAnalyzingHand(hand)} />} />
        <Route path="/bankroll" element={<BankrollManager />} />
        <Route path="/odds"     element={<OddsCalculator />} />
        <Route path="/quiz"     element={<Quiz />} />
        <Route path="/coach"    element={<AICoach preloadedHand={analyzingHand} onHandConsumed={() => setAnalyzingHand(null)} />} />
      </Routes>
    </Layout>
  )
}
