// Reusable reward feedback: sound + haptic + confetti.
// No external deps — Web Audio for sound, a tiny canvas burst for confetti,
// navigator.vibrate for haptics. All guarded so they no-op where unsupported
// (e.g. haptics on iOS Safari). When the app is wrapped natively (Capacitor /
// React Native), swap `vibrate` for the platform Haptics API — callers stay the same.

const SOUND_KEY = 'sound-enabled'

function soundEnabled() {
  try {
    const v = window.localStorage.getItem(SOUND_KEY)
    return v == null ? true : JSON.parse(v)
  } catch {
    return true
  }
}

let audioCtx = null
function getCtx() {
  if (typeof window === 'undefined') return null
  const AC = window.AudioContext || window.webkitAudioContext
  if (!AC) return null
  if (!audioCtx) audioCtx = new AC()
  if (audioCtx.state === 'suspended') audioCtx.resume().catch(() => {})
  return audioCtx
}

// Play a short note sequence. freqs in Hz.
function playTones(freqs, { duration = 0.12, gain = 0.06, type = 'sine' } = {}) {
  if (!soundEnabled()) return
  const ctx = getCtx()
  if (!ctx) return
  try {
    freqs.forEach((f, i) => {
      const osc = ctx.createOscillator()
      const g = ctx.createGain()
      osc.type = type
      osc.frequency.value = f
      const start = ctx.currentTime + i * duration
      g.gain.setValueAtTime(0, start)
      g.gain.linearRampToValueAtTime(gain, start + 0.01)
      g.gain.exponentialRampToValueAtTime(0.0001, start + duration)
      osc.connect(g).connect(ctx.destination)
      osc.start(start)
      osc.stop(start + duration)
    })
  } catch {}
}

export function vibrate(pattern = 12) {
  try {
    if (typeof navigator !== 'undefined' && navigator.vibrate) navigator.vibrate(pattern)
  } catch {}
}

// Brief tap feedback for selecting / interacting.
export function tapFeedback() {
  vibrate(8)
}

const CONFETTI_COLORS = ['#54e98a', '#92ccff', '#ffc0ac', '#ffd700', '#67f09a']

export function confettiBurst({ count = 90, originY = 0.35 } = {}) {
  if (typeof document === 'undefined') return
  try {
    const canvas = document.createElement('canvas')
    const dpr = window.devicePixelRatio || 1
    const W = window.innerWidth
    const H = window.innerHeight
    canvas.width = W * dpr
    canvas.height = H * dpr
    Object.assign(canvas.style, {
      position: 'fixed', inset: '0', width: '100%', height: '100%',
      pointerEvents: 'none', zIndex: '9999',
    })
    document.body.appendChild(canvas)
    const ctx = canvas.getContext('2d')
    ctx.scale(dpr, dpr)

    const cx = W / 2
    const cy = H * originY
    const parts = Array.from({ length: count }, () => {
      const angle = Math.random() * Math.PI * 2
      const speed = 4 + Math.random() * 7
      return {
        x: cx, y: cy,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 4,
        size: 5 + Math.random() * 6,
        color: CONFETTI_COLORS[(Math.random() * CONFETTI_COLORS.length) | 0],
        rot: Math.random() * Math.PI,
        vr: (Math.random() - 0.5) * 0.4,
        life: 1,
      }
    })

    let frame = 0
    const maxFrames = 90
    function tick() {
      ctx.clearRect(0, 0, W, H)
      parts.forEach(p => {
        p.vy += 0.22          // gravity
        p.vx *= 0.99
        p.x += p.vx
        p.y += p.vy
        p.rot += p.vr
        p.life = 1 - frame / maxFrames
        ctx.save()
        ctx.globalAlpha = Math.max(0, p.life)
        ctx.translate(p.x, p.y)
        ctx.rotate(p.rot)
        ctx.fillStyle = p.color
        ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.6)
        ctx.restore()
      })
      frame++
      if (frame < maxFrames) {
        requestAnimationFrame(tick)
      } else {
        canvas.remove()
      }
    }
    requestAnimationFrame(tick)
  } catch {}
}

// Big win — correct answer, milestone, etc.
export function celebrate({ confetti = true } = {}) {
  playTones([660, 880, 1180], { duration: 0.1, gain: 0.05 })
  vibrate([0, 20, 40, 30])
  if (confetti) confettiBurst()
}

// Gentle negative feedback — wrong answer.
export function feedbackWrong() {
  playTones([220, 160], { duration: 0.12, gain: 0.05, type: 'triangle' })
  vibrate(30)
}
