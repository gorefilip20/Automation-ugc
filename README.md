# Automation UGC

A studio that writes, voices, edits and renders short-form videos, and turns long livestreams into ready-to-post clips.

## What it makes

| Feature | Where | What you get |
| --- | --- | --- |
| UGC ads | Video studio → UGC ad | A creator-style ad in one of 10 styles (testimonial, unboxing, GRWM…) with a talking AI presenter or a voiceover, product cut-ins, captions and a CTA card. |
| Product launch videos | Video studio → Product launch | Title reveal, feature scenes, CTA "available now" card, in brand colours. |
| Any video from a prompt | Video studio → Anything | Describe the video; it is scripted and rendered. |
| Stream clipping (pump.fun, Twitch, podcasts) | Stream clipper | Upload a recording or paste a link. The best moments are found, reframed to 9:16, captioned word by word and titled with a hook. |
| Scripts and campaigns | Video studio → Script only, Campaigns | Scripts, captions, hashtags and posting schedules. |
| AI creator portraits | Dashboard avatar studio | Portrait variations of your fictional creator (real images when `OPENAI_API_KEY` is set). |

Every output is an H.264/AAC MP4 (9:16, 1:1 or 16:9) that you can download from the page and post on TikTok, Reels, Shorts, X or YouTube.

## How it works

```
brief ──► Claude writes a scene plan ──► visuals (your photos, AI images, or brand cards)
                                    └──► voice (ElevenLabs/OpenAI TTS) or talking avatar (HeyGen/D-ID)
                                                     └──► ffmpeg: Ken Burns motion, PiP presenter,
                                                          burned-in captions, music ducking ──► MP4

stream ──► download (upload / .mp4 / .m3u8 / yt-dlp) ──► Whisper transcript
       ──► Claude picks moments (or loudness peaks) ──► cut, reframe, caption, hook banner ──► MP4 clips
```

Rendering runs on the server in a queue, with progress shown live in the UI. Renders interrupted by a restart are picked up again automatically.

## Setup

```bash
npm install          # also installs a bundled ffmpeg binary
cp .env.example .env # add whichever keys you have
npm run dev          # http://localhost:5173 (API on :3001)
```

Production: `npm run build && npm start` (serves the app and API on `PORT`, default 3001).

### Keys and what they unlock

Nothing is required: without keys the studio still renders videos using template scripts, your uploaded photos or branded text cards, captions and music. Each key upgrades one part:

| Key | Unlocks |
| --- | --- |
| `ANTHROPIC_API_KEY` | Claude writes every script (and sees your product photos), and picks the clip moments from stream transcripts. |
| `ELEVENLABS_API_KEY` or `OPENAI_API_KEY` | Voiceovers. |
| `OPENAI_API_KEY` | AI scene images, AI presenter portraits, stream transcription (word-timed captions). |
| `HEYGEN_API_KEY` + `HEYGEN_VOICE_ID`, or `DID_API_KEY` | Talking AI creator on camera, lip-synced to the script. |
| `yt-dlp` on the server | Clipping from YouTube/Twitch/Kick/X page links (direct `.mp4`/`.m3u8` links and uploads always work). |

The studio's "Engines" panel shows which of these are active.

### Pump.fun streams

Pump.fun livestreams are easiest to clip from a recording: screen-record the stream (or download the replay) and upload it on the Stream clipper page. If you have the stream's `.m3u8` URL you can paste it directly. Put the coin, ticker and anything notable into "Context for the AI" so the picked moments and hooks match the stream.

## Responsible use

* An "#ad" / "AI-generated creator" label is burned in by default. Paid promotions need a disclosure on every major platform, and AI presenters should be labelled as AI.
* Uploading someone's photo as a presenter requires confirming you have their permission. Stock placeholder portraits are never animated.
* Clip captions and hooks are written to describe what happened, never to promise gains or tell viewers to buy a token.
* Only clip streams you have the right to repost.

## Project layout

```
server/services/ai-writer.ts       Claude scene plans (template fallback)
server/services/providers.ts       TTS, image generation, HeyGen / D-ID talking avatars
server/services/video-renderer.ts  ffmpeg compositor (scenes, captions, audio mix)
server/services/video-jobs.ts      render pipeline for studio videos
server/services/clipper.ts         stream download, transcription, moment picking, clip cutting
server/services/job-queue.ts       in-process render queue
server/routers/video.ts, clips.ts  tRPC APIs;  POST /api/upload streams large files to disk
client/src/pages/UGCStudio.tsx     video studio
client/src/pages/Clipper.tsx       stream clipper
```

Generated media lives in `data/media` (served at `/media`); the SQLite database is `data/ugc.db`. Set `DATA_DIR` to move both.
