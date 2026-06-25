import { useState } from 'react'

interface Section {
  id: string
  title: string
  icon: HelpIconKind
  body: React.ReactNode
}

// Same monochrome stroke-icon language as App.tsx's NavIcon, so Help doesn't
// clash with the rest of the UI by using emoji.
type HelpIconKind = 'discovery' | 'projects' | 'templates' | 'editor' | 'lock' | 'warning' | 'help'

function HelpIcon({ kind, size = 14 }: { kind: HelpIconKind; size?: number }) {
  const common = { width: size, height: size, viewBox: '0 0 16 16', fill: 'none', stroke: 'currentColor', strokeWidth: 1.6, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const }
  if (kind === 'help') return <svg {...common}><circle cx="8" cy="8" r="6.3" /><path d="M6.1 6.2c.2-1 1-1.7 2-1.7 1.1 0 2 .8 2 1.8 0 .8-.4 1.2-1.1 1.7-.6.4-.9.7-.9 1.4" /><circle cx="8" cy="11.4" r="0.15" fill="currentColor" /></svg>
  if (kind === 'discovery') return <svg {...common}><circle cx="7" cy="7" r="5" /><line x1="11" y1="11" x2="14.5" y2="14.5" /></svg>
  if (kind === 'projects') return <svg {...common}><path d="M1.5 4.5a1 1 0 0 1 1-1h3l1.2 1.6h6.3a1 1 0 0 1 1 1v6.4a1 1 0 0 1-1 1h-10.5a1 1 0 0 1-1-1z" /></svg>
  if (kind === 'templates') return <svg {...common}><rect x="1.5" y="3" width="13" height="10" rx="1.5" /><path d="M6.5 6l3.5 2-3.5 2z" fill="currentColor" stroke="none" /></svg>
  if (kind === 'editor') return <svg {...common}><circle cx="4" cy="4" r="2" /><circle cx="4" cy="12" r="2" /><line x1="5.5" y1="5.5" x2="14" y2="14" /><line x1="14" y1="2" x2="5.5" y2="10.5" /></svg>
  if (kind === 'lock') return <svg {...common}><rect x="3" y="7.5" width="10" height="6.5" rx="1.3" /><path d="M5 7.5V5.2a3 3 0 0 1 6 0v2.3" /></svg>
  return <svg {...common}><path d="M8 2 1.5 13.5h13z" /><line x1="8" y1="6.2" x2="8" y2="9.6" /><circle cx="8" cy="11.6" r="0.15" fill="currentColor" /></svg>
}

export default function HelpModal({ onClose, onOpenSettings }: { onClose: () => void; onOpenSettings: () => void }) {
  const [open, setOpen] = useState<string>('discovery')

  const sections: Section[] = [
    {
      id: 'discovery',
      title: 'Finding clips',
      icon: 'discovery',
      body: (
        <>
          <p><strong>Search</strong> — type a topic in the YouTube search bar and hit Search. Results are sorted by view count. Use <strong>⚙ Filters</strong> to narrow by date range, duration, or minimum views.</p>
          <p><strong>Trending</strong> — browse YouTube's mostPopular chart, filterable by category (Gaming, Sports, Music, etc).</p>
          <p><strong>Rising Channels</strong> — momentum-scored channels (recent views ÷ subscribers) worth watching.</p>
          <p><strong>Trends sidebar</strong> — daily Google Trends topics by region. Click one to jump straight into a YouTube search for it.</p>
          <p><strong>Import by URL</strong> — paste a TikTok or Instagram link directly into the search hub and hit Search (or "Add clips") to pull it in without searching.</p>
          <p><strong>TikTok / Instagram topic search</strong> — type a topic in the search bar, then click the TikTok or Instagram icon next to the URL field. This pulls in real results from that platform sorted by views, the same way YouTube search does. <strong>⚙ Filters</strong> (max age, minimum views, minimum likes) apply here too. It only works if the server has an Apify API token configured (an <code>.env</code> setting, not in this app's UI), and each search costs a small amount on that Apify account, so it's not unlimited like everything else.</p>
        </>
      ),
    },
    {
      id: 'projects',
      title: 'Projects & saving',
      icon: 'projects',
      body: (
        <>
          <p>Click the <strong>☆ star</strong> on any clip card to save it to a project. Projects live in the sidebar — switch between them, rename, or delete freely.</p>
          <p>Inside a project, click a clip's notes area to attach freeform text — useful for tracking edit ideas or posting status.</p>
          <p>Clips you've previously downloaded show a green <strong>↓ Downloaded</strong> badge so you don't lose track of what you've already pulled.</p>
        </>
      ),
    },
    {
      id: 'templates',
      title: 'Project templates',
      icon: 'templates',
      body: (
        <>
          <p>When you create a project, pick a <strong>template</strong> to get a purpose-built builder instead of the plain notes list. Each one downloads/prepares its own clips and renders server-side with ffmpeg — just click in, configure, and Build.</p>
          <p><strong>Ranking video</strong> — queue any number of saved clips into one ordered countdown, each with its own trim range and an optional "#N" rank badge overlay.</p>
          <p><strong>Video commentary</strong> — the first saved clip plays full-frame; the second is overlaid as a reaction picture-in-picture in a corner you choose, with an adjustable size and border.</p>
          <p><strong>Split-screen video</strong> — the first two saved clips fill one half each, stacked top/bottom or side-by-side. Audio mixes both, or falls back to whichever clip isn't muted.</p>
          <p><strong>Still image story</strong> — upload your own images instead of pulling from clips. Set how long each is held, then choose <strong>Ken Burns</strong> (slow pan/zoom) or a <strong>static crossfade</strong> between slides.</p>
          <p><strong>Text story</strong> — write a sequence of text slides on a plain background, Reddit-story style, with the same hard-cut/crossfade choice as image story.</p>
          <p style={{ color: 'var(--muted)', fontSize: 12 }}>Every template shares the same <strong>Title overlay</strong> and <strong>Call to action</strong> sections — a persistent caption across the whole video, and an optional "Like &amp; Subscribe"-style prompt that can appear at the start, middle, and/or end with a fade or slide-in animation. All your settings for a project are saved automatically, so refreshing the page won't lose your work.</p>
        </>
      ),
    },
    {
      id: 'editor',
      title: 'Editing clips',
      icon: 'editor',
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
      icon: 'lock',
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
      icon: 'warning',
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
          <div style={{ fontSize: 15, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8 }}><HelpIcon kind="help" size={16} /> Help</div>
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
                  <span style={{ display: 'flex', flexShrink: 0, color: 'var(--muted)' }}><HelpIcon kind={s.icon} /></span>
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
