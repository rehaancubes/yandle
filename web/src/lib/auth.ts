/**
 * VOXA Auth — Cognito API via direct HTTP (no hosted UI, no Amplify).
 * Uses USER_PASSWORD_AUTH flow for sign-in, and Cognito's SignUp/ConfirmSignUp for registration.
 */

const AUTH_STATE_KEY = "voxa_auth_state";

// ─── Config helpers ────────────────────────────────────────────────────────────

export function getAuthConfig() {
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const domain = import.meta.env.VITE_COGNITO_DOMAIN as string | undefined;
  // Extract region from domain: "https://voxa-auth-dev.auth.us-east-1.amazoncognito.com"
  const regionMatch = domain?.match(/\.auth\.([a-z0-9-]+)\.amazoncognito\.com/);
  const region = (import.meta.env.VITE_COGNITO_REGION as string | undefined) || regionMatch?.[1] || "us-east-1";
  const redirectUri =
    (import.meta.env.VITE_COGNITO_REDIRECT_URI as string | undefined)?.trim() ||
    (origin ? `${origin}/auth/callback` : "");
  const logoutUri =
    (import.meta.env.VITE_COGNITO_LOGOUT_URI as string | undefined)?.trim() ||
    (origin ? `${origin}/` : "");
  return {
    domain,
    region,
    clientId: import.meta.env.VITE_COGNITO_CLIENT_ID as string | undefined,
    redirectUri: redirectUri.replace(/\/+$/, ""),
    logoutUri: logoutUri.endsWith("/") ? logoutUri : `${logoutUri}/`,
  };
}

/** Cognito REST API endpoint for the user pool region */
function cognitoEndpoint(region: string) {
  return `https://cognito-idp.${region}.amazonaws.com/`;
}

