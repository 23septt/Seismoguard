# Lessons Learned

## 2026-05-03 — Token Limit Churn (35m wasted)

**What happened:** Claude read flowchart file, tried generating massive output in single response → hit 32k output token limit → churned 35m 38s before failing.

**Error:** `API Error: Claude's response exceeded the 32000 output token maximum.`

**Root causes:**
- No chunking strategy for large output
- Attempted to fit entire file generation into one shot
- No early check on output size before committing to approach

**Fix:**
- Break large output into chunks
- Ask user which section is needed first, not full file at once
- Set `CLAUDE_CODE_MAX_OUTPUT_TOKENS` env var if large output truly needed
- For file reads that will produce big output: read incrementally, write incrementally
