import { supabase } from './supabase'

// Voice capture for the AI Coach: record a spoken hand, send the audio to the
// transcribe endpoint (gemini-2.5-flash) and get back text with cards normalised to
// notation — which then flows through the existing typed-hand pipeline.

// Pick a recording container the browser supports, preferring ones Gemini transcribes
// reliably. Chrome/Android → webm/opus; Firefox → ogg/opus; iOS Safari → mp4/aac.
const PREFERRED = [
  'audio/mp4',
  'audio/ogg;codecs=opus',
  'audio/webm;codecs=opus',
  'audio/webm',
]
function pickMime() {
  if (typeof MediaRecorder === 'undefined') return ''
  for (const m of PREFERRED) {
    try { if (MediaRecorder.isTypeSupported(m)) return m } catch {}
  }
  return '' // let the browser choose its default
}

// Gemini's inline_data wants a bare mime type — drop the ";codecs=…" suffix.
function baseMime(m) {
  return (m || 'audio/webm').split(';')[0].trim()
}

export function isRecordingSupported() {
  return typeof navigator !== 'undefined'
    && !!navigator.mediaDevices?.getUserMedia
    && typeof MediaRecorder !== 'undefined'
}

// Start recording from the mic. Returns a controller:
//   stop()   → Promise<{ blob, mime }>  (also releases the mic)
//   cancel() → discard + release the mic
export async function startRecording() {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
  const mimeType = pickMime()
  const rec = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream)
  const chunks = []
  rec.ondataavailable = e => { if (e.data && e.data.size > 0) chunks.push(e.data) }
  rec.start()

  const release = () => stream.getTracks().forEach(t => t.stop())
  return {
    stop() {
      return new Promise((resolve, reject) => {
        rec.onstop = () => {
          release()
          const type = rec.mimeType || mimeType || 'audio/webm'
          resolve({ blob: new Blob(chunks, { type }), mime: baseMime(type) })
        }
        rec.onerror = err => { release(); reject(err) }
        try { rec.stop() } catch (e) { release(); reject(e) }
      })
    },
    cancel() {
      try { rec.stop() } catch {}
      release()
    },
  }
}

// Blob → base64 (without the "data:…;base64," prefix).
export function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const fr = new FileReader()
    fr.onload = () => {
      const s = String(fr.result || '')
      resolve(s.slice(s.indexOf(',') + 1))
    }
    fr.onerror = reject
    fr.readAsDataURL(blob)
  })
}

// Send recorded audio to the transcribe endpoint → normalised-notation transcript.
// Throws on failure so the caller can surface the message.
export async function transcribeAudio(blob, mime) {
  const { data: { session } } = await supabase.auth.getSession()
  const token = session?.access_token
  if (!token) throw new Error('Please sign in first.')

  const base64 = await blobToBase64(blob)
  const res = await fetch('/api/coach', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({
      request_type: 'transcribe',
      audio: base64,
      audioMime: mime || baseMime(blob.type) || 'audio/webm',
    }),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.error || 'Transcription failed.')
  return (data.transcript || '').trim()
}
