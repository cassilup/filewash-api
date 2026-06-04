// Spawns the MCP server over stdio (exactly as Claude Desktop / Cursor would)
// and drives it through the official MCP client: list tools, then call one.
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
import { PDFDocument } from 'pdf-lib'
import { writeFileSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const doc = await PDFDocument.create()
doc.setAuthor('Leaky Author'); doc.setTitle('Sensitive')
doc.addPage([200, 200])
const inPath = join(tmpdir(), 'mcp-in.pdf'), outPath = join(tmpdir(), 'mcp-out.pdf')
writeFileSync(inPath, Buffer.from(await doc.save()))

const client = new Client({ name: 'test', version: '0' })
await client.connect(new StdioClientTransport({ command: 'node', args: ['src/mcp/server.js'] }))

const { tools } = await client.listTools()
console.log(`MCP server exposes ${tools.length} tools:`, tools.map((t) => t.name).join(', '))

const res = await client.callTool({ name: 'pdf_strip_metadata', arguments: { input: inPath, outputPath: outPath } })
console.log('\ncallTool pdf_strip_metadata →', res.content[0].text)

const cleaned = await PDFDocument.load(readFileSync(outPath))
console.log(`\nverify: author="${cleaned.getAuthor()}" title="${cleaned.getTitle()}" → ${cleaned.getAuthor() === '' ? 'SCRUBBED ✓' : 'FAILED ✗'}`)

await client.close()
rmSync(inPath, { force: true }); rmSync(outPath, { force: true })
