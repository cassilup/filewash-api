// Persistent API-key store. Holds account/key *metadata* (key → plan, customer,
// email) — NOT customer file contents, so the zero-retention guarantee for uploads
// is unaffected. Three sources, merged at lookup time:
//   1. a built-in `demo` free key, so the API works out of the box;
//   2. static keys from env FILEWASH_API_KEYS ("key:plan,key:plan");
//   3. keys issued at runtime by the Stripe webhook, persisted to FILEWASH_KEYS_FILE.
import crypto from 'node:crypto'
import { readFileSync, writeFileSync, existsSync, renameSync } from 'node:fs'

const FILE = process.env.FILEWASH_KEYS_FILE || './.filewash-keys.json'
const VALID_PLANS = new Set(['free', 'pro', 'business'])

// key -> { plan, label, email?, stripeCustomerId?, sessionId?, createdAt }
let issued = load()

function load() {
  try {
    if (existsSync(FILE)) return new Map(Object.entries(JSON.parse(readFileSync(FILE, 'utf8'))))
  } catch (e) { console.error('[keystore] load failed:', e.message) }
  return new Map()
}

function persist() {
  try {
    const tmp = `${FILE}.tmp`
    writeFileSync(tmp, JSON.stringify(Object.fromEntries(issued), null, 2))
    renameSync(tmp, FILE) // atomic
  } catch (e) { console.error('[keystore] persist failed:', e.message) }
}

// Static keys from env, computed once.
const envKeys = new Map([['demo', { plan: 'free', label: 'demo' }]])
for (const pair of (process.env.FILEWASH_API_KEYS || '').split(',').map((s) => s.trim()).filter(Boolean)) {
  const [key, plan = 'free'] = pair.split(':')
  envKeys.set(key, { plan: VALID_PLANS.has(plan) ? plan : 'free', label: key.slice(0, 8) })
}

export function lookup(key) {
  if (!key) return null
  return issued.get(key) || envKeys.get(key) || null
}

// Mint a new key for a paid plan. Idempotent per Stripe checkout session.
export function issue({ plan, email, stripeCustomerId, sessionId }) {
  if (!VALID_PLANS.has(plan)) plan = 'free'
  if (sessionId) {
    for (const [k, v] of issued) if (v.sessionId === sessionId) return { key: k, ...v, reused: true }
  }
  const key = `fw_${crypto.randomBytes(24).toString('hex')}`
  const rec = { plan, label: email || stripeCustomerId || key.slice(0, 10), email, stripeCustomerId, sessionId, createdAt: new Date().toISOString() }
  issued.set(key, rec)
  persist()
  return { key, ...rec }
}

// Subscription cancelled/downgraded — drop every key for that customer to free.
export function setPlanForCustomer(stripeCustomerId, plan) {
  if (!VALID_PLANS.has(plan)) plan = 'free'
  let changed = 0
  for (const [, rec] of issued) {
    if (rec.stripeCustomerId === stripeCustomerId && rec.plan !== plan) { rec.plan = plan; changed++ }
  }
  if (changed) persist()
  return changed
}

export const _store = { reload: () => { issued = load() } }
