// API-key auth + metered usage. Deliberately storage-agnostic: an in-memory
// counter for local/dev, with a single reportUsage() seam where Stripe metered
// billing (or a real datastore) plugs in for production.
import crypto from 'node:crypto'

export const PLANS = {
  free: { quota: 100, zeroRetention: false, label: 'Free' },
  pro: { quota: 10_000, zeroRetention: false, label: 'Pro' },
  business: { quota: Infinity, zeroRetention: true, label: 'Business (zero-retention)' },
}

// Keys come from env FILEWASH_API_KEYS as "key:plan,key:plan" (e.g. "sk_live_x:pro").
// A built-in "demo" free key exists so the API is usable out of the box.
const KEYS = new Map([['demo', { plan: 'free', label: 'demo' }]])
for (const pair of (process.env.FILEWASH_API_KEYS || '').split(',').map((s) => s.trim()).filter(Boolean)) {
  const [key, plan = 'free'] = pair.split(':')
  KEYS.set(key, { plan: PLANS[plan] ? plan : 'free', label: key.slice(0, 8) })
}

const month = () => new Date().toISOString().slice(0, 7)
const usage = new Map() // key -> { month, count }

export function authenticate(req) {
  const hdr = req.get('authorization') || ''
  const key = hdr.startsWith('Bearer ') ? hdr.slice(7) : req.get('x-api-key')
  if (!key || !KEYS.has(key)) return null
  return { key, ...KEYS.get(key), plan: KEYS.get(key).plan, planConfig: PLANS[KEYS.get(key).plan] }
}

export function getUsage(key) {
  const u = usage.get(key)
  if (!u || u.month !== month()) return 0
  return u.count
}

// Reserve one op against the monthly quota. Returns { ok, remaining } or { ok:false }.
export function consume(auth) {
  const used = getUsage(auth.key)
  const quota = auth.planConfig.quota
  if (used >= quota) return { ok: false, used, quota }
  usage.set(auth.key, { month: month(), count: used + 1 })
  reportUsage(auth, 1)
  return { ok: true, remaining: quota === Infinity ? null : quota - used - 1 }
}

// SEAM: production sends a metered-billing event here. Stubbed unless STRIPE_API_KEY
// + FILEWASH_STRIPE_METER are set, so the code path is real but inert in dev.
async function reportUsage(auth, qty) {
  if (!process.env.STRIPE_API_KEY || !process.env.FILEWASH_STRIPE_METER || auth.plan === 'free') return
  try {
    const Stripe = (await import('stripe')).default
    const stripe = new Stripe(process.env.STRIPE_API_KEY)
    await stripe.billing.meterEvents.create({
      event_name: process.env.FILEWASH_STRIPE_METER,
      payload: { value: String(qty), stripe_customer_id: auth.stripeCustomerId || auth.key },
      identifier: crypto.randomUUID(),
    })
  } catch (e) { console.error('[usage] stripe meter failed:', e.message) }
}
