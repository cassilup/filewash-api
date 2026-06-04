# filewash — privacy-first file tools for AI agents

The file-processing layer for agents and apps that **can't send files to a third party**.
Compress, convert, resize, merge/split PDFs, **strip metadata**, and **remove backgrounds** —
exposed as an **MCP server**, a **metered REST API**, and an npm SDK. Zero-retention by
default: files are processed in memory and never stored or logged.

> Built from [filewash.app](https://filewash.app)'s client-side WASM tools. Same logic,
> now callable by your agents.

## Why this exists

Every other file-tools API and MCP server is a wrapper around an upload-to-server service.
That's a non-starter for legal, healthcare, finance, and any GDPR-bound workflow — and it's a
liability when you're piping documents into an LLM. filewash is the one built around
**not keeping your files**, with two tools nobody else ships as an MCP: **background removal**
and **metadata scrubbing**.

## MCP server (Claude Desktop, Cursor, Claude Code)

```jsonc
// claude_desktop_config.json  →  mcpServers
{
  "filewash": { "command": "node", "args": ["/path/to/filewash-api/src/mcp/server.js"] }
}
```

Your agent now has 10 tools. Ask it: *"strip the location metadata from these photos before
I upload them"* or *"merge these contracts and rotate the scanned pages."*

## REST API

```bash
# discover
curl https://api.filewash.app/v1/tools

# strip EXIF/GPS from a photo (returns the cleaned image)
curl -X POST https://api.filewash.app/v1/tools/image_strip_metadata \
  -H "Authorization: Bearer $FILEWASH_KEY" \
  -F 'files=@photo.jpg' -o clean.jpg

# merge PDFs
curl -X POST https://api.filewash.app/v1/tools/pdf_merge \
  -H "Authorization: Bearer $FILEWASH_KEY" \
  -F 'files=@a.pdf' -F 'files=@b.pdf' -o merged.pdf
```

Every response carries `X-Filewash-Meta` (operation result) and `X-Filewash-Quota-Remaining`.

## Tools

| Tool | Category | What it does |
|------|----------|--------------|
| `pdf_merge` | pdf | Merge PDFs into one |
| `pdf_split` | pdf | Extract specific pages |
| `pdf_rotate` | pdf | Rotate pages by 90° |
| `pdf_strip_metadata` | **privacy** | Remove author/title/producer/dates |
| `image_compress` | image | Lossy re-encode at a target quality |
| `image_convert` | image | jpeg ↔ png ↔ webp ↔ avif |
| `image_resize` | image | Resize (never upscales) |
| `image_strip_metadata` | **privacy** | Strip EXIF/GPS/ICC/XMP |
| `image_remove_background` | image | Remove background → transparent PNG (local AI model, no upload) |
| `image_watermark` | image | Tile a text watermark |
| `qr_generate` | generate | QR code PNG from text/URL |

## Pricing (planned)

| Plan | Price | Quota | Retention |
|------|-------|-------|-----------|
| Free | $0 | 100 ops/mo | in-memory |
| Pro | ~$19/mo | 10,000 ops/mo | in-memory |
| Business | ~$99/mo | unlimited | **zero-retention guarantee + audit log + BAA** |

## Run locally

```bash
npm install
npm run test:engine   # 10 tools, end-to-end, no browser
npm run mcp           # stdio MCP server
npm run rest          # REST API on :8787  (try key "demo")
```

## Privacy

No file is written to disk by the REST API; the MCP server writes output only to the path you
pass. No file contents are logged. The Business tier adds a contractual zero-retention
guarantee and audit logging.
