import { useState } from 'react'
import { ProjectClip } from '../types'

interface QueueItem {
  rowId: number
  title: string
  jobId: string | null
  downloading: boolean
  error: string | null
  start: number
  end: number
  duration: number
  mute: boolean
  label: string
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

function fmt(s: number) {
  const m = Math.floor(s / 60)
  const sec = (s % 60).toFixed(1)
  return `${m}:${sec.padStart(4, '0')}`
}

export default function RankingBuilder({ projectClips }: { projectClips: ProjectClip[] }) {
  const [queue, setQueue] = useState<QueueItem[]>([])
  const [aspectRatio, setAspectRatio] = useState('9:16')
  const [fontFamily, setFontFamily] = useState('sans-bold')
  const [fontColor, setFontColor] = useState('#ffffff')
  const [building, setBuilding] = useState(false)
  const [result, setResult] = useState<{ output_id: string; filename: string } | null>(null)
  const [error, setError] = useState('')

  const queuedRowIds = new Set(queue.map(q => q.rowId))

  async function addToQueue(pc: ProjectClip) {
    const item: QueueItem = {
      rowId: pc.row_id, title: pc.clip.title, jobId: null, downloading: true, error: null,
      start: 0, end: 0, duration: 0, mute: false, label: '',
    }
    setQueue(prev => [...prev, item])

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
      setQueue(prev => prev.map(q => q.rowId === pc.row_id
        ? { ...q, jobId, downloading: false, end: info.duration || 0, duration: info.duration || 0 }
        : q))
    } catch (e: any) {
      setQueue(prev => prev.map(q => q.rowId === pc.row_id ? { ...q, downloading: false, error: e.message || 'Failed' } : q))
    }
  }

  function removeFromQueue(rowId: number) {
    setQueue(prev => prev.filter(q => q.rowId !== rowId))
  }

  function move(rowId: number, dir: -1 | 1) {
    setQueue(prev => {
      const i = prev.findIndex(q => q.rowId === rowId)
      const j = i + dir
      if (i < 0 || j < 0 || j >= prev.length) return prev
      const next = [...prev]
      ;[next[i], next[j]] = [next[j], next[i]]
      return next
    })
  }

  function updateItem(rowId: number, patch: Partial<QueueItem>) {
    setQueue(prev => prev.map(q => q.rowId === rowId ? { ...q, ...patch } : q))
  }

  const readyItems = queue.filter(q => q.jobId && q.end > q.start)
  const canBuild = readyItems.length >= 2 && readyItems.length === queue.length

