# LinkedIn Auto Poster

Crawls technical forums, evaluates articles with Claude, drafts LinkedIn posts in your voice, and publishes one per week after your approval.
<img width="1063" height="1277" alt="image" src="https://github.com/user-attachments/assets/3fbaf727-2ec1-49ff-9061-1c7d280002e1" />

---

## How It Works

```
Crawl (Mon/Wed/Fri 8am)
  → Claude evaluates each article for relevance + post potential
  → Claude drafts a post in your voice
    → You approve, edit, or reject in the web UI
      → Weekly post (Tuesday 9am) publishes the first approved item
        → If queue is empty, nothing is posted that week
```

---

## Setup

### 1. Install dependencies

```bash
npm install
```

`better-sqlite3` requires native compilation. You need Python 3 and a C++ build toolchain:
- **macOS**: `xcode-select --install`
- **Ubuntu/Debian**: `sudo apt install build-essential python3`
- **Windows**: install "Desktop development with C++" via Visual Studio Build Tools

### 2. Configure environment

```bash
cp .env.example .env
cp config.example.json config.json
```

Edit `.env`:

```
ANTHROPIC_API_KEY=sk-ant-...
LINKEDIN_CLIENT_ID=...
LINKEDIN_CLIENT_SECRET=...
LINKEDIN_REDIRECT_URI=http://localhost:3000/auth/linkedin/callback
SESSION_SECRET=<run: openssl rand -hex 32>
UI_PASSWORD=<your chosen password>
```

Edit `config.json` with personal preferences.

### 3. Create a LinkedIn Developer App

1. Go to https://developer.linkedin.com and create an app
2. Under **Auth**, add redirect URL: `http://localhost:3000/auth/linkedin/callback`
   (Use your real domain in production)
3. Request scopes: `openid`, `profile`, `w_member_social`
4. Copy Client ID and Secret to `.env`

### 4. Start

```bash
npm start
```

Open http://localhost:3000, sign in, then click **Connect LinkedIn** on the dashboard.

### 5. Generate your first drafts

Click **Run Crawl Now** on the dashboard. After 1-2 minutes, drafts will appear in **Review Drafts**.

---

## Customization

### Topics and sources

Go to **Settings** in the UI, or edit `config.json` directly.

### Schedule

Uses cron syntax. Defaults:
- Crawl: `0 8 * * 1,3,5` (Mon/Wed/Fri at 8am)
- Post: `0 9 * * 2` (Tuesday at 9am)

---

## Skills

Skills are markdown prompt files that control how the AI pipeline behaves. They live in the `skills/` directory and are loaded fresh on every pipeline run, so changes take effect immediately without restarting the server.

There are three skills, each responsible for a different stage of the pipeline:

| File | Stage | Controls |
|---|---|---|
| `skills/content-eval.md` | Evaluation | How articles are scored and filtered |
| `skills/job-context.md` | Evaluation + Drafting | Your role, products, and how content maps to your work |
| `skills/writing-style.md` | Drafting | Your voice, tone, format rules, and structural pattern |

### Setting up your skills

The repo includes `.example.md` versions of each skill file as starting points. Copy them and fill in your own details:

```bash
cp skills/writing-style.example.md skills/writing-style.md
cp skills/job-context.example.md skills/job-context.md
cp skills/content-eval.example.md skills/content-eval.md
```

The `.gitignore` is configured to keep your real skill files private while committing the example files. This means your personal details, product names, and org context stay out of version control.

### writing-style.md

This file defines your LinkedIn voice. The pipeline uses it when drafting every post. The more specific you are here, the less editing you'll need to do in the approval UI.

Things to define:
- **Tone**: How direct or conversational are you? What words or phrases do you never use?
- **Format rules**: Post length, hashtag count and style, emoji usage, punctuation preferences
- **Structure**: How do you typically open a post? How do you close?
- **Examples**: Include real examples of good and bad sentences in your voice. These are the most effective part of the prompt — concrete examples outperform abstract rules.

### job-context.md

This file tells the pipeline who you are and what you work on, so it can connect articles to your actual work rather than making generic observations.

Things to define:
- **Your role**: Title, company, team size, what your org owns
- **Products and initiatives**: For each one, write 2-3 sentences describing what it is and what the key challenges are. The pipeline uses this to write specific application sentences rather than vague ones.
- **Content-to-product mapping**: A table that says "when an article is about X, connect it to Y." This is what prevents the pipeline from forcing irrelevant connections.
- **Grounding rules**: Hard constraints on what the pipeline can and can't reference.

### content-eval.md

This file controls which articles make it through to drafting. Every article is scored on four dimensions — relevance, timeliness, specificity, and post potential — and articles below the threshold are skipped.

Things to define:
- **High-relevance signals**: Topic areas that are directly useful to your work
- **Low-relevance signals**: Topics to always skip (e.g. crypto, pure frontend, marketing fluff)
- **Scoring weights**: The default formula weights relevance at 40% and the other three at 20% each. Adjust if you want to prioritize timeliness or specificity more heavily.

The minimum passing score is set in `config.json` under `pipeline.minRelevanceScore` (default: 7). Lower it if too few articles are making it through. Raise it if too many low-quality drafts are appearing in your review queue.

### Tuning tips

- **Too few drafts**: Lower `minRelevanceScore` in Settings, or add more topic areas and HN queries in Settings
- **Drafts feel generic**: Add more specific products and examples to `job-context.md`
- **Voice is off**: Add concrete examples of good and bad sentences to `writing-style.md` — examples work better than abstract rules
- **Wrong articles passing**: Add the irrelevant topic areas to the low-relevance signals list in `content-eval.md`

---

## Hosting

### Railway (easiest)

```bash
npm install -g @railway/cli
railway login && railway init && railway up
```

Set env vars in the Railway dashboard. Add a persistent volume at `/app/data` for the SQLite DB.

### Render

New Web Service → connect your repo → build: `npm install` → start: `npm start`. Add env vars. Add a Disk at `/app/data`.

### DigitalOcean Droplet ($6/mo)

```bash
sudo apt install -y nodejs npm build-essential python3
git clone <your-repo> /opt/lp && cd /opt/lp
npm install && cp .env.example .env   # fill in .env
npm install -g pm2
pm2 start src/server.js --name lp
pm2 save && pm2 startup
```

For production: update `LINKEDIN_REDIRECT_URI` in both your LinkedIn app settings and `.env` to use your real domain.

---

## Cost

Roughly $0.01-0.05 per crawl+pipeline run. At 3 runs/week, approximately $1-6/month in Anthropic API costs.

---

## Troubleshooting

**No drafts being created**: Lower `minRelevanceScore` in Settings (default 7). Check the server logs for pipeline output.

**LinkedIn not posting**: Check the LinkedIn connection status on the dashboard. Token may need refresh — click Reconnect LinkedIn.

**`better-sqlite3` build errors**: Make sure you have Python 3 and a C++ compiler installed (see Setup step 1).
