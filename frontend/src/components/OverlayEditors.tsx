// Shared constants + form sections for the title overlay and CTA overlay,
// used by both the ranking builder and the split-screen builder (and any
// future template that wants the same burned-in text overlays).

export const FONTS = [
  { id: 'sans-bold', name: 'Sans Bold' },
  { id: 'sans-regular', name: 'Sans Regular' },
  { id: 'serif-bold', name: 'Serif Bold' },
  { id: 'mono-bold', name: 'Mono Bold' },
]

export const ASPECT_RATIOS = [
  { id: '9:16', name: '9:16 — Shorts / Reels / TikTok' },
  { id: '1:1', name: '1:1 — Square' },
  { id: '4:5', name: '4:5 — Instagram feed' },
  { id: '16:9', name: '16:9 — Landscape' },
]

export const POSITIONS = [
  { id: 'top-left', name: 'Top left' },
  { id: 'top-center', name: 'Top center' },
  { id: 'top-right', name: 'Top right' },
  { id: 'bottom-left', name: 'Bottom left' },
  { id: 'bottom-center', name: 'Bottom center' },
  { id: 'bottom-right', name: 'Bottom right' },
]

export const CTA_POSITIONS = [...POSITIONS, { id: 'center', name: 'Center' }]

export const CTA_ANIMATIONS = [
  { id: 'none', name: 'None (just appears)' },
  { id: 'fade', name: 'Fade in/out' },
  { id: 'slide', name: 'Slide in, fade out' },
]

export const CTA_MOMENTS = [
  { id: 'start', name: 'Start' },
  { id: 'middle', name: 'Middle' },
  { id: 'end', name: 'End' },
]

export const TITLE_TEMPLATES = [
  { id: 'none', name: 'No title overlay' },
  { id: 'bold-bottom', name: 'Bold Caption (Bottom)' },
  { id: 'lower-third', name: 'Lower Third' },
  { id: 'top-banner', name: 'Top Banner' },
]

export function TitleOverlayEditor({
  titleText, setTitleText, titleTemplate, setTitleTemplate,
  titleFontFamily, setTitleFontFamily, titleFontSize, setTitleFontSize, titleFontColor, setTitleFontColor,
  titleBgColor, setTitleBgColor, titleBgEnabled, setTitleBgEnabled,
  titleStrokeWidth, setTitleStrokeWidth, titleStrokeColor, setTitleStrokeColor,
  titleStrokeColorEnabled, setTitleStrokeColorEnabled,
}: {
  titleText: string; setTitleText: (v: string) => void
  titleTemplate: string; setTitleTemplate: (v: string) => void
  titleFontFamily: string; setTitleFontFamily: (v: string) => void
  titleFontSize: number; setTitleFontSize: (v: number) => void
  titleFontColor: string; setTitleFontColor: (v: string) => void
  titleBgColor: string; setTitleBgColor: (v: string) => void
  titleBgEnabled: boolean; setTitleBgEnabled: (v: boolean) => void
  titleStrokeWidth: number; setTitleStrokeWidth: (v: number) => void
  titleStrokeColor: string; setTitleStrokeColor: (v: string) => void
  titleStrokeColorEnabled: boolean; setTitleStrokeColorEnabled: (v: boolean) => void
}) {
  return (
    <div>
      <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 8 }}>Title overlay (optional — shown throughout the whole final video)</div>
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
  )
}

export function CtaEditor({
  ctaText, setCtaText, ctaDuration, setCtaDuration, ctaMoments, toggleCtaMoment,
  ctaPosition, setCtaPosition, ctaAnimation, setCtaAnimation, ctaTransition, setCtaTransition,
  ctaFontFamily, setCtaFontFamily, ctaFontSize, setCtaFontSize, ctaFontColor, setCtaFontColor,
  ctaBgColor, setCtaBgColor, ctaBgEnabled, setCtaBgEnabled,
}: {
  ctaText: string; setCtaText: (v: string) => void
  ctaDuration: number; setCtaDuration: (v: number) => void
  ctaMoments: string[]; toggleCtaMoment: (id: string) => void
  ctaPosition: string; setCtaPosition: (v: string) => void
  ctaAnimation: string; setCtaAnimation: (v: string) => void
  ctaTransition: number; setCtaTransition: (v: number) => void
  ctaFontFamily: string; setCtaFontFamily: (v: string) => void
  ctaFontSize: number; setCtaFontSize: (v: number) => void
  ctaFontColor: string; setCtaFontColor: (v: string) => void
  ctaBgColor: string; setCtaBgColor: (v: string) => void
  ctaBgEnabled: boolean; setCtaBgEnabled: (v: boolean) => void
}) {
  return (
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
  )
}
