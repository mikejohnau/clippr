import { useEffect, useState } from 'react'
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

export default function RankingBuilder({ projectClips, onRemove }: {
  projectClips: ProjectClip[]
  onRemove: (rowId: number) => void
}) {
  // Order of row_ids — defaults to project order, reorderable, synced when clips are added/removed elsewhere
  const [order, setOrder] = useState<number[]>([])
  const [items, setItems] = useState<Record<number, ItemState>>({})
  const [aspectRatio, setAspectRatio] = useState('9:16')
  const [fontFamily, setFontFamily] = useState('sans-bold')
  const [fontColor, setFontColor] = useState('#ffffff')
  const [building, setBuilding] = useState(false)
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

  const orderedClips = order.map(id => projectClips.find(pc => pc.row_id === id)).filter(Boolean) as ProjectClip[]
  const readyCount = orderedClips.filter(pc => {
    const it = items[pc.row_id]
    return it?.jobId && it.end > it.start
  }).length
  const canBuild = orderedClips.length >= 2 && readyCount === orderedClips.length

  async function build() {
    setBuilding(true)
    setBuildError('')
    setResult(null)
    try {
      const n = orderedClips.length
      const reqItems = orderedClips.map((pc, i) => {
        const it = items[pc.row_id]
        return {
          job_id: it.jobId, start: it.start, end: it.end, mute: it.mute,
          rank: n - i, label: it.label, font_family: fontFamily, font_size: 0, font_color: fontColor,
        }
      })
      const res = await fetch('/api/ranking/build', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: reqItems, aspect_ratio: aspectRatio }),
      })
      if (!res.ok) throw new Error((await res.json()).detail || 'Build failed')
      setResult(await res.json())
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
        <div style={{ fontSize: 14, fontWeight: 700 }}>Ranking video builder</div>
        <div style={{ fontSize: 13, color: 'var(--muted)', lineHeight: 1.5 }}>
          Every clip saved to this project is part of the build, in the order below. Reorder, prepare (download), trim, and label each one, then build the combined video.
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
                      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                        <label style={{ fontSize: 11, color: 'var(--muted)' }}>Start
                          <input type="number" min={0} max={it.duration} step={0.1} value={it.start}
                            onChange={e => update(pc.row_id, { start: parseFloat(e.target.value) || 0 })}
                            style={{ width: 64, height: 28, fontSize: 12, marginLeft: 4 }} />
                        </label>
                        <label style={{ fontSize: 11, color: 'var(--muted)' }}>End
                          <input type="number" min={0} max={it.duration} step={0.1} value={it.end}
                            onChange={e => update(pc.row_id, { end: parseFloat(e.target.value) || 0 })}
                            style={{ width: 64, height: 28, fontSize: 12, marginLeft: 4 }} />
                        </label>
                        <span style={{ fontSize: 11, color: 'var(--muted)' }}>of {fmt(it.duration)}</span>
                        <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, color: 'var(--muted)' }}>
                          <input type="checkbox" checked={it.mute} onChange={e => update(pc.row_id, { mute: e.target.checked })} style={{ width: 'auto' }} />
                          Mute
                        </label>
                        <input value={it.label} onChange={e => update(pc.row_id, { label: e.target.value })}
                          placeholder={`Label (default "#${orderedClips.length - i}")`}
                          style={{ flex: 1, minWidth: 120, height: 28, fontSize: 12 }} />
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
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
            <select value={aspectRatio} onChange={e => setAspectRatio(e.target.value)} style={{ height: 34, fontSize: 12, width: 'auto' }}>
              {ASPECT_RATIOS.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
            <select value={fontFamily} onChange={e => setFontFamily(e.target.value)} style={{ height: 34, fontSize: 12, width: 'auto' }}>
              {FONTS.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
            </select>
            <input type="color" value={fontColor} onChange={e => setFontColor(e.target.value)}
              style={{ width: 38, height: 34, padding: 2, border: '1px solid var(--border)', borderRadius: 7, background: 'none' }} />
            <button onClick={build} disabled={!canBuild || building} style={{
              background: canBuild && !building ? 'var(--accent)' : 'var(--surface2)',
              color: canBuild && !building ? '#fff' : 'var(--muted)',
              fontWeight: 700, fontSize: 13, padding: '0 18px', height: 34, borderRadius: 8,
            }}>
              {building ? 'Building…' : `Build ranking video (${orderedClips.length})`}
            </button>
            {!canBuild && (
              <span style={{ fontSize: 11, color: 'var(--muted)' }}>
                {orderedClips.length < 2 ? 'Add at least 2 clips to this project.' : 'Prepare every clip above (with a valid trim range) to enable building.'}
              </span>
            )}
          </div>

          {buildError && <div style={{ color: 'var(--error)', fontSize: 13 }}>{buildError}</div>}

          {result && (
            <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 8, padding: '10px 14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--success)', fontSize: 13, fontWeight: 600 }}>✓ Ranking video built</span>
              <button onClick={downloadResult} style={{ background: 'var(--success)', color: '#fff', fontWeight: 700, fontSize: 12, padding: '6px 14px', borderRadius: 7 }}>
                ↓ Download
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
