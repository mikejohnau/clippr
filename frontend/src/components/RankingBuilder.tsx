import { useEffect, useRef, useState } from 'react'
import { ProjectClip } from '../types'

interface ItemState {
  jobId: string | null
  downloading: boolean
  error: string | null
  start: number
  end: number
  duration: number
  mute: boolean
  label: string
}

// ── Persistence — remember every field across refreshes, scoped per project ──

interface PersistedState {
  order: number[]
  items: Record<number, ItemState>
  aspectRatio: string
  fontFamily: string
  fontSize: number
  fontColor: string
  position: string
  titleText: string
  titleTemplate: string
  titleFontFamily: string
  titleFontSize: number
  titleFontColor: string
  titleBgColor: string
  titleBgEnabled: boolean
  titleStrokeWidth: number
  titleStrokeColor: string
  titleStrokeColorEnabled: boolean
  ctaText: string
  ctaDuration: number
  ctaMoments: string[]
  ctaPosition: string
  ctaAnimation: string
  ctaTransition: number
  ctaFontFamily: string
  ctaFontSize: number
  ctaFontColor: string
  ctaBgColor: string
  ctaBgEnabled: boolean
}

function storageKey(projectId?: string) {
  return `clippr_ranking_v1_${projectId || 'default'}`
}

function loadPersisted(projectId?: string): Partial<PersistedState> | null {
  try {
    const raw = localStorage.getItem(storageKey(projectId))
    if (!raw) return null
    const parsed = JSON.parse(raw)
    // never resurrect a stuck "downloading"/error state from a previous session
    if (parsed.items) {
      for (const id of Object.keys(parsed.items)) {
        parsed.items[id].downloading = false
        parsed.items[id].error = null
      }
    }
    return parsed
  } catch {
    return null
  }
}

const FONTS = [
  { id: 'sans-bold', name: 'Sans Bold' },
  { id: 'sans-regular', name: 'Sans Regular' },
  { id: 'serif-bold', name: 'Serif Bold' },
  { id: 'mono-bold', name: 'Mono Bold' },
]

const ASPECT_RATIOS = [
  { id: '9:16', name: '9:16 — Shorts / Reels / TikTok' },
  { id: '1:1', name: '1:1 — Square' },
  { id: '4:5', name: '4:5 — Instagram feed' },
  { id: '16:9', name: '16:9 — Landscape' },
]

const POSITIONS = [
  { id: 'top-left', name: 'Top left' },
  { id: 'top-center', name: 'Top center' },
  { id: 'top-right', name: 'Top right' },
  { id: 'bottom-left', name: 'Bottom left' },
  { id: 'bottom-center', name: 'Bottom center' },
  { id: 'bottom-right', name: 'Bottom right' },
]

const CTA_POSITIONS = [...POSITIONS, { id: 'center', name: 'Center' }]

const CTA_ANIMATIONS = [
  { id: 'none', name: 'None (just appears)' },
  { id: 'fade', name: 'Fade in/out' },
  { id: 'slide', name: 'Slide in, fade out' },
]

const CTA_MOMENTS = [
  { id: 'start', name: 'Start' },
  { id: 'middle', name: 'Middle' },
  { id: 'end', name: 'End' },
]

const TITLE_TEMPLATES = [
  { id: 'none', name: 'No title overlay' },
  { id: 'bold-bottom', name: 'Bold Caption (Bottom)' },
  { id: 'lower-third', name: 'Lower Third' },
  { id: 'top-banner', name: 'Top Banner' },
]

function fmt(s: number) {
  const m = Math.floor(s / 60)
  const sec = (s % 60).toFixed(1)
  return `${m}:${sec.padStart(4, '0')}`
}

// ── Trim editor modal — one clip at a time, in a much bigger player ─────────

