exports.handler = async function (context, event, callback) {
  const response = new Twilio.Response();
  response.appendHeader('Content-Type', 'application/json');

  const phone = (event.phone || '').trim();
  if (!phone) {
    response.setStatusCode(400);
    response.setBody({ error: 'Missing required field: phone' });
    return callback(null, response);
  }

  try {
    const client = context.getTwilioClient();
    const result = await client.lookups.v2
      .phoneNumbers(phone)
      .fetch({ fields: 'line_type_intelligence' });

    if (!result.valid) {
      response.setStatusCode(422);
      response.setBody({ error: 'Invalid phone number' });
      return callback(null, response);
    }

    response.setStatusCode(200);
    response.setBody({
      valid: true,
      formatted: result.phoneNumber,
      lineType: result.lineTypeIntelligence.type,
    });
    return callback(null, response);
  } catch (err) {
    console.error('Lookup error:', err.message, err.code);
    // Twilio error 20404 means the number couldn't be found/parsed
    if (err.code === 20404) {
      response.setStatusCode(422);
      response.setBody({ error: 'Invalid phone number' });
    } else {
      response.setStatusCode(502);
      response.setBody({ error: 'Lookup failed', detail: err.message });
    }
    return callback(null, response);
  }
};
