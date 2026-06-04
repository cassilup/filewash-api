// PDF operations — pure pdf-lib, runs unchanged in Node (no canvas, no browser).
// These are lifted directly from the filewash frontend's pdf-lib usage, so the
// server and the in-browser tools share identical behaviour.
import { PDFDocument, degrees } from 'pdf-lib'

const OUT = (buffer) => ({ buffer, contentType: 'application/pdf', ext: 'pdf' })

// Merge any number of PDFs into one, preserving page order.
export async function mergePdf(buffers) {
  if (!Array.isArray(buffers) || buffers.length < 2) throw new Error('mergePdf needs at least 2 PDFs')
  const out = await PDFDocument.create()
  for (const buf of buffers) {
    const src = await PDFDocument.load(buf)
    const pages = await out.copyPages(src, src.getPageIndices())
    pages.forEach((p) => out.addPage(p))
  }
  return { ...OUT(Buffer.from(await out.save())), meta: { sources: buffers.length } }
}

// Extract a subset of pages. `pages` is a 1-based list, e.g. [1,2,5].
// Returns a single new PDF containing exactly those pages, in the given order.
export async function splitPdf(buffer, pages) {
  const src = await PDFDocument.load(buffer)
  const total = src.getPageCount()
  const idx = (pages && pages.length ? pages : Array.from({ length: total }, (_, i) => i + 1))
    .map((n) => n - 1)
  for (const i of idx) if (i < 0 || i >= total) throw new Error(`page ${i + 1} out of range (1..${total})`)
  const out = await PDFDocument.create()
  const copied = await out.copyPages(src, idx)
  copied.forEach((p) => out.addPage(p))
  return { ...OUT(Buffer.from(await out.save())), meta: { extracted: idx.length, of: total } }
}

// Rotate every page by a multiple of 90 degrees.
export async function rotatePdf(buffer, deg = 90) {
  if (deg % 90 !== 0) throw new Error('rotation must be a multiple of 90')
  const doc = await PDFDocument.load(buffer)
  doc.getPages().forEach((p) => {
    const cur = p.getRotation().angle
    p.setRotation(degrees((cur + deg) % 360))
  })
  return { ...OUT(Buffer.from(await doc.save())), meta: { rotatedBy: deg } }
}

// Scrub document metadata (author, title, producer, keywords, dates).
// The privacy headline: strips identifying info before a file reaches an LLM.
export async function stripPdfMetadata(buffer) {
  const doc = await PDFDocument.load(buffer)
  doc.setTitle('')
  doc.setAuthor('')
  doc.setSubject('')
  doc.setKeywords([])
  doc.setProducer('')
  doc.setCreator('')
  try { doc.setCreationDate(new Date(0)); doc.setModificationDate(new Date(0)) } catch {}
  return { ...OUT(Buffer.from(await doc.save())), meta: { stripped: true } }
}
