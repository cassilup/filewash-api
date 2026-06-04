// Single source of truth for every filewash tool.
// REST, MCP, and the SDK all read from this registry, so a tool is defined once
// and exposed everywhere. Each tool takes { files: Buffer[], params } and returns
// { buffer, contentType, ext, meta }.
import { z } from 'zod'
import { mergePdf, splitPdf, rotatePdf, stripPdfMetadata } from './pdf.js'
import { compressImage, convertImage, resizeImage, stripImageMetadata, watermarkImage } from './image.js'
import { removeImageBackground } from './bgremove.js'
import { generateQr } from './qr.js'

export const TOOLS = [
  {
    name: 'pdf_merge',
    category: 'pdf',
    description: 'Merge multiple PDF files into a single PDF, preserving page order.',
    files: { min: 2, max: 50 },
    params: z.object({}),
    run: ({ files }) => mergePdf(files),
  },
  {
    name: 'pdf_split',
    category: 'pdf',
    description: 'Extract specific pages from a PDF into a new PDF. `pages` is a 1-based list, e.g. [1,2,5].',
    files: { min: 1, max: 1 },
    params: z.object({ pages: z.array(z.number().int().positive()).optional() }),
    run: ({ files, params }) => splitPdf(files[0], params.pages),
  },
  {
    name: 'pdf_rotate',
    category: 'pdf',
    description: 'Rotate all pages of a PDF by a multiple of 90 degrees.',
    files: { min: 1, max: 1 },
    params: z.object({ degrees: z.number().int().multipleOf(90).default(90) }),
    run: ({ files, params }) => rotatePdf(files[0], params.degrees),
  },
  {
    name: 'pdf_strip_metadata',
    category: 'privacy',
    description: 'Remove identifying metadata (author, title, producer, dates) from a PDF. Privacy-first: scrub before a document reaches an LLM or a third party.',
    files: { min: 1, max: 1 },
    params: z.object({}),
    run: ({ files }) => stripPdfMetadata(files[0]),
  },
  {
    name: 'image_compress',
    category: 'image',
    description: 'Lossily compress a JPEG/PNG/WebP/AVIF image to a target quality (1-100).',
    files: { min: 1, max: 1 },
    params: z.object({ quality: z.number().int().min(1).max(100).default(72), format: z.string().optional() }),
    run: ({ files, params }) => compressImage(files[0], params),
  },
  {
    name: 'image_convert',
    category: 'image',
    description: 'Convert an image between jpeg, png, webp, and avif.',
    files: { min: 1, max: 1 },
    params: z.object({ to: z.enum(['jpeg', 'jpg', 'png', 'webp', 'avif']), quality: z.number().int().min(1).max(100).optional() }),
    run: ({ files, params }) => convertImage(files[0], params),
  },
  {
    name: 'image_resize',
    category: 'image',
    description: 'Resize an image to a target width and/or height (never upscales).',
    files: { min: 1, max: 1 },
    params: z.object({
      width: z.number().int().positive().optional(),
      height: z.number().int().positive().optional(),
      fit: z.enum(['cover', 'contain', 'fill', 'inside', 'outside']).default('inside'),
      format: z.string().optional(),
      quality: z.number().int().min(1).max(100).optional(),
    }),
    run: ({ files, params }) => resizeImage(files[0], params),
  },
  {
    name: 'image_strip_metadata',
    category: 'privacy',
    description: 'Strip ALL metadata (EXIF, GPS location, ICC, XMP) from an image by re-encoding it. Privacy-first: removes the camera/location trail before sharing or feeding to an LLM.',
    files: { min: 1, max: 1 },
    params: z.object({ format: z.string().optional() }),
    run: ({ files, params }) => stripImageMetadata(files[0], params),
  },
  {
    name: 'image_remove_background',
    category: 'image',
    description: 'Remove the background from an image, returning a transparent PNG. Runs an AI model locally — the image is never sent to a third-party service.',
    files: { min: 1, max: 1 },
    params: z.object({}),
    run: ({ files }) => removeImageBackground(files[0]),
  },
  {
    name: 'image_watermark',
    category: 'image',
    description: 'Tile a semi-transparent text watermark across an image.',
    files: { min: 1, max: 1 },
    params: z.object({ text: z.string().min(1), opacity: z.number().min(0).max(1).default(0.35), fontSize: z.number().int().positive().default(48) }),
    run: ({ files, params }) => watermarkImage(files[0], params),
  },
  {
    name: 'qr_generate',
    category: 'generate',
    description: 'Generate a QR code PNG from text or a URL.',
    files: { min: 0, max: 0 },
    params: z.object({ text: z.string().min(1), size: z.number().int().min(64).max(2048).default(512) }),
    run: ({ params }) => generateQr(params.text, params),
  },
]

export const TOOLS_BY_NAME = Object.fromEntries(TOOLS.map((t) => [t.name, t]))

export function getTool(name) {
  const t = TOOLS_BY_NAME[name]
  if (!t) throw new Error(`unknown tool: ${name}`)
  return t
}
