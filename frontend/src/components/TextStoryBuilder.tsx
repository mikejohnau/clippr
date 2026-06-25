import { useEffect, useState } from 'react'
import { FONTS, ASPECT_RATIOS, TitleOverlayEditor, CtaEditor } from './OverlayEditors'

interface SlideState {
  id: number
  text: string
  duration: number
}

// ── Persistence — remember every field across refreshes, scoped per project ──

interface PersistedState {
  slides: SlideState[]
  nextId: number
  backgroundColor: string
  fontFamily: string
  fontSize: number
  fontColor: string
  useCrossfade: boolean
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
  return `clippr_textstory_v1_${projectId || 'default'}`
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

function fmt(s: number) {
  const m = Math.floor(s / 60)
  const sec = (s % 60).toFixed(1)
  return `${m}:${sec.padStart(4, '0')}`
}

// ── Main builder ─────────────────────────────────────────────────────────────

export default function TextStoryBuilder({ projectName, projectId }: {
  projectName?: string
  projectId?: string
}) {
  const [saved] = useState(() => loadPersisted(projectId))

  const [slides, setSlides] = useState<SlideState[]>(saved?.slides ?? [{ id: 0, text: '', duration: 3 }])
  const [nextId, setNextId] = useState(saved?.nextId ?? 1)
  const [backgroundColor, setBackgroundColor] = useState(saved?.backgroundColor ?? '#0c0e14')
  const [fontFamily, setFontFamily] = useState(saved?.fontFamily ?? 'sans-bold')
  const [fontSize, setFontSize] = useState(saved?.fontSize ?? 0)
  const [fontColor, setFontColor] = useState(saved?.fontColor ?? '#ffffff')
  const [useCrossfade, setUseCrossfade] = useState(saved?.useCrossfade ?? true)
  const [transitionDuration, setTransitionDuration] = useState(saved?.transitionDuration ?? 0.5)
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
  // lose slide text, durations, or any of the style/title/CTA settings.
  useEffect(() => {
    const state: PersistedState = {
      slides, nextId, backgroundColor, fontFamily, fontSize, fontColor,
      useCrossfade, transitionDuration, aspectRatio,
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
    projectId, slides, nextId, backgroundColor, fontFamily, fontSize, fontColor,
    useCrossfade, transitionDuration, aspectRatio,
    titleText, titleTemplate, titleFontFamily, titleFontSize, titleFontColor,
    titleBgColor, titleBgEnabled, titleStrokeWidth, titleStrokeColor, titleStrokeColorEnabled,
    ctaText, ctaDuration, ctaMoments, ctaPosition, ctaAnimation, ctaTransition,
    ctaFontFamily, ctaFontSize, ctaFontColor, ctaBgColor, ctaBgEnabled,
  ])

  function addSlide() {
    setSlides(prev => [...prev, { id: nextId, text: '', duration: 3 }])
    setNextId(prev => prev + 1)
  }

  function updateSlide(id: number, patch: Partial<SlideState>) {
    setSlides(prev => prev.map(s => s.id === id ? { ...s, ...patch } : s))
  }

  function removeSlide(id: number) {
    setSlides(prev => prev.filter(s => s.id !== id))
  }

  function move(id: number, dir: -1 | 1) {
    setSlides(prev => {
      const i = prev.findIndex(s => s.id === id)
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

  const canBuild = slides.length >= 1 && slides.every(s => s.text.trim() && s.duration > 0)
  const totalDuration = slides.reduce((sum, s) => sum + s.duration, 0)
    + (useCrossfade && slides.length > 1 ? (slides.length - 1) * transitionDuration : 0)

  async function build() {
    setBuilding(true)
    setBuildError('')
    setBuildProgress(0)
    setBuildStep('Queuing build…')
    setResult(null)
    try {
      const res = await fetch('/api/textstory/build', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          slides: slides.map(s => ({ text: s.text, duration: s.duration })),
          background_color: backgroundColor, font_family: fontFamily, font_size: fontSize, font_color: fontColor,
          use_crossfade: useCrossfade, transition_duration: transitionDuration, aspect_ratio: aspectRatio,
          output_name: projectName || 'text_story_video',
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
          const s = await fetch(`/api/textstory/build/${build_id}`).then(r => r.json())
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
        <div style={{ fontSize: 14, fontWeight: 700 }}>Text story builder</div>
        <div style={{ fontSize: 13, color: 'var(--muted)', lineHeight: 1.5 }}>
          Write a sequence of text slides on a plain background — Reddit-story style. Set how long each is held, then build.
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {slides.map((slide, i) => (
          <div key={slide.id} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' }}>
            <div style={{ display: 'flex', gap: 12, padding: '12px 16px', alignItems: 'flex-start' }}>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, flexShrink: 0, paddingTop: 6 }}>
                <span style={{ fontWeight: 800, fontSize: 14, color: 'var(--accent)' }}>#{i + 1}</span>
                <div style={{ display: 'flex', gap: 2 }}>
                  <button onClick={() => move(slide.id, -1)} disabled={i === 0} style={{ background: 'none', color: 'var(--muted)', fontSize: 13, padding: '0 4px' }}>↑</button>
                  <button onClick={() => move(slide.id, 1)} disabled={i === slides.length - 1} style={{ background: 'none', color: 'var(--muted)', fontSize: 13, padding: '0 4px' }}>↓</button>
                </div>
              </div>

              <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
                <textarea value={slide.text} onChange={e => updateSlide(slide.id, { text: e.target.value })}
                  placeholder="Slide text…" rows={2}
                  style={{ fontSize: 13, padding: 8, resize: 'vertical', fontFamily: 'inherit' }} />
                <label style={{ fontSize: 11, color: 'var(--muted)', display: 'flex', alignItems: 'center', gap: 5 }}>
                  Held for
                  <input type="number" min={0.5} max={30} step={0.5} value={slide.duration}
                    onChange={e => updateSlide(slide.id, { duration: parseFloat(e.target.value) || 3 })}
                    style={{ width: 56, height: 30, fontSize: 12 }} />
                  seconds
                </label>
              </div>

              <button onClick={() => removeSlide(slide.id)} disabled={slides.length === 1}
                style={{ background: 'none', color: '#ef4444', border: '1px solid #ef4444', fontSize: 11, padding: '3px 9px', borderRadius: 5, flexShrink: 0 }}>
                Remove
              </button>
            </div>
          </div>
        ))}
        <button onClick={addSlide} style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)', fontWeight: 700, fontSize: 12, padding: '8px 0', borderRadius: 8 }}>
          + Add slide
        </button>
      </div>

      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 8 }}>Output</div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <label style={{ fontSize: 11, color: 'var(--muted)', display: 'flex', alignItems: 'center', gap: 5 }}>
              <input type="checkbox" checked={useCrossfade} onChange={e => setUseCrossfade(e.target.checked)} style={{ width: 'auto' }} />
              Crossfade between slides
            </label>
            {useCrossfade && slides.length > 1 && (
              <label style={{ fontSize: 11, color: 'var(--muted)', display: 'flex', alignItems: 'center', gap: 5 }}>
                Duration
                <input type="number" min={0.2} max={2} step={0.1} value={transitionDuration}
                  onChange={e => setTransitionDuration(parseFloat(e.target.value) || 0.5)}
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

        <div>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 8 }}>Slide style</div>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            <label style={{ fontSize: 11, color: 'var(--muted)', display: 'flex', alignItems: 'center', gap: 5 }}>
              Background
              <input type="color" value={backgroundColor} onChange={e => setBackgroundColor(e.target.value)}
                style={{ width: 38, height: 32, padding: 2, border: '1px solid var(--border)', borderRadius: 7, background: 'none' }} />
            </label>
            <label style={{ fontSize: 11, color: 'var(--muted)', display: 'flex', alignItems: 'center', gap: 5 }}>
              Font
              <select value={fontFamily} onChange={e => setFontFamily(e.target.value)} style={{ height: 32, fontSize: 12, width: 'auto' }}>
                {FONTS.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
              </select>
            </label>
            <label style={{ fontSize: 11, color: 'var(--muted)', display: 'flex', alignItems: 'center', gap: 5 }}>
              Size
              <input type="number" min={20} max={150} step={5} value={fontSize || 64}
                onChange={e => setFontSize(parseInt(e.target.value, 10) || 0)}
                style={{ width: 56, height: 32, fontSize: 12 }} />
            </label>
            <label style={{ fontSize: 11, color: 'var(--muted)', display: 'flex', alignItems: 'center', gap: 5 }}>
              Text color
              <input type="color" value={fontColor} onChange={e => setFontColor(e.target.value)}
                style={{ width: 38, height: 32, padding: 2, border: '1px solid var(--border)', borderRadius: 7, background: 'none' }} />
            </label>
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
            {building ? 'Building…' : `Build text story (${slides.length})`}
          </button>
          {!canBuild && !building && (
            <span style={{ fontSize: 11, color: 'var(--muted)' }}>Every slide needs text and a valid duration.</span>
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
              <span style={{ color: 'var(--success)', fontSize: 13, fontWeight: 600 }}>✓ Text story built</span>
              <button onClick={downloadResult} style={{ background: 'var(--success)', color: '#fff', fontWeight: 700, fontSize: 12, padding: '6px 14px', borderRadius: 7 }}>
                ↓ Download
              </button>
            </div>
            <video src={`/api/edit/outputs/${result.output_id}/serve`} controls
              style={{ width: '100%', maxHeight: 480, borderRadius: 8, background: '#000', display: 'block' }} />
          </div>
        )}
      </div>
    </div>
  )
}
