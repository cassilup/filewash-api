// filewash SDK — thin client for the metered REST API. Published as the npm package
// so developers `npm i @filewash/sdk` and call tools in 3 lines.
//
//   import { FileWash } from '@filewash/sdk'
//   const fw = new FileWash({ apiKey: process.env.FILEWASH_KEY })
//   const clean = await fw.run('image_strip_metadata', [photoBuffer])   // -> { buffer, meta }

const DEFAULT_BASE = 'https://api.filewash.app'

export class FileWash {
  constructor({ apiKey, baseUrl = DEFAULT_BASE } = {}) {
    if (!apiKey) throw new Error('FileWash needs an apiKey')
    this.apiKey = apiKey
    this.baseUrl = baseUrl.replace(/\/$/, '')
  }

  async tools() {
    const res = await fetch(`${this.baseUrl}/v1/tools`)
    if (!res.ok) throw new Error(`tools ${res.status}`)
    return (await res.json()).tools
  }

  // files: array of Buffer/Blob/Uint8Array. params: tool-specific object.
  // Returns { buffer, contentType, meta } where meta is the parsed X-Filewash-Meta header.
  async run(tool, files = [], params = {}) {
    const form = new FormData()
    for (const f of files) form.append('files', f instanceof Blob ? f : new Blob([f]))
    form.append('params', JSON.stringify(params))
    const res = await fetch(`${this.baseUrl}/v1/tools/${tool}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${this.apiKey}` },
      body: form,
    })
    if (!res.ok) {
      let msg = `${tool} ${res.status}`
      try { msg = (await res.json()).error || msg } catch {}
      throw new Error(msg)
    }
    const buffer = Buffer.from(await res.arrayBuffer())
    let meta = {}
    try { meta = JSON.parse(res.headers.get('x-filewash-meta') || '{}') } catch {}
    return { buffer, contentType: res.headers.get('content-type'), meta, quotaRemaining: res.headers.get('x-filewash-quota-remaining') }
  }
}

export default FileWash
