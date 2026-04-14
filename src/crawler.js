const axios = require('axios');
const RSSParser = require('rss-parser');
const { insertArticle } = require('./db');

const rss = new RSSParser({
  timeout: 10000,
  headers: { 'User-Agent': 'LinkedInAutoPoster/1.0' },
});

// ─── Hacker News ──────────────────────────────────────────────────────────────

async function crawlHN(config) {
  const { queries = [], minScore = 50, maxAgeHours = 72 } = config.sources.hackernews;
  const cutoffUnix = Math.floor((Date.now() - maxAgeHours * 3600 * 1000) / 1000);
  const articles = [];

  for (const query of queries) {
    try {
      const { data } = await axios.get('https://hn.algolia.com/api/v1/search', {
        params: {
          query,
          tags: 'story',
          numericFilters: `points>=${minScore},created_at_i>${cutoffUnix}`,
          hitsPerPage: 15,
        },
        timeout: 10000,
      });

      for (const hit of data.hits || []) {
        if (!hit.url || !hit.title) continue;
        articles.push({
          source: 'Hacker News',
          source_type: 'hackernews',
          url: hit.url,
          title: hit.title,
          summary: hit.story_text
            ? hit.story_text.replace(/<[^>]+>/g, '').slice(0, 500)
            : `HN score: ${hit.points} | ${hit.num_comments} comments`,
          published_at: hit.created_at,
        });
      }
    } catch (err) {
      console.error(`[crawler] HN "${query}":`, err.message);
    }
  }

  return dedupe(articles);
}

// ─── Reddit ───────────────────────────────────────────────────────────────────

