/**
 * Bedrock Knowledge Base client for Nova Sonic (from AWS sample pattern).
 * Uses RetrieveCommand to query a Bedrock Knowledge Base and return relevant chunks.
 */
import {
  BedrockAgentRuntimeClient,
  RetrieveCommand,
} from "@aws-sdk/client-bedrock-agent-runtime";

const DEFAULT_NUMBER_OF_RESULTS = 5;

/**
 * @param {Object} options
 * @param {string} options.knowledgeBaseId - Bedrock Knowledge Base ID
 * @param {string} options.query - Natural language query
 * @param {number} [options.numberOfResults=5] - Max results to return
 * @param {string} [options.handle] - When using a shared KB, filter chunks by this handle (metadata)
 * @returns {Promise<Array<{ content: string, metadata: object, score: number }>>}
 */
export async function retrieveFromKnowledgeBase(options) {
  const {
    knowledgeBaseId,
    query,
    numberOfResults = DEFAULT_NUMBER_OF_RESULTS,
    handle,
  } = options;

  if (!knowledgeBaseId || !query || typeof query !== "string") {
    return [];
  }

  const region = process.env.AWS_REGION || process.env.BEDROCK_REGION || "us-east-1";
  const client = new BedrockAgentRuntimeClient({ region });

  const vectorConfig = {
    numberOfResults: Math.min(Math.max(1, numberOfResults), 25),
  };
  if (handle && typeof handle === "string" && handle.trim()) {
    vectorConfig.filter = {
      equals: { key: "handle", value: handle.trim() },
    };
  }

  try {
    const command = new RetrieveCommand({
      knowledgeBaseId,
      retrievalQuery: {
        text: query.trim(),
      },
      retrievalConfiguration: {
        vectorSearchConfiguration: vectorConfig,
      },
    });

    const response = await client.send(command);
    const results = [];

    if (!response.retrievalResults || response.retrievalResults.length === 0) {
      console.log("[bedrock-kb-client] Retrieve returned 0 results for query:", query?.slice(0, 80));
      return results;
    }

    for (const result of response.retrievalResults) {
      const content = result.content?.text || "";
      let source = "Unknown source";
      let location;

      if (result.location?.s3Location) {
        source = result.location.s3Location.uri?.split("/").pop() || "Unknown S3 file";
        location = result.location.s3Location.uri;
      } else if (result.location?.confluenceLocation) {
        source = result.location.confluenceLocation.url || "Unknown Confluence page";
        location = result.location.confluenceLocation.url;
      } else if (result.location?.webLocation) {
        source = "Web source";
        const w = result.location.webLocation;
        location = w?.url || w?.uri;
      }

      const title = result.metadata?.title;
      const excerpt = result.metadata?.excerpt;
      const score = result.score ?? 0;

      results.push({
        content,
        metadata: {
          source,
          location,
          title: typeof title === "string" ? title : "",
          excerpt: typeof excerpt === "string" ? excerpt : "",
        },
        score,
      });
    }

    return results;
  } catch (error) {
    console.error("[bedrock-kb-client] Retrieve error:", error?.message || error);
    throw error;
  }
}

/**
 * Format retrieval results as a single string for the model to use in its response.
 * @param {Array<{ content: string, metadata: object, score: number }>} results
 * @returns {string}
 */
export function formatRetrievalResultsForModel(results) {
  if (!results || results.length === 0) {
    return "No relevant information found in the knowledge base.";
  }
  const parts = results.map((r, i) => {
    const title = r.metadata?.title ? ` (${r.metadata.title})` : "";
    return `[${i + 1}]${title}\n${r.content}`;
  });
  return "Retrieved from knowledge base:\n\n" + parts.join("\n\n---\n\n");
}
