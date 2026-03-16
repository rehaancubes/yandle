/**
 * OTP authentication Lambda.
 *
 * POST /auth/phone  — body: { phone, action: "start" | "verify" | "firebase-verify", ... }
 * POST /auth/email  — body: { email, action: "email-start" | "email-verify", otp? }
 * PUT  /auth/profile — body: { action: "link-email", email }
 *
 * Phone flow uses synthetic email (e.g. +919876543210@phone.yandle.local).
 * Mobile phone OTP uses Firebase Auth → backend verifies Firebase ID token → issues Cognito tokens.
 * Email OTP uses Cognito's ForgotPassword flow (built-in email, no SES needed).
 */
const AWS = require("aws-sdk");
const https = require("https");
const crypto = require("crypto");
const cognito = new AWS.CognitoIdentityServiceProvider();

const USER_POOL_ID = process.env.USER_POOL_ID;
const CLIENT_ID = process.env.CLIENT_ID;
const FIREBASE_PROJECT_ID = process.env.FIREBASE_PROJECT_ID;

// ─── Firebase ID token verification (no firebase-admin SDK needed) ───────────

let cachedCerts = null;
let certsExpiry = 0;

/** Fetch and cache Google's public X.509 certificates for Firebase token verification */
async function getGoogleCerts() {
  if (cachedCerts && Date.now() < certsExpiry) return cachedCerts;

  return new Promise((resolve, reject) => {
    https.get(
      "https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com",
      (res) => {
        let body = "";
        res.on("data", (chunk) => (body += chunk));
        res.on("end", () => {
          try {
            cachedCerts = JSON.parse(body);
            const cc = res.headers["cache-control"] || "";
            const match = cc.match(/max-age=(\d+)/);
            certsExpiry = Date.now() + (match ? parseInt(match[1]) * 1000 : 3600000);
            resolve(cachedCerts);
          } catch (e) {
            reject(e);
          }
        });
        res.on("error", reject);
      }
    ).on("error", reject);
  });
}

/** Verify a Firebase ID token: decode JWT, validate claims, verify RS256 signature */
async function verifyFirebaseToken(token) {
  const [headerB64, payloadB64, signatureB64] = token.split(".");
  if (!headerB64 || !payloadB64 || !signatureB64) throw new Error("Malformed token");

  const header = JSON.parse(Buffer.from(headerB64, "base64url").toString());
  const payload = JSON.parse(Buffer.from(payloadB64, "base64url").toString());

  const now = Math.floor(Date.now() / 1000);
  if (payload.exp <= now) throw new Error("Token expired");
  if (payload.iat > now + 300) throw new Error("Token issued in the future");
  if (payload.aud !== FIREBASE_PROJECT_ID) throw new Error("Invalid audience");
  if (payload.iss !== `https://securetoken.google.com/${FIREBASE_PROJECT_ID}`) throw new Error("Invalid issuer");
  if (!payload.sub || typeof payload.sub !== "string") throw new Error("Invalid subject");
  if (header.alg !== "RS256") throw new Error("Invalid algorithm");

  const certs = await getGoogleCerts();
  const cert = certs[header.kid];
  if (!cert) throw new Error("Unknown key ID");

  const verifier = crypto.createVerify("RSA-SHA256");
  verifier.update(`${headerB64}.${payloadB64}`);
  const signatureBuffer = Buffer.from(signatureB64, "base64url");
  if (!verifier.verify(cert, signatureBuffer)) throw new Error("Invalid signature");

  return payload;
}

function parseBody(event) {
  const raw = event.body;
  if (raw == null || raw === "") return {};
  if (typeof raw === "object") return raw;
  const str = event.isBase64Encoded ? Buffer.from(raw, "base64").toString("utf8") : raw;
  return typeof str === "string" ? JSON.parse(str) : {};
}

function normalizePhone(raw) {
  let p = String(raw || "").trim().replace(/[\s()-]/g, "");
  if (p && !p.startsWith("+")) p = "+" + p;
  return p;
}

/** Convert phone to a synthetic email for Cognito username */
function phoneToEmail(phone) {
  const digits = phone.replace(/\+/g, "");
  return `${digits}@phone.yandle.local`;
}

/**
 * Find or create a Cognito user by phone number.
 */
