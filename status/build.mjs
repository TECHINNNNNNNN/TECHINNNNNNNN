// build.mjs — the one line of this readme that writes itself.
// first draft with claude code, taste applied after.
//
// every hour a github action runs this script: it asks the github api what i
// pushed last and rewrites the line between the pulse markers in README.md.
// zero dependencies — node 22 native fetch. that's the whole trick.
//
// notes for the curious:
// - this repo is excluded from "last shipped", otherwise the bot's own hourly
//   commits would become the news forever.
// - if i haven't pushed anything public in two weeks, the line degrades to
//   something evergreen instead of advertising my quietest fortnight.
// - the bot commits with the noreply identity so hourly runs never inflate
//   my contribution graph.

import { readFileSync, writeFileSync } from 'node:fs';

const OWNER = 'TECHINNNNNNNN';
const PROFILE_REPO = 'TECHINNNNNNNN';
const ROOT = new URL('..', import.meta.url).pathname;

const escHtml = (s) =>
  String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

async function lastShipped() {
  const token = process.env.GITHUB_TOKEN;
  if (!token) return null;
  const query = `query { user(login: "${OWNER}") {
    repositories(first: 10, privacy: PUBLIC, isFork: false, ownerAffiliations: OWNER, orderBy: {field: PUSHED_AT, direction: DESC}) {
      nodes { name pushedAt defaultBranchRef { target { ... on Commit { messageHeadline } } } }
    } } }`;
  try {
    const res = await fetch('https://api.github.com/graphql', {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, 'user-agent': 'boom-pulse' },
      body: JSON.stringify({ query }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) return null;
    const nodes = (await res.json())?.data?.user?.repositories?.nodes ?? [];
    for (const n of nodes) {
      if (!n || n.name === PROFILE_REPO) continue; // the monitor doesn't get to be the news
      const head = n.defaultBranchRef?.target;
      if (!head?.messageHeadline || /^merge /i.test(head.messageHeadline)) continue;
      const ageMs = Date.now() - new Date(n.pushedAt).getTime();
      if (ageMs > 14 * 24 * 3600 * 1000) return null; // stale is not news either
      const hours = Math.max(1, Math.round(ageMs / 3600_000));
      const ago = hours < 48 ? `${hours}h ago` : `${Math.round(hours / 24)}d ago`;
      let msg = head.messageHeadline.toLowerCase().replace(/\s+/g, ' ').trim();
      if (msg.length > 56) msg = msg.slice(0, 55).trimEnd() + '…';
      return { msg, repo: n.name, ago };
    }
  } catch {
    return null; // a flaky api call should never take the page down with it
  }
  return null;
}

const shipped = await lastShipped();
const checkedAt = new Intl.DateTimeFormat('en-GB', {
  hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Bangkok',
}).format(new Date());

const summary = shipped
  ? `last shipped: "${escHtml(shipped.msg)}" → ${escHtml(shipped.repo)} · ${shipped.ago} · this line rewrote itself at ${checkedAt} bangkok time`
  : `heads down building · this line rewrote itself at ${checkedAt} bangkok time`;

const readmePath = `${ROOT}README.md`;
const readme = readFileSync(readmePath, 'utf8');
writeFileSync(readmePath, readme.replace(
  /<!-- pulse starts -->[\s\S]*?<!-- pulse ends -->/,
  // function replacement: commit messages with $-patterns must stay literal
  () => `<!-- pulse starts -->\n<p><samp>${summary}</samp></p>\n<!-- pulse ends -->`,
));

writeFileSync(`${ROOT}status/commit-msg.txt`, shipped ? `pulse: ${shipped.repo} · ${shipped.ago}\n` : 'pulse: steady\n');
console.log(summary);
