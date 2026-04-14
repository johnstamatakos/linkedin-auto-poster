import { api } from '../utils/api'

const NAV_ITEMS = [
  { page: 'dashboard', label: '📊 Dashboard' },
  { page: 'review',    label: '📝 Review Drafts', badgeKey: 'pending' },
  { page: 'queue',     label: '📋 Post Queue',    badgeKey: 'queue', warn: true },
  { page: 'analytics', label: '📈 Analytics' },
  { page: 'calibrate', label: '🎯 Calibrate' },
  { page: 'config',    label: '⚙️ Settings' },
]

export default function Sidebar({ currentPage, onNavigate, pendingCount, queueCount }) {
  async function logout() {
    await api('/api/logout', 'POST')
    window.location.href = '/login'
  }

  const counts = { pending: pendingCount, queue: queueCount }

  return (
    <nav className="sidebar">
      <div className="logo"><img src="/logo.png" alt="Logo" /></div>
      {NAV_ITEMS.map(({ page, label, badgeKey, warn }) => (
        <div
          key={page}
          className={`nav${currentPage === page ? ' active' : ''}`}
          onClick={() => onNavigate(page)}
        >
          {label}
          {badgeKey !== undefined && (
            <span className={`badge${warn ? ' warn' : ''}`}>{counts[badgeKey]}</span>
          )}
        </div>
      ))}
      <div className="sidebar-footer">
        <button className="btn btn-ghost" style={{ width: '100%' }} onClick={logout}>
          Sign Out
        </button>
      </div>
    </nav>
  )
}
