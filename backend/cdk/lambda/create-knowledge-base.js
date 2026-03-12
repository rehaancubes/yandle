/**
 * Creates a dedicated Bedrock Knowledge Base (and S3 Vector bucket + index) for a handle.
 * Invoked when a business is created/updated and has no knowledgeBaseId.
 * Updates the handle with knowledgeBaseId and dataSourceId, then triggers sync.
 */
const AWS = require("aws-sdk");
const {
  BedrockAgentClient,
  CreateKnowledgeBaseCommand,
  CreateDataSourceCommand,
  ListDataSourcesCommand,
  ListKnowledgeBasesCommand,
} = require("@aws-sdk/client-bedrock-agent");
const {
  S3VectorsClient,
  CreateVectorBucketCommand,
  CreateIndexCommand,
  DeleteIndexCommand,
  DeleteVectorBucketCommand,
} = require("@aws-sdk/client-s3vectors");

const ddb = new AWS.DynamoDB.DocumentClient();
const lambda = new AWS.Lambda();

const HANDLES_TABLE = process.env.HANDLES_TABLE;
const KB_CONTENT_BUCKET = process.env.KB_CONTENT_BUCKET;
const KB_CONTENT_BUCKET_ARN = process.env.KB_CONTENT_BUCKET_ARN;
const KB_ROLE_ARN = process.env.KB_ROLE_ARN;
const EMBEDDING_MODEL_ARN = process.env.EMBEDDING_MODEL_ARN || "arn:aws:bedrock:us-east-1::foundation-model/amazon.nova-2-multimodal-embeddings-v1:0";
const EMBEDDING_DIMENSION = parseInt(process.env.EMBEDDING_DIMENSION || "3072", 10);
const SYNC_KNOWLEDGE_FUNCTION_ARN = process.env.SYNC_KNOWLEDGE_FUNCTION_ARN;
const AWS_ACCOUNT_ID = process.env.AWS_ACCOUNT_ID;
const AWS_REGION = process.env.AWS_REGION || process.env.BEDROCK_REGION || "us-east-1";

const VECTOR_BUCKET_PREFIX = "voxa-kb";
const INDEX_NAME = "default";

function normalizeHandle(raw) {
  return String(raw || "")
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "")
    .replace(/^-+|-+$/g, "");
}

/**
 * S3 Vector bucket names: alphanumeric and hyphens; max 63 chars.
 * Use voxa-kb-{accountId}-{handle} and truncate handle if needed.
 */
function vectorBucketName(handle) {
  const accountId = AWS_ACCOUNT_ID || "000000000000";
  const maxHandleLen = 63 - VECTOR_BUCKET_PREFIX.length - 1 - accountId.length - 1;
  const safeHandle = handle.length > maxHandleLen ? handle.slice(0, maxHandleLen) : handle;
  return `${VECTOR_BUCKET_PREFIX}-${accountId}-${safeHandle}`;
}

