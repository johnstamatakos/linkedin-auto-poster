import { useState, useEffect } from 'react'
import { api, fmtDate, fmtNum } from '../utils/api'

function AnalyticsRow({ post }) {
  const hoursOld = (Date.now() - new Date(post.posted_at).getTime()) / 3600000

  if (post.analytics_fetched_at) {
    const hasAny = post.impressions != null || post.reactions != null || post.comments != null
    if (!hasAny) {
      return (
        <div className="analytics-pending">
          Analytics unavailable for this post (LinkedIn API access may require re-authorization with r_member_social scope)
        </div>
      )
    }
    return (
      <div className="analytics-row">
        <div className="analytics-metric">
          <span className="icon">👁</span>
          <span className="val">{fmtNum(post.impressions)}</span>
          <span className="lbl">impressions</span>
        </div>
        <div className="analytics-metric">
          <span className="icon">❤️</span>
          <span className="val">{fmtNum(post.reactions)}</span>
          <span className="lbl">reactions</span>
        </div>
        <div className="analytics-metric">
          <span className="icon">💬</span>
          <span className="val">{fmtNum(post.comments)}</span>
          <span className="lbl">comments</span>
        </div>
        <span style={{ marginLeft: 'auto', color: 'var(--muted)', fontSize: 11, alignSelf: 'center' }}>
          Updated {fmtDate(post.analytics_fetched_at)}
        </span>
      </div>
    )
  }

  if (hoursOld < 48) {
    return (
      <div className="analytics-pending">
        Analytics available ~{Math.ceil(48 - hoursOld)}h from now (LinkedIn data has a 24–48h lag)
      </div>
    )
  }

  return (
    <div className="analytics-pending">Analytics pending — click "Sync Analytics" to fetch</div>
  )
}

export default function PostHistory({ showToast }) {
  const [posts, setPosts] = useState([])
  const [syncing, setSyncing] = useState(false)

  useEffect(() => {
    api('/api/posts/recent').then(setPosts)
  }, [])

  async function syncAnalytics() {
    setSyncing(true)
    await api('/api/run/analytics', 'POST')
    showToast('Analytics sync started — refresh in a moment', 'success')
    setTimeout(() => {
      api('/api/posts/recent').then(setPosts)
      setSyncing(false)
    }, 3000)
  }

  return (
    <>
      <div className="page-header">
        <div>
          <div className="page-title">Post History</div>
          <div className="page-sub">Posts published to LinkedIn</div>
        </div>
        <button className="btn btn-ghost" onClick={syncAnalytics} disabled={syncing}>
          {syncing ? 'Syncing...' : 'Sync Analytics'}
        </button>
      </div>

      {posts.length === 0 ? (
        <div className="empty">
          <div className="icon">📤</div>
          No posts published yet.
        </div>
      ) : (
        posts.map(p => (
          <div key={p.id} className="card">
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8, fontSize: 12 }}>
              <span style={{ color: 'var(--muted)' }}>{fmtDate(p.posted_at)}</span>
              <span className={`tag ${p.status === 'posted' ? 'tag-score' : 'tag-src'}`}>{p.status}</span>
            </div>
            {p.article_title && (
              <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 8 }}>{p.article_title}</div>
            )}
            <div className="post-view" style={{ fontSize: 13 }}>{p.post_text}</div>
            <AnalyticsRow post={p} />
          </div>
        ))
      )}
    </>
  )
}
