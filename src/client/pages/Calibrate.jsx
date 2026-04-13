import { useState, useEffect, useRef } from 'react'
import { api, apiStream } from '../utils/api'

const SKILL_META = [
  {
    name:        'writing-style',
    label:       'Writing Style',
    icon:        '✍️',
    description: 'Your voice, tone, format rules, banned phrases, and Points of View.',
  },
  {
    name:        'job-context',
    label:       'Job Context',
    icon:        '💼',
    description: 'Your role, career context, and grounding rules for connecting content to your work.',
  },
  {
    name:        'content-eval',
    label:       'Content Evaluation',
    icon:        '🎯',
    description: 'Scoring weights, high-relevance signals, and what to always filter out.',
  },
]

// ─── SkillCard ────────────────────────────────────────────────────────────────

function SkillCard({ name, label, icon, description, content, onSaved, showToast }) {
  const [mode, setMode] = useState('idle')         // idle | interview | review | edit
  const [editContent, setEditContent]   = useState(content)
  const [messages, setMessages]         = useState([])  // full API message history
  const [streamText, setStreamText]     = useState('')  // tokens arriving now
  const [streaming, setStreaming]       = useState(false)
  const [generatingRevision, setGeneratingRevision] = useState(false)
  const [proposedContent, setProposedContent]       = useState('')
  const [input, setInput] = useState('')
  const msgsEndRef = useRef(null)

  useEffect(() => { setEditContent(content) }, [content])
  useEffect(() => { msgsEndRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages, streamText])

  // Messages shown in the chat (hide internal control signals)
  const displayMessages = messages.filter(
    m => m.content !== 'START_INTERVIEW' && m.content !== 'PROPOSE_REVISION'
  )

  async function runStream(msgs, currentContent, opts = {}) {
    setStreaming(true)
    setStreamText('')
    let acc = ''
    await apiStream(
      '/api/calibrate/interview',
      { skillName: name, currentContent, messages: msgs },
      chunk => { acc += chunk; setStreamText(acc) },
      () => {
        setStreaming(false)
        setStreamText('')
        opts.onDone?.(acc)
      },
      err => {
        showToast(err, 'error')
        setStreaming(false)
        setGeneratingRevision(false)
      }
    )
  }

  function startInterview() {
    const initMsgs = [{ role: 'user', content: 'START_INTERVIEW' }]
    setMessages(initMsgs)
    setMode('interview')
    runStream(initMsgs, content, {
      onDone: acc => setMessages(prev => [...prev, { role: 'assistant', content: acc }]),
    })
  }

  function sendUserMessage() {
    if (!input.trim() || streaming) return
    const newMsgs = [...messages, { role: 'user', content: input.trim() }]
    setMessages(newMsgs)
    setInput('')
    runStream(newMsgs, content, {
      onDone: acc => setMessages(prev => [...prev, { role: 'assistant', content: acc }]),
    })
  }

  function proposeRevision() {
    const newMsgs = [...messages, { role: 'user', content: 'PROPOSE_REVISION' }]
    setMessages(newMsgs)
    setGeneratingRevision(true)
    runStream(newMsgs, content, {
      onDone: acc => {
        setProposedContent(acc)
        setGeneratingRevision(false)
        setMode('review')
      },
    })
  }

  async function saveContent(c) {
    try {
      await api(`/api/skills/${name}`, 'PUT', { content: c })
      onSaved(name, c)
      setMode('idle')
    } catch (err) {
      showToast(`Save failed: ${err.message}`, 'error')
    }
  }

  function reset() {
    setMode('idle')
    setMessages([])
    setStreamText('')
    setGeneratingRevision(false)
  }

  const isConfigured = content && content.length > 100

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="skill-card">

      {/* Header */}
      <div className="skill-card-header">
        <span className="skill-icon">{icon}</span>
        <div className="skill-info">
          <div className="skill-label">{label}</div>
          <div className="skill-desc">{description}</div>
        </div>
        <div className="skill-card-actions">
          {mode === 'idle' && (
            <>
              <button className="btn btn-primary btn-sm" onClick={startInterview}>
                Calibrate with AI
              </button>
              <button className="btn btn-ghost btn-sm" onClick={() => { setEditContent(content); setMode('edit') }}>
                Edit
              </button>
            </>
          )}
          {mode !== 'idle' && (
            <button className="btn btn-ghost btn-sm" onClick={reset}>✕ Close</button>
          )}
        </div>
      </div>

      {/* Idle — preview */}
      {mode === 'idle' && (
        <div className="skill-card-body">
          {isConfigured
            ? <div className="skill-preview">{content.split('\n').slice(0, 5).join('\n')}</div>
            : <div className="skill-not-configured">Not configured — click "Calibrate with AI" to get started.</div>
          }
        </div>
      )}

      {/* Interview */}
      {mode === 'interview' && (
        <div className="skill-card-body">
          <div className="interview-msgs">
            {displayMessages.length === 0 && streaming && (
              <div className="imsg imsg-assistant imsg-streaming">
                <span className="stream-cursor" />
              </div>
            )}
            {displayMessages.map((m, i) => (
              <div key={i} className={`imsg imsg-${m.role}`}>{m.content}</div>
            ))}
            {streaming && streamText && !generatingRevision && (
              <div className="imsg imsg-assistant imsg-streaming">
                {streamText}<span className="stream-cursor" />
              </div>
            )}
            {streaming && generatingRevision && (
              <div className="imsg imsg-assistant imsg-streaming">
                Generating revision… <span className="stream-cursor" />
              </div>
            )}
            <div ref={msgsEndRef} />
          </div>

          {!streaming && (
            <>
              <textarea
                className="interview-input"
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendUserMessage() } }}
                placeholder="Your response… (Enter to send, Shift+Enter for new line)"
                rows={3}
              />
              <div className="interview-actions">
                <button
                  className="btn btn-primary"
                  onClick={sendUserMessage}
                  disabled={!input.trim()}
                >
                  Send
                </button>
                <button
                  className="btn btn-ghost"
                  onClick={proposeRevision}
                  disabled={displayMessages.length === 0}
                  title="Ask Claude to generate a full updated file based on this conversation"
                >
                  Propose revision
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {/* Review proposed revision */}
      {mode === 'review' && (
        <div className="skill-card-body">
          <div className="section-sub" style={{ marginBottom: 10 }}>
            Review the proposed revision — edit before saving if needed.
          </div>
          <textarea
            className="post-edit"
            style={{ minHeight: 380 }}
            value={proposedContent}
            onChange={e => setProposedContent(e.target.value)}
          />
          <div className="btn-row" style={{ marginTop: 10 }}>
            <button className="btn btn-primary" onClick={() => saveContent(proposedContent)}>Save</button>
            <button className="btn btn-ghost" onClick={() => setMode('interview')}>Back to interview</button>
            <button className="btn btn-ghost" style={{ marginLeft: 'auto' }} onClick={reset}>Discard</button>
          </div>
        </div>
      )}

      {/* Direct edit */}
      {mode === 'edit' && (
        <div className="skill-card-body">
          <textarea
            className="post-edit"
            style={{ minHeight: 380 }}
            value={editContent}
            onChange={e => setEditContent(e.target.value)}
          />
          <div className="btn-row" style={{ marginTop: 10 }}>
            <button className="btn btn-primary" onClick={() => saveContent(editContent)}>Save</button>
            <button className="btn btn-ghost" onClick={reset}>Cancel</button>
          </div>
        </div>
      )}

    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function Calibrate({ showToast }) {
  const [skillContents, setSkillContents] = useState({})
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all(SKILL_META.map(s => api(`/api/skills/${s.name}`)))
      .then(results => {
        const map = {}
        results.forEach(r => { map[r.name] = r.content })
        setSkillContents(map)
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [])

  function handleSaved(name, content) {
    setSkillContents(prev => ({ ...prev, [name]: content }))
    showToast('Skill saved', 'success')
  }

  if (loading) return (
    <div className="empty"><div className="icon">⏳</div>Loading skills…</div>
  )

  return (
    <>
      <div className="page-header">
        <div>
          <div className="page-title">Calibrate</div>
          <div className="page-sub">
            Refine your voice, job context, and content filters — with AI assistance or direct editing.
          </div>
        </div>
      </div>
      <div className="calibrate-grid">
        {SKILL_META.map(s => (
          <SkillCard
            key={s.name}
            {...s}
            content={skillContents[s.name] || ''}
            onSaved={handleSaved}
            showToast={showToast}
          />
        ))}
      </div>
    </>
  )
}
