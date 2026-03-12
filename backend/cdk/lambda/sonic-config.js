exports.handler = async () => {
  const base = process.env.SONIC_SERVICE_URL || "";
  const wsBase = base.replace(/^https:/, "wss:").replace(/^http:/, "ws:");
  return {
    statusCode: 200,
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      sonicServiceUrl: base,
      sonicWebsocketUrl: `${wsBase}/ws`,
      modelId: process.env.SONIC_MODEL_ID || "amazon.nova-2-sonic-v1:0",
      region: process.env.AWS_REGION || "us-east-1",
      notes: "Point your realtime voice client to the Sonic ECS service URL."
    })
  };
};
