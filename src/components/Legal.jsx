import React from 'react'

// ─────────────────────────────────────────────────────────────────────────────
// Public legal / support pages. These render WITHOUT authentication so payment
// processors (Stripe) and app-store reviewers — and users — can open them via URL:
//   /terms   /privacy   /support
//
// NOTE: GOVERNING_LAW is the one thing only you can decide — set it to the country
// (or state) whose law governs these Terms. Everything else reflects how the app
// actually works. This is a practical draft, not legal advice; have a lawyer review
// before a paid public launch if you want certainty.
// ─────────────────────────────────────────────────────────────────────────────

const APP_NAME      = 'MicroPoker Master'
const COMPANY       = 'MicroPoker Master'
const CONTACT_EMAIL = 'micropokermaster@gmail.com'
const EFFECTIVE     = 'June 19, 2026'
const GOVERNING_LAW = '[your country or state]'  // ← set this

const C = {
  bg: '#0B0E14', surface: '#161B22', border: '#21262D',
  text: '#E6EDF3', textMuted: '#9aa4af', primary: '#54e98a', accent: '#ffc0ac',
}

function Shell({ title, children }) {
  return (
    <div style={{ height:'100dvh', overflowY:'auto', WebkitOverflowScrolling:'touch', background:C.bg, color:C.text, fontFamily:"'Inter',sans-serif" }}>
      <div style={{ maxWidth:'720px', margin:'0 auto', padding:'32px 20px 80px' }}>
        <a href="/" style={{ color:C.primary, fontSize:'0.8rem', textDecoration:'none', fontWeight:600 }}>← Back to {APP_NAME}</a>
        <h1 style={{ fontSize:'1.6rem', fontWeight:700, letterSpacing:'-0.02em', margin:'18px 0 6px' }}>{title}</h1>
        <div style={{ fontSize:'0.72rem', color:C.textMuted, marginBottom:'24px' }}>Last updated: {EFFECTIVE}</div>
        <div style={{ fontSize:'0.9rem', lineHeight:1.7, color:'#cdd5de' }}>{children}</div>
        <div style={{ marginTop:'36px', paddingTop:'16px', borderTop:`1px solid ${C.border}`, fontSize:'0.78rem' }}>
          <a href="/terms" style={{ color:C.primary, marginRight:'16px' }}>Terms</a>
          <a href="/privacy" style={{ color:C.primary, marginRight:'16px' }}>Privacy</a>
          <a href="/support" style={{ color:C.primary }}>Support</a>
        </div>
      </div>
    </div>
  )
}

function H2({ children }) {
  return <h2 style={{ fontSize:'1.05rem', fontWeight:700, color:C.text, margin:'26px 0 8px' }}>{children}</h2>
}

