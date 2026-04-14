# Content Evaluation Skill

## Purpose
Score articles before spending tokens on drafting. Only high-quality, relevant,
specific articles should produce drafts.

## Scoring Dimensions (each 1-10)

### Relevance (weight: 50%)
Primary filter. Does this connect to one or more of the author's work areas?

High-relevance signals:
- [Your primary technical domain, e.g. distributed systems, AI infrastructure, developer tooling]
- [Your secondary domain, e.g. platform architecture, API design, reliability engineering]
- [Leadership topics you post on, if any, e.g. engineering org design, hiring, performance]
- [Industry segments relevant to your work, e.g. fintech, marketplace, enterprise SaaS]
- [Specific technologies or protocols central to your current work]

**Opinion match (also counts as high relevance):**
An article passes if it provides a strong launching pad for any opinion in
the Points of View skill file, even if the topic area is not explicitly listed
above. Ask: could this article prompt a genuine reaction based on what the
author actually believes? If yes, treat it as relevant regardless of subject matter.

Examples of opinion-triggered relevance:
- An article about org flattening → relevant if you have an opinion on
  middle management being over-pruned and the coordination loss that follows
- An article about AI-generated code and review practices → relevant if you
  have an opinion on review being the bottleneck and engineers losing depth
- An article about infrastructure cost growth → relevant if you have an
  opinion on teams underestimating the operational cost of scaling AI usage
- [Add examples tied to your own Points of View — one per major opinion]

Secondary relevance signals (draw from when strongly applicable):
- [Adjacent domains worth including occasionally, e.g. developer experience,
  technical hiring, team scaling]
- [Specific company announcements or ecosystem developments worth tracking]

Low-relevance signals (skip these):
- Pure research papers without practical product engineering application
- [Domains entirely outside your work, e.g. blockchain/web3, hardware]
- General career advice or motivational content
- Marketing pieces without technical substance
- [Any specific content types you consistently want to exclude]

### Timeliness (weight: 20%)
- Within last week: 10
- Within last month: 7
- Within last quarter: 4
- Older: 2

### Specificity (weight: 15%)
Does the article have concrete findings, techniques, or numbers? Vague
think-pieces and listicles score low. Technical depth and empirical findings
score high. For leadership content, general advice scores low — specific
frameworks, data, or hard-won lessons score high.

### Post Potential (weight: 15%)
Can this become a short LinkedIn post (roughly two paragraphs, 150-200 words)
with a genuine insight, a clear connection to the author's work, and a natural
close? Articles that are too narrow, too broad, entirely behind a paywall, or
meaningful only to a niche academic audience score low.

## Scoring Formula
overallScore = (relevance × 0.5) + (timeliness × 0.2) + (specificity × 0.15) + (postPotential × 0.15)

Round to one decimal place.

## Recency Check
If recent posts are provided in context: set `tooSimilarToRecent: true` if this
article would produce a post with substantially the same theme, angle, or core
argument as a recently published one. Minor topical overlap is fine — near-identical
angles are not. If no recent posts are provided, always set `tooSimilarToRecent: false`.

## Output Format

Return ONLY a valid JSON object. No markdown fences, no explanation, no preamble.

{
  "relevanceScore": 8,
  "timelinessScore": 9,
  "specificityScore": 7,
  "postPotentialScore": 8,
  "overallScore": 8.0,
  "primaryConnection": "Brief description of which work area or experience this connects to",
  "keyInsight": "One sentence: the core technical or leadership takeaway that would anchor a LinkedIn post.",
  "applicationHook": "One sentence: how this connects to the author's specific work or experience.",
  "pass": true,
  "skipReason": null,
  "tooSimilarToRecent": false,
  "similarityNote": null
}

If pass is false, populate skipReason with a brief explanation.
If tooSimilarToRecent is true, populate similarityNote with a one-sentence explanation of which recent post it overlaps with and why.