async function cognitoRequest(region: string, target: string, body: object) {
  const res = await fetch(cognitoEndpoint(region), {
    method: "POST",
    headers: {
      "Content-Type": "application/x-amz-json-1.1",
      "X-Amz-Target": `AWSCognitoIdentityProviderService.${target}`,
    },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) {
    const msg = data.message || data.Message || data.__type || `Cognito error ${res.status}`;
    const err: any = new Error(msg);
    err.code = data.__type || "";
    throw err;
  }
  return data;
}

// ─── JWT helpers ───────────────────────────────────────────────────────────────

function decodeJwtPayload(token: string): Record<string, unknown> | null {
  try {
    const parts = token.split(".");
    if (parts.length < 2) return null;
    const b64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const padded = b64 + "=".repeat((4 - (b64.length % 4 || 4)) % 4);
    return JSON.parse(atob(padded));
  } catch {
    return null;
  }
}

export function getIdTokenClaims(): Record<string, unknown> | null {
  const token = localStorage.getItem("voxa_id_token");
  if (!token) return null;
  return decodeJwtPayload(token);
}

export function getCurrentUserSub(): string | null {
  const claims = getIdTokenClaims();
  const sub = claims?.sub;
  return typeof sub === "string" && sub ? sub : null;
}

export function getCurrentUserEmail(): string | null {
  const claims = getIdTokenClaims();
  const email = claims?.email;
  return typeof email === "string" && email ? email : null;
}

export function getOnboardingStorageKey(sub?: string | null): string {
  if (!sub) return "voxa_onboarding";
  return `voxa_onboarding:${sub}`;
}

function parseJwtExp(token: string): number {
  const payload = decodeJwtPayload(token);
  return Number(payload?.exp || 0) * 1000;
}

export function isAuthenticated(): boolean {
  const token = localStorage.getItem("voxa_id_token");
  if (!token) return false;
  return parseJwtExp(token) > Date.now();
}

// ─── Custom auth (email + password) ───────────────────────────────────────────

export interface AuthResult {
  ok: boolean;
  error?: string;
  code?: string;
  /** Set to true if email confirmation is required (new account) */
  needsConfirmation?: boolean;
}

/** Sign up with email + password. Returns ok=true if sign-up succeeded (OTP sent to email). */
export async function signUp(email: string, password: string): Promise<AuthResult> {
  const { region, clientId } = getAuthConfig();
  if (!clientId || !region) return { ok: false, error: "Auth not configured." };
  try {
    await cognitoRequest(region, "SignUp", {
      ClientId: clientId,
      Username: email.trim().toLowerCase(),
      Password: password,
      UserAttributes: [{ Name: "email", Value: email.trim().toLowerCase() }],
    });
    return { ok: true };
  } catch (e: any) {
    if (e.code === "UsernameExistsException") {
      return { ok: false, error: "An account with this email already exists.", code: e.code };
    }
    return { ok: false, error: e.message, code: e.code };
  }
}

/** Confirm sign-up with the OTP sent to email. */
export async function confirmSignUp(email: string, code: string): Promise<AuthResult> {
  const { region, clientId } = getAuthConfig();
  if (!clientId || !region) return { ok: false, error: "Auth not configured." };
  try {
    await cognitoRequest(region, "ConfirmSignUp", {
      ClientId: clientId,
      Username: email.trim().toLowerCase(),
      ConfirmationCode: code.trim(),
    });
    return { ok: true };
  } catch (e: any) {
    if (e.code === "CodeMismatchException") return { ok: false, error: "Incorrect verification code.", code: e.code };
    if (e.code === "ExpiredCodeException") return { ok: false, error: "Code expired. Please resend.", code: e.code };
    return { ok: false, error: e.message, code: e.code };
  }
}

/** Resend sign-up confirmation OTP. */
export async function resendConfirmationCode(email: string): Promise<AuthResult> {
  const { region, clientId } = getAuthConfig();
  if (!clientId || !region) return { ok: false, error: "Auth not configured." };
  try {
    await cognitoRequest(region, "ResendConfirmationCode", {
      ClientId: clientId,
      Username: email.trim().toLowerCase(),
    });
    return { ok: true };
  } catch (e: any) {
    return { ok: false, error: e.message, code: e.code };
  }
}

/** Sign in with email + password using USER_PASSWORD_AUTH flow. */
export async function signIn(email: string, password: string): Promise<AuthResult> {
  const { region, clientId } = getAuthConfig();
  if (!clientId || !region) return { ok: false, error: "Auth not configured." };
  try {
    const data = await cognitoRequest(region, "InitiateAuth", {
      AuthFlow: "USER_PASSWORD_AUTH",
      ClientId: clientId,
      AuthParameters: {
        USERNAME: email.trim().toLowerCase(),
        PASSWORD: password,
      },
    });
    const result = data.AuthenticationResult;
    if (!result?.IdToken) {
      return { ok: false, error: "No token in response." };
    }
    localStorage.setItem("voxa_id_token", result.IdToken);
    localStorage.setItem("voxa_access_token", result.AccessToken);
    if (result.RefreshToken) localStorage.setItem("voxa_refresh_token", result.RefreshToken);
    return { ok: true };
  } catch (e: any) {
    if (e.code === "UserNotConfirmedException") {
      return { ok: false, error: "Please verify your email first.", code: e.code, needsConfirmation: true };
    }
    if (e.code === "NotAuthorizedException") {
      return { ok: false, error: "Incorrect email or password.", code: e.code };
    }
    if (e.code === "UserNotFoundException") {
      return { ok: false, error: "No account found with this email.", code: e.code };
    }
    return { ok: false, error: e.message, code: e.code };
  }
}

/** Initiate forgot password — sends OTP to email. */
export async function forgotPassword(email: string): Promise<AuthResult> {
  const { region, clientId } = getAuthConfig();
  if (!clientId || !region) return { ok: false, error: "Auth not configured." };
  try {
    await cognitoRequest(region, "ForgotPassword", {
      ClientId: clientId,
      Username: email.trim().toLowerCase(),
    });
    return { ok: true };
  } catch (e: any) {
    return { ok: false, error: e.message, code: e.code };
  }
}

/** Confirm new password after forgot-password OTP. */
export async function confirmForgotPassword(email: string, code: string, newPassword: string): Promise<AuthResult> {
  const { region, clientId } = getAuthConfig();
  if (!clientId || !region) return { ok: false, error: "Auth not configured." };
  try {
    await cognitoRequest(region, "ConfirmForgotPassword", {
      ClientId: clientId,
      Username: email.trim().toLowerCase(),
      ConfirmationCode: code.trim(),
      Password: newPassword,
    });
    return { ok: true };
  } catch (e: any) {
    return { ok: false, error: e.message, code: e.code };
  }
}

// ─── Social / hosted UI (for future Google / Apple) ───────────────────────────

type Provider = "Google" | "SignInWithApple" | "COGNITO";

function generateState(): string {
  try {
    const globalCrypto = (typeof window !== "undefined" ? window.crypto : (globalThis as any)?.crypto) as Crypto | undefined;
    if (globalCrypto && typeof globalCrypto.randomUUID === "function") return globalCrypto.randomUUID();
  } catch { /* ignore */ }
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
  });
}

