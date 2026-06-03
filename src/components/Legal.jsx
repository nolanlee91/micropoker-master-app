import React from 'react'

// ─────────────────────────────────────────────────────────────────────────────
// Public legal / support pages. These render WITHOUT authentication so the
// App Store / Play Store reviewer (and users) can open them directly via URL:
//   /privacy   and   /support
//
// TODO before submission: replace the [PLACEHOLDER] values below with your real
// company/developer name, contact email, and effective date.
// ─────────────────────────────────────────────────────────────────────────────

const APP_NAME      = 'MicroPoker Master'
const COMPANY       = '[YOUR COMPANY / DEVELOPER NAME]'
const CONTACT_EMAIL = '[your-support-email@example.com]'
const EFFECTIVE     = '[EFFECTIVE DATE]'

const C = {
  bg: '#0B0E14', surface: '#161B22', border: '#21262D',
  text: '#E6EDF3', textMuted: '#9aa4af', primary: '#54e98a', accent: '#ffc0ac',
}

function Shell({ title, children }) {
  return (
    <div style={{ minHeight:'100dvh', background:C.bg, color:C.text, fontFamily:"'Inter',sans-serif" }}>
      <div style={{ maxWidth:'720px', margin:'0 auto', padding:'32px 20px 80px' }}>
        <a href="/" style={{ color:C.primary, fontSize:'0.8rem', textDecoration:'none', fontWeight:600 }}>← Back to {APP_NAME}</a>
        <h1 style={{ fontSize:'1.6rem', fontWeight:700, letterSpacing:'-0.02em', margin:'18px 0 6px' }}>{title}</h1>
        <div style={{ fontSize:'0.72rem', color:C.textMuted, marginBottom:'24px' }}>Last updated: {EFFECTIVE}</div>
        <div style={{ fontSize:'0.9rem', lineHeight:1.7, color:'#cdd5de' }}>{children}</div>
      </div>
    </div>
  )
}

function H2({ children }) {
  return <h2 style={{ fontSize:'1.05rem', fontWeight:700, color:C.text, margin:'26px 0 8px' }}>{children}</h2>
}

export function PrivacyPolicy() {
  return (
    <Shell title="Privacy Policy">
      <p>
        {APP_NAME} (the “App”), operated by {COMPANY}, is an educational poker training and
        personal record-keeping tool. The App does <strong>not</strong> offer real-money gambling,
        wagering, or any way to win or lose real money. This policy explains what data we collect and
        how we use it.
      </p>

      <H2>Information we collect</H2>
      <ul>
        <li><strong>Account:</strong> your email address (and, if you use Google sign-in, your basic Google profile name) for authentication.</li>
        <li><strong>Your content:</strong> the poker hands, sessions, notes, and figures (e.g. buy-in / cash-out amounts) you choose to log.</li>
        <li><strong>Preferences:</strong> settings such as default game type and language, stored on your device.</li>
      </ul>

      <H2>How we use your information</H2>
      <ul>
        <li>To provide and sync the App’s features (hand history, bankroll tracking, quizzes, odds, AI coaching).</li>
        <li>When you request AI analysis of a hand, the relevant hand details are sent to our AI provider (Google Gemini) to generate the analysis.</li>
      </ul>
      <p>We do not sell your personal data, and we do not use it for advertising.</p>

      <H2>Third-party services</H2>
      <ul>
        <li><strong>Supabase</strong> — stores your account and data securely, isolated per-user via row-level security.</li>
        <li><strong>Google Gemini API</strong> — receives hand details only when you explicitly request an AI analysis.</li>
      </ul>

      <H2>Data retention &amp; deletion</H2>
      <p>
        Your data is kept until you delete it. You can permanently delete your account and all
        associated data at any time from <em>Preferences → Account → Delete account</em> inside the App.
        Deletion is immediate and irreversible.
      </p>

      <H2>Security</H2>
      <p>
        Data is transmitted over encrypted connections and protected by per-user row-level security so
        that you can only access your own records.
      </p>

      <H2>Children</H2>
      <p>
        The App is intended for adults and is rated 17+. It is not directed to children, and we do not
        knowingly collect data from anyone under 17.
      </p>

      <H2>Changes</H2>
      <p>We may update this policy; material changes will be reflected by the “Last updated” date above.</p>

      <H2>Contact</H2>
      <p>Questions? Email us at <a href={`mailto:${CONTACT_EMAIL}`} style={{ color:C.primary }}>{CONTACT_EMAIL}</a>.</p>
    </Shell>
  )
}

export function Support() {
  return (
    <Shell title="Support">
      <p>Need help with {APP_NAME}? We’re happy to assist.</p>

      <H2>Contact</H2>
      <p>
        Email <a href={`mailto:${CONTACT_EMAIL}`} style={{ color:C.primary }}>{CONTACT_EMAIL}</a> and we’ll
        get back to you. Please include your account email and a description of the issue.
      </p>

      <H2>Common questions</H2>
      <ul>
        <li><strong>How accurate is the AI coach?</strong> Its analysis is approximate guidance for learning, not guaranteed advice.</li>
        <li><strong>How do I delete my account?</strong> Open <em>Preferences → Account → Delete account</em>. This permanently removes your account and all data.</li>
        <li><strong>Is my data private?</strong> Yes — each account can only access its own data. See our <a href="/privacy" style={{ color:C.primary }}>Privacy Policy</a>.</li>
      </ul>

      <H2>Responsible play</H2>
      <p style={{ color:C.accent }}>
        {APP_NAME} is an educational and tracking tool only. It does not involve real-money gambling.
        If you gamble with real money elsewhere, please play responsibly and within your means.
      </p>
    </Shell>
  )
}