export function Terms() {
  return (
    <Shell title="Terms of Service">
      <p>
        These Terms govern your use of {APP_NAME} (the “App”), operated by {COMPANY}. By creating an
        account or using the App, you agree to these Terms. If you do not agree, do not use the App.
      </p>

      <H2>What the App is</H2>
      <p>
        {APP_NAME} is an <strong>educational</strong> poker training and personal record-keeping tool. It
        does <strong>not</strong> offer real-money gambling, wagering, or any way to win or lose real
        money. AI analysis, leak detection, EV estimates and quizzes are approximate guidance for
        learning — they are not guaranteed, and are not financial, investment, or professional advice.
      </p>

      <H2>Eligibility</H2>
      <p>You must be 18 or older (or the age of majority where you live) to use the App.</p>

      <H2>Your account</H2>
      <p>
        You may use the App anonymously or sign in with Google or email. You are responsible for activity
        under your account and for keeping access to your sign-in method secure.
      </p>

      <H2>Pro subscription &amp; billing</H2>
      <ul>
        <li>“Pro” is an optional paid subscription, billed <strong>monthly</strong> or <strong>annually</strong> through our payment processor, <strong>Stripe</strong>. The amount charged is the price shown at checkout.</li>
        <li>Subscriptions <strong>auto-renew</strong> at the end of each billing period at the then-current price, until you cancel.</li>
        <li>You can cancel anytime from <em>Preferences → Manage subscription</em> (the Stripe billing portal).</li>
      </ul>

      <H2>Refunds &amp; cancellation</H2>
      <p>
        <strong>All payments are non-refundable.</strong> When you cancel, your Pro access continues
        until the <strong>end of the period you have already paid for</strong> (the current month or year),
        and then your subscription simply stops renewing — you are not charged again. We do not provide
        partial or pro-rated refunds for unused time.
      </p>

      <H2>Acceptable use</H2>
      <p>
        Do not misuse the App: no reverse-engineering, scraping, automated abuse of the AI features,
        reselling, or attempts to disrupt or gain unauthorized access to the service.
      </p>

      <H2>Disclaimer</H2>
      <p>
        The App is provided “as is” and “as available”, without warranties of any kind. AI output can be
        incomplete or wrong; you are responsible for your own poker and financial decisions. We do not
        guarantee any result, improvement, or winnings.
      </p>

      <H2>Limitation of liability</H2>
      <p>
        To the maximum extent permitted by law, {COMPANY} is not liable for any indirect, incidental, or
        consequential damages. Our total liability for any claim relating to the App is limited to the
        amount you paid us in the 12 months before the claim.
      </p>

      <H2>Changes to these Terms</H2>
      <p>We may update these Terms; material changes are reflected by the “Last updated” date above. Continued use after a change means you accept it.</p>

      <H2>Governing law</H2>
      <p>These Terms are governed by the laws of {GOVERNING_LAW}, without regard to its conflict-of-laws rules.</p>

      <H2>Contact</H2>
      <p>Questions? Email us at <a href={`mailto:${CONTACT_EMAIL}`} style={{ color:C.primary, textDecoration:'none', fontWeight:600 }}>{CONTACT_EMAIL}</a></p>
    </Shell>
  )
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
        <li><strong>Account:</strong> your email address (and, if you use Google sign-in, your basic Google profile name) for authentication. You may also use the App with an anonymous session and no account.</li>
        <li><strong>Your content:</strong> the poker hands, sessions, notes, and figures (e.g. buy-in / cash-out amounts) you choose to log, plus AI analysis generated for them.</li>
        <li><strong>Voice input (optional):</strong> if you record a hand by voice, the audio is sent for transcription (see below). We do <strong>not</strong> store the audio — only the resulting text, which you can review and edit before it is saved.</li>
        <li><strong>Subscription:</strong> if you buy Pro, we store your subscription status and renewal date. <strong>Payment card details are handled by Stripe — we never receive or store them.</strong></li>
        <li><strong>Preferences:</strong> settings such as default game type and language, stored on your device.</li>
      </ul>

      <H2>How we use your information</H2>
      <ul>
        <li>To provide and sync the App’s features (hand history, bankroll tracking, quizzes, odds, AI coaching).</li>
        <li>When you request AI analysis of a hand, the relevant hand details are sent to our AI provider (Google Gemini) to generate the analysis.</li>
        <li>When you use voice input, the recorded audio is sent to Google (Gemini) to transcribe it into text. “We don’t store it” does not mean it isn’t transmitted — it is processed by Google to produce the transcript.</li>
        <li>To process Pro subscriptions via Stripe.</li>
      </ul>
      <p>We do not sell your personal data, and we do not use it for advertising.</p>

      <H2>Third-party services</H2>
      <ul>
        <li><strong>Supabase</strong> — authentication and secure storage of your account and data, isolated per-user via row-level security.</li>
        <li><strong>Google (Gemini API &amp; Google Sign-In)</strong> — receives hand details and any voice audio only when you request an AI analysis or use voice; provides optional Google sign-in.</li>
        <li><strong>Stripe</strong> — processes subscription payments; handles your card data directly.</li>
        <li><strong>Vercel</strong> — hosts the App.</li>
      </ul>

      <H2>Data retention &amp; deletion</H2>
      <p>
        Your data is kept until you delete it. You can permanently delete your account and all
        associated data at any time from <em>Preferences → Account → Delete account</em> inside the App.
        Deletion is immediate and irreversible. Voice audio is never retained.
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
      <p>Questions? Email us at <a href={`mailto:${CONTACT_EMAIL}`} style={{ color:C.primary, textDecoration:'none', fontWeight:600 }}>{CONTACT_EMAIL}</a></p>
    </Shell>
  )
}

export function Support() {
  return (
    <Shell title="Support">
      <p>Need help with {APP_NAME}? We’re happy to assist.</p>

      <H2>Contact</H2>
      <p>
        Email <a href={`mailto:${CONTACT_EMAIL}`} style={{ color:C.primary, textDecoration:'none', fontWeight:600 }}>{CONTACT_EMAIL}</a> and we’ll
        get back to you. Please include your account email and a description of the issue.
      </p>

      <H2>Common questions</H2>
      <ul>
        <li><strong>How accurate is the AI coach?</strong> Its analysis is approximate guidance for learning, not guaranteed advice.</li>
        <li><strong>How do I cancel Pro?</strong> Open <em>Preferences → Manage subscription</em>. You keep Pro until the end of the period you paid for, then it stops renewing. Payments are non-refundable.</li>
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
