# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm install       # Install dependencies
npm run dev       # Start Vite dev server (localhost:5173)
npm run build     # Production build → dist/
npm run preview   # Preview production build locally
```

No test or lint scripts are configured.

## Architecture

**MicroPoker Master** is a fully client-side React 18 + Vite SPA — no backend. All data lives in `localStorage`. Deployed to Netlify.

### Routing (`src/App.jsx`)

React Router v6. Root `/` redirects to `/history`. Routes: `/history`, `/bankroll`, `/odds`, `/quiz`, `/coach`. The `analyzingHand` state is passed via route state to allow HandHistory → AICoach hand analysis flow.

### Components (`src/components/`)

- **Layout.jsx** — master shell: responsive sidebar (≥768px) / bottom nav (mobile). All navigation lives here.
- **HandHistory.jsx** — hand logging with card picker, position, result, notes. Hands link to BRM sessions. Triggers the "analyze hand" flow to AICoach.
- **OddsCalculator.jsx** — equity calculator using a custom base-15 hand evaluator + Monte Carlo simulation (4,000 iterations). Supports up to 3 villains. Card encoding is performance-critical — don't simplify naively.
- **AICoach.jsx** — direct Anthropic REST calls (`https://api.anthropic.com/v1/messages`, model `claude-sonnet-4-20250514`, max_tokens 1000). API key stored in localStorage under `aicoach-apikey`. No proxy — key is browser-side only.
- **BankrollManager.jsx** — session tracker with Conservative/Standard/Aggressive BRM rules (30bb/20bb/15bb buy-in caps). Stake levels $1/$1–$5/$10.
- **Quiz.jsx** — 1100+ line daily training module. Three tiers (Beginner 10/day, Intermediate 3/day, Advanced 2/day), XP/streak system, GTO 100bb 9-max opening ranges hardcoded. Weekly reset logic. Questions are procedurally generated with validation guards to prevent duplicate cards.

### State & Persistence

Custom `useLocalStorage` hook (`src/hooks/useLocalStorage.js`) wraps `useState` with JSON serialization. localStorage keys:

| Key | Owner |
|---|---|
| `hand-history` | HandHistory |
| `brm-sessions`, `brm-bankroll`, `brm-stakes`, `brm-style` | BankrollManager |
| `aicoach-messages`, `aicoach-apikey`, `aicoach-ctx` | AICoach |
| `pending-edit-hand` | HandHistory→BankrollManager link |
| `quiz-daily-v2` | Quiz |

### Design System (`src/theme/theme.js`)

Pure inline-styles — no CSS framework. Key tokens:
- Background: `#131313`, Emerald primary: `#54e98a`, Logic blue: `#92ccff`, Accent: `#ffc0ac`
- Glassmorphism: `rgba(255,255,255,0.05)` + `backdrop-filter: blur(16px)`
- No borders for separation — use surface color shifts instead
- Inter font (Google Fonts), tight `letterSpacing` on financial figures