  async function build() {
    setBuilding(true)
    setError('')
    setResult(null)
    try {
      const n = queue.length
      const items = queue.map((q, i) => ({
        job_id: q.jobId, start: q.start, end: q.end, mute: q.mute,
        rank: n - i, // first item in queue = highest rank shown (e.g. queue order is countdown order)
        label: q.label, font_family: fontFamily, font_size: 0, font_color: fontColor,
      }))
      const res = await fetch('/api/ranking/build', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items, aspect_ratio: aspectRatio }),
      })
      if (!res.ok) throw new Error((await res.json()).detail || 'Build failed')
      const data = await res.json()
      setResult(data)
    } catch (e: any) {
      setError(e.message || 'Build failed')
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
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: 16, marginBottom: 20, display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ fontSize: 14, fontWeight: 700 }}>Ranking video builder</div>
      <div style={{ fontSize: 13, color: 'var(--muted)', lineHeight: 1.5 }}>
        Add saved clips to the queue in play order (e.g. countdown from last place to first), trim each, then build one combined video with rank labels burned in.
      </div>

      {/* Candidate clips not yet queued */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        {projectClips.filter(pc => !queuedRowIds.has(pc.row_id)).map(pc => (
          <button key={pc.row_id} onClick={() => addToQueue(pc)}
            style={{ background: 'var(--surface2)', border: '1px solid var(--border)', color: 'var(--text)', fontSize: 12, padding: '6px 12px', borderRadius: 7, maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            + {pc.clip.title}
          </button>
        ))}
        {projectClips.length === 0 && <div style={{ fontSize: 12, color: 'var(--muted)' }}>Save clips to this project first, then add them here.</div>}
      </div>

      {/* Queue */}
      {queue.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {queue.map((q, i) => (
            <div key={q.rowId} style={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontWeight: 700, fontSize: 12, color: 'var(--accent)', flexShrink: 0 }}>#{queue.length - i}</span>
                <span style={{ flex: 1, fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{q.title}</span>
                <button onClick={() => move(q.rowId, -1)} disabled={i === 0} style={{ background: 'none', color: 'var(--muted)', fontSize: 12, padding: '2px 6px' }}>↑</button>
                <button onClick={() => move(q.rowId, 1)} disabled={i === queue.length - 1} style={{ background: 'none', color: 'var(--muted)', fontSize: 12, padding: '2px 6px' }}>↓</button>
                <button onClick={() => removeFromQueue(q.rowId)} style={{ background: 'none', color: '#ef4444', fontSize: 13, padding: '2px 6px' }}>✕</button>
              </div>

              {q.downloading && <div style={{ fontSize: 12, color: 'var(--muted)' }}>Downloading…</div>}
              {q.error && <div style={{ fontSize: 12, color: 'var(--error)' }}>{q.error}</div>}

              {q.jobId && !q.downloading && (
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                  <label style={{ fontSize: 11, color: 'var(--muted)' }}>Start
                    <input type="number" min={0} max={q.duration} step={0.1} value={q.start}
                      onChange={e => updateItem(q.rowId, { start: parseFloat(e.target.value) || 0 })}
                      style={{ width: 70, height: 28, fontSize: 12, marginLeft: 4 }} />
                  </label>
                  <label style={{ fontSize: 11, color: 'var(--muted)' }}>End
                    <input type="number" min={0} max={q.duration} step={0.1} value={q.end}
                      onChange={e => updateItem(q.rowId, { end: parseFloat(e.target.value) || 0 })}
                      style={{ width: 70, height: 28, fontSize: 12, marginLeft: 4 }} />
                  </label>
                  <span style={{ fontSize: 11, color: 'var(--muted)' }}>of {fmt(q.duration)}</span>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, color: 'var(--muted)' }}>
                    <input type="checkbox" checked={q.mute} onChange={e => updateItem(q.rowId, { mute: e.target.checked })} style={{ width: 'auto' }} />
                    Mute
                  </label>
                  <input value={q.label} onChange={e => updateItem(q.rowId, { label: e.target.value })}
                    placeholder={`Label (default "#${queue.length - i}")`}
                    style={{ flex: 1, minWidth: 140, height: 28, fontSize: 12 }} />
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Output settings */}
      {queue.length > 0 && (
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', borderTop: '1px solid var(--border)', paddingTop: 12 }}>
          <select value={aspectRatio} onChange={e => setAspectRatio(e.target.value)} style={{ height: 32, fontSize: 12, width: 'auto' }}>
            {ASPECT_RATIOS.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
          <select value={fontFamily} onChange={e => setFontFamily(e.target.value)} style={{ height: 32, fontSize: 12, width: 'auto' }}>
            {FONTS.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
          </select>
          <input type="color" value={fontColor} onChange={e => setFontColor(e.target.value)}
            style={{ width: 36, height: 32, padding: 2, border: '1px solid var(--border)', borderRadius: 7, background: 'none' }} />
          <button onClick={build} disabled={!canBuild || building} style={{
            background: canBuild && !building ? 'var(--accent)' : 'var(--surface2)',
            color: canBuild && !building ? '#fff' : 'var(--muted)',
            fontWeight: 700, fontSize: 13, padding: '0 18px', height: 32, borderRadius: 8,
          }}>
            {building ? 'Building…' : `Build ranking video (${queue.length})`}
          </button>
          {!canBuild && queue.length > 0 && (
            <span style={{ fontSize: 11, color: 'var(--muted)' }}>Need at least 2 clips, all downloaded with a valid trim range.</span>
          )}
        </div>
      )}

      {error && <div style={{ color: 'var(--error)', fontSize: 13 }}>{error}</div>}

      {result && (
        <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 8, padding: '10px 14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ color: 'var(--success)', fontSize: 13, fontWeight: 600 }}>✓ Ranking video built</span>
          <button onClick={downloadResult} style={{ background: 'var(--success)', color: '#fff', fontWeight: 700, fontSize: 12, padding: '6px 14px', borderRadius: 7 }}>
            ↓ Download
          </button>
        </div>
      )}
    </div>
  )
}
