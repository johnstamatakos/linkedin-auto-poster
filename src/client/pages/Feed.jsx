import { useState, useEffect, useRef, useMemo } from 'react'
import { api } from '../utils/api'

const DRAFT_STATUS_LABEL = {
  pending_review: { label: 'awaiting review', color: 'var(--accent)' },
  approved:       { label: 'approved',         color: 'var(--green)' },
  posted:         { label: 'posted',            color: 'var(--green)' },
  rejected:       { label: 'rejected',          color: 'var(--red)' },
}

const ARTICLE_STATUS_COLOR = {
  pending:   'var(--muted)',
  evaluated: 'var(--yellow)',
  drafted:   'var(--accent)',
  skipped:   'var(--muted)',
}

const BREAKDOWN_ROWS = [
  { key: 'relevance',     label: 'Relevance',      weight: '50%' },
  { key: 'timeliness',    label: 'Timeliness',     weight: '20%' },
  { key: 'specificity',   label: 'Specificity',    weight: '15%' },
  { key: 'postPotential', label: 'Post potential', weight: '15%' },
]

function ScoreCell({ score, breakdown }) {
  const [tooltipPos, setTooltipPos] = useState(null)
  const ref = useRef(null)

  if (score == null) return <span style={{ color: 'var(--muted)' }}>—</span>

  const color = score >= 7 ? 'var(--green)' : score >= 4 ? 'var(--yellow)' : 'var(--red)'

  function handleMouseEnter() {
    if (!ref.current) return
    const rect = ref.current.getBoundingClientRect()
    setTooltipPos({ top: rect.bottom + 6, left: rect.left + rect.width / 2 })
  }

  return (
    <div
      ref={ref}
      style={{ display: 'inline-block', cursor: 'default' }}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={() => setTooltipPos(null)}
    >
      <span style={{ color, fontWeight: 600 }}>{score}/10</span>

      {tooltipPos && breakdown && (
        <div style={{
          position: 'fixed', top: tooltipPos.top, left: tooltipPos.left,
          transform: 'translateX(-50%)',
          background: 'var(--surface)', border: '1px solid var(--border)',
          borderRadius: 8, padding: '10px 12px', zIndex: 1000,
          width: 220, boxShadow: '0 4px 16px rgba(0,0,0,0.4)',
          pointerEvents: 'none',
        }}>
          {BREAKDOWN_ROWS.map(({ key, label, weight }) => (
            breakdown[key] != null && (
              <div key={key} style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                gap: 16, marginBottom: 5, fontSize: 12,
              }}>
                <span style={{ color: 'var(--muted)' }}>{label} <span style={{ fontSize: 10, opacity: 0.6 }}>({weight})</span></span>
                <span style={{
                  fontWeight: 600,
                  color: breakdown[key] >= 7 ? 'var(--green)' : breakdown[key] >= 4 ? 'var(--yellow)' : 'var(--red)',
                }}>{breakdown[key]}/10</span>
              </div>
            )
          ))}
          {breakdown.skipReason && (
            <div style={{ marginTop: 6, paddingTop: 6, borderTop: '1px solid var(--border)', fontSize: 11, color: 'var(--red)', whiteSpace: 'normal', wordBreak: 'break-word' }}>
              {breakdown.skipReason}
            </div>
          )}
          {breakdown.similarityNote && (
            <div style={{ marginTop: 6, paddingTop: 6, borderTop: '1px solid var(--border)', fontSize: 11, color: 'var(--yellow)', whiteSpace: 'normal', wordBreak: 'break-word' }}>
              {breakdown.similarityNote}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function daysUntil(isoDate) {
  return Math.ceil((new Date(isoDate) - Date.now()) / (1000 * 60 * 60 * 24))
}

function ExpirationPill({ article }) {
  if (article.starred) return null

  if (article.queued_for_deletion) {
    return (
      <span style={{
        display: 'inline-block', marginTop: 4,
        fontSize: 10, fontWeight: 600, padding: '2px 6px',
        borderRadius: 99, background: 'rgba(248,113,113,0.15)',
        color: 'var(--red)', border: '1px solid rgba(248,113,113,0.3)',
      }}>
        queued for deletion
      </span>
    )
  }

  if (article.expires_at) {
    const days = daysUntil(article.expires_at)
    if (days <= 0) return null
    return (
      <span style={{
        display: 'inline-block', marginTop: 4,
        fontSize: 10, fontWeight: 600, padding: '2px 6px',
        borderRadius: 99, background: 'rgba(248,113,113,0.15)',
        color: 'var(--red)', border: '1px solid rgba(248,113,113,0.3)',
      }}>
        expires in {days}d
      </span>
    )
  }

  return null
}

function StarButton({ starred, onClick }) {
  return (
    <button
      onClick={onClick}
      title={starred ? 'Unstar (will expire normally)' : 'Star to keep forever'}
      style={{
        background: 'none', border: 'none', cursor: 'pointer',
        fontSize: 14, padding: '2px 4px', lineHeight: 1,
        color: starred ? '#f59e0b' : 'var(--muted)',
        opacity: starred ? 1 : 0.4,
        transition: 'opacity 0.15s, color 0.15s',
      }}
      onMouseOver={e => e.currentTarget.style.opacity = 1}
      onMouseOut={e => e.currentTarget.style.opacity = starred ? 1 : 0.4}
    >
      {starred ? '★' : '☆'}
    </button>
  )
}

const COLUMNS = [
  { key: 'title',      label: 'Title',       sort: (a, b) => a.title.localeCompare(b.title) },
  { key: 'source',     label: 'Source',      sort: (a, b) => (a.source || '').localeCompare(b.source || '') },
  { key: 'fetched_at', label: 'Added',       sort: (a, b) => a.fetched_at.localeCompare(b.fetched_at) },
  { key: 'eval_score', label: 'Score',       sort: (a, b) => (a.eval_score ?? -1) - (b.eval_score ?? -1) },
  { key: 'key_insight',label: 'Key Insight', sort: (a, b) => (a.key_insight || '').localeCompare(b.key_insight || '') },
]

const STATUS_OPTIONS = [
  { value: '',                label: 'All statuses' },
  { value: 'pending',         label: 'Pending' },
  { value: 'evaluated',       label: 'Evaluated' },
  { value: 'pending_review',  label: 'Awaiting review' },
  { value: 'approved',        label: 'Approved' },
  { value: 'posted',          label: 'Posted' },
  { value: 'rejected',        label: 'Rejected' },
  { value: 'skipped',         label: 'Skipped' },
]

const FILTER_DEFAULTS = { source: '', minScore: '', since: '', status: '' }

export default function Feed({ updateBadges }) {
  const [articles, setArticles] = useState(null)
  const [sortKey, setSortKey] = useState('fetched_at')
  const [sortDir, setSortDir] = useState('desc')
  const [filters, setFilters] = useState(FILTER_DEFAULTS)
  const [drafting, setDrafting] = useState(null)

  useEffect(() => {
    api('/api/articles').then(setArticles)
    updateBadges()
  }, [updateBadges])

  async function toggleStar(id) {
    const { starred } = await api(`/api/articles/${id}/star`, 'POST')
    setArticles(prev => prev.map(a => a.id === id ? { ...a, starred } : a))
  }

  function handleSort(key) {
    if (sortKey === key) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    } else {
      setSortKey(key)
      setSortDir(key === 'fetched_at' || key === 'eval_score' ? 'desc' : 'asc')
    }
  }

  async function draftArticle(id) {
    setDrafting(id)
    try {
      const result = await api(`/api/articles/${id}/draft`, 'POST')
      setArticles(prev => prev.map(a => a.id === id
        ? { ...a, status: 'drafted', draft_status: 'pending_review', eval_score: result.score, expires_at: null, queued_for_deletion: false }
        : a
      ))
      updateBadges()
    } catch (err) {
      alert(err.message)
    }
    setDrafting(null)
  }

  function setFilter(key, value) {
    setFilters(f => ({ ...f, [key]: value }))
  }

  const sources = useMemo(
    () => articles ? [...new Set(articles.map(a => a.source).filter(Boolean))].sort() : [],
    [articles]
  )

  if (!articles) {
    return (
      <div className="empty">
        <div className="icon">⏳</div>
        Loading...
      </div>
    )
  }

  if (articles.length === 0) {
    return (
      <div className="empty">
        <div className="icon">📰</div>
        No articles yet — run a crawl from the dashboard.
      </div>
    )
  }
  const isFiltered = Object.values(filters).some(v => v !== '')

  const filtered = articles.filter(a => {
    if (filters.source && a.source !== filters.source) return false
    if (filters.minScore !== '' && (a.eval_score == null || a.eval_score < Number(filters.minScore))) return false
    if (filters.since && a.fetched_at < filters.since) return false
    if (filters.status) {
      const matchesArticle = a.status === filters.status
      const matchesDraft   = a.draft_status === filters.status
      if (!matchesArticle && !matchesDraft) return false
    }
    return true
  })

  const col = COLUMNS.find(c => c.key === sortKey)
  const sorted = [...filtered].sort((a, b) => {
    const cmp = col.sort(a, b)
    return sortDir === 'asc' ? cmp : -cmp
  })

  const filterCtrl = {
    background: 'var(--bg)', border: 'none', borderRight: '1px solid var(--border)',
    color: 'var(--text)', fontSize: 12, padding: '0 12px', outline: 'none', cursor: 'pointer',
    height: '100%', appearance: 'none', WebkitAppearance: 'none',
  }

  return (
    <>
      <div className="page-header">
        <div>
          <div className="page-title">Feed</div>
          <div className="page-sub">
            {isFiltered
              ? `${sorted.length} of ${articles.length} articles`
              : `${articles.length} articles scraped`}
          </div>
        </div>
      </div>

      <div style={{
        display: 'flex', alignItems: 'stretch', gap: 0, marginBottom: 16,
        background: 'var(--surface)', border: '1px solid var(--border)',
        borderRadius: 8, overflow: 'hidden', height: 36,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', paddingLeft: 12, paddingRight: 8, borderRight: '1px solid var(--border)', flexShrink: 0 }}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--muted)' }}>
            <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/>
          </svg>
        </div>

        <select style={filterCtrl} value={filters.source} onChange={e => setFilter('source', e.target.value)}>
          <option value="">All sources</option>
          {sources.map(s => <option key={s} value={s}>{s}</option>)}
        </select>

        <select style={filterCtrl} value={filters.status} onChange={e => setFilter('status', e.target.value)}>
          {STATUS_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>

        <div style={{ display: 'flex', alignItems: 'center', borderRight: '1px solid var(--border)', padding: '0 12px', gap: 6, flexShrink: 0 }}>
          <span style={{ fontSize: 11, color: 'var(--muted)', whiteSpace: 'nowrap' }}>Score ≥</span>
          <input
            type="number" min="0" max="10" step="0.5"
            placeholder="—"
            value={filters.minScore}
            onChange={e => setFilter('minScore', e.target.value)}
            style={{ background: 'none', border: 'none', color: 'var(--text)', fontSize: 12, width: 36, outline: 'none', padding: 0 }}
          />
        </div>

        <div style={{ display: 'flex', alignItems: 'center', borderRight: isFiltered ? '1px solid var(--border)' : 'none', padding: '0 12px', gap: 6, flexShrink: 0 }}>
          <span style={{ fontSize: 11, color: 'var(--muted)', whiteSpace: 'nowrap' }}>Since</span>
          <input
            type="date"
            value={filters.since}
            onChange={e => setFilter('since', e.target.value)}
            style={{ background: 'none', border: 'none', color: filters.since ? 'var(--text)' : 'var(--muted)', fontSize: 12, outline: 'none', colorScheme: 'dark', padding: 0 }}
          />
        </div>

        {isFiltered && (
          <button
            onClick={() => setFilters(FILTER_DEFAULTS)}
            style={{
              background: 'none', border: 'none', padding: '0 12px',
              color: 'var(--muted)', fontSize: 12, cursor: 'pointer', whiteSpace: 'nowrap',
              display: 'flex', alignItems: 'center', gap: 5, marginLeft: 'auto',
            }}
          >
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            Clear
          </button>
        )}
      </div>

      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, minWidth: 620 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)' }}>
                <th style={{ width: 28, padding: '10px 0 10px 12px' }} />
                {COLUMNS.map((col, i) => {
                  const active = sortKey === col.key
                  return (
                    <th
                      key={col.key}
                      onClick={() => handleSort(col.key)}
                      style={{
                        textAlign: 'left',
                        padding: '10px 14px',
                        fontWeight: 500,
                        fontSize: 12,
                        color: active ? 'var(--fg)' : 'var(--muted)',
                        whiteSpace: 'nowrap',
                        paddingLeft: i === 0 ? 6 : 14,
                        cursor: 'pointer',
                        userSelect: 'none',
                      }}
                    >
                      {col.label}
                      <span style={{ marginLeft: 4, opacity: active ? 1 : 0, fontSize: 10 }}>
                        {sortDir === 'asc' ? '▲' : '▼'}
                      </span>
                    </th>
                  )
                })}
              </tr>
            </thead>
            <tbody>
              {sorted.map(a => {
                const draftMeta = a.draft_status ? DRAFT_STATUS_LABEL[a.draft_status] : null
                const statusLabel = draftMeta
                  ? draftMeta.label
                  : a.status
                const statusColor = draftMeta
                  ? draftMeta.color
                  : ARTICLE_STATUS_COLOR[a.status] || 'var(--muted)'

                return (
                  <tr key={a.id} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td style={{ padding: '10px 0 10px 12px', verticalAlign: 'middle' }}>
                      <StarButton starred={a.starred} onClick={() => toggleStar(a.id)} />
                    </td>
                    <td style={{ padding: '10px 6px 10px 6px', maxWidth: 280, wordBreak: 'break-word', overflowWrap: 'break-word' }}>
                      <a
                        href={a.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{ color: 'var(--fg)', textDecoration: 'none', lineHeight: 1.4, display: 'block' }}
                        onMouseOver={e => e.currentTarget.style.color = 'var(--accent)'}
                        onMouseOut={e => e.currentTarget.style.color = 'var(--fg)'}
                      >
                        {a.title}
                      </a>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginTop: 2 }}>
                        <span style={{ fontSize: 11, color: statusColor }}>{statusLabel}</span>
                        <ExpirationPill article={a} />
                        {a.status !== 'drafted' && (
                          <button
                            onClick={() => draftArticle(a.id)}
                            disabled={drafting === a.id}
                            style={{
                              fontSize: 10, fontWeight: 600, padding: '2px 7px',
                              borderRadius: 99, cursor: 'pointer',
                              border: '1px solid var(--accent)',
                              background: 'transparent', color: 'var(--accent)',
                              opacity: drafting === a.id ? 0.5 : 1,
                            }}
                          >
                            {drafting === a.id ? 'Drafting...' : 'Draft'}
                          </button>
                        )}
                      </div>
                    </td>
                    <td style={{ padding: '10px 14px', color: 'var(--muted)', whiteSpace: 'nowrap' }}>
                      {a.source}
                    </td>
                    <td style={{ padding: '10px 14px', color: 'var(--muted)', whiteSpace: 'nowrap' }}>
                      {new Date(a.fetched_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                      <span style={{ fontSize: 11, display: 'block' }}>
                        {new Date(a.fetched_at).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}
                      </span>
                    </td>
                    <td style={{ padding: '10px 14px', whiteSpace: 'nowrap' }}>
                      <ScoreCell score={a.eval_score} breakdown={a.eval_breakdown} />
                    </td>
                    <td style={{ padding: '10px 14px' }}>
                      <div style={{ color: 'var(--muted)', maxWidth: 320, wordBreak: 'break-word', overflowWrap: 'break-word' }}>
                        {a.key_insight || <span style={{ opacity: 0.4 }}>—</span>}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </>
  )
}
