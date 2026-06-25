import { useEffect, useRef, useState } from 'react'
import { ASPECT_RATIOS, TitleOverlayEditor, CtaEditor } from './OverlayEditors'

interface StoryImageState {
  imageId: string
  previewUrl: string
  filename: string
  duration: number
}

// ── Persistence — remember every field across refreshes, scoped per project ──
// Uploaded image files live server-side for 24h (see backend/app/cleanup.py),
// so re-using their image_id after a refresh works as long as it's recent.

interface PersistedState {
  images: StoryImageState[]
  style: string
  transitionDuration: number
  aspectRatio: string
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
  return `clippr_imagestory_v1_${projectId || 'default'}`
}

function loadPersisted(projectId?: string): Partial<PersistedState> | null {
  try {
    const raw = localStorage.getItem(storageKey(projectId))
    if (!raw) return null
    return JSON.parse(raw)
  } catch {
    return null
  }
}

const STYLES = [
  { id: 'ken_burns', name: 'Ken Burns (slow pan/zoom)' },
  { id: 'static_crossfade', name: 'Static with crossfade' },
]

function fmt(s: number) {
  const m = Math.floor(s / 60)
  const sec = (s % 60).toFixed(1)
  return `${m}:${sec.padStart(4, '0')}`
}

// ── Main builder ─────────────────────────────────────────────────────────────

