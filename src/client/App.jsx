import { useState, useEffect, useCallback, lazy, Suspense } from 'react'
import Sidebar from './components/Sidebar'
import Toast from './components/Toast'
import Dashboard from './pages/Dashboard'
import ReviewDrafts from './pages/ReviewDrafts'
import PostQueue from './pages/PostQueue'
import PostHistory from './pages/PostHistory'
import Settings from './pages/Settings'
const Analytics = lazy(() => import('./pages/Analytics'))
import { api } from './utils/api'

export default function App() {
  const [currentPage, setCurrentPage] = useState('dashboard')
  const [pendingCount, setPendingCount] = useState(0)
  const [queueCount, setQueueCount] = useState(0)
  const [toast, setToast] = useState(null)

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    if (params.get('linked')) setToast({ msg: 'LinkedIn connected!', type: 'success' })
    if (params.get('error')) setToast({ msg: 'Error: ' + params.get('error'), type: 'error' })
    if (params.get('linked') || params.get('error')) history.replaceState({}, '', '/')
  }, [])

  const showToast = useCallback((msg, type = 'success') => {
    setToast({ msg, type })
  }, [])

  const updateBadges = useCallback(async () => {
    try {
      const { stats } = await api('/api/dashboard')
      setPendingCount(stats.draftsPendingReview)
      setQueueCount(stats.draftsApproved)
    } catch {}
  }, [])

  return (
    <div className="layout">
      <Sidebar
        currentPage={currentPage}
        onNavigate={setCurrentPage}
        pendingCount={pendingCount}
        queueCount={queueCount}
      />
      <main className="main">
        {currentPage === 'dashboard' && (
          <Dashboard onNavigate={setCurrentPage} showToast={showToast} updateBadges={updateBadges} />
        )}
        {currentPage === 'review' && (
          <ReviewDrafts showToast={showToast} updateBadges={updateBadges} />
        )}
        {currentPage === 'queue' && (
          <PostQueue showToast={showToast} />
        )}
        {currentPage === 'history' && (
          <PostHistory showToast={showToast} />
        )}
        {currentPage === 'analytics' && (
          <Suspense fallback={<div className="empty"><div className="icon">⏳</div>Loading...</div>}>
            <Analytics />
          </Suspense>
        )}
        {currentPage === 'config' && (
          <Settings showToast={showToast} />
        )}
      </main>
      {toast && <Toast toast={toast} onDismiss={() => setToast(null)} />}
    </div>
  )
}
