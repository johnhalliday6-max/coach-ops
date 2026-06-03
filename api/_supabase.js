const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
const SUPABASE_KEY =
  process.env.SUPABASE_ANON_KEY ||
  process.env.SUPABASE_PUBLISHABLE_KEY ||
  process.env.VITE_SUPABASE_ANON_KEY ||
  process.env.VITE_SUPABASE_PUBLISHABLE_KEY

export function hasSupabase() {
  return Boolean(SUPABASE_URL && SUPABASE_KEY)
}

export async function supabaseFetch(path, options = {}) {
  if (!hasSupabase()) {
    throw new Error('Supabase env vars missing')
  }

  const url = `${SUPABASE_URL.replace(/\/$/, '')}/rest/v1/${path}`
  const response = await fetch(url, {
    ...options,
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
      ...(options.headers || {}),
    },
  })

  const text = await response.text()
  const data = text ? JSON.parse(text) : null

  if (!response.ok) {
    throw new Error(data?.message || data?.error || `Supabase request failed ${response.status}`)
  }

  return data
}
