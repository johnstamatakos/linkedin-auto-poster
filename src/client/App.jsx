import { useState, useEffect, useCallback, lazy, Suspense } from 'react'
import Sidebar from './components/Sidebar'
import Toast from './components/Toast'
import Dashboard from './pages/Dashboard'
import ReviewDrafts from './pages/ReviewDrafts'
import PostQueue from './pages/PostQueue'
import Settings from './pages/Settings'
import Calibrate from './pages/Calibrate'
const Analytics = lazy(() => import('./pages/Analytics'))
import { api } from './utils/api'

export default function App() {
  const [currentPage, setCurrentPage] = useState('dashboard')
  const [pendingCount, setPendingCount] = useState(0)
  const [queueCount, setQueueCount] = useState(0)
  const [toast, setToast] = useState(null)
  const [sidebarOpen, setSidebarOpen] = useState(false)

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    if (params.get('linked')) setToast({ msg: 'LinkedIn connected!', type: 'success' })
    if (params.get('error')) setToast({ msg: 'Error: ' + params.get('error'), type: 'error' })
    if (params.get('linked') || params.get('error')) history.replaceState({}, '', '/')
  }, [])

  const showToast = useCallback((msg, type = 'success', persistent = false) => {
    setToast({ msg, type, persistent })
  }, [])

  const updateBadges = useCallback(async () => {
    try {
      const { stats } = await api('/api/dashboard')
      setPendingCount(stats.draftsPendingReview)
      setQueueCount(stats.draftsApproved)
    } catch {}
  }, [])

  function navigate(page) {
    setCurrentPage(page)
    setSidebarOpen(false)
  }

  return (
    <div className="layout">
      <button className="hamburger" onClick={() => setSidebarOpen(o => !o)} aria-label="Menu">☰</button>
      <div className={`sidebar-overlay${sidebarOpen ? ' open' : ''}`} onClick={() => setSidebarOpen(false)} />
      <Sidebar
        currentPage={currentPage}
        onNavigate={navigate}
        pendingCount={pendingCount}
        queueCount={queueCount}
        isOpen={sidebarOpen}
      />
      <main className="main">
        {currentPage === 'dashboard' && (
          <Dashboard onNavigate={navigate} showToast={showToast} updateBadges={updateBadges} />
        )}
        {currentPage === 'review' && (
          <ReviewDrafts showToast={showToast} updateBadges={updateBadges} />
        )}
        {currentPage === 'queue' && (
          <PostQueue showToast={showToast} />
        )}
        {currentPage === 'analytics' && (
          <Suspense fallback={<div className="empty"><div className="icon">⏳</div>Loading...</div>}>
            <Analytics showToast={showToast} />
          </Suspense>
        )}
        {currentPage === 'calibrate' && (
          <Calibrate showToast={showToast} />
        )}
        {currentPage === 'config' && (
          <Settings showToast={showToast} />
        )}
      </main>
      {toast && <Toast toast={toast} onDismiss={() => setToast(null)} />}
    </div>
  )
}
