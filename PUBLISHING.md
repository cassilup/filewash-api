# Publishing filewash-api

Exact, copy-paste sequence. Steps marked **(you)** need your npm / GitHub / Stripe auth and
can't be automated.

## 1. Publish to npm (E1 gate)

The package is `@filewash/api` (scoped). The `@filewash` scope needs a free npm **org**.

```bash
# (you) one-time auth + org
npm login                                   # browser auth as your npm user
# create a free org named "filewash" at https://www.npmjs.com/org/create
#   → required so the @filewash scope is publishable

# from filewash-api/ :
npm publish --access public                 # scoped public packages need --access public
npm view @filewash/api version              # verify it's live
```

**Fallback (no org):** publish unscoped instead — the name `filewash` is also free.
Then change `name` in `package.json` to `"filewash"`, update `identifier` in `server.json`
and the install lines in `README.md`, and `npm publish` (no `--access` needed).

## 2. List on the MCP registry (E1)

`server.json` is ready (`mcpName: io.github.cassilup/filewash`, npm transport). After the npm
publish above:

```bash
# (you) install the official publisher + authenticate via GitHub (proves the io.github.cassilup namespace)
npm i -g @modelcontextprotocol/publisher    # or: brew install mcp-publisher
mcp-publisher login github                   # opens GitHub OAuth
mcp-publisher publish                        # reads ./server.json
```

This lists filewash in the official registry; PulseMCP / Glama / Smithery / mcp.so ingest from
there within a day or two (E1 success signal = downstream ingestion + install pings).

## 3. Turn on billing end-to-end (E3)

Products/prices/meter already exist in Stripe **test** mode (see `development-process-md/029`).
To make the self-serve loop live:

```bash
# (you) local test of the webhook with Stripe's CLI:
stripe login
stripe listen --forward-to localhost:8787/webhook/stripe
#   → prints a whsec_… signing secret

# run the API with billing env (NOT committed):
STRIPE_API_KEY=sk_test_…           \
STRIPE_WEBHOOK_SECRET=whsec_…      \
FILEWASH_STRIPE_METER=filewash_ops \
RESEND_API_KEY=…  FILEWASH_FROM_EMAIL="keys@filewash.app" \
npm run rest

# pay through the test Payment Link → webhook mints a key, emails it, and (for paid plans)
# every op reports to the filewash_ops meter. Keys persist in FILEWASH_KEYS_FILE.
```

For production: create a webhook endpoint in the Stripe dashboard pointing at the deployed
`/webhook/stripe`, copy its `whsec_…` into `STRIPE_WEBHOOK_SECRET`, and recreate the 3
products + meter in **live** mode (swap `sk_live_…`).

## The self-serve loop (what's wired)

`Payment Link → checkout.session.completed → webhook.js` →
`keystore.issue(plan)` (persisted) → `email.js` delivers the key →
caller uses `Authorization: Bearer fw_…` → `usage.js` enforces the plan quota and
`reportUsage()` meters paid ops to Stripe. Cancelling a subscription
(`customer.subscription.deleted`) downgrades that customer's keys to free.