function TrimEditorModal({ title, jobId, item, onUpdate, onClose }: {
  title: string
  jobId: string
  item: ItemState
  onUpdate: (patch: Partial<ItemState>) => void
  onClose: () => void
}) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [currentTime, setCurrentTime] = useState(0)

  function markIn() {
    if (!videoRef.current) return
    onUpdate({ start: videoRef.current.currentTime })
  }

  function markOut() {
    if (!videoRef.current) return
    onUpdate({ end: videoRef.current.currentTime })
  }

  function previewSegment() {
    const v = videoRef.current
    if (!v) return
    v.currentTime = item.start
    v.play()
    const check = setInterval(() => {
      if (!v || v.currentTime >= item.end) {
        v?.pause()
        clearInterval(check)
      }
    }, 100)
  }

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 1300, background: 'rgba(0,0,0,0.85)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div onClick={e => e.stopPropagation()} style={{
        background: 'var(--surface)', borderRadius: 14, width: '100%', maxWidth: 720,
        maxHeight: '92vh', overflowY: 'auto', boxShadow: '0 24px 80px rgba(0,0,0,0.6)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px', borderBottom: '1px solid var(--border)' }}>
          <div style={{ fontSize: 14, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 600 }}>{title}</div>
          <button onClick={onClose} style={{ background: 'none', color: 'var(--muted)', fontSize: 20, padding: '2px 8px', lineHeight: 1 }}>✕</button>
        </div>

        <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ background: '#000', borderRadius: 10, overflow: 'hidden' }}>
            <video ref={videoRef} src={`/api/edit/workspace/${jobId}/stream`} controls
              onTimeUpdate={() => setCurrentTime(videoRef.current?.currentTime || 0)}
              style={{ width: '100%', display: 'block', maxHeight: 440 }} />
          </div>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, fontSize: 12, color: 'var(--muted)' }}>
            <span>Current: <strong style={{ color: 'var(--text)', fontFamily: 'monospace' }}>{fmt(currentTime)}</strong></span>
            <span style={{ opacity: 0.4 }}>•</span>
            <span>Duration: <strong style={{ color: 'var(--text)', fontFamily: 'monospace' }}>{fmt(item.duration)}</strong></span>
          </div>

          <div style={{ background: 'var(--surface2)', borderRadius: 10, padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>Trim points</div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <button onClick={markIn} style={{ background: 'var(--accent)', color: '#fff', fontWeight: 700, fontSize: 12, padding: '6px 12px', borderRadius: 7, whiteSpace: 'nowrap' }}>
                ▶ Mark In
              </button>
              <input type="number" min={0} max={item.duration} step={0.1} value={item.start}
                onChange={e => onUpdate({ start: parseFloat(e.target.value) || 0 })}
                style={{ flex: 1, fontFamily: 'monospace', fontSize: 13, height: 34, textAlign: 'center' }} />
              <span style={{ color: 'var(--muted)', fontSize: 12 }}>Start</span>
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <button onClick={markOut} style={{ background: 'var(--gold)', color: 'var(--sidebar)', fontWeight: 700, fontSize: 12, padding: '6px 12px', borderRadius: 7, whiteSpace: 'nowrap' }}>
                ⏸ Mark Out
              </button>
              <input type="number" min={0} max={item.duration} step={0.1} value={item.end}
                onChange={e => onUpdate({ end: parseFloat(e.target.value) || 0 })}
                style={{ flex: 1, fontFamily: 'monospace', fontSize: 13, height: 34, textAlign: 'center' }} />
              <span style={{ color: 'var(--muted)', fontSize: 12 }}>End</span>
            </div>

            {item.duration > 0 && (
              <div style={{ position: 'relative', height: 8, background: 'var(--border)', borderRadius: 99, overflow: 'hidden' }}>
                <div style={{
                  position: 'absolute', top: 0, bottom: 0,
                  left: `${(item.start / item.duration) * 100}%`,
                  width: `${((item.end - item.start) / item.duration) * 100}%`,
                  background: 'var(--accent)', borderRadius: 99,
                }} />
                <div style={{
                  position: 'absolute', top: -2, bottom: -2, width: 3,
                  left: `${(currentTime / item.duration) * 100}%`,
                  background: 'var(--gold)', borderRadius: 99,
                }} />
              </div>
            )}

            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              {item.end > item.start && (
                <span style={{ fontSize: 11, color: 'var(--muted)' }}>{fmt(item.end - item.start)} selected</span>
              )}
              <label style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, color: 'var(--muted)', cursor: 'pointer', marginLeft: 'auto' }}>
                <input type="checkbox" checked={item.mute} onChange={e => onUpdate({ mute: e.target.checked })} style={{ width: 'auto' }} />
                Mute audio
              </label>
              <button onClick={previewSegment} disabled={item.end <= item.start}
                style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)', fontSize: 12, padding: '5px 10px', borderRadius: 7 }}>
                Preview
              </button>
            </div>
          </div>

          <input value={item.label} onChange={e => onUpdate({ label: e.target.value })}
            placeholder="Rank label (optional, defaults to the clip's position number)…"
            style={{ height: 38, fontSize: 13 }} />

          <button onClick={onClose} style={{ background: 'var(--accent)', color: '#fff', fontWeight: 700, fontSize: 13, padding: '10px 0', borderRadius: 8 }}>
            Done
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Main builder ─────────────────────────────────────────────────────────────

