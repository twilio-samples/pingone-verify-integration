# PingOne Custom MFA + Twilio Verify

[![MIT License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

> Source: [github.com/twilio-samples/ping-verify-integration](https://github.com/twilio-samples/ping-verify-integration)

A [Twilio Serverless Function](https://www.twilio.com/docs/serverless/functions-assets/functions) that acts as a custom phone-delivery endpoint for [PingOne MFA](https://docs.pingidentity.com/pingone/). When a user is challenged for a second factor, PingOne calls this function, which delivers the one-time passcode via [Twilio Verify](https://www.twilio.com/docs/verify) over **SMS or voice call**.

## How it works

PingOne's **Custom** notification provider is a _delivery_ hook, not a verification hook:

1. PingOne generates the OTP internally.
2. PingOne POSTs the code to this function (`to`, `otp`, `channel`).
3. The function delivers it via Twilio Verify with the [`customCode`](https://www.twilio.com/docs/verify/api/customization-options#custom-verification-codes) parameter — so Twilio sends Verify's pre-screened, localised message templates rather than a raw SMS.
4. The user types the code into PingOne's MFA UI; **PingOne verifies it**.
5. PingOne automatically reports the verification outcome back to Twilio Verify for deliverability analytics and routing intelligence.

## Prerequisites

- [Twilio account](https://twilio.com/try-twilio)
- [Twilio Verify Service](https://console.twilio.com/us1/develop/verify/services) with **Custom Verification Code** enabled:
  Console → Verify → Services → _your service_ → General → ✓ Enable Custom Verification Code
- [Twilio CLI](https://www.twilio.com/docs/twilio-cli/quickstart) with the [Serverless Toolkit plugin](https://www.twilio.com/docs/labs/serverless-toolkit/getting-started):
  ```
  twilio plugins:install @twilio-labs/plugin-serverless
  ```
- PingOne environment with MFA configured

## Setup

### 1. Clone and install

```bash
git clone git@github.com:twilio-samples/ping-verify-integration.git
cd ping-verify-integration
npm install
```

### 2. Configure environment variables

```bash
cp .env.example .env
```

Edit `.env`:

| Variable | Description |
|---|---|
| `ACCOUNT_SID` | Your Twilio Account SID (from [Console](https://console.twilio.com)) |
| `AUTH_TOKEN` | Your Twilio Auth Token |
| `TWILIO_VERIFY_SERVICE_SID` | Verify Service SID (starts with `VA`) — must have Custom Verification Code enabled |
| `PINGONE_SHARED_SECRET` | A long random string you choose; configured as the Bearer token in PingOne |

Generate a secret:
```bash
openssl rand -hex 32
```

### 3. Run locally

```bash
npm start
```

The function is available at `http://localhost:3000/send-otp`.

> **Note:** The Serverless Toolkit reads environment variables from `.env` — it does **not** pick up variables exported in your shell session. Make sure you have a `.env` file in place (copied from `.env.example`) before starting.

### 4. Deploy to Twilio

```bash
npm run deploy
```

Note the deployed URL: `https://<service>-<env>-<sid>.twil.io/send-otp`. You'll need this for PingOne.

## PingOne configuration

In PingOne, navigate to **Configuration → Notifications → Email & SMS** (or **MFA Policies → Notification Settings**) and set up a **Custom** phone delivery provider with two request entries — one for SMS and one for voice.

### Common settings (both entries)

| Setting | Value |
|---|---|
| Method | `POST` |
| URL | `https://<your-function>.twil.io/send-otp` |
| Content-Type | `application/json` |
| Authentication | Bearer |
| Bearer token | your `PINGONE_SHARED_SECRET` value |
| Phone number format | **Full** (E.164 with leading `+`) |

### SMS request body

```json
{
  "to": "${to}",
  "otp": "${otp}",
  "channel": "sms",
  "locale": "${locale}"
}
```

### Voice request body

```json
{
  "to": "${to}",
  "otp": "${otp}",
  "channel": "voice",
  "locale": "${locale}"
}
```

`${to}`, `${otp}`, and `${locale}` are PingOne variables substituted at send time. The `channel` field is a literal string you set in the template to tell the function which Twilio Verify channel to use.

## Function endpoints

### `POST /send-otp`

Delivers an OTP via Twilio Verify. Called by PingOne.

**Headers**

```
Authorization: Bearer <PINGONE_SHARED_SECRET>
Content-Type: application/json
```

**Request body**

| Field | Type | Required | Description |
|---|---|---|---|
| `to` | string | yes | Recipient phone number in E.164 format (e.g. `+14155552671`) |
| `otp` | string | yes | The one-time passcode to deliver (4–10 characters) |
| `channel` | string | no | `sms` (default) or `voice` |
| `locale` | string | no | BCP 47 locale tag (e.g. `en`, `fr`, `de`) |

**Responses**

| Status | Body | Meaning |
|---|---|---|
| `200` | `{"status":"sent","channel":"sms"}` | Delivered successfully |
| `400` | `{"error":"..."}` | Missing or invalid input |
| `401` | `{"error":"Unauthorized"}` | Missing or incorrect Bearer token |
| `502` | `{"error":"...","detail":"..."}` | Twilio Verify returned an error |

## Testing

### Auth check — expect 401

```bash
curl -i -X POST http://localhost:3000/send-otp \
  -H 'Content-Type: application/json' \
  -d '{"to":"+15551234567","otp":"123456","channel":"sms"}'
```

### SMS happy path — expect 200 + receive SMS

```bash
curl -i -X POST http://localhost:3000/send-otp \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer <PINGONE_SHARED_SECRET>' \
  -d '{"to":"+15551234567","otp":"123456","channel":"sms"}'
```

### Voice happy path — expect 200 + receive call

```bash
curl -i -X POST http://localhost:3000/send-otp \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer <PINGONE_SHARED_SECRET>' \
  -d '{"to":"+15551234567","otp":"123456","channel":"voice"}'
```

### Validation — expect 400

```bash
curl -i -X POST http://localhost:3000/send-otp \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer <PINGONE_SHARED_SECRET>' \
  -d '{"to":"+15551234567","otp":"123","channel":"sms"}'
```

## Related

- [Twilio Verify Custom Verification Codes](https://www.twilio.com/docs/verify/api/customization-options#custom-verification-codes)
- [PingOne custom phone delivery provider](https://docs.pingidentity.com/pingone/settings/p1_sender_configure_custom_provider.html)
- [Twilio Serverless Functions](https://www.twilio.com/docs/serverless/functions-assets/functions)
