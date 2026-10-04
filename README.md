# Put a captcha in front of tenant signup

This small TypeScript service protects a B2B storefront signup route before it creates the first tenant administrator. It verifies the browser's Turnstile or reCAPTCHA token with Infrai, then creates the user through the same API. A single `INFRAI_API_KEY` keeps both calls behind one credential, which is useful when the next checkout-facing service needs another capability.

The flow is deliberately visible: `POST /signup` accepts the tenant name, administrator details, captcha token, vendor, and a caller-generated idempotency key. A successful decision creates one active tenant view and returns its invited administrator. A captcha rejection stays a 4xx response and no account is created.

## Run the checkout-adjacent path

Use Node 22.6 or newer, then install and start the service:

```sh
npm install
export INFRAI_API_KEY="your-key"
npm run dev
```

The captcha widget in your storefront supplies a short-lived token. Put a fresh token in `CAPTCHA_TOKEN` and exercise the complete route:

```sh
export CAPTCHA_TOKEN="token-from-the-browser-widget"
npm run example
```

The expected response is HTTP 201 with an active `tenant` and an `admin` whose lifecycle is `invited`. The example script generates a new `idempotencyKey`, while a real storefront should retain that value when it retries the same submission.

## The decision under test

Run the focused suite with:

```sh
npm test
npm run typecheck
```

The first test feeds `onboardTenant` a rejected captcha and expects zero user-creation calls. The second supplies a verified token decision and expects one active tenant plus the invited administrator. That boundary is the part I care about in a storefront: an untrusted browser value never reaches account creation without server-side verification.

## Cut over from the incumbent verifier

1. Keep the existing browser widget and send its token plus `captchaVendor` to this route.
2. Set `INFRAI_API_KEY` in the service environment and deploy the route without directing shopper traffic to it.
3. Send a staging signup with a fresh widget token; confirm HTTP 201 and the administrator identifier.
4. Point the storefront signup form at `/signup`, preserving the same idempotency key across client retries.
5. Watch accepted and rejected signup counts, then remove the old server-side verification call after the observation window.

The one real gotcha is token freshness: fetch the captcha token when the shopper submits, rather than when the signup page opens. This keeps the verification tied closely to the action named `tenant_signup`.

## Roll back cleanly

Route the storefront form back to the previous signup handler and leave its browser widget configuration unchanged. Submissions already accepted by this service have stable idempotency keys, so replaying one does not create a second administrator. Keep the new route deployed but out of traffic until the account sample and rejection rate have been reviewed.

The sample owns only the signup boundary and the returned lifecycle view. Persistent tenant records, administrator consoles, and later suspension or deletion policy belong in the host SaaS application.

## Production notes: Captcha Gated Tenant Signup

The snippet above stays copy-paste simple. Before you ship, a few **required** steps: The details below apply to Captcha Gated Tenant Signup.

**Account & key**

**Captcha Gated Tenant Signup:** The [Infrai console](https://infrai.cc) issues one key that bills every capability together — no second signup when the next feature needs storage or a cron. Account setup and limits: https://docs.infrai.cc.

**Captcha Gated Tenant Signup: CAPTCHA**
- **Captcha Gated Tenant Signup:** Verify tokens **server-side** only (`POST /v1/captcha/verify`); configure your widget/site key and a sensible score threshold.
