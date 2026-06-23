import { useState, useEffect, useRef } from 'react'
import { Clip, Project, ProjectClip } from './types'
import ClipCard from './components/ClipCard'
import ChannelCard from './components/ChannelCard'
import SettingsModal from './components/SettingsModal'

const MAX_HISTORY = 10

export default function App() {
  const [topic, setTopic] = useState('')
  const [manualUrls, setManualUrls] = useState({ instagram: '', tiktok: '' })
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
      body: JSON.stringify({ name: newProjectName.trim() }),
    }).then(r => r.json())
    setNewProjectName('')
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
    const entries: { url: string; platform: Clip['platform'] }[] = []
    if (manualUrls.instagram.trim()) entries.push({ url: manualUrls.instagram.trim(), platform: 'instagram' })
    if (manualUrls.tiktok.trim()) entries.push({ url: manualUrls.tiktok.trim(), platform: 'tiktok' })
    return Promise.all(entries.map(async ({ url, platform }) => {
      try {
        const res = await fetch(`/api/meta/?url=${encodeURIComponent(url)}`)
        const meta = await res.json()
        return { id: `${platform}-${Date.now()}`, title: meta.title || `${platform} clip`, thumbnail: meta.thumbnail, url, platform } as Clip
      } catch {
        return { id: `${platform}-${Date.now()}`, title: `${platform} clip`, url, platform } as Clip
      }
    }))
  }

  async function search(e?: React.FormEvent, overrideTopic?: string) {
    e?.preventDefault()
    const t = overrideTopic ?? topic
    const hasSearch = t.trim()
    const hasManual = Object.values(manualUrls).some(u => u.trim())
    if (!hasSearch && !hasManual) return
    nav('search')

    if (hasManual && !hasSearch && clips.length > 0) {
      const manualClips = await resolveManualClips()
      setClips(prev => [...manualClips, ...prev])
      setManualUrls({ instagram: '', tiktok: '' })
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
      setManualUrls({ instagram: '', tiktok: '' })
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

  // ── render ────────────────────────────────────────────────────────────────

  const isSearch = !showTrending && !showRising && !showSaved && !selectedTrend
  const activeClips = showTrending ? trendingClips : isSearch ? clips : []

  const navItems = [
    { label: 'Search', icon: '⌕', view: 'search' as const, active: isSearch },
    { label: 'Trending', icon: '🔥', view: 'trending' as const, active: showTrending },
    { label: 'Rising Channels', icon: '📈', view: 'rising' as const, active: showRising },
    { label: `Projects${projectClips.length ? ` (${projectClips.length})` : ''}`, icon: '📁', view: 'saved' as const, active: showSaved },
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
            <div style={{ fontSize: 19, fontWeight: 800, color: '#fff', letterSpacing: '-0.5px', lineHeight: 1 }}>
              Clip<span style={{ color: '#3b82f6' }}>pr</span>
            </div>
            <div style={{ color: 'var(--sidebar-text)', fontSize: 10, marginTop: 3, letterSpacing: '0.04em' }}>Viral clip discovery</div>
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            <button onClick={() => setShowSettings(true)} title="Settings"
              style={{ background: 'rgba(255,255,255,0.06)', color: 'var(--sidebar-text)', padding: '5px 7px', fontSize: 13, borderRadius: 7, lineHeight: 1 }}>
              ⚙
            </button>
            <button onClick={() => setDark(d => !d)} title={dark ? 'Light mode' : 'Dark mode'}
              style={{ background: 'rgba(255,255,255,0.06)', color: 'var(--sidebar-text)', padding: '5px 7px', fontSize: 13, borderRadius: 7, lineHeight: 1 }}>
              {dark ? '☀️' : '🌙'}
            </button>
          </div>
        </div>

        <div style={{ flex: 1, padding: '4px 10px 16px', display: 'flex', flexDirection: 'column', gap: 1 }}>
          {/* Nav items */}
          {navItems.map(item => (
            <button key={item.view} onClick={() => nav(item.view)} style={{
              display: 'flex', alignItems: 'center', gap: 9, width: '100%', textAlign: 'left',
              background: item.active ? 'rgba(59,130,246,0.15)' : 'transparent',
              color: item.active ? '#fff' : 'var(--sidebar-text)',
              padding: '8px 10px', borderRadius: 8, fontSize: 13,
              fontWeight: item.active ? 600 : 400,
              borderLeft: item.active ? '3px solid #3b82f6' : '3px solid transparent',
              transition: 'all 0.12s',
            }}>
              <span style={{ fontSize: 15, lineHeight: 1 }}>{item.icon}</span>
              <span>{item.label}</span>
            </button>
          ))}

          {/* Category filter for Trending / Rising */}
          {(showTrending || showRising) && categories.length > 0 && (
            <div style={{ marginTop: 20, borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: 16 }}>
              <div style={{ color: '#334155', fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 6, padding: '0 10px' }}>Category</div>
              {categories.map(c => {
                const activeId = showTrending ? trendingCategory : risingCategory
                const setActive = showTrending ? setTrendingCategory : setRisingCategory
                return (
                  <button key={c.id} onClick={() => setActive(c.id)} style={{
                    display: 'block', width: '100%', textAlign: 'left',
                    background: activeId === c.id ? 'rgba(59,130,246,0.15)' : 'transparent',
                    color: activeId === c.id ? '#fff' : 'var(--sidebar-text)',
                    borderLeft: activeId === c.id ? '3px solid #3b82f6' : '3px solid transparent',
                    padding: '6px 10px', borderRadius: 8, fontSize: 12, marginBottom: 1,
                  }}>{c.name}</button>
                )
              })}
            </div>
          )}

          {/* Project switcher — shown when Projects tab active */}
          {showSaved && (
            <div style={{ marginTop: 20, borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: 16 }}>
              <div style={{ color: '#334155', fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 6, padding: '0 10px' }}>Projects</div>
              {projects.map(p => (
                <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 1 }}>
                  {renamingId === p.id ? (
                    <input autoFocus value={renameText} onChange={e => setRenameText(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') renameProject(p.id, renameText); if (e.key === 'Escape') setRenamingId(null) }}
                      style={{ flex: 1, fontSize: 12, padding: '4px 8px', background: '#1e293b', color: '#fff', border: '1px solid #334155', borderRadius: 5 }} />
                  ) : (
                    <button onClick={() => setActiveProjectId(p.id)} style={{
                      flex: 1, textAlign: 'left', background: activeProjectId === p.id ? '#1e293b' : 'none',
                      color: activeProjectId === p.id ? '#fff' : 'var(--sidebar-text)',
                      padding: '6px 10px', borderRadius: 5, fontSize: 12, overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis',
                    }}>
                      📁 {p.name}
                    </button>
                  )}
                  {activeProjectId === p.id && p.id !== 'default' && !renamingId && (
                    <div style={{ display: 'flex', gap: 2 }}>
                      <button onClick={() => { setRenamingId(p.id); setRenameText(p.name) }} style={{ background: 'none', color: '#475569', padding: '2px 4px', fontSize: 11 }} title="Rename">✎</button>
                      <button onClick={() => deleteProject(p.id)} style={{ background: 'none', color: '#475569', padding: '2px 4px', fontSize: 11 }} title="Delete">✕</button>
                    </div>
                  )}
                </div>
              ))}
              {creatingProject ? (
                <div style={{ display: 'flex', gap: 4, padding: '0 10px', marginTop: 6 }}>
                  <input autoFocus value={newProjectName} onChange={e => setNewProjectName(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') createProject(); if (e.key === 'Escape') setCreatingProject(false) }}
                    placeholder="Project name…" style={{ flex: 1, fontSize: 11, padding: '4px 8px', background: '#1e293b', color: '#fff', border: '1px solid #334155', borderRadius: 5 }} />
                  <button onClick={createProject} style={{ background: 'var(--accent)', color: '#fff', fontSize: 11, padding: '4px 8px', borderRadius: 5 }}>+</button>
                </div>
              ) : (
                <button onClick={() => setCreatingProject(true)} style={{ display: 'block', width: '100%', textAlign: 'left', background: 'none', color: '#475569', padding: '5px 10px', fontSize: 11, marginTop: 4 }}>
                  + New project
                </button>
              )}
            </div>
          )}

          {/* Google Trends */}
          {(googleTrends.length > 0 || trendsRegions.length > 0) && (
            <div style={{ marginTop: 20, borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: 16 }}>
              <div style={{ color: '#334155', fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 8, padding: '0 10px' }}>
                🔍 Trends
              </div>
              {trendsRegions.length > 0 && (
                <div style={{ padding: '0 10px', marginBottom: 10 }}>
                  <select value={trendsRegion} onChange={e => setTrendsRegion(e.target.value)}
                    style={{ background: 'rgba(255,255,255,0.05)', color: '#94a3b8', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 7, fontSize: 11, padding: '5px 8px' }}>
                    {trendsRegions.map(r => <option key={r.code} value={r.code}>{r.name}</option>)}
                  </select>
                </div>
              )}
              {googleTrends.length === 0 && <div style={{ color: '#334155', fontSize: 12, padding: '4px 10px' }}>Loading…</div>}
              {googleTrends.map(t => (
                <button key={t.topic} onClick={() => { nav('search'); setSelectedTrend(t) }} style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  width: '100%', textAlign: 'left',
                  background: selectedTrend?.topic === t.topic ? 'rgba(59,130,246,0.15)' : 'transparent',
                  color: selectedTrend?.topic === t.topic ? '#fff' : 'var(--sidebar-text)',
                  borderLeft: selectedTrend?.topic === t.topic ? '3px solid #3b82f6' : '3px solid transparent',
                  padding: '5px 10px', borderRadius: 8, fontSize: 12, marginBottom: 1, gap: 6,
                }}>
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>{t.topic}</span>
                  <span style={{ color: '#334155', fontSize: 10, flexShrink: 0, fontWeight: 600 }}>{t.traffic}</span>
                </button>
              ))}
            </div>
          )}
        </div>
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
                <svg width="20" height="14" viewBox="0 0 20 14" fill="none">
                  <rect width="20" height="14" rx="3" fill="#FF0000"/>
                  <polygon points="8,3.5 14.5,7 8,10.5" fill="white"/>
                </svg>
                <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', letterSpacing: '0.04em', width: 62 }}>YouTube</span>
              </div>
              <div style={{ flex: 1, position: 'relative' }}>
                <span style={{ position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)', color: 'var(--muted)', fontSize: 15, pointerEvents: 'none' }}>⌕</span>
                <input value={topic} onChange={e => setTopic(e.target.value)}
                  placeholder="Search topic — e.g. skateboarding fails, cooking hacks…"
                  style={{ paddingLeft: 32, height: 38, fontSize: 13 }} />
              </div>
              <button type="button" onClick={() => setShowFilters(f => !f)} style={{
                background: (dateFilter || durationFilter || minViews) ? 'rgba(37,99,235,0.12)' : 'var(--surface2)',
                color: (dateFilter || durationFilter || minViews) ? 'var(--accent)' : 'var(--muted)',
                border: '1.5px solid var(--border)', padding: '0 12px', height: 38, fontSize: 12, borderRadius: 8,
                display: 'flex', alignItems: 'center', gap: 4, whiteSpace: 'nowrap', flexShrink: 0,
              }}>
                ⚙ Filters{(dateFilter || durationFilter || minViews) ? ' ●' : ''}
              </button>
              <button type="submit" disabled={loading} style={{
                background: 'linear-gradient(135deg, #ff0000, #cc0000)', color: '#fff', fontWeight: 700,
                padding: '0 18px', height: 38, whiteSpace: 'nowrap', opacity: loading ? 0.7 : 1,
                borderRadius: 8, flexShrink: 0, fontSize: 13,
              }}>
                {loading ? 'Searching…' : 'Search'}
              </button>
            </div>

            {/* Filter row */}
            {showFilters && (
              <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap', alignItems: 'center', paddingLeft: 90 }}>
                <select value={dateFilter} onChange={e => setDateFilter(e.target.value)}
                  style={{ fontSize: 12, padding: '5px 8px', flex: '1 1 120px', height: 34 }}>
                  <option value="">Any date</option>
                  <option value="day">Past 24 hours</option>
                  <option value="week">Past week</option>
                  <option value="month">Past month</option>
                  <option value="year">Past year</option>
                </select>
                <select value={durationFilter} onChange={e => setDurationFilter(e.target.value)}
                  style={{ fontSize: 12, padding: '5px 8px', flex: '1 1 120px', height: 34 }}>
                  <option value="">Any duration</option>
                  <option value="short">Short (&lt; 4 min)</option>
                  <option value="medium">Medium (4–20 min)</option>
                  <option value="long">Long (&gt; 20 min)</option>
                </select>
                <select value={String(minViews)} onChange={e => setMinViews(Number(e.target.value))}
                  style={{ fontSize: 12, padding: '5px 8px', flex: '1 1 120px', height: 34 }}>
                  <option value="0">Any views</option>
                  <option value="10000">10K+ views</option>
                  <option value="100000">100K+ views</option>
                  <option value="1000000">1M+ views</option>
                  <option value="10000000">10M+ views</option>
                </select>
                {(dateFilter || durationFilter || minViews > 0) && (
                  <button onClick={() => { setDateFilter(''); setDurationFilter(''); setMinViews(0) }}
                    style={{ background: 'none', color: 'var(--muted)', border: '1.5px solid var(--border)', fontSize: 12, padding: '0 10px', height: 34, borderRadius: 7 }}>
                    Clear
                  </button>
                )}
              </div>
            )}
          </form>

          {/* Divider */}
          <div style={{ borderTop: '1px solid var(--border)', margin: '10px 0' }} />

          {/* Row 2 — TikTok + Instagram */}
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            {/* TikTok */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
              <svg width="14" height="16" viewBox="0 0 14 16" fill="none">
                <path d="M13 3.5a3.5 3.5 0 01-3.5-3.5H7v11a2 2 0 11-2-2v-2.1A4 4 0 1011 12.5V6.1A7 7 0 0013 6.5V3.5z" fill="#010101"/>
                <path d="M13 3.5a3.5 3.5 0 01-3.5-3.5H7v11a2 2 0 11-2-2v-2.1A4 4 0 1011 12.5V6.1A7 7 0 0013 6.5V3.5z" fill="url(#tt)" fillOpacity="0.5"/>
                <defs><linearGradient id="tt" x1="0" y1="0" x2="14" y2="16" gradientUnits="userSpaceOnUse"><stop stopColor="#69C9D0"/><stop offset="1" stopColor="#EE1D52"/></linearGradient></defs>
              </svg>
              <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', letterSpacing: '0.04em', width: 62 }}>TikTok</span>
            </div>
            <button type="button" onClick={() => window.open(`https://www.tiktok.com/search?q=${encodeURIComponent(topic)}`, '_blank')}
              style={{ background: '#010101', color: '#fff', whiteSpace: 'nowrap', padding: '0 12px', height: 38, fontSize: 12, borderRadius: 8, flexShrink: 0 }}>
              Open ↗
            </button>
            <input value={manualUrls.tiktok} onChange={e => setManualUrls(u => ({ ...u, tiktok: e.target.value }))}
              placeholder="Paste TikTok URL to import…" style={{ flex: 1, height: 38, fontSize: 13 }} />

            {/* Divider */}
            <div style={{ width: 1, height: 30, background: 'var(--border)', flexShrink: 0 }} />

            {/* Instagram */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <rect x="1" y="1" width="14" height="14" rx="4" fill="url(#ig)"/>
                <circle cx="8" cy="8" r="3" stroke="white" strokeWidth="1.5"/>
                <circle cx="12" cy="4" r="1" fill="white"/>
                <defs><linearGradient id="ig" x1="0" y1="16" x2="16" y2="0" gradientUnits="userSpaceOnUse"><stop stopColor="#F58529"/><stop offset="0.5" stopColor="#DD2A7B"/><stop offset="1" stopColor="#8134AF"/></linearGradient></defs>
              </svg>
              <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', letterSpacing: '0.04em', width: 62 }}>Instagram</span>
            </div>
            <button type="button" onClick={() => window.open(`https://www.instagram.com/explore/search/keyword/?q=${encodeURIComponent(topic)}`, '_blank')}
              style={{ background: 'linear-gradient(135deg, #F58529, #DD2A7B)', color: '#fff', whiteSpace: 'nowrap', padding: '0 12px', height: 38, fontSize: 12, borderRadius: 8, flexShrink: 0 }}>
              Open ↗
            </button>
            <input value={manualUrls.instagram} onChange={e => setManualUrls(u => ({ ...u, instagram: e.target.value }))}
              placeholder="Paste Instagram URL to import…" style={{ flex: 1, height: 38, fontSize: 13 }} />

            {(manualUrls.tiktok.trim() || manualUrls.instagram.trim()) && (
              <button onClick={() => search()}
                style={{ background: 'linear-gradient(135deg, #2563eb, #1d4ed8)', color: '#fff', fontWeight: 700, padding: '0 16px', height: 38, borderRadius: 8, flexShrink: 0, fontSize: 13 }}>
                Add clips
              </button>
            )}
          </div>

          {/* Search history chips */}
          {searchHistory.length > 0 && (
            <div style={{ display: 'flex', gap: 6, marginTop: 9, flexWrap: 'wrap', alignItems: 'center', paddingLeft: 90 }}>
              <span style={{ fontSize: 11, color: 'var(--muted)', flexShrink: 0 }}>Recent:</span>
              {searchHistory.map(h => (
                <button key={h} onClick={() => { setTopic(h); search(undefined, h) }}
                  style={{ background: 'var(--surface2)', color: 'var(--muted)', border: '1px solid var(--border)', fontSize: 11, padding: '3px 10px', borderRadius: 99 }}>
                  {h}
                </button>
              ))}
              <button onClick={() => { setSearchHistory([]); localStorage.removeItem('searchHistory') }}
                style={{ background: 'none', color: 'var(--muted)', fontSize: 12, padding: '2px 4px' }}>✕</button>
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
                <div style={{ fontSize: 16, fontWeight: 700 }}>
                  📁 {projects.find(p => p.id === activeProjectId)?.name ?? 'Project'}
                  <span style={{ fontWeight: 400, fontSize: 13, color: 'var(--muted)', marginLeft: 8 }}>{projectClips.length} clip{projectClips.length !== 1 ? 's' : ''}</span>
                </div>
              </div>
              {projectClips.length === 0 ? (
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
                            previouslyDownloaded={downloadedIds.has(downloadKey(pc.clip))} />
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
                    <span style={{ background: '#ef4444', color: '#fff', borderRadius: 6, padding: '3px 10px', fontSize: 12, fontWeight: 700 }}>🔥 {selectedTrend.traffic} searches</span>
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
                <div style={{ fontSize: 16, fontWeight: 700 }}>📈 Rising Channels</div>
                {loadingRising && <div style={{ color: 'var(--muted)', fontSize: 13 }}>Analysing channels…</div>}
              </div>
              <div style={{ color: 'var(--muted)', fontSize: 12, marginBottom: 16 }}>Momentum = recent views ÷ subscribers. Higher = punching above weight.</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 16 }}>
                {risingChannels.map(ch => <ChannelCard key={ch.id} channel={ch} onSearch={t => { nav('search'); setTopic(t); search(undefined, t) }} />)}
              </div>
            </>
          )}

          {/* ── Trending ── */}
          {showTrending && (
            <>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                <div style={{ fontSize: 16, fontWeight: 700 }}>🔥 Trending on YouTube</div>
                {trendingClips.length === 0 && <div style={{ color: 'var(--muted)', fontSize: 13 }}>Loading…</div>}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 16 }}>
                {trendingClips.map(clip => (
                  <ClipCard key={clip.id} clip={clip}
                    saved={isSaved(clip)}
                    onToggleSave={() => removeFromProject(projectClips.find(pc => pc.clip.id === clip.id && pc.clip.platform === clip.platform)?.row_id!)}
                    projects={projects}
                    onSaveToProject={saveToProject}
                    previouslyDownloaded={downloadedIds.has(downloadKey(clip))} />
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
                        <span style={{ fontSize: 12, color: 'var(--muted)' }}>{selected.size} selected</span>
                        <button onClick={batchDownload} disabled={batchDownloading} style={{
                          background: 'var(--accent)', color: '#fff', fontWeight: 600, fontSize: 12, padding: '6px 16px',
                          opacity: batchDownloading ? 0.7 : 1,
                        }}>
                          {batchDownloading ? 'Downloading…' : `↓ Download ${selected.size}`}
                        </button>
                        <button onClick={() => setSelected(new Set())}
                          style={{ background: 'none', color: 'var(--muted)', border: '1px solid var(--border)', fontSize: 12, padding: '6px 10px' }}>✕</button>
                      </>
                    )}
                    {selected.size === 0 && clips.length > 0 && (
                      <button onClick={() => setSelected(new Set(clips.map(c => `${c.platform}-${c.id}`)))}
                        style={{ background: 'none', color: 'var(--muted)', border: '1px solid var(--border)', fontSize: 12, padding: '6px 12px' }}>
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
                          previouslyDownloaded={downloadedIds.has(downloadKey(clip))} />
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
    </div>
  )
}
