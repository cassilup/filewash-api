// Stripe webhook → self-serve key issuance. Closes the loop: a customer pays via
// a Stripe Checkout / Payment Link, Stripe calls us, we mint an API key for the
// purchased plan and email it. Signature-verified; idempotent per checkout session.
//
// Needs (all env, none committed):
//   STRIPE_API_KEY          sk_test_… or sk_live_…
//   STRIPE_WEBHOOK_SECRET   whsec_…  (from `stripe listen` or the dashboard endpoint)
// Optional:
//   FILEWASH_PRICE_PLANS    "price_abc:pro,price_xyz:business" — overrides lookup_key mapping
//
// `stripe` is an optional dependency (kept out of the default MCP install); this
// route returns 503 until it's installed and the env is set.
import express from 'express'
import { issue, setPlanForCustomer } from './keystore.js'
import { sendKeyEmail } from './email.js'

// "filewash_pro" → "pro". Falls back to the explicit FILEWASH_PRICE_PLANS map.
function planFromPrice(price) {
  const override = Object.fromEntries(
    (process.env.FILEWASH_PRICE_PLANS || '').split(',').map((s) => s.trim()).filter(Boolean).map((p) => p.split(':')),
  )
  if (price?.id && override[price.id]) return override[price.id]
  const lk = price?.lookup_key || ''
  if (lk.startsWith('filewash_')) return lk.slice('filewash_'.length)
  return null
}

async function getStripe() {
  if (!process.env.STRIPE_API_KEY || !process.env.STRIPE_WEBHOOK_SECRET) return null
  try {
    const Stripe = (await import('stripe')).default
    return new Stripe(process.env.STRIPE_API_KEY)
  } catch {
    return null // stripe not installed
  }
}

export function webhookRouter() {
  const router = express.Router()
  // Raw body is required for signature verification — must run before any json parser.
  router.post('/webhook/stripe', express.raw({ type: 'application/json' }), async (req, res) => {
    const stripe = await getStripe()
    if (!stripe) return res.status(503).json({ error: 'billing not configured (STRIPE_API_KEY/STRIPE_WEBHOOK_SECRET + stripe pkg)' })

    let event
    try {
      event = stripe.webhooks.constructEvent(req.body, req.get('stripe-signature'), process.env.STRIPE_WEBHOOK_SECRET)
    } catch (e) {
      return res.status(400).json({ error: `signature verification failed: ${e.message}` })
    }

    try {
      if (event.type === 'checkout.session.completed') {
        const session = event.data.object
        const items = await stripe.checkout.sessions.listLineItems(session.id, { limit: 1, expand: ['data.price'] })
        const plan = planFromPrice(items.data[0]?.price)
        if (!plan) return res.json({ received: true, note: 'no filewash plan matched; ignored' })

        const email = session.customer_details?.email || session.customer_email
        const issued = issue({ plan, email, stripeCustomerId: session.customer, sessionId: session.id })
        if (email) await sendKeyEmail({ to: email, key: issued.key, plan })
        console.log(`[webhook] issued ${plan} key for ${email || session.customer} (reused=${!!issued.reused})`)
      } else if (event.type === 'customer.subscription.deleted') {
        const n = setPlanForCustomer(event.data.object.customer, 'free')
        console.log(`[webhook] subscription cancelled — downgraded ${n} key(s) to free`)
      }
      return res.json({ received: true })
    } catch (e) {
      console.error('[webhook] handler error:', e.message)
      return res.status(500).json({ error: e.message })
    }
  })
  return router
}
