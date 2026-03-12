# How to get WSS (secure WebSocket) for Sonic

By default, the Sonic ECS service is behind an **HTTP** ALB. The web app connects with **ws://**. On HTTPS sites (e.g. Vercel), browsers often block mixed content (HTTPS page + ws://), so you need **wss://**.

Socket.IO uses the same scheme as the page: **https** → **wss**, **http** → **ws**. So to get wss you must expose Sonic over **HTTPS** and tell the app to use that URL.

---

## When your domain is in another AWS account (handoff)

If someone else manages the domain (e.g. in another AWS account), you can send them the details below. **You do not need to change ECS or the Sonic service itself**—only the way clients reach it (HTTPS in front of your ALB).

### Your side: stack details and how to get the ALB URL

From the Voxa CDK app:

| Item | Value |
|------|--------|
| **Stack name** | `VoxaStack` |
| **Default region** | `us-east-1` (from `backend/cdk/bin/voxa.ts` unless you set `CDK_DEFAULT_REGION`) |
| **CDK output key for Sonic** | `SonicServiceUrl` |

**Current stack outputs (from last run):**

| Output | Value |
|--------|--------|
| SonicServiceUrl | `http://VoxaSt-Sonic-a8Cj5DESB3F1-812253045.us-east-1.elb.amazonaws.com` |
| ALB DNS name | `VoxaSt-Sonic-a8Cj5DESB3F1-812253045.us-east-1.elb.amazonaws.com` |
| ApiBaseUrl | `https://6kbd4veax6.execute-api.us-east-1.amazonaws.com` |
| CognitoUserPoolId | `us-east-1_D05ftfM4y` |
| CognitoUserPoolClientId | `54h640jfhu7pdfv1032erjc5i6` |
| CognitoHostedUiDomain | `https://voxa-auth-dev.auth.us-east-1.amazoncognito.com` |
| RecordingsBucketName | `voxastack-voxarecordingsbucketbcce1140-0nfpodn0lup5` |
| KbContentBucketName | `voxastack-voxakbcontentbucket4e4638e8-ajclwvedqmlq` |

**Get the Sonic ALB URL (run in your project, with AWS CLI configured for the account that has the stack):**

```bash
cd backend/cdk
aws cloudformation describe-stacks --stack-name VoxaStack --query "Stacks[0].Outputs[?OutputKey=='SonicServiceUrl'].OutputValue" --output text
```

That prints the Sonic URL; the **ALB DNS name** is the hostname only (strip `http://`).

**Optional – get all stack outputs:**

```bash
aws cloudformation describe-stacks --stack-name VoxaStack --query "Stacks[0].Outputs" --output table
```

**In the AWS Console:** EC2 → Load balancers → select the load balancer for the Sonic ECS service → copy **DNS name**.

---

### What to send the domain owner

**Current values (from your deployed stack).** Copy the block below and send as-is; it already contains your ALB details.

```text
VOXA SONIC – details for HTTPS / WSS setup
==========================================

1) Sonic backend (our side – already running)
   - ALB URL (HTTP):   http://VoxaSt-Sonic-a8Cj5DESB3F1-812253045.us-east-1.elb.amazonaws.com
   - ALB DNS name:     VoxaSt-Sonic-a8Cj5DESB3F1-812253045.us-east-1.elb.amazonaws.com
   - AWS Region:       us-east-1

2) What we need from you
   - A public HTTPS URL for Sonic, e.g. https://sonic.yourdomain.com
   - That URL must forward to the ALB above (HTTP to the ALB is fine; users will use HTTPS to your domain).
   - WebSocket support: the endpoint must support long-lived WebSocket connections (Socket.IO). No special config on our side.

3) Recommended (easiest for cross-account): CloudFront in your account
   - Create a CloudFront distribution in your account (us-east-1).
   - Origin: VoxaSt-Sonic-a8Cj5DESB3F1-812253045.us-east-1.elb.amazonaws.com (HTTP, no cert on ALB needed).
   - Viewer: Redirect HTTP to HTTPS, custom domain + ACM cert for e.g. sonic.yourdomain.com.
   - Cache: disable caching (or disable for path /socket.io/*).
   - Allowed methods: GET, HEAD, OPTIONS, PUT, POST, PATCH, DELETE (needed for Socket.IO).
   - DNS: point sonic.yourdomain.com (or your chosen subdomain) to the CloudFront distribution.
   - Then tell us the final URL (e.g. https://sonic.yourdomain.com).

4) Alternative: we add HTTPS on our ALB (Option A in the doc)
   - We request an ACM cert in our account for sonic.yourdomain.com and send you the DNS validation CNAME.
   - You add that CNAME in your DNS so the cert can be issued.
   - We add an HTTPS:443 listener on the Sonic ALB and attach the cert.
   - You add a CNAME: sonic.yourdomain.com → VoxaSt-Sonic-a8Cj5DESB3F1-812253045.us-east-1.elb.amazonaws.com
   - Then we deploy our app with that URL.
```

To refresh these values later, run: `aws cloudformation describe-stacks --stack-name VoxaStack --query "Stacks[0].Outputs[?OutputKey=='SonicServiceUrl'].OutputValue" --output text` (strip `http://` for the ALB DNS name).

### What you (Voxa account) do

| If they use… | Your steps |
|--------------|------------|
| **CloudFront (recommended)** | **Nothing on ECS or ALB.** When they give you the final URL (e.g. `https://sonic.yourdomain.com`), run: `cd backend/cdk && npx cdk deploy --parameters SonicServicePublicUrl=https://sonic.yourdomain.com` |
| **HTTPS on your ALB (Option A)** | 1) In your account: ACM → request certificate for `sonic.yourdomain.com` → DNS validation. 2) Send them the validation CNAME record to add. 3) After cert is issued: EC2 → Load balancers → Sonic ALB → Add listener (HTTPS:443, same target group, attach cert). 4) Ask them to CNAME `sonic.yourdomain.com` → your ALB DNS name. 5) Deploy: `npx cdk deploy --parameters SonicServicePublicUrl=https://sonic.yourdomain.com` |

