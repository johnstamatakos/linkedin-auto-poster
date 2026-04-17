const Anthropic = require('@anthropic-ai/sdk');
const axios     = require('axios');
const fs        = require('fs');
const path      = require('path');
const {
  getPendingArticles, updateArticleEval, markArticleDrafted, insertDraft,
  getRecentRejectionNotes, getRecentPostTitles, getDraftById, updateDraftText,
  insertArticle, getArticleByUrl, getArticleById,
} = require('./db');

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const SKILLS = path.join(__dirname, '..', 'skills');

const skills = {
  contentEval:  fs.readFileSync(path.join(SKILLS, 'content-eval.md'),    'utf-8'),
  jobContext:   fs.readFileSync(path.join(SKILLS, 'job-context.md'),     'utf-8'),
  writingStyle: fs.readFileSync(path.join(SKILLS, 'writing-style.md'),   'utf-8'),
  pointsOfView: fs.readFileSync(path.join(SKILLS, 'points-of-view.md'), 'utf-8'),
};

// ─── Eval context ─────────────────────────────────────────────────────────────

function buildEvalContext() {
  const rejectionNotes = getRecentRejectionNotes(15);
  const rejectionContext = rejectionNotes.length
    ? rejectionNotes.map(r => `- "${r.title}" (${r.source}): ${r.rejection_note}`).join('\n')
    : null;
  const recentPosts    = getRecentPostTitles(10);
  const recencyContext = buildRecencyContext(recentPosts);
  return { rejectionContext, recencyContext };
}

// ─── Step 1: Evaluate ─────────────────────────────────────────────────────────

function buildRecencyContext(recentPosts) {
  if (!recentPosts.length) return null;
  return recentPosts.map(p => {
    const daysAgo = Math.round((Date.now() - new Date(p.posted_at).getTime()) / 86400000);
    return `- "${p.title}" (${daysAgo} day${daysAgo !== 1 ? 's' : ''} ago)`;
  }).join('\n');
}

async function evaluate(article, rejectionContext, recencyContext) {
  const rejectionBlock = rejectionContext
    ? `---

REJECTION FEEDBACK:
The author has recently rejected drafts with these notes. Use this to calibrate
your scoring — if this article is likely to produce content the author would
reject for similar reasons, score it lower and set pass to false.

${rejectionContext}

---

`
    : '';

  const recencyBlock = recencyContext
    ? `---

RECENT POSTS (do not repeat these themes):
The author has recently published posts on these articles. If the current article
would produce substantially the same theme, angle, or core argument as one of
these, set tooSimilarToRecent to true and explain briefly in similarityNote.
Minor topical overlap is fine — near-identical angles are not.

${recencyContext}

---

`
    : '';

  const system = `You are an expert content strategist evaluating articles for LinkedIn post potential.

${skills.contentEval}

---

For job context, use this reference:

${skills.jobContext}

---

These are John's actual points of view. Use them to assess opinion-triggered relevance:

${skills.pointsOfView}

${rejectionBlock}${recencyBlock}Return ONLY a valid JSON object. No markdown, no explanation, no preamble.`;

  const user = `Evaluate this article for LinkedIn post potential.

Title: ${article.title}
Source: ${article.source}
URL: ${article.url}
Excerpt: ${article.summary || '(none)'}`;

  try {
    const msg = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 512,
      system,
      messages: [{ role: 'user', content: user }],
    });
    const raw      = msg.content[0].text.trim();
    const stripped = raw.replace(/^```json\n?/, '').replace(/\n?```$/, '').trim();
    const match    = stripped.match(/\{[\s\S]*\}/);
    if (!match) throw new Error('No JSON object found in response');
    return JSON.parse(match[0]);
  } catch (err) {
    console.error(`[pipeline] Eval failed "${article.title}":`, err.message);
    return null;
  }
}

// ─── Step 2: Draft ────────────────────────────────────────────────────────────

