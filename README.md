<img width="1920" height="2240" alt="Gemini_Generated_Image_46mos646mos646mo" src="https://github.com/user-attachments/assets/400a5ffc-bf62-4e98-9749-e8d120094bbf" />


# LinkedIn Auto Poster

Stay on top of what's moving in tech — without spending hours finding it. This tool surfaces cutting-edge articles and trends that match your work, your opinions, and the direction you think the industry is heading. When something relevant appears, it drafts a post in your voice and queues it for your review. One click to approve, one post to your network.

<img width="931" height="786" alt="image" src="https://github.com/user-attachments/assets/2fdb4a3c-deb9-448e-b16e-62ef21f711d7" />


---

## Why this exists

The hardest part of staying active on LinkedIn isn't writing — it's finding the right things to write about. Scanning Hacker News, keeping up with research blogs, and filtering out noise takes real time. By the time something interesting surfaces, the moment to share it has often passed.

The core idea here is that you teach the tool who you are and what you believe, and it does the discovery for you. You encode your professional context, your opinions on where the industry is heading, and the specific topics that intersect with your work. That configuration becomes the intelligence layer — it's what determines which articles surface, why they're relevant to you specifically, and what angle a post should take. The drafting is downstream of that. A well-calibrated setup produces content worth sharing; a generic one produces noise.

The goal is to lower the overhead of sharing your perspective — so that when something relevant breaks in your domain, you can put a point of view on it and reach your network before the conversation moves on.

---

## How It Works

Three scheduled jobs run autonomously. You interact through the review UI.

**Crawl** — Mon/Wed/Fri at 8am: pulls articles from Hacker News, Reddit, and RSS feeds. You can also paste any URL on the dashboard to evaluate and draft it immediately, bypassing the crawl.

**Evaluate + Draft** — runs after each crawl: Claude scores every new article against your job context and content criteria. Articles that connect to your work or match a conviction in your Points of View score higher. Those that pass the threshold get a draft written in your voice — leading with your perspective, not a summary of the article. Rejection notes you've left on previous drafts are fed back into this step so the evaluator recalibrates over time.

**Review** — your queue in the web UI: approve, edit inline, reject with a note, or ask Claude to regenerate with new guidance. Drag to reorder the queue. When rejecting, you can flag the note as a new Point of View — it gets added to your writing style configuration automatically.

**Publish** — Tuesday at 9am: the first approved post goes live on LinkedIn. If the queue is empty, nothing posts that week.

**Analytics** — daily sync: pulls impressions, reactions, and comments per post. The Analytics page shows engagement trends over time and source-level pass rates so you can see which feeds earn their place.

All schedules and thresholds are configurable from the Settings page.

---

## Calibrate

This is where you actually configure the tool to work for you. The **Calibrate** tab in the UI walks you through setting up and refining three skill files — the markdown prompt files that control how the pipeline thinks.

Each skill can be set up through a guided AI interview or edited directly. The interview asks focused questions — one at a time — to surface the context, opinions, and preferences that make the pipeline produce relevant content. When you've answered enough, you ask it to propose a revision. It generates a complete updated file that you can review, edit, and save.

Skills are loaded fresh on every pipeline run, so changes take effect immediately without a server restart.

### The three skills

**Writing Style** (`skills/writing-style.md`) — your LinkedIn voice. Covers tone, format rules, banned phrases, and — most importantly — your Points of View: a set of named topic areas with specific, opinionated convictions. When a draft is written, it leads with whichever Point of View most closely matches the article. The post is your reaction to the article, not a summary of it. The more specific and debatable your convictions, the better the drafts.

**Job Context** (`skills/job-context.md`) — your professional grounding. Current role, past experience, and public metrics that make application sentences feel specific rather than generic. Also defines grounding rules: which references are fair game, and when it's better to make a strong industry observation than force a personal reference that doesn't fit.

**Content Evaluation** (`skills/content-eval.md`) — your relevance filter. Controls scoring weights across four dimensions (relevance, timeliness, specificity, post potential), defines high- and low-relevance signals for your domain, and sets the minimum score an article needs to reach drafting. Articles that connect to a Point of View qualify as relevant even if the topic area isn't explicitly listed.

### Setting up from scratch

```bash
cp skills/writing-style.example.md skills/writing-style.md
cp skills/job-context.example.md skills/job-context.md
cp skills/content-eval.example.md skills/content-eval.md
```

Your real skill files are gitignored — personal details stay out of version control. Then open the **Calibrate** tab and work through each file with the AI interview, or fill in the example files directly and edit from there.

### Tuning tips

- **Too few drafts** — lower `minRelevanceScore` in Settings, or add more sources and HN queries
- **Drafts feel generic** — add more specific products and concrete outcomes to `job-context.md`; add more Points of View to `writing-style.md`
- **Voice is off** — add good and bad example sentences to `writing-style.md` (examples outperform abstract rules)
- **Wrong articles passing** — add those topic areas to the low-relevance signals in `content-eval.md`, or use the rejection note when reviewing to flag the pattern

---

## Setup

### 1. Install dependencies

```bash
npm install
```

`better-sqlite3` requires native compilation — you need Python 3 and a C++ build toolchain (`xcode-select --install` on macOS; `sudo apt install build-essential python3` on Ubuntu).

### 2. Configure environment

```bash
cp .env.example .env
cp config.example.json config.json
```

`.env` needs:
```
ANTHROPIC_API_KEY=sk-ant-...
LINKEDIN_CLIENT_ID=...
LINKEDIN_CLIENT_SECRET=...
LINKEDIN_REDIRECT_URI=http://localhost:3000/auth/linkedin/callback
SESSION_SECRET=<openssl rand -hex 32>
UI_PASSWORD=<your chosen password>
```

### 3. Create a LinkedIn Developer App

1. Go to https://developer.linkedin.com and create an app
2. Add redirect URL: `http://localhost:3000/auth/linkedin/callback`
3. Request scopes: `openid`, `profile`, `w_member_social`, `r_member_social`
4. Copy Client ID and Secret to `.env`

### 4. Start and connect

```bash
npm start
```

Open http://localhost:3000, sign in, click **Connect LinkedIn**, then go to **Calibrate** to set up your skills before running your first crawl.

---

## Hosting

**Railway** (easiest): `npm install -g @railway/cli && railway login && railway init && railway up`. Add env vars in the dashboard. Add a persistent volume at `/app/data`.

**Render**: New Web Service → connect repo → build: `npm install` → start: `npm start`. Add env vars and a Disk at `/app/data`.

**DigitalOcean ($6/mo)**:
```bash
sudo apt install -y nodejs npm build-essential python3
git clone <your-repo> /opt/lp && cd /opt/lp
npm install && cp .env.example .env
npm install -g pm2 && pm2 start src/server.js --name lp && pm2 save && pm2 startup
```

For any hosted deployment, update `LINKEDIN_REDIRECT_URI` in both `.env` and your LinkedIn app settings to use your real domain.

---

## Cost

~$0.01–0.05 per crawl run. At 3 runs/week, roughly $1–6/month in Anthropic API costs.

---

## Troubleshooting

**No drafts**: lower `minRelevanceScore` in Settings (default 7) and check server logs.

**LinkedIn not posting**: token may need refresh — click Reconnect LinkedIn on the dashboard.

**Build errors**: confirm Python 3 and a C++ compiler are installed.
