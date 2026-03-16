# Where to add hello.mp3 (agent speaks first)

Add a short MP3 file named **hello.mp3** (e.g. a voice saying "Hello") so the agent always speaks first on every voice call. Place the file in these locations:

| Place | Path | Notes |
|-------|------|--------|
| **Web (ShareableLink + Embed + Onboarding)** | `web/public/hello.mp3` | Served at `/hello.mp3`; used when users start voice on the shareable link, embedded widget, or onboarding. |
| **Mobile app** | `voxa_mobile/assets/hello.mp3` | Flutter asset; used when users tap "Start voice" on a business. Declared in `pubspec.yaml`. |
| **SIP trunk (phone calls)** | `Sip trunk/hello.raw` | **Not** the MP3. Generate from your hello.mp3: `ffmpeg -i hello.mp3 -f s16le -ar 24000 -ac 1 hello.raw` and put `hello.raw` in the `Sip trunk` folder. Optional: you can also keep `hello.mp3` there for reference; the code loads `hello.raw` only. |

After adding the files, (re)build or restart as needed (web: rebuild; mobile: rebuild; SIP trunk: restart the transcriber process).
