import { useState } from 'react'
import { Clip, DownloadJob, Project } from '../types'
import ChannelInfoModal from './ChannelInfoModal'
import SaveToProjectModal from './SaveToProjectModal'
import EditModal from './EditModal'

const PLATFORM_COLOR: Record<string, string> = {
  youtube: '#ff0000', tiktok: '#010101', reddit: '#ff4500', instagram: '#E1306C',
}
const PLATFORM_LABEL: Record<string, string> = {
  youtube: 'YouTube', tiktok: 'TikTok', reddit: 'Reddit', instagram: 'Instagram',
}

// Instagram/TikTok CDN thumbnails set Cross-Origin-Resource-Policy: same-origin,
// which browsers block from loading directly in an <img> tag cross-origin.
// Proxy those through our own backend so the browser only ever sees same-origin
// bytes; YouTube's CDN doesn't set this so it's safe to load directly.
function thumbSrc(clip: Clip): string | undefined {
  if (!clip.thumbnail) return undefined
  if (clip.platform === 'youtube') return clip.thumbnail
  return `/api/imgproxy?url=${encodeURIComponent(clip.thumbnail)}`
}

function fmt(n?: number) {
  if (n == null) return '—'
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  return String(n)
}

function fmtDate(iso?: string) {
  if (!iso) return null
  return new Date(iso).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
}

function fmtDuration(iso?: string) {
  if (!iso) return null
  const m = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/)
  if (!m) return null
  const h = parseInt(m[1] || '0'), min = parseInt(m[2] || '0'), s = parseInt(m[3] || '0')
  if (h) return `${h}:${String(min).padStart(2,'0')}:${String(s).padStart(2,'0')}`
  return `${min}:${String(s).padStart(2,'0')}`
}

function youtubeId(url: string) {
  const m = url.match(/[?&]v=([^&]+)/) || url.match(/youtu\.be\/([^?]+)/)
  return m ? m[1] : null
}

// ── Preview modal ────────────────────────────────────────────────────────────

function PreviewModal({ clip, onClose }: { clip: Clip; onClose: () => void }) {
  const ytId = clip.platform === 'youtube' ? youtubeId(clip.url) : null
  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,0.85)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div onClick={e => e.stopPropagation()} style={{ width: '90vw', maxWidth: 860, position: 'relative' }}>
        <button onClick={onClose} style={{ position: 'absolute', top: -40, right: 0, background: 'none', color: '#fff', fontSize: 28, padding: 0, lineHeight: 1 }}>✕</button>
        {ytId ? (
          <div style={{ position: 'relative', paddingTop: '56.25%', background: '#000', borderRadius: 10, overflow: 'hidden' }}>
            <iframe src={`https://www.youtube.com/embed/${ytId}?autoplay=1`} allow="autoplay; encrypted-media" allowFullScreen
              style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', border: 'none' }} />
          </div>
        ) : (
          <div style={{ background: 'var(--surface)', borderRadius: 10, padding: '40px 32px', textAlign: 'center', color: 'var(--muted)' }}>
            {clip.thumbnail && <img src={thumbSrc(clip)} alt={clip.title} style={{ width: '100%', maxHeight: 300, objectFit: 'cover', borderRadius: 8, marginBottom: 20 }} />}
            <div style={{ fontSize: 14, marginBottom: 16 }}>Inline preview not available for {PLATFORM_LABEL[clip.platform]}.</div>
            <a href={clip.url} target="_blank" rel="noreferrer" style={{ background: PLATFORM_COLOR[clip.platform], color: '#fff', padding: '10px 24px', borderRadius: 6, textDecoration: 'none', fontWeight: 600, fontSize: 13 }}>
              Open on {PLATFORM_LABEL[clip.platform]} ↗
            </a>
          </div>
        )}
        <div style={{ color: '#fff', marginTop: 12, fontSize: 13, fontWeight: 600, textAlign: 'center' }}>{clip.title}</div>
      </div>
    </div>
  )
}

// ── Info modal ───────────────────────────────────────────────────────────────

