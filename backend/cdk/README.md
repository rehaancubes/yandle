# VOXA Backend (CDK)

This backend deploys:

- API Gateway HTTP API (control plane)
- Lambda handlers:
  - `GET /health`
  - `POST /handle`
  - `GET /public/{handle}`
  - `GET /public/{handle}/conversations`
  - `POST /session`
  - `POST /message`
  - `GET /session/{sessionId}/messages`
  - `GET /sonic/config`
  - `POST /sonic/session`
- DynamoDB tables:
  - `ConversationsTable`
  - `HandlesTable`
- Amazon ECS Fargate service for Nova Sonic runtime lane
- ALB endpoint for the Sonic runtime service

## Commands

```bash
npm install
npm run build
npm run synth
npm run deploy
```

`deploy` automatically builds the Lambda layer (aws-sdk) first via `build:layer`. To build only the layer: `npm run build:layer`.

Deploy with a custom ECS image:

```bash
npm run deploy -- --parameters SonicContainerImageUri=<account>.dkr.ecr.<region>.amazonaws.com/<repo>:<tag>
```

Optional Cognito parameters:

```bash
npm run deploy -- \
  --parameters CognitoDomainPrefix=<unique-prefix> \
  --parameters WebCallbackUrls=http://localhost:8080/auth/callback \
  --parameters WebLogoutUrls=http://localhost:8080/
```

## Notes

- CDK deployment does not build Docker images. ECS uses an image URI you provide.
- Default ECS image is `public.ecr.aws/nginx/nginx:stable-alpine` as a placeholder.
- For production Sonic, point `SonicContainerImageUri` to your Nova Sonic gateway image that handles realtime streaming and Bedrock calls.
- Task role includes Bedrock invoke permissions for Nova model calls.
- See `backend/sonic-service` for a starter ECS runtime service package.
- Google/Apple IdP setup is done in Cognito console first, then mapped to Hosted UI.
- Web auth routes included:
  - `/auth`
  - `/auth/callback`
- Protected API routes (JWT required):
  - `POST /handle`
  - `GET /public/{handle}/conversations`
  - `GET /session/{sessionId}/messages`

## Lambda layer

Lambdas use a layer that provides `aws-sdk` (Node 18+ runtimes don’t bundle it). The layer is built from `lambda-layer/nodejs`; `npm run deploy` runs `build:layer` first to install that dependency.

## Troubleshooting

If `GET /public/{handle}` or `POST /handle` returns 500 or "Cannot find module 'aws-sdk'":

1. Build the layer and redeploy: `npm run build:layer && npm run deploy`
2. Verify the handle exists by creating/updating it from onboarding or Dashboard Settings.