exports.handler = async (event) => {
  const handle = normalizeHandle(event.handle || event.pathParameters?.handle);
  if (!handle) {
    return { statusCode: 400, body: JSON.stringify({ error: "handle is required" }) };
  }
  if (!HANDLES_TABLE || !KB_CONTENT_BUCKET || !KB_ROLE_ARN) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: "Server misconfigured: HANDLES_TABLE, KB_CONTENT_BUCKET, KB_ROLE_ARN required" }),
    };
  }

  const accountId = AWS_ACCOUNT_ID || "000000000000";
  const bucketName = vectorBucketName(handle);
  const region = AWS_REGION;

  try {
    const existing = await ddb.get({ TableName: HANDLES_TABLE, Key: { handle } }).promise();
    if (existing.Item?.knowledgeBaseId && existing.Item?.dataSourceId) {
      if (SYNC_KNOWLEDGE_FUNCTION_ARN) {
        await lambda.invoke({
          FunctionName: SYNC_KNOWLEDGE_FUNCTION_ARN,
          InvocationType: "Event",
          Payload: JSON.stringify({ handle }),
        }).promise().catch((e) => console.error("[create-knowledge-base] sync invoke", e));
      }
      return {
        statusCode: 200,
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ok: true, handle, message: "Handle already has KB; sync triggered." }),
      };
    }

    // Repair: KB exists but dataSourceId missing (e.g. lost from DB) – create or look up data source
    if (existing.Item?.knowledgeBaseId && !existing.Item?.dataSourceId) {
      const bedrock = new BedrockAgentClient({ region });
      const knowledgeBaseId = existing.Item.knowledgeBaseId;
      const expectedName = `voxa-ds-${handle}`.slice(0, 100);
      let dataSourceId;

      try {
        const contentBucketArn = KB_CONTENT_BUCKET_ARN || `arn:aws:s3:::${KB_CONTENT_BUCKET}`;
        const createDs = await bedrock.send(
          new CreateDataSourceCommand({
            knowledgeBaseId,
            name: expectedName,
            description: `Data source for ${handle}`,
            dataSourceConfiguration: {
              type: "S3",
              s3Configuration: {
                bucketArn: contentBucketArn,
                inclusionPrefixes: [`knowledge/${handle}/`],
              },
            },
          })
        );
        dataSourceId = createDs.dataSource?.dataSourceId;
      } catch (e) {
        if (e.name === "ConflictException" && /already exists/i.test(e.message || "")) {
          const listRes = await bedrock.send(new ListDataSourcesCommand({ knowledgeBaseId }));
          const ds = (listRes.dataSourceSummaries || []).find(
            (s) => s.name === expectedName || (s.name && s.name.startsWith("voxa-ds-"))
          ) || (listRes.dataSourceSummaries || [])[0];
          dataSourceId = ds?.dataSourceId;
        }
        if (!dataSourceId) throw e;
      }

      if (!dataSourceId) throw new Error("Could not get dataSourceId");
      await ddb
        .update({
          TableName: HANDLES_TABLE,
          Key: { handle },
          UpdateExpression: "SET dataSourceId = :ds, updatedAt = :now",
          ExpressionAttributeValues: { ":ds": dataSourceId, ":now": new Date().toISOString() },
        })
        .promise();
      if (SYNC_KNOWLEDGE_FUNCTION_ARN) {
        await lambda
          .invoke({
            FunctionName: SYNC_KNOWLEDGE_FUNCTION_ARN,
            InvocationType: "Event",
            Payload: JSON.stringify({ handle }),
          })
          .promise()
          .catch((e) => console.error("[create-knowledge-base] sync invoke", e));
      }
      return {
        statusCode: 200,
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          ok: true,
          handle,
          knowledgeBaseId,
          dataSourceId,
          message: "Data source linked and sync triggered.",
        }),
      };
    }

    const s3v = new S3VectorsClient({ region });
    const bedrock = new BedrockAgentClient({ region });

    // 1. Create S3 Vector bucket (idempotent: ignore if exists)
    try {
      await s3v.send(
        new CreateVectorBucketCommand({
          vectorBucketName: bucketName,
        })
      );
    } catch (e) {
      if (e.name !== "ConflictException" && e.name !== "ResourceAlreadyExistsException") {
        throw e;
      }
    }

    // 2. Create vector index (idempotent: ignore if exists)
    const vectorBucketArn = `arn:aws:s3vectors:${region}:${accountId}:bucket/${bucketName}`;
    try {
      await s3v.send(
        new CreateIndexCommand({
          vectorBucketName: bucketName,
          indexName: INDEX_NAME,
          dataType: "float32",
          dimension: EMBEDDING_DIMENSION,
          distanceMetric: "cosine",
        })
      );
    } catch (e) {
      if (e.name !== "ConflictException" && e.name !== "ResourceAlreadyExistsException") {
        throw e;
      }
    }

    const indexArn = `arn:aws:s3vectors:${region}:${accountId}:bucket/${bucketName}/index/${INDEX_NAME}`;

    // Wait for vector index to propagate before creating KB
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    await sleep(5000);

    // 3. Create Knowledge Base (idempotent: recover if already exists from a partial previous run)
    // Nova Multimodal Embeddings requires a supplementalDataStorageConfiguration so
    // Bedrock has an S3 location to store extracted image/media data from documents.
    const kbName = `voxa-${handle}`.slice(0, 100);
    const supplementalPrefix = `s3://${KB_CONTENT_BUCKET}/`;
    let knowledgeBaseId;

    // Retry KB creation up to 3 times (S3Vectors index may need time to propagate)
    let kbAttempt = 0;
    const MAX_KB_ATTEMPTS = 3;
    while (true) {
      kbAttempt++;
    try {
      const createKb = await bedrock.send(
        new CreateKnowledgeBaseCommand({
          name: kbName,
          description: `Knowledge base for business ${handle}`,
          roleArn: KB_ROLE_ARN,
          knowledgeBaseConfiguration: {
            type: "VECTOR",
            vectorKnowledgeBaseConfiguration: {
              embeddingModelArn: EMBEDDING_MODEL_ARN,
              supplementalDataStorageConfiguration: {
                storageLocations: [
                  {
                    type: "S3",
                    s3Location: { uri: supplementalPrefix },
                  },
                ],
              },
            },
          },
          storageConfiguration: {
            type: "S3_VECTORS",
            s3VectorsConfiguration: {
              vectorBucketArn,
              indexArn,
              // Do not pass indexName when providing indexArn (API returns ValidationException).
            },
          },
        })
      );
      knowledgeBaseId = createKb.knowledgeBase?.knowledgeBaseId;
      if (!knowledgeBaseId) throw new Error("CreateKnowledgeBase did not return knowledgeBaseId");
    } catch (e) {
      if (e.name === "ConflictException") {
        // KB already exists from a partial previous attempt — look it up by name and recover.
        console.warn("[create-knowledge-base] KB already exists, recovering by name:", kbName);
        let nextToken;
        let found;
        do {
          const listRes = await bedrock.send(new ListKnowledgeBasesCommand({ nextToken }));
          found = (listRes.knowledgeBaseSummaries || []).find((kb) => kb.name === kbName);
          nextToken = listRes.nextToken;
        } while (!found && nextToken);
        if (!found?.knowledgeBaseId) throw new Error(`KB conflict but could not find existing KB by name: ${kbName}`);
        knowledgeBaseId = found.knowledgeBaseId;
      } else if (e.name === "ValidationException" && kbAttempt < MAX_KB_ATTEMPTS) {
        // S3Vectors index/bucket may be in a bad state — nuke and recreate from scratch
        console.warn(`[create-knowledge-base] ValidationException on attempt ${kbAttempt}/${MAX_KB_ATTEMPTS}, nuking vector bucket+index...`, e.message);
        try {
          await s3v.send(new DeleteIndexCommand({ vectorBucketName: bucketName, indexName: INDEX_NAME }));
          console.log("[create-knowledge-base] Deleted vector index");
        } catch (delErr) {
          console.warn("[create-knowledge-base] Could not delete index:", delErr.message);
        }
        await sleep(2000);
        try {
          await s3v.send(new DeleteVectorBucketCommand({ vectorBucketName: bucketName }));
          console.log("[create-knowledge-base] Deleted vector bucket");
        } catch (delErr) {
          console.warn("[create-knowledge-base] Could not delete bucket:", delErr.message);
        }
        await sleep(5000);
        // Recreate bucket
        try {
          await s3v.send(new CreateVectorBucketCommand({ vectorBucketName: bucketName }));
          console.log("[create-knowledge-base] Recreated vector bucket");
        } catch (reErr) {
          if (reErr.name !== "ConflictException" && reErr.name !== "ResourceAlreadyExistsException") {
            console.warn("[create-knowledge-base] Could not recreate bucket:", reErr.message);
          }
        }
        await sleep(3000);
        // Recreate index
        try {
          await s3v.send(new CreateIndexCommand({
            vectorBucketName: bucketName,
            indexName: INDEX_NAME,
            dataType: "float32",
            dimension: EMBEDDING_DIMENSION,
            distanceMetric: "cosine",
          }));
          console.log("[create-knowledge-base] Recreated vector index");
        } catch (reErr) {
          if (reErr.name !== "ConflictException" && reErr.name !== "ResourceAlreadyExistsException") {
            console.warn("[create-knowledge-base] Could not recreate index:", reErr.message);
          }
        }
        await sleep(15000);
        continue;
      } else {
        throw e;
      }
    }
    break; // Success or conflict-recovered — exit retry loop
    } // end while(true) retry loop

    // 4. Create Data Source (idempotent: recover if already exists)
    const contentBucketArn = KB_CONTENT_BUCKET_ARN || `arn:aws:s3:::${KB_CONTENT_BUCKET}`;
    const dsName = `voxa-ds-${handle}`.slice(0, 100);
    let dataSourceId;
    try {
      const createDs = await bedrock.send(
        new CreateDataSourceCommand({
          knowledgeBaseId,
          name: dsName,
          description: `Data source for ${handle}`,
          dataSourceConfiguration: {
            type: "S3",
            s3Configuration: {
              bucketArn: contentBucketArn,
              inclusionPrefixes: [`knowledge/${handle}/`],
            },
          },
        })
      );
      dataSourceId = createDs.dataSource?.dataSourceId;
      if (!dataSourceId) throw new Error("CreateDataSource did not return dataSourceId");
    } catch (e) {
      if (e.name !== "ConflictException") throw e;
      console.warn("[create-knowledge-base] DataSource already exists, recovering by name:", dsName);
      const listRes = await bedrock.send(new ListDataSourcesCommand({ knowledgeBaseId }));
      const ds = (listRes.dataSourceSummaries || []).find((s) => s.name === dsName) || (listRes.dataSourceSummaries || [])[0];
      dataSourceId = ds?.dataSourceId;
      if (!dataSourceId) throw new Error(`DataSource conflict but could not find existing data source for KB: ${knowledgeBaseId}`);
    }

    // 5. Update handle with knowledgeBaseId and dataSourceId
    await ddb
      .update({
        TableName: HANDLES_TABLE,
        Key: { handle },
        UpdateExpression: "SET knowledgeBaseId = :kb, dataSourceId = :ds, updatedAt = :now",
        ExpressionAttributeValues: {
          ":kb": knowledgeBaseId,
          ":ds": dataSourceId,
          ":now": new Date().toISOString(),
        },
      })
      .promise();

    // 6. Trigger sync (upload content and start ingestion)
    if (SYNC_KNOWLEDGE_FUNCTION_ARN) {
      await lambda
        .invoke({
          FunctionName: SYNC_KNOWLEDGE_FUNCTION_ARN,
          InvocationType: "Event",
          Payload: JSON.stringify({ handle }),
        })
        .promise()
        .catch((e) => console.error("[create-knowledge-base] sync invoke error", e));
    }

    return {
      statusCode: 200,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        ok: true,
        handle,
        knowledgeBaseId,
        dataSourceId,
        message: "Knowledge base created and sync triggered.",
      }),
    };
  } catch (err) {
    console.error("[create-knowledge-base]", handle, err);
    return {
      statusCode: 500,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        error: "Failed to create knowledge base",
        details: err.message,
      }),
    };
  }
};
