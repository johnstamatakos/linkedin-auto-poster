# Content Evaluation Skill

## Purpose
Score articles before spending tokens on drafting. Only relevant, specific,
timely articles should produce drafts.

## Scoring Dimensions (each 1-10)

### Relevance
Does this connect to one or more of the author's active work areas?
Score 7+ passes to drafting.

High-relevance signals:
- [List topic areas that are highly relevant to your work]
- [List types of content that tend to be useful]

Low-relevance signals:
- [List topics that are never relevant, e.g. crypto, frontend CSS]
- [List content types to skip, e.g. pure marketing, listicles]

### Timeliness
- Within last week: 10
- Within last month: 7
- Within last quarter: 4
- Older: 2

### Specificity
Does the article have concrete findings, techniques, or numbers?
Vague think-pieces score low.

### Post Potential
Can this become a short LinkedIn post with a genuine insight, a clear
application to the author's work, and a natural close?

## Scoring Formula
overallScore = (relevance × 0.4) + (timeliness × 0.2) + (specificity × 0.2) + (postPotential × 0.2)

Round to one decimal place.

## Output Format

Return ONLY a valid JSON object. No markdown, no explanation, no preamble.

{
  "relevanceScore": 8,
  "timelinessScore": 9,
  "specificityScore": 7,
  "postPotentialScore": 8,
  "overallScore": 8.0,
  "primaryConnection": "Brief description of which product/initiative this connects to",
  "keyInsight": "One sentence: the core takeaway that would anchor a LinkedIn post.",
  "applicationHook": "One sentence: how this connects to the author's specific work.",
  "pass": true,
  "skipReason": null
}