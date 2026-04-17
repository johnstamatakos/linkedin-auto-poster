import { useState, useEffect } from 'react'
import { api } from '../utils/api'
import ArticleFeed from '../components/ArticleFeed'

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

function parseCron(cron) {
  if (!cron) return '—'
  const [min, hour, , , weekday] = cron.split(' ')
  const h = parseInt(hour), m = parseInt(min)
  const time = `${h % 12 || 12}:${m.toString().padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`
  const days = weekday === '*'
    ? 'every day'
    : weekday.split(',').map(d => DAYS[parseInt(d)]).join(', ')
  return `${days} at ${time}`
}

function DraftModal({ onClose, onSuccess }) {
  const [url, setUrl] = useState('')
  const [submitting, setSubmitting] = useState(false)

  async function submit() {
    if (!url.trim()) return
    setSubmitting(true)
    try {
      const r = await api('/api/run/article', 'POST', { url: url.trim() })
      onSuccess(`Draft created for "${r.title}" (score: ${r.score}/10)`)
      onClose()
    } catch (err) {
      alert(`Failed: ${err.message}`)
      setSubmitting(false)
    }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 500, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="card" style={{ width: 'min(480px, calc(100vw - 32px))', padding: 24 }}>
        <div style={{ fontWeight: 600, marginBottom: 6 }}>Draft from URL</div>
        <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 14 }}>
          Paste any article URL to generate a draft immediately, bypassing the crawl.
        </div>
        <input
          className="cfg-input"
          value={url}
          onChange={e => setUrl(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && !submitting && submit()}
          placeholder="https://..."
          autoFocus
          disabled={submitting}
          style={{ width: '100%', boxSizing: 'border-box', marginBottom: 14 }}
        />
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button className="btn btn-ghost" onClick={onClose} disabled={submitting}>Cancel</button>
          <button className="btn btn-primary" onClick={submit} disabled={submitting || !url.trim()}>
            {submitting ? 'Drafting...' : 'Draft It'}
          </button>
        </div>
      </div>
    </div>
  )
}

