const crypto = require('crypto');

// Convert a base64url-encoded string to a Node Buffer
function base64urlDecode(str) {
  return Buffer.from(str.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
}

// Convert a base64url-encoded JWK 'n' or 'e' component to a PEM public key
function jwkToPem(jwk) {
  const n = base64urlDecode(jwk.n);
  const e = base64urlDecode(jwk.e);

  // Build DER-encoded RSAPublicKey structure
  function encodeLength(len) {
    if (len < 0x80) return Buffer.from([len]);
    const bytes = [];
    let l = len;
    while (l > 0) { bytes.unshift(l & 0xff); l >>= 8; }
    return Buffer.from([0x80 | bytes.length, ...bytes]);
  }

  function encodeInteger(buf) {
    // Add leading zero if high bit set (to mark as positive)
    const b = buf[0] & 0x80 ? Buffer.concat([Buffer.from([0x00]), buf]) : buf;
    return Buffer.concat([Buffer.from([0x02]), encodeLength(b.length), b]);
  }

  const nDer = encodeInteger(n);
  const eDer = encodeInteger(e);
  const seq = Buffer.concat([Buffer.from([0x30]), encodeLength(nDer.length + eDer.length), nDer, eDer]);

  // Wrap in SubjectPublicKeyInfo (with RSA OID)
  const rsaOid = Buffer.from('300d06092a864886f70d0101010500', 'hex');
  const bitStr = Buffer.concat([Buffer.from([0x00]), seq]);
  const bitStrDer = Buffer.concat([Buffer.from([0x03]), encodeLength(bitStr.length), bitStr]);
  const spki = Buffer.concat([Buffer.from([0x30]), encodeLength(rsaOid.length + bitStrDer.length), rsaOid, bitStrDer]);

  const b64 = spki.toString('base64').match(/.{1,64}/g).join('\n');
  return `-----BEGIN PUBLIC KEY-----\n${b64}\n-----END PUBLIC KEY-----`;
}

async function verifyIdToken(idToken, envId) {
  const parts = idToken.split('.');
  if (parts.length !== 3) throw new Error('Malformed id_token');

  const header = JSON.parse(base64urlDecode(parts[0]).toString('utf8'));
  const payload = JSON.parse(base64urlDecode(parts[1]).toString('utf8'));

  // Fetch PingOne JWKS
  const jwksUrl = `https://auth.pingone.com/${envId}/as/jwks`;
  const jwksRes = await fetch(jwksUrl);
  if (!jwksRes.ok) throw new Error(`JWKS fetch failed: ${jwksRes.status}`);
  const { keys } = await jwksRes.json();

  // Find the matching key by kid
  const jwk = keys.find(k => k.kid === header.kid && k.use === 'sig');
  if (!jwk) throw new Error(`No matching JWK found for kid: ${header.kid}`);

  const pem = jwkToPem(jwk);
  const signingInput = `${parts[0]}.${parts[1]}`;
  const signature = base64urlDecode(parts[2]);

  const verify = crypto.createVerify('RSA-SHA256');
  verify.update(signingInput);
  const valid = verify.verify(pem, signature);
  if (!valid) throw new Error('id_token signature verification failed');

  return payload;
}

exports.handler = async function (context, event, callback) {
  const response = new Twilio.Response();
  response.appendHeader('Content-Type', 'application/json');

  const { code, code_verifier, redirect_uri } = event;
  if (!code || !code_verifier || !redirect_uri) {
    response.setStatusCode(400);
    response.setBody({ error: 'Missing required fields: code, code_verifier, redirect_uri' });
    return callback(null, response);
  }

  const envId = context.PINGONE_ENV_ID;
  const clientId = context.PINGONE_CLIENT_ID;
  const tokenUrl = `https://auth.pingone.com/${envId}/as/token`;

  try {
    // Exchange authorization code for tokens at PingOne
    const tokenRes = await fetch(tokenUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        client_id: clientId,
        code,
        code_verifier,
        redirect_uri,
      }).toString(),
    });

    const tokenData = await tokenRes.json();
    if (!tokenRes.ok) {
      console.error('PingOne token error:', JSON.stringify(tokenData));
      response.setStatusCode(502);
      response.setBody({ error: 'Token exchange failed', detail: tokenData.error_description || tokenData.error });
      return callback(null, response);
    }

    // Verify and decode the id_token
    const claims = await verifyIdToken(tokenData.id_token, envId);

    response.setStatusCode(200);
    response.setBody({
      sub: claims.sub,
      name: claims.name,
      given_name: claims.given_name,
      family_name: claims.family_name,
      email: claims.email,
      phone_number: claims.phone_number,
    });
    return callback(null, response);
  } catch (err) {
    console.error('Token exchange error:', err.message);
    const status = err.message.includes('verification failed') ? 401 : 502;
    response.setStatusCode(status);
    response.setBody({ error: err.message });
    return callback(null, response);
  }
};