async function crawlReddit(config) {
  const { subreddits = [], maxAgeHours = 72, minScore = 50 } = config.sources.reddit;
  const cutoffUnix = (Date.now() - maxAgeHours * 3600 * 1000) / 1000;
  const articles = [];
  const headers = { 'User-Agent': 'LinkedInAutoPoster/1.0' };
  let accessToken = null;

  if (process.env.REDDIT_CLIENT_ID && process.env.REDDIT_CLIENT_SECRET) {
    try {
      const { data } = await axios.post(
        'https://www.reddit.com/api/v1/access_token',
        'grant_type=client_credentials',
        {
          headers: {
            Authorization: `Basic ${Buffer.from(
              `${process.env.REDDIT_CLIENT_ID}:${process.env.REDDIT_CLIENT_SECRET}`
            ).toString('base64')}`,
            'User-Agent': headers['User-Agent'],
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          timeout: 8000,
        }
      );
      accessToken = data.access_token;
    } catch (err) {
      console.warn('[crawler] Reddit OAuth failed, using public API:', err.message);
    }
  }

  const base = accessToken ? 'https://oauth.reddit.com' : 'https://www.reddit.com';
  if (accessToken) headers['Authorization'] = `bearer ${accessToken}`;

  for (const sub of subreddits) {
    try {
      const { data } = await axios.get(`${base}/r/${sub}/top.json`, {
        params: { t: 'week', limit: 15 },
        headers,
        timeout: 10000,
      });

      for (const post of data?.data?.children || []) {
        const p = post.data;
        if (!p.url || p.is_self || p.created_utc < cutoffUnix || p.score < minScore) continue;
        articles.push({
          source: `r/${sub}`,
          source_type: 'reddit',
          url: p.url,
          title: p.title,
          summary: p.selftext?.slice(0, 500) || `r/${sub} | Score: ${p.score}`,
          published_at: new Date(p.created_utc * 1000).toISOString(),
        });
      }
    } catch (err) {
      console.error(`[crawler] Reddit r/${sub}:`, err.message);
    }
  }

  return dedupe(articles);
}

// ─── RSS ──────────────────────────────────────────────────────────────────────

async function crawlRSS(config) {
  const { feeds = [], maxAgeHours = 168 } = config.sources.rss;
  const cutoff = new Date(Date.now() - maxAgeHours * 3600 * 1000);
  const articles = [];

  for (const feed of feeds) {
    try {
      const parsed = await rss.parseURL(feed.url);
      for (const item of parsed.items || []) {
        if (!item.link || !item.title) continue;
        if (item.isoDate && new Date(item.isoDate) < cutoff) continue;

        articles.push({
          source: feed.name,
          source_type: 'rss',
          url: item.link,
          title: item.title.trim(),
          summary: (item.contentSnippet || item.content || item.summary || '')
            .replace(/<[^>]+>/g, '').slice(0, 500),
          published_at: item.isoDate || null,
        });
      }
    } catch (err) {
      console.error(`[crawler] RSS "${feed.name}":`, err.message);
    }
  }

  return dedupe(articles);
}

// ─── Source Health Check ──────────────────────────────────────────────────────

function cleanError(err) {
  if (err.code === 'ECONNABORTED') return 'Timeout';
  if (err.code === 'ENOTFOUND')    return 'Host not found';
  if (err.response?.status)        return `HTTP ${err.response.status}`;
  return err.message.split('\n')[0].slice(0, 80);
}

async function checkHN(hnConfig) {
  const query = hnConfig?.queries?.[0] || 'programming';
  const t0 = Date.now();
  try {
    await axios.get('https://hn.algolia.com/api/v1/search', {
      params: { query, tags: 'story', hitsPerPage: 1 },
      timeout: 8000,
    });
    return { ok: true, latency: Date.now() - t0 };
  } catch (err) {
    return { ok: false, error: cleanError(err), latency: Date.now() - t0 };
  }
}

async function checkReddit(redditConfig) {
  const sub = redditConfig?.subreddits?.[0] || 'programming';
  const t0 = Date.now();
  try {
    await axios.get(`https://www.reddit.com/r/${sub}/top.json`, {
      params: { t: 'week', limit: 1 },
      headers: { 'User-Agent': 'LinkedInAutoPoster/1.0' },
      timeout: 8000,
    });
    return { ok: true, latency: Date.now() - t0 };
  } catch (err) {
    return { ok: false, error: cleanError(err), latency: Date.now() - t0 };
  }
}

async function checkRSSFeeds(rssConfig) {
  const feeds = rssConfig?.feeds || [];
  return Promise.all(feeds.map(async (feed) => {
    const t0 = Date.now();
    try {
      await rss.parseURL(feed.url);
      return { name: feed.name, url: feed.url, ok: true, latency: Date.now() - t0 };
    } catch (err) {
      return { name: feed.name, url: feed.url, ok: false, error: cleanError(err), latency: Date.now() - t0 };
    }
  }));
}

async function checkSourceHealth(config) {
  const [hn, reddit, rssResult] = await Promise.all([
    config.sources?.hackernews?.enabled ? checkHN(config.sources.hackernews)       : null,
    config.sources?.reddit?.enabled     ? checkReddit(config.sources.reddit)       : null,
    config.sources?.rss?.enabled        ? checkRSSFeeds(config.sources.rss)        : null,
  ]);
  const result = {};
  if (hn)        result.hackernews = hn;
  if (reddit)    result.reddit     = reddit;
  if (rssResult) result.rss        = rssResult;
  return result;
}

// ─── Utils ────────────────────────────────────────────────────────────────────

function dedupe(arr) {
  const seen = new Set();
  return arr.filter((a) => {
    if (seen.has(a.url)) return false;
    seen.add(a.url);
    return true;
  });
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function runCrawl(config) {
  console.log('[crawler] Starting...');
  const all = [];

  if (config.sources.hackernews?.enabled) {
    const r = await crawlHN(config);
    console.log(`[crawler] HN: ${r.length} articles`);
    all.push(...r);
  }
  if (config.sources.reddit?.enabled) {
    const r = await crawlReddit(config);
    console.log(`[crawler] Reddit: ${r.length} articles`);
    all.push(...r);
  }
  if (config.sources.rss?.enabled) {
    const r = await crawlRSS(config);
    console.log(`[crawler] RSS: ${r.length} articles`);
    all.push(...r);
  }

  const limit = config.pipeline?.articlesPerCrawlRun || 30;
  let inserted = 0, skipped = 0;

  for (const article of all.slice(0, limit)) {
    const result = insertArticle(article);
    result.changes > 0 ? inserted++ : skipped++;
  }

  console.log(`[crawler] Done. Inserted: ${inserted}, Duplicates skipped: ${skipped}`);
  return { inserted, skipped };
}

module.exports = { runCrawl, checkSourceHealth };