export default function Dashboard({ showToast, updateBadges }) {
  const [data, setData] = useState(null)
  const [crawling, setCrawling] = useState(false)
  const [draftModalOpen, setDraftModalOpen] = useState(false)

  useEffect(() => {
    api('/api/dashboard').then(d => {
      setData(d)
      updateBadges()
    })
  }, [])

  async function runCrawl() {
    setCrawling(true)
    showToast('Crawling sources...', 'success', true)
    try {
      const res = await fetch('/api/run/crawl', { method: 'POST' })
      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buf = ''
      outer: while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buf += decoder.decode(value, { stream: true })
        const lines = buf.split('\n')
        buf = lines.pop() ?? ''
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          try {
            const data = JSON.parse(line.slice(6))
            if (data.done) {
              const n = data.pipelineResult?.draftsCreated || 0
              showToast(`Done! ${n} draft${n !== 1 ? 's' : ''} created.`)
              updateBadges()
              break outer
            }
            if (data.error) { showToast(data.error, 'error'); break outer }
            if (data.msg)   showToast(data.msg, 'success', true)
          } catch {}
        }
      }
    } catch (err) {
      showToast(`Crawl failed: ${err.message}`, 'error')
    }
    setCrawling(false)
  }

  async function postNow() {
    if (!confirm('Post the next approved item to LinkedIn right now?')) return
    const r = await api('/api/run/post', 'POST')
    if (r.skipped)     showToast(`Skipped: ${r.reason}`, 'error')
    else if (r.posted) { showToast('Posted!', 'success'); api('/api/dashboard').then(setData) }
    else               showToast(`Failed: ${r.error}`, 'error')
  }

  function onDraftSuccess(msg) {
    showToast(msg, 'success')
    updateBadges()
  }

  if (!data) {
    return (
      <div className="empty">
        <div className="icon">⏳</div>
        Loading...
      </div>
    )
  }

  const { stats, linkedInStatus: li, config, sourceHealth } = data

  const brokenSources = sourceHealth ? [
    sourceHealth.hackernews && !sourceHealth.hackernews.ok ? `HN (${sourceHealth.hackernews.error})` : null,
    sourceHealth.reddit     && !sourceHealth.reddit.ok     ? `Reddit (${sourceHealth.reddit.error})` : null,
    ...(sourceHealth.rss || []).filter(f => !f.ok).map(f => `${f.name} (${f.error})`),
  ].filter(Boolean) : []

  return (
    <>
      {/* Action row */}
      <div className="btn-row dash-action-row" style={{ marginBottom: 16, justifyContent: 'flex-end' }}>
        <button className="btn btn-ghost" onClick={runCrawl} disabled={crawling}>
          {crawling ? 'Crawling...' : 'Run Crawl'}
        </button>
        <button className="btn btn-warn" onClick={postNow}>Post Now</button>
        <button className="btn btn-primary" onClick={() => setDraftModalOpen(true)}>Draft</button>
      </div>

      {/* Consolidated info card */}
      <div className="card dash-info-grid" style={{ marginBottom: brokenSources.length > 0 ? 8 : 16 }}>
        {/* LinkedIn */}
        <div className="dash-info-col">
          <div style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--muted)', marginBottom: 8 }}>LinkedIn</div>
          {li.connected ? (
            <>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
                <span className="dot dot-green" />Connected
              </div>
              <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 3 }}>token valid for {li.expiresIn}m</div>
            </>
          ) : (
            <>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
                <span className="dot dot-red" />Not connected
              </div>
              <a href="/auth/linkedin" style={{ fontSize: 11, color: 'var(--accent)', display: 'block', marginTop: 3 }}>Connect now →</a>
            </>
          )}
        </div>

        {/* Schedule */}
        <div className="dash-info-col">
          <div style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--muted)', marginBottom: 8 }}>Schedule</div>
          <div style={{ fontSize: 13, color: 'var(--muted)', lineHeight: 1.9 }}>
            <div>Crawl <span style={{ color: 'var(--text)' }}>{parseCron(config.schedule?.crawlCron)}</span></div>
            <div>Posts <span style={{ color: 'var(--text)' }}>{parseCron(config.schedule?.postCron)}</span></div>
          </div>
        </div>

        {/* Activity */}
        <div className="dash-info-col">
          <div style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--muted)', marginBottom: 8 }}>Activity</div>
          <div style={{ fontSize: 13, color: 'var(--muted)', lineHeight: 1.9 }}>
            <div>Last post <span style={{ color: 'var(--text)' }}>{stats.lastPost ? new Date(stats.lastPost).toLocaleDateString() : 'None yet'}</span></div>
            <div>Backlog <span style={{ color: 'var(--text)' }}>{stats.draftsApproved} post{stats.draftsApproved === 1 ? '' : 's'} queued</span></div>
          </div>
        </div>

        {/* Stats */}
        <div className="dash-info-col">
          <div style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--muted)', marginBottom: 8 }}>Stats</div>
          <div style={{ fontSize: 13, color: 'var(--muted)', lineHeight: 1.9 }}>
            <div><span style={{ color: 'var(--text)', fontWeight: 600 }}>{stats.draftsPendingReview}</span> awaiting review</div>
            <div><span style={{ color: 'var(--text)', fontWeight: 600 }}>{stats.postsTotal}</span> published · <span style={{ color: 'var(--text)', fontWeight: 600 }}>{stats.articlesTotal}</span> scraped</div>
          </div>
        </div>
      </div>

      {/* Source health warning */}
      {brokenSources.length > 0 && (
        <div className="li-bar" style={{ borderColor: '#f87171', color: '#f87171', marginBottom: 16 }}>
          <span className="dot dot-red" /> Source issues: {brokenSources.join(' · ')}
          {sourceHealth?.checkedAt && (
            <span style={{ marginLeft: 8, opacity: 0.6, fontSize: 11 }}>
              checked {new Date(sourceHealth.checkedAt).toLocaleTimeString()}
            </span>
          )}
        </div>
      )}

      {/* Article feed */}
      <ArticleFeed updateBadges={updateBadges} showToast={showToast} />

      {/* Draft modal */}
      {draftModalOpen && (
        <DraftModal
          onClose={() => setDraftModalOpen(false)}
          onSuccess={onDraftSuccess}
        />
      )}
    </>
  )
}
