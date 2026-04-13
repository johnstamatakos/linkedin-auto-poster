const Anthropic = require('@anthropic-ai/sdk');
const fs        = require('fs');
const path      = require('path');

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const SKILLS = path.join(__dirname, '..', 'skills');

// ─── System prompts ───────────────────────────────────────────────────────────

const SKILL_GUIDES = {
  'writing-style': `Your goal is to help the user articulate their voice, sharpen their format rules, and surface their genuine opinions as Points of View.

In INTERVIEW mode: Ask ONE focused question — the single highest-value thing you need to know to improve this file. Good questions surface concrete opinions, specific examples, or format preferences the user hasn't articulated yet. Examples:
- "Tell me about a LinkedIn post — one you wrote or read — that you'd hold up as the ideal. What made it work?"
- "What's a topic you hold a strong opinion on where most people in your industry would push back?"
- "What phrases or writing patterns do you find most grating on LinkedIn?"

In REVISION mode: Output the complete updated file incorporating everything from the conversation. The Points of View section should be specific and opinionated — vague beliefs produce generic posts. Concrete, debatable convictions produce posts worth reading.`,

  'job-context': `Your goal is to help the user document their professional experience so posts feel grounded in real work rather than generic industry commentary.

In INTERVIEW mode: Ask ONE focused question to extract concrete career context — role, products, outcomes, and public metrics that make posts specific. Examples:
- "Describe your current role in 2-3 sentences: what do you own, what's the key challenge, and what's a recent outcome you're proud of?"
- "What's a product or initiative you've shipped in the past two years that you'd reference publicly — what was the result?"
- "What metrics from your career are you comfortable citing publicly? Revenue, scale, uptime, latency improvements?"

In REVISION mode: Output the complete updated file incorporating everything from the conversation. Follow the existing file format exactly.`,

  'content-eval': `Your goal is to help the user define exactly which articles should pass the filter and which should be skipped.

In INTERVIEW mode: Ask ONE focused question to understand what the user actually wants to post about and what they want filtered out. Examples:
- "What's the last article that ended up in your queue that you immediately rejected — what was wrong with it?"
- "What topics are you most likely to have a genuine opinion about right now?"
- "What content types always feel like noise to you regardless of topic — pure research, marketing pieces, listicles?"

In REVISION mode: Output the complete updated file incorporating everything from the conversation. Preserve the JSON output format section exactly.`,
};

function buildSystemPrompt(skillName, currentContent) {
  return `You are helping a user configure their LinkedIn auto-poster. The pipeline uses three skill files to discover articles, evaluate them, and draft posts in the user's voice.

The user's current ${skillName} skill file:

---
${currentContent || '(empty — not configured yet)'}
---

${SKILL_GUIDES[skillName] || ''}

When the user says "START_INTERVIEW": ask your first focused question.
When the user says "PROPOSE_REVISION": output ONLY the complete updated file — no preamble, no explanation, no markdown fences. Match the format of the existing file exactly.
Otherwise: continue the conversation with a follow-up question or observation.`;
}

// ─── Streaming interview ───────────────────────────────────────────────────────

async function streamCalibration({ skillName, currentContent, messages, res }) {
  const stream = client.messages.stream({
    model:      'claude-sonnet-4-6',
    max_tokens: 4096,
    system:     buildSystemPrompt(skillName, currentContent),
    messages,
  });

  stream.on('text', text => {
    res.write(`data: ${JSON.stringify({ text })}\n\n`);
  });

  await stream.finalMessage();
  res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
}

// ─── Append Point of View from rejection ─────────────────────────────────────

async function appendPointOfView(rejectionNote, postText) {
  const currentContent = fs.readFileSync(path.join(SKILLS, 'writing-style.md'), 'utf-8');

  const msg = await client.messages.create({
    model:      'claude-sonnet-4-6',
    max_tokens: 4096,
    system: `You are updating a LinkedIn auto-poster writing style skill file.
The file has a "Points of View" section with named topic areas and bullet points representing the author's opinions.
You will receive a rejection note explaining why a draft was rejected, plus the rejected draft text.
Add ONE new bullet point to the most relevant Points of View section that captures the underlying opinion the rejection implies.
Return the COMPLETE updated file and nothing else — no preamble, no markdown fences, no explanation.
If the rejection note doesn't imply a clear opinion (e.g. it's a formatting complaint), return the file unchanged.`,
    messages: [{
      role:    'user',
      content: `Current writing-style.md:\n\n${currentContent}\n\n---\n\nRejection note: "${rejectionNote}"\n\nRejected draft:\n${postText}\n\nReturn the complete updated file.`,
    }],
  });

  const updated = msg.content[0].text.trim();

  if (updated.length < currentContent.length * 0.8) {
    throw new Error('Response looks truncated — skipping write to avoid data loss');
  }

  return updated;
}

module.exports = { streamCalibration, appendPointOfView };
