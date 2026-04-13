import { useState, useEffect } from 'react'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  Legend, ResponsiveContainer,
} from 'recharts'
import { api, fmtNum } from '../utils/api'

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

function SourceTable({ sources }) {
  const sorted = [...sources].sort((a, b) =>
    (b.drafts / Math.max(b.articles, 1)) - (a.drafts / Math.max(a.articles, 1))
  )

  return (
    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
      <thead>
        <tr style={{ borderBottom: '1px solid var(--border)' }}>
          {['Source', 'Articles', 'Drafted', 'Approved', 'Rejected', 'Published', 'Pass Rate'].map(h => (
            <th key={h} style={{
              textAlign: h === 'Source' ? 'left' : 'right',
              padding: '6px 8px', fontWeight: 500,
              fontSize: 12, color: 'var(--muted)',
              paddingLeft: h === 'Source' ? 0 : 8,
            }}>{h}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {sorted.map(s => {
          const passRate = s.articles > 0 ? Math.round((s.drafts / s.articles) * 100) : 0
          const dead     = s.articles >= 5 && s.drafts === 0
          const rateColor = passRate >= 20 ? 'var(--green)'
            : passRate >= 10 ? 'var(--yellow)'
            : passRate > 0  ? 'var(--red)'
            : 'var(--muted)'

          return (
            <tr key={s.source} style={{ borderBottom: '1px solid var(--border)', opacity: dead ? 0.45 : 1 }}>
              <td style={{ padding: '9px 8px 9px 0' }}>
                {s.source}
                {dead && (
                  <span style={{ marginLeft: 8, fontSize: 11, color: 'var(--red)' }}>
                    consider removing
                  </span>
                )}
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
  )
}

export default function Analytics() {
  const [data, setData] = useState(null)

  useEffect(() => {
    api('/api/analytics').then(setData)
  }, [])

  if (!data) return <div className="empty"><div className="icon">⏳</div>Loading...</div>

  const { sources, trends } = data

  return (
    <>
      <div className="page-header">
        <div>
          <div className="page-title">Analytics</div>
          <div className="page-sub">Source performance and engagement trends</div>
        </div>
      </div>

      <div className="card">
        <div className="section-title">Source Performance</div>
        <div className="section-sub">
          Which sources actually produce posts worth publishing. Pass rate = drafted / crawled.
        </div>
        {sources.length === 0
          ? <div style={{ color: 'var(--muted)', fontSize: 13 }}>No data yet — run a crawl first.</div>
          : <SourceTable sources={sources} />
        }
      </div>

      <div className="card">
        <div className="section-title">Engagement Over Time</div>
        <div className="section-sub">
          {trends.length} post{trends.length !== 1 ? 's' : ''} with analytics data.
          Impressions on left axis, reactions &amp; comments on right.
        </div>
        {trends.length < 2 ? (
          <div style={{ color: 'var(--muted)', fontSize: 13, padding: '16px 0' }}>
            Need at least 2 posts with analytics data. Sync analytics from Post History.
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={260}>
            <LineChart data={trends} margin={{ top: 10, right: 20, bottom: 0, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis
                dataKey="date"
                tick={{ fill: 'var(--muted)', fontSize: 11 }}
                tickLine={false}
              />
              <YAxis
                yAxisId="impr"
                tick={{ fill: 'var(--muted)', fontSize: 11 }}
                tickFormatter={v => fmtNum(v)}
                tickLine={false}
                axisLine={false}
              />
              <YAxis
                yAxisId="engr"
                orientation="right"
                tick={{ fill: 'var(--muted)', fontSize: 11 }}
                tickLine={false}
                axisLine={false}
              />
              <Tooltip content={<CustomTooltip />} />
              <Legend wrapperStyle={{ fontSize: 12, paddingTop: 12 }} />
              <Line
                yAxisId="impr" type="monotone" dataKey="impressions" name="Impressions"
                stroke="#5865f2" strokeWidth={2} dot={{ r: 3, fill: '#5865f2' }} activeDot={{ r: 5 }}
              />
              <Line
                yAxisId="engr" type="monotone" dataKey="reactions" name="Reactions"
                stroke="#34d399" strokeWidth={2} dot={{ r: 3, fill: '#34d399' }} activeDot={{ r: 5 }}
              />
              <Line
                yAxisId="engr" type="monotone" dataKey="comments" name="Comments"
                stroke="#fbbf24" strokeWidth={2} dot={{ r: 3, fill: '#fbbf24' }} activeDot={{ r: 5 }}
              />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>
    </>
  )
}