async function ensurePhoneUser(phone) {
  const email = phoneToEmail(phone);

  try {
    await cognito.adminGetUser({
      UserPoolId: USER_POOL_ID,
      Username: email,
    }).promise();
    return email;
  } catch (err) {
    if (err.code !== "UserNotFoundException") throw err;
  }

  await cognito.adminCreateUser({
    UserPoolId: USER_POOL_ID,
    Username: email,
    UserAttributes: [
      { Name: "email", Value: email },
      { Name: "email_verified", Value: "true" },
      { Name: "phone_number", Value: phone },
      { Name: "phone_number_verified", Value: "true" },
    ],
    MessageAction: "SUPPRESS",
  }).promise();

  const tempPw = `Tmp${Date.now()}!${Math.random().toString(36).slice(2, 10)}`;
  await cognito.adminSetUserPassword({
    UserPoolId: USER_POOL_ID,
    Username: email,
    Password: tempPw,
    Permanent: true,
  }).promise();

  return email;
}

/**
 * Find or create a Cognito user by email address.
 * Uses the real email as the Cognito username (no synthetic email).
 */
async function ensureEmailUser(emailAddr) {
  try {
    await cognito.adminGetUser({
      UserPoolId: USER_POOL_ID,
      Username: emailAddr,
    }).promise();
    return emailAddr;
  } catch (err) {
    if (err.code !== "UserNotFoundException") throw err;
  }

  await cognito.adminCreateUser({
    UserPoolId: USER_POOL_ID,
    Username: emailAddr,
    UserAttributes: [
      { Name: "email", Value: emailAddr },
      { Name: "email_verified", Value: "true" },
    ],
    MessageAction: "SUPPRESS",
  }).promise();

  const tempPw = `Tmp${Date.now()}!${Math.random().toString(36).slice(2, 10)}`;
  await cognito.adminSetUserPassword({
    UserPoolId: USER_POOL_ID,
    Username: emailAddr,
    Password: tempPw,
    Permanent: true,
  }).promise();

  return emailAddr;
}

/** Initiate CUSTOM_AUTH and return session */
async function initiateAuth(username) {
  const result = await cognito.adminInitiateAuth({
    UserPoolId: USER_POOL_ID,
    ClientId: CLIENT_ID,
    AuthFlow: "CUSTOM_AUTH",
    AuthParameters: { USERNAME: username },
  }).promise();

  return {
    statusCode: 200,
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      session: result.Session,
      challengeName: result.ChallengeName,
    }),
  };
}

/** Respond to OTP challenge and return tokens */
async function respondToChallenge(username, otp, session) {
  if (!otp || !session) {
    return {
      statusCode: 400,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ error: "otp and session are required" }),
    };
  }

  const result = await cognito.adminRespondToAuthChallenge({
    UserPoolId: USER_POOL_ID,
    ClientId: CLIENT_ID,
    ChallengeName: "CUSTOM_CHALLENGE",
    Session: session,
    ChallengeResponses: {
      USERNAME: username,
      ANSWER: otp,
    },
  }).promise();

  if (!result.AuthenticationResult) {
    return {
      statusCode: 401,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ error: "Verification failed" }),
    };
  }

  return {
    statusCode: 200,
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      idToken: result.AuthenticationResult.IdToken,
      accessToken: result.AuthenticationResult.AccessToken,
      refreshToken: result.AuthenticationResult.RefreshToken,
    }),
  };
}

