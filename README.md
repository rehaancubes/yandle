# Voxa — AI Voice Agent for Every Small Business

> **"I built Voxa because I was drowning in phone calls at my gaming cafe."**

[![Built with Amazon Nova](https://img.shields.io/badge/Built%20with-Amazon%20Nova-orange)](#amazon-nova-integration)
[![Voice AI](https://img.shields.io/badge/Voice%20AI-Nova%20Sonic-blue)](#voice-agent)
[![Agentic AI](https://img.shields.io/badge/Agentic%20AI-Tool%20Use-green)](#agentic-tool-use)

---

## The Story

I run a gaming cafe in Bangalore. Every day, I'd get 30+ calls — "Do you have a PC free at 5pm?", "Can I book 3 machines for Saturday?", "What games do you have?" I couldn't pick up every call. I'd miss bookings. I'd double-book machines. I was tracking everything in my head or on sticky notes.

Then people started asking: *"Do you have a website?"* I'd point them to a static page with our address and hours. No booking. No availability. No way to actually **do** anything.

I thought — what if there was an AI that could just... pick up the phone for me? Know my machines, my availability, my prices. Book customers in. Answer questions. 24/7.

So I built **Voxa**.

But here's what happened next — a salon owner friend saw it and said, *"I need this for appointments."* Then a clinic asked, *"Can it handle doctor schedules?"* A retail shop wanted it for product inquiries. The problem wasn't unique to gaming cafes. **Every small business owner is overwhelmed by calls they can't answer and bookings they can't track.**

Voxa is now a platform that gives any small business an AI voice agent powered by **Amazon Nova Sonic** — one that actually understands the business, checks real-time availability, books appointments, and answers customer questions. No more missed calls. No more double bookings. No more sticky notes.

---

## What Voxa Does

**Voxa gives every small business an AI receptionist that picks up the phone, answers questions, and books appointments — powered by Amazon Nova.**

A business owner signs up, goes through a guided onboarding (salon? clinic? gaming cafe? retail shop?), feeds in their services/branches/doctors/machines, and instantly gets:

1. **An AI Voice Agent** (Amazon Nova Sonic) that handles phone calls and web calls
2. **A Shareable Booking Page** customers can visit to talk to the AI or book directly
3. **A Full Dashboard** to manage bookings, customers, conversations, knowledge base, and more
4. **A Mobile App** (Flutter) for on-the-go business management + customer discovery
5. **SIP Trunk Integration** so the AI agent answers real phone calls via their existing business number

---

## Amazon Nova Integration

### Nova Sonic — Real-Time Voice Agent
The core of Voxa is **Amazon Nova Sonic** (`amazon.nova-2-sonic-v1:0`), a speech-to-speech model running on **ECS Fargate**. It powers bidirectional, real-time voice conversations between customers and the AI agent.

- Customers call the business phone number → SIP trunk routes to Voxa → Nova Sonic picks up
- Customers visit the shareable link → browser mic connects via WebSocket → Nova Sonic responds
- The agent speaks naturally, understands context, and uses tools to take real actions

### Nova Lite — Text Chat Agent
For the text chat interface (web + mobile), **Amazon Nova Lite** handles fast, cost-effective conversations via the Bedrock Converse API with full tool use.

### Bedrock Knowledge Bases — Per-Business RAG
Each business gets its own **Amazon Bedrock Knowledge Base** with an S3-backed vector store. Business data (services, pricing, hours, policies, FAQs) is automatically synced into the KB. The voice agent queries it in real-time to answer customer questions accurately.

- Auto-created per business during onboarding
- Synced whenever business data changes (services, branches, doctors, etc.)
- Supports file uploads (PDFs, docs) and image ingestion (via **Amazon Textract** OCR)

### Agentic Tool Use
The Nova agents aren't just chatbots — they're **agentic**. During a conversation, they autonomously invoke tools to:

| Tool | What It Does |
|------|-------------|
| `create_booking` | Books an appointment after collecting customer details, checking capacity |
| `get_bookings_for_time_range` | Checks real-time availability before confirming a slot |
| `query_knowledge_base` | Retrieves business-specific info (prices, policies, FAQs) from Bedrock KB |

The agent collects the right info based on business type — for a **gaming cafe** it asks about machine type and hours; for a **clinic** it asks for the doctor and reason for visit; for a **salon** it asks about the branch and service.

---

## Architecture

```
                    ┌─────────────────────────────────────────────┐
                    │              CUSTOMERS                       │
                    │   Phone Call  │  Web/Mobile  │  Embed Widget │
                    └──────┬────────┴──────┬───────┴───────┬───────┘
                           │               │               │
                    ┌──────▼──────┐  ┌─────▼─────┐  ┌──────▼──────┐
                    │  SIP Trunk  │  │  Socket.IO │  │  REST API   │
                    │  (Asterisk) │  │  WebSocket │  │  (HTTPS)    │
                    └──────┬──────┘  └─────┬──────┘  └──────┬──────┘
                           │               │               │
                    ┌──────▼───────────────▼───────────────▼──────┐
                    │         AWS Cloud Infrastructure             │
                    │                                              │
                    │  ┌────────────────────────────────────────┐  │
                    │  │  ECS Fargate — Sonic Voice Service     │  │
                    │  │  Amazon Nova Sonic (Speech-to-Speech)  │  │
                    │  │  + Tool Use (Book / Query KB / Check)  │  │
                    │  └──────────────────┬─────────────────────┘  │
                    │                     │                         │
                    │  ┌──────────────────▼─────────────────────┐  │
                    │  │  API Gateway (HTTP API) + Lambda (39)  │  │
                    │  │  Bookings │ Knowledge │ Voice │ Config │  │
                    │  └──────────────────┬─────────────────────┘  │
                    │                     │                         │
                    │  ┌──────────────────▼─────────────────────┐  │
                    │  │  DynamoDB (18 tables)                  │  │
                    │  │  Handles │ Bookings │ Services │ etc.  │  │
                    │  └────────────────────────────────────────┘  │
                    │                                              │
                    │  ┌──────────────┐  ┌──────────────────────┐  │
                    │  │  Bedrock KB  │  │  S3 (Recordings,     │  │
                    │  │  (per-biz    │  │   KB Content,        │  │
                    │  │   RAG store) │  │   Website Assets)    │  │
                    │  └──────────────┘  └──────────────────────┘  │
                    │                                              │
                    │  ┌──────────────┐  ┌──────────────────────┐  │
                    │  │  Cognito     │  │  CloudWatch          │  │
                    │  │  (Auth)      │  │  (Alarms + Logs)     │  │
                    │  └──────────────┘  └──────────────────────┘  │
                    └──────────────────────────────────────────────┘
```

---

## Features — Everything Voxa Does

### For Business Owners (Dashboard)

| Feature | Description |
|---------|-------------|
| **Onboarding Wizard** | 4-step guided setup — pick business type (gaming cafe, salon, clinic, retail shop), add services/branches/doctors/machines, configure the AI persona |
| **Bookings Management** | View, create, cancel bookings. Capacity checking per branch/doctor/machine. Slot granularity + buffer config |
| **Customer Directory** | Auto-populated from bookings and conversations. Track last seen, contact info |
| **Conversations & Recordings** | Full transcript of every AI conversation. MP3 recording playback of voice calls (mixed stereo) |
| **Knowledge Base** | Upload PDFs, images (OCR via Textract), documents. Auto-syncs business data. Preview what the AI knows |
| **Voice Configuration** | Choose from 12 voice personas (Tiffany, Matthew, Amy, Arjun, Lupe, Carlos, etc.). Write custom system prompts. Toggle phone/email capture |
| **Embed Widget** | Generate a `<script>` tag to embed the AI agent on any website. Theme configurator included |
| **Website Builder** | Customizable public business website with hero section, features, testimonials, color themes (indigo, emerald, rose, amber, cyan, violet) |
| **Phone Numbers (DIDs)** | Assign dedicated phone numbers. Incoming calls auto-routed to the AI via SIP trunk |
| **Credits System** | Per-business call credit balance. Track usage and top up |
| **Team Members** | Invite team members by email. Owner-only access control |
| **Clinic Token Queue** | Real-time patient queue with token states: CALLED, DONE, NO_SHOW |

### For Customers

| Feature | Description |
|---------|-------------|
| **Shareable Booking Page** | Visit a link, talk to the AI (voice or text), book appointments |
| **Mobile App Discovery** | GPS-based business search. Browse nearby businesses by type |
| **My Bookings** | View, cancel, and rebook appointments from the mobile app |
| **Voice Calls** | Call the business and get an AI that actually knows the business, checks availability, and books you in |

### For Admins (BMS — Business Management System)

| Feature | Description |
|---------|-------------|
| **Super Admin Dashboard** | Overview of all businesses, phone numbers, payments, credits |
| **Revenue Tracking** | Aggregate payment history across all businesses |
| **Phone Inventory** | Manage DID pool — assign/release numbers |

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| **Voice AI** | Amazon Nova Sonic (speech-to-speech, ECS Fargate) |
| **Text AI** | Amazon Nova Lite (Bedrock Converse API) |
| **Knowledge** | Amazon Bedrock Knowledge Bases + S3 Vectors |
| **OCR** | Amazon Textract (image → KB ingestion) |
| **Infrastructure** | AWS CDK v2 (TypeScript), 1,380 lines of IaC |
| **Compute** | 39 Lambda functions (Node.js 20.x) + ECS Fargate |
| **API** | API Gateway v2 (HTTP API), JWT auth |
| **Database** | DynamoDB (18 tables, multiple GSIs) |
| **Storage** | S3 (3 buckets — KB content, recordings, website assets) |
| **Auth** | Amazon Cognito (direct REST, no Amplify) |
| **Monitoring** | CloudWatch Alarms (Lambda errors, ECS health) |
| **Web Frontend** | React 18 + Vite + TypeScript + Tailwind + Shadcn/UI |
| **Mobile** | Flutter (Dart) + Material 3 |
| **Real-time** | Socket.IO (WebSocket) |
| **Telephony** | SIP Trunk integration (Asterisk → Voxa → Nova Sonic) |

---

## Repository Structure

```
voxa/
├── backend/
│   ├── cdk/
│   │   ├── lib/voxa-stack.ts          # Full infrastructure (1,380 lines)
│   │   └── lambda/                     # 39 Lambda functions
│   │       ├── handle-upsert.js        # Create/update business
│   │       ├── bookings.js             # Booking CRUD + capacity check
│   │       ├── create-knowledge-base.js # Auto-create per-biz KB
│   │       ├── sync-knowledge.js       # Sync business data → KB
│   │       ├── message.js              # AI chat (Nova Lite + tools)
│   │       ├── session.js              # Chat session management
│   │       ├── phone-entry.js          # Incoming call routing
│   │       ├── bms.js                  # Super admin dashboard
│   │       └── ...                     # 30+ more functions
│   └── sonic-service/
│       └── src/
│           ├── server.js               # Express + Socket.IO server
│           ├── nova-sonic-client.js     # Nova Sonic streaming + tools
│           ├── bedrock-kb-client.js     # RAG retrieval
│           └── audio-recorder.js        # Call recording (MP3)
├── web/
│   └── src/
│       ├── pages/
│       │   ├── Dashboard.tsx           # Full admin dashboard (11 tabs)
│       │   ├── Onboarding.tsx          # Multi-step business setup
│       │   ├── ShareableLink.tsx       # Public AI booking page
│       │   ├── BusinessWebsite.tsx     # Customizable business site
│       │   ├── BMS.tsx                 # Super admin panel
│       │   └── Auth.tsx                # Cognito auth flows
│       ├── components/                 # Shadcn/UI + custom components
│       └── lib/
│           ├── auth.ts                 # Cognito direct REST
│           └── onboarding-data.ts      # Business type definitions
├── voxa_mobile/
│   └── lib/
│       ├── main.dart                   # App entry (Material 3 dark theme)
│       ├── splash_screen.dart          # Auth gate
│       ├── voxa_shell.dart             # Bottom nav shell
│       ├── services/auth_service.dart  # Cognito auth service
│       ├── voice/nova_voice_client.dart # Real-time voice client
│       └── pages/
│           ├── discover_page.dart      # GPS business search
│           ├── bookings_page.dart      # My bookings
│           ├── calls_page.dart         # Voice call launcher
│           ├── business_detail_page.dart # Business profile + booking
│           ├── admin_page.dart         # Business admin (token queue)
│           └── ...                     # 8 more pages
└── Sip trunk/
    ├── transcriber.js                  # SIP → Sonic bridge server
    └── sonicClient.js                  # Socket.IO Sonic client
```

---

## How It Works — End to End

### 1. Business Onboarding
Owner signs up → picks business type → adds services, branches, doctors, or machines → Voxa auto-creates a Bedrock Knowledge Base, syncs all business data, and the AI agent is ready.

### 2. Customer Calls the Business
Phone rings → SIP trunk intercepts → routes to Voxa's Sonic service → Nova Sonic picks up → *"Hi, welcome to M80 Esports! How can I help you today?"*

Customer: *"Do you have a PC available at 5pm today?"*

Nova Sonic → invokes `get_bookings_for_time_range` tool → checks DynamoDB → *"Yes, we have 3 PCs available at 5pm. Would you like to book one?"*

Customer: *"Yes, book for 2 hours under Rehaan"*

Nova Sonic → invokes `create_booking` tool → writes to DynamoDB → *"Done! You're booked from 5pm to 7pm. See you then!"*

### 3. Customer Visits the Website
Customer opens the shareable link → sees the business profile → clicks the mic button → speaks to Nova Sonic in the browser → books an appointment through voice or text chat.

### 4. Owner Manages Everything
Dashboard shows today's bookings, recent conversations with full transcripts and MP3 recordings, customer list, and knowledge base status. Mobile app lets them manage on the go. Clinic owners get a live token queue.

---

## Business Types Supported

| Type | What the AI Manages |
|------|-------------------|
| **Gaming Cafe** | Machine inventory (PC, PS5, VR, etc.), hourly slots, center capacity |
| **Salon** | Multiple branches, services (haircut, facial, etc.), appointment slots with branch capacity |
| **Clinic** | Doctors (with specialties), appointment booking per doctor, token queue (CALLED/DONE/NO_SHOW) |
| **Retail Shop** | Product catalog, customer inquiries, general business Q&A |

---

## Quick Start

### Backend (AWS CDK)
```bash
cd backend/cdk
npm install
npm run build
npm run deploy -- --parameters SonicContainerImageUri=<ECR_IMAGE_URI>
```

### Web (React + Vite)
```bash
cd web
npm install
cp .env.example .env.local
# Set VITE_API_BASE_URL, VITE_COGNITO_CLIENT_ID, etc.
npm run dev
```

### Mobile (Flutter)
```bash
cd voxa_mobile
flutter pub get
flutter run
```

### Sonic Service (Docker)
```bash
cd backend/sonic-service
docker build -t voxa-sonic-service .
# Push to ECR, deploy via CDK
```

---

## Demo

**Live Demo**: [voxa.website](https://voxa.website)

**Try it**: Visit any business's shareable link, click the mic, and talk to the AI. Ask about availability, services, or book an appointment — the AI handles it all in real-time using Amazon Nova Sonic.

---

## What's Next

- Multi-language support (Nova Sonic supports 12 voices across English, Hindi, Spanish, French, German)
- Payment integration for booking deposits
- Analytics dashboard with call volume trends
- WhatsApp Business API integration
- Multi-tenant SaaS with Stripe billing

---

## The Impact

Every small business deserves an AI receptionist. The salon around the corner misses 40% of calls because the stylist is with a client. The clinic receptionist is overwhelmed during rush hour. The gaming cafe owner is too busy setting up tournaments to answer the phone.

Voxa turns every missed call into a booked customer. It's not about replacing humans — it's about making sure no customer ever hears a busy tone again.

---

**Built with Amazon Nova** | **#AmazonNova**
