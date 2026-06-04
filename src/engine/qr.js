// QR generation — pure JS (qrcode), identical to the frontend tool.
import QRCode from 'qrcode'

export async function generateQr(text, { size = 512, margin = 2 } = {}) {
  if (!text) throw new Error('generateQr needs `text`')
  const buffer = await QRCode.toBuffer(String(text), { type: 'png', width: size, margin })
  return { buffer, contentType: 'image/png', ext: 'png', meta: { size } }
}
