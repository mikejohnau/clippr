import { useEffect, useState } from 'react'
import { ProjectClip } from '../types'
import { ClipItemState as ItemState, ClipTrimModal as TrimEditorModal, fmt } from './ClipTrimModal'
import { ASPECT_RATIOS, TitleOverlayEditor, CtaEditor } from './OverlayEditors'

// ── Persistence — remember every field across refreshes, scoped per project ──

interface PersistedState {
  order: number[]
  items: Record<number, ItemState>
  aspectRatio: string
  pipPosition: string
  pipScale: number
  pipBorderWidth: number
  pipBorderColor: string
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
  return `clippr_commentary_v1_${projectId || 'default'}`
}

function loadPersisted(projectId?: string): Partial<PersistedState> | null {
  try {
    const raw = localStorage.getItem(storageKey(projectId))
    if (!raw) return null
    const parsed = JSON.parse(raw)
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

const PIP_POSITIONS = [
  { id: 'top-left', name: 'Top left' },
  { id: 'top-right', name: 'Top right' },
  { id: 'bottom-left', name: 'Bottom left' },
  { id: 'bottom-right', name: 'Bottom right' },
]

// ── Main builder ─────────────────────────────────────────────────────────────

export default function CommentaryBuilder({ projectClips, onRemove, projectName, projectId }: {
  projectClips: ProjectClip[]
  onRemove: (rowId: number) => void
  projectName?: string
  projectId?: string
}) {
  const [saved] = useState(() => loadPersisted(projectId))

  // Commentary only ever uses the first two clips saved to the project —
  // order[0] is the full-frame base clip, order[1] is the reaction PiP.
  const [order, setOrder] = useState<number[]>(saved?.order ?? [])
  const [items, setItems] = useState<Record<number, ItemState>>(saved?.items ?? {})
  const [editingRowId, setEditingRowId] = useState<number | null>(null)
  const [aspectRatio, setAspectRatio] = useState(saved?.aspectRatio ?? '9:16')
  const [pipPosition, setPipPosition] = useState(saved?.pipPosition ?? 'bottom-right')
  const [pipScale, setPipScale] = useState(saved?.pipScale ?? 0.35)
  const [pipBorderWidth, setPipBorderWidth] = useState(saved?.pipBorderWidth ?? 0)
  const [pipBorderColor, setPipBorderColor] = useState(saved?.pipBorderColor ?? '#ffffff')
  const [titleText, setTitleText] = useState(saved?.titleText ?? '')
  const [titleTemplate, setTitleTemplate] = useState(saved?.titleTemplate ?? 'none')
  const [titleFontFamily, setTitleFontFamily] = useState(saved?.titleFontFamily ?? 'sans-bold')
  const [titleFontSize, setTitleFontSize] = useState(saved?.titleFontSize ?? 0)
  const [titleFontColor, setTitleFontColor] = useState(saved?.titleFontColor ?? '#ffffff')
  const [titleBgColor, setTitleBgColor] = useState(saved?.titleBgColor ?? '#000000')
  const [titleBgEnabled, setTitleBgEnabled] = useState(saved?.titleBgEnabled ?? false)
  const [titleStrokeWidth, setTitleStrokeWidth] = useState(saved?.titleStrokeWidth ?? -1)
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

  // Keep order/items in sync with whatever clips are actually saved to the
  // project — but only the first two ever participate (base + reaction).
  useEffect(() => {
    const currentIds = projectClips.map(pc => pc.row_id).slice(0, 2)
    setOrder(prev => {
      const kept = prev.filter(id => currentIds.includes(id))
      const added = currentIds.filter(id => !kept.includes(id))
      return [...kept, ...added].slice(0, 2)
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
  // lose trim points or any of the PiP/title/CTA styling.
  useEffect(() => {
    const state: PersistedState = {
      order, items, aspectRatio, pipPosition, pipScale, pipBorderWidth, pipBorderColor,
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
    projectId, order, items, aspectRatio, pipPosition, pipScale, pipBorderWidth, pipBorderColor,
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

  function swap() {
    setOrder(prev => prev.length === 2 ? [prev[1], prev[0]] : prev)
  }

  function toggleCtaMoment(id: string) {
    setCtaMoments(prev => prev.includes(id) ? prev.filter(m => m !== id) : [...prev, id])
  }

  const orderedClips = order.map(id => projectClips.find(pc => pc.row_id === id)).filter(Boolean) as ProjectClip[]
  const readyCount = orderedClips.filter(pc => {
    const it = items[pc.row_id]
    return it?.jobId && it.end > it.start
  }).length
  const canBuild = orderedClips.length === 2 && readyCount === 2

  async function build() {
    setBuilding(true)
    setBuildError('')
    setBuildProgress(0)
    setBuildStep('Queuing build…')
    setResult(null)
    try {
      const reqItems = orderedClips.map(pc => {
        const it = items[pc.row_id]
        return { job_id: it.jobId, start: it.start, end: it.end, mute: it.mute }
      })
      const res = await fetch('/api/commentary/build', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items: reqItems, aspect_ratio: aspectRatio,
          pip_position: pipPosition, pip_scale: pipScale,
          pip_border_width: pipBorderWidth, pip_border_color: pipBorderColor,
          output_name: projectName || 'commentary_video',
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
          const s = await fetch(`/api/commentary/build/${build_id}`).then(r => r.json())
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
  const slotNames = ['Base clip', 'Reaction (PiP)']
  const extraClips = projectClips.slice(2)

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
        <div style={{ fontSize: 14, fontWeight: 700 }}>Commentary video builder</div>
        <div style={{ fontSize: 13, color: 'var(--muted)', lineHeight: 1.5 }}>
          Uses the first two clips saved to this project — the first plays full-frame, the second is overlaid as a reaction picture-in-picture.
        </div>
      </div>

      {orderedClips.length === 0 ? (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '60px 0', color: 'var(--muted)', textAlign: 'center', gap: 8 }}>
          <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text)' }}>No clips in this project yet</div>
          <div style={{ fontSize: 13 }}>Click ★ on any clip to save it here — the first two will become the base clip and the reaction overlay.</div>
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
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, flexShrink: 0, paddingTop: 2, minWidth: 90 }}>
                    <span style={{ fontWeight: 800, fontSize: 12, color: 'var(--accent)', textAlign: 'center' }}>{slotNames[i]}</span>
                    {orderedClips.length === 2 && (
                      <button onClick={swap} title="Swap positions" style={{ background: 'none', color: 'var(--muted)', fontSize: 13, padding: '0 4px' }}>⇄</button>
                    )}
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
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )
          })}

          {extraClips.length > 0 && (
            <div style={{ fontSize: 12, color: 'var(--muted)' }}>
              {extraClips.length} extra clip{extraClips.length !== 1 ? 's' : ''} saved to this project won't be used by the commentary build — remove a clip above to bring one of them in instead.
            </div>
          )}
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
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 8 }}>Reaction overlay (picture-in-picture)</div>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
              <label style={{ fontSize: 11, color: 'var(--muted)', display: 'flex', alignItems: 'center', gap: 5 }}>
                Position
                <select value={pipPosition} onChange={e => setPipPosition(e.target.value)} style={{ height: 32, fontSize: 12, width: 'auto' }}>
                  {PIP_POSITIONS.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </label>
              <label style={{ fontSize: 11, color: 'var(--muted)', display: 'flex', alignItems: 'center', gap: 5 }}>
                Size
                <input type="number" min={15} max={70} step={5} value={Math.round(pipScale * 100)}
                  onChange={e => setPipScale((parseInt(e.target.value, 10) || 35) / 100)}
                  style={{ width: 56, height: 32, fontSize: 12 }} />
                % width
              </label>
              <label style={{ fontSize: 11, color: 'var(--muted)', display: 'flex', alignItems: 'center', gap: 5 }}>
                Border
                <input type="number" min={0} max={20} step={1} value={pipBorderWidth}
                  onChange={e => setPipBorderWidth(parseInt(e.target.value, 10) || 0)}
                  style={{ width: 56, height: 32, fontSize: 12 }} />
                px
              </label>
              {pipBorderWidth > 0 && (
                <input type="color" value={pipBorderColor} onChange={e => setPipBorderColor(e.target.value)}
                  style={{ width: 38, height: 32, padding: 2, border: '1px solid var(--border)', borderRadius: 7, background: 'none' }} />
              )}
            </div>
          </div>

          <TitleOverlayEditor
            titleText={titleText} setTitleText={setTitleText}
            titleTemplate={titleTemplate} setTitleTemplate={setTitleTemplate}
            titleFontFamily={titleFontFamily} setTitleFontFamily={setTitleFontFamily}
            titleFontSize={titleFontSize} setTitleFontSize={setTitleFontSize}
            titleFontColor={titleFontColor} setTitleFontColor={setTitleFontColor}
            titleBgColor={titleBgColor} setTitleBgColor={setTitleBgColor}
            titleBgEnabled={titleBgEnabled} setTitleBgEnabled={setTitleBgEnabled}
            titleStrokeWidth={titleStrokeWidth} setTitleStrokeWidth={setTitleStrokeWidth}
            titleStrokeColor={titleStrokeColor} setTitleStrokeColor={setTitleStrokeColor}
            titleStrokeColorEnabled={titleStrokeColorEnabled} setTitleStrokeColorEnabled={setTitleStrokeColorEnabled}
          />

          <CtaEditor
            ctaText={ctaText} setCtaText={setCtaText}
            ctaDuration={ctaDuration} setCtaDuration={setCtaDuration}
            ctaMoments={ctaMoments} toggleCtaMoment={toggleCtaMoment}
            ctaPosition={ctaPosition} setCtaPosition={setCtaPosition}
            ctaAnimation={ctaAnimation} setCtaAnimation={setCtaAnimation}
            ctaTransition={ctaTransition} setCtaTransition={setCtaTransition}
            ctaFontFamily={ctaFontFamily} setCtaFontFamily={setCtaFontFamily}
            ctaFontSize={ctaFontSize} setCtaFontSize={setCtaFontSize}
            ctaFontColor={ctaFontColor} setCtaFontColor={setCtaFontColor}
            ctaBgColor={ctaBgColor} setCtaBgColor={setCtaBgColor}
            ctaBgEnabled={ctaBgEnabled} setCtaBgEnabled={setCtaBgEnabled}
          />

          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', borderTop: '1px solid var(--border)', paddingTop: 12 }}>
            <button onClick={build} disabled={!canBuild || building} style={{
              background: canBuild && !building ? 'var(--accent)' : 'var(--surface2)',
              color: canBuild && !building ? '#fff' : 'var(--muted)',
              fontWeight: 700, fontSize: 13, padding: '0 18px', height: 34, borderRadius: 8,
            }}>
              {building ? 'Building…' : 'Build commentary video'}
            </button>
            {!canBuild && !building && (
              <span style={{ fontSize: 11, color: 'var(--muted)' }}>
                {orderedClips.length < 2 ? 'Add at least 2 clips to this project.' : 'Edit both clips above (with a valid trim range) to enable building.'}
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
                <span style={{ color: 'var(--success)', fontSize: 13, fontWeight: 600 }}>✓ Commentary video built</span>
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
