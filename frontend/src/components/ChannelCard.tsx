import { useState } from 'react'
import ChannelInfoModal from './ChannelInfoModal'

interface Channel {
  id: string
  title: string
  thumbnail: string | null
  subscribers: number
  recent_views: number
  momentum: number
  url: string
}

function fmt(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  return String(n)
}

function momentumLabel(m: number) {
  if (m >= 100) return { label: '🚀 Exploding', color: '#ef4444' }
  if (m >= 10)  return { label: '🔥 Hot', color: '#f97316' }
  if (m >= 2)   return { label: '📈 Rising', color: '#eab308' }
  return { label: '📊 Steady', color: '#6b7280' }
}

export default function ChannelCard({ channel, onSearch }: { channel: Channel, onSearch: (topic: string) => void }) {
  const [showInfo, setShowInfo] = useState(false)
  const badge = momentumLabel(channel.momentum)

  return (
    <>
      {showInfo && <ChannelInfoModal channelId={channel.id} onClose={() => setShowInfo(false)} />}

      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden', display: 'flex', flexDirection: 'column', transition: 'box-shadow 0.15s' }}
        onMouseEnter={e => (e.currentTarget.style.boxShadow = '0 4px 16px rgba(0,0,0,0.08)')}
        onMouseLeave={e => (e.currentTarget.style.boxShadow = 'none')}>

        {/* Avatar — clickable to open modal */}
        <div onClick={() => setShowInfo(true)} style={{ position: 'relative', paddingTop: '56.25%', background: 'var(--surface2)', cursor: 'pointer' }}>
          {channel.thumbnail
            ? <img src={channel.thumbnail} alt={channel.title} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} onError={e => { e.currentTarget.style.display = 'none' }} />
            : <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 32 }}>📺</div>
          }
          <span style={{ position: 'absolute', top: 8, right: 8, background: badge.color, color: '#fff', borderRadius: 4, padding: '2px 8px', fontSize: 10, fontWeight: 700 }}>
            {badge.label}
          </span>
        </div>

        {/* Info */}
        <div style={{ padding: '12px 14px', flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
          <button onClick={() => setShowInfo(true)} style={{ background: 'none', padding: 0, textAlign: 'left', fontSize: 13, fontWeight: 700, color: 'var(--text)', overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}
            onMouseEnter={e => (e.currentTarget.style.color = 'var(--accent)')}
            onMouseLeave={e => (e.currentTarget.style.color = 'var(--text)')}>
            {channel.title}
          </button>

          <div style={{ display: 'flex', gap: 12, color: 'var(--muted)', fontSize: 12 }}>
            <span>👥 {fmt(channel.subscribers)} subs</span>
            <span>▶ {fmt(channel.recent_views)} recent views</span>
          </div>

          <div style={{ fontSize: 11, color: 'var(--muted)' }}>
            Momentum: <strong style={{ color: 'var(--text)' }}>{channel.momentum.toFixed(1)}×</strong> views/sub
          </div>

          <div style={{ marginTop: 'auto', paddingTop: 10, display: 'flex', gap: 6 }}>
            <button onClick={() => setShowInfo(true)} style={{ flex: '0 0 auto', padding: '7px 12px', border: '1px solid var(--border)', background: 'none', color: 'var(--muted)', fontSize: 12, fontWeight: 500 }}>
              ℹ Channel
            </button>
            <button onClick={() => onSearch(channel.title)} style={{ flex: 1, background: 'var(--accent)', color: '#fff', fontWeight: 600, fontSize: 12 }}>
              Find clips
            </button>
          </div>
        </div>
      </div>
    </>
  )
}
