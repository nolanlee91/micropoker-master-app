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

> The `/api/coach` serverless function only runs on the deployment platform (Vercel) or via `vercel dev`. `npm run dev` serves the frontend only — AI Coach calls to `/api/coach` will 404 unless you run the function separately.

## Architecture

**MicroPoker Master** (package name `poker-maverick`) is a React 18 + Vite 5 SPA — a decision-support toolkit for micro-stakes Texas Hold'em. It is **not** purely client-side: it uses **Supabase** for auth + persistence and a **serverless API** (`api/coach.js`) that proxies **Google Gemini** for AI analysis.

### Auth & data flow

1. **`src/context/AuthContext.jsx`** — Supabase auth. Sign in via Google OAuth or email magic link (OTP). On first authenticated load it runs a one-time **localStorage → Supabase migration** (flag key `supabase-migration-v1`): if legacy local data exists it shows `MigratePrompt`, otherwise it silently marks migration done.
2. **`src/context/DataContext.jsx`** — owns `hands` and `sessions` state, all CRUD goes through Supabase. Fetches on auth, keeps local state in sync after each mutation. Sessions carry a derived `linkedHandIds` array (hands reference a session via `session_id` FK).
3. **`src/lib/supabase.js`** — Supabase client from `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY`.
4. **`src/lib/db.js`** — pure mappers between DB rows (snake_case) and frontend objects (camelCase): `rowToHand`/`handToRow`, `rowToSession`/`sessionToRow`.

### Database (`db/migration.sql`)

Run in the Supabase SQL Editor. Three tables, all with Row-Level Security scoping rows to `auth.uid()`:
- **`profiles`** — auto-created on signup via the `handle_new_user` trigger. Holds `default_game_type`, `default_stake`.
- **`sessions`** — bankroll sessions (date, stake, location, duration, buy-in, cash-out, profit_loss).
- **`hand_history`** — logged hands (position, hole_cards[], board[], result_amount, notes, plus AI fields `ai_analysis` jsonb, `ev_impact`, `leak_category`). `session_id` FK → `sessions` with `on delete set null`.

### Routing (`src/App.jsx`)

`App` gates on Supabase session: `undefined` → spinner, `null` → `LoginScreen`, else renders `DataProvider` + routes (and `MigratePrompt` overlay when `showMigrate`). React Router v6. Root `/` redirects to `/history`. Routes: `/history`, `/bankroll`, `/odds`, `/quiz`, `/coach`. The `analyzingHand` state is lifted in `AppRoutes` and passed into `AICoach` to drive the HandHistory → AICoach analysis flow.

### Components (`src/components/`)

- **Layout.jsx** — master shell: responsive sidebar (≥768px) / bottom nav (mobile). Houses the preferences panel (default game type, response language) and sign-out.
- **LoginScreen.jsx** — Google OAuth + email magic-link sign-in.
- **MigratePrompt.jsx** — modal offering to migrate legacy localStorage data into the user's Supabase account.
- **HandHistory.jsx** — hand logging with card picker, position, result, notes. Hands link to BRM sessions. Triggers the "analyze hand" flow to AICoach.
- **OddsCalculator.jsx** — equity calculator using a custom base-15 hand evaluator + Monte Carlo simulation (4,000 iterations). Supports up to 3 villains. Card encoding is performance-critical — don't simplify naively.
- **AICoach.jsx** — chat UI that POSTs to `/api/coach`. **Key invariant:** it runs the deterministic `evaluateHeroHand` (`src/utils/handEvaluator.js`) locally and sends the verified hand strength to the backend, then overwrites the AI's `heroHandStrength`/`boardTexture` with those deterministic values — never trust the model to read its own cards. Renders structured analysis cards or follow-up cards; has layered fallbacks so it never shows a blank error. Persists chat to `localStorage` (`aicoach-messages`). Analysis results are written back onto the hand via `updateHand`.
- **BankrollManager.jsx** — session tracker with Conservative/Standard/Aggressive BRM rules (30bb/20bb/15bb buy-in caps). Stake levels $1/$1–$5/$10.
- **Quiz.jsx** — 1100+ line daily training module. Three tiers (Beginner 10/day, Intermediate 3/day, Advanced 2/day), XP/streak system, GTO 100bb 9-max opening ranges hardcoded. Weekly reset logic. Questions are procedurally generated with validation guards to prevent duplicate cards. Still localStorage-backed (`quiz-daily-v2`).

### AI Coach backend (`api/coach.js`)

Vercel-style serverless handler. Calls Gemini `gemini-2.5-flash` with `GEMINI_API_KEY` (server-side env var — never exposed to the browser). Two modes:
- **Hand analysis** (`isHandAnalysis: true`) — returns a strict JSON schema (heroHandStrength, boardTexture, summary, biggestMistake, mistakeType, `leak_category`, `ev_impact`, confidence, whyWrong, betterLine). When the frontend supplies `verifiedHeroHandStrength`, the prompt forces the model to copy it verbatim.
- **Follow-up** (`request_type: 'follow_up'`) — returns `{ answer, keyTakeaway, confidence }`.

Both modes are tuned by game type (`Live Cash`/`Online Cash`/`MTT`), villain type (`Unknown`/`Nit`/`TAG`/`LAG`/`Fish`/`Rec`), and response language (English/Vietnamese/Chinese). Responses are validated/sanitized server-side, with `extractJSON` recovering JSON from imperfect model output. The frontend (`parseAnalysisText`) has matching recovery logic.

### State & Persistence

Cloud data (hands, sessions) lives in Supabase via `DataContext`. localStorage is now only for the migration flag, the AI Coach transcript, the Quiz state, and user preferences — via the custom `useLocalStorage` hook (`src/hooks/useLocalStorage.js`), which wraps `useState` with JSON serialization.

| Key | Owner | Notes |
|---|---|---|
| `supabase-migration-v1` | AuthContext | one-time migration flag |
| `aicoach-messages` | AICoach | chat transcript; cleared on sign-out |
| `aicoach-language` | Layout | response language preference |
| `user-default-game-type` | Layout | default game type preference |
| `quiz-daily-v2` | Quiz | daily training state |

Legacy keys read only during migration: `hand-history`, `brm-sessions`, `brm-bankroll`, `brm-stakes`, `brm-style`, `aicoach-ctx`.

### Environment variables

| Var | Scope | Used by |
|---|---|---|
| `VITE_SUPABASE_URL` | frontend (Vite) | `src/lib/supabase.js` |
| `VITE_SUPABASE_ANON_KEY` | frontend (Vite) | `src/lib/supabase.js` |
| `GEMINI_API_KEY` | server | `api/coach.js` |

See `.env.example` for the `VITE_*` keys.

### Deployment

Configured for **Vercel** (`vercel.json` — SPA rewrites + the `/api/coach` function) and **Netlify** (`netlify.toml`). The AI Coach requires the serverless function, so Vercel (or an equivalent function host) is needed for full functionality.

### Design System (`src/theme/theme.js`)

Pure inline-styles — no CSS framework. Key tokens:
- Background: `#131313`, Emerald primary: `#54e98a`, Logic blue: `#92ccff`, Accent: `#ffc0ac`
- Glassmorphism: `rgba(255,255,255,0.05)` + `backdrop-filter: blur(16px)`
- No borders for separation — use surface color shifts instead
- Inter font (Google Fonts), tight `letterSpacing` on financial figures

> Note: `AICoach.jsx` uses its own darker local palette (`C` object, base `#0B0E14`) rather than `theme.js`.
