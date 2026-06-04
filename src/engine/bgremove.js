// Background removal — the headline differentiated tool. Runs the IMG.LY ONNX
// model server-side via @imgly/background-removal-node (no external API, no upload
// to a third party). Lazy-imported so the rest of the engine has no hard dependency
// on the heavy model package. Output is always transparent PNG.
import sharp from 'sharp'

let _removeBackground

export async function removeImageBackground(buffer, { format = 'png' } = {}) {
  if (!_removeBackground) {
    const mod = await import('@imgly/background-removal-node')
    _removeBackground = mod.removeBackground
  }
  // The node API needs a typed source to detect the format — wrap in a Blob with the
  // real MIME type (sniffed via sharp) rather than a bare buffer.
  const meta = await sharp(buffer).metadata()
  const mime = `image/${meta.format === 'jpeg' ? 'jpeg' : meta.format}`
  const blob = await _removeBackground(new Blob([buffer], { type: mime }))
  const out = Buffer.from(await blob.arrayBuffer())
  return { buffer: out, contentType: 'image/png', ext: 'png', meta: { format, bytes: out.length } }
}
