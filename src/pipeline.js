const Anthropic = require('@anthropic-ai/sdk');
const fs = require('fs');
const path = require('path');
const {
  getPendingArticles, updateArticleEval, markArticleDrafted, insertDraft,
} = require('./db');

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const SKILLS = path.join(__dirname, '..', 'skills');

function skill(name) {
  return fs.readFileSync(path.join(SKILLS, `${name}.md`), 'utf-8');
}

// ─── Step 1: Evaluate ─────────────────────────────────────────────────────────

async function evaluate(article) {
  const system = `You are an expert content strategist evaluating articles for LinkedIn post potential.

${skill('content-eval')}

---

For job context, use this reference:

${skill('job-context')}

Return ONLY a valid JSON object. No markdown, no explanation, no preamble.`;

  const user = `Write a LinkedIn post for this article.

Title: ${article.title}
Source: ${article.source}
URL: ${article.url}
Excerpt: ${article.summary || '(none)'}

Include the article URL (${article.url}) as a natural reference in the post,
either inline or on its own line after the closing observation, before the
disclaimer. Label it simply as "Source:" or work it in naturally.`;

  try {
    const msg = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
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
${skill('writing-style')}

JOB CONTEXT:
${skill('job-context')}

Write a LinkedIn post in John's voice based on the article provided. Stay under ${maxChars} characters. Return ONLY the post text — no preamble, no explanation, no surrounding quotes.`;

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
      model: 'claude-sonnet-4-20250514',
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
  console.log('[pipeline] Starting...');

  const articles = getPendingArticles(50);
  console.log(`[pipeline] ${articles.length} pending articles`);
  let created = 0;

  for (const article of articles) {
    if (created >= maxDrafts) break;

    console.log(`[pipeline] Evaluating: "${article.title}"`);
    const evalData = await evaluate(article);

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
