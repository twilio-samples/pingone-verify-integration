const crypto = require('crypto');

exports.handler = async function (context, event, callback) {
  const response = new Twilio.Response();
  response.appendHeader('Content-Type', 'application/json');

  // --- Bearer auth ---
  const authHeader = (event.request && event.request.headers
    ? event.request.headers.authorization
    : '') || '';
  const token = authHeader.startsWith('Bearer ')
    ? authHeader.slice(7)
    : null;
  const secret = context.PINGONE_SHARED_SECRET || '';

  const tokenBuf  = Buffer.from(token  || '', 'utf8');
  const secretBuf = Buffer.from(secret || '', 'utf8');
  const authOk =
    token &&
    secret &&
    tokenBuf.length === secretBuf.length &&
    crypto.timingSafeEqual(tokenBuf, secretBuf);

  if (!authOk) {
    response.setStatusCode(401);
    response.setBody({ error: 'Unauthorized' });
    return callback(null, response);
  }

  // --- Input validation ---
  // PingOne sends ${to} (E.164, FULL format), ${otp}, and a channel hint we set in the body template.
  const to      = (event.to      || '').trim();
  const otp     = (event.otp     || '').trim();
  const channel = (event.channel || 'sms').trim().toLowerCase();
  const locale  = event.locale   || undefined;

  if (!to || !otp) {
    response.setStatusCode(400);
    response.setBody({ error: 'Missing required fields: to, otp' });
    return callback(null, response);
  }

  // Verify customCode must be 4–10 characters
  if (otp.length < 4 || otp.length > 10) {
    response.setStatusCode(400);
    response.setBody({ error: 'otp must be 4–10 characters' });
    return callback(null, response);
  }

  // Map PingOne channel hint to Twilio Verify channel value
  const verifyChannel = channel === 'voice' ? 'call' : 'sms';

  // --- Send via Twilio Verify with customCode ---
  // Requires "Custom Verification Code" enabled on the Verify Service in the Console:
  // Verify → Services → <service> → General → Enable Custom Verification Code
  try {
    const client = context.getTwilioClient();
    const verifyParams = {
      to,
      channel: verifyChannel,
      customCode: otp,
    };
    if (locale) verifyParams.locale = locale;

    await client.verify.v2
      .services(context.TWILIO_VERIFY_SERVICE_SID)
      .verifications.create(verifyParams);

    response.setStatusCode(200);
    response.setBody({ status: 'sent', channel: verifyChannel });
    return callback(null, response);
  } catch (err) {
    console.error('Twilio Verify error:', err.message, err.code);
    response.setStatusCode(502);
    response.setBody({ error: 'Failed to send verification', detail: err.message });
    return callback(null, response);
  }
};
