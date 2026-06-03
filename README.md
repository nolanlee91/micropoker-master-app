# MicroPoker Master — Precision Toolkit

> A professional Texas Hold'em decision-support suite for micro-stakes players, built with React + Vite, Supabase, and Google Gemini.

(Package name: `poker-maverick`.)

## Design System
Follows "The Precise Maverick" — High-End Editorial aesthetic.
- Background `#131313` · Emerald `#54e98a` · Logic Blue `#92ccff` · Accent `#ffc0ac`
- No-Line rule: boundaries via surface color shifts
- Glassmorphism HUD for AI insights
- Inter font, tight letterSpacing on financial data
- Pure inline styles — no CSS framework

## Accounts & Data

Sign in with **Google** or an **email magic link** (Supabase Auth). Your hands and sessions are stored in your account (Supabase Postgres with row-level security, so you only ever see your own data) and sync across devices. On first sign-in, if you have older data saved locally in this browser, the app offers to migrate it into your account.

## Tools

### 1. Hand History
Log hands with a card picker, position, street, result, and notes. Link hands to bankroll sessions, and send any hand to the AI Coach for structured analysis.

### 2. Odds Calculator
Monte Carlo simulation (4,000 iterations) for hand equity.
- Select hole cards, up to 3 villain hands (specific or random), and community cards
- Shows Win / Tie / Lose % + equity bar + best-hand detection
- Custom base-15 hand evaluator

### 3. AI Coach
Chat-based hand analysis powered by **Google Gemini** (`gemini-2.5-flash`).
- Structured analysis: hand strength, board texture, biggest mistake, leak category, estimated EV impact, and a better line
- Hand strength is computed **deterministically in code** and the model is forced to use it — it never misreads your cards
- Follow-up Q&A on any analyzed hand
- Tunable by game type (Live Cash / Online Cash / MTT) and villain type (Nit / TAG / LAG / Fish / Rec / Unknown)
- Multi-language responses: English / Vietnamese / Chinese
- The Gemini API key lives server-side in the `/api/coach` function — never in the browser

### 4. Bankroll Manager
Session tracker with BRM recommendations.
- Log sessions with P&L, hours, stakes, location
- Conservative / Standard / Aggressive BRM rules (30bb / 20bb / 15bb buy-in caps)
- Max safe stake calculation; win rate, hourly rate, all-time profit metrics

### 5. Quiz
Daily GTO training module with three tiers (Beginner / Intermediate / Advanced), an XP/streak system, hardcoded 100bb 9-max opening ranges, and weekly resets.

## Setup

```bash
npm install
npm run dev      # frontend dev server at localhost:5173
```

### Environment variables

Create a `.env.local` (see `.env.example`):

```
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your_anon_key_here
```

And configure the server-side key (in your hosting provider's env settings, used by `api/coach.js`):

```
GEMINI_API_KEY=your_gemini_key
```

### Database

Run `db/migration.sql` in the Supabase SQL Editor to create the `profiles`, `sessions`, and `hand_history` tables, their row-level-security policies, and the signup trigger.

### AI Coach in local dev

`npm run dev` serves the frontend only. The `/api/coach` serverless function runs on the deployment platform (Vercel) or locally via `vercel dev`. Without it, AI Coach requests will 404.

## Deployment
Configured for **Vercel** (`vercel.json` — SPA rewrites + the `/api/coach` function) and **Netlify** (`netlify.toml`). Full functionality (AI Coach) requires the serverless function, so deploy on Vercel or an equivalent function host.

## Tech Stack
- React 18 + Vite 5
- react-router-dom v6
- Supabase (`@supabase/supabase-js`) — auth + Postgres
- Google Gemini via a serverless API function
- lucide-react icons
- No external UI libraries — pure design system