export default function RankingBuilder({ projectClips, onRemove, projectName, projectId }: {
  projectClips: ProjectClip[]
  onRemove: (rowId: number) => void
  projectName?: string
  projectId?: string
}) {
  const [saved] = useState(() => loadPersisted(projectId))

  // Order of row_ids — defaults to project order, reorderable, synced when clips are added/removed elsewhere
  const [order, setOrder] = useState<number[]>(saved?.order ?? [])
  const [items, setItems] = useState<Record<number, ItemState>>(saved?.items ?? {})
  const [editingRowId, setEditingRowId] = useState<number | null>(null)
  const [aspectRatio, setAspectRatio] = useState(saved?.aspectRatio ?? '9:16')
  const [fontFamily, setFontFamily] = useState(saved?.fontFamily ?? 'sans-bold')
  const [fontSize, setFontSize] = useState(saved?.fontSize ?? 90)
  const [fontColor, setFontColor] = useState(saved?.fontColor ?? '#ffffff')
  const [position, setPosition] = useState(saved?.position ?? 'top-left')
  const [titleText, setTitleText] = useState(saved?.titleText ?? '')
  const [titleTemplate, setTitleTemplate] = useState(saved?.titleTemplate ?? 'none')
  const [titleFontFamily, setTitleFontFamily] = useState(saved?.titleFontFamily ?? 'sans-bold')
  const [titleFontSize, setTitleFontSize] = useState(saved?.titleFontSize ?? 0)
  const [titleFontColor, setTitleFontColor] = useState(saved?.titleFontColor ?? '#ffffff')
  const [titleBgColor, setTitleBgColor] = useState(saved?.titleBgColor ?? '#000000')
  const [titleBgEnabled, setTitleBgEnabled] = useState(saved?.titleBgEnabled ?? false)
  const [titleStrokeWidth, setTitleStrokeWidth] = useState(saved?.titleStrokeWidth ?? -1)   // -1 = template default
  const [titleStrokeColor, setTitleStrokeColor] = useState(saved?.titleStrokeColor ?? '#000000')
  const [titleStrokeColorEnabled, setTitleStrokeColorEnabled] = useState(saved?.titleStrokeColorEnabled ?? false)
  const [ctaText, setCtaText] = useState(saved?.ctaText ?? '')
  const [ctaDuration, setCtaDuration] = useState(saved?.ctaDuration ?? 3)
  const [ctaMoments, setCtaMoments] = useState<string[]>(saved?.ctaMoments ?? ['end'])
  const [ctaPosition, setCtaPosition] = useState(saved?.ctaPosition ?? 'bottom-center')
  const [ctaAnimation, setCtaAnimation] = useState(saved?.ctaAnimation ?? 'fade')
  const [ctaTransition, setCtaTransition] = useState(saved?.ctaTransition ?? 0.5)
  const [ctaFontFamily, setCtaFontFamily] = useState(saved?.ctaFontFamily ?? 'sans-bold')
  const [ctaFontSize, setCtaFontSize] = useState(saved?.ctaFontSize ?? 0)
  const [ctaFontColor, setCtaFontColor] = useState(saved?.ctaFontColor ?? '#ffffff')
  const [ctaBgColor, setCtaBgColor] = useState(saved?.ctaBgColor ?? '#000000')
  const [ctaBgEnabled, setCtaBgEnabled] = useState(saved?.ctaBgEnabled ?? true)
  const [building, setBuilding] = useState(false)
  const [buildProgress, setBuildProgress] = useState(0)
  const [buildStep, setBuildStep] = useState('')
  const [result, setResult] = useState<{ output_id: string; filename: string } | null>(null)
  const [buildError, setBuildError] = useState('')

  // Keep order/items in sync with whatever clips are actually saved to the project
  useEffect(() => {
    const currentIds = projectClips.map(pc => pc.row_id)
    setOrder(prev => {
      const kept = prev.filter(id => currentIds.includes(id))
      const added = currentIds.filter(id => !kept.includes(id))
      return [...kept, ...added]
    })
    setItems(prev => {
      const next: Record<number, ItemState> = {}
      for (const id of currentIds) {
        next[id] = prev[id] || { jobId: null, downloading: false, error: null, start: 0, end: 0, duration: 0, mute: false, label: '' }
      }
      return next
    })
  }, [projectClips])

  // Persist every field to localStorage (per project) so a refresh doesn't
  // lose trim points, labels, or any of the title/CTA styling.
  useEffect(() => {
    const state: PersistedState = {
      order, items, aspectRatio, fontFamily, fontSize, fontColor, position,
      titleText, titleTemplate, titleFontFamily, titleFontSize, titleFontColor,
      titleBgColor, titleBgEnabled, titleStrokeWidth, titleStrokeColor, titleStrokeColorEnabled,
      ctaText, ctaDuration, ctaMoments, ctaPosition, ctaAnimation, ctaTransition,
      ctaFontFamily, ctaFontSize, ctaFontColor, ctaBgColor, ctaBgEnabled,
    }
    try {
      localStorage.setItem(storageKey(projectId), JSON.stringify(state))
    } catch {
      // localStorage can throw if full/unavailable (private browsing, quota) — non-critical, just skip
    }
  }, [
    projectId, order, items, aspectRatio, fontFamily, fontSize, fontColor, position,
    titleText, titleTemplate, titleFontFamily, titleFontSize, titleFontColor,
    titleBgColor, titleBgEnabled, titleStrokeWidth, titleStrokeColor, titleStrokeColorEnabled,
    ctaText, ctaDuration, ctaMoments, ctaPosition, ctaAnimation, ctaTransition,
    ctaFontFamily, ctaFontSize, ctaFontColor, ctaBgColor, ctaBgEnabled,
  ])

  function update(rowId: number, patch: Partial<ItemState>) {
    setItems(prev => ({ ...prev, [rowId]: { ...prev[rowId], ...patch } }))
  }

  async function prepare(pc: ProjectClip) {
    update(pc.row_id, { downloading: true, error: null })
    try {
      const res = await fetch('/api/download/', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: pc.clip.url, title: pc.clip.title }),
      })
      const data = await res.json()
      const jobId = data.job_id

      await new Promise<void>((resolve, reject) => {
        const iv = setInterval(async () => {
          const s = await fetch(`/api/download/${jobId}`).then(r => r.json())
          if (s.status === 'done') { clearInterval(iv); resolve() }
          else if (s.status === 'error') { clearInterval(iv); reject(new Error(s.error || 'Download failed')) }
        }, 1500)
      })

      const info = await fetch(`/api/edit/workspace/${jobId}/info`).then(r => r.json())
      update(pc.row_id, { jobId, downloading: false, end: info.duration || 0, duration: info.duration || 0 })
    } catch (e: any) {
      update(pc.row_id, { downloading: false, error: e.message || 'Failed' })
    }
  }

  function move(rowId: number, dir: -1 | 1) {
    setOrder(prev => {
      const i = prev.indexOf(rowId)
      const j = i + dir
      if (i < 0 || j < 0 || j >= prev.length) return prev
      const next = [...prev]
      ;[next[i], next[j]] = [next[j], next[i]]
      return next
    })
  }

  function toggleCtaMoment(id: string) {
    setCtaMoments(prev => prev.includes(id) ? prev.filter(m => m !== id) : [...prev, id])
  }

  const orderedClips = order.map(id => projectClips.find(pc => pc.row_id === id)).filter(Boolean) as ProjectClip[]
  const readyCount = orderedClips.filter(pc => {
    const it = items[pc.row_id]
    return it?.jobId && it.end > it.start
  }).length
  const canBuild = orderedClips.length >= 2 && readyCount === orderedClips.length

  async function build() {
    setBuilding(true)
    setBuildError('')
    setBuildProgress(0)
    setBuildStep('Queuing build…')
    setResult(null)
    try {
      const n = orderedClips.length
      const reqItems = orderedClips.map((pc, i) => {
        const it = items[pc.row_id]
        return {
          job_id: it.jobId, start: it.start, end: it.end, mute: it.mute,
          rank: n - i, label: it.label, font_family: fontFamily, font_size: fontSize, font_color: fontColor, position,
        }
      })
      const res = await fetch('/api/ranking/build', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items: reqItems, aspect_ratio: aspectRatio,
          output_name: projectName || 'ranking_video',
          title: titleText, title_template: titleTemplate,
          title_font_family: titleFontFamily, title_font_size: titleFontSize, title_font_color: titleFontColor,
          title_bg_color: titleBgEnabled ? titleBgColor : '',
          title_stroke_width: titleStrokeWidth,
          title_stroke_color: titleStrokeColorEnabled ? titleStrokeColor : '',
          cta_text: ctaText, cta_duration: ctaDuration, cta_moments: ctaMoments, cta_position: ctaPosition,
          cta_animation: ctaAnimation, cta_transition: ctaTransition,
          cta_font_family: ctaFontFamily, cta_font_size: ctaFontSize, cta_font_color: ctaFontColor,
          cta_bg_color: ctaBgEnabled ? ctaBgColor : '',
        }),
      })
      if (!res.ok) throw new Error((await res.json()).detail || 'Build failed')
      const { build_id } = await res.json()

      const status: any = await new Promise((resolve, reject) => {
        const iv = setInterval(async () => {
          const s = await fetch(`/api/ranking/build/${build_id}`).then(r => r.json())
          setBuildProgress(s.progress || 0)
          setBuildStep(s.step || '')
          if (s.status === 'done') { clearInterval(iv); resolve(s) }
          else if (s.status === 'error') { clearInterval(iv); reject(new Error(s.error || 'Build failed')) }
        }, 1200)
      })
      setResult(status)
    } catch (e: any) {
      setBuildError(e.message || 'Build failed')
    } finally {
      setBuilding(false)
    }
  }

  function downloadResult() {
    if (!result) return
    const a = document.createElement('a')
    a.href = `/api/edit/outputs/${result.output_id}/serve`
    a.download = result.filename
    document.body.appendChild(a); a.click(); document.body.removeChild(a)
  }

  const editingClip = editingRowId != null ? orderedClips.find(pc => pc.row_id === editingRowId) : null
  const editingItem = editingRowId != null ? items[editingRowId] : null

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {editingClip && editingItem && editingItem.jobId && (
        <TrimEditorModal
          title={editingClip.clip.title}
          jobId={editingItem.jobId}
          item={editingItem}
          onUpdate={patch => update(editingRowId!, patch)}
          onClose={() => setEditingRowId(null)}
        />
      )}

      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: 16, display: 'flex', flexDirection: 'column', gap: 4 }}>
        <div style={{ fontSize: 14, fontWeight: 700 }}>Ranking video builder</div>
        <div style={{ fontSize: 13, color: 'var(--muted)', lineHeight: 1.5 }}>
          Every clip saved to this project is part of the build, in the order below. Reorder, prepare (download), then edit each one to trim, mute, and label it.
        </div>
      </div>

      {orderedClips.length === 0 ? (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '60px 0', color: 'var(--muted)', textAlign: 'center', gap: 8 }}>
          <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text)' }}>No clips in this project yet</div>
          <div style={{ fontSize: 13 }}>Click ★ on any clip to save it here — it'll show up as a ranked entry below.</div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {orderedClips.map((pc, i) => {
            const it = items[pc.row_id]
            if (!it) return null
            const hasTrim = it.jobId && it.end > it.start
            return (
              <div key={pc.row_id} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' }}>
                <div style={{ display: 'flex', gap: 12, padding: '12px 16px', alignItems: 'flex-start' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, flexShrink: 0, paddingTop: 2 }}>
                    <span style={{ fontWeight: 800, fontSize: 16, color: 'var(--accent)' }}>#{orderedClips.length - i}</span>
                    <div style={{ display: 'flex', gap: 2 }}>
                      <button onClick={() => move(pc.row_id, -1)} disabled={i === 0} style={{ background: 'none', color: 'var(--muted)', fontSize: 13, padding: '0 4px' }}>↑</button>
                      <button onClick={() => move(pc.row_id, 1)} disabled={i === orderedClips.length - 1} style={{ background: 'none', color: 'var(--muted)', fontSize: 13, padding: '0 4px' }}>↓</button>
                    </div>
                  </div>

                  {pc.clip.thumbnail && (
                    <img src={pc.clip.platform === 'youtube' ? pc.clip.thumbnail : `/api/imgproxy?url=${encodeURIComponent(pc.clip.thumbnail)}`}
                      alt="" style={{ width: 100, height: 64, objectFit: 'cover', borderRadius: 6, flexShrink: 0 }} />
                  )}

                  <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ flex: 1, fontSize: 13, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{pc.clip.title}</span>
                      <button onClick={() => onRemove(pc.row_id)} style={{ background: 'none', color: '#ef4444', border: '1px solid #ef4444', fontSize: 11, padding: '3px 9px', borderRadius: 5, flexShrink: 0 }}>
                        Remove
                      </button>
                    </div>

                    {!it.jobId && !it.downloading && (
                      <button onClick={() => prepare(pc)} style={{ background: 'var(--accent)', color: '#fff', fontWeight: 700, fontSize: 12, padding: '6px 14px', borderRadius: 7, alignSelf: 'flex-start' }}>
                        ↓ Prepare clip
                      </button>
                    )}
                    {it.downloading && <div style={{ fontSize: 12, color: 'var(--muted)' }}>Downloading…</div>}
                    {it.error && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ fontSize: 12, color: 'var(--error)' }}>{it.error}</span>
                        <button onClick={() => prepare(pc)} style={{ background: 'none', color: 'var(--muted)', border: '1px solid var(--border)', fontSize: 11, padding: '3px 9px', borderRadius: 5 }}>Retry</button>
                      </div>
                    )}

                    {it.jobId && !it.downloading && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                        <button onClick={() => setEditingRowId(pc.row_id)} style={{ background: 'var(--accent)', color: '#fff', fontWeight: 700, fontSize: 12, padding: '6px 14px', borderRadius: 7 }}>
                          ✎ Edit clip
                        </button>
                        <span style={{ fontSize: 12, color: hasTrim ? 'var(--muted)' : 'var(--error)' }}>
                          {hasTrim ? `${fmt(it.start)} → ${fmt(it.end)} (${fmt(it.end - it.start)})` : 'No trim range set yet'}
                          {it.mute && ' • muted'}
                          {it.label && ` • "${it.label}"`}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {orderedClips.length > 0 && (
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 8 }}>Output</div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <label style={{ fontSize: 11, color: 'var(--muted)', display: 'flex', alignItems: 'center', gap: 5 }}>
                Aspect ratio
                <select value={aspectRatio} onChange={e => setAspectRatio(e.target.value)} style={{ height: 32, fontSize: 12, width: 'auto' }}>
                  {ASPECT_RATIOS.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                </select>
              </label>
            </div>
          </div>

          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 8 }}>Rank label overlay (the "#N" badge burned into each clip)</div>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
              <label style={{ fontSize: 11, color: 'var(--muted)', display: 'flex', alignItems: 'center', gap: 5 }}>
                Position
                <select value={position} onChange={e => setPosition(e.target.value)} style={{ height: 32, fontSize: 12, width: 'auto' }}>
                  {POSITIONS.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </label>
              <label style={{ fontSize: 11, color: 'var(--muted)', display: 'flex', alignItems: 'center', gap: 5 }}>
                Font
                <select value={fontFamily} onChange={e => setFontFamily(e.target.value)} style={{ height: 32, fontSize: 12, width: 'auto' }}>
                  {FONTS.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
                </select>
              </label>
              <label style={{ fontSize: 11, color: 'var(--muted)', display: 'flex', alignItems: 'center', gap: 5 }}>
                Size
                <input type="number" min={20} max={200} step={5} value={fontSize}
                  onChange={e => setFontSize(parseInt(e.target.value, 10) || 90)}
                  style={{ width: 56, height: 32, fontSize: 12 }} />
              </label>
              <label style={{ fontSize: 11, color: 'var(--muted)', display: 'flex', alignItems: 'center', gap: 5 }}>
                Color
                <input type="color" value={fontColor} onChange={e => setFontColor(e.target.value)}
                  style={{ width: 38, height: 32, padding: 2, border: '1px solid var(--border)', borderRadius: 7, background: 'none' }} />
              </label>
            </div>
          </div>

          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 8 }}>Title overlay (optional — shown throughout the whole final video, separate from the rank badge)</div>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
              <select value={titleTemplate} onChange={e => setTitleTemplate(e.target.value)} style={{ height: 32, fontSize: 12, width: 'auto' }}>
                {TITLE_TEMPLATES.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
              <input value={titleText} onChange={e => setTitleText(e.target.value)}
                disabled={titleTemplate === 'none'}
                placeholder="Title text…"
                style={{ flex: 1, minWidth: 160, height: 32, fontSize: 12 }} />
            </div>
            {titleTemplate !== 'none' && (
              <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', marginTop: 8 }}>
                <label style={{ fontSize: 11, color: 'var(--muted)', display: 'flex', alignItems: 'center', gap: 5 }}>
                  Font
                  <select value={titleFontFamily} onChange={e => setTitleFontFamily(e.target.value)} style={{ height: 32, fontSize: 12, width: 'auto' }}>
                    {FONTS.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
                  </select>
                </label>
                <label style={{ fontSize: 11, color: 'var(--muted)', display: 'flex', alignItems: 'center', gap: 5 }}>
                  Size
                  <input type="number" min={20} max={200} step={5} value={titleFontSize || 42}
                    onChange={e => setTitleFontSize(parseInt(e.target.value, 10) || 0)}
                    style={{ width: 56, height: 32, fontSize: 12 }} />
                </label>
                <label style={{ fontSize: 11, color: 'var(--muted)', display: 'flex', alignItems: 'center', gap: 5 }}>
                  Text color
                  <input type="color" value={titleFontColor} onChange={e => setTitleFontColor(e.target.value)}
                    style={{ width: 38, height: 32, padding: 2, border: '1px solid var(--border)', borderRadius: 7, background: 'none' }} />
                </label>
                <label style={{ fontSize: 11, color: 'var(--muted)', display: 'flex', alignItems: 'center', gap: 5 }}>
                  <input type="checkbox" checked={titleBgEnabled} onChange={e => setTitleBgEnabled(e.target.checked)} style={{ width: 'auto' }} />
                  Background color
                </label>
                {titleBgEnabled && (
                  <input type="color" value={titleBgColor} onChange={e => setTitleBgColor(e.target.value)}
                    style={{ width: 38, height: 32, padding: 2, border: '1px solid var(--border)', borderRadius: 7, background: 'none' }} />
                )}
              </div>
            )}
            {titleTemplate !== 'none' && (
              <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', marginTop: 8 }}>
                <label style={{ fontSize: 11, color: 'var(--muted)', display: 'flex', alignItems: 'center', gap: 5 }}>
                  Stroke width
                  <input type="number" min={0} max={20} step={1} value={titleStrokeWidth < 0 ? '' : titleStrokeWidth}
                    placeholder="default"
                    onChange={e => setTitleStrokeWidth(e.target.value === '' ? -1 : (parseInt(e.target.value, 10) || 0))}
                    style={{ width: 64, height: 32, fontSize: 12 }} />
                </label>
                <label style={{ fontSize: 11, color: 'var(--muted)', display: 'flex', alignItems: 'center', gap: 5 }}>
                  <input type="checkbox" checked={titleStrokeColorEnabled} onChange={e => setTitleStrokeColorEnabled(e.target.checked)} style={{ width: 'auto' }} />
                  Stroke color
                </label>
                {titleStrokeColorEnabled && (
                  <input type="color" value={titleStrokeColor} onChange={e => setTitleStrokeColor(e.target.value)}
                    style={{ width: 38, height: 32, padding: 2, border: '1px solid var(--border)', borderRadius: 7, background: 'none' }} />
                )}
                <span style={{ fontSize: 10, color: 'var(--muted)' }}>
                  Outline around the text — keeps it legible against any background. Leave width blank for the template default, or set 0 to disable.
                </span>
              </div>
            )}
          </div>

          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 8 }}>
              Call to action (optional — "Like &amp; Subscribe", can appear up to 3 times)
            </div>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
              <input value={ctaText} onChange={e => setCtaText(e.target.value)}
                placeholder="e.g. Like & Subscribe!"
                style={{ flex: 1, minWidth: 160, height: 32, fontSize: 12 }} />
              <label style={{ fontSize: 11, color: 'var(--muted)', display: 'flex', alignItems: 'center', gap: 5 }}>
                Held for
                <input type="number" min={1} max={15} step={0.5} value={ctaDuration}
                  onChange={e => setCtaDuration(parseFloat(e.target.value) || 3)}
                  style={{ width: 56, height: 32, fontSize: 12 }} />
                seconds
              </label>
            </div>
            {ctaText.trim() && (
              <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', marginTop: 8 }}>
                <span style={{ fontSize: 11, color: 'var(--muted)' }}>Appears at:</span>
                {CTA_MOMENTS.map(m => (
                  <label key={m.id} style={{ fontSize: 11, color: 'var(--muted)', display: 'flex', alignItems: 'center', gap: 5, cursor: 'pointer' }}>
                    <input type="checkbox" checked={ctaMoments.includes(m.id)} onChange={() => toggleCtaMoment(m.id)} style={{ width: 'auto' }} />
                    {m.name}
                  </label>
                ))}
              </div>
            )}
            {ctaText.trim() && (
              <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', marginTop: 8 }}>
                <label style={{ fontSize: 11, color: 'var(--muted)', display: 'flex', alignItems: 'center', gap: 5 }}>
                  Position
                  <select value={ctaPosition} onChange={e => setCtaPosition(e.target.value)} style={{ height: 32, fontSize: 12, width: 'auto' }}>
                    {CTA_POSITIONS.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                </label>
                <label style={{ fontSize: 11, color: 'var(--muted)', display: 'flex', alignItems: 'center', gap: 5 }}>
                  Animation
                  <select value={ctaAnimation} onChange={e => setCtaAnimation(e.target.value)} style={{ height: 32, fontSize: 12, width: 'auto' }}>
                    {CTA_ANIMATIONS.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                  </select>
                </label>
                {ctaAnimation !== 'none' && (
                  <label style={{ fontSize: 11, color: 'var(--muted)', display: 'flex', alignItems: 'center', gap: 5 }}>
                    Transition speed
                    <input type="number" min={0.1} max={2} step={0.1} value={ctaTransition}
                      onChange={e => setCtaTransition(parseFloat(e.target.value) || 0.5)}
                      style={{ width: 56, height: 32, fontSize: 12 }} />
                    sec
                  </label>
                )}
                <label style={{ fontSize: 11, color: 'var(--muted)', display: 'flex', alignItems: 'center', gap: 5 }}>
                  Font
                  <select value={ctaFontFamily} onChange={e => setCtaFontFamily(e.target.value)} style={{ height: 32, fontSize: 12, width: 'auto' }}>
                    {FONTS.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
                  </select>
                </label>
                <label style={{ fontSize: 11, color: 'var(--muted)', display: 'flex', alignItems: 'center', gap: 5 }}>
                  Size
                  <input type="number" min={20} max={120} step={5} value={ctaFontSize || 48}
                    onChange={e => setCtaFontSize(parseInt(e.target.value, 10) || 0)}
                    style={{ width: 56, height: 32, fontSize: 12 }} />
                </label>
                <label style={{ fontSize: 11, color: 'var(--muted)', display: 'flex', alignItems: 'center', gap: 5 }}>
                  Text color
                  <input type="color" value={ctaFontColor} onChange={e => setCtaFontColor(e.target.value)}
                    style={{ width: 38, height: 32, padding: 2, border: '1px solid var(--border)', borderRadius: 7, background: 'none' }} />
                </label>
                <label style={{ fontSize: 11, color: 'var(--muted)', display: 'flex', alignItems: 'center', gap: 5 }}>
                  <input type="checkbox" checked={ctaBgEnabled} onChange={e => setCtaBgEnabled(e.target.checked)} style={{ width: 'auto' }} />
                  Background pill
                </label>
                {ctaBgEnabled && (
                  <input type="color" value={ctaBgColor} onChange={e => setCtaBgColor(e.target.value)}
                    style={{ width: 38, height: 32, padding: 2, border: '1px solid var(--border)', borderRadius: 7, background: 'none' }} />
                )}
              </div>
            )}
          </div>

          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', borderTop: '1px solid var(--border)', paddingTop: 12 }}>
            <button onClick={build} disabled={!canBuild || building} style={{
              background: canBuild && !building ? 'var(--accent)' : 'var(--surface2)',
              color: canBuild && !building ? '#fff' : 'var(--muted)',
              fontWeight: 700, fontSize: 13, padding: '0 18px', height: 34, borderRadius: 8,
            }}>
              {building ? 'Building…' : `Build ranking video (${orderedClips.length})`}
            </button>
            {!canBuild && !building && (
              <span style={{ fontSize: 11, color: 'var(--muted)' }}>
                {orderedClips.length < 2 ? 'Add at least 2 clips to this project.' : 'Edit every clip above (with a valid trim range) to enable building.'}
              </span>
            )}
          </div>

          {building && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div style={{ position: 'relative', height: 8, background: 'var(--border)', borderRadius: 99, overflow: 'hidden' }}>
                <div style={{
                  position: 'absolute', inset: 0, width: `${buildProgress}%`,
                  background: 'var(--accent)', borderRadius: 99, transition: 'width 0.3s ease',
                }} />
              </div>
              <span style={{ fontSize: 11, color: 'var(--muted)' }}>{buildStep || 'Building…'} ({buildProgress}%)</span>
            </div>
          )}

          {buildError && <div style={{ color: 'var(--error)', fontSize: 13 }}>{buildError}</div>}

          {result && (
            <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 8, padding: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--success)', fontSize: 13, fontWeight: 600 }}>✓ Ranking video built</span>
                <button onClick={downloadResult} style={{ background: 'var(--success)', color: '#fff', fontWeight: 700, fontSize: 12, padding: '6px 14px', borderRadius: 7 }}>
                  ↓ Download
                </button>
              </div>
              <video src={`/api/edit/outputs/${result.output_id}/serve`} controls
                style={{ width: '100%', maxHeight: 480, borderRadius: 8, background: '#000', display: 'block' }} />
            </div>
          )}
        </div>
      )}
    </div>
  )
}
