# Poker Maverick — Precision Toolkit

> A professional Texas Hold'em decision-support suite built with React + Vite.

## Design System
Follows "The Precise Maverick" — High-End Editorial aesthetic.
- Background `#131313` · Emerald `#54e98a` · Logic Blue `#92ccff`
- No-Line rule: boundaries via surface color shifts
- Glassmorphism HUD for AI insights
- Inter font, tight letterSpacing on financial data

## Tools

### 1. Odds Calculator
Monte Carlo simulation (3,000 iterations) for hand equity.
- Select hole cards, optional villain hand, community cards
- Adjustable random opponent count (1–8)
- Shows Win / Tie / Lose % + equity bar + best hand detection

### 2. AI Coach
Chat-based hand analysis powered by Claude API.
- Glassmorphism message bubbles
- Game context form (position, street, stack, pot)
- Quick presets for common scenarios
- Full conversation history persisted via localStorage

### 3. Bankroll Manager
Session tracker with BRM recommendations.
- Log sessions with P&L, hours, stakes, location
- Conservative / Standard / Aggressive BRM rules
- Max safe stake calculation
- Win rate, hourly rate, all-time profit metrics

## Setup

```bash
npm install
npm run dev
```

### AI Coach API Key
1. Get your Anthropic API key from https://console.anthropic.com
2. Click "Set API Key" in the AI Coach panel
3. Key is stored locally in your browser

## Tech Stack
- React 18 + Vite 5
- react-router-dom v6
- lucide-react icons
- No external UI libraries — pure design system
