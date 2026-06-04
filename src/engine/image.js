// Image operations — server-grade via sharp (libvips). Faster and leaner than
// porting the browser's canvas pipeline; covers compress/convert/resize/strip/watermark.
import sharp from 'sharp'

const CT = { jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', avif: 'image/avif' }
const EXT = { jpeg: 'jpg', png: 'png', webp: 'webp', avif: 'avif' }
const norm = (f) => (f === 'jpg' ? 'jpeg' : f)

async function encode(pipeline, format, { quality } = {}) {
  const fmt = norm(format)
  if (!CT[fmt]) throw new Error(`unsupported format: ${format}`)
  const out = await pipeline.toFormat(fmt, quality != null ? { quality } : undefined).toBuffer()
  return { buffer: out, contentType: CT[fmt], ext: EXT[fmt], meta: { bytes: out.length, format: fmt } }
}

// Lossy re-encode at a target quality, keeping the original format unless told otherwise.
export async function compressImage(buffer, { quality = 72, format } = {}) {
  const meta = await sharp(buffer).metadata()
  const target = format || meta.format
  const before = buffer.length
  const res = await encode(sharp(buffer), target, { quality })
  res.meta = { ...res.meta, before, after: res.buffer.length, savedPct: Math.round((1 - res.buffer.length / before) * 100) }
  return res
}

// Convert between jpeg/png/webp/avif.
export async function convertImage(buffer, { to, quality }) {
  if (!to) throw new Error('convertImage needs a target format `to`')
  return encode(sharp(buffer), to, { quality })
}

// Resize. `fit`: cover|contain|fill|inside|outside (sharp semantics). Never upscales by default.
export async function resizeImage(buffer, { width, height, fit = 'inside', format, quality } = {}) {
  if (!width && !height) throw new Error('resizeImage needs width and/or height')
  const meta = await sharp(buffer).metadata()
  const pipeline = sharp(buffer).resize({ width, height, fit, withoutEnlargement: true })
  return encode(pipeline, format || meta.format, { quality })
}

// Strip ALL metadata (EXIF, GPS, ICC, XMP) by re-encoding without carrying it over.
// sharp drops metadata unless .withMetadata() is called — so a plain re-encode scrubs it.
export async function stripImageMetadata(buffer, { format } = {}) {
  const meta = await sharp(buffer).metadata()
  const had = !!(meta.exif || meta.xmp || meta.iptc)
  const res = await encode(sharp(buffer).rotate(), format || meta.format) // .rotate() bakes EXIF orientation, then loses it
  res.meta = { ...res.meta, hadMetadata: had, stripped: true }
  return res
}

// Tile a semi-transparent text watermark across the image.
export async function watermarkImage(buffer, { text, opacity = 0.35, fontSize = 48 } = {}) {
  if (!text) throw new Error('watermarkImage needs `text`')
  const { width = 800, height = 600, format = 'png' } = await sharp(buffer).metadata()
  const esc = String(text).replace(/[<&>]/g, (c) => ({ '<': '&lt;', '&': '&amp;', '>': '&gt;' }[c]))
  const svg = `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
    <defs><pattern id="w" width="${fontSize * 8}" height="${fontSize * 4}" patternUnits="userSpaceOnUse" patternTransform="rotate(-30)">
      <text x="0" y="${fontSize}" font-family="sans-serif" font-size="${fontSize}" fill="#000000" fill-opacity="${opacity}">${esc}</text>
    </pattern></defs><rect width="100%" height="100%" fill="url(#w)"/></svg>`
  const pipeline = sharp(buffer).composite([{ input: Buffer.from(svg), top: 0, left: 0 }])
  return encode(pipeline, format)
}
