# Student Acquisition Engine — product film

A two-minute English product film about the Casa Grande student acquisition engine:
the GitHub Pages portal, the AI admissions officer (Retell phone line), the Admissions
CRM, SEO Analysis and the Content Engine. Screen scenes are real Playwright recordings
of the platform running locally with fictitious applicants. Motion graphics, titles and
diagrams are HTML + GSAP rendered frame by frame. The voiceover is Kokoro (`af_heart`).
The soundtrack is composed procedurally and scored to the edit.

## Pipeline

| Step | Script | Output (in `build/`) |
| --- | --- | --- |
| 1. Local stack with fictitious data | `server/index.mjs`, `scripts/build-gh-pages.mjs`, `seed-demo.mjs` | local SQLite database |
| 2. Screen recordings | `capture.mjs` | `clips/*.webm` |
| 3. Voiceover | `narrate.py` | `narration/*.wav`, `narration.json` |
| 4. Picture | `render.mjs` (+ `index.html`, `demo.js`, `demo.css`) | `product-demo.mp4`, `timeline.json` |
| 5. Music | `music.py` | `music.wav` |
| 6. Mix and mux | `mix.py` | `product-demo-final.mp4` |

Scene lengths follow the narration: `render.mjs` passes `narration.json` to the page,
and each scene stretches to fit its line. Recordings play at 0.8× to 1.3× to match.
`music.py` reads `timeline.json`, so builds, risers and impacts land on the cuts, and
`mix.py` ducks the music under the voice.

## Run it

```sh
# 1. Local stack (never record production: the Admin shows every lead it holds)
DB=/tmp/ucg-demo.sqlite
RETELL_API_KEY=local-demo-key RETELL_INBOUND_NUMBER=+19124915544 RETELL_INBOUND_AGENT_ID=agent_local_demo \
  SQLITE_PATH=$DB PORT=3000 node server/index.mjs &
CASAGRANDE_API_URL=http://localhost:3000 node scripts/build-gh-pages.mjs
python3 -m http.server 8080 -d dist-pages &
node demo/product-demo/seed-demo.mjs

# 2–6. Film
cd demo/product-demo
node capture.mjs                     # portal catalog form crm lead seo content
python3 -m venv .venv && .venv/bin/pip install kokoro-onnx soundfile huggingface_hub numpy scipy
.venv/bin/python narrate.py
node render.mjs                      # node render.mjs --still 12,60 for quick checks
.venv/bin/python music.py
.venv/bin/python mix.py              # build/product-demo-final.mp4
```

`seed-demo.mjs` only runs against `localhost`. It sends signed Retell `call_analyzed`
webhooks (as `tests/retell-lead-recap.test.mjs` does) and two web-form leads, then
moves some applicants through the pipeline. Record `form` before `crm`, because the CRM
scene moves the applicant the form creates.

## Where to change things

- Narration: `narration/lines.json` (one line per scene id).
- Scenes, captions, stat cards and order: the `plan` array in `demo.js`.
- Interactions: `scenarios` in `capture.mjs`.
- Music: tempo, chords and section energy at the top of `music.py`; mix levels in `mix.py`.

## What the film claims, and where it comes from

- 34 programs, 7 areas, 15 open for enrollment: the catalog and the live portal stats.
- AI admissions officer in Ecuadorian Spanish that spells back the email, reads back the
  phone and captures 17 post-call fields: `scripts/configure-retell.mjs`.
- Calls land in the CRM with verification badges and a lead score (85 when both checks
  pass); an advisor callback creates a task: `src/conversation-intake.js`, `src/channels.js`.
- Six pipeline stages: `server/index.mjs`.
- 2,610 monthly searches in Ecuador across 22 of 34 programs, top term 720: the dated
  OpenSEO snapshot in `src/openseo-ecuador.js`.
- Guides drafted from the catalog, reviewed and published by the team: Content Engine.

The call scene is an illustration with a fictitious applicant; the opening line is the
agent's real greeting. The film makes no conversion or revenue claims. It does not say
the AI wrote the follow-up or the draft shown: without an Anthropic key the platform
falls back to catalog templates, and the recordings were made without one.
