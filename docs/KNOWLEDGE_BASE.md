# Bedrock Knowledge Base for VOXA Voice

The voice agent uses business data from the **system prompt** (identity, persona, booking rules) and from a **Bedrock Knowledge Base** (locations, services, pricing, FAQs) via the `queryKnowledgeBase` tool. Each business can have its own KB.

---

## Per-business KB (automatic)

**When you create or update a business (handle) that has no Knowledge Base yet**, the stack automatically:

1. **Creates** an S3 Vector bucket and index for that handle (e.g. `voxa-kb-{accountId}-{handle}`).
2. **Creates** a Bedrock Knowledge Base backed by that vector store.
3. **Creates** a data source pointing at the shared content bucket with prefix `knowledge/{handle}/`.
4. **Stores** `knowledgeBaseId` and `dataSourceId` on the handle in DynamoDB.
5. **Triggers** the sync Lambda to upload that handle’s document and run ingestion.

So **each business gets its own S3 Vector store and KB**. No manual KB creation in the console is required for the default path. Data is fed in automatically when you save the handle or change branches, services, doctors, locations, or slot config.

---

## What gets synced into the KB

The sync Lambda builds a single document per handle from:

- Handle profile: display name, business name, address, city, phone, **Knowledge summary**, use case.
- Slot config: granularity, buffer.
- Branches (name, location, address, capacity).
- Services (name, duration, price).
- Doctors (name, specialty).
- Locations (name, address).

It uploads to `s3://<KbContentBucketName>/knowledge/<handle>/content.txt` and starts an ingestion job for that handle’s KB and data source.

---

## Voice agent

- The shareable link sends the handle and (when set) `knowledgeBaseId` from the handle profile to the Sonic service.
- If the handle has a KB, the agent can call the **queryKnowledgeBase** tool; Retrieve runs against that handle’s KB only (no cross-tenant data).
- **System prompt** still carries: business type, persona, knowledge summary, and booking rules. **KB** is used for on-demand retrieval when callers ask about services, locations, pricing, etc.

---

## Optional: shared default KB (legacy)

If you prefer a **single shared KB** (e.g. created once in the console) instead of per-business KBs:

1. Create a Knowledge Base in the console with an S3 data source on the **KbContentBucketName** bucket, prefix `knowledge/`, and an S3 Vector store (Quick create).
2. Redeploy with parameters: `KnowledgeBaseId` and `KbDataSourceId`.
3. Handles that do **not** have their own `knowledgeBaseId` will use this default. Sync will use the default KB/data source for those handles, and the voice agent uses a **handle filter** so only that business’s chunks are returned.

When a handle gets its own KB (via the create-knowledge-base Lambda), it will use that instead of the default.

---

## Summary

| Mode | When | Result |
|------|------|--------|
| **Per-business KB** | Handle has no `knowledgeBaseId`; create/update handle | Lambda creates S3 Vector bucket + index, KB, data source; saves IDs on handle; sync runs. |
| **Shared default KB** | Stack params `KnowledgeBaseId` and `KbDataSourceId` set; handle has no own KB | Sync and voice use the shared KB with a handle filter. |
| **Manual override** | You set a KB ID in Dashboard → Settings for a handle | Voice uses that KB; sync is not used for that handle unless it also has a data source. |

- **Prompt**: Who you are and how to behave.
- **KB**: Facts the agent looks up when asked (services, locations, pricing, FAQs). By default, one KB per business, created automatically.
