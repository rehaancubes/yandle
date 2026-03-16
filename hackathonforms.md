# Elevator pitch

One platform: your business gets a **phone number**, **website**, **shareable link**, and **mobile app listing**. Customers call, text, or visit—your AI answers and books. 



## Inspiration

I run a gaming cafe myself, and managing bookings, enquiries, and calls across different tools was a real pain. Small businesses everywhere—gaming cafes, salons, clinics, and more—juggle the same thing. We wanted one place where a business gets a real phone number, a website, a shareable link, and a listing in our mobile app—so the owner can focus on running the business while the AI handles first contact, answers questions, and books appointments. We built this for ourselves and for that huge market.

## What it does

Yandle gives every business multiple ways to be reached:

- Phone number — A real number (via SIP trunk) so customers can call and talk to the same AI that powers chat and the web.
- Website — Customizable landing page and gallery (web + mobile).
- Shareable link — One link for the website, AI chat, and voice; can be shared or embedded as a widget on any website.
- Mobile app listing — Businesses appear in the Yandle app’s Discover tab by category and location; users can book or chat from the app.

Across all of these: AI chat (text) and AI voice (real-time) use the same agent with services, pricing, and availability. Bookings are created by the AI; owners manage them in a unified dashboard (list, day, and resource views). 

## How we built it

- **Backend**: AWS CDK for infra; Lambda + API Gateway for REST APIs; DynamoDB for handles, members, bookings, website config, and discovery; Cognito for auth. Handles, website config, and public profile (including theme and phone number) are shared so the dashboard, shareable link, and mobile app stay in sync.

- **Amazon Nova models**: We use three Bedrock models end-to-end. **Nova 2 Sonic** is our speech-to-speech model: it powers real-time voice on the shareable link, in the mobile app, and over the phone (via SIP). Low latency and barge-in so callers can interrupt naturally. **Nova 2 Lite** is our fast, cost-effective reasoning model: it backs text chat (web and mobile) and any non–real-time tool calls (e.g. Converse API) so everyday tasks stay quick and cheap. **Nova multimodal embeddings** index our Bedrock Knowledge Base: business FAQs, hours, and policies are embedded so the agent can retrieve and cite them during voice and chat.

- **Voice pipeline**: A custom Sonic service (Node.js on ECS Fargate) runs Nova 2 Sonic with Bedrock’s bidirectional streaming. Web and mobile connect via Socket.IO; the same session gets a system prompt (business type, services, booking rules) and can call tools (e.g. get availability, create booking). For real phone numbers we use a SIP trunk (Node.js + Asterisk/ARI): inbound calls are transcribed and sent to the same Sonic session so PSTN callers talk to the same AI as on the web or in the app.

- **Web**: React (Vite), TypeScript, Socket.IO for real-time voice on shareable links and embeddable widget. Shareable link and dashboard share the same theme (color) from website config; profile is loaded from the public API so the link always reflects the business.

- **Mobile**: Flutter app for Discover (search by category/location), Bookings, and Profile. In-app voice uses the same Sonic session and Nova 2 Sonic; we play a short “hello” (e.g. just_audio) so the agent speaks first. Admin mode lets owners manage the business (bookings, website, voice/persona) and see business links (phone, website, shareable link).

- **Salesbot**: Outbound calling and lead capture with no credit system for internal use.

## Challenges we ran into

Getting Nova 2 and embeddings production-ready: Initial setup of the Nova 2 models (Sonic, Lite, multimodal embeddings) was hard—getting the right model IDs, IAM, and Bedrock APIs in place took real effort. Getting embeddings to work was especially difficult: wiring Nova multimodal embeddings into the Knowledge Base, ingestion, and retrieval so the agent could actually cite business FAQs and policies required dealing with supplemental storage, sync, and making sure voice and chat both hit the same indexed content. Getting SNS access for phone-number OTP was also a blocker, so we had to use another provider (Firebase) for sending verification codes to users signing in with phone.

*Real-time voice across three surfaces: Delivering the same low-latency, natural voice experience on web (Socket.IO), mobile (Flutter), and PSTN (SIP) meant solving different buffering, codec, etc.

Multi-tenant auth and access control: Owners vs. members (staff) need different permissions on the same handle—bookings, customers, website, voice settings. Getting this right without 403s or data leaks required a clear access model (e.g. assertAccess for handle members) and consistent checks in every API and dashboard path so members can do their job and owners keep full control.



## Accomplishments that we're proud of

- **Real phone number**: SIP trunk so businesses get a real number; callers reach the same agent as on the web or in the app.
- **Early validation**: We got our first few users from our own gaming cafe to use and test the full flow—voice, chat, bookings—and everything held up; that gave us confidence the product works in the real world.
- **Shipping in a week**: Getting the whole thing—backend, voice, web, mobile, phone number, discovery—to a working state in one week felt like a big win.
- **Nova 2 in production**: The Nova 2 models (Sonic, Lite, embeddings) turned out really good for our use case; we're glad we bet on them.

