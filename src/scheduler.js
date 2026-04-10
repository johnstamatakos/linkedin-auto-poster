const cron = require('node-cron');
const { runCrawl }       = require('./crawler');
const { runPipeline }    = require('./pipeline');
const { postToLinkedIn, getAuthStatus } = require('./linkedin');
const { getNextApprovedPost, markDraftPosted, insertPost } = require('./db');

let config    = null;
let crawlJob  = null;
let postJob   = null;

// ─── Weekly Post ──────────────────────────────────────────────────────────────

async function runWeeklyPost() {
  console.log('[scheduler] Weekly post check...');

  const auth = getAuthStatus();
  if (!auth.connected) {
    console.warn(`[scheduler] LinkedIn not connected: ${auth.reason}`);
    return { skipped: true, reason: auth.reason };
  }

  const next = getNextApprovedPost();
  if (!next) {
    console.log('[scheduler] Backlog empty. Skipping this week.');
    return { skipped: true, reason: 'Empty backlog' };
  }

  console.log(`[scheduler] Posting draft ${next.id}: "${next.article_title}"`);

  try {
    const linkedInPostId = await postToLinkedIn(next.post_text);
    insertPost({ draft_id: next.id, post_text: next.post_text, linkedin_post_id: linkedInPostId, status: 'posted' });
    markDraftPosted(next.id);
    console.log(`[scheduler] Posted. LinkedIn ID: ${linkedInPostId}`);
    return { posted: true, draftId: next.id, linkedInPostId };
  } catch (err) {
    console.error('[scheduler] Post failed:', err.message);
    insertPost({ draft_id: next.id, post_text: next.post_text, linkedin_post_id: null, status: 'failed' });
    return { posted: false, error: err.message };
  }
}

// ─── Crawl + Pipeline ─────────────────────────────────────────────────────────

async function runCrawlAndPipeline() {
  console.log('[scheduler] Crawl + pipeline starting...');
  try {
    const crawlResult    = await runCrawl(config);
    const pipelineResult = await runPipeline(config);
    console.log('[scheduler] Complete:', { crawlResult, pipelineResult });
    return { crawlResult, pipelineResult };
  } catch (err) {
    console.error('[scheduler] Error:', err.message);
    throw err;
  }
}

// ─── Start / Stop ─────────────────────────────────────────────────────────────

function start(appConfig) {
  config = appConfig;
  const crawlCron = config.schedule?.crawlCron || '0 8 * * 1,3,5';
  const postCron  = config.schedule?.postCron  || '0 9 * * 2';
  const tz        = config.schedule?.timezone  || 'America/New_York';

  if (cron.validate(crawlCron)) {
    crawlJob = cron.schedule(crawlCron, runCrawlAndPipeline, { scheduled: true, timezone: tz });
    console.log(`[scheduler] Crawl: "${crawlCron}" (${tz})`);
  } else {
    console.error(`[scheduler] Invalid crawl cron: "${crawlCron}"`);
  }

  if (cron.validate(postCron)) {
    postJob = cron.schedule(postCron, runWeeklyPost, { scheduled: true, timezone: tz });
    console.log(`[scheduler] Post:  "${postCron}" (${tz})`);
  } else {
    console.error(`[scheduler] Invalid post cron: "${postCron}"`);
  }
}

function stop() {
  crawlJob?.stop();
  postJob?.stop();
}

function updateConfig(newConfig) {
  stop();
  start(newConfig);
}

module.exports = { start, stop, updateConfig, runCrawlAndPipeline, runWeeklyPost };
