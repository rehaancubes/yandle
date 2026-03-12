# Deploy Voxa Web to Vercel

## Required: Set env vars (fixes sign-up, login, and “redirect_mismatch”)

Vite bakes `VITE_*` at **build time**. Set these in Vercel for **Production** and for **Preview** (so sign-up and login work on every deployment URL):

| Variable | Example | Notes |
|----------|--------|--------|
| `VITE_COGNITO_DOMAIN` | `https://voxa-auth-dev.auth.us-east-1.amazoncognito.com` | From CDK output or Cognito console |
| `VITE_COGNITO_CLIENT_ID` | `54h640jfhu7pdfv1032erjc5i6` | From CDK output |
| `VITE_API_BASE_URL` | `https://6kbd4veax6.execute-api.us-east-1.amazonaws.com` | Your API Gateway URL |
| `VITE_COGNITO_REDIRECT_URI` | `https://your-app.vercel.app/auth/callback` | **No trailing slash.** Must match your app URL exactly. |
| `VITE_COGNITO_LOGOUT_URI` | `https://your-app.vercel.app/` | Sign-out redirect |

**Important:** Use **your actual Vercel URL** for redirect and logout (e.g. `https://voxa-xyz.vercel.app/auth/callback`). If you use a custom domain, use that. The value must be **exactly** one of the callback URLs configured in Cognito (see below).

**Vercel Dashboard (recommended for Production + Preview):**

1. Open your project → **Settings** → **Environment Variables**.
2. Add (or edit) each variable and enable **Production** (and **Preview** if needed):
   - `VITE_COGNITO_DOMAIN` = `https://voxa-auth-dev.auth.us-east-1.amazoncognito.com`
   - `VITE_COGNITO_CLIENT_ID` = `54h640jfhu7pdfv1032erjc5i6`
   - `VITE_API_BASE_URL` = `https://6kbd4veax6.execute-api.us-east-1.amazonaws.com`
   - `VITE_COGNITO_REDIRECT_URI` = `https://callcentral.vercel.app/auth/callback` (no trailing slash)
   - `VITE_COGNITO_LOGOUT_URI` = `https://callcentral.vercel.app/`
3. **Redeploy** (Deployments → … → Redeploy) so the new build uses these values.

**CLI (Production only):** from `web/` run `npx vercel env add <NAME>`, enter the value, and choose Production. For Preview as well, use the dashboard (or connect Git and add for Preview via CLI).

---

## Troubleshooting: Sign-up / login not working on Vercel

1. **“Missing Cognito config”**  
   Set `VITE_COGNITO_DOMAIN` and `VITE_COGNITO_CLIENT_ID` in Vercel (Production + Preview), then **redeploy** so the new build picks them up.

2. **“redirect_mismatch” or Cognito says “Invalid redirect_uri”**  
   The URL your app sends as `redirect_uri` must be in the Cognito User Pool’s allowed callback list.  
   - In the CDK stack, `WebCallbackUrls` (and `WebLogoutUrls`) are passed to Cognito. Add your **exact** Vercel URL(s), e.g.  
     `https://your-project.vercel.app/auth/callback` (no trailing slash).  
   - Redeploy the CDK stack after changing the parameter, then try again.  
   - If you use a custom domain (e.g. `https://app.example.com`), add `https://app.example.com/auth/callback` to `WebCallbackUrls`.

3. **Sign-up / “Sign up” does nothing or fails**  
   - Ensure the Cognito User Pool has **self sign-up** enabled (e.g. “Allow users to sign themselves up”).  
   - Ensure the app client allows the Hosted UI and has the correct callback/logout URLs (same as above).  
   - After changing env vars in Vercel, trigger a **new deployment**; Vite embeds `VITE_*` at build time.

4. **Preview deployments (e.g. `project-xxx-tenant.vercel.app`)**  
   Add that full URL to CDK `WebCallbackUrls` and `WebLogoutUrls` (comma-separated), redeploy CDK, then use that preview URL as `VITE_COGNITO_REDIRECT_URI` for that build, or rely on the app’s fallback (origin-based redirect) and ensure that origin is in the callback list.

---

## Deploy via CLI

From the repo root or from `web/`:

```bash
# One-time: log in (opens browser or gives you a token)
cd web && npx vercel login

# Preview deploy (creates a unique *.vercel.app URL each time)
cd web && npm run deploy

# Production deploy (stable URL: https://callcentral.vercel.app)
cd web && npm run deploy:prod
```

Preview URLs change every time (e.g. `callcentral-xxxxx-rehaancubes-6193s-projects.vercel.app`). The CDK stack is configured with **multiple** callback/logout URLs (production + current preview) so Cognito allows both. To add a new preview URL, redeploy CDK with updated `WebCallbackUrls` / `WebLogoutUrls` (comma-separated).

---

## Deploy via Dashboard (alternative)

## 1. Connect repository

1. Go to [vercel.com](https://vercel.com) and sign in.
2. **Add New** → **Project** → Import your Git repository (e.g. GitHub).
3. Set **Root Directory** to `web` (or leave default and set it in Project Settings after import).
4. Vercel will detect Vite and use `vercel.json` in the repo.

## 2. Environment variables

In the project **Settings → Environment Variables**, add for **Production** and **Preview**:

| Name | Value |
|------|--------|
| `VITE_API_BASE_URL` | `https://6kbd4veax6.execute-api.us-east-1.amazonaws.com` |
| `VITE_COGNITO_DOMAIN` | `https://voxa-auth-dev.auth.us-east-1.amazoncognito.com` |
| `VITE_COGNITO_CLIENT_ID` | `54h640jfhu7pdfv1032erjc5i6` (or your CDK output) |

The app uses the current origin for redirect/logout, so auth works on any Vercel URL. Cognito is configured via CDK with multiple allowed callback/logout URLs (production + preview).

## 3. Deploy

- Push to your connected branch; Vercel will build and deploy.
- Or trigger a deploy from the Vercel dashboard.

Build uses `npm run build`; output is `dist/`. SPA routing is handled by `vercel.json` rewrites.
