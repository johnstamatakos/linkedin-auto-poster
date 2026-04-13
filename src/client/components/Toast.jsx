import { useEffect } from 'react'

export default function Toast({ toast, onDismiss }) {
  useEffect(() => {
    if (!toast) return
    const timer = setTimeout(onDismiss, 3500)
    return () => clearTimeout(timer)
  }, [toast, onDismiss])

  if (!toast) return null

  return (
    <div className={`toast show ${toast.type}`}>
      {toast.msg}
    </div>
  )
}
