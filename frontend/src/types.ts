export interface Clip {
  id: string
  title: string
  url: string
  thumbnail?: string
  likes?: number
  views?: number
  comments?: number
  platform: 'youtube' | 'tiktok' | 'reddit' | 'instagram'
  duration?: string
  channel_name?: string
  channel_id?: string
  published_at?: string
  description?: string
  tags?: string[]
  category?: string
}

export interface Project {
  id: string
  name: string
  created_at: string
}

export interface ProjectClip {
  row_id: number
  clip: Clip
  notes: string
  saved_at: string
}

export interface DownloadJob {
  job_id: string
  status: 'queued' | 'downloading' | 'done' | 'error'
  filename?: string
  error?: string
}
