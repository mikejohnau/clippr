import { useState } from 'react'

interface Section {
  id: string
  title: string
  icon: string
  body: React.ReactNode
}

export default function HelpModal({ onClose, onOpenSettings }: { onClose: () => void; onOpenSettings: () => void }) {
  const [open, setOpen] = useState<string>('discovery')

  const sections: Section[] = [
    {
      id: 'discovery',
      title: 'Finding clips',
      icon: '⌕',
      body: (
        <>
          <p><strong>Search</strong> — type a topic in the YouTube search bar and hit Search. Results are sorted by view count. Use <strong>⚙ Filters</strong> to narrow by date range, duration, or minimum views.</p>
          <p><strong>Trending</strong> — browse YouTube's mostPopular chart, filterable by category (Gaming, Sports, Music, etc).</p>
          <p><strong>Rising Channels</strong> — momentum-scored channels (recent views ÷ subscribers) worth watching.</p>
          <p><strong>Trends sidebar</strong> — daily Google Trends topics by region. Click one to jump straight into a YouTube search for it.</p>
          <p><strong>Import by URL</strong> — paste a TikTok or Instagram link directly into the search hub and hit Search (or "Add clips") to pull it in without searching.</p>
        </>
      ),
    },
    {
      id: 'projects',
      title: 'Projects & saving',
      icon: '📁',
      body: (
        <>
          <p>Click the <strong>☆ star</strong> on any clip card to save it to a project. Projects live in the sidebar — switch between them, rename, or delete freely.</p>
          <p>Inside a project, click a clip's notes area to attach freeform text — useful for tracking edit ideas or posting status.</p>
          <p>Clips you've previously downloaded show a green <strong>↓ Downloaded</strong> badge so you don't lose track of what you've already pulled.</p>
        </>
      ),
    },
    {
      id: 'editor',
      title: 'Editing clips',
      icon: '✂',
      body: (
        <>
          <p>Click <strong>✂ Edit</strong> on any clip — it downloads to the server, then opens the trim editor automatically.</p>
          <p><strong>Mark In / Mark Out</strong> set the start and end of a segment from the current playback position. Add as many segments as you like to the queue, then extract them all at once — handy for pulling multiple shorter clips out of one longer video.</p>
          <p><strong>Mute audio</strong> is a per-segment toggle.</p>
          <p><strong>Title overlays</strong> — pick a template (Bold Caption, Lower Third, Top Banner), type your text, and choose a font, size, and color. The editor shows a rough live preview before you extract.</p>
          <p><strong>Aspect ratio crop</strong> — crop to 9:16 (Shorts/Reels/TikTok), 1:1, 4:5, or 16:9. The dimmed areas in the preview show what gets cut.</p>
          <p style={{ color: 'var(--muted)', fontSize: 12 }}>Plain trims with no overlay or crop extract almost instantly. Adding a title or crop means the clip has to re-encode, which takes a little longer.</p>
          <p>When you're done, click <strong>🗑 Delete source</strong> in the editor to clean up the downloaded file from the server.</p>
        </>
      ),
    },
    {
      id: 'instagram',
      title: 'Instagram login required',
      icon: '🔒',
      body: (
        <>
          <p>Instagram blocks anonymous downloads and metadata fetches with errors like <em>"login required"</em> or <em>"rate-limit reached."</em> This is Instagram's bot detection, not a bug in Clippr.</p>
          <p>Fix it by uploading your own session cookies:</p>
          <ol style={{ paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 4 }}>
            <li>Log into instagram.com normally in your browser.</li>
            <li>Install a cookie-export extension (e.g. <strong>"Get cookies.txt LOCALLY"</strong>).</li>
            <li>Export cookies while on instagram.com — this downloads a small text file.</li>
            <li>Open Settings and upload that file.</li>
          </ol>
          <p style={{ color: 'var(--muted)', fontSize: 12 }}>Clippr never sees your password — only the exported session cookies, which expire periodically and need re-uploading when downloads start failing again.</p>
          <button onClick={onOpenSettings} style={{ background: 'var(--accent)', color: '#fff', fontWeight: 700, fontSize: 12, padding: '7px 14px', borderRadius: 7, marginTop: 4 }}>
            Open Settings →
          </button>
        </>
      ),
    },
    {
      id: 'errors',
      title: 'Other download errors',
      icon: '⚠',
      body: (
        <>
          <p><strong>Blocked</strong> (TikTok) — TikTok's bot detection rejected the request. Usually transient; try again shortly.</p>
          <p><strong>Unavailable</strong> — the source removed or restricted the video. It can't be downloaded, by anyone, until that changes.</p>
          <p><strong>Rate limited</strong> — too many requests too quickly. Wait a minute and retry.</p>
          <p><strong>Failed</strong> (unrecognized) — hover the error badge on the clip card to see the full underlying message.</p>
        </>
      ),
    },
  ]

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 1300, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div onClick={e => e.stopPropagation()} style={{
        background: 'var(--surface)', borderRadius: 12, width: '100%', maxWidth: 560,
        maxHeight: '85vh', display: 'flex', flexDirection: 'column', boxShadow: '0 20px 60px rgba(0,0,0,0.4)',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '20px 24px 4px', flexShrink: 0 }}>
          <div style={{ fontSize: 15, fontWeight: 700 }}>❓ Help</div>
          <button onClick={onClose} style={{ background: 'none', color: 'var(--muted)', fontSize: 18, padding: 2 }}>✕</button>
        </div>

        <div style={{ overflowY: 'auto', padding: '12px 24px 24px', display: 'flex', flexDirection: 'column', gap: 8 }}>
          {sections.map(s => {
            const isOpen = open === s.id
            return (
              <div key={s.id} style={{ border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' }}>
                <button onClick={() => setOpen(isOpen ? '' : s.id)} style={{
                  width: '100%', textAlign: 'left', background: isOpen ? 'var(--surface2)' : 'transparent',
                  display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px', borderRadius: 0,
                  fontSize: 13, fontWeight: 700, color: 'var(--text)',
                }}>
                  <span style={{ fontSize: 14 }}>{s.icon}</span>
                  <span style={{ flex: 1 }}>{s.title}</span>
                  <span style={{ color: 'var(--muted)', fontSize: 11, transform: isOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }}>▾</span>
                </button>
                {isOpen && (
                  <div style={{ padding: '4px 16px 16px', fontSize: 13, color: 'var(--text)', lineHeight: 1.55, display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {s.body}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
