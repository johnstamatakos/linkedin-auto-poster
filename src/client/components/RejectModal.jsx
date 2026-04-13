import { useState } from 'react'

export default function RejectModal({ onConfirm, onClose }) {
  const [note, setNote] = useState('')

  return (
    <div className="modal-overlay">
      <div className="modal">
        <h3>Reject Draft</h3>
        <textarea
          value={note}
          onChange={e => setNote(e.target.value)}
          placeholder="Optional: reason for rejection..."
        />
        <div className="btn-row" style={{ justifyContent: 'flex-end' }}>
          <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn btn-danger" onClick={() => onConfirm(note)}>Reject</button>
        </div>
      </div>
    </div>
  )
}