async function draft(article, evalData, config, guidance = null) {
  const maxChars = config.pipeline?.linkedInPostMaxChars || 2800;

  const system = `You are a ghostwriter for John, an Engineering Director at Indeed.

WRITING STYLE:
${skills.writingStyle}

JOB CONTEXT:
${skills.jobContext}

POINTS OF VIEW:
${skills.pointsOfView}

CRITICAL INSTRUCTION — READ BEFORE DRAFTING:
The post must start from a Point of View, not from the article. Before writing
a single word, identify the opinion in the Points of View section that most
closely matches the article's subject. That opinion is the post. The article
is a news hook — a current, concrete example of something John already
believes. Write as if John is reacting to the article through that lens.

Do NOT open by describing what the article says. Do NOT open with what
researchers found, what the study showed, or what the author argued. The
first sentence should state John's opinion or name the problem he sees —
not describe the article.

A reader who has not seen the article should come away with a clear opinion,
not a sense of what the article covered.

Stay under ${maxChars} characters. Return ONLY the post text — no preamble, no explanation, no surrounding quotes.`;

  const user = `Write a LinkedIn post for this article.

Title: ${article.title}
Source: ${article.source}
URL: ${article.url}
Excerpt: ${article.summary || '(none)'}

Use these insights from the evaluation:
- Key insight: ${evalData.keyInsight || ''}
- Application hook: ${evalData.applicationHook || ''}
- Primary connection to John's work: ${evalData.primaryConnection || ''}
${guidance ? `\nAuthor guidance for this draft: ${guidance}` : ''}`;

  try {
    const msg = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 700,
      system,
      messages: [{ role: 'user', content: user }],
    });
    return msg.content[0].text.trim();
  } catch (err) {
    console.error(`[pipeline] Draft failed "${article.title}":`, err.message);
    return null;
  }
}

// ─── Regenerate existing draft ────────────────────────────────────────────────

async function regenerateDraft(draftId, guidance, config) {
  const existing = getDraftById(draftId);
  if (!existing) throw new Error('Draft not found');

  const article = {
    title:   existing.article_title   || 'Unknown',
    source:  existing.article_source  || 'Unknown',
    url:     existing.article_url     || '',
    summary: '',
  };

  const evalData = existing.article_eval_data
    ? JSON.parse(existing.article_eval_data)
    : {
        keyInsight:        existing.key_insight        || '',
        applicationHook:   '',
        primaryConnection: existing.primary_connection || '',
      };

  const postText = await draft(article, evalData, config, guidance || null);
  if (!postText) throw new Error('Draft generation failed');

  updateDraftText(draftId, postText);
  return { post_text: postText };
}

// ─── Submit article by URL ────────────────────────────────────────────────────

async function fetchArticleContent(url) {
  const { data } = await axios.get(url, {
    timeout: 15000,
    headers: { 'User-Agent': 'LinkedInAutoPoster/1.0' },
    maxContentLength: 2 * 1024 * 1024,
    responseType: 'text',
  });

  const titleMatch = data.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const rawTitle   = titleMatch ? titleMatch[1] : '';
  const title = rawTitle
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&\w+;/g, '')
    .replace(/\s+/g, ' ').trim() || new URL(url).hostname;

  const source = new URL(url).hostname.replace(/^www\./, '');

  const summary = data
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 600);

  return { title, source, summary };
}

async function submitArticleUrl(url, config) {
  console.log(`[pipeline] Manual article submission: ${url}`);

  // Validate URL
  try { new URL(url); } catch { throw new Error('Invalid URL'); }

  // Fetch content
  let articleContent;
  try {
    articleContent = await fetchArticleContent(url);
  } catch (err) {
    throw new Error(`Could not fetch URL: ${err.message}`);
  }

  // Insert (or skip if duplicate)
  insertArticle({
    source:       articleContent.source,
    source_type:  'manual',
    url,
    title:        articleContent.title,
    summary:      articleContent.summary,
    published_at: new Date().toISOString(),
  });

  const article = getArticleByUrl(url);
  if (!article) throw new Error('Failed to store article');

  // Evaluate
  const { rejectionContext, recencyContext } = buildEvalContext();
  const evalData = await evaluate(article, rejectionContext, recencyContext);
  if (!evalData) throw new Error('Evaluation failed');

  updateArticleEval(article.id, evalData.overallScore, evalData, 'evaluated');
  console.log(`[pipeline] Manual eval score: ${evalData.overallScore}/10`);

  // Always draft regardless of score — user chose this article intentionally
  const postText = await draft(article, evalData, config);
  if (!postText) throw new Error('Draft generation failed');

  insertDraft({
    article_id:        article.id,
    post_text:         postText,
    primary_connection: evalData.primaryConnection || null,
    key_insight:        evalData.keyInsight        || null,
    eval_score:         evalData.overallScore,
  });

  markArticleDrafted(article.id);
  console.log(`[pipeline] Manual draft created for "${article.title}"`);

  return {
    score: evalData.overallScore,
    title: article.title,
    ...(evalData.tooSimilarToRecent && { similarityWarning: evalData.similarityNote }),
  };
}

// ─── Main pipeline ────────────────────────────────────────────────────────────

