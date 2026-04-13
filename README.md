# LinkedIn Auto Poster

Stay on top of what's moving in tech — without spending hours finding it. This tool surfaces cutting-edge articles and trends that match your work, your opinions, and the direction you think the industry is heading. When something relevant appears, it drafts a post in your voice and queues it for your review. One click to approve, one post to your network.

<img width="1063" height="1277" alt="image" src="https://github.com/user-attachments/assets/3fbaf727-2ec1-49ff-9061-1c7d280002e1" />

---

## Why this exists

The hardest part of staying active on LinkedIn isn't writing — it's finding the right things to write about. Scanning Hacker News, keeping up with research blogs, and filtering out noise takes real time. By the time something interesting surfaces, the moment to share it has often passed.

This tool handles discovery and drafting. You tell it what you work on, what sources you trust, and — critically — what you actually believe about where the industry is heading. Those opinions get encoded as "Points of View" in your configuration and become first-class signals in the evaluation step. An article that validates or challenges one of your convictions scores higher than one that's just topically adjacent to your work. When a draft is written, it leads with your point of view rather than summarizing the article. It monitors those sources, scores each article against your context, and drafts a post only when something is genuinely worth sharing. The result lands in a review queue where you can approve, edit, or skip it in under a minute.

The goal is to lower the overhead of sharing your perspective — so that when something relevant breaks in AI infrastructure, distributed systems, developer tooling, or wherever your domain sits, you can put a point of view on it and reach your network before the conversation moves on.

---

## How It Works

Three scheduled jobs run autonomously. You interact through the review UI.

**Crawl** — Mon/Wed/Fri at 8am: pulls articles from Hacker News, Reddit, and RSS feeds. You can also paste any URL into the dashboard to evaluate and draft it immediately, bypassing the crawl entirely.

**Evaluate + Draft** — runs after each crawl: Claude scores every new article on relevance, timeliness, specificity, and post potential against your job context and content criteria. Articles that pass the threshold get a draft written in your voice. Recent rejection notes you've left are fed back into this step — so the evaluator learns what you've already passed on.

**Review** — your queue in the web UI: approve, edit inline, reject with a note, or ask Claude to regenerate the draft with new guidance (e.g. "focus on the business impact"). Drag to reorder the approval queue.

**Publish** — Tuesday at 9am: the first approved post goes live on LinkedIn. If the queue is empty, nothing posts that week.

**Analytics** — daily sync: pulls impressions, reactions, and comments for each published post. The Analytics page shows engagement trends over time and source-level pass rates so you can see which feeds are generating quality drafts and which to cut.

All schedules and thresholds are configurable from the Settings page.

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

Open http://localhost:3000, sign in, click **Connect LinkedIn**, then **Run Crawl Now** to generate your first drafts.

---

## Skills

Skills are markdown prompt files in `skills/` that control how the pipeline behaves. They're loaded fresh on every run — edit and save, no restart needed.

```bash
cp skills/writing-style.example.md skills/writing-style.md
cp skills/job-context.example.md skills/job-context.md
cp skills/content-eval.example.md skills/content-eval.md
```

Your real skill files are gitignored — personal details stay out of version control.

| File | Controls |
|---|---|
| `writing-style.md` | Tone, format rules, structure, and example sentences in your voice |
| `job-context.md` | Your role, products, and a "Points of View" section where you write out your convictions about the industry — these act as relevance multipliers and shape how every draft is framed |
| `content-eval.md` | Scoring weights, high-relevance signals, and what to always skip |

**Tuning tips:**
- Too few drafts → lower `minRelevanceScore` in Settings, or add more sources
- Drafts feel generic → add more specific products and real examples to `job-context.md`
- Voice is off → add concrete example sentences to `writing-style.md` (examples outperform abstract rules)
- Wrong articles passing → add those topics to the low-relevance signals in `content-eval.md`

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
