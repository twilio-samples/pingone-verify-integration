exports.handler = function (context, event, callback) {
  const response = new Twilio.Response();
  response.appendHeader('Content-Type', 'application/json');

  const redirectUri = context.PINGONE_REDIRECT_URI ||
    `https://${context.DOMAIN_NAME}/callback.html`;

  response.setStatusCode(200);
  response.setBody({
    pingoneEnvId: context.PINGONE_ENV_ID,
    pingoneClientId: context.PINGONE_CLIENT_ID,
    redirectUri,
  });
  return callback(null, response);
};
