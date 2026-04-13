const Anthropic = require('@anthropic-ai/sdk');
const fs = require('fs');
const path = require('path');
const {
  getPendingArticles, updateArticleEval, markArticleDrafted, insertDraft,
  getRecentRejectionNotes,
} = require('./db');

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const SKILLS = path.join(__dirname, '..', 'skills');

// Cache skills at module load — avoids repeated disk reads per article
const skills = {
  contentEval:  fs.readFileSync(path.join(SKILLS, 'content-eval.md'),  'utf-8'),
  jobContext:   fs.readFileSync(path.join(SKILLS, 'job-context.md'),   'utf-8'),
  writingStyle: fs.readFileSync(path.join(SKILLS, 'writing-style.md'), 'utf-8'),
};

// ─── Step 1: Evaluate ─────────────────────────────────────────────────────────

async function evaluate(article, rejectionContext) {
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

  const system = `You are an expert content strategist evaluating articles for LinkedIn post potential.

${skills.contentEval}

---

For job context, use this reference:

${skills.jobContext}

${rejectionBlock}Return ONLY a valid JSON object. No markdown, no explanation, no preamble.`;

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
    const raw = msg.content[0].text.trim();
    // Strip markdown fences
    const stripped = raw.replace(/^```json\n?/, '').replace(/\n?```$/, '').trim();
    // Extract just the JSON object in case there's extra text around it
    const match = stripped.match(/\{[\s\S]*\}/);
    if (!match) throw new Error('No JSON object found in response');
    return JSON.parse(match[0]);
  } catch (err) {
    console.error(`[pipeline] Eval failed "${article.title}":`, err.message);
    return null;
  }
}

// ─── Step 2: Draft ────────────────────────────────────────────────────────────

async function draft(article, evalData, config) {
  const maxChars = config.pipeline?.linkedInPostMaxChars || 2800;

  const system = `You are a ghostwriter for John, an Engineering Director at Indeed.

WRITING STYLE:
${skills.writingStyle}

JOB CONTEXT:
${skills.jobContext}

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
- Key insight: ${evalData.keyInsight}
- Application hook: ${evalData.applicationHook}
- Primary connection to John's work: ${evalData.primaryConnection}`;

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

// ─── Main ─────────────────────────────────────────────────────────────────────

async function runPipeline(config) {
  const minScore = config.pipeline?.minRelevanceScore || 7;
  const maxDrafts = config.pipeline?.maxDraftsPerRun || 3;
  const articleLimit = config.pipeline?.articlesPerCrawlRun || 50;
  console.log('[pipeline] Starting...');

  const rejectionNotes = getRecentRejectionNotes(15);
  const rejectionContext = rejectionNotes.length
    ? rejectionNotes
        .map((r) => `- "${r.title}" (${r.source}): ${r.rejection_note}`)
        .join('\n')
    : null;
  if (rejectionContext) {
    console.log(`[pipeline] Injecting ${rejectionNotes.length} rejection notes into eval`);
  }

  const articles = getPendingArticles(articleLimit);
  console.log(`[pipeline] ${articles.length} pending articles`);
  let created = 0;

  for (const article of articles) {
    if (created >= maxDrafts) break;

    console.log(`[pipeline] Evaluating: "${article.title}"`);
    const evalData = await evaluate(article, rejectionContext);

    if (!evalData) {
      updateArticleEval(article.id, 0, {}, 'skipped');
      continue;
    }

    if (!evalData.pass || evalData.overallScore < minScore) {
      console.log(`[pipeline] Skip "${article.title}" (${evalData.overallScore}): ${evalData.skipReason || 'below threshold'}`);
      updateArticleEval(article.id, evalData.overallScore, evalData, 'skipped');
      continue;
    }

    updateArticleEval(article.id, evalData.overallScore, evalData, 'evaluated');
    await new Promise((r) => setTimeout(r, 1000));

    console.log(`[pipeline] Drafting for "${article.title}" (score ${evalData.overallScore})`);
    const postText = await draft(article, evalData, config);

    if (!postText) {
      updateArticleEval(article.id, evalData.overallScore, evalData, 'skipped');
      continue;
    }

    insertDraft({
      article_id: article.id,
      post_text: postText,
      primary_connection: evalData.primaryConnection || null,
      key_insight: evalData.keyInsight || null,
      eval_score: evalData.overallScore,
    });

    markArticleDrafted(article.id);
    created++;
    console.log(`[pipeline] Draft created for "${article.title}"`);
    await new Promise((r) => setTimeout(r, 2000));
  }

  console.log(`[pipeline] Done. ${created} drafts created.`);
  return { draftsCreated: created };
}

module.exports = { runPipeline };
