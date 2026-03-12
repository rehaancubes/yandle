
function startSonicStream(uuid) {

  const ws = new WebSocket(
    "wss://VoxaSt-Sonic-a8Cj5DESB3F1-812253045.us-east-1.elb.amazonaws.com/ws"
  );

  ws.on("open", () => {
    console.log(`✅ Sonic WebSocket connected | CALL=${uuid}`);
  });

  ws.on("message", (data) => {
    console.log(`📩 Sonic response | CALL=${uuid}`);
  });

  ws.on("close", () => {
    console.log(`🔌 Sonic WebSocket closed | CALL=${uuid}`);
  });

  ws.on("error", (err) => {
    console.log(`❌ Sonic error | CALL=${uuid} | ${err.message}`);
  });

  return {

    sendAudio: (audio) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(audio);
      }
    },

    close: () => {
      ws.close();
    }

  };
}

module.exports = { startSonicStream };
