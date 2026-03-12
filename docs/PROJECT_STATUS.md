# VOXA Project Status: What’s Done & What’s Left

This doc summarizes what is implemented and what remains as optional or future work.

---

## What’s done

### Backend (CDK + Lambda)

- **Handles**
  - `POST /handle`: Create/update business profile (displayName, voiceId, persona, knowledgeSummary, captureEmail, capturePhone, useCaseId, knowledgeBaseId, etc.).
  - `GET /public/{handle}`: Public profile including doctors, locations, services, branches from config tables.
  - `GET /handles`: List handles for the authenticated user (owner).
- **Bookings**
  - `POST /bookings`: Create booking with handle, startTime, name, phone/email (at least one required; capture rules from handle), optional serviceId/branchId/doctorId/locationId/centerName/machineType; duration from service when serviceId given; customer upsert after booking.
  - `GET /bookings`: List bookings for a handle (optional query params for time range / filters).
- **Customers**
  - `GET /customers`: List customers for a handle (from CustomersTable, sorted by lastSeenAt).
- **Business config**
  - `GET /config/slots`, `POST /config/slots`: Slot granularity and buffer-between (per handle, BusinessConfigTable).
- **CRUD by handle**
  - Branches: `GET /branches`, `POST /branches`, `DELETE /branches` (query/body: handle, branchId).
  - Services: `GET /services`, `POST /services`, `DELETE /services` (handle, serviceId; durationMinutes, priceCents, useCaseId).
  - Doctors: `GET /doctors`, `POST /doctors`, `DELETE /doctors` (handle, doctorId; name, specialty).
  - Locations: `GET /locations`, `POST /locations`, `DELETE /locations` (handle, locationId; name, address).
- **Conversations**
  - `GET /public/{handle}/conversations`: Conversations for handle (from ConversationsTable / API).
- **Sonic**
  - `GET /sonic/config`, `POST /sonic/session`: Config and session creation for real-time voice.
- **Knowledge Base (per-business auto-creation + sync)**
  - **CreateKnowledgeBase Lambda**: When a handle has no `knowledgeBaseId`, the stack creates for that handle: an S3 Vector bucket and index, a Bedrock Knowledge Base, and a data source (S3 content bucket, prefix `knowledge/{handle}/`). Saves `knowledgeBaseId` and `dataSourceId` on the handle and triggers sync.
  - **Sync Lambda**: On handle upsert (when handle already has a KB) or branch/service/doctor/location/config save, builds a text document (profile, branches, services, doctors, locations, slot config, knowledgeSummary), uploads to S3 `knowledge/{handle}/content.txt` and metadata, and runs `StartIngestionJob` for that handle’s KB and data source (from DynamoDB). Optional stack params `KnowledgeBaseId` and `KbDataSourceId` provide a shared default for handles that don’t yet have their own KB.
  - Stack: S3 bucket (KbContentBucket), KB service role (Bedrock assume + S3 read + S3 Vectors write), CreateKnowledgeBaseFunction (S3 Vectors + Bedrock CreateKnowledgeBase/CreateDataSource), SyncKnowledgeFunction; KbContentBucketName output. See docs/KNOWLEDGE_BASE.md.

### DynamoDB tables

- HandlesTable, BookingsTable, CustomersTable (with HandleLastSeenIndex), BusinessConfigTable, BranchesTable, ServicesTable (with HandleUseCaseIndex), DoctorsTable, LocationsTable, ConversationsTable, CallersTable, PhoneNumbersTable, plus any existing tables for discovery/auth.

### Sonic service (ECS + Docker)

- Nova Sonic bidirectional streaming; Socket.IO for web client.
- **Tools**: createBooking, getBookingsForTimeRange (with optional branchId, doctorId, locationId, centerName, machineType); queryKnowledgeBase (Bedrock Retrieve with optional handle filter).
- Handle + optional knowledgeBaseId passed from client; createBooking/getBookings use DynamoDB; queryKnowledgeBase uses the handle’s KB (one KB per business when auto-created) or shared default with handle filter when used.
- Customer upsert after createBooking from Sonic.
- Deployed as Fargate service; image in ECR; ALB URL in stack outputs.

### Web (Vite + React)

- **Dashboard** (authenticated): Overview, Bookings, Customers, Conversations, Settings.
  - Settings: display name, voice, persona, knowledge summary, contact capture (email/phone toggles), slot granularity & buffer, optional Knowledge Base ID (default or override), use-case-specific views (salon: branches/services; clinic: doctors/locations/services).
  - Data for bookings, customers, conversations, slot config, branches, services, doctors, locations loaded from API.
- **Shareable link** (`/link/:handle`): Public page; loads profile via `GET /public/{handle}`; builds use-case-specific system prompt (salon/clinic/gaming) and injects structured offerings (doctors, locations, services, branches); sends knowledgeBaseId and handle to Sonic; voice UI with start/stop and real-time audio.
- Auth: Cognito (JWT); env vars for API URL and Cognito (see web/VERCEL.md).

### Voice agent behavior

