import { useState } from 'react'
import { Clip, Project } from '../types'

export default function SaveToProjectModal({
  clip, projects, onSave, onClose,
}: {
  clip: Clip
  projects: Project[]
  onSave: (projectId: string) => void
  onClose: () => void
}) {
  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState('')

  async function createAndSave() {
    if (!newName.trim()) return
    const res = await fetch('/api/projects/', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: newName.trim() }),
    })
    const proj = await res.json()
    onSave(proj.id)
  }

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 1100, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div onClick={e => e.stopPropagation()} style={{ background: 'var(--surface)', borderRadius: 12, width: '100%', maxWidth: 380, padding: 24, boxShadow: '0 20px 60px rgba(0,0,0,0.4)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <div style={{ fontSize: 15, fontWeight: 700 }}>Save to project</div>
          <button onClick={onClose} style={{ background: 'none', color: 'var(--muted)', fontSize: 18, padding: 2 }}>✕</button>
        </div>

        <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 14, overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>{clip.title}</div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 16 }}>
          {projects.map(p => (
            <button key={p.id} onClick={() => onSave(p.id)} style={{
              textAlign: 'left', background: 'var(--surface2)', color: 'var(--text)',
              border: '1px solid var(--border)', padding: '10px 14px', borderRadius: 8, fontSize: 13, fontWeight: 500,
            }}>
              📁 {p.name}
            </button>
          ))}
        </div>

        {creating ? (
          <div style={{ display: 'flex', gap: 8 }}>
            <input autoFocus value={newName} onChange={e => setNewName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && createAndSave()}
              placeholder="Project name…" style={{ flex: 1, fontSize: 13 }} />
            <button onClick={createAndSave} style={{ background: 'var(--accent)', color: '#fff', fontWeight: 600, padding: '0 16px' }}>Create</button>
          </div>
        ) : (
          <button onClick={() => setCreating(true)} style={{ width: '100%', background: 'none', border: '1px dashed var(--border)', color: 'var(--muted)', padding: '9px 0', fontSize: 13 }}>
            + New project
          </button>
        )}
      </div>
    </div>
  )
}
