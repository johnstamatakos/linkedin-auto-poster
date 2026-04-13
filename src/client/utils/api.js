export async function api(path, method = 'GET', body = null) {
  const opts = { method, headers: { 'Content-Type': 'application/json' } }
  if (body) opts.body = JSON.stringify(body)
  const r = await fetch(path, opts)
  if (r.status === 401) { window.location.href = '/login'; return }
  if (!r.ok) {
    const e = await r.json().catch(() => ({ error: r.statusText }))
    throw new Error(e.error || 'API error')
  }
  return r.json()
}

export function fmtDate(iso) {
  if (!iso) return 'Unknown'
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

export function fmtNum(n) {
  if (n == null) return '—'
  if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M'
  if (n >= 1000) return (n / 1000).toFixed(1) + 'k'
  return String(n)
}
