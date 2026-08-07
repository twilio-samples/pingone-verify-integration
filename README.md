# PingOne Custom Server with Twilio Verify

Companion app for [Deliver Secure and Reliable OTPs with Twilio Verify and PingOne](https://www.twilio.com/en-us/blog/developers/tutorials/integrations/pingone-custom-server-mfa-verify). It validates the submitted phone number with Twilio Lookup, then redirects to PingOne for login and MFA. PingOne delivers the OTP through its Twilio Verify Custom Server provider.

## Prerequisites

- Node.js 24 LTS or later
- A PingOne environment and Single-Page Application configured as described in the blog post
- A Twilio Verify Service with Custom Verification Code enabled
- Twilio Lookup Line Type Intelligence, used by this app to accept mobile numbers only

In PingOne, configure the application with the redirect URI `http://localhost:3000/auth/callback` and the `openid`, `profile`, `email`, and `phone` scopes. Under **Settings > Sender**, configure **Twilio Verify** as the Custom Server SMS/Voice sender using your Twilio Account SID, Auth Token, and Verify Service SID.

## Run locally

```bash
cp .env.example .env
npm install
npm start
```

Set these values in `.env`:

```dotenv
TWILIO_ACCOUNT_SID=AC...
TWILIO_AUTH_TOKEN=...
PINGONE_ENV_ID=...
PINGONE_APP_ID=...
PINGONE_REDIRECT_URI=http://localhost:3000/auth/callback
```

Open [http://localhost:3000](http://localhost:3000), enter an existing PingOne user's email address and mobile number in E.164 format, such as `+15551234567`, then complete the PingOne flow. If the user has not enrolled an MFA device, PingOne directs them to enroll first; sign in again afterward to test OTP delivery.

Confirm completed verifications in the Twilio Console under **Monitor > Logs > Verify**.

## More information

Follow the [full tutorial](https://www.twilio.com/en-us/blog/developers/tutorials/integrations/pingone-custom-server-mfa-verify) for the PingOne MFA policy, notification template, and user-enrollment setup.