## What we learned

- Real-time voice feels different on browser, app, and phone; small details (barge-in, ringback) matter a lot.
- One backend and one AI can serve web, mobile, and PSTN if we keep session and prompt logic shared and client-specific only where needed (e.g. playback, SIP framing).
- Product clarity helps: fewer tabs and clear entry points (Discover → business → voice/chat/book) made the app easier to explain and use.
- CDK lets you vibe-code the backend; AWS MCP made that super easy. We'll use that combo next time.
- AI-powered coding really lets us pull off miracles in no time.
- AWS (Bedrock) models are great and easy to use.

## What's next for Yandle


- **App Store releases**: Ship the mobile app to the iOS and Android stores so businesses and customers can install it.
- **Growing the user base**: Get many clients on board through different marketing channels and through our **salesbot** (outbound calling and lead capture).
- Add **map view** in Discover so users can see businesses on a map.
- Expand **verticals** (e.g. more business types) and **analytics** for owners (call/chat volume, booking conversion).
- Optional **white-label** or custom domains so businesses can use their own brand and URL.



## Testing instructions (not shown to the public)

**Test login (web dashboard)**  
- Email: `rehaan@mobil80.com`  
- OTP (when prompted): `061628`  
- Use "Sign in with email" → enter the email → request code → enter `061628` to access the dashboard.

**What to try**  
- **Shareable link (voice + chat)**: Visit `https://yandle.io/shareable/m80esports` (or replace `m80esports` with a handle you've set up). Use the mic for real-time voice or the chat tab for text; the AI can answer questions and create bookings.  
- **Dashboard**: After logging in, open the Overview, Bookings, Website, and Profile tabs. Create or edit a booking, change website/theme, and check business links (phone, website, shareable link) in the Profile area.  
- **Mobile app**: Install the Flutter app; use Discover to find a business (e.g. search or category), open a business and try voice/chat/book. Sign in with the test email + OTP above, then switch to Admin mode for a handle you own to manage bookings and website.  
- **Public website**: Visit `https://yandle.io/m80esports` (or your handle) to see the business's public landing page.

---

## Video demo script (~4 min)

**[0:00 – 0:35] Intro and why we built it**

Hi, I’m [name]. I run a gaming cafe, and managing bookings, enquiries, and calls was a mess—different tools, missed calls, double bookings. So I built Yandle: one place where a small business gets a real phone number, a website, a shareable link people can chat or call, and a widget they can embed on their own site. A friend wanted the same for his salon—and in India alone there are 6.6 million salons. The market is huge. AWS Connect isn’t available in India, so I used a SIP trunk to give businesses a real number that rings into the same AI that powers the web and the app.

**[0:35 – 1:10] What each business gets + dashboard tabs**

For every small business, this is the easiest way to go live: you get a phone number, a website, a shareable link where people can chat or talk to your AI, and a widget you can drop on your own website. One AI handles everything. In the dashboard we have Overview, Bookings—list and calendar view—Website to set theme, images, and content, and Profile for voice, persona, and knowledge base. Business links are right there: your number, your website URL, and your shareable link.

**[1:10 – 1:50] Mobile app: users and admins**

We also have a mobile app. Users can discover businesses by category and location, make bookings, and do recurring visits. If you’re the owner, you switch to Admin mode: you see your bookings, update your website theme and images, edit your knowledge base, and manage everything from the phone. Same AI on web, app, and phone.

**[1:50 – 2:25] Demo: normal call**

Let me show you a quick call. [Pick up phone or use shareable link with mic.] I’ll call our demo number. [Call connects.] “Hi, I’d like to book a PC for two hours this evening.” [Let AI respond, maybe confirm a slot.] So that’s a real call—same AI you get on the shareable link and in the app. No separate system for phone.

**[2:25 – 2:55] BMS and salesbot**

In the backend we have a BMS section with basic business details. The main piece is the salesbot: it makes outbound calls to businesses to pitch Yandle. You upload leads, the AI calls them, has a conversation, and classifies the lead—hot, not interested, callback—so we can follow up. All built on the same voice stack.

**[2:55 – 3:35] AWS and Nova**

Everything runs on AWS: S3, Lambda, API Gateway, DynamoDB, Cognito, SES, ECS for the voice service, and Bedrock for the models. For the hackathon we’re using three Nova 2 models: Nova 2 Sonic for real-time speech-to-speech on calls and in the app, Nova 2 Lite for fast text chat and reasoning, and Nova multimodal embeddings for our Knowledge Base so the AI can retrieve and cite each business’s FAQs and policies. That’s the stack.

**[3:35 – 4:00] Wrap**

So: one platform—phone, website, shareable link, widget, and mobile app—one AI, and one place for the owner to manage it. We’re already using it at my gaming cafe and testing with a few more businesses. Thanks for watching.
