# PingOne Custom MFA + Twilio Verify

[![MIT License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

A [Twilio Serverless](https://www.twilio.com/docs/serverless/functions-assets/functions) project that integrates [PingOne MFA](https://docs.pingidentity.com/pingone/) with [Twilio Verify](https://www.twilio.com/docs/verify). It includes:

- **A custom OTP delivery function** — PingOne calls this when it needs to send an MFA code; the function delivers it via Twilio Verify.
- **A demo login app** — A browser-based OIDC client (PKCE) that shows the full end-to-end flow: phone validation via Twilio Lookup, redirect to PingOne for authentication, MFA challenge, and callback with verified user claims.

## How it works

### OTP delivery

PingOne's Custom notification provider (powered here by Twilio Verify) is a _delivery_ hook, not a verification hook:

1. PingOne generates the OTP internally.
2. PingOne POSTs the code to `/send-otp` (`to`, `otp`, `channel`).
3. The function delivers it via Twilio Verify using the [`customCode`](https://www.twilio.com/docs/verify/api/customization-options#custom-verification-codes) parameter — so Twilio sends Verify's pre-screened, localised message templates rather than a raw SMS.
4. The user types the code into PingOne's MFA UI; **PingOne verifies it**.
5. PingOne automatically reports the verification outcome back to Twilio Verify for deliverability analytics and routing intelligence.

### Demo login flow (PKCE)

1. User opens `/index.html`, enters email and phone number.
2. Phone is validated server-side via Twilio Lookup (`/lookup`).
3. The browser generates a PKCE `code_verifier`/`code_challenge` pair and redirects to PingOne's `/authorize` endpoint.
4. PingOne authenticates the user. If MFA is required, it calls `/send-otp` to deliver the code via Twilio Verify.
5. PingOne redirects back to `/callback.html` with an authorization code.
6. The callback page exchanges the code for tokens via `/token-exchange`, verifies the `id_token` signature against PingOne's JWKS, and displays the user's verified claims.

No client secret is required — this follows the current best practice for browser-based OIDC clients.

## Prerequisites

- [Twilio account](https://twilio.com/try-twilio)
- [Twilio CLI](https://www.twilio.com/docs/twilio-cli/quickstart) with the [Serverless Toolkit plugin](https://www.twilio.com/docs/labs/serverless-toolkit/getting-started):
  ```
  twilio plugins:install @twilio-labs/plugin-serverless
  ```
- Node.js v22+ (use [nvm](https://github.com/nvm-sh/nvm) if needed)
- PingOne environment with MFA & SMS channel enabled

## Setup

### 1. Set up Twilio Verify

1. In the [Twilio Console](https://console.twilio.com), go to **Verify → Services** and create a new service (or use an existing one).
2. Open the service, go to the **General** tab, and enable **Custom Verification Code**. This allows PingOne to supply the OTP and have Twilio deliver it using Verify's pre-screened message templates.
3. Note the **Service SID** (starts with `VA`) — you'll add it to `.env` shortly.

### 2. Create a PingOne Single-Page App

This application is the OIDC client the demo uses to authenticate users through PingOne.

1. In PingOne, go to **Applications → Applications → +**
2. Choose **Single Page App** as the application type
3. On the **Redirect URIs** step (under the app's **Configuration → OIDC settings** — click **Edit** to expand it), add `http://localhost:3000/callback.html` for now. You'll add the deployed URL after the deploy step below, once you know your `*.twil.io` domain.
4. Enable the **openid**, **profile**, **email**, and **phone** scopes
5. Under **Policies**, attach your MFA policy
6. Note the **Client ID** and your **Environment ID** (found in Settings → Environment) — you'll add both to `.env` next.

### 3. Clone the repo

```bash
git clone git@github.com:twilio-samples/pingone-verify-integration.git
cd pingone-verify-integration
```

### 4. Configure environment variables

Now that you have your Verify Service SID and PingOne app details, create a `.env` file by copying the example:

```bash
cp .env.example .env
```

Update the `.env` file with the following values:

| Variable | Description |
|---|---|
| `ACCOUNT_SID` | Your Twilio Account SID (from [console.twilio.com](https://console.twilio.com)) |
| `AUTH_TOKEN` | Your Twilio Auth Token |
| `TWILIO_VERIFY_SERVICE_SID` | The Verify Service SID from step 1 |
| `PINGONE_SHARED_SECRET` | A long random string you generate (e.g. with `openssl rand -hex 32`); this is the Bearer token PingOne sends to your delivery endpoint |
| `PINGONE_ENV_ID` | Your PingOne environment ID |
| `PINGONE_CLIENT_ID` | The Client ID of the PingOne Single-Page App |

> **Note:** The Serverless Toolkit reads environment variables from `.env` — it does **not** pick up variables exported in your shell session.

### 5. Install dependencies

```bash
npm install
```

### 6. Run locally

```bash
npm start
```

The app runs at [http://localhost:3000](http://localhost:3000). All four functions and both pages are served from the same local server:

| Path | Description |
|---|---|
| `/index.html` | Demo login page |
| `/callback.html` | OIDC callback page |
| `/send-otp` | OTP delivery endpoint (called by PingOne) |
| `/lookup` | Phone number validation |
| `/config` | Serves OIDC config to the browser |
| `/token-exchange` | Exchanges authorization code for user claims |

### 7. Deploy to Twilio

PingOne calls your `/send-otp` endpoint from its own cloud servers — so it must be publicly reachable. `http://localhost:3000` will not work for the notification provider, which is why we deploy before configuring it in PingOne.

> If you want to exercise the full flow without deploying, run `twilio serverless:start --ngrok` to expose a temporary public tunnel. Requires [`ngrok`](https://ngrok.com/download) locally.

Deploy all functions and assets:

```bash
npm run deploy
```

Note the domain in the output (e.g. `pingone-twilio-verify-1234-dev.twil.io`). You'll use it in the next step. Also set your production environment variables in the [Twilio Console](https://console.twilio.com) under your Functions service.

### 8. Finish the PingOne configuration

Now that you have a public domain, go back to PingOne and wire up the two URL-dependent pieces.

**1. Add the deployed redirect URI.** In your PingOne Single-Page App (**Configuration → OIDC settings → Edit**), add `https://<your-deployed-domain>/callback.html` to the Redirect URIs alongside the `localhost` entry.

**2. Configure the custom notification provider.** This tells PingOne to call your `/send-otp` function whenever it needs to deliver an MFA code.

In PingOne, go to **Settings → Senders** and create a new **Custom** SMS/voice provider. You'll create two request entries — one for SMS and one for voice — both pointing at the same endpoint.

> If you don't see the option to create the SMS sender, you'll need to reach out to PingOne to unlock advanced authentication methods for your environment.

Common settings for both entries:

| Setting | Value |
|---|---|
| Method | `POST` |
| URL | `https://<your-deployed-domain>/send-otp` |
| Content-Type | `application/json` |
| Authentication | Bearer |
| Bearer token | the value of `PINGONE_SHARED_SECRET` |
| Phone number format | **Full** (E.164 with leading `+`) |

SMS request body:

```json
{
  "to": "${to}",
  "otp": "${otp}",
  "channel": "sms",
  "locale": "${locale}"
}
```

Voice request body:

```json
{
  "to": "${to}",
  "otp": "${otp}",
  "channel": "call",
  "locale": "${locale}"
}
```

`${to}`, `${otp}`, and `${locale}` are PingOne variables substituted at send time. The `channel` field is a literal you set in each template to tell the function which Twilio Verify channel to use.

## End-to-end walkthrough

Run the demo against your deployed domain (`https://<your-deployed-domain>/index.html`). The steps below use `localhost` for brevity — substitute your deployed URL when testing the full server-to-server OTP flow.

### 1. Launch the app

1. Visit [http://localhost:3000/index.html](http://localhost:3000/index.html)
2. Enter your email address and phone number in E.164 format (e.g. `+15550001234`)
3. Click **Continue to PingOne**

### 2. Phone number validation

The app calls Twilio Lookup to validate the number before proceeding. If the number is invalid or not in E.164 format, an inline error is shown and the redirect does not happen. The terminal shows the app's activity and debug output.

### 3. Redirect to PingOne login

If the number is valid, the browser generates a PKCE `code_verifier`/`code_challenge` pair and redirects to PingOne's login screen. Make sure the user you're logging in with is already created in PingOne and enrolled in MFA.

### 4. First-time login experience

If this is the user's first login:

1. PingOne will prompt the user to set or reset their password
2. PingOne will then prompt the user to enroll in an MFA method (SMS or Voice)
3. Click **Enroll in MFA**, then **Add Method**
4. Choose **Text Message** or **Voice**
5. You'll receive a code delivered via Twilio Verify — enter it to complete enrollment

### 5. Log in with MFA

Once enrolled:

1. Go back to [http://localhost:3000/index.html](http://localhost:3000/index.html)
2. Log in with the same email and phone number
3. PingOne presents the MFA prompt — click **Text Message** (or **Voice**)
4. You'll receive a new OTP via Twilio Verify
5. Enter the code — PingOne verifies it and redirects back to the app

### 6. Callback and verified claims

After successful authentication, PingOne redirects to `/callback.html`. The page exchanges the authorization code for tokens, verifies the `id_token` signature against PingOne's JWKS, and displays your verified user claims:

- Name
- Email
- Phone number
- MFA verified ✓

### 7. View OTP delivery status in Twilio

To confirm the Verify request was received:

1. Log in to the [Twilio Console](https://console.twilio.com)
2. Navigate to **Monitor → Logs → Verify**
3. Click on a verification attempt — the status should show as **approved** once the user enters the correct OTP

## API reference

### `POST /send-otp`

Called by PingOne to deliver an OTP. Requires a Bearer token matching `PINGONE_SHARED_SECRET`.

| Field | Type | Required | Description |
|---|---|---|---|
| `to` | string | yes | Recipient phone in E.164 format |
| `otp` | string | yes | One-time passcode (4–10 characters) |
| `channel` | string | no | `sms` (default) or `call` |
| `locale` | string | no | BCP 47 locale tag (e.g. `en`, `fr`) |

### `GET /config`

Returns public OIDC configuration for the browser. No auth required.

### `POST /lookup`

Validates a phone number via Twilio Lookup v2. Returns `{ valid, formatted, lineType }` where `lineType` is the [line type](https://www.twilio.com/docs/lookup/v2-api/line-type-intelligence) (e.g. `mobile`, `landline`, `voip`).

### `POST /token-exchange`

Exchanges a PingOne authorization code for user claims. Verifies the `id_token` signature against PingOne's JWKS endpoint. Called by `callback.html`.

| Field | Type | Required | Description |
|---|---|---|---|
| `code` | string | yes | Authorization code from PingOne redirect |
| `code_verifier` | string | yes | PKCE verifier from the original `/authorize` request |
| `redirect_uri` | string | yes | Must match the URI registered in PingOne |

## Testing the functions directly

### `send-otp` — auth check (expect 401)

```bash
curl -i -X POST http://localhost:3000/send-otp \
  -H 'Content-Type: application/json' \
  -d '{"to":"+15551234567","otp":"123456","channel":"sms"}'
```

### `send-otp` — SMS delivery (expect 200)

```bash
curl -i -X POST http://localhost:3000/send-otp \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer <PINGONE_SHARED_SECRET>' \
  -d '{"to":"+15551234567","otp":"123456","channel":"sms"}'
```

### `lookup` — phone validation

```bash
curl -i -X POST http://localhost:3000/lookup \
  -H 'Content-Type: application/json' \
  -d '{"phone":"+15551234567"}'
```

## Related

- [Twilio Verify Custom Verification Codes](https://www.twilio.com/docs/verify/api/customization-options#custom-verification-codes)
- [Twilio Lookup v2](https://www.twilio.com/docs/lookup/v2-api)
- [PingOne custom phone delivery provider](https://docs.pingidentity.com/pingone/settings/p1_sender_configure_custom_provider.html)
- [Twilio Serverless Functions](https://www.twilio.com/docs/serverless/functions-assets/functions)
