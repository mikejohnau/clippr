import { useRef, useState, useEffect } from 'react'
import type { CSSProperties } from 'react'

interface Segment {
  start: number
  end: number
  mute: boolean
  label: string
  title: string
  template: string
  font_family: string
  font_size: number
  font_color: string
  aspect_ratio: string
}

const TEMPLATES = [
  { id: 'none', name: 'No overlay' },
  { id: 'bold-bottom', name: 'Bold Caption (Bottom)' },
  { id: 'lower-third', name: 'Lower Third' },
  { id: 'top-banner', name: 'Top Banner' },
]

const FONTS = [
  { id: 'sans-bold', name: 'Sans Bold', css: '"Helvetica Neue", Arial, sans-serif', weight: 800 },
  { id: 'sans-regular', name: 'Sans Regular', css: '"Helvetica Neue", Arial, sans-serif', weight: 400 },
  { id: 'serif-bold', name: 'Serif Bold', css: 'Georgia, "Times New Roman", serif', weight: 800 },
  { id: 'mono-bold', name: 'Mono Bold', css: '"Courier New", Menlo, monospace', weight: 800 },
]

const TEMPLATE_DEFAULT_SIZE: Record<string, number> = {
  'bold-bottom': 54,
  'lower-third': 38,
  'top-banner': 42,
}

const ASPECT_RATIOS = [
  { id: 'original', name: 'Original', ratio: null },
  { id: '9:16', name: '9:16 — Shorts / Reels / TikTok', ratio: 9 / 16 },
  { id: '1:1', name: '1:1 — Square', ratio: 1 },
  { id: '4:5', name: '4:5 — Instagram feed', ratio: 4 / 5 },
  { id: '16:9', name: '16:9 — Landscape', ratio: 16 / 9 },
]

interface OutputClip {
  output_id: string | null
  label: string
  filename?: string
  size?: number
  error?: string
}

function fmt(s: number) {
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = Math.floor(s % 60)
  const ms = Math.round((s % 1) * 10)
  if (h > 0) return `${h}:${String(m).padStart(2,'0')}:${String(sec).padStart(2,'0')}.${ms}`
  return `${m}:${String(sec).padStart(2,'0')}.${ms}`
}

function fmtSize(bytes: number) {
  if (bytes > 1_000_000) return `${(bytes / 1_000_000).toFixed(1)} MB`
  return `${Math.round(bytes / 1000)} KB`
}

function parseTime(s: string): number {
  // accepts m:ss.d or ss.d or plain seconds
  const parts = s.split(':')
  if (parts.length === 2) return parseFloat(parts[0]) * 60 + parseFloat(parts[1])
  if (parts.length === 3) return parseFloat(parts[0]) * 3600 + parseFloat(parts[1]) * 60 + parseFloat(parts[2])
  return parseFloat(s) || 0
}

export default function EditModal({ jobId, title, onClose }: {
  jobId: string
  title: string
  onClose: () => void
}) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [duration, setDuration] = useState(0)
  const [currentTime, setCurrentTime] = useState(0)
  const [videoNativeSize, setVideoNativeSize] = useState({ w: 0, h: 0 })

  // Current segment being built
  const [start, setStart] = useState(0)
  const [end, setEnd] = useState(0)
  const [mute, setMute] = useState(false)
  const [label, setLabel] = useState('')
  const [overlayTitle, setOverlayTitle] = useState('')
  const [template, setTemplate] = useState('none')
  const [fontFamily, setFontFamily] = useState('sans-bold')
  const [fontSize, setFontSize] = useState(0)   // 0 = template default
  const [fontColor, setFontColor] = useState('#ffffff')
  const [aspectRatio, setAspectRatio] = useState('original')
  const [startInput, setStartInput] = useState('0:00.0')
  const [endInput, setEndInput] = useState('0:00.0')

  // Queue of segments to extract
  const [segments, setSegments] = useState<Segment[]>([])

  // Extraction state
  const [extracting, setExtracting] = useState(false)
  const [outputs, setOutputs] = useState<OutputClip[]>([])

  const streamUrl = `/api/edit/workspace/${jobId}/stream`

  useEffect(() => {
    fetch(`/api/edit/workspace/${jobId}/info`)
      .then(r => r.json())
      .then(d => {
        setDuration(d.duration || 0)
        setEnd(d.duration || 0)
        setEndInput(fmt(d.duration || 0))
      })
      .catch(() => {})
  }, [jobId])

  function onTimeUpdate() {
    if (!videoRef.current) return
    setCurrentTime(videoRef.current.currentTime)
  }

  function markIn() {
    const t = videoRef.current?.currentTime ?? 0
    setStart(t)
    setStartInput(fmt(t))
  }

  function markOut() {
    const t = videoRef.current?.currentTime ?? 0
    setEnd(t)
    setEndInput(fmt(t))
  }

  function previewSegment() {
    if (!videoRef.current) return
    videoRef.current.currentTime = start
    videoRef.current.play()
    const check = setInterval(() => {
      if (!videoRef.current || videoRef.current.currentTime >= end) {
        videoRef.current?.pause()
        clearInterval(check)
      }
    }, 100)
  }

  function addSegment() {
    if (end <= start) return
    setSegments(prev => [...prev, {
      start, end, mute,
      label: label || `clip ${prev.length + 1}`,
      title: overlayTitle,
      template,
      font_family: fontFamily,
      font_size: fontSize,
      font_color: fontColor,
      aspect_ratio: aspectRatio,
    }])
    setLabel('')
    setOverlayTitle('')
    setTemplate('none')
    setFontFamily('sans-bold')
    setFontSize(0)
    setFontColor('#ffffff')
    setAspectRatio('original')
  }

  function removeSegment(i: number) {
    setSegments(prev => prev.filter((_, idx) => idx !== i))
  }

  async function extractAll() {
    if (!segments.length) return
    setExtracting(true)
    setOutputs([])
    try {
      const res = await fetch(`/api/edit/workspace/${jobId}/extract`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ segments }),
      })
      const data: OutputClip[] = await res.json()
      setOutputs(data)
    } catch (e: any) {
      setOutputs([{ output_id: null, label: 'Error', error: e.message }])
    } finally {
      setExtracting(false)
    }
  }

  async function deleteSource() {
    if (!confirm('Delete the source file and all extracted clips?')) return
    await fetch(`/api/edit/workspace/${jobId}`, { method: 'DELETE' })
    onClose()
  }

  function downloadOutput(oid: string, filename: string) {
    const a = document.createElement('a')
    a.href = `/api/edit/outputs/${oid}/serve`
    a.download = filename
    document.body.appendChild(a); a.click(); document.body.removeChild(a)
  }

  const canAdd = end > start

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 1200, background: 'rgba(0,0,0,0.85)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div onClick={e => e.stopPropagation()} style={{
        background: 'var(--surface)', borderRadius: 14, width: '100%', maxWidth: 900,
        maxHeight: '92vh', display: 'flex', flexDirection: 'column',
        boxShadow: '0 24px 80px rgba(0,0,0,0.6)',
      }}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
          <div>
            <div style={{ fontWeight: 700, fontSize: 15 }}>✂ Edit Clip</div>
            <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2, overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis', maxWidth: 600 }}>{title}</div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={deleteSource} style={{ background: 'none', color: '#ef4444', border: '1px solid #ef4444', fontSize: 12, padding: '5px 12px', borderRadius: 7 }}>
              🗑 Delete source
            </button>
            <button onClick={onClose} style={{ background: 'none', color: 'var(--muted)', fontSize: 20, padding: '2px 8px', lineHeight: 1 }}>✕</button>
          </div>
        </div>

        <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>

          {/* Left — video + controls */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: '16px 16px 16px 20px', gap: 12, overflow: 'auto', minWidth: 0 }}>

            {/* Video player */}
            <div style={{ background: '#000', borderRadius: 10, overflow: 'hidden', position: 'relative' }}>
              <video
                ref={videoRef}
                src={streamUrl}
                controls
                onTimeUpdate={onTimeUpdate}
                onLoadedMetadata={() => {
                  if (!videoRef.current) return
                  const d = videoRef.current.duration
                  setDuration(d)
                  if (end === 0) { setEnd(d); setEndInput(fmt(d)) }
                  setVideoNativeSize({ w: videoRef.current.videoWidth, h: videoRef.current.videoHeight })
                }}
                style={{ width: '100%', display: 'block', maxHeight: 340 }}
              />

              {/* Crop preview — dims the area that will be cut away for the chosen aspect ratio */}
              {aspectRatio !== 'original' && videoNativeSize.w > 0 && (() => {
                const target = ASPECT_RATIOS.find(a => a.id === aspectRatio)?.ratio
                if (!target) return null
                const nativeRatio = videoNativeSize.w / videoNativeSize.h
                // target is stored as w/h already (e.g. 9/16); compare against native w/h
                if (nativeRatio > target) {
                  // crop left/right
                  const keepPct = (target / nativeRatio) * 100
                  const sidePct = (100 - keepPct) / 2
                  return (
                    <>
                      <div style={{ position: 'absolute', top: 0, bottom: 0, left: 0, width: `${sidePct}%`, background: 'rgba(0,0,0,0.65)', pointerEvents: 'none' }} />
                      <div style={{ position: 'absolute', top: 0, bottom: 0, right: 0, width: `${sidePct}%`, background: 'rgba(0,0,0,0.65)', pointerEvents: 'none' }} />
                    </>
                  )
                }
                // crop top/bottom
                const keepPct = (nativeRatio / target) * 100
                const sidePct = (100 - keepPct) / 2
                return (
                  <>
                    <div style={{ position: 'absolute', left: 0, right: 0, top: 0, height: `${sidePct}%`, background: 'rgba(0,0,0,0.65)', pointerEvents: 'none' }} />
                    <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: `${sidePct}%`, background: 'rgba(0,0,0,0.65)', pointerEvents: 'none' }} />
                  </>
                )
              })()}

              {/* Rough overlay preview — approximates the burned-in ffmpeg template.
                  Scales the chosen font size down from "pixels on the real video"
                  to "pixels in this ~340px-tall preview player". */}
              {overlayTitle && template !== 'none' && (() => {
                const font = FONTS.find(f => f.id === fontFamily) || FONTS[0]
                const realSize = fontSize || TEMPLATE_DEFAULT_SIZE[template] || 42
                const previewScale = videoRef.current?.videoHeight
                  ? (videoRef.current.clientHeight / videoRef.current.videoHeight)
                  : 0.4
                const previewSize = Math.max(10, Math.round(realSize * previewScale))
                const textStyle: CSSProperties = {
                  color: fontColor,
                  fontFamily: font.css,
                  fontWeight: font.weight,
                  fontSize: previewSize,
                }
                if (template === 'bold-bottom') {
                  return (
                    <div style={{ position: 'absolute', left: 0, right: 0, bottom: 24, textAlign: 'center', pointerEvents: 'none' }}>
                      <span style={{ ...textStyle, textShadow: '0 0 6px #000, 0 0 6px #000, 0 0 6px #000' }}>{overlayTitle}</span>
                    </div>
                  )
                }
                if (template === 'lower-third') {
                  return (
                    <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: '17%', background: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: 'center', paddingLeft: 16, pointerEvents: 'none' }}>
                      <span style={textStyle}>{overlayTitle}</span>
                    </div>
                  )
                }
                if (template === 'top-banner') {
                  return (
                    <div style={{ position: 'absolute', left: 0, right: 0, top: 0, height: 32, background: 'rgba(0,0,0,0.65)', display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}>
                      <span style={textStyle}>{overlayTitle}</span>
                    </div>
                  )
                }
                return null
              })()}
            </div>

            {/* Time display */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, fontSize: 12, color: 'var(--muted)' }}>
              <span>Current: <strong style={{ color: 'var(--text)', fontFamily: 'monospace' }}>{fmt(currentTime)}</strong></span>
              <span style={{ opacity: 0.4 }}>•</span>
              <span>Duration: <strong style={{ color: 'var(--text)', fontFamily: 'monospace' }}>{fmt(duration)}</strong></span>
            </div>

            {/* In / Out markers */}
            <div style={{ background: 'var(--surface2)', borderRadius: 10, padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>Trim points</div>

              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <button onClick={markIn} style={{ background: 'var(--accent)', color: '#fff', fontSize: 12, fontWeight: 700, padding: '6px 12px', borderRadius: 7, whiteSpace: 'nowrap' }}>
                  ▶ Mark In
                </button>
                <input value={startInput} onChange={e => { setStartInput(e.target.value); setStart(parseTime(e.target.value)) }}
                  style={{ flex: 1, fontFamily: 'monospace', fontSize: 13, height: 34, textAlign: 'center' }} placeholder="0:00.0" />
                <span style={{ color: 'var(--muted)', fontSize: 12, whiteSpace: 'nowrap' }}>Start</span>
              </div>

              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <button onClick={markOut} style={{ background: '#7c3aed', color: '#fff', fontSize: 12, fontWeight: 700, padding: '6px 12px', borderRadius: 7, whiteSpace: 'nowrap' }}>
                  ⏸ Mark Out
                </button>
                <input value={endInput} onChange={e => { setEndInput(e.target.value); setEnd(parseTime(e.target.value)) }}
                  style={{ flex: 1, fontFamily: 'monospace', fontSize: 13, height: 34, textAlign: 'center' }} placeholder="0:00.0" />
                <span style={{ color: 'var(--muted)', fontSize: 12, whiteSpace: 'nowrap' }}>End</span>
              </div>

              {/* Visual range indicator */}
              {duration > 0 && (
                <div style={{ position: 'relative', height: 8, background: 'var(--border)', borderRadius: 99, overflow: 'hidden' }}>
                  <div style={{
                    position: 'absolute', top: 0, bottom: 0,
                    left: `${(start / duration) * 100}%`,
                    width: `${((end - start) / duration) * 100}%`,
                    background: 'var(--accent)', borderRadius: 99,
                  }} />
                  {/* Playhead */}
                  <div style={{
                    position: 'absolute', top: -2, bottom: -2, width: 3,
                    left: `${(currentTime / duration) * 100}%`,
                    background: '#f59e0b', borderRadius: 99,
                  }} />
                </div>
              )}

              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                {end > start && (
                  <span style={{ fontSize: 11, color: 'var(--muted)' }}>
                    {fmt(end - start)} selected
                  </span>
                )}
                <label style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, color: 'var(--muted)', cursor: 'pointer', marginLeft: 'auto' }}>
                  <input type="checkbox" checked={mute} onChange={e => setMute(e.target.checked)} style={{ width: 'auto' }} />
                  Mute audio
                </label>
                <button onClick={previewSegment} disabled={!canAdd} style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)', fontSize: 12, padding: '5px 10px', borderRadius: 7 }}>
                  Preview
                </button>
              </div>
            </div>

            {/* Overlay template */}
            <div style={{ background: 'var(--surface2)', borderRadius: 10, padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>Title overlay (optional)</div>
              <div style={{ display: 'flex', gap: 8 }}>
                <select value={template} onChange={e => setTemplate(e.target.value)}
                  style={{ height: 34, fontSize: 12, borderRadius: 7, flexShrink: 0, width: 160 }}>
                  {TEMPLATES.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
                <input value={overlayTitle} onChange={e => setOverlayTitle(e.target.value)}
                  disabled={template === 'none'}
                  placeholder="Overlay text…"
                  style={{ flex: 1, height: 34, fontSize: 13 }} />
              </div>

              {template !== 'none' && (
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <select value={fontFamily} onChange={e => setFontFamily(e.target.value)}
                    style={{ height: 32, fontSize: 12, borderRadius: 7, width: 130, flexShrink: 0 }}>
                    {FONTS.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
                  </select>

                  <input type="number" min={10} max={120}
                    value={fontSize || TEMPLATE_DEFAULT_SIZE[template] || 42}
                    onChange={e => setFontSize(parseInt(e.target.value, 10) || 0)}
                    title="Font size (px)"
                    style={{ width: 60, height: 32, fontSize: 12, textAlign: 'center' }} />

                  <input type="color" value={fontColor} onChange={e => setFontColor(e.target.value)}
                    title="Font color"
                    style={{ width: 36, height: 32, padding: 2, border: '1px solid var(--border)', borderRadius: 7, background: 'none', cursor: 'pointer' }} />

                  <span style={{ fontSize: 11, color: 'var(--muted)' }}>Font, size, colour</span>
                </div>
              )}

              {template !== 'none' && (
                <div style={{ fontSize: 10, color: 'var(--muted)' }}>
                  Burned in during extraction — this clip will re-encode (slower than copy-only trims).
                </div>
              )}
            </div>

            {/* Aspect ratio crop */}
            <div style={{ background: 'var(--surface2)', borderRadius: 10, padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>Aspect ratio (optional)</div>
              <select value={aspectRatio} onChange={e => setAspectRatio(e.target.value)}
                style={{ height: 34, fontSize: 12, borderRadius: 7 }}>
                {ASPECT_RATIOS.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
              {aspectRatio !== 'original' && (
                <div style={{ fontSize: 10, color: 'var(--muted)' }}>
                  Centered crop — the dimmed areas above will be cut. This clip will re-encode.
                </div>
              )}
            </div>

            {/* Label + add */}
            <div style={{ display: 'flex', gap: 8 }}>
              <input value={label} onChange={e => setLabel(e.target.value)} placeholder="Clip label (optional)…"
                style={{ flex: 1, height: 36, fontSize: 13 }}
                onKeyDown={e => e.key === 'Enter' && canAdd && addSegment()} />
              <button onClick={addSegment} disabled={!canAdd} style={{
                background: canAdd ? 'var(--accent)' : 'var(--surface2)',
                color: canAdd ? '#fff' : 'var(--muted)',
                fontWeight: 700, fontSize: 13, padding: '0 16px', height: 36, borderRadius: 8, whiteSpace: 'nowrap',
              }}>
                + Add to queue
              </button>
            </div>
          </div>

          {/* Right — queue + outputs */}
          <div style={{ width: 280, flexShrink: 0, borderLeft: '1px solid var(--border)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

            {/* Queue */}
            <div style={{ flex: 1, overflow: 'auto', padding: '16px 16px 8px' }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 10 }}>
                Queue ({segments.length})
              </div>

              {segments.length === 0 && (
                <div style={{ color: 'var(--muted)', fontSize: 12, textAlign: 'center', padding: '24px 0' }}>
                  Mark in/out points then<br/>click "Add to queue"
                </div>
              )}

              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {segments.map((seg, i) => (
                  <div key={i} style={{ background: 'var(--surface2)', borderRadius: 8, padding: '9px 12px', fontSize: 12 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                      <span style={{ fontWeight: 600, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 160 }}>{seg.label}</span>
                      <button onClick={() => removeSegment(i)} style={{ background: 'none', color: '#ef4444', fontSize: 13, padding: '0 2px', lineHeight: 1 }}>✕</button>
                    </div>
                    <div style={{ color: 'var(--muted)', fontFamily: 'monospace', fontSize: 11 }}>
                      {fmt(seg.start)} → {fmt(seg.end)}
                      <span style={{ marginLeft: 6 }}>({fmt(seg.end - seg.start)})</span>
                    </div>
                    {seg.mute && <div style={{ color: '#f59e0b', fontSize: 10, marginTop: 2 }}>🔇 muted</div>}
                    {seg.template !== 'none' && seg.title && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 5, color: 'var(--accent)', fontSize: 10, marginTop: 2, overflow: 'hidden' }}>
                        <span style={{ width: 8, height: 8, borderRadius: '50%', background: seg.font_color, border: '1px solid var(--border)', flexShrink: 0 }} />
                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {TEMPLATES.find(t => t.id === seg.template)?.name}: "{seg.title}"
                        </span>
                      </div>
                    )}
                    {seg.aspect_ratio !== 'original' && (
                      <div style={{ color: 'var(--muted)', fontSize: 10, marginTop: 2 }}>
                        ▭ {seg.aspect_ratio}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Extract button */}
            <div style={{ padding: '10px 16px', borderTop: '1px solid var(--border)', flexShrink: 0 }}>
              <button onClick={extractAll} disabled={segments.length === 0 || extracting} style={{
                width: '100%', background: segments.length && !extracting ? 'linear-gradient(135deg,#16a34a,#15803d)' : 'var(--surface2)',
                color: segments.length && !extracting ? '#fff' : 'var(--muted)',
                fontWeight: 700, fontSize: 13, padding: '10px 0', borderRadius: 8,
              }}>
                {extracting ? 'Extracting…' : `✂ Extract ${segments.length} clip${segments.length !== 1 ? 's' : ''}`}
              </button>
            </div>

            {/* Outputs */}
            {outputs.length > 0 && (
              <div style={{ borderTop: '1px solid var(--border)', padding: '12px 16px', overflow: 'auto', flexShrink: 0, maxHeight: 260 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 8 }}>
                  Extracted clips
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {outputs.map((out, i) => (
                    <div key={i} style={{ background: out.error ? '#fef2f2' : '#f0fdf4', border: `1px solid ${out.error ? '#fecaca' : '#bbf7d0'}`, borderRadius: 8, padding: '8px 12px', fontSize: 12 }}>
                      <div style={{ fontWeight: 600, color: out.error ? 'var(--error)' : 'var(--success)', marginBottom: 3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {out.error ? '✗ ' : '✓ '}{out.label}
                      </div>
                      {out.error ? (
                        <div style={{ color: 'var(--error)', fontSize: 10, wordBreak: 'break-all' }}>{out.error}</div>
                      ) : (
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                          <span style={{ color: '#15803d', fontSize: 11 }}>{out.size ? fmtSize(out.size) : ''}</span>
                          <button onClick={() => downloadOutput(out.output_id!, out.filename!)}
                            style={{ background: '#16a34a', color: '#fff', fontSize: 11, fontWeight: 700, padding: '4px 10px', borderRadius: 6 }}>
                            ↓ Download
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
