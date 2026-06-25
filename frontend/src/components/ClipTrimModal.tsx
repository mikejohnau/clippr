import { useRef, useState } from 'react'

export interface ClipItemState {
  jobId: string | null
  downloading: boolean
  error: string | null
  start: number
  end: number
  duration: number
  mute: boolean
  label: string
}

export function fmt(s: number) {
  const m = Math.floor(s / 60)
  const sec = (s % 60).toFixed(1)
  return `${m}:${sec.padStart(4, '0')}`
}

// One clip at a time, in a much bigger player than an inline row would allow.
// `labelPlaceholder` is optional — omit it to hide the free-text label input
// entirely (e.g. split-screen clips don't need a rank-style label).
export function ClipTrimModal({ title, jobId, item, onUpdate, onClose, labelPlaceholder }: {
  title: string
  jobId: string
  item: ClipItemState
  onUpdate: (patch: Partial<ClipItemState>) => void
  onClose: () => void
  labelPlaceholder?: string
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

          {labelPlaceholder !== undefined && (
            <input value={item.label} onChange={e => onUpdate({ label: e.target.value })}
              placeholder={labelPlaceholder}
              style={{ height: 38, fontSize: 13 }} />
          )}

          <button onClick={onClose} style={{ background: 'var(--accent)', color: '#fff', fontWeight: 700, fontSize: 13, padding: '10px 0', borderRadius: 8 }}>
            Done
          </button>
        </div>
      </div>
    </div>
  )
}
