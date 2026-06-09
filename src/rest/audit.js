// Append-only audit log for full behavioural visibility — WITHOUT breaking the
// zero-retention promise. It records *metadata about* each request (who, what tool,
// when, how big, how long, success/error) and NEVER file contents or file names.
// This is also the "audit log" the Business tier sells.
//
// Sink (first that applies):
//   FILEWASH_AUDIT_STDOUT=1   → one JSON line per event to stdout (for Logpush/Datadog/etc)
//   FILEWASH_AUDIT_FILE=path  → append JSONL to a file (default ./audit.log)
// API keys are stored hashed (sha256 prefix), never raw.
import crypto from 'node:crypto'
import { appendFileSync } from 'node:fs'

const FILE = process.env.FILEWASH_AUDIT_FILE || './audit.log'
const TO_STDOUT = process.env.FILEWASH_AUDIT_STDOUT === '1'

const keyId = (key) => (key ? 'k_' + crypto.createHash('sha256').update(key).digest('hex').slice(0, 12) : null)

// event: 'tool_call' | 'auth_fail' | 'quota_exceeded'
export function audit(entry) {
  const rec = {
    ts: new Date().toISOString(),
    id: crypto.randomUUID(),
    ...entry,
    key: entry.key ? keyId(entry.key) : undefined, // hash, never the raw key
  }
  delete rec.rawKey
  const line = JSON.stringify(rec)
  try {
    if (TO_STDOUT) console.log('[audit] ' + line)
    else appendFileSync(FILE, line + '\n')
  } catch (e) {
    console.error('[audit] write failed:', e.message)
  }
}

// Express middleware: stamps req._t0 and emits one tool_call record per response,
// capturing only sizes/latency/status — no bodies.
export function auditMiddleware(req, res, next) {
  req._t0 = process.hrtime.bigint()
  res.on('finish', () => {
    // only audit tool calls here; auth/quota failures (401/429) are recorded explicitly in the gate
    if (!req.path.startsWith('/v1/tools/') || req.method !== 'POST') return
    if (res.statusCode === 401 || res.statusCode === 429) return
    const ms = Number(process.hrtime.bigint() - req._t0) / 1e6
    const bytesIn = (req.files || []).reduce((s, f) => s + (f.size || 0), 0)
    audit({
      event: 'tool_call',
      tool: req.params?.name || req.path.split('/').pop(),
      key: req.auth?.key,
      plan: req.auth?.plan,
      filesIn: (req.files || []).length,
      bytesIn,
      bytesOut: Number(res.get('Content-Length')) || res._fwBytesOut || 0,
      status: res.statusCode,
      ms: Math.round(ms),
      ip: req.ip,
      ua: req.get('user-agent') || undefined,
      region: req.get('cf-ipcountry') || undefined,
    })
  })
  next()
}
