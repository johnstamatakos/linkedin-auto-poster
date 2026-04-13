import { useState } from 'react'

export default function RejectModal({ onConfirm, onClose }) {
  const [note, setNote]       = useState('')
  const [addAsPov, setAddAsPov] = useState(false)

  return (
    <div className="modal-overlay">
      <div className="modal">
        <h3>Reject Draft</h3>
        <textarea
          value={note}
          onChange={e => setNote(e.target.value)}
          placeholder="Optional: reason for rejection…"
        />
        <div className="pov-checkbox-row">
          <label>
            <input
              type="checkbox"
              checked={addAsPov}
              onChange={e => setAddAsPov(e.target.checked)}
              disabled={!note.trim()}
            />
            <span>Add this note as a Point of View in writing-style.md</span>
          </label>
        </div>
        <div className="btn-row" style={{ justifyContent: 'flex-end' }}>
          <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn btn-danger" onClick={() => onConfirm(note, addAsPov)}>Reject</button>
        </div>
      </div>
    </div>
  )
}
