# VOXA Monorepo Starter

This repository bootstraps VOXA as:

- `web`: Vite + React web app
- `backend/cdk`: AWS backend deployed with CDK (no Docker required)

## Architecture

- **Clients** call a backend HTTP API.
- **Backend control plane** uses API Gateway + Lambda + DynamoDB.
- **Realtime voice plane** runs on ECS Fargate for Nova Sonic session handling.
- **CDK** deploys infrastructure in a repeatable way.

Core API routes:

- `GET /health`
- `POST /handle`
- `GET /public/{handle}`
- `GET /public/{handle}/conversations`
- `POST /session`
- `POST /message`
- `GET /session/{sessionId}/messages`
- `GET /sonic/config`
- `POST /sonic/session`

## Why this stack

- Vite + React is fast for product pages + dashboard UX.
- CDK keeps AWS infra as code and versioned.
- Lambda + API Gateway scale globally and avoid server management.

## Repository Layout

```text
.
├── backend/
│   └── cdk/
│       ├── bin/
│       ├── lib/
│       └── lambda/
│   └── sonic-service/
└── web/
```

## Quick Start

### 1) Backend (AWS CDK)

```bash
cd backend/cdk
npm install
npm run build
npm run synth
```

Deploy:

```bash
npm run deploy
```

Deploy with a custom Sonic ECS image:

```bash
npm run deploy -- --parameters SonicContainerImageUri=<account>.dkr.ecr.<region>.amazonaws.com/<repo>:<tag>
```

Notes:

- Requires AWS credentials configured locally.
- This setup uses `lambda.Code.fromAsset(...)` and does not depend on Docker for CDK deployment.
- Sonic runtime is deployed on ECS Fargate using an image URI (no local Docker build required).

### 2) Web (Vite + React)

```bash
cd web
npm install
npm run dev
```

Set your API base URL in the web app after backend deploy:

```bash
cp .env.example .env.local
# then set VITE_API_BASE_URL + Cognito vars in .env.local
```

Auth environment keys (web):

- `VITE_COGNITO_DOMAIN`
- `VITE_COGNITO_CLIENT_ID`
- `VITE_COGNITO_REDIRECT_URI`
- `VITE_COGNITO_LOGOUT_URI`

### 3) Sonic Service (Local Runtime Starter)

```bash
cd backend/sonic-service
npm install
npm run dev
```

### 4) Voice agent & Knowledge Base

Most business content (FAQs, policies, service details) should live in an **Amazon Bedrock Knowledge Base**. The voice agent looks it up when callers ask. In the Dashboard → Settings, set **Bedrock Knowledge Base** to your KB ID after creating one in the Bedrock console (us-east-1). Step-by-step: **[docs/KNOWLEDGE_BASE.md](docs/KNOWLEDGE_BASE.md)**.

### 5) Project status

A detailed list of **what’s done** and **what’s left** (optional or future work) is in **[docs/PROJECT_STATUS.md](docs/PROJECT_STATUS.md)**.
