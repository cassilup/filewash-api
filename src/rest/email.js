// Key-delivery email seam. Real but inert until creds are set, mirroring the
// Stripe metering seam. If RESEND_API_KEY + FILEWASH_FROM_EMAIL are set it sends
// via Resend; otherwise it logs (so the key is still recoverable from server logs
// in dev / before email is wired). Swap in SES/Postmark/SMTP the same way.
export async function sendKeyEmail({ to, key, plan }) {
  const subject = `Your filewash ${plan} API key`
  const text = [
    `Thanks for subscribing to filewash ${plan}.`,
    ``,
    `Your API key:`,
    `  ${key}`,
    ``,
    `Use it as a Bearer token:`,
    `  curl -H "Authorization: Bearer ${key}" https://api.filewash.app/v1/tools`,
    ``,
    `Keep it secret. Reply to this email if you need help.`,
  ].join('\n')

  if (!process.env.RESEND_API_KEY || !process.env.FILEWASH_FROM_EMAIL) {
    console.log(`[email] (inert — no RESEND_API_KEY) would send ${plan} key to ${to}: ${key}`)
    return { sent: false, reason: 'no-email-creds' }
  }
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: process.env.FILEWASH_FROM_EMAIL, to, subject, text }),
    })
    if (!res.ok) throw new Error(`Resend ${res.status}: ${await res.text()}`)
    return { sent: true }
  } catch (e) {
    console.error('[email] send failed:', e.message)
    return { sent: false, reason: e.message }
  }
}
