# VOXA Sonic Service (ECS Runtime)

Real-time voice using **Amazon Nova Sonic** via Socket.IO and Bedrock `InvokeModelWithBidirectionalStream`.

## Endpoints

- `GET /health` – health check
- `GET /session/start` – legacy; use Socket.IO for voice
- **Socket.IO** (path `/socket.io/`) – Nova Sonic real-time voice

## Socket.IO protocol (Nova Sonic)

1. **initializeConnection** (payload, callback) – create session; callback `{ success, error }`
2. **promptStart** `{ voiceId, outputSampleRate: 24000 }`
3. **systemPrompt** `{ content, voiceId? }`
4. **audioStart** – start bidirectional stream; server emits **audioReady**
5. **audioInput** – base64 16 kHz mono 16-bit PCM chunks
6. Server emits **audioOutput** `{ content: base64 }` – 24 kHz mono 16-bit PCM
7. **stopAudio** – graceful shutdown; server emits **sessionClosed**

Audio: input 16 kHz LPCM, output 24 kHz LPCM (voiceId e.g. `tiffany`).

## Local run

```bash
cd backend/sonic-service
npm install
npm run dev
```

Uses `AWS_REGION` / `BEDROCK_REGION` (default `us-east-1`). Ensure the account has access to `amazon.nova-2-sonic-v1:0` in that region.

## Deploy to ECS

**Right now ECS is likely running a placeholder (e.g. nginx).** You must build and push this Node.js service, then redeploy the stack.

### 1. Build the image

From repo root:

```bash
docker build -t voxa-sonic-service ./backend/sonic-service
```

### 2. Push to ECR

Create an ECR repo (if needed) and push:

```bash
# Replace ACCOUNT and REGION with your AWS account ID and region (e.g. us-east-1)
aws ecr get-login-password --region REGION | docker login --username AWS --password-stdin ACCOUNT.dkr.ecr.REGION.amazonaws.com
aws ecr create-repository --repository-name voxa-sonic-service --region REGION 2>/dev/null || true
docker tag voxa-sonic-service:latest ACCOUNT.dkr.ecr.REGION.amazonaws.com/voxa-sonic-service:latest
docker push ACCOUNT.dkr.ecr.REGION.amazonaws.com/voxa-sonic-service:latest
```

### 3. Deploy CDK with the new image

From `backend/cdk`:

```bash
npm run deploy -- --parameters SonicContainerImageUri=ACCOUNT.dkr.ecr.REGION.amazonaws.com/voxa-sonic-service:latest
```

After deploy, the ALB will route to the new task. Health checks use `GET /health` (the Node app returns JSON there). Web clients discover the URL via `GET /sonic/config` and connect with Socket.IO.