No ECS task definition or Sonic service code changes are required. The Sonic app keeps listening on HTTP behind the ALB; only the external entry point becomes HTTPS (via CloudFront or ALB listener).

---

## Overview

| Step | What you do |
|------|-------------|
| 1 | Expose Sonic over HTTPS (choose **Option A** or **Option B** below). |
| 2 | Deploy CDK with the public HTTPS URL so the API returns it to clients. |
| 3 | Clients then connect with **wss://** automatically. |

---

## Option A: Custom domain + HTTPS on the ALB

Use this if you have a domain (e.g. `voxa.example.com`) and can add a subdomain for Sonic (e.g. `sonic.voxa.example.com`).

### 1. Create a certificate in ACM

1. In **AWS Certificate Manager** (same region as your ALB), request a **public** certificate.
2. Domain: `sonic.yourdomain.com` (or any subdomain you control).
3. Use DNS validation and add the CNAME records to your DNS.
4. Wait until the certificate status is **Issued**.

### 2. Add an HTTPS listener to the Sonic ALB

1. In **EC2 → Load Balancers**, open the ALB used by the Sonic ECS service (the one whose DNS name is in your CDK output **SonicServiceUrl**).
2. **Listeners** tab → **Add listener**.
3. **Protocol**: HTTPS, **Port**: 443.
4. **Default action**: Forward to the same target group the existing HTTP listener uses (the Sonic ECS target group).
5. **Security policy**: ELBSecurityPolicy-TLS13-1-2-2021-06 (or your preferred policy).
6. **Certificate**: Select the ACM certificate you created (e.g. for `sonic.yourdomain.com`).
7. Save.

### 3. Point DNS to the ALB

1. In **Route 53** (or your DNS provider), create a **CNAME** (or alias):
   - Name: `sonic` (so full host is `sonic.yourdomain.com`).
   - Value: the ALB DNS name (e.g. `VoxaSt-Sonic-xxxxx.us-east-1.elb.amazonaws.com`).

### 4. Deploy CDK with the public Sonic URL

```bash
cd backend/cdk
npx cdk deploy --parameters SonicServicePublicUrl=https://sonic.yourdomain.com
```

After deploy, `GET /sonic/config` returns `sonicServiceUrl: "https://sonic.yourdomain.com"`. The web app (and SIP trunk) use that URL; Socket.IO will use **wss://** on that host.

---

## Option B: CloudFront in front of the ALB

Use this if you don’t want to attach a certificate to the ALB directly, or you already use CloudFront.

### 1. Create a certificate in ACM (us-east-1 for CloudFront)

1. In **AWS Certificate Manager**, switch region to **us-east-1** (required for CloudFront).
2. Request a **public** certificate for `sonic.yourdomain.com` (or a domain you’ll use for the distribution).
3. Validate via DNS and wait until **Issued**.

### 2. Create a CloudFront distribution

1. **CloudFront** → **Create distribution**.
2. **Origin**:
   - Origin domain: your Sonic ALB DNS (e.g. `VoxaSt-Sonic-xxxxx.us-east-1.elb.amazonaws.com`).
   - Protocol: **HTTP only** (CloudFront talks to ALB over HTTP; the user gets HTTPS).
   - No custom header required unless your ALB requires it.
3. **Default cache behavior**:
   - Viewer protocol policy: **Redirect HTTP to HTTPS**.
   - Allowed methods: GET, HEAD, OPTIONS, **and** PUT, POST, PATCH, DELETE (needed for Socket.IO).
   - Cache policy: **CachingDisabled** (or a custom policy that disables caching for `/socket.io/`).
4. **Settings**:
   - Alternate domain names (CNAMEs): `sonic.yourdomain.com`.
   - Custom SSL certificate: select the ACM cert from step 1.
5. Create the distribution.

### 3. Point DNS to CloudFront

1. In Route 53 (or your DNS provider), create a **CNAME** (or alias to the CloudFront distribution):
   - Name: `sonic` (so full host is `sonic.yourdomain.com`).
   - Value: the CloudFront domain (e.g. `d1234abcd.cloudfront.net`).

### 4. Deploy CDK with the CloudFront URL

```bash
cd backend/cdk
npx cdk deploy --parameters SonicServicePublicUrl=https://sonic.yourdomain.com
```

Your app will connect to `https://sonic.yourdomain.com`; Socket.IO will use **wss://** on that host.

---

## After you have HTTPS

- **Web app**: No code change. It calls `GET /sonic/config` and uses `sonicServiceUrl`; if that’s `https://...`, Socket.IO uses **wss**.
- **SIP trunk**: Point `SONIC_SERVICE_URL` (or the hardcoded URL in `sonicClient.js`) to your **HTTPS** Sonic URL (e.g. `https://sonic.yourdomain.com`). The client will use **wss** on that host.

---

## Checklist

- [ ] Certificate in ACM (for your Sonic hostname), validated.
- [ ] Sonic reachable over HTTPS (ALB listener **or** CloudFront).
- [ ] DNS: hostname (e.g. `sonic.yourdomain.com`) → ALB or CloudFront.
- [ ] CDK deployed with `SonicServicePublicUrl=https://sonic.yourdomain.com`.
- [ ] Test: open shareable link, start voice; in DevTools → Network, confirm WebSocket request uses **wss://**.
