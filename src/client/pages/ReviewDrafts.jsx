import { useState, useEffect } from 'react'
import RejectModal from '../components/RejectModal'
import { api } from '../utils/api'

function DraftCard({ draft, onApprove, onReject, onRegenerate }) {
  const [editing, setEditing] = useState(false)
  const [text, setText] = useState(draft.post_text)
  const [regenMode, setRegenMode] = useState(false)
  const [guidance, setGuidance] = useState('')
  const [regenerating, setRegenerating] = useState(false)
  const chars = text.length

  useEffect(() => { setText(draft.post_text) }, [draft.post_text])

  async function saveEdit() {
    await api(`/api/drafts/${draft.id}`, 'PUT', { post_text: text.trim() })
    setEditing(false)
  }

  function cancelEdit() {
    setText(draft.post_text)
    setEditing(false)
  }

  async function handleRegen() {
    setRegenerating(true)
    await onRegenerate(draft.id, guidance)
    setRegenMode(false)
    setGuidance('')
    setRegenerating(false)
  }

  return (
    <div className="draft">
      <div className="draft-meta">
        <span className="tag tag-src">{draft.article_source || 'Unknown'}</span>
        {draft.eval_score && <span className="tag tag-score">Score {draft.eval_score}/10</span>}
        {draft.primary_connection && <span className="tag tag-conn">{draft.primary_connection}</span>}
      </div>

      {draft.article_title && (
        <div className="article-ref">
          From:{' '}
          {draft.article_url
            ? <a href={draft.article_url} target="_blank" rel="noreferrer">{draft.article_title}</a>
            : draft.article_title}
        </div>
      )}

      {draft.key_insight && (
        <div className="insight">Key insight: {draft.key_insight}</div>
      )}

      {!editing && <div className="post-view">{text}</div>}

      {editing && (
        <>
          <textarea
            className="post-edit"
            value={text}
            onChange={e => setText(e.target.value)}
          />
          <div className={`char-count${chars > 2800 ? ' over' : ''}`}>{chars} / 2800</div>
        </>
      )}

      <div className="btn-row">
        <button className="btn btn-success" onClick={() => onApprove(draft.id)}>✓ Approve</button>
        <button className="btn btn-danger" onClick={() => onReject(draft.id)}>✗ Reject</button>
        {!editing && !regenMode && (
          <>
            <button className="btn btn-ghost" onClick={() => setEditing(true)}>Edit</button>
            <button className="btn btn-ghost" onClick={() => setRegenMode(true)}>Regenerate</button>
          </>
        )}
        {editing && (
          <>
            <button className="btn btn-primary" onClick={saveEdit}>Save</button>
            <button className="btn btn-ghost" onClick={cancelEdit}>Cancel</button>
          </>
        )}
      </div>

      {regenMode && (
        <div style={{ marginTop: 12 }}>
          <input
            className="cfg-input"
            value={guidance}
            onChange={e => setGuidance(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && !regenerating && handleRegen()}
            placeholder="Optional: guidance for the rewrite (e.g. 'focus on the business impact')"
            disabled={regenerating}
          />
          <div className="btn-row" style={{ marginTop: 8 }}>
            <button className="btn btn-primary" onClick={handleRegen} disabled={regenerating}>
              {regenerating ? 'Generating...' : 'Generate'}
            </button>
            <button
              className="btn btn-ghost"
              onClick={() => { setRegenMode(false); setGuidance('') }}
              disabled={regenerating}
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

export default function ReviewDrafts({ showToast, updateBadges }) {
  const [drafts, setDrafts] = useState([])
  const [rejectingId, setRejectingId] = useState(null)

  useEffect(() => {
    api('/api/drafts/pending').then(setDrafts)
  }, [])

  async function approve(id) {
    await api(`/api/drafts/${id}/approve`, 'POST')
    setDrafts(prev => prev.filter(d => d.id !== id))
    showToast('Approved and added to queue', 'success')
    updateBadges()
  }

  async function confirmReject(note) {
    await api(`/api/drafts/${rejectingId}/reject`, 'POST', { note })
    setDrafts(prev => prev.filter(d => d.id !== rejectingId))
    setRejectingId(null)
    showToast('Rejected', 'success')
    updateBadges()
  }

  async function regenerate(id, guidance) {
    try {
      const { post_text } = await api(`/api/drafts/${id}/regenerate`, 'POST', { guidance })
      setDrafts(prev => prev.map(d => d.id === id ? { ...d, post_text } : d))
      showToast('Draft regenerated', 'success')
    } catch (err) {
      showToast(`Regeneration failed: ${err.message}`, 'error')
    }
  }

  return (
    <>
      <div className="page-header">
        <div>
          <div className="page-title">Review Drafts</div>
          <div className="page-sub">Approve, edit, or reject AI-generated posts</div>
        </div>
      </div>

      {drafts.length === 0 ? (
        <div className="empty">
          <div className="icon">✅</div>
          No drafts pending. Click "Run Crawl Now" on the dashboard to generate new ones.
        </div>
      ) : (
        drafts.map(d => (
          <DraftCard
            key={d.id}
            draft={d}
            onApprove={approve}
            onReject={setRejectingId}
            onRegenerate={regenerate}
          />
        ))
      )}

      {rejectingId !== null && (
        <RejectModal
          onConfirm={confirmReject}
          onClose={() => setRejectingId(null)}
        />
      )}
    </>
  )
}