export function beginLogin(provider: Provider) {
  const cfg = getAuthConfig();
  if (!cfg.domain || !cfg.clientId) throw new Error("Missing Cognito config.");
  const state = generateState();
  localStorage.setItem(AUTH_STATE_KEY, state);
  const url = new URL(`${cfg.domain}/oauth2/authorize`);
  url.searchParams.set("response_type", "token");
  url.searchParams.set("client_id", cfg.clientId);
  url.searchParams.set("redirect_uri", cfg.redirectUri);
  url.searchParams.set("scope", "openid email profile");
  url.searchParams.set("state", state);
  if (provider !== "COGNITO") url.searchParams.set("identity_provider", provider);
  window.location.assign(url.toString());
}

export function completeLoginFromHash(hash: string): { ok: boolean; error?: string } {
  const params = new URLSearchParams(hash.startsWith("#") ? hash.slice(1) : hash);
  const idToken = params.get("id_token");
  const accessToken = params.get("access_token");
  const state = params.get("state");
  const expectedState = localStorage.getItem(AUTH_STATE_KEY);
  if (!idToken || !accessToken) return { ok: false, error: "Missing token in callback." };
  if (state && expectedState && state !== expectedState) return { ok: false, error: "Auth state mismatch." };
  localStorage.removeItem(AUTH_STATE_KEY);
  localStorage.setItem("voxa_id_token", idToken);
  localStorage.setItem("voxa_access_token", accessToken);
  return { ok: true };
}

export function signOut() {
  const cfg = getAuthConfig();
  localStorage.removeItem("voxa_id_token");
  localStorage.removeItem("voxa_access_token");
  localStorage.removeItem("voxa_refresh_token");
  if (!cfg.domain || !cfg.clientId) return;
  const logoutUrl = new URL(`${cfg.domain}/logout`);
  logoutUrl.searchParams.set("client_id", cfg.clientId);
  logoutUrl.searchParams.set("logout_uri", cfg.logoutUri);
  window.location.assign(logoutUrl.toString());
}

/** Remove all onboarding data from localStorage (handle, use case, form data). */
export function clearOnboardingStorage() {
  const sub = getCurrentUserSub();
  localStorage.removeItem("voxa_onboarding");
  if (sub) localStorage.removeItem(`voxa_onboarding:${sub}`);
  // Clear any other keys that might store onboarding (e.g. legacy or multiple subs)
  try {
    const keysToRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key?.startsWith("voxa_onboarding")) keysToRemove.push(key);
    }
    keysToRemove.forEach((k) => localStorage.removeItem(k));
  } catch (_) {}
}

/** Clear onboarding data and sign out so the user must log in again and go through onboarding. */
export function startFresh() {
  clearOnboardingStorage();
  signOut();
}
