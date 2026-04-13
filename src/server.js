require('dotenv').config();
const express  = require('express');
const session  = require('express-session');
const path     = require('path');
const fs       = require('fs');
const crypto   = require('crypto');

const db = require('./db');
const { getSourceStats, getEngagementTrends } = db;
const { getAuthUrl, exchangeCode, getAuthStatus } = require('./linkedin');
const scheduler = require('./scheduler');
const { regenerateDraft, submitArticleUrl } = require('./pipeline');

// ─── Config helpers ───────────────────────────────────────────────────────────

const CONFIG_PATH = path.join(__dirname, '..', 'config.json');
if (!require('fs').existsSync(CONFIG_PATH)) {
  console.error('config.json not found. Copy config.example.json to config.json and fill in your details.');
  process.exit(1);
}const loadConfig  = () => JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8'));
const saveConfig  = (c) => fs.writeFileSync(CONFIG_PATH, JSON.stringify(c, null, 2));

// ─── App ──────────────────────────────────────────────────────────────────────

const app = express();
const PORT        = process.env.PORT || 3000;
const UI_PASSWORD = process.env.UI_PASSWORD || 'changeme';

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(session({
  secret:            process.env.SESSION_SECRET || 'dev-secret-change-me',
  resave:            false,
  saveUninitialized: false,
  cookie:            { secure: false, maxAge: 7 * 24 * 60 * 60 * 1000 },
}));
app.use(express.static(path.join(__dirname, '..', 'public')));

// ─── Auth middleware ──────────────────────────────────────────────────────────

function requireLogin(req, res, next) {
  if (req.session?.authenticated) return next();
  if (req.path.startsWith('/api/')) return res.status(401).json({ error: 'Not authenticated' });
  res.redirect('/login');
}

// ─── Login / logout ───────────────────────────────────────────────────────────

app.get('/login', (req, res) =>
  res.sendFile(path.join(__dirname, '..', 'public', 'login.html'))
);

app.post('/api/login', (req, res) => {
  if (req.body.password === UI_PASSWORD) {
    req.session.authenticated = true;
    res.json({ ok: true });
  } else {
    res.status(401).json({ error: 'Invalid password' });
  }
});

app.post('/api/logout', (req, res) => {
  req.session.destroy();
  res.json({ ok: true });
});

// ─── LinkedIn OAuth ───────────────────────────────────────────────────────────

app.get('/auth/linkedin', requireLogin, (req, res) => {
  const state = crypto.randomBytes(16).toString('hex');
  req.session.oauthState = state;
  res.redirect(getAuthUrl(state));
});

app.get('/auth/linkedin/callback', requireLogin, async (req, res) => {
  const { code, state, error } = req.query;
  if (error)                         return res.redirect(`/?error=${encodeURIComponent(error)}`);
  if (state !== req.session.oauthState) return res.status(400).send('OAuth state mismatch.');

  try {
    await exchangeCode(code);
    res.redirect('/?linked=1');
  } catch (err) {
    res.redirect(`/?error=${encodeURIComponent(err.message)}`);
  }
});

// ─── Dashboard ────────────────────────────────────────────────────────────────

app.get('/api/dashboard', requireLogin, (req, res) => {
  res.json({
    stats:          db.getStats(),
    linkedInStatus: getAuthStatus(),
    config:         loadConfig(),
  });
});

// ─── Drafts ───────────────────────────────────────────────────────────────────

app.get('/api/drafts/pending', requireLogin, (req, res) =>
  res.json(db.getDraftsByStatus('pending_review'))
);

app.get('/api/drafts/queue', requireLogin, (req, res) =>
  res.json(db.getApprovedQueue())
);

app.get('/api/drafts/:id', requireLogin, (req, res) => {
  const d = db.getDraftById(Number(req.params.id));
  d ? res.json(d) : res.status(404).json({ error: 'Not found' });
});

app.post('/api/drafts/:id/approve', requireLogin, (req, res) => {
  db.approveDraft(Number(req.params.id));
  res.json({ ok: true });
});

app.post('/api/drafts/:id/reject', requireLogin, (req, res) => {
  db.rejectDraft(Number(req.params.id), req.body.note);
  res.json({ ok: true });
});

app.post('/api/drafts/:id/regenerate', requireLogin, async (req, res) => {
  try {
    const result = await regenerateDraft(Number(req.params.id), req.body.guidance || '', loadConfig());
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/drafts/:id', requireLogin, (req, res) => {
  if (!req.body.post_text) return res.status(400).json({ error: 'post_text required' });
  db.updateDraftText(Number(req.params.id), req.body.post_text);
  res.json({ ok: true });
});

app.post('/api/drafts/queue/reorder', requireLogin, (req, res) => {
  const { orderedIds } = req.body;
  if (!Array.isArray(orderedIds)) return res.status(400).json({ error: 'orderedIds array required' });
  db.reorderQueue(orderedIds);
  res.json({ ok: true });
});

// ─── Posts ────────────────────────────────────────────────────────────────────

app.get('/api/posts/recent', requireLogin, (req, res) =>
  res.json(db.getRecentPosts(20))
);

// ─── Manual triggers ──────────────────────────────────────────────────────────

app.post('/api/run/crawl', requireLogin, (req, res) => {
  res.json({ ok: true, message: 'Crawl started in background' });
  scheduler.runCrawlAndPipeline().catch((err) =>
    console.error('[server] Manual crawl error:', err.message)
  );
});

app.post('/api/run/post', requireLogin, async (req, res) => {
  try {
    res.json(await scheduler.runWeeklyPost());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/run/article', requireLogin, async (req, res) => {
  const { url } = req.body;
  if (!url) return res.status(400).json({ error: 'url required' });
  try {
    const result = await submitArticleUrl(url, loadConfig());
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/run/analytics', requireLogin, (req, res) => {
  res.json({ ok: true, message: 'Analytics sync started in background' });
  scheduler.runAnalyticsSync().catch((err) =>
    console.error('[server] Manual analytics sync error:', err.message)
  );
});

// ─── Analytics ────────────────────────────────────────────────────────────────

app.get('/api/analytics', requireLogin, (req, res) => {
  res.json({
    sources: db.getSourceStats(),
    trends:  db.getEngagementTrends(),
  });
});

// ─── Config ───────────────────────────────────────────────────────────────────

app.get('/api/config', requireLogin, (req, res) => res.json(loadConfig()));

app.put('/api/config', requireLogin, (req, res) => {
  const updated = { ...loadConfig(), ...req.body };
  saveConfig(updated);
  scheduler.updateConfig(updated);
  res.json({ ok: true });
});

// ─── Start ────────────────────────────────────────────────────────────────────

scheduler.start(loadConfig());

app.listen(PORT, () => {
  console.log(`
╔═══════════════════════════════════════════╗
║  LinkedIn Auto Poster — http://localhost:${PORT} ║
╚═══════════════════════════════════════════╝
  `);
});

module.exports = app;