function InfoModal({ clip, onClose, onViewChannel }: { clip: Clip; onClose: () => void; onViewChannel?: () => void }) {
  const dur = fmtDuration(clip.duration)
  const date = fmtDate(clip.published_at)
  const channelUrl = clip.channel_id ? `https://www.youtube.com/channel/${clip.channel_id}` : null

  const rows: [string, React.ReactNode][] = [
    ['Title', clip.title],
    ['Platform', PLATFORM_LABEL[clip.platform] || clip.platform],
    ...(clip.channel_name ? [['Channel', channelUrl
      ? <a href={channelUrl} target="_blank" rel="noreferrer" style={{ color: 'var(--accent)' }}>{clip.channel_name} ↗</a>
      : clip.channel_name] as [string, React.ReactNode]] : []),
    ...(date ? [['Published', date] as [string, React.ReactNode]] : []),
    ...(dur ? [['Duration', dur] as [string, React.ReactNode]] : []),
    ...(clip.views != null ? [['Views', fmt(clip.views)] as [string, React.ReactNode]] : []),
    ...(clip.likes != null ? [['Likes', fmt(clip.likes)] as [string, React.ReactNode]] : []),
    ...(clip.comments != null ? [['Comments', fmt(clip.comments)] as [string, React.ReactNode]] : []),
    ...(clip.category ? [['Category', clip.category] as [string, React.ReactNode]] : []),
  ]

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div onClick={e => e.stopPropagation()} style={{
        background: 'var(--surface)', borderRadius: 12, width: '100%', maxWidth: 620,
        maxHeight: '85vh', overflowY: 'auto', boxShadow: '0 20px 60px rgba(0,0,0,0.4)',
      }}>
        {/* Header */}
        <div style={{ display: 'flex', gap: 16, padding: '20px 24px', borderBottom: '1px solid var(--border)', alignItems: 'flex-start' }}>
          {clip.thumbnail && <img src={thumbSrc(clip)} alt="" style={{ width: 120, height: 78, objectFit: 'cover', borderRadius: 6, flexShrink: 0 }} />}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)', lineHeight: 1.4, marginBottom: 6 }}>{clip.title}</div>
            {clip.channel_name && (
              <div style={{ fontSize: 12, color: 'var(--muted)' }}>
                {channelUrl
                  ? <a href={channelUrl} target="_blank" rel="noreferrer" style={{ color: 'var(--accent)', fontWeight: 600 }}>{clip.channel_name}</a>
                  : <span style={{ fontWeight: 600 }}>{clip.channel_name}</span>}
              </div>
            )}
          </div>
          <button onClick={onClose} style={{ background: 'none', color: 'var(--muted)', fontSize: 20, padding: 4, flexShrink: 0, lineHeight: 1 }}>✕</button>
        </div>

        {/* Stats row */}
        <div style={{ display: 'flex', gap: 0, borderBottom: '1px solid var(--border)' }}>
          {[
            { label: 'Views', value: fmt(clip.views) },
            { label: 'Likes', value: fmt(clip.likes) },
            { label: 'Comments', value: fmt(clip.comments) },
            { label: 'Duration', value: dur || '—' },
          ].map(s => (
            <div key={s.label} style={{ flex: 1, textAlign: 'center', padding: '14px 8px', borderRight: '1px solid var(--border)' }}>
              <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--text)' }}>{s.value}</div>
              <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>{s.label}</div>
            </div>
          ))}
        </div>

        {/* Meta table */}
        <div style={{ padding: '16px 24px' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <tbody>
              {rows.map(([label, value]) => (
                <tr key={label} style={{ borderBottom: '1px solid var(--border)' }}>
                  <td style={{ padding: '8px 0', color: 'var(--muted)', width: 110, verticalAlign: 'top', fontWeight: 500 }}>{label}</td>
                  <td style={{ padding: '8px 0', color: 'var(--text)', wordBreak: 'break-word' }}>{value}</td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* Description */}
          {clip.description && (
            <div style={{ marginTop: 16 }}>
              <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--muted)', marginBottom: 8 }}>Description</div>
              <div style={{ fontSize: 13, color: 'var(--text)', lineHeight: 1.6, whiteSpace: 'pre-line', opacity: 0.85 }}>{clip.description}{clip.description.length >= 500 ? '…' : ''}</div>
            </div>
          )}

          {/* Tags */}
          {clip.tags && clip.tags.length > 0 && (
            <div style={{ marginTop: 16 }}>
              <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--muted)', marginBottom: 8 }}>Tags</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {clip.tags.map(tag => (
                  <span key={tag} style={{ background: 'var(--surface2)', color: 'var(--muted)', borderRadius: 20, padding: '3px 10px', fontSize: 11 }}>{tag}</span>
                ))}
              </div>
            </div>
          )}

          {/* Actions */}
          <div style={{ display: 'flex', gap: 8, marginTop: 20 }}>
            <a href={clip.url} target="_blank" rel="noreferrer" style={{
              flex: 1, textAlign: 'center', padding: '9px 0',
              background: PLATFORM_COLOR[clip.platform], color: '#fff',
              borderRadius: 6, textDecoration: 'none', fontWeight: 600, fontSize: 13,
            }}>
              Watch on {PLATFORM_LABEL[clip.platform]} ↗
            </a>
            {clip.channel_id && onViewChannel && (
              <button onClick={onViewChannel} style={{
                flex: 1, padding: '9px 0',
                border: '1px solid var(--border)', background: 'none', color: 'var(--text)',
                fontWeight: 600, fontSize: 13,
              }}>
                Channel Info
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Card ─────────────────────────────────────────────────────────────────────

const ERROR_COPY: Record<string, { label: string; detail: string; action?: string }> = {
  instagram_login_required: {
    label: 'Login required',
    detail: 'Instagram is blocking anonymous downloads. Upload your session cookies in Settings to fix this.',
    action: 'Open Settings',
  },
  tiktok_blocked: {
    label: 'Blocked',
    detail: "TikTok's bot detection rejected this request. This usually clears up on its own — try again shortly.",
  },
  video_unavailable: {
    label: 'Unavailable',
    detail: 'The source removed or restricted this video — it can no longer be downloaded.',
  },
  rate_limited: {
    label: 'Rate limited',
    detail: 'Too many requests in a short time. Wait a minute and retry.',
  },
  unknown: {
    label: 'Failed',
    detail: 'The download failed for an unrecognized reason — see the full error below.',
  },
}

export default function ClipCard({
  clip, saved, onToggleSave, projects, onSaveToProject, previouslyDownloaded, onOpenInstagramSettings,
}: {
  clip: Clip
  saved?: boolean
  onToggleSave?: (clip: Clip) => void
  projects?: Project[]
  onSaveToProject?: (clip: Clip, projectId: string) => void
  previouslyDownloaded?: boolean
  onOpenInstagramSettings?: () => void
}) {
  const [job, setJob] = useState<DownloadJob | null>(null)
  const [polling, setPolling] = useState(false)
  const [previewing, setPreviewing] = useState(false)
  const [showInfo, setShowInfo] = useState(false)
  const [showChannel, setShowChannel] = useState(false)
  const [showSaveModal, setShowSaveModal] = useState(false)
  const [showEdit, setShowEdit] = useState(false)

  async function startEdit() {
    const res = await fetch('/api/download/', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: clip.url, title: clip.title }),
    })
    const data: DownloadJob = await res.json()
    setJob(data)
    poll(data.job_id)
  }

  function poll(jobId: string) {
    setPolling(true)
    const interval = setInterval(async () => {
      const data: DownloadJob = await fetch(`/api/download/${jobId}`).then(r => r.json())
      setJob(data)
      if (data.status === 'done' || data.status === 'error') {
        clearInterval(interval)
        setPolling(false)
        if (data.status === 'done') {
          fetch('/api/downloads-history/', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ clip_id: clip.id, platform: clip.platform, title: clip.title }),
          }).catch(() => {})
          setShowEdit(true)
        }
      }
    }, 1500)
  }

  const color = PLATFORM_COLOR[clip.platform]
  const dur = fmtDuration(clip.duration)

  return (
    <>
      {previewing && <PreviewModal clip={clip} onClose={() => setPreviewing(false)} />}
      {showInfo && <InfoModal clip={clip} onClose={() => setShowInfo(false)} onViewChannel={clip.channel_id ? () => { setShowInfo(false); setShowChannel(true) } : undefined} />}
      {showChannel && clip.channel_id && <ChannelInfoModal channelId={clip.channel_id} onClose={() => setShowChannel(false)} />}
      {showSaveModal && projects && onSaveToProject && (
        <SaveToProjectModal clip={clip} projects={projects}
          onSave={pid => { onSaveToProject(clip, pid); setShowSaveModal(false) }}
          onClose={() => setShowSaveModal(false)} />
      )}
      {showEdit && job?.job_id && (
        <EditModal jobId={job.job_id} title={clip.title} onClose={() => setShowEdit(false)} />
      )}

      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden', display: 'flex', flexDirection: 'column', transition: 'box-shadow 0.18s, transform 0.18s' }}
        onMouseEnter={e => { e.currentTarget.style.boxShadow = 'var(--card-shadow-hover)'; e.currentTarget.style.transform = 'translateY(-2px)' }}
        onMouseLeave={e => { e.currentTarget.style.boxShadow = 'none'; e.currentTarget.style.transform = 'none' }}>

        {/* Thumbnail */}
        <div onClick={() => setPreviewing(true)} style={{ position: 'relative', paddingTop: '56.25%', background: 'var(--surface2)', cursor: 'pointer' }}>
          {clip.thumbnail && <img src={thumbSrc(clip)} alt={clip.title} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />}
          {!clip.thumbnail && <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#cbd5e1', fontSize: 28 }}>▶</div>}

          {/* Play overlay */}
          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0)', transition: 'background 0.15s' }}
            onMouseEnter={e => (e.currentTarget.style.background = 'rgba(0,0,0,0.35)')}
            onMouseLeave={e => (e.currentTarget.style.background = 'rgba(0,0,0,0)')}>
            <div style={{ width: 44, height: 44, borderRadius: '50%', background: 'rgba(255,255,255,0.9)', color: '#0c0e14', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, paddingLeft: 3, opacity: 0.85 }}>▶</div>
          </div>

          {/* Platform badge — bottom-left, same row as duration in the opposite corner */}
          <span style={{ position: 'absolute', bottom: 6, left: 6, background: color, color: '#fff', borderRadius: 4, padding: '3px 9px', fontSize: 11, fontWeight: 700, letterSpacing: '0.04em' }}>
            {PLATFORM_LABEL[clip.platform]}
          </span>

          {/* Duration */}
          {dur && <span style={{ position: 'absolute', bottom: 6, right: 6, background: 'rgba(0,0,0,0.75)', color: '#fff', borderRadius: 4, padding: '2px 7px', fontSize: 11, fontWeight: 600 }}>{dur}</span>}

          {/* Previously downloaded badge — offset below where the search-results selection checkbox sits (top:10/left:10, 20x20) so they never overlap */}
          {previouslyDownloaded && (
            <span style={{ position: 'absolute', top: 38, left: 8, background: 'rgba(22,163,74,0.85)', color: '#fff', borderRadius: 4, padding: '3px 8px', fontSize: 11, fontWeight: 700 }}>↓ Downloaded</span>
          )}

          {/* Save button */}
          {(onToggleSave || (projects && onSaveToProject)) && (
            <button
              onClick={e => {
                e.stopPropagation()
                if (saved && onToggleSave) onToggleSave(clip)
                else if (projects && onSaveToProject) setShowSaveModal(true)
              }}
              title={saved ? 'Remove from project' : 'Save to project'}
              style={{ position: 'absolute', top: 6, right: 6, background: saved ? '#f59e0b' : 'rgba(0,0,0,0.5)', color: '#fff', borderRadius: '50%', width: 28, height: 28, fontSize: 13, padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', lineHeight: 1 }}>
              {saved ? '★' : '☆'}
            </button>
          )}
        </div>

        {/* Info */}
        <div style={{ padding: '12px 14px 14px', flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>

          {/* Channel name */}
          {clip.channel_name && (
            <div style={{ fontSize: 12, color: 'var(--muted)', overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis', letterSpacing: '0.01em' }}>
              {clip.channel_id
                ? <button onClick={e => { e.stopPropagation(); setShowChannel(true) }}
                    style={{ background: 'none', color: 'var(--muted)', padding: 0, fontSize: 12, fontWeight: 500, textAlign: 'left', border: 'none' }}
                    onMouseEnter={e => (e.currentTarget.style.color = 'var(--accent)')}
                    onMouseLeave={e => (e.currentTarget.style.color = 'var(--muted)')}>
                    {clip.channel_name}
                  </button>
                : clip.channel_name}
            </div>
          )}

          <div style={{ fontSize: 14, fontWeight: 600, lineHeight: 1.45, color: 'var(--text)', overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
            {clip.title}
          </div>

          <div style={{ display: 'flex', gap: 10, color: 'var(--muted)', fontSize: 12, marginTop: 1 }}>
            {clip.views != null && <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}><span style={{ opacity: 0.6 }}>▶</span> {fmt(clip.views)}</span>}
            {clip.likes != null && <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}><span style={{ color: '#f43f5e' }}>♥</span> {fmt(clip.likes)}</span>}
            {clip.comments != null && <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}><span style={{ opacity: 0.6 }}>💬</span> {fmt(clip.comments)}</span>}
          </div>

          {/* Actions */}
          <div style={{ marginTop: 'auto', paddingTop: 8, display: 'flex', gap: 5, alignItems: 'center' }}>
            <button onClick={() => setPreviewing(true)} title="Preview" style={{ flex: '0 0 auto', width: 34, height: 34, border: '1px solid var(--border)', background: 'var(--surface2)', color: 'var(--muted)', fontSize: 12, padding: 0, borderRadius: 7, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>▶</button>
            <button onClick={() => setShowInfo(true)} title="Info" style={{ flex: '0 0 auto', width: 34, height: 34, border: '1px solid var(--border)', background: 'var(--surface2)', color: 'var(--muted)', fontSize: 13, padding: 0, borderRadius: 7, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>ℹ</button>
            <a href={clip.url} target="_blank" rel="noreferrer" title="Open" style={{ flex: '0 0 auto', width: 34, height: 34, border: '1px solid var(--border)', background: 'var(--surface2)', borderRadius: 7, color: 'var(--muted)', textDecoration: 'none', fontSize: 13, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>↗</a>

            {job?.status === 'error' ? (() => {
              const info = ERROR_COPY[job.error_type || 'unknown']
              return (
                <div style={{ flex: 1, display: 'flex', gap: 4 }}>
                  <div title={`${info.detail}${job.error ? `\n\n${job.error}` : ''}`}
                    style={{ flex: 1, textAlign: 'center', height: 34, lineHeight: '34px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 7, color: 'var(--error)', fontSize: 13, fontWeight: 600, cursor: 'help', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', padding: '0 8px' }}>
                    {info.label}
                  </div>
                  {info.action && onOpenInstagramSettings ? (
                    <button onClick={onOpenInstagramSettings} style={{ height: 34, padding: '0 10px', background: 'var(--accent)', color: '#fff', fontWeight: 700, border: 'none', fontSize: 13, borderRadius: 7, whiteSpace: 'nowrap' }}>
                      {info.action}
                    </button>
                  ) : (
                    <button onClick={startEdit} style={{ height: 34, padding: '0 10px', background: 'var(--surface2)', color: 'var(--muted)', border: '1px solid var(--border)', fontSize: 13, borderRadius: 7 }}>
                      Retry
                    </button>
                  )}
                </div>
              )
            })() : job?.status === 'done' ? (
              <button onClick={() => setShowEdit(true)} style={{ flex: 1, height: 34, background: 'var(--accent)', color: '#fff', fontWeight: 700, fontSize: 13, borderRadius: 7 }}>
                ✂ Open Editor
              </button>
            ) : (
              <button onClick={startEdit} disabled={polling} style={{ flex: 1, height: 34, background: polling ? 'var(--surface2)' : 'var(--accent)', color: polling ? 'var(--muted)' : '#fff', border: polling ? '1px solid var(--border)' : 'none', fontWeight: 700, fontSize: 13, borderRadius: 7 }}>
                {polling ? (job?.status === 'queued' ? 'Preparing…' : 'Downloading…') : '✂ Edit'}
              </button>
            )}
          </div>
        </div>
      </div>
    </>
  )
}
