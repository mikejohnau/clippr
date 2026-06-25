import { useState, useEffect, useRef } from 'react'
import { Clip, Project, ProjectClip, ProjectTemplate } from './types'
import ClipCard from './components/ClipCard'
import ChannelCard from './components/ChannelCard'
import SettingsModal from './components/SettingsModal'
import HelpModal from './components/HelpModal'
import RankingBuilder from './components/RankingBuilder'
import SplitScreenBuilder from './components/SplitScreenBuilder'
import CommentaryBuilder from './components/CommentaryBuilder'
import ImageStoryBuilder from './components/ImageStoryBuilder'
import TextStoryBuilder from './components/TextStoryBuilder'

const MAX_HISTORY = 10

const PROJECT_TEMPLATES: { id: ProjectTemplate; name: string; description: string }[] = [
  { id: 'general', name: 'General', description: 'A plain project — save and organize clips with notes.' },
  { id: 'ranking', name: 'Ranking video', description: 'Sequence multiple clips into one ordered countdown video with rank-label overlays.' },
  { id: 'commentary', name: 'Video commentary', description: 'A base clip full-frame with a second clip overlaid as a reaction picture-in-picture.' },
  { id: 'split_screen', name: 'Split-screen video', description: 'Two clips composited side-by-side or stacked.' },
  { id: 'image_story', name: 'Still image story', description: 'Upload a set of images and turn them into a video with pan/zoom or crossfade motion.' },
  { id: 'text_story', name: 'Text story', description: 'A sequence of text slides on a plain background, turned into a video — Reddit-story style.' },
]

function detectPlatform(url: string): 'tiktok' | 'instagram' | null {
  if (/tiktok\.com/i.test(url)) return 'tiktok'
  if (/instagram\.com/i.test(url)) return 'instagram'
  return null
}

function TikTokIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none">
      <rect x="1" y="1" width="14" height="14" rx="4" fill="#010101" />
      {/* cyan/red accent peeking out from behind the note, matching the real brand mark */}
      <path d="M10.4 5.1a2.7 2.7 0 0 1-2.5-2.5H6.3v7.2a1.4 1.4 0 1 1-1.3-1.4v-1.6a3 3 0 1 0 2.9 3V6.4a4.9 4.9 0 0 0 2.7.9V5.6z" fill="#69C9D0" transform="translate(0.35,0.35)" />
      <path d="M10.4 5.1a2.7 2.7 0 0 1-2.5-2.5H6.3v7.2a1.4 1.4 0 1 1-1.3-1.4v-1.6a3 3 0 1 0 2.9 3V6.4a4.9 4.9 0 0 0 2.7.9V5.6z" fill="#EE1D52" transform="translate(-0.35,-0.35)" />
      <path d="M10.4 5.1a2.7 2.7 0 0 1-2.5-2.5H6.3v7.2a1.4 1.4 0 1 1-1.3-1.4v-1.6a3 3 0 1 0 2.9 3V6.4a4.9 4.9 0 0 0 2.7.9V5.6z" fill="#fff" />
    </svg>
  )
}

type NavIconKind = 'search' | 'trending' | 'rising' | 'projects' | 'help' | 'settings' | 'sun' | 'moon'

function NavIcon({ kind, size = 15 }: { kind: NavIconKind; size?: number }) {
  const common = { width: size, height: size, viewBox: '0 0 16 16', fill: 'none', stroke: 'currentColor', strokeWidth: 1.6, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const }
  if (kind === 'search') return <svg {...common}><circle cx="7" cy="7" r="5" /><line x1="11" y1="11" x2="14.5" y2="14.5" /></svg>
  if (kind === 'trending') return <svg {...common}><path d="M8 1.5c1 2 .5 3-.5 4 1.5-.3 3 .5 3.5 2 .5-1 1.5-1 1.5 1.2 0 2.7-2.4 5.3-5.5 5.3S1.5 11.4 1.5 8.7c0-2 1.2-3.4 2.3-4.2-.1 1 .2 1.7.8 2C4.2 5 5.5 3 8 1.5z" /></svg>
  if (kind === 'rising') return <svg {...common}><polyline points="1.5,12 6,7 9,10 14.5,3.5" /><polyline points="10.5,3.5 14.5,3.5 14.5,7.5" /></svg>
  if (kind === 'projects') return <svg {...common}><path d="M1.5 4.5a1 1 0 0 1 1-1h3l1.2 1.6h6.3a1 1 0 0 1 1 1v6.4a1 1 0 0 1-1 1h-10.5a1 1 0 0 1-1-1z" /></svg>
  if (kind === 'help') return <svg {...common}><circle cx="8" cy="8" r="6.3" /><path d="M6.1 6.2c.2-1 1-1.7 2-1.7 1.1 0 2 .8 2 1.8 0 .8-.4 1.2-1.1 1.7-.6.4-.9.7-.9 1.4" /><circle cx="8" cy="11.4" r="0.15" fill="currentColor" /></svg>
  if (kind === 'settings') return <svg {...common}><line x1="2" y1="4.5" x2="14" y2="4.5" /><circle cx="6" cy="4.5" r="1.4" fill="currentColor" stroke="none" /><line x1="2" y1="8" x2="14" y2="8" /><circle cx="10.5" cy="8" r="1.4" fill="currentColor" stroke="none" /><line x1="2" y1="11.5" x2="14" y2="11.5" /><circle cx="7.5" cy="11.5" r="1.4" fill="currentColor" stroke="none" /></svg>
  if (kind === 'sun') return <svg {...common}><circle cx="8" cy="8" r="3" /><path d="M8 1.8v1.6M8 12.6v1.6M14.2 8h-1.6M3.4 8H1.8M12.2 3.8l-1.1 1.1M4.9 11.1l-1.1 1.1M12.2 12.2l-1.1-1.1M4.9 4.9 3.8 3.8" /></svg>
  return <svg {...common} fill="currentColor" stroke="none"><path d="M13.8 9.8A5.8 5.8 0 0 1 6.2 2.2a5.8 5.8 0 1 0 7.6 7.6z" /></svg>
}

function InstagramIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none">
      <rect x="1" y="1" width="14" height="14" rx="4" fill="url(#ig-icon-grad)" />
      <circle cx="8" cy="8" r="3" stroke="white" strokeWidth="1.5" />
      <circle cx="12" cy="4" r="1" fill="white" />
      <defs><linearGradient id="ig-icon-grad" x1="0" y1="16" x2="16" y2="0" gradientUnits="userSpaceOnUse"><stop stopColor="#F58529" /><stop offset="0.5" stopColor="#DD2A7B" /><stop offset="1" stopColor="#8134AF" /></linearGradient></defs>
    </svg>
  )
}

export default function App() {
  const [topic, setTopic] = useState('')
  const [manualUrl, setManualUrl] = useState('')
  const [clips, setClips] = useState<Clip[]>([])
  const [loading, setLoading] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState('')
  const [nextPageToken, setNextPageToken] = useState('')
  const [currentTopic, setCurrentTopic] = useState('')

  // Filters
  const [dateFilter, setDateFilter] = useState('')
  const [durationFilter, setDurationFilter] = useState('')
  const [minViews, setMinViews] = useState(0)
  const [showFilters, setShowFilters] = useState(false)

  // Search history
  const [searchHistory, setSearchHistory] = useState<string[]>(() => {
    try { return JSON.parse(localStorage.getItem('searchHistory') || '[]') } catch { return [] }
  })

  // Batch select
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [batchDownloading, setBatchDownloading] = useState(false)

  // Views
  const [trendingClips, setTrendingClips] = useState<Clip[]>([])
  const [trendingCategory, setTrendingCategory] = useState('0')
  const [categories, setCategories] = useState<{id: string, name: string}[]>([])
  const [showTrending, setShowTrending] = useState(false)
  const [showRising, setShowRising] = useState(false)
  const [risingChannels, setRisingChannels] = useState<any[]>([])
  const [risingCategory, setRisingCategory] = useState('0')
  const [loadingRising, setLoadingRising] = useState(false)
  const [showSaved, setShowSaved] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [showHelp, setShowHelp] = useState(false)
  const [googleTrends, setGoogleTrends] = useState<any[]>([])
  const [selectedTrend, setSelectedTrend] = useState<any | null>(null)
  const [trendsRegion, setTrendsRegion] = useState('US')
  const [trendsRegions, setTrendsRegions] = useState<{code: string, name: string}[]>([])
  const [dark, setDark] = useState(() => localStorage.getItem('theme') === 'dark')

  // Projects
  const [projects, setProjects] = useState<Project[]>([])
  const [activeProjectId, setActiveProjectId] = useState('default')
  const [projectClips, setProjectClips] = useState<ProjectClip[]>([])
  const [editingNote, setEditingNote] = useState<number | null>(null)
  const [noteText, setNoteText] = useState('')
  const [creatingProject, setCreatingProject] = useState(false)
  const [newProjectName, setNewProjectName] = useState('')
  const [newProjectTemplate, setNewProjectTemplate] = useState<ProjectTemplate>('general')
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [renameText, setRenameText] = useState('')

  // Download history
  const [downloadedIds, setDownloadedIds] = useState<Set<string>>(new Set())

  // ── helpers ──────────────────────────────────────────────────────────────

  function nav(view: 'search' | 'trending' | 'rising' | 'saved') {
    setShowTrending(view === 'trending')
    setShowRising(view === 'rising')
    setShowSaved(view === 'saved')
    setSelectedTrend(null)
  }

  function downloadKey(clip: Clip) { return `${clip.platform}:${clip.id}` }
  function isSaved(clip: Clip) { return projectClips.some(pc => pc.clip.id === clip.id && pc.clip.platform === clip.platform) }

  async function loadProjects() {
    const data = await fetch('/api/projects/').then(r => r.json())
    setProjects(data)
  }

  async function loadProjectClips(pid: string) {
    const data = await fetch(`/api/projects/${pid}/clips`).then(r => r.json())
    setProjectClips(data)
  }

  async function saveToProject(clip: Clip, projectId: string) {
    await fetch(`/api/projects/${projectId}/clips`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ clip }),
    })
    if (projectId === activeProjectId) await loadProjectClips(activeProjectId)
  }

  async function removeFromProject(rowId: number) {
    await fetch(`/api/projects/${activeProjectId}/clips/${rowId}`, { method: 'DELETE' })
    setProjectClips(prev => prev.filter(pc => pc.row_id !== rowId))
  }

  async function saveNote(rowId: number, notes: string) {
    await fetch(`/api/projects/${activeProjectId}/clips/${rowId}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ notes }),
    })
    setProjectClips(prev => prev.map(pc => pc.row_id === rowId ? { ...pc, notes } : pc))
    setEditingNote(null)
  }

  async function createProject() {
    if (!newProjectName.trim()) return
    const p = await fetch('/api/projects/', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: newProjectName.trim(), template: newProjectTemplate }),
    }).then(r => r.json())
    setNewProjectName('')
    setNewProjectTemplate('general')
    setCreatingProject(false)
    await loadProjects()
    setActiveProjectId(p.id)
  }

  async function renameProject(id: string, name: string) {
    await fetch(`/api/projects/${id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    })
    setRenamingId(null)
    await loadProjects()
  }

  async function deleteProject(id: string) {
    if (!confirm('Delete this project and all its clips?')) return
    await fetch(`/api/projects/${id}`, { method: 'DELETE' })
    await loadProjects()
    setActiveProjectId('default')
  }

  function toggleSelect(clipKey: string) {
    setSelected(prev => {
      const next = new Set(prev)
      next.has(clipKey) ? next.delete(clipKey) : next.add(clipKey)
      return next
    })
  }

  function addToHistory(t: string) {
    if (!t.trim()) return
    setSearchHistory(prev => {
      const next = [t, ...prev.filter(h => h !== t)].slice(0, MAX_HISTORY)
      localStorage.setItem('searchHistory', JSON.stringify(next))
      return next
    })
  }

  // ── data fetching ─────────────────────────────────────────────────────────

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light')
    localStorage.setItem('theme', dark ? 'dark' : 'light')
  }, [dark])

  useEffect(() => {
    fetch('/api/trending/categories').then(r => r.json()).then(setCategories).catch(() => {})
    fetch('/api/trending/google/regions').then(r => r.json()).then(setTrendsRegions).catch(() => {})
    loadProjects()
    fetch('/api/downloads-history/').then(r => r.json()).then((rows: any[]) => {
      setDownloadedIds(new Set(rows.map(r => `${r.platform}:${r.clip_id}`)))
    }).catch(() => {})
  }, [])

  useEffect(() => {
    loadProjectClips(activeProjectId)
  }, [activeProjectId])

  useEffect(() => {
    setGoogleTrends([])
    setSelectedTrend(null)
    fetch(`/api/trending/google?geo=${trendsRegion}`).then(r => r.json()).then(setGoogleTrends).catch(() => {})
  }, [trendsRegion])

  useEffect(() => {
    if (!showTrending) return
    setTrendingClips([])
    fetch(`/api/trending/?category_id=${trendingCategory}&max_results=24`)
      .then(r => r.json()).then(setTrendingClips).catch(() => {})
  }, [showTrending, trendingCategory])

  useEffect(() => {
    if (!showRising) return
    setRisingChannels([])
    setLoadingRising(true)
    fetch(`/api/channels/rising?category_id=${risingCategory}&max_results=20`)
      .then(r => r.json()).then(setRisingChannels).catch(() => {}).finally(() => setLoadingRising(false))
  }, [showRising, risingCategory])

  // ── search ────────────────────────────────────────────────────────────────

  function buildSearchUrl(t: string, pageToken = '') {
    const params = new URLSearchParams({ topic: t, max_per_platform: '12' })
    if (pageToken) params.set('page_token', pageToken)
    if (dateFilter) params.set('date_filter', dateFilter)
    if (durationFilter) params.set('duration_filter', durationFilter)
    if (minViews) params.set('min_views', String(minViews))
    return `/api/search/?${params}`
  }

  async function fetchClips(t: string, pageToken = '', append = false) {
    const res = await fetch(buildSearchUrl(t, pageToken))
    if (!res.ok) throw new Error('Search failed')
    const data = await res.json()
    if (append) setClips(prev => [...prev, ...data.clips])
    else setClips(data.clips)
    setNextPageToken(data.next_page_token || '')
  }

  async function resolveManualClips(): Promise<Clip[]> {
    const url = manualUrl.trim()
    const platform = url ? detectPlatform(url) : null
    if (!url || !platform) return []
    try {
      const res = await fetch(`/api/meta/?url=${encodeURIComponent(url)}`)
      const meta = await res.json()
      return [{
        id: `${platform}-${Date.now()}`, title: meta.title || `${platform} clip`,
        thumbnail: meta.thumbnail, url, platform,
        views: meta.views, likes: meta.likes, comments: meta.comments, duration: meta.duration,
      } as Clip]
    } catch {
      return [{ id: `${platform}-${Date.now()}`, title: `${platform} clip`, url, platform } as Clip]
    }
  }

  async function search(e?: React.FormEvent, overrideTopic?: string) {
    e?.preventDefault()
    const t = overrideTopic ?? topic
    const hasSearch = t.trim()
    const hasManual = manualUrl.trim().length > 0
    if (!hasSearch && !hasManual) return
    nav('search')

    if (hasManual && !hasSearch && clips.length > 0) {
      const manualClips = await resolveManualClips()
      setClips(prev => [...manualClips, ...prev])
      setManualUrl('')
      return
    }

    setLoading(true)
    setError('')
    setNextPageToken('')
    setCurrentTopic(t.trim())
    setSelected(new Set())
    addToHistory(t.trim())

    try {
      const manualClips = await resolveManualClips()
      if (hasSearch) {
        await fetchClips(t.trim())
        setClips(prev => [...manualClips, ...prev])
      } else {
        setClips(manualClips)
      }
      setManualUrl('')
    } catch (err: any) {
      setError(err.message || 'Something went wrong')
    } finally {
      setLoading(false)
    }
  }

  async function loadMore() {
    setLoadingMore(true)
    try { await fetchClips(currentTopic, nextPageToken, true) }
    catch (err: any) { setError(err.message || 'Something went wrong') }
    finally { setLoadingMore(false) }
  }

  // ── batch download ────────────────────────────────────────────────────────

  async function batchDownload() {
    const toDownload = clips.filter(c => selected.has(`${c.platform}-${c.id}`))
    if (!toDownload.length) return
    setBatchDownloading(true)
    for (const clip of toDownload) {
      try {
        const res = await fetch('/api/download/', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url: clip.url, title: clip.title }),
        })
        const { job_id } = await res.json()
        await new Promise<void>(resolve => {
          const iv = setInterval(async () => {
            const s = await fetch(`/api/download/${job_id}`).then(r => r.json())
            if (s.status === 'done') {
              clearInterval(iv)
              const a = document.createElement('a')
              a.href = `/api/download/${job_id}/serve`
              a.download = s.filename?.split('/').pop() || 'clip.mp4'
              document.body.appendChild(a); a.click(); document.body.removeChild(a)
              resolve()
            } else if (s.status === 'error') {
              clearInterval(iv)
              fetch(`/api/download/${job_id}`, { method: 'DELETE' })
              resolve()
            }
          }, 1500)
        })
      } catch { /* skip failed */ }
    }
    setBatchDownloading(false)
    setSelected(new Set())
  }

  function removeSelected() {
    setClips(prev => prev.filter(c => !selected.has(`${c.platform}-${c.id}`)))
    setSelected(new Set())
  }

  // ── render ────────────────────────────────────────────────────────────────

  const isSearch = !showTrending && !showRising && !showSaved && !selectedTrend
  const activeClips = showTrending ? trendingClips : isSearch ? clips : []

  const navItems = [
    { label: 'Search', icon: 'search' as const, view: 'search' as const, active: isSearch },
    { label: 'Trending', icon: 'trending' as const, view: 'trending' as const, active: showTrending },
    { label: 'Rising Channels', icon: 'rising' as const, view: 'rising' as const, active: showRising },
    { label: `Projects${projectClips.length ? ` (${projectClips.length})` : ''}`, icon: 'projects' as const, view: 'saved' as const, active: showSaved },
  ]

  return (
    <div style={{ display: 'flex', minHeight: '100vh' }}>

      {/* ── Sidebar ─────────────────────────────────────────────────────── */}
      <aside style={{
        width: 224, flexShrink: 0, background: 'var(--sidebar)',
        display: 'flex', flexDirection: 'column',
        position: 'sticky', top: 0, height: '100vh', overflowY: 'auto',
        borderRight: '1px solid rgba(255,255,255,0.04)',
      }}>
        {/* Logo */}
        <div style={{ padding: '22px 20px 18px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div className="font-display" style={{ fontSize: 24, color: '#fff', lineHeight: 1 }}>
              Clip<span style={{ color: 'var(--accent)' }}>pr</span>
            </div>
            <div style={{ color: 'var(--sidebar-text)', fontSize: 10, marginTop: 3, letterSpacing: '0.04em' }}>Viral clip discovery</div>
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            <button onClick={() => setShowHelp(true)} title="Help"
              style={{ background: 'rgba(255,255,255,0.06)', color: 'var(--sidebar-text)', padding: 7, borderRadius: 7, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <NavIcon kind="help" size={15} />
            </button>
            <button onClick={() => setShowSettings(true)} title="Settings"
              style={{ background: 'rgba(255,255,255,0.06)', color: 'var(--sidebar-text)', padding: 7, borderRadius: 7, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <NavIcon kind="settings" size={15} />
            </button>
            <button onClick={() => setDark(d => !d)} title={dark ? 'Light mode' : 'Dark mode'}
              style={{ background: 'rgba(255,255,255,0.06)', color: 'var(--sidebar-text)', padding: 7, borderRadius: 7, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <NavIcon kind={dark ? 'sun' : 'moon'} size={15} />
            </button>
          </div>
        </div>

        <div style={{ flex: 1, padding: '4px 10px 16px', display: 'flex', flexDirection: 'column', gap: 1 }}>
          {/* Nav items */}
          {navItems.map(item => (
            <button key={item.view} onClick={() => nav(item.view)} style={{
              display: 'flex', alignItems: 'center', gap: 10, width: '100%', textAlign: 'left',
              background: item.active ? 'rgba(240,74,0,0.18)' : 'transparent',
              color: item.active ? '#fff' : 'var(--sidebar-text)',
              padding: '9px 10px', borderRadius: 8, fontSize: 14,
              fontWeight: item.active ? 600 : 500,
              borderLeft: item.active ? '3px solid var(--accent)' : '3px solid transparent',
              transition: 'all 0.12s',
            }}>
              <span style={{ display: 'flex', flexShrink: 0 }}><NavIcon kind={item.icon} /></span>
              <span>{item.label}</span>
            </button>
          ))}

          {/* Category filter for Trending / Rising */}
          {(showTrending || showRising) && categories.length > 0 && (
            <div style={{ marginTop: 20, borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: 16 }}>
              <div style={{ color: 'var(--sidebar-text)', fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 6, padding: '0 10px' }}>Category</div>
              {categories.map(c => {
                const activeId = showTrending ? trendingCategory : risingCategory
                const setActive = showTrending ? setTrendingCategory : setRisingCategory
                return (
                  <button key={c.id} onClick={() => setActive(c.id)} style={{
                    display: 'block', width: '100%', textAlign: 'left',
                    background: activeId === c.id ? 'rgba(240,74,0,0.18)' : 'transparent',
                    color: activeId === c.id ? '#fff' : 'var(--sidebar-text)',
                    borderLeft: activeId === c.id ? '3px solid var(--accent)' : '3px solid transparent',
                    padding: '7px 10px', borderRadius: 8, fontSize: 13, marginBottom: 1,
                  }}>{c.name}</button>
                )
              })}
            </div>
          )}

          {/* Project switcher — shown when Projects tab active */}
          {showSaved && (
            <div style={{ marginTop: 20, borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: 16 }}>
              <div style={{ color: 'var(--sidebar-text)', fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 6, padding: '0 10px' }}>Projects</div>
              {projects.map(p => (
                <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 1 }}>
                  {renamingId === p.id ? (
                    <input autoFocus value={renameText} onChange={e => setRenameText(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') renameProject(p.id, renameText); if (e.key === 'Escape') setRenamingId(null) }}
                      style={{ flex: 1, fontSize: 13, padding: '5px 8px', background: 'rgba(255,255,255,0.08)', color: '#fff', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 5 }} />
                  ) : (
                    <button onClick={() => setActiveProjectId(p.id)} style={{
                      flex: 1, textAlign: 'left', background: activeProjectId === p.id ? 'rgba(240,74,0,0.18)' : 'none',
                      color: activeProjectId === p.id ? '#fff' : 'var(--sidebar-text)',
                      padding: '7px 10px', borderRadius: 5, fontSize: 13, overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis',
                    }}>
                      {p.name}
                    </button>
                  )}
                  {activeProjectId === p.id && p.id !== 'default' && !renamingId && (
                    <div style={{ display: 'flex', gap: 2 }}>
                      <button onClick={() => { setRenamingId(p.id); setRenameText(p.name) }} style={{ background: 'none', color: 'var(--sidebar-text)', padding: '2px 4px', fontSize: 12 }} title="Rename">✎</button>
                      <button onClick={() => deleteProject(p.id)} style={{ background: 'none', color: 'var(--sidebar-text)', padding: '2px 4px', fontSize: 12 }} title="Delete">✕</button>
                    </div>
                  )}
                </div>
              ))}
              {creatingProject ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 5, padding: '0 10px', marginTop: 6 }}>
                  <input autoFocus value={newProjectName} onChange={e => setNewProjectName(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') createProject(); if (e.key === 'Escape') setCreatingProject(false) }}
                    placeholder="Project name…" style={{ fontSize: 12, padding: '5px 8px', background: 'rgba(255,255,255,0.08)', color: '#fff', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 5 }} />
                  <select value={newProjectTemplate} onChange={e => setNewProjectTemplate(e.target.value as ProjectTemplate)}
                    title={PROJECT_TEMPLATES.find(t => t.id === newProjectTemplate)?.description}
                    style={{ fontSize: 12, padding: '5px 8px', background: 'rgba(255,255,255,0.08)', color: '#fff', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 5 }}>
                    {PROJECT_TEMPLATES.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                  </select>
                  <div style={{ display: 'flex', gap: 4 }}>
                    <button onClick={createProject} style={{ flex: 1, background: 'var(--accent)', color: '#fff', fontSize: 12, padding: '5px 9px', borderRadius: 5 }}>Create</button>
                    <button onClick={() => setCreatingProject(false)} style={{ background: 'none', color: 'var(--sidebar-text)', border: '1px solid rgba(255,255,255,0.15)', fontSize: 12, padding: '5px 9px', borderRadius: 5 }}>Cancel</button>
                  </div>
                </div>
              ) : (
                <button onClick={() => setCreatingProject(true)} style={{ display: 'block', width: '100%', textAlign: 'left', background: 'none', color: 'var(--sidebar-text)', padding: '6px 10px', fontSize: 12, marginTop: 4 }}>
                  + New project
                </button>
              )}
            </div>
          )}

          {/* Google Trends */}
          {(googleTrends.length > 0 || trendsRegions.length > 0) && (
            <div style={{ marginTop: 20, borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--sidebar-text)', fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 8, padding: '0 10px' }}>
                <NavIcon kind="search" size={12} /> Trends
              </div>
              {trendsRegions.length > 0 && (
                <div style={{ padding: '0 10px', marginBottom: 10 }}>
                  <select value={trendsRegion} onChange={e => setTrendsRegion(e.target.value)}
                    style={{ background: 'rgba(255,255,255,0.05)', color: 'var(--sidebar-text)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 7, fontSize: 12, padding: '5px 8px' }}>
                    {trendsRegions.map(r => <option key={r.code} value={r.code}>{r.name}</option>)}
                  </select>
                </div>
              )}
              {googleTrends.length === 0 && <div style={{ color: 'var(--sidebar-text)', fontSize: 13, padding: '4px 10px' }}>Loading…</div>}
              {googleTrends.map(t => (
                <button key={t.topic} onClick={() => { nav('search'); setSelectedTrend(t) }} style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  width: '100%', textAlign: 'left',
                  background: selectedTrend?.topic === t.topic ? 'rgba(240,74,0,0.18)' : 'transparent',
                  color: selectedTrend?.topic === t.topic ? '#fff' : 'var(--sidebar-text)',
                  borderLeft: selectedTrend?.topic === t.topic ? '3px solid var(--accent)' : '3px solid transparent',
                  padding: '6px 10px', borderRadius: 8, fontSize: 13, marginBottom: 1, gap: 6,
                }}>
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>{t.topic}</span>
                  <span style={{ color: 'var(--sidebar-text)', fontSize: 11, flexShrink: 0, fontWeight: 600 }}>{t.traffic}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Designed-by credit */}
        <a href="https://m2-design.net" target="_blank" rel="noreferrer" title="Designed by M² Design"
          style={{ flexShrink: 0, padding: '12px 20px', borderTop: '1px solid rgba(255,255,255,0.06)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <img src="/m2-design-logo.png" alt="M² Design" style={{ height: 16, opacity: 0.85 }} />
        </a>
      </aside>

      {/* ── Main ────────────────────────────────────────────────────────── */}
      <main style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, background: 'var(--bg)' }}>

        {/* ── Search Hub (always visible) ─────────────────────────────── */}
        <header style={{
          background: 'var(--surface)', borderBottom: '1px solid var(--border)',
          padding: '14px 24px 12px', position: 'sticky', top: 0, zIndex: 10,
          boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
        }}>
          {/* Row 1 — YouTube */}
          <form onSubmit={search}>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              {/* YouTube logo mark */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                <svg width="22" height="16" viewBox="0 0 20 14" fill="none">
                  <rect width="20" height="14" rx="3" fill="#FF0000"/>
                  <polygon points="8,3.5 14.5,7 8,10.5" fill="white"/>
                </svg>
                <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--muted)', letterSpacing: '0.04em', width: 64 }}>YouTube</span>
              </div>
              <div style={{ flex: 1, position: 'relative' }}>
                <span style={{ position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)', color: 'var(--muted)', fontSize: 16, pointerEvents: 'none' }}>⌕</span>
                <input value={topic} onChange={e => setTopic(e.target.value)}
                  placeholder="Search topic — e.g. skateboarding fails, cooking hacks…"
                  style={{ paddingLeft: 32, height: 40, fontSize: 14 }} />
              </div>
              <button type="button" onClick={() => setShowFilters(f => !f)} style={{
                background: (dateFilter || durationFilter || minViews) ? 'rgba(240,74,0,0.12)' : 'var(--surface2)',
                color: (dateFilter || durationFilter || minViews) ? 'var(--accent)' : 'var(--muted)',
                border: '1.5px solid var(--border)', padding: '0 14px', height: 40, fontSize: 13, borderRadius: 8,
                display: 'flex', alignItems: 'center', gap: 4, whiteSpace: 'nowrap', flexShrink: 0,
              }}>
                ⚙ Filters{(dateFilter || durationFilter || minViews) ? ' ●' : ''}
              </button>
              <button type="submit" disabled={loading} style={{
                background: 'var(--accent)', color: '#fff', fontWeight: 700,
                padding: '0 20px', height: 40, whiteSpace: 'nowrap', opacity: loading ? 0.7 : 1,
                borderRadius: 8, flexShrink: 0, fontSize: 14,
              }}>
                {loading ? 'Searching…' : 'Search'}
              </button>
            </div>

            {/* Filter row */}
            {showFilters && (
              <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap', alignItems: 'center', paddingLeft: 92 }}>
                <select value={dateFilter} onChange={e => setDateFilter(e.target.value)}
                  style={{ fontSize: 13, padding: '5px 8px', flex: '1 1 120px', height: 36 }}>
                  <option value="">Any date</option>
                  <option value="day">Past 24 hours</option>
                  <option value="week">Past week</option>
                  <option value="month">Past month</option>
                  <option value="year">Past year</option>
                </select>
                <select value={durationFilter} onChange={e => setDurationFilter(e.target.value)}
                  style={{ fontSize: 13, padding: '5px 8px', flex: '1 1 120px', height: 36 }}>
                  <option value="">Any duration</option>
                  <option value="short">Short (&lt; 4 min)</option>
                  <option value="medium">Medium (4–20 min)</option>
                  <option value="long">Long (&gt; 20 min)</option>
                </select>
                <select value={String(minViews)} onChange={e => setMinViews(Number(e.target.value))}
                  style={{ fontSize: 13, padding: '5px 8px', flex: '1 1 120px', height: 36 }}>
                  <option value="0">Any views</option>
                  <option value="10000">10K+ views</option>
                  <option value="100000">100K+ views</option>
                  <option value="1000000">1M+ views</option>
                  <option value="10000000">10M+ views</option>
                </select>
                {(dateFilter || durationFilter || minViews > 0) && (
                  <button onClick={() => { setDateFilter(''); setDurationFilter(''); setMinViews(0) }}
                    style={{ background: 'none', color: 'var(--muted)', border: '1.5px solid var(--border)', fontSize: 13, padding: '0 10px', height: 36, borderRadius: 7 }}>
                    Clear
                  </button>
                )}
              </div>
            )}
          </form>

          {/* Divider */}
          <div style={{ borderTop: '1px solid var(--border)', margin: '10px 0' }} />

          {/* Row 2 — import any TikTok/Instagram URL, platform auto-detected */}
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <div style={{ width: 24, display: 'flex', justifyContent: 'center', flexShrink: 0 }}>
              {detectPlatform(manualUrl) === 'tiktok' ? <TikTokIcon size={20} />
                : detectPlatform(manualUrl) === 'instagram' ? <InstagramIcon size={21} />
                : <span style={{ color: 'var(--muted)', fontSize: 18, lineHeight: 1 }}>🔗</span>}
            </div>
            <input value={manualUrl} onChange={e => setManualUrl(e.target.value)}
              placeholder="Paste a TikTok or Instagram URL to import…" style={{ flex: 1, height: 40, fontSize: 14 }} />
            {detectPlatform(manualUrl) && (
              <button onClick={() => search()}
                style={{ background: 'var(--accent)', color: '#fff', fontWeight: 700, padding: '0 16px', height: 40, borderRadius: 8, flexShrink: 0, fontSize: 14, whiteSpace: 'nowrap' }}>
                Add clip
              </button>
            )}

            <div style={{ width: 1, height: 28, background: 'var(--border)', flexShrink: 0 }} />

            <button type="button" title="Search on TikTok"
              onClick={() => window.open(`https://www.tiktok.com/search?q=${encodeURIComponent(topic)}`, '_blank')}
              style={{ background: 'var(--surface2)', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', width: 40, height: 40, padding: 0, borderRadius: 8, flexShrink: 0 }}>
              <TikTokIcon size={20} />
            </button>
            <button type="button" title="Search on Instagram"
              onClick={() => window.open(`https://www.instagram.com/explore/search/keyword/?q=${encodeURIComponent(topic)}`, '_blank')}
              style={{ background: 'var(--surface2)', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', width: 40, height: 40, padding: 0, borderRadius: 8, flexShrink: 0 }}>
              <InstagramIcon size={20} />
            </button>
          </div>

          {/* Search history chips */}
          {searchHistory.length > 0 && (
            <div style={{ display: 'flex', gap: 6, marginTop: 10, flexWrap: 'wrap', alignItems: 'center', paddingLeft: 92 }}>
              <span style={{ fontSize: 12, color: 'var(--muted)', flexShrink: 0 }}>Recent:</span>
              {searchHistory.map(h => (
                <button key={h} onClick={() => { setTopic(h); search(undefined, h) }}
                  style={{ background: 'var(--surface2)', color: 'var(--muted)', border: '1px solid var(--border)', fontSize: 12, padding: '4px 11px', borderRadius: 99 }}>
                  {h}
                </button>
              ))}
              <button onClick={() => { setSearchHistory([]); localStorage.removeItem('searchHistory') }}
                style={{ background: 'none', color: 'var(--muted)', fontSize: 13, padding: '2px 4px' }}>✕</button>
            </div>
          )}
        </header>

        {/* Content */}
        <div style={{ padding: '24px 28px', flex: 1 }}>

          {error && (
            <div style={{ background: '#fef2f2', border: '1px solid #fecaca', color: 'var(--error)', borderRadius: 8, padding: '10px 14px', marginBottom: 20, fontSize: 13 }}>{error}</div>
          )}

          {/* ── Projects ── */}
          {showSaved && (
            <>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                <div style={{ fontSize: 17, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8 }}>
                  <NavIcon kind="projects" size={16} /> {projects.find(p => p.id === activeProjectId)?.name ?? 'Project'}
                  <span style={{ fontWeight: 400, fontSize: 13, color: 'var(--muted)' }}>{projectClips.length} clip{projectClips.length !== 1 ? 's' : ''}</span>
                </div>
              </div>

              {projects.find(p => p.id === activeProjectId)?.template === 'ranking' ? (
                <RankingBuilder projectClips={projectClips} onRemove={removeFromProject} projectId={activeProjectId}
                  projectName={projects.find(p => p.id === activeProjectId)?.name ?? 'ranking_video'} />
              ) : projects.find(p => p.id === activeProjectId)?.template === 'split_screen' ? (
                <SplitScreenBuilder projectClips={projectClips} onRemove={removeFromProject} projectId={activeProjectId}
                  projectName={projects.find(p => p.id === activeProjectId)?.name ?? 'split_screen_video'} />
              ) : projects.find(p => p.id === activeProjectId)?.template === 'commentary' ? (
                <CommentaryBuilder projectClips={projectClips} onRemove={removeFromProject} projectId={activeProjectId}
                  projectName={projects.find(p => p.id === activeProjectId)?.name ?? 'commentary_video'} />
              ) : projects.find(p => p.id === activeProjectId)?.template === 'image_story' ? (
                <ImageStoryBuilder projectId={activeProjectId}
                  projectName={projects.find(p => p.id === activeProjectId)?.name ?? 'image_story_video'} />
              ) : projects.find(p => p.id === activeProjectId)?.template === 'text_story' ? (
                <TextStoryBuilder projectId={activeProjectId}
                  projectName={projects.find(p => p.id === activeProjectId)?.name ?? 'text_story_video'} />
              ) : projectClips.length === 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '80px 0', color: 'var(--muted)', textAlign: 'center', gap: 8 }}>
                  <div style={{ fontSize: 36 }}>📁</div>
                  <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text)' }}>No clips in this project</div>
                  <div style={{ fontSize: 13 }}>Click ★ on any clip to save it to a project</div>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {projectClips.map(pc => (
                    <div key={pc.row_id} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' }}>
                      <div style={{ display: 'flex', gap: 0 }}>
                        <div style={{ width: 260, flexShrink: 0 }}>
                          <ClipCard clip={pc.clip} saved
                            onToggleSave={() => removeFromProject(pc.row_id)}
                            projects={projects}
                            onSaveToProject={saveToProject}
                            previouslyDownloaded={downloadedIds.has(downloadKey(pc.clip))}
                            onOpenInstagramSettings={() => setShowSettings(true)} />
                        </div>
                        <div style={{ flex: 1, padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 8, minWidth: 0 }}>
                          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>Notes</div>
                          {editingNote === pc.row_id ? (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, flex: 1 }}>
                              <textarea value={noteText} onChange={e => setNoteText(e.target.value)}
                                style={{ flex: 1, minHeight: 80, resize: 'vertical', fontSize: 13, padding: '8px 10px', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--text)', fontFamily: 'inherit' }}
                                placeholder="Add notes about this clip…" autoFocus />
                              <div style={{ display: 'flex', gap: 8 }}>
                                <button onClick={() => saveNote(pc.row_id, noteText)}
                                  style={{ background: 'var(--accent)', color: '#fff', fontWeight: 600, fontSize: 12, padding: '6px 16px' }}>Save</button>
                                <button onClick={() => setEditingNote(null)}
                                  style={{ background: 'none', color: 'var(--muted)', border: '1px solid var(--border)', fontSize: 12, padding: '6px 12px' }}>Cancel</button>
                              </div>
                            </div>
                          ) : (
                            <div onClick={() => { setEditingNote(pc.row_id); setNoteText(pc.notes || '') }}
                              style={{ flex: 1, cursor: 'text', fontSize: 13, color: pc.notes ? 'var(--text)' : 'var(--muted)', lineHeight: 1.5,
                                padding: '8px 10px', borderRadius: 6, border: '1px solid transparent',
                                minHeight: 60, whiteSpace: 'pre-wrap', wordBreak: 'break-word',
                              }}
                              onMouseEnter={e => (e.currentTarget.style.border = '1px solid var(--border)')}
                              onMouseLeave={e => (e.currentTarget.style.border = '1px solid transparent')}>
                              {pc.notes || 'Click to add notes…'}
                            </div>
                          )}
                          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 'auto' }}>
                            <button onClick={() => removeFromProject(pc.row_id)}
                              style={{ background: 'none', color: '#ef4444', border: '1px solid #ef4444', fontSize: 11, padding: '4px 10px', borderRadius: 5 }}>
                              Remove
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}

          {/* ── Google Trend detail ── */}
          {selectedTrend && !showTrending && !showRising && !showSaved && (
            <div>
              <div style={{ display: 'flex', gap: 20, alignItems: 'flex-start', marginBottom: 28 }}>
                {selectedTrend.picture && <img src={selectedTrend.picture} alt="" style={{ width: 100, height: 70, objectFit: 'cover', borderRadius: 8, flexShrink: 0 }} />}
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--text)', lineHeight: 1.2, marginBottom: 6, textTransform: 'capitalize' }}>{selectedTrend.topic}</div>
                  <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
                    <span style={{ background: 'var(--accent)', color: '#fff', borderRadius: 6, padding: '4px 11px', fontSize: 13, fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                      <NavIcon kind="trending" size={12} /> {selectedTrend.traffic} searches
                    </span>
                    <span style={{ background: 'var(--surface2)', color: 'var(--muted)', borderRadius: 6, padding: '3px 10px', fontSize: 12, fontWeight: 600 }}>
                      {trendsRegions.find(r => r.code === trendsRegion)?.name || trendsRegion}
                    </span>
                    {selectedTrend.picture_source && <span style={{ color: 'var(--muted)', fontSize: 12 }}>via {selectedTrend.picture_source}</span>}
                  </div>
                </div>
                <button onClick={() => { setTopic(selectedTrend.topic); setSelectedTrend(null); search(undefined, selectedTrend.topic) }}
                  style={{ background: 'var(--accent)', color: '#fff', fontWeight: 700, padding: '10px 20px', whiteSpace: 'nowrap', flexShrink: 0 }}>
                  Search YouTube for clips ↗
                </button>
              </div>
              {selectedTrend.news_items?.length > 0 && (
                <>
                  <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--muted)', marginBottom: 12 }}>Related News</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    {selectedTrend.news_items.map((ni: any, i: number) => (
                      <a key={i} href={ni.url} target="_blank" rel="noreferrer" style={{ display: 'flex', gap: 14, alignItems: 'center', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: '12px 16px', textDecoration: 'none', transition: 'box-shadow 0.15s' }}
                        onMouseEnter={e => (e.currentTarget.style.boxShadow = '0 4px 16px rgba(0,0,0,0.08)')}
                        onMouseLeave={e => (e.currentTarget.style.boxShadow = 'none')}>
                        {ni.picture && <img src={ni.picture} alt="" style={{ width: 80, height: 56, objectFit: 'cover', borderRadius: 6, flexShrink: 0 }} />}
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', lineHeight: 1.4, marginBottom: 4 }}>{ni.title}</div>
                          <div style={{ fontSize: 11, color: 'var(--muted)' }}>{ni.source}</div>
                        </div>
                        <span style={{ color: 'var(--muted)', fontSize: 16, flexShrink: 0 }}>↗</span>
                      </a>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}

          {/* ── Rising Channels ── */}
          {showRising && (
            <>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                <div style={{ fontSize: 17, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8 }}><NavIcon kind="rising" size={17} /> Rising Channels</div>
                {loadingRising && <div style={{ color: 'var(--muted)', fontSize: 13 }}>Analysing channels…</div>}
              </div>
              <div style={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 10, padding: '12px 16px', marginBottom: 16, fontSize: 14, color: 'var(--text)', lineHeight: 1.5 }}>
                Clippr is scoring YouTube channels by <strong>momentum</strong> — recent views divided by subscriber count — to surface channels punching above their weight, not just the biggest names. Pick a <strong>category</strong> in the left-hand pane to narrow the results to a specific niche.
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 16 }}>
                {risingChannels.map(ch => <ChannelCard key={ch.id} channel={ch} onSearch={t => { nav('search'); setTopic(t); search(undefined, t) }} />)}
              </div>
            </>
          )}

          {/* ── Trending ── */}
          {showTrending && (
            <>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                <div style={{ fontSize: 17, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8 }}><NavIcon kind="trending" size={17} /> Trending on YouTube</div>
                {trendingClips.length === 0 && <div style={{ color: 'var(--muted)', fontSize: 13 }}>Loading…</div>}
              </div>
              <div style={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 10, padding: '12px 16px', marginBottom: 16, fontSize: 14, color: 'var(--text)', lineHeight: 1.5 }}>
                Clippr is pulling YouTube's current <strong>mostPopular</strong> chart live. Pick a <strong>category</strong> in the left-hand pane (Gaming, Sports, Music, etc) to filter the chart down to a specific topic.
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 16 }}>
                {trendingClips.map(clip => (
                  <ClipCard key={clip.id} clip={clip}
                    saved={isSaved(clip)}
                    onToggleSave={() => removeFromProject(projectClips.find(pc => pc.clip.id === clip.id && pc.clip.platform === clip.platform)?.row_id!)}
                    projects={projects}
                    onSaveToProject={saveToProject}
                    previouslyDownloaded={downloadedIds.has(downloadKey(clip))}
                    onOpenInstagramSettings={() => setShowSettings(true)} />
                ))}
              </div>
            </>
          )}

          {/* ── Search results ── */}
          {isSearch && !selectedTrend && (
            <>
              {/* Batch download bar */}
              {clips.length > 0 && (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, gap: 12, flexWrap: 'wrap' }}>
                  <div style={{ color: 'var(--muted)', fontSize: 13 }}>
                    <strong style={{ color: 'var(--text)' }}>{clips.length}</strong> clips{currentTopic ? ` for "${currentTopic}"` : ''}
                  </div>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    {selected.size > 0 && (
                      <>
                        <span style={{ fontSize: 13, color: 'var(--muted)' }}>{selected.size} selected</span>
                        <button onClick={batchDownload} disabled={batchDownloading} style={{
                          background: 'var(--accent)', color: '#fff', fontWeight: 600, fontSize: 13, padding: '6px 16px',
                          opacity: batchDownloading ? 0.7 : 1,
                        }}>
                          {batchDownloading ? 'Downloading…' : `↓ Download ${selected.size}`}
                        </button>
                        <button onClick={removeSelected} disabled={batchDownloading}
                          style={{ background: 'none', color: 'var(--error)', border: '1px solid var(--error)', fontWeight: 600, fontSize: 13, padding: '6px 16px', opacity: batchDownloading ? 0.7 : 1 }}>
                          Remove {selected.size}
                        </button>
                        <button onClick={() => setSelected(new Set())}
                          style={{ background: 'none', color: 'var(--muted)', border: '1px solid var(--border)', fontSize: 13, padding: '6px 10px' }}>✕</button>
                      </>
                    )}
                    {selected.size === 0 && clips.length > 0 && (
                      <button onClick={() => setSelected(new Set(clips.map(c => `${c.platform}-${c.id}`)))}
                        style={{ background: 'none', color: 'var(--muted)', border: '1px solid var(--border)', fontSize: 13, padding: '6px 12px' }}>
                        Select all
                      </button>
                    )}
                  </div>
                </div>
              )}

              {clips.length > 0 && (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 16 }}>
                  {clips.map(clip => {
                    const key = `${clip.platform}-${clip.id}`
                    return (
                      <div key={key} style={{ position: 'relative' }}>
                        {/* Selection checkbox */}
                        <div onClick={() => toggleSelect(key)} style={{
                          position: 'absolute', top: 10, left: 10, zIndex: 5,
                          width: 20, height: 20, borderRadius: 4, cursor: 'pointer',
                          background: selected.has(key) ? 'var(--accent)' : 'rgba(0,0,0,0.5)',
                          border: `2px solid ${selected.has(key) ? 'var(--accent)' : 'rgba(255,255,255,0.6)'}`,
                          display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, color: '#fff',
                        }}>
                          {selected.has(key) ? '✓' : ''}
                        </div>
                        <ClipCard clip={clip}
                          saved={isSaved(clip)}
                          onToggleSave={() => removeFromProject(projectClips.find(pc => pc.clip.id === clip.id && pc.clip.platform === clip.platform)?.row_id!)}
                          projects={projects}
                          onSaveToProject={saveToProject}
                          previouslyDownloaded={downloadedIds.has(downloadKey(clip))}
                          onOpenInstagramSettings={() => setShowSettings(true)} />
                      </div>
                    )
                  })}
                </div>
              )}

              {nextPageToken && (
                <div style={{ textAlign: 'center', marginTop: 28 }}>
                  <button onClick={loadMore} disabled={loadingMore} style={{ background: 'var(--surface)', color: 'var(--text)', border: '1px solid var(--border)', padding: '10px 32px', fontWeight: 500 }}>
                    {loadingMore ? 'Loading…' : 'Load more'}
                  </button>
                </div>
              )}

              {!loading && clips.length === 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '80px 0', color: 'var(--muted)', textAlign: 'center', gap: 8 }}>
                  <div style={{ fontSize: 36 }}>🎬</div>
                  <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text)' }}>Find viral clips</div>
                  <div style={{ fontSize: 13 }}>Search a topic above or browse Trending</div>
                </div>
              )}
            </>
          )}
        </div>
      </main>

      {showSettings && <SettingsModal onClose={() => setShowSettings(false)} />}
      {showHelp && <HelpModal onClose={() => setShowHelp(false)} onOpenSettings={() => { setShowHelp(false); setShowSettings(true) }} />}
    </div>
  )
}
