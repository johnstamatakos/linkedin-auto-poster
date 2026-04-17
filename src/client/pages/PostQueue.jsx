import { useState, useEffect, useRef } from 'react'
import { api, fmtDate } from '../utils/api'

export default function PostQueue({ showToast }) {
  const [queue, setQueue] = useState([])
  const [config, setConfig] = useState(null)
  const dragSrc = useRef(null)

  useEffect(() => {
    Promise.all([api('/api/config'), api('/api/drafts/queue')]).then(([cfg, q]) => {
      setConfig(cfg)
      setQueue(q)
    })
  }, [])

  function onDragStart(e, i) {
    dragSrc.current = i
    e.currentTarget.classList.add('dragging')
  }

  function onDragOver(e) {
    e.preventDefault()
    e.currentTarget.classList.add('drag-over')
  }

  function onDragLeave(e) {
    e.currentTarget.classList.remove('drag-over')
  }

  function onDragEnd(e) {
    e.currentTarget.classList.remove('dragging')
    dragSrc.current = null
  }

  async function onDrop(e, targetIdx) {
    e.preventDefault()
    e.currentTarget.classList.remove('drag-over')
    const srcIdx = dragSrc.current
    if (srcIdx === null || srcIdx === targetIdx) return
    const next = [...queue]
    const [moved] = next.splice(srcIdx, 1)
    next.splice(targetIdx, 0, moved)
    setQueue(next)
    await api('/api/drafts/queue/reorder', 'POST', { orderedIds: next.map(d => d.id) })
    showToast('Order saved', 'success')
  }

  async function removeFromQueue(id) {
    if (!confirm('Remove this post from the queue?')) return
    await api(`/api/drafts/${id}/reject`, 'POST', { note: 'Removed from queue' })
    setQueue(prev => prev.filter(d => d.id !== id))
    showToast('Removed', 'success')
  }

  return (
    <>
      <div className="page-header">
        <div>
          <div className="page-title">Post Queue</div>
          <div className="page-sub">Drag to reorder. Posts publish on your configured schedule.</div>
        </div>
      </div>

      {queue.length === 0 ? (
        <div className="empty">
          <div className="icon">📭</div>
          Queue is empty. Approve drafts to build your backlog.
        </div>
      ) : (
        queue.map((d, i) => (
          <div
            key={d.id}
            className="q-item"
            draggable
            onDragStart={e => onDragStart(e, i)}
            onDragOver={onDragOver}
            onDragLeave={onDragLeave}
            onDragEnd={onDragEnd}
            onDrop={e => onDrop(e, i)}
          >
            <div className="q-pos">{i + 1}</div>
            <div className="q-body">
              <div className="q-title">{d.article_title || 'Untitled'}</div>
              <div className="q-meta">
                {d.primary_connection || ''} &bull; Approved {fmtDate(d.approved_at)}
              </div>
              <div className="q-preview">{d.post_text.slice(0, 120)}...</div>
            </div>
            <div className="btn-row">
              <button
                className="btn btn-ghost"
                style={{ fontSize: 12, padding: '6px 10px' }}
                onClick={() => alert(d.post_text)}
              >
                Preview
              </button>
              <button
                className="btn btn-danger"
                style={{ fontSize: 12, padding: '6px 10px' }}
                onClick={() => removeFromQueue(d.id)}
              >
                Remove
              </button>
            </div>
          </div>
        ))
      )}
    </>
  )
}
