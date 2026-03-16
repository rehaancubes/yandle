# Voxa SIP Trunk

Bridges your PBX/CTI to the Voxa Sonic service: HTTP call metadata + TCP audio stream → Socket.IO → Nova Sonic.

## Setup

```bash
cd "Sip trunk"
npm install
```

## Config (env)

| Variable | Description |
|----------|-------------|
| `API_BASE_URL` | Voxa API base (e.g. `https://xxx.execute-api.us-east-1.amazonaws.com`) for resolve-did |
| `SONIC_URL` / `SONIC_SERVICE_URL` | Voxa Sonic base URL (Socket.IO) |
| `SONIC_REGION` | AWS region for Sonic (default `us-east-1`) |
| `YANDLE_DEFAULT_HANDLE` / `VOXA_DEFAULT_HANDLE` | Handle used when DID is unknown (default `m80esports`). **Must exist** in the backend or profile fetch will 404. |
| `DID_MAP` / `VOXA_DID_MAP` | JSON: DID → handle, e.g. `{"918035229486":"my-handle"}`. Checked before API; use if the DID isn’t assigned in the dashboard. |
| `VOXA_SIP_SYSTEM_PROMPT` | Optional system prompt for SIP calls |
| `BEDROCK_KNOWLEDGE_BASE_ID` | Optional; passed to Sonic for RAG |

## Run

```bash
# Example: map DID 918035229470 to handle m80esports (stops "Unknown DID" and uses that profile for Sonic)
DID_MAP='{"918035229470":"m80esports"}' node transcriber.js

# Or with default handle for unknown DIDs (no DID_MAP needed, but all calls use the same profile):
VOXA_DEFAULT_HANDLE=m80esports node transcriber.js

# Or both: map specific DIDs and fallback for the rest
DID_MAP='{"918035229470":"m80esports"}' VOXA_DEFAULT_HANDLE=m80esports npm start
```

- **HTTP 3000**: `GET /call-start?did=&caller=&uniqueid=&direction=` — call start from your CTI.
- **TCP 5000**: First packet = UUID (bytes 3–19 as hex); rest = audio. Audio is sent to Sonic as base64 PCM 16 kHz 16-bit mono. If your PBX sends 8 kHz μ-law, add conversion before forwarding.

## Files

- `transcriber.js` — Express + TCP server; ties call metadata to UUID and starts Sonic.
- `sonicClient.js` — Socket.IO client for Voxa Sonic (initializeConnection → promptStart → systemPrompt → audioStart → audioInput).
- `db.js` — `getOrgByDid(did)` → `{ handle }` from `DID_MAP` (or extend for API lookup).
- `sonic.js` — Legacy raw WebSocket client (other project); not used by Voxa (Voxa uses Socket.IO).
