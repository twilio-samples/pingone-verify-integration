require("dotenv").config();

const express = require("express");
const twilio = require("twilio");
const crypto = require("crypto");
const path = require("path");

const app = express();
const port = process.env.PORT || 3000;
const myAccountUrl = `https://apps.pingone.com/${process.env.PINGONE_ENV_ID}/myaccount/#mfa`;
const pingOneTokenEndpoint = `https://auth.pingone.com/${process.env.PINGONE_ENV_ID}/as/token`;
const pingOneUserInfoEndpoint = `https://auth.pingone.com/${process.env.PINGONE_ENV_ID}/as/userinfo`;
const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
const authorizationRequests = new Map();
const assetsDirectory = path.join(__dirname, "assets");

app.set("view engine", "ejs");
app.set("views", assetsDirectory);
app.use(express.urlencoded({ extended: false }));
app.use("/assets", express.static(assetsDirectory));

function createPkcePair() {
  const verifier = crypto.randomBytes(32).toString("base64url");
  const challenge = crypto.createHash("sha256").update(verifier).digest("base64url");
  return { verifier, challenge };
}

app.get("/", (req, res) => {
  res.sendFile(path.join(assetsDirectory, "login.html"));
});

app.post("/login", async (req, res) => {
  const { email, phone } = req.body;

  try {
    const lookup = await client.lookups.v2.phoneNumbers(phone).fetch({
      fields: "line_type_intelligence"
    });

    console.log("Twilio Lookup result:", lookup);

    if (!lookup.valid || lookup.lineTypeIntelligence?.type !== "mobile") {
      res.status(400).sendFile(path.join(assetsDirectory, "invalid-phone.html"));
      return;
    }

    const { verifier, challenge } = createPkcePair();
    const state = crypto.randomBytes(32).toString("base64url");
    authorizationRequests.set(state, { verifier, createdAt: Date.now() });

    const authorizationUrl = new URL(
      `https://auth.pingone.com/${process.env.PINGONE_ENV_ID}/as/authorize`
    );
    authorizationUrl.search = new URLSearchParams({
      client_id: process.env.PINGONE_APP_ID,
      response_type: "code",
       redirect_uri: process.env.PINGONE_REDIRECT_URI,
       scope: "openid profile email phone",
       login_hint: email,
       state,
       code_challenge: challenge,
       code_challenge_method: "S256"
    }).toString();

    res.redirect(authorizationUrl.toString());
  } catch (error) {
    console.error("Twilio Lookup failed:", error);
    res.status(400).sendFile(path.join(assetsDirectory, "invalid-phone.html"));
  }
});

app.get("/auth/callback", async (req, res) => {
  const { code, state, error, error_description: errorDescription } = req.query;
  const authorizationRequest = authorizationRequests.get(state);
  authorizationRequests.delete(state);

  if (error) {
    res.status(400).render("login-failed", { message: errorDescription || error });
    return;
  }

  if (!authorizationRequest || Date.now() - authorizationRequest.createdAt > 10 * 60 * 1000) {
    res.status(400).render("login-failed", {
      message: "Your login session is missing or expired. Please try again."
    });
    return;
  }

  try {
    const tokenResponse = await fetch(pingOneTokenEndpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded"
      },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        client_id: process.env.PINGONE_APP_ID,
        code,
        redirect_uri: process.env.PINGONE_REDIRECT_URI,
        code_verifier: authorizationRequest.verifier
      })
    });

    const tokens = await tokenResponse.json();
    if (!tokenResponse.ok) throw new Error(tokens.error_description || "Unable to exchange authorization code.");

    const userInfoResponse = await fetch(pingOneUserInfoEndpoint, {
      headers: { Authorization: `Bearer ${tokens.access_token}` }
    });
    const user = await userInfoResponse.json();
    if (!userInfoResponse.ok) throw new Error("Unable to retrieve user information.");

    const tokenPayload = JSON.parse(Buffer.from(tokens.id_token.split(".")[1], "base64url").toString());

    if (tokenPayload.amr?.length === 1 && tokenPayload.amr[0] === "pwd") {
      res.redirect(myAccountUrl);
      return;
    }

    res.render("login-success", {
      name: user.given_name || user.name || "User",
      email: user.email || "Not available",
      userId: user.sub,
      myAccountUrl,
      tokenPayload: JSON.stringify(tokenPayload, null, 2)
    });
  } catch (error) {
    console.error("PingOne login failed:", error);
    res.status(500).render("login-failed", { message: error.message });
  }
});

app.listen(port, () => {
  console.log(`App listening at http://localhost:${port}`);
});
