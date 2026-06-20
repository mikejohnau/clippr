import { useState, useEffect } from 'react'

function fmt(n?: number | null) {
  if (n == null) return '—'
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(1)}B`
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  return String(n)
}

function proxy(url?: string | null) {
  if (!url) return undefined
  return `/api/imgproxy?url=${encodeURIComponent(url)}`
}

function fmtDate(iso?: string | null) {
  if (!iso) return null
  return new Date(iso).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
}

export default function ChannelInfoModal({ channelId, onClose }: { channelId: string; onClose: () => void }) {
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    fetch(`/api/channels/info/${channelId}`)
      .then(r => { if (!r.ok) throw new Error('Not found'); return r.json() })
      .then(setData)
      .catch(() => setError('Could not load channel info'))
      .finally(() => setLoading(false))
  }, [channelId])

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div onClick={e => e.stopPropagation()} style={{ background: 'var(--surface)', borderRadius: 12, width: '100%', maxWidth: 660, maxHeight: '88vh', overflowY: 'auto', boxShadow: '0 20px 60px rgba(0,0,0,0.4)' }}>

        {loading && (
          <div style={{ padding: 48, textAlign: 'center', color: 'var(--muted)' }}>Loading channel info…</div>
        )}

        {error && (
          <div style={{ padding: 48, textAlign: 'center', color: 'var(--error)' }}>{error}</div>
        )}

        {data && (
          <>
            {/* Banner */}
            {data.banner && (
              <div style={{ height: 140, overflow: 'hidden', borderRadius: '12px 12px 0 0', background: 'var(--surface2)' }}>
                <img src={proxy(data.banner)} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                  onError={e => { (e.currentTarget.parentElement!.style.display = 'none') }} />
              </div>
            )}

            {/* Channel header */}
            <div style={{ padding: '20px 24px 0', display: 'flex', gap: 16, alignItems: 'flex-start', position: 'relative' }}>
              {data.thumbnail && (
                <img src={proxy(data.thumbnail)} alt={data.title}
                  style={{ width: 72, height: 72, borderRadius: '50%', border: '3px solid var(--surface)', flexShrink: 0, background: 'var(--surface2)' }}
                  onError={e => { e.currentTarget.style.display = 'none' }} />
              )}
              <div style={{ flex: 1, minWidth: 0, paddingTop: 4 }}>
                <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--text)', lineHeight: 1.2 }}>{data.title}</div>
                {data.custom_url && <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 3 }}>{data.custom_url}</div>}
                {data.country && <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>📍 {data.country}</div>}
              </div>
              <button onClick={onClose} style={{ background: 'none', color: 'var(--muted)', fontSize: 20, padding: 4, flexShrink: 0, lineHeight: 1 }}>✕</button>
            </div>

            {/* Stats row */}
            <div style={{ display: 'flex', margin: '20px 24px 0', borderRadius: 8, overflow: 'hidden', border: '1px solid var(--border)' }}>
              {[
                { label: 'Subscribers', value: fmt(data.subscribers) },
                { label: 'Total Views', value: fmt(data.total_views) },
                { label: 'Videos', value: fmt(data.video_count) },
                { label: 'Joined', value: fmtDate(data.published_at) || '—' },
              ].map((s, i) => (
                <div key={s.label} style={{ flex: 1, textAlign: 'center', padding: '14px 6px', borderRight: i < 3 ? '1px solid var(--border)' : 'none', background: 'var(--surface2)' }}>
                  <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--text)' }}>{s.value}</div>
                  <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 2, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{s.label}</div>
                </div>
              ))}
            </div>

            {/* Description */}
            {data.description && (
              <div style={{ margin: '20px 24px 0' }}>
                <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--muted)', marginBottom: 8 }}>About</div>
                <div style={{ fontSize: 13, color: 'var(--text)', lineHeight: 1.6, whiteSpace: 'pre-line', opacity: 0.85 }}>
                  {data.description}{data.description.length >= 600 ? '…' : ''}
                </div>
              </div>
            )}

            {/* Recent videos */}
            {data.recent_videos?.length > 0 && (
              <div style={{ margin: '20px 24px 0' }}>
                <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--muted)', marginBottom: 12 }}>Recent Videos</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {data.recent_videos.map((v: any) => (
                    <a key={v.id} href={v.url} target="_blank" rel="noreferrer" style={{ display: 'flex', gap: 12, alignItems: 'center', textDecoration: 'none', padding: '8px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface)', transition: 'box-shadow 0.15s' }}
                      onMouseEnter={e => (e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.07)')}
                      onMouseLeave={e => (e.currentTarget.style.boxShadow = 'none')}>
                      {v.thumbnail && <img src={proxy(v.thumbnail)} alt="" style={{ width: 80, height: 52, objectFit: 'cover', borderRadius: 5, flexShrink: 0, background: 'var(--surface2)' }} onError={e => { e.currentTarget.style.display = 'none' }} />}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>{v.title}</div>
                        <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 3, display: 'flex', gap: 10 }}>
                          {v.views != null && <span>▶ {fmt(v.views)}</span>}
                          {v.likes != null && <span>♥ {fmt(v.likes)}</span>}
                          {v.published_at && <span>{fmtDate(v.published_at)}</span>}
                        </div>
                      </div>
                      <span style={{ color: 'var(--muted)', fontSize: 14, flexShrink: 0 }}>↗</span>
                    </a>
                  ))}
                </div>
              </div>
            )}

            {/* Footer action */}
            <div style={{ padding: '20px 24px' }}>
              <a href={data.url} target="_blank" rel="noreferrer" style={{ display: 'block', textAlign: 'center', padding: '10px 0', background: '#ff0000', color: '#fff', borderRadius: 6, textDecoration: 'none', fontWeight: 700, fontSize: 13 }}>
                Open Channel on YouTube ↗
              </a>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
