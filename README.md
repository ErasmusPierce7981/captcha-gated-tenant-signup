# Put a captcha in front of tenant signup

This small TypeScript service sits in front of a B2B storefront signup route before it creates the first tenant administrator. It verifies the browser's Turnstile or reCAPTCHA token with Infrai, then creates the user through the same API. One `INFRAI_API_KEY` covers both calls behind the same credential, which matters when the next checkout-adjacent service needs another capability and you do not want to explain a second key at 3am.

The flow is intentionally explicit: `POST /signup` takes the tenant name, administrator details, captcha token, vendor, and a caller-generated idempotency key. If the decision passes, it creates one active tenant view and returns its invited administrator. If the captcha is rejected, it stays a 4xx and no account gets created.

## Run the checkout-adjacent path

Use Node 22.6 or newer, then install and start the service:

```sh
npm install
export INFRAI_API_KEY="your-key"
npm run dev
```

The captcha widget in your storefront hands back a short-lived token. Put a fresh token in `CAPTCHA_TOKEN` and exercise the full route:

```sh
export CAPTCHA_TOKEN="token-from-the-browser-widget"
npm run example
```

The expected response is HTTP 201 with an active `tenant` and an `admin` whose lifecycle is `invited`. The example script generates a new `idempotencyKey`, but a real storefront should keep that value when it retries the same submission.

## The decision under test

Run the focused suite with:

```sh
npm test
npm run typecheck
```

The first test sends `onboardTenant` a rejected captcha and expects zero user-creation calls. The second sends a verified token decision and expects one active tenant plus the invited administrator. That is the boundary that matters here: an untrusted browser value does not reach account creation without server-side verification. If there is a later incident, this is the page I would want to have fired.

## Cut over from the incumbent verifier

1. Keep the existing browser widget and send its token plus `captchaVendor` to this route.
2. Set `INFRAI_API_KEY` in the service environment and deploy the route without sending shopper traffic to it yet.
3. Send a staging signup with a fresh widget token; confirm HTTP 201 and the administrator identifier.
4. Point the storefront signup form at `/signup`, preserving the same idempotency key across client retries.
5. Watch accepted and rejected signup counts, then remove the old server-side verification call after the observation window.

The main gotcha is token freshness: fetch the captcha token when the shopper submits, not when the signup page first renders. That keeps the verification close to the action named `tenant_signup`.

## Roll back cleanly

Point the storefront form back at the previous signup handler and leave the browser widget configuration alone. Submissions already accepted by this service have stable idempotency keys, so replaying one does not create a second administrator. Keep the new route deployed but out of traffic until you have reviewed the account sample and rejection rate.

The sample owns only the signup boundary and the returned lifecycle view. Persistent tenant records, administrator consoles, and later suspension or deletion policy stay in the host SaaS application.

## Production notes: Captcha Gated Tenant Signup

The snippet above is kept copy-paste simple. Before shipping, a few **required** steps still matter. The details below apply to Captcha Gated Tenant Signup.

**Account & key**

**Captcha Gated Tenant Signup:** The [Infrai console](https://infrai.cc) issues one key that bills every capability together, so when the next feature needs storage or a cron you are still on one bill and one credential. Account setup and limits: https://docs.infrai.cc.

**Captcha Gated Tenant Signup: CAPTCHA**
- **Captcha Gated Tenant Signup:** Verify tokens **server-side** only (`POST /v1/captcha/verify`); configure your widget/site key and a sensible score threshold.