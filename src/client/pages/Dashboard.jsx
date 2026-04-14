import { useState, useEffect } from 'react'
import { api, fmtDate } from '../utils/api'

export default function Dashboard({ onNavigate, showToast, updateBadges }) {
  const [data, setData] = useState(null)
  const [articleUrl, setArticleUrl] = useState('')
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    api('/api/dashboard').then(d => {
      setData(d)
      updateBadges()
    })
  }, [])

  async function runCrawl() {
    await api('/api/run/crawl', 'POST')
    showToast('Crawl started. New drafts will appear in Review Drafts once complete.')
  }

  async function submitArticle() {
    if (!articleUrl.trim()) return
    setSubmitting(true)
    try {
      const r = await api('/api/run/article', 'POST', { url: articleUrl.trim() })
      showToast(`Draft created for "${r.title}" (score: ${r.score}/10)`, 'success')
      setArticleUrl('')
      updateBadges()
    } catch (err) {
      showToast(`Failed: ${err.message}`, 'error')
    }
    setSubmitting(false)
  }

  async function postNow() {
    if (!confirm('Post the next approved item to LinkedIn right now?')) return
    const r = await api('/api/run/post', 'POST')
    if (r.skipped)     showToast(`Skipped: ${r.reason}`, 'error')
    else if (r.posted) { showToast('Posted!', 'success'); api('/api/dashboard').then(setData) }
    else               showToast(`Failed: ${r.error}`, 'error')
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
      <div className="page-header">
        <div>
          <div className="page-title">Dashboard</div>
          <div className="page-sub">Your automated LinkedIn pipeline</div>
        </div>
        <div className="btn-row">
          <button className="btn btn-ghost" onClick={runCrawl}>▶ Run Crawl Now</button>
        </div>
      </div>

      <div className="li-bar">
        {li.connected ? (
          <><span className="dot dot-green" /> LinkedIn connected — token valid for {li.expiresIn}m</>
        ) : (
          <><span className="dot dot-red" /> LinkedIn not connected — <a href="/auth/linkedin" style={{ color: 'var(--accent)' }}>Connect now</a></>
        )}
      </div>

      {brokenSources.length > 0 && (
        <div className="li-bar" style={{ borderColor: '#f87171', color: '#f87171' }}>
          <span className="dot dot-red" /> Source issues detected: {brokenSources.join(' · ')}
          {sourceHealth?.checkedAt && (
            <span style={{ marginLeft: 8, opacity: 0.6, fontSize: 11 }}>
              (checked {new Date(sourceHealth.checkedAt).toLocaleTimeString()})
            </span>
          )}
        </div>
      )}

      <div className="stat-grid">
        <div className="stat">
          <div className="stat-val">{stats.draftsPendingReview}</div>
          <div className="stat-lbl">Awaiting Review</div>
        </div>
        <div className="stat">
          <div className="stat-val">{stats.draftsApproved}</div>
          <div className="stat-lbl">Approved (Backlog)</div>
        </div>
        <div className="stat">
          <div className="stat-val">{stats.postsTotal}</div>
          <div className="stat-lbl">Posts Published</div>
        </div>
        <div className="stat">
          <div className="stat-val">{stats.articlesTotal}</div>
          <div className="stat-lbl">Articles Scraped</div>
        </div>
      </div>

      <div className="card">
        <div style={{ fontWeight: 600, marginBottom: 10 }}>Schedule</div>
        <div style={{ fontSize: 13, color: 'var(--muted)', lineHeight: 2.2 }}>
          <div>Crawl: {config.schedule?.crawlCron} &nbsp; ({config.schedule?.timezone})</div>
          <div>Posts: {config.schedule?.postDayOfWeek} at {config.schedule?.postTime}</div>
          <div>Last post: {stats.lastPost ? new Date(stats.lastPost).toLocaleDateString() : 'None yet'}</div>
          <div>Backlog: {stats.draftsApproved} post{stats.draftsApproved === 1 ? '' : 's'} queued</div>
        </div>
      </div>

      {stats.draftsPendingReview > 0 && (
        <div className="card" style={{ borderColor: 'var(--accent)', background: '#1a1d35' }}>
          <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 10 }}>
            {stats.draftsPendingReview} draft{stats.draftsPendingReview > 1 ? 's' : ''} waiting for your review
          </div>
          <button className="btn btn-primary" onClick={() => onNavigate('review')}>Review Now</button>
        </div>
      )}

      <div className="card">
        <div style={{ fontWeight: 600, marginBottom: 6 }}>Draft from URL</div>
        <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 12 }}>
          Paste any article URL to generate a draft immediately, bypassing the crawl.
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <input
            className="cfg-input"
            style={{ flex: 1 }}
            value={articleUrl}
            onChange={e => setArticleUrl(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && !submitting && submitArticle()}
            placeholder="https://..."
            disabled={submitting}
          />
          <button
            className="btn btn-primary"
            onClick={submitArticle}
            disabled={submitting || !articleUrl.trim()}
          >
            {submitting ? 'Drafting...' : 'Draft It'}
          </button>
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <button className="btn btn-warn" onClick={postNow}>Post Next Approved Now</button>
        <span style={{ fontSize: 12, color: 'var(--muted)' }}>
          Bypasses the schedule — use to test or catch up
        </span>
      </div>
    </>
  )
}
