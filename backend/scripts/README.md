# Backend scripts

## purge-data.js

Removes all Voxa data for fresh testing: DynamoDB tables, S3 buckets, and Cognito users (except preserved emails).

**What gets purged:**

- All items in every `VoxaStack-*` DynamoDB table (bookings, customers, conversations, handles, branches, services, etc.)
- All objects in the recordings bucket and the KB content bucket
- All Cognito users in the pool, **except** emails listed in `COGNITO_PRESERVE_EMAIL` (default: `rehaan@mobil80.com` for BMS login)

**Usage** (from `backend/cdk`):

```bash
cd backend/cdk
node ../scripts/purge-data.js
```

This purges **everything** (tables + S3 + Cognito). The BMS login `rehaan@mobil80.com` is never deleted. After running, use **Settings → Start fresh** in the app to clear local onboarding state; then sign in again (with the preserved account or a new sign-up).

**Optional env:**

- `TABLE_PREFIX` – default `VoxaStack-`
- `BUCKET_RECORDINGS` – recordings bucket name (from stack output)
- `BUCKET_KB` – knowledge base content bucket name (from stack output)
- `COGNITO_USER_POOL_ID` – User Pool to purge (default: `us-east-1_D05ftfM4y`). Set to empty to **skip** Cognito purge.
- `COGNITO_PRESERVE_EMAIL` – comma-separated emails to keep (default: `rehaan@mobil80.com`)
