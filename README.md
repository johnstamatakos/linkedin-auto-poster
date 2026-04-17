# Vantage

A personal tech news aggregator that learns who you are, what you believe, and what you care about — then surfaces only the articles worth your attention.

<img width="775" height="928" alt="image" src="https://github.com/user-attachments/assets/848551a3-88b3-4d01-bff0-e0f5e057eb82" />

---

## The idea

Most aggregators show you what's popular. This one shows you what's relevant — to your specific domain, your specific opinions, and the specific problems you've worked on.

You teach it who you are through a set of **Skills**: markdown files that encode your professional context, your points of view on where the industry is heading, your writing voice, and your content standards. The pipeline reads those files on every run and uses them to score incoming articles. An article that gives you something to push back on — something that intersects with a conviction you hold — scores higher than one that's just broadly popular in tech. The more opinionated and specific your Skills are, the sharper the filter gets.

Everything is configurable. The sources, the scoring weights, the schedules, the thresholds — all of it. The Skills themselves are just text files you edit or refine through a guided AI interview in the UI. There's no black box.

The secondary output is LinkedIn. When a good article surfaces, the system drafts a post in your voice — leading with your perspective, not a summary. You review, edit if needed, and approve. It posts on your schedule.

---

## Skills

Skills are the intelligence layer. Four markdown files that you own and control:

**`skills/job-context.md`** — your professional grounding. Current role, relevant past experience, the products and teams you've worked on. This is what makes application sentences feel specific rather than generic.

**`skills/points-of-view.md`** — your actual opinions. Named topic areas with specific, debatable convictions about where things are heading. The evaluator uses this to find articles you'd have a reaction to. The drafter uses it to lead with your take instead of restating the article.

**`skills/content-eval.md`** — your relevance filter. Scoring weights across four dimensions (relevance, timeliness, specificity, post potential), high- and low-signal topics for your domain, and the minimum score an article needs to reach drafting.

**`skills/writing-style.md`** — your LinkedIn voice. Tone, format rules, banned phrases, and example sentences. Examples outperform abstract rules here — the more concrete the better.

Your real skill files are gitignored. Only `.example.md` templates are committed, so personal details stay out of version control.

### Setting up

```bash
cp skills/writing-style.example.md skills/writing-style.md
cp skills/points-of-view.example.md skills/points-of-view.md
cp skills/job-context.example.md skills/job-context.md
cp skills/content-eval.example.md skills/content-eval.md
```

Then open the **Calibrate** tab. Each skill has a guided AI interview that asks focused questions to surface the context and opinions that make the pipeline work. When you've answered enough, ask it to propose a revision — it generates a complete updated file you can review, edit, and save. Or skip the interview and edit the files directly.

Skills are loaded fresh on every pipeline run. Changes take effect immediately.

### Tuning

| Problem | Fix |
|---|---|
| Too few drafts | Lower `minRelevanceScore` in Settings, or add more sources |
| Drafts feel generic | Add specific products and outcomes to `job-context.md` |
| Voice is off | Add concrete example sentences to `writing-style.md` |
| Wrong articles passing | Add those topics to the low-relevance signals in `content-eval.md` |
| Score feels arbitrary | Adjust dimension weights in `content-eval.md` |

---

## Sources

Articles are pulled from Hacker News, Reddit, and RSS feeds on a configurable schedule. You can also paste any URL directly on the dashboard to evaluate and draft it immediately, bypassing the crawl entirely.

Each source has its own settings — enabled/disabled, age filter, minimum score threshold, subreddits or feed URLs. All configurable from the **Settings** page or directly in `config.json`.

Articles are automatically pruned after 3 days if they haven't been drafted. Starred articles are kept indefinitely.

---

## Pipeline

Each crawl run:

1. **Fetch** — pulls new articles from enabled sources, deduplicates by URL
2. **Evaluate** — Claude scores each article against your Skills; articles below threshold are skipped
3. **Draft** — passing articles get a post written in your voice, informed by your Points of View
4. **Review** — you approve, edit, or reject in the UI; rejection notes feed back into future evaluations

Posting runs on a separate schedule. The first approved post in the queue goes live on LinkedIn. If the queue is empty, nothing posts.

---

## Configuration

`config.json` controls everything about how the pipeline runs:

```json
{
  "sources": { ... },
  "pipeline": {
    "articlesPerCrawlRun": 60,
    "maxDraftsPerRun": 10,
    "minRelevanceScore": 8
  },
  "schedule": {
    "crawlCron": "0 8 * * 1,3,5",
    "postCron": "0 9 * * 2",
    "timezone": "America/New_York"
  }
}
```

Most settings can also be changed live from the **Settings** page without touching the file.

---

## Setup

### 1. Install

```bash
npm install
```

`better-sqlite3` requires native compilation — you need Python 3 and a C++ toolchain (`xcode-select --install` on macOS; `sudo apt install build-essential python3` on Ubuntu).

### 2. Environment

```bash
cp .env.example .env
cp config.example.json config.json
```

`.env`:
```
ANTHROPIC_API_KEY=sk-ant-...
LINKEDIN_CLIENT_ID=...
LINKEDIN_CLIENT_SECRET=...
LINKEDIN_REDIRECT_URI=http://localhost:3000/auth/linkedin/callback
SESSION_SECRET=        # openssl rand -hex 32
UI_PASSWORD=           # your chosen login password
```

### 3. LinkedIn Developer App

1. Create an app at https://developer.linkedin.com
2. Add redirect URL: `http://localhost:3000/auth/linkedin/callback`
3. Request scopes: `openid`, `profile`, `w_member_social`, `r_member_social`
4. Copy Client ID and Secret into `.env`

### 4. Run

```bash
npm run dev    # local development
npm start      # production
```

Open http://localhost:3000, sign in, connect LinkedIn, then go to **Calibrate** to set up your Skills before running your first crawl.

---

## Hosting

**DigitalOcean ($6/mo)**:
```bash
sudo apt install -y nodejs npm build-essential python3
git clone <your-repo> /opt/vantage && cd /opt/vantage
npm install && cp .env.example .env && nano .env
npm install -g pm2
pm2 start src/server.js --name curator && pm2 save && pm2 startup
```

Update `LINKEDIN_REDIRECT_URI` in `.env` and your LinkedIn app settings to use your real domain.

---

## Cost

~$0.01–0.05 per crawl run. At three runs per week, roughly $1–6/month in Anthropic API costs.
