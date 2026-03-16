/**
 * Yandle Auth — Cognito API via direct HTTP (no hosted UI, no Amplify).
 * Uses CUSTOM_AUTH (OTP) flow for both email and phone sign-in.
 */

const AUTH_STATE_KEY = "yandle_auth_state";

// ─── Storage key migration (voxa_ → yandle_) ─────────────────────────────────
(function migrateStorageKeys() {
  const migrations: [string, string][] = [
    ["voxa_id_token", "yandle_id_token"],
    ["voxa_access_token", "yandle_access_token"],
    ["voxa_refresh_token", "yandle_refresh_token"],
    ["voxa_auth_state", "yandle_auth_state"],
  ];
  for (const [oldKey, newKey] of migrations) {
    const val = localStorage.getItem(oldKey);
    if (val && !localStorage.getItem(newKey)) {
      localStorage.setItem(newKey, val);
    }
    if (val) localStorage.removeItem(oldKey);
  }
  // Migrate onboarding keys
  const keysToMigrate: [string, string][] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key?.startsWith("voxa_onboarding")) {
      const newKey = key.replace("voxa_onboarding", "yandle_onboarding");
      keysToMigrate.push([key, newKey]);
    }
  }
  for (const [oldKey, newKey] of keysToMigrate) {
    const val = localStorage.getItem(oldKey);
    if (val && !localStorage.getItem(newKey)) {
      localStorage.setItem(newKey, val);
    }
    if (val) localStorage.removeItem(oldKey);
  }
})();

// ─── Config helpers ────────────────────────────────────────────────────────────

const apiBase = (import.meta.env.VITE_API_BASE_URL as string || "").replace(/\/$/, "");

export function getAuthConfig() {
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const domain = import.meta.env.VITE_COGNITO_DOMAIN as string | undefined;
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
  const token = localStorage.getItem("yandle_id_token");
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
  if (!sub) return "yandle_onboarding";
  return `yandle_onboarding:${sub}`;
}

function parseJwtExp(token: string): number {
  const payload = decodeJwtPayload(token);
  return Number(payload?.exp || 0) * 1000;
}

export function isAuthenticated(): boolean {
  const token = localStorage.getItem("yandle_id_token");
  if (!token) return false;
  return parseJwtExp(token) > Date.now();
}

// ─── Email OTP auth ───────────────────────────────────────────────────────────

export interface AuthResult {
  ok: boolean;
  error?: string;
  code?: string;
}

export interface OtpStartResult {
  ok: boolean;
  session?: string;
  error?: string;
}

/** Send email OTP — creates user if needed, sends code via Cognito built-in email. */
export async function sendEmailOtp(email: string): Promise<OtpStartResult> {
  try {
    const res = await fetch(`${apiBase}/auth/email`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: email.trim().toLowerCase(), action: "email-start" }),
    });
    const data = await res.json();
    if (!res.ok) return { ok: false, error: data.error || "Failed to send code" };
    return { ok: true };
  } catch (e: any) {
    return { ok: false, error: e.message };
  }
}

/** Verify email OTP — confirms code and returns tokens. */
export async function verifyEmailOtp(email: string, otp: string): Promise<AuthResult> {
  try {
    const res = await fetch(`${apiBase}/auth/email`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: email.trim().toLowerCase(),
        action: "email-verify",
        otp: otp.trim(),
      }),
    });
    const data = await res.json();
    if (!res.ok) return { ok: false, error: data.error || "Verification failed" };
    if (!data.idToken) return { ok: false, error: "No token in response." };
    localStorage.setItem("yandle_id_token", data.idToken);
    localStorage.setItem("yandle_access_token", data.accessToken);
    if (data.refreshToken) localStorage.setItem("yandle_refresh_token", data.refreshToken);
    return { ok: true };
  } catch (e: any) {
    return { ok: false, error: e.message };
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
  localStorage.setItem("yandle_id_token", idToken);
  localStorage.setItem("yandle_access_token", accessToken);
  return { ok: true };
}

export function signOut() {
  const cfg = getAuthConfig();
  localStorage.removeItem("yandle_id_token");
  localStorage.removeItem("yandle_access_token");
  localStorage.removeItem("yandle_refresh_token");
  if (!cfg.domain || !cfg.clientId) return;
  const logoutUrl = new URL(`${cfg.domain}/logout`);
  logoutUrl.searchParams.set("client_id", cfg.clientId);
  logoutUrl.searchParams.set("logout_uri", cfg.logoutUri);
  window.location.assign(logoutUrl.toString());
}

/** Remove all onboarding data from localStorage. */
export function clearOnboardingStorage() {
  const sub = getCurrentUserSub();
  localStorage.removeItem("yandle_onboarding");
  if (sub) localStorage.removeItem(`yandle_onboarding:${sub}`);
  try {
    const keysToRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key?.startsWith("yandle_onboarding")) keysToRemove.push(key);
    }
    keysToRemove.forEach((k) => localStorage.removeItem(k));
  } catch (_) {}
}

/** Clear onboarding data and sign out so the user must log in again and go through onboarding. */
export function startFresh() {
  clearOnboardingStorage();
  signOut();
}