export default function ImageStoryBuilder({ projectName, projectId }: {
  projectName?: string
  projectId?: string
}) {
  const [saved] = useState(() => loadPersisted(projectId))
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [images, setImages] = useState<StoryImageState[]>(saved?.images ?? [])
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState('')
  const [style, setStyle] = useState(saved?.style ?? 'ken_burns')
  const [transitionDuration, setTransitionDuration] = useState(saved?.transitionDuration ?? 0.6)
  const [aspectRatio, setAspectRatio] = useState(saved?.aspectRatio ?? '9:16')
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

  // Persist every field to localStorage (per project) so a refresh doesn't
  // lose uploaded images, durations, or any of the style/title/CTA settings.
  useEffect(() => {
    const state: PersistedState = {
      images, style, transitionDuration, aspectRatio,
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
    projectId, images, style, transitionDuration, aspectRatio,
    titleText, titleTemplate, titleFontFamily, titleFontSize, titleFontColor,
    titleBgColor, titleBgEnabled, titleStrokeWidth, titleStrokeColor, titleStrokeColorEnabled,
    ctaText, ctaDuration, ctaMoments, ctaPosition, ctaAnimation, ctaTransition,
    ctaFontFamily, ctaFontSize, ctaFontColor, ctaBgColor, ctaBgEnabled,
  ])

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return
    setUploading(true)
    setUploadError('')
    try {
      const uploaded: StoryImageState[] = []
      for (const file of Array.from(files)) {
        const form = new FormData()
        form.append('file', file)
        const res = await fetch('/api/imagestory/upload', { method: 'POST', body: form })
        if (!res.ok) throw new Error((await res.json()).detail || `Failed to upload ${file.name}`)
        const data = await res.json()
        uploaded.push({ imageId: data.image_id, previewUrl: data.url, filename: file.name, duration: 3 })
      }
      setImages(prev => [...prev, ...uploaded])
    } catch (e: any) {
      setUploadError(e.message || 'Upload failed')
    } finally {
      setUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  function updateImage(index: number, patch: Partial<StoryImageState>) {
    setImages(prev => prev.map((img, i) => i === index ? { ...img, ...patch } : img))
  }

  function removeImage(index: number) {
    setImages(prev => prev.filter((_, i) => i !== index))
  }

  function move(index: number, dir: -1 | 1) {
    setImages(prev => {
      const j = index + dir
      if (j < 0 || j >= prev.length) return prev
      const next = [...prev]
      ;[next[index], next[j]] = [next[j], next[index]]
      return next
    })
  }

  function toggleCtaMoment(id: string) {
    setCtaMoments(prev => prev.includes(id) ? prev.filter(m => m !== id) : [...prev, id])
  }

  const canBuild = images.length >= 1 && images.every(img => img.duration > 0)
  const totalDuration = images.reduce((sum, img) => sum + img.duration, 0)
    + (style === 'static_crossfade' && images.length > 1 ? (images.length - 1) * transitionDuration : 0)

  async function build() {
    setBuilding(true)
    setBuildError('')
    setBuildProgress(0)
    setBuildStep('Queuing build…')
    setResult(null)
    try {
      const res = await fetch('/api/imagestory/build', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          images: images.map(img => ({ image_id: img.imageId, duration: img.duration })),
          style, transition_duration: transitionDuration, aspect_ratio: aspectRatio,
          output_name: projectName || 'image_story_video',
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
          const s = await fetch(`/api/imagestory/build/${build_id}`).then(r => r.json())
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

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: 16, display: 'flex', flexDirection: 'column', gap: 4 }}>
        <div style={{ fontSize: 14, fontWeight: 700 }}>Still image story builder</div>
        <div style={{ fontSize: 13, color: 'var(--muted)', lineHeight: 1.5 }}>
          Upload a set of images, set how long each is held on screen, then build them into a video with pan/zoom or crossfade motion.
        </div>
      </div>

      <input ref={fileInputRef} type="file" accept="image/*" multiple style={{ display: 'none' }}
        onChange={e => handleFiles(e.target.files)} />

      <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
        <button onClick={() => fileInputRef.current?.click()} disabled={uploading} style={{
          background: 'var(--accent)', color: '#fff', fontWeight: 700, fontSize: 13, padding: '8px 16px', borderRadius: 8,
        }}>
          {uploading ? 'Uploading…' : '↑ Upload images'}
        </button>
        {uploadError && <span style={{ color: 'var(--error)', fontSize: 12 }}>{uploadError}</span>}
      </div>

      {images.length === 0 ? (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '60px 0', color: 'var(--muted)', textAlign: 'center', gap: 8 }}>
          <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text)' }}>No images uploaded yet</div>
          <div style={{ fontSize: 13 }}>Upload at least one image to get started — order, timing, and motion are all configurable below.</div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {images.map((img, i) => (
            <div key={img.imageId} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' }}>
              <div style={{ display: 'flex', gap: 12, padding: '12px 16px', alignItems: 'center' }}>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, flexShrink: 0 }}>
                  <span style={{ fontWeight: 800, fontSize: 14, color: 'var(--accent)' }}>#{i + 1}</span>
                  <div style={{ display: 'flex', gap: 2 }}>
                    <button onClick={() => move(i, -1)} disabled={i === 0} style={{ background: 'none', color: 'var(--muted)', fontSize: 13, padding: '0 4px' }}>↑</button>
                    <button onClick={() => move(i, 1)} disabled={i === images.length - 1} style={{ background: 'none', color: 'var(--muted)', fontSize: 13, padding: '0 4px' }}>↓</button>
                  </div>
                </div>

                <img src={img.previewUrl} alt="" style={{ width: 90, height: 64, objectFit: 'cover', borderRadius: 6, flexShrink: 0, background: '#000' }} />

                <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <span style={{ fontSize: 13, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{img.filename}</span>
                  <label style={{ fontSize: 11, color: 'var(--muted)', display: 'flex', alignItems: 'center', gap: 5 }}>
                    Held for
                    <input type="number" min={0.5} max={30} step={0.5} value={img.duration}
                      onChange={e => updateImage(i, { duration: parseFloat(e.target.value) || 3 })}
                      style={{ width: 56, height: 30, fontSize: 12 }} />
                    seconds
                  </label>
                </div>

                <button onClick={() => removeImage(i)} style={{ background: 'none', color: '#ef4444', border: '1px solid #ef4444', fontSize: 11, padding: '3px 9px', borderRadius: 5, flexShrink: 0 }}>
                  Remove
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {images.length > 0 && (
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 8 }}>Output</div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <label style={{ fontSize: 11, color: 'var(--muted)', display: 'flex', alignItems: 'center', gap: 5 }}>
                Motion style
                <select value={style} onChange={e => setStyle(e.target.value)} style={{ height: 32, fontSize: 12, width: 'auto' }}>
                  {STYLES.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </label>
              {style === 'static_crossfade' && images.length > 1 && (
                <label style={{ fontSize: 11, color: 'var(--muted)', display: 'flex', alignItems: 'center', gap: 5 }}>
                  Crossfade
                  <input type="number" min={0.2} max={2} step={0.1} value={transitionDuration}
                    onChange={e => setTransitionDuration(parseFloat(e.target.value) || 0.6)}
                    style={{ width: 56, height: 32, fontSize: 12 }} />
                  sec
                </label>
              )}
              <label style={{ fontSize: 11, color: 'var(--muted)', display: 'flex', alignItems: 'center', gap: 5 }}>
                Aspect ratio
                <select value={aspectRatio} onChange={e => setAspectRatio(e.target.value)} style={{ height: 32, fontSize: 12, width: 'auto' }}>
                  {ASPECT_RATIOS.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                </select>
              </label>
              <span style={{ fontSize: 11, color: 'var(--muted)' }}>Total: {fmt(totalDuration)}</span>
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
              {building ? 'Building…' : `Build image story (${images.length})`}
            </button>
            {!canBuild && !building && (
              <span style={{ fontSize: 11, color: 'var(--muted)' }}>Upload at least one image with a valid duration.</span>
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
                <span style={{ color: 'var(--success)', fontSize: 13, fontWeight: 600 }}>✓ Image story built</span>
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
