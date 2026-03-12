# Backend scripts

## purge-data.js

Removes all data from Voxa DynamoDB tables and S3 buckets (and optionally Cognito users) so you can test from a clean state.

**What gets purged:**

- All items in every `VoxaStack-*` DynamoDB table (bookings, customers, conversations, handles, branches, services, etc.)
- All objects in the recordings bucket and the KB content bucket
- **Optional:** all users in the Cognito User Pool (so everyone must sign up again)

**After running:**

1. **If you did not set `COGNITO_USER_POOL_ID`:** Log in as before, then in the app go to **Settings** → **Start fresh** → **Clear onboarding & sign out**. That clears saved onboarding data from the browser and signs you out. Log in again and you’ll be sent to onboarding (no handles left in the backend).
2. **If you set `COGNITO_USER_POOL_ID`:** All Cognito users are deleted; everyone must sign up again and go through onboarding.

**Usage** (from `backend/cdk`):

```bash
cd backend/cdk
node ../scripts/purge-data.js
```

To also delete all Cognito users (full reset, sign-up required again):

```bash
COGNITO_USER_POOL_ID=us-east-1_D05ftfM4y node ../scripts/purge-data.js
```

Get your User Pool ID from the stack output `CognitoUserPoolId` or AWS Console → Cognito → User pools.

Uses `AWS_REGION` / `CDK_DEFAULT_REGION` (default `us-east-1`) and your default AWS credentials. Optional env:

- `TABLE_PREFIX` – default `VoxaStack-`
- `BUCKET_RECORDINGS` – recordings bucket name (from stack output)
- `BUCKET_KB` – knowledge base content bucket name (from stack output)
- `COGNITO_USER_POOL_ID` – if set, all users in this pool are deleted
