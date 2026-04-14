import { useState, useEffect } from 'react'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  Legend, ResponsiveContainer,
} from 'recharts'
import { api, fmtNum, fmtDate } from '../utils/api'

// ─── Engagement chart ─────────────────────────────────────────────────────────

function CustomTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null
  return (
    <div style={{
      background: 'var(--surface)', border: '1px solid var(--border)',
      borderRadius: 8, padding: '10px 14px', fontSize: 12,
    }}>
      <div style={{ color: 'var(--muted)', marginBottom: 6 }}>{label}</div>
      {payload.map(p => (
        <div key={p.dataKey} style={{ color: p.color, marginBottom: 2 }}>
          {p.name}: {p.value?.toLocaleString() ?? '—'}
        </div>
      ))}
    </div>
  )
}

// ─── Source performance table ─────────────────────────────────────────────────

function SourceTable({ sources }) {
  const sorted = [...sources].sort((a, b) =>
    (b.drafts / Math.max(b.articles, 1)) - (a.drafts / Math.max(a.articles, 1))
  )

  return (
    <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, minWidth: 480 }}>
      <thead>
        <tr style={{ borderBottom: '1px solid var(--border)' }}>
          {['Source', 'Articles', 'Drafted', 'Approved', 'Rejected', 'Published', 'Pass Rate'].map(h => (
            <th key={h} style={{
              textAlign: h === 'Source' ? 'left' : 'right',
              padding: '6px 8px', fontWeight: 500, fontSize: 12, color: 'var(--muted)',
              paddingLeft: h === 'Source' ? 0 : 8,
            }}>{h}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {sorted.map(s => {
          const passRate  = s.articles > 0 ? Math.round((s.drafts / s.articles) * 100) : 0
          const dead      = s.articles >= 5 && s.drafts === 0
          const rateColor = passRate >= 20 ? 'var(--green)'
            : passRate >= 10 ? 'var(--yellow)'
            : passRate >  0  ? 'var(--red)'
            : 'var(--muted)'

          return (
            <tr key={s.source} style={{ borderBottom: '1px solid var(--border)', opacity: dead ? 0.45 : 1 }}>
              <td style={{ padding: '9px 8px 9px 0' }}>
                {s.source}
                {dead && <span style={{ marginLeft: 8, fontSize: 11, color: 'var(--red)' }}>consider removing</span>}
              </td>
              <td style={{ textAlign: 'right', padding: '9px 8px', color: 'var(--muted)' }}>{s.articles}</td>
              <td style={{ textAlign: 'right', padding: '9px 8px' }}>{s.drafts}</td>
              <td style={{ textAlign: 'right', padding: '9px 8px', color: 'var(--green)' }}>{s.approved}</td>
              <td style={{ textAlign: 'right', padding: '9px 8px', color: 'var(--red)' }}>{s.rejected || '—'}</td>
              <td style={{ textAlign: 'right', padding: '9px 8px', color: 'var(--accent)' }}>{s.published || '—'}</td>
              <td style={{ textAlign: 'right', padding: '9px 0 9px 8px', color: rateColor, fontWeight: 600 }}>
                {passRate}%
              </td>
            </tr>
          )
        })}
      </tbody>
    </table>
    </div>
  )
}

// ─── Per-post analytics row ───────────────────────────────────────────────────

function PostAnalyticsRow({ post }) {
  const hoursOld = (Date.now() - new Date(post.posted_at).getTime()) / 3600000

  if (post.analytics_fetched_at) {
    const hasAny = post.impressions != null || post.reactions != null || post.comments != null
    if (!hasAny) {
      return (
        <div className="analytics-pending">
          Analytics unavailable (LinkedIn API may need re-authorization with r_member_social scope)
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

  return <div className="analytics-pending">Analytics pending — click "Sync Analytics" to fetch</div>
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function Analytics({ showToast }) {
  const [analytics, setAnalytics] = useState(null)
  const [posts, setPosts]         = useState(null)
  const [syncing, setSyncing]     = useState(false)

  useEffect(() => {
    Promise.all([api('/api/analytics'), api('/api/posts/recent')]).then(([a, p]) => {
      setAnalytics(a)
      setPosts(p)
    })
  }, [])

  async function syncAnalytics() {
    setSyncing(true)
    await api('/api/run/analytics', 'POST')
    showToast('Analytics sync started — refreshing in a moment', 'success')
    setTimeout(() => {
      Promise.all([api('/api/analytics'), api('/api/posts/recent')]).then(([a, p]) => {
        setAnalytics(a)
        setPosts(p)
        setSyncing(false)
      })
    }, 3000)
  }

  const loading = !analytics || !posts
  if (loading) return <div className="empty"><div className="icon">⏳</div>Loading...</div>

  const { sources, trends } = analytics

  return (
    <>
      <div className="page-header">
        <div>
          <div className="page-title">Analytics</div>
          <div className="page-sub">Engagement trends, source performance, and post history</div>
        </div>
        <button className="btn btn-ghost" onClick={syncAnalytics} disabled={syncing}>
          {syncing ? 'Syncing...' : 'Sync Analytics'}
        </button>
      </div>

      <div className="card">
        <div className="section-title">Engagement Over Time</div>
        <div className="section-sub">
          {trends.length} post{trends.length !== 1 ? 's' : ''} with analytics data.
          Impressions on left axis, reactions &amp; comments on right.
        </div>
        {trends.length < 2 ? (
          <div style={{ color: 'var(--muted)', fontSize: 13, padding: '16px 0' }}>
            Need at least 2 posts with analytics data. Hit "Sync Analytics" after your first few posts.
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={260}>
            <LineChart data={trends} margin={{ top: 10, right: 20, bottom: 0, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="date" tick={{ fill: 'var(--muted)', fontSize: 11 }} tickLine={false} />
              <YAxis yAxisId="impr" tick={{ fill: 'var(--muted)', fontSize: 11 }} tickFormatter={v => fmtNum(v)} tickLine={false} axisLine={false} />
              <YAxis yAxisId="engr" orientation="right" tick={{ fill: 'var(--muted)', fontSize: 11 }} tickLine={false} axisLine={false} />
              <Tooltip content={<CustomTooltip />} />
              <Legend wrapperStyle={{ fontSize: 12, paddingTop: 12 }} />
              <Line yAxisId="impr" type="monotone" dataKey="impressions" name="Impressions" stroke="#5865f2" strokeWidth={2} dot={{ r: 3, fill: '#5865f2' }} activeDot={{ r: 5 }} />
              <Line yAxisId="engr" type="monotone" dataKey="reactions"   name="Reactions"   stroke="#34d399" strokeWidth={2} dot={{ r: 3, fill: '#34d399' }} activeDot={{ r: 5 }} />
              <Line yAxisId="engr" type="monotone" dataKey="comments"    name="Comments"    stroke="#fbbf24" strokeWidth={2} dot={{ r: 3, fill: '#fbbf24' }} activeDot={{ r: 5 }} />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>

      <div className="card">
        <div className="section-title">Source Performance</div>
        <div className="section-sub">
          Which sources produce posts worth publishing. Pass rate = drafted / crawled.
        </div>
        {sources.length === 0
          ? <div style={{ color: 'var(--muted)', fontSize: 13 }}>No data yet — run a crawl first.</div>
          : <SourceTable sources={sources} />
        }
      </div>

      <div style={{ marginTop: 8 }}>
        <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 16 }}>
          Published Posts
          <span style={{ marginLeft: 8, fontSize: 12, fontWeight: 400, color: 'var(--muted)' }}>
            {posts.length} total
          </span>
        </div>
        {posts.length === 0 ? (
          <div className="empty"><div className="icon">📤</div>No posts published yet.</div>
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
              <PostAnalyticsRow post={p} />
            </div>
          ))
        )}
      </div>
    </>
  )
}
