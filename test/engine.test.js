// End-to-end engine test: builds real files in-memory and runs every tool.
// Proves the tools run server-side in Node with no browser.
import assert from 'node:assert'
import { PDFDocument } from 'pdf-lib'
import sharp from 'sharp'
import { getTool } from '../src/engine/tools.js'

const run = (name, files, params = {}) => getTool(name).run({ files, params })

async function makePdf(pages, label) {
  const doc = await PDFDocument.create()
  doc.setAuthor('Secret Author')
  doc.setTitle('Confidential')
  for (let i = 0; i < pages; i++) { const p = doc.addPage([300, 400]); p.drawText(`${label} p${i + 1}`, { x: 20, y: 360 }) }
  return Buffer.from(await doc.save())
}
// JPEG with embedded EXIF so the metadata-strip test has something to remove.
const makeJpg = () => sharp({ create: { width: 200, height: 150, channels: 3, background: { r: 200, g: 80, b: 40 } } })
  .withMetadata({ exif: { IFD0: { Copyright: 'ACME', Artist: 'Jane Doe' } } }).jpeg().toBuffer()

let pass = 0
const ok = (cond, msg) => { assert.ok(cond, msg); console.log(`  ✓ ${msg}`); pass++ }

console.log('PDF tools:')
const a = await makePdf(3, 'A'), b = await makePdf(2, 'B')
const merged = await run('pdf_merge', [a, b])
ok(merged.contentType === 'application/pdf' && (await PDFDocument.load(merged.buffer)).getPageCount() === 5, 'pdf_merge → 3+2 = 5 pages')
const split = await run('pdf_split', [merged.buffer], { pages: [1, 4] })
ok((await PDFDocument.load(split.buffer)).getPageCount() === 2, 'pdf_split → extracted 2 pages')
const rot = await run('pdf_rotate', [a], { degrees: 90 })
ok((await PDFDocument.load(rot.buffer)).getPage(0).getRotation().angle === 90, 'pdf_rotate → 90°')
const stripped = await run('pdf_strip_metadata', [a])
const sdoc = await PDFDocument.load(stripped.buffer)
ok(sdoc.getAuthor() === '' && sdoc.getTitle() === '', 'pdf_strip_metadata → author/title cleared')

console.log('Image tools:')
const jpg = await makeJpg()
const comp = await run('image_compress', [jpg], { quality: 40 })
ok(comp.meta.after <= comp.meta.before, `image_compress → ${comp.meta.before}→${comp.meta.after}b (${comp.meta.savedPct}%)`)
const conv = await run('image_convert', [jpg], { to: 'webp' })
ok(conv.contentType === 'image/webp' && (await sharp(conv.buffer).metadata()).format === 'webp', 'image_convert → webp')
const rez = await run('image_resize', [jpg], { width: 80 })
ok((await sharp(rez.buffer).metadata()).width === 80, 'image_resize → width 80')
const imeta = await run('image_strip_metadata', [jpg])
const after = await sharp(imeta.buffer).metadata()
ok(imeta.meta.hadMetadata === true && !after.exif, 'image_strip_metadata → EXIF removed')
const wm = await run('image_watermark', [jpg], { text: 'CONFIDENTIAL' })
ok(wm.buffer.length > 0 && (await sharp(wm.buffer).metadata()).width === 200, 'image_watermark → composited')

console.log('Generate:')
const qr = await run('qr_generate', [], { text: 'https://filewash.app' })
ok(qr.contentType === 'image/png' && (await sharp(qr.buffer).metadata()).width >= 64, 'qr_generate → PNG')

console.log(`\n${pass}/10 tools passed end-to-end in Node.`)
