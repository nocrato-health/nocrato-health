#!/usr/bin/env node
// nocrato-hook: statusline-bridge (Statusline)
// Two jobs:
//   1. Write /tmp/claude-ctx-{session_id}.json for context-monitor hook
//   2. Render a minimal statusline: model │ dir │ ctx% bar
//
// Replaces Claude Code's default statusline (registering a custom hook does that).

const fs = require('fs');
const os = require('os');
const path = require('path');

let input = '';
const stdinTimeout = setTimeout(() => process.exit(0), 3000);
process.stdin.setEncoding('utf8');
process.stdin.on('data', chunk => (input += chunk));
process.stdin.on('end', () => {
  clearTimeout(stdinTimeout);
  try {
    const data = JSON.parse(input);
    const model = data.model?.display_name || 'Claude';
    const dir = path.basename(data.workspace?.current_dir || process.cwd());
    const session = data.session_id || '';
    const remaining = data.context_window?.remaining_percentage;

    // --- Bridge file (for context-monitor) ---
    const AUTO_COMPACT_BUFFER_PCT = 16.5;
    let used = 0;
    if (remaining != null) {
      const usableRemaining = Math.max(
        0,
        ((remaining - AUTO_COMPACT_BUFFER_PCT) / (100 - AUTO_COMPACT_BUFFER_PCT)) * 100,
      );
      used = Math.max(0, Math.min(100, Math.round(100 - usableRemaining)));

      if (session && !/[/\\]|\.\./.test(session)) {
        try {
          const bridgePath = path.join(os.tmpdir(), `claude-ctx-${session}.json`);
          fs.writeFileSync(
            bridgePath,
            JSON.stringify({
              session_id: session,
              remaining_percentage: remaining,
              used_pct: used,
              timestamp: Math.floor(Date.now() / 1000),
            }),
          );
        } catch {}
      }
    }

    // --- Render statusline ---
    let ctx = '';
    if (remaining != null) {
      const filled = Math.floor(used / 10);
      const bar = '\u2588'.repeat(filled) + '\u2591'.repeat(10 - filled);
      if (used < 50) {
        ctx = ` \x1b[32m${bar} ${used}%\x1b[0m`;
      } else if (used < 65) {
        ctx = ` \x1b[33m${bar} ${used}%\x1b[0m`;
      } else if (used < 80) {
        ctx = ` \x1b[38;5;208m${bar} ${used}%\x1b[0m`;
      } else {
        ctx = ` \x1b[5;31m${bar} ${used}%\x1b[0m`;
      }
    }

    process.stdout.write(
      `\x1b[2m${model}\x1b[0m \u2502 \x1b[2m${dir}\x1b[0m${ctx}`,
    );
  } catch {}
});
