import { useEffect, useRef, useState } from 'react'

interface CookieStatus {
  exists: boolean
  size?: number
  uploaded_at?: string
}

export default function SettingsModal({ onClose }: { onClose: () => void }) {
  const [status, setStatus] = useState<CookieStatus | null>(null)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  function refresh() {
    fetch('/api/settings/cookies/instagram').then(r => r.json()).then(setStatus).catch(() => {})
  }

  useEffect(() => { refresh() }, [])

  async function upload(file: File) {
    setUploading(true)
    setError('')
    try {
      const form = new FormData()
      form.append('file', file)
      const res = await fetch('/api/settings/cookies/instagram', { method: 'POST', body: form })
      if (!res.ok) throw new Error(await res.text())
      refresh()
    } catch (e: any) {
      setError(e.message || 'Upload failed')
    } finally {
      setUploading(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  async function remove() {
    if (!confirm('Remove the stored Instagram cookies file?')) return
    await fetch('/api/settings/cookies/instagram', { method: 'DELETE' })
    refresh()
  }

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 1300, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div onClick={e => e.stopPropagation()} style={{ background: 'var(--surface)', borderRadius: 12, width: '100%', maxWidth: 460, padding: 24, boxShadow: '0 20px 60px rgba(0,0,0,0.4)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
          <div style={{ fontSize: 15, fontWeight: 700 }}>⚙ Settings</div>
          <button onClick={onClose} style={{ background: 'none', color: 'var(--muted)', fontSize: 18, padding: 2 }}>✕</button>
        </div>

        <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 16, marginBottom: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
          Instagram login
        </div>

        <div style={{ fontSize: 12, color: 'var(--muted)', lineHeight: 1.5, marginBottom: 14 }}>
          Instagram blocks anonymous downloads. To fix this, log into Instagram in your own
          browser, export your session cookies with an extension like{' '}
          <strong>"Get cookies.txt LOCALLY"</strong>, and upload the file here. Clippr never
          sees your password — only the exported session cookies, which expire periodically
          and need re-uploading.
        </div>

        <div style={{ background: 'var(--surface2)', borderRadius: 10, padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
          {status?.exists ? (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ fontSize: 12, color: 'var(--success)' }}>
                ✓ Cookies uploaded {status.uploaded_at ? `on ${status.uploaded_at}` : ''}
              </div>
              <button onClick={remove} style={{ background: 'none', color: '#ef4444', border: '1px solid #ef4444', fontSize: 11, padding: '4px 10px', borderRadius: 6 }}>
                Remove
              </button>
            </div>
          ) : (
            <div style={{ fontSize: 12, color: 'var(--muted)' }}>No cookies uploaded yet.</div>
          )}

          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <input ref={fileRef} type="file" accept=".txt"
              onChange={e => e.target.files?.[0] && upload(e.target.files[0])}
              style={{ flex: 1, fontSize: 12 }} />
            {uploading && <span style={{ fontSize: 11, color: 'var(--muted)' }}>Uploading…</span>}
          </div>

          {error && <div style={{ fontSize: 11, color: 'var(--error)' }}>{error}</div>}
        </div>
      </div>
    </div>
  )
}
