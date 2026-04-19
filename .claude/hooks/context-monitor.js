#!/usr/bin/env node
// nocrato-hook: context-monitor (PostToolUse)
// Thresholds 45/30 (not GSD's 35/25) — machine froze at ~37% in a prior session.
//
// Two data sources (tries in order):
//   1. Bridge file /tmp/claude-ctx-{session}.json (written by statusline-bridge.js — CLI only)
//   2. Transcript JSONL fallback (reads last API response usage — works in VSCode extension too)
//
// Advisory only — never blocks a tool call.

const fs = require('fs');
const os = require('os');
const path = require('path');

const WARNING_THRESHOLD = 45; // remaining <= 45% → warn
const CRITICAL_THRESHOLD = 30; // remaining <= 30% → critical
const STALE_SECONDS = 60;
const DEBOUNCE_CALLS = 5;
const DEFAULT_CONTEXT_WINDOW = 1_000_000; // Opus 4.6 1M

let input = '';
const stdinTimeout = setTimeout(() => process.exit(0), 10000);
process.stdin.setEncoding('utf8');
process.stdin.on('data', chunk => (input += chunk));
process.stdin.on('end', () => {
  clearTimeout(stdinTimeout);
  try {
    const data = JSON.parse(input);
    const sessionId = data.session_id;
    if (!sessionId || /[/\\]|\.\./.test(sessionId)) process.exit(0);

    const tmpDir = os.tmpdir();
    let remaining = null;
    let usedPct = null;

    // --- Source 1: bridge file (CLI statusline) ---
    const metricsPath = path.join(tmpDir, `claude-ctx-${sessionId}.json`);
    if (fs.existsSync(metricsPath)) {
      try {
        const metrics = JSON.parse(fs.readFileSync(metricsPath, 'utf8'));
        const now = Math.floor(Date.now() / 1000);
        if (!metrics.timestamp || now - metrics.timestamp <= STALE_SECONDS) {
          remaining = metrics.remaining_percentage;
          usedPct = metrics.used_pct;
        }
      } catch {}
    }

    // --- Source 2: transcript JSONL fallback (VSCode) ---
    if (remaining == null && data.transcript_path) {
      try {
        const transcriptData = fs.readFileSync(data.transcript_path, 'utf8');
        // Read last 20KB to find the most recent API response with usage info
        const tail = transcriptData.slice(-20_000);
        const lines = tail.split('\n').filter(Boolean);

        // Walk backwards to find last line with usage/context info
        for (let i = lines.length - 1; i >= 0; i--) {
          try {
            const entry = JSON.parse(lines[i]);
            // Claude Code transcript entries with API usage
            const usage =
              entry.usage ||
              entry.message?.usage ||
              entry.result?.usage;
            if (usage && usage.input_tokens != null) {
              const totalInput =
                (usage.input_tokens || 0) +
                (usage.cache_creation_input_tokens || 0) +
                (usage.cache_read_input_tokens || 0);
              const ctxSize = entry.context_window_size || DEFAULT_CONTEXT_WINDOW;
              usedPct = Math.round((totalInput / ctxSize) * 100);
              remaining = 100 - usedPct;
              break;
            }
          } catch {}
        }
      } catch {}
    }

    // No data from either source
    if (remaining == null || remaining > WARNING_THRESHOLD) process.exit(0);

    // --- Debounce ---
    const warnPath = path.join(tmpDir, `claude-ctx-${sessionId}-warned.json`);
    let warnData = { callsSinceWarn: 0, lastLevel: null };
    let firstWarn = true;
    if (fs.existsSync(warnPath)) {
      try {
        warnData = JSON.parse(fs.readFileSync(warnPath, 'utf8'));
        firstWarn = false;
      } catch {}
    }
    warnData.callsSinceWarn = (warnData.callsSinceWarn || 0) + 1;
    const isCritical = remaining <= CRITICAL_THRESHOLD;
    const currentLevel = isCritical ? 'critical' : 'warning';
    const escalated = currentLevel === 'critical' && warnData.lastLevel === 'warning';
    if (!firstWarn && warnData.callsSinceWarn < DEBOUNCE_CALLS && !escalated) {
      fs.writeFileSync(warnPath, JSON.stringify(warnData));
      process.exit(0);
    }
    warnData.callsSinceWarn = 0;
    warnData.lastLevel = currentLevel;
    fs.writeFileSync(warnPath, JSON.stringify(warnData));

    // --- Emit warning ---
    const message = isCritical
      ? `CONTEXT CRITICAL: usage ${usedPct}%, remaining ${remaining}%. ` +
        'Context is nearly exhausted. Stop starting new complex work. Inform the user ' +
        'so they can run /compact at the next natural stopping point. Do NOT autonomously ' +
        'write handoff files.'
      : `CONTEXT WARNING: usage ${usedPct}%, remaining ${remaining}%. ` +
        'Context is getting limited. Avoid exploratory work and prefer finishing the ' +
        'current task over starting new threads.';

    process.stdout.write(
      JSON.stringify({
        hookSpecificOutput: {
          hookEventName: 'PostToolUse',
          additionalContext: message,
        },
      }),
    );
  } catch {
    process.exit(0);
  }
});
