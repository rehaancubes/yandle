# Deploying Voxa with Nova Sonic (ECS)

Reference: [AWS sample-sonic-cdk-agent](https://github.com/aws-samples/sample-sonic-cdk-agent) — same pattern: ECS backend for Nova Sonic, us-east-1.

## One-time: build and push Sonic image to ECR

From repo root:

```bash
cd backend/sonic-service
docker build -t voxa-sonic-service .
aws ecr get-login-password --region us-east-1 | docker login --username AWS --password-stdin 235494787608.dkr.ecr.us-east-1.amazonaws.com
docker tag voxa-sonic-service:latest 235494787608.dkr.ecr.us-east-1.amazonaws.com/voxa-sonic-service:latest
docker push 235494787608.dkr.ecr.us-east-1.amazonaws.com/voxa-sonic-service:latest
```

## Deploy stack (default Sonic image)

Default image is already the ECR URI above. From repo root:

```bash
cd backend/cdk
npm run build:layer
npx cdk deploy VoxaStack --require-approval never
```

Or with explicit Sonic image parameter:

```bash
npx cdk deploy VoxaStack --require-approval never \
  --parameters SonicContainerImageUri=235494787608.dkr.ecr.us-east-1.amazonaws.com/voxa-sonic-service:latest
```

**Parameter name is `SonicContainerImageUri`** (not `SonicServiceImage`).

## After deploy

- **SonicServiceUrl** is in stack outputs; shareable link uses it for real-time voice.
- Ensure Nova Sonic is enabled in Bedrock (us-east-1).