async function runPipeline(config, onProgress) {
  const minScore    = config.pipeline?.minRelevanceScore || 7;
  const maxDrafts   = config.pipeline?.maxDraftsPerRun   || 3;
  const articleLimit = config.pipeline?.articlesPerCrawlRun || 50;
  console.log('[pipeline] Starting...');

  const { rejectionContext, recencyContext } = buildEvalContext();
  if (rejectionContext) console.log('[pipeline] Injecting rejection context into eval');
  if (recencyContext)   console.log('[pipeline] Injecting recency context into eval');

  const articles = getPendingArticles(articleLimit);
  console.log(`[pipeline] ${articles.length} pending articles`);
  let created = 0;

  for (const article of articles) {
    if (created >= maxDrafts) break;

    console.log(`[pipeline] Evaluating: "${article.title}"`);
    onProgress?.({ msg: `Reviewing: "${article.title}"` });
    const evalData = await evaluate(article, rejectionContext, recencyContext);

    if (!evalData) {
      updateArticleEval(article.id, 0, {}, 'skipped');
      continue;
    }

    if (evalData.tooSimilarToRecent) {
      console.log(`[pipeline] Skip "${article.title}" — too similar to recent post: ${evalData.similarityNote}`);
      updateArticleEval(article.id, evalData.overallScore, evalData, 'skipped');
      continue;
    }

    if (!evalData.pass || evalData.overallScore < minScore) {
      console.log(`[pipeline] Skip "${article.title}" (${evalData.overallScore}): ${evalData.skipReason || 'below threshold'}`);
      updateArticleEval(article.id, evalData.overallScore, evalData, 'skipped');
      continue;
    }

    updateArticleEval(article.id, evalData.overallScore, evalData, 'evaluated');
    await new Promise(r => setTimeout(r, 1000));

    console.log(`[pipeline] Drafting for "${article.title}" (score ${evalData.overallScore})`);
    onProgress?.({ msg: `Drafting: "${article.title}"` });
    const postText = await draft(article, evalData, config);

    if (!postText) {
      updateArticleEval(article.id, evalData.overallScore, evalData, 'skipped');
      continue;
    }

    insertDraft({
      article_id:         article.id,
      post_text:          postText,
      primary_connection: evalData.primaryConnection || null,
      key_insight:        evalData.keyInsight        || null,
      eval_score:         evalData.overallScore,
    });

    markArticleDrafted(article.id);
    created++;
    console.log(`[pipeline] Draft created for "${article.title}"`);
    await new Promise(r => setTimeout(r, 2000));
  }

  console.log(`[pipeline] Done. ${created} drafts created.`);
  return { draftsCreated: created };
}

function reloadSkills() {
  try {
    const contentEval  = fs.readFileSync(path.join(SKILLS, 'content-eval.md'),    'utf-8');
    const jobContext   = fs.readFileSync(path.join(SKILLS, 'job-context.md'),     'utf-8');
    const writingStyle = fs.readFileSync(path.join(SKILLS, 'writing-style.md'),   'utf-8');
    const pointsOfView = fs.readFileSync(path.join(SKILLS, 'points-of-view.md'), 'utf-8');
    skills.contentEval  = contentEval;
    skills.jobContext   = jobContext;
    skills.writingStyle = writingStyle;
    skills.pointsOfView = pointsOfView;
  } catch (err) {
    console.error('[pipeline] Failed to reload skills:', err.message);
    throw err;
  }
}

async function draftArticleById(id, config) {
  const article = getArticleById(id);
  if (!article) throw new Error('Article not found');
  if (article.status === 'drafted') throw new Error('Article already has a draft');

  console.log(`[pipeline] Manual draft by ID for "${article.title}"`);

  const { rejectionContext, recencyContext } = buildEvalContext();
  const evalData = await evaluate(article, rejectionContext, recencyContext);
  if (!evalData) throw new Error('Evaluation failed');

  updateArticleEval(article.id, evalData.overallScore, evalData, 'evaluated');

  // Always draft — user explicitly requested it
  const postText = await draft(article, evalData, config);
  if (!postText) throw new Error('Draft generation failed');

  insertDraft({
    article_id:         article.id,
    post_text:          postText,
    primary_connection: evalData.primaryConnection || null,
    key_insight:        evalData.keyInsight        || null,
    eval_score:         evalData.overallScore,
  });

  markArticleDrafted(article.id);
  console.log(`[pipeline] Draft created for "${article.title}" (score ${evalData.overallScore})`);

  return { score: evalData.overallScore, title: article.title };
}

module.exports = { runPipeline, regenerateDraft, submitArticleUrl, draftArticleById, reloadSkills };
