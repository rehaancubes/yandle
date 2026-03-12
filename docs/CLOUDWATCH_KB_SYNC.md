# CloudWatch: Knowledge Base sync troubleshooting

When **Sync now** or **Save & sync to voice** shows "Sync failed" or "No KB configured", check these logs.

## Where to look (AWS Console → CloudWatch → Log groups)

| Log group | When to check |
|-----------|----------------|
| `/aws/lambda/VoxaStack-KnowledgeTriggerSyncFunction*` | You clicked "Sync now" or "Save & sync to voice". Shows whether the handle has a KB and what the sync/create-KB step returned. |
| `/aws/lambda/VoxaStack-SyncKnowledgeFunction*` | Sync ran. Look for `[sync-knowledge] No KB configured` (missing IDs) or `[sync-knowledge] Error` (S3/Bedrock failure). |
| `/aws/lambda/VoxaStack-CreateKnowledgeBaseFunction*` | KB was created for the handle. Check here if "Knowledge base creation failed" or S3 Vectors/Bedrock errors. |

## What the logs mean

### "No knowledge base configured for this handle; skip sync."

- **SyncKnowledgeFunction** logs: `[sync-knowledge] No KB configured for handle: <handle> profile.knowledgeBaseId: (missing) ...`
- **Cause:** The handle in DynamoDB has no `knowledgeBaseId` / `dataSourceId`, and the stack has no default KB parameters.
- **Fix:** Use **Sync now** again; the trigger-sync API will call **CreateKnowledgeBaseFunction** first when no KB exists, then sync. If creation fails, check **CreateKnowledgeBaseFunction** logs (permissions, S3 Vectors, Bedrock limits).

### Sync fails with an error (S3, Bedrock, etc.)

- **SyncKnowledgeFunction** logs: `[sync-knowledge] Error handle: ... error: ... name: ... code: ...`
- **Cause:** Usually S3 `PutObject` or Bedrock `StartIngestionJob` (permissions, quota, or invalid KB/data source).
- **Fix:** Confirm the handle has valid `knowledgeBaseId` and `dataSourceId` (from create-knowledge-base or Settings). Confirm the Lambda role can write to the KB content bucket and start ingestion jobs.

### "Knowledge base creation failed"

- **KnowledgeTriggerSyncFunction** logs: `[knowledge-trigger-sync] create-knowledge-base failed: ...`
- **CreateKnowledgeBaseFunction** logs: Full stack trace and error (e.g. S3 Vectors, Bedrock API).
- **Fix:** Check CreateKnowledgeBaseFunction logs for the exact error (e.g. `ConflictException` for existing resources, IAM, or service limits).

## Quick checks

1. **Sync trigger:** In **KnowledgeTriggerSyncFunction** logs, confirm: `Invoking sync for handle: <your-handle> handle has knowledgeBaseId: true`.
2. **Sync success:** In **SyncKnowledgeFunction** logs, look for: `[sync-knowledge] Success handle: <your-handle> ingestionJobId: ...`.
3. **No KB:** If you see `handle has knowledgeBaseId: false`, the next run should trigger create-knowledge-base; if creation fails, use **CreateKnowledgeBaseFunction** logs.

## Region

Use the same region as your stack (e.g. **us-east-1**). Log group names may have a suffix (e.g. `VoxaStack-KnowledgeTriggerSyncFunction0B6F7D30-xxx`); use the prefix above and pick the latest log stream.