exports.handler = async (event) => {
  try {
    const body = parseBody(event);
    const action = body.action || "start";

    // ── Email OTP actions (uses Cognito ForgotPassword → built-in email) ──
    // For rehaan@mobil80.com we use CUSTOM_AUTH with hardcoded OTP 061628 (no email sent).
    const HARDCODED_OTP_EMAIL = "rehaan@mobil80.com";
    const HARDCODED_OTP_CODE = "061628";

    if (action === "email-start") {
      const email = (body.email || "").trim().toLowerCase();
      if (!email || !email.includes("@") || email.endsWith("@phone.yandle.local") || email.endsWith("@phone.voxa.local")) {
        return {
          statusCode: 400,
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ error: "A valid email address is required" }),
        };
      }
      await ensureEmailUser(email);

      if (email === HARDCODED_OTP_EMAIL) {
        // No email sent; user will enter hardcoded OTP 061628
        return {
          statusCode: 200,
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ ok: true }),
        };
      }

      // Use Cognito's ForgotPassword to send a code via built-in email (no SES needed)
      await cognito.forgotPassword({
        ClientId: CLIENT_ID,
        Username: email,
      }).promise();

      return {
        statusCode: 200,
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ok: true }),
      };
    }

    if (action === "email-verify") {
      const email = (body.email || "").trim().toLowerCase();
      if (!email || !email.includes("@")) {
        return {
          statusCode: 400,
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ error: "A valid email address is required" }),
        };
      }
      const otp = String(body.otp || "").trim();
      if (!otp) {
        return {
          statusCode: 400,
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ error: "Verification code is required" }),
        };
      }

      // Hardcoded OTP for rehaan@mobil80.com: use CUSTOM_AUTH (initiate then respond with 061628)
      if (email === HARDCODED_OTP_EMAIL && otp === HARDCODED_OTP_CODE) {
        const init = await cognito.adminInitiateAuth({
          UserPoolId: USER_POOL_ID,
          ClientId: CLIENT_ID,
          AuthFlow: "CUSTOM_AUTH",
          AuthParameters: { USERNAME: email },
        }).promise();
        if (!init.Session || init.ChallengeName !== "CUSTOM_CHALLENGE") {
          return {
            statusCode: 401,
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ error: "Invalid verification code provided, please try again." }),
          };
        }
        const challenge = await cognito.adminRespondToAuthChallenge({
          UserPoolId: USER_POOL_ID,
          ClientId: CLIENT_ID,
          ChallengeName: "CUSTOM_CHALLENGE",
          Session: init.Session,
          ChallengeResponses: { USERNAME: email, ANSWER: otp },
        }).promise();
        if (!challenge.AuthenticationResult) {
          return {
            statusCode: 401,
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ error: "Invalid verification code provided, please try again." }),
          };
        }
        return {
          statusCode: 200,
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            idToken: challenge.AuthenticationResult.IdToken,
            accessToken: challenge.AuthenticationResult.AccessToken,
            refreshToken: challenge.AuthenticationResult.RefreshToken,
          }),
        };
      }

      // Confirm the forgot-password code and set a new random password
      const newPassword = `Pwd${Date.now()}!${Math.random().toString(36).slice(2, 10)}`;
      await cognito.confirmForgotPassword({
        ClientId: CLIENT_ID,
        Username: email,
        ConfirmationCode: otp,
        Password: newPassword,
      }).promise();

      // Authenticate with the new password to get tokens
      const authResult = await cognito.adminInitiateAuth({
        UserPoolId: USER_POOL_ID,
        ClientId: CLIENT_ID,
        AuthFlow: "ADMIN_USER_PASSWORD_AUTH",
        AuthParameters: {
          USERNAME: email,
          PASSWORD: newPassword,
        },
      }).promise();

      if (!authResult.AuthenticationResult) {
        return {
          statusCode: 401,
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ error: "Authentication failed" }),
        };
      }

      return {
        statusCode: 200,
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          idToken: authResult.AuthenticationResult.IdToken,
          accessToken: authResult.AuthenticationResult.AccessToken,
          refreshToken: authResult.AuthenticationResult.RefreshToken,
        }),
      };
    }

    // ── Phone OTP actions ──────────────────────────────────────────────
    const phone = normalizePhone(body.phone);

    if (action === "start" || action === "verify") {
      if (!phone || phone.length < 8) {
        return {
          statusCode: 400,
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ error: "Valid phone number is required" }),
        };
      }
    }

    if (action === "start") {
      const email = await ensurePhoneUser(phone);
      return await initiateAuth(email);
    }

    if (action === "verify") {
      const otp = String(body.otp || "").trim();
      const email = phoneToEmail(phone);
      return await respondToChallenge(email, otp, body.session);
    }

    // ── Firebase phone verify (mobile) ─────────────────────────────────
    if (action === "firebase-verify") {
      const firebaseToken = body.firebaseToken;
      if (!firebaseToken) {
        return {
          statusCode: 400,
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ error: "firebaseToken is required" }),
        };
      }
      if (!FIREBASE_PROJECT_ID) {
        return {
          statusCode: 500,
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ error: "Firebase is not configured on this server" }),
        };
      }

      // 1. Verify the Firebase ID token
      let firebasePayload;
      try {
        firebasePayload = await verifyFirebaseToken(firebaseToken);
      } catch (err) {
        console.error("[firebase-verify] Token verification failed:", err.message);
        return {
          statusCode: 401,
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ error: "Invalid Firebase token: " + err.message }),
        };
      }

      // 2. Extract phone number
      const firebasePhone = firebasePayload.phone_number;
      if (!firebasePhone) {
        return {
          statusCode: 400,
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ error: "Firebase token does not contain a phone number" }),
        };
      }

      // 3. Ensure Cognito user exists (reuses existing ensurePhoneUser)
      const email = await ensurePhoneUser(firebasePhone);

      // 4. Set a fresh random password and authenticate to get Cognito tokens
      const password = `Fb${Date.now()}!${crypto.randomBytes(8).toString("hex")}`;
      await cognito.adminSetUserPassword({
        UserPoolId: USER_POOL_ID,
        Username: email,
        Password: password,
        Permanent: true,
      }).promise();

      const authResult = await cognito.adminInitiateAuth({
        UserPoolId: USER_POOL_ID,
        ClientId: CLIENT_ID,
        AuthFlow: "ADMIN_USER_PASSWORD_AUTH",
        AuthParameters: { USERNAME: email, PASSWORD: password },
      }).promise();

      if (!authResult.AuthenticationResult) {
        return {
          statusCode: 500,
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ error: "Failed to issue Cognito tokens" }),
        };
      }

      return {
        statusCode: 200,
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          idToken: authResult.AuthenticationResult.IdToken,
          accessToken: authResult.AuthenticationResult.AccessToken,
          refreshToken: authResult.AuthenticationResult.RefreshToken,
        }),
      };
    }

    // ── Link email (authenticated) ─────────────────────────────────────
    if (action === "link-email") {
      const callerSub = event?.requestContext?.authorizer?.jwt?.claims?.sub;
      if (!callerSub) {
        return {
          statusCode: 401,
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ error: "Unauthorized" }),
        };
      }

      const newEmail = (body.email || "").trim().toLowerCase();
      if (!newEmail || !newEmail.includes("@") || newEmail.endsWith("@phone.yandle.local") || newEmail.endsWith("@phone.voxa.local")) {
        return {
          statusCode: 400,
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ error: "A valid email address is required" }),
        };
      }

      const users = await cognito.listUsers({
        UserPoolId: USER_POOL_ID,
        Filter: `sub = "${callerSub}"`,
        Limit: 1,
      }).promise();

      if (!users.Users || users.Users.length === 0) {
        return {
          statusCode: 404,
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ error: "User not found" }),
        };
      }

      const username = users.Users[0].Username;

      // If another Cognito user already has this email (e.g. old email+password account),
      // delete that user first so we can reassign the email to the phone user.
      try {
        const existing = await cognito.adminGetUser({
          UserPoolId: USER_POOL_ID,
          Username: newEmail,
        }).promise();
        // Make sure we're not deleting ourselves
        const existingSub = (existing.UserAttributes || []).find(a => a.Name === "sub")?.Value;
        if (existingSub && existingSub !== callerSub) {
          console.log(`[link-email] Deleting old email user ${newEmail} (sub: ${existingSub}) to merge with phone user (sub: ${callerSub})`);
          await cognito.adminDeleteUser({
            UserPoolId: USER_POOL_ID,
            Username: newEmail,
          }).promise();
        }
      } catch (err) {
        if (err.code !== "UserNotFoundException") {
          console.error("[link-email] Error checking existing email user:", err.message);
        }
        // UserNotFoundException is fine — no conflict
      }

      await cognito.adminUpdateUserAttributes({
        UserPoolId: USER_POOL_ID,
        Username: username,
        UserAttributes: [
          { Name: "email", Value: newEmail },
          { Name: "email_verified", Value: "true" },
        ],
      }).promise();

      return {
        statusCode: 200,
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: newEmail }),
      };
    }

    return {
      statusCode: 400,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ error: "Invalid action. Use 'start', 'verify', 'firebase-verify', 'email-start', 'email-verify', or 'link-email'." }),
    };
  } catch (err) {
    console.error("[auth] Error:", err.message, err.code);
    return {
      statusCode: 500,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ error: err.message }),
    };
  }
};