- Use-case identity in system prompt (e.g. “This business is a SALON …” so the agent doesn’t offer other types).
- Structured offerings (branches, services, doctors, locations) in prompt for listing and booking.
- Booking tools used for availability check and create; contact rules (captureEmail/capturePhone) enforced in both API and Sonic.
- When knowledgeBaseId is set (from profile or default): queryKnowledgeBase tool available; Retrieve uses handle filter when using shared KB; instruction in prompt to use KB for policies/FAQs/details.

### Deployment

- **Backend**: CDK deploy (Lambda layer, all Lambdas, API Gateway, DynamoDB, ECS task definition, etc.). Optional params: SonicContainerImageUri, KnowledgeBaseId, KbDataSourceId, Cognito and web URLs.
- **Sonic**: Docker image built and pushed to ECR; ECS service uses that image; force-new-deployment used to roll new image.
- **Web**: Vercel (e.g. `npm run deploy:prod` from web/); production URL and env vars documented in web/VERCEL.md.

### Documentation

- **docs/KNOWLEDGE_BASE.md**: Auto-sync flow, one-time KB creation (S3 bucket + prefix `knowledge/`), stack parameters, optional manual KB override.
- **README.md**: Quick start, repo layout, voice & KB pointer.
- **web/VERCEL.md**: Env vars and deploy steps for Vercel.

---

## What’s left (optional / future)

### Knowledge Base (optional shared default)

- **Per-business KB is auto-created** when a handle has no `knowledgeBaseId`: CreateKnowledgeBase Lambda creates an S3 Vector bucket + index, Bedrock KB, and data source, then sync runs. No console step required for that path.
- **Optional**: If you want a single shared KB instead (legacy), create it once in the console with an S3 data source on `KbContentBucketName` (prefix `knowledge/`), then pass **KnowledgeBaseId** and **KbDataSourceId** as stack parameters. Handles without their own KB will use this default; sync and voice use a handle filter.

### Mobile app (voxa_mobile)

- **Current**: Flutter app present (`voxa_mobile/`); not wired to the same API or voice.
- **Left**: Point app at same API base URL and auth (e.g. Cognito); reuse same handle/profile and booking flows; if voice is desired, connect to Sonic WebSocket URL and reuse same auth/session shape as web.

### Salon capacity

- **Done**: Branches have a `capacity` field and it’s stored/displayed.
- **Left**: Enforce capacity in booking/availability logic (e.g. when creating a booking or checking availability, count existing bookings for that branch/slot and reject or limit when at capacity).

### Slot and buffer enforcement

- **Done**: Slot granularity and buffer-between are stored in BusinessConfigTable and editable in dashboard.
- **Left**: Validate in `POST /bookings` and in Sonic createBooking that `startTime` aligns to the configured slot grid and that buffer between appointments is respected (e.g. reject or suggest another time).

### Discovery and auth

- **Done**: Discovery and Cognito-based auth exist; dashboard and protected routes use JWT.
- **Left**: Any extra discovery filters, public listing pages, or social login (e.g. Google/Apple) are configured in Cognito and documented as needed.

### Observability and ops

- **Done**: Basic CloudWatch for Lambda; ECS service and ALB; stack outputs.
- **Left**: Alarms on Sonic health, logging levels, tracing (e.g. X-Ray), or runbooks for KB sync failures or ECS rollbacks.

### Per-handle Knowledge Base override

- **Done**: Dashboard can set an optional Knowledge base ID per handle; profile returns it and ShareableLink sends it to Sonic; Sonic uses it for queryKnowledgeBase (no handle filter when using a dedicated KB).
- **Left**: No code change; just usage and docs (see KNOWLEDGE_BASE.md).

### Cost and quotas

- **Left**: Monitor Bedrock (Nova Sonic, Retrieve), DynamoDB, ECS, and S3; set budgets or alerts; document any service quotas (e.g. Bedrock KB ingestion).

### UI/UX polish

- **Done**: Dashboard tabs, forms, and shareable link voice UI are functional.
- **Left**: Loading/error states, empty states, accessibility, or responsive tweaks as needed.

---

## Quick reference

| Area              | Status | Notes |
|-------------------|--------|--------|
| Handles CRUD      | Done   | POST /handle, GET public, list mine |
| Bookings          | Done   | Create with validation; customer upsert |
| Customers         | Done   | Table + GET /customers |
| Config (slots)    | Done   | GET/POST /config/slots |
| Branches/Services/Doctors/Locations | Done | CRUD + trigger KB sync |
| KB integration    | Done   | Sync Lambda, S3, voice tool, handle filter; KB/DS created in console, IDs in stack params |
| Voice (Sonic)     | Done   | Booking + KB tools; handle filter for shared KB |
| Dashboard         | Done   | All tabs and settings described above |
| Shareable link    | Done   | Profile, prompt, voice, KB ID/handle |
| Deploy (CDK/Sonic/Web) | Done | Documented and used |
| Mobile app        | Left   | Wire to API + optional voice |
| Salon capacity    | Left   | Enforce in booking/availability |
| Slot/buffer rules | Left   | Validate startTime in API and Sonic |
| KB resource (console) | Left   | One-time: create KB + data source in Bedrock console, then set params |
| Observability     | Left   | Optional alarms, tracing, runbooks |

---

*Last updated to reflect implementation through auto-sync Knowledge Base, dashboard, Sonic tools, and deployment.*
