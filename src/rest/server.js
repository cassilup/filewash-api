#!/usr/bin/env node
// filewash metered REST API. Zero-retention: files are processed in memory and
// streamed back; nothing is written to disk and file contents are never logged.
import express from 'express'
import multer from 'multer'
import { TOOLS, getTool } from '../engine/tools.js'
import { authenticate, consume, getUsage, PLANS } from './usage.js'
import { webhookRouter } from './webhook.js'

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024, files: 50 } })
const app = express()
// Stripe webhook needs the raw body for signature checks — mount it BEFORE express.json().
app.use(webhookRouter())
app.use(express.json())

app.get('/health', (_req, res) => res.json({ ok: true, tools: TOOLS.length }))

// Discovery — what an agent or developer hits first.
app.get('/v1/tools', (_req, res) => {
  res.json({
    tools: TOOLS.map((t) => ({
      name: t.name, category: t.category, description: t.description,
      files: t.files, params: Object.keys(t.params.shape),
    })),
  })
})

// Auth + quota gate for every tool call.
function gate(req, res, next) {
  const auth = authenticate(req)
  if (!auth) return res.status(401).json({ error: 'missing or invalid API key (Authorization: Bearer <key>)' })
  const c = consume(auth)
  if (!c.ok) return res.status(429).json({ error: 'monthly quota exceeded', plan: auth.plan, used: c.used, quota: c.quota })
  req.auth = auth
  res.set('X-Filewash-Plan', auth.plan)
  if (c.remaining != null) res.set('X-Filewash-Quota-Remaining', String(c.remaining))
  next()
}

// One endpoint per tool, derived from the registry. Files via multipart `files`,
// params via form fields (JSON-encoded) or a `params` JSON field.
app.post('/v1/tools/:name', gate, upload.array('files'), async (req, res) => {
  let tool
  try { tool = getTool(req.params.name) } catch { return res.status(404).json({ error: `unknown tool: ${req.params.name}` }) }
  try {
    const files = (req.files || []).map((f) => f.buffer)
    if (files.length < tool.files.min) return res.status(400).json({ error: `${tool.name} needs at least ${tool.files.min} file(s)` })
    let raw = req.body || {}
    if (typeof raw.params === 'string') raw = { ...raw, ...JSON.parse(raw.params) }
    const params = tool.params.parse(coerce(raw))
    const result = await tool.run({ files, params })
    res.set('Content-Type', result.contentType)
    res.set('Content-Disposition', `attachment; filename="filewash-${tool.name}.${result.ext}"`)
    res.set('X-Filewash-Meta', JSON.stringify(result.meta || {}))
    res.send(result.buffer)
  } catch (e) {
    res.status(400).json({ error: e.message })
  }
})

// Multipart form fields arrive as strings; coerce numbers/arrays/bools for zod.
function coerce(obj) {
  const out = {}
  for (const [k, v] of Object.entries(obj)) {
    if (k === 'params') continue
    if (typeof v !== 'string') { out[k] = v; continue }
    if (/^-?\d+(\.\d+)?$/.test(v)) out[k] = Number(v)
    else if (v === 'true' || v === 'false') out[k] = v === 'true'
    else if (v.startsWith('[') || v.startsWith('{')) { try { out[k] = JSON.parse(v) } catch { out[k] = v } }
    else out[k] = v
  }
  return out
}

const PORT = process.env.PORT || 8787
if (process.argv[1]?.endsWith('server.js')) {
  app.listen(PORT, () => console.log(`filewash REST API on :${PORT} — ${TOOLS.length} tools, plans: ${Object.keys(PLANS).join('/')}`))
}
export { app }
