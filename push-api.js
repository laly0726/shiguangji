#!/usr/bin/env node
/*
 * 拾光集 · API 推送兜底（零依赖）
 * 用途：当 github.com 主站 443 不通（git push 失败）时，改走 api.github.com
 *      的 Git Data API 直接提交文件。api.github.com 与 github.com 通常是
 *      不同的网络路径，主站被卡时 API 往往仍可用。
 * 用法：node push-api.js [文件1 文件2 ...]   （缺省提交 data.js）
 * token 从本地 token.txt 读取（已被 .gitignore 排除）。
 */
const fs = require('fs');
const path = require('path');

const REPO = 'laly0726/shiguangji';
const dir = __dirname;

function readToken() {
  try { return fs.readFileSync(path.join(dir, 'token.txt'), 'utf8').replace(/\s+/g, ''); }
  catch (e) { return ''; }
}

async function post(url, body, H) {
  const r = await fetch(url, { method: 'POST', headers: { ...H, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error('POST ' + url.split('/repos/')[1] + ' -> ' + r.status + ' ' + (d.message || ''));
  return d;
}

(async () => {
  const token = readToken();
  if (!/^ghp_|^github_/.test(token)) { console.error('[API推送] token.txt 无效或不存在'); process.exit(1); }
  const files = process.argv.slice(2).length ? process.argv.slice(2) : ['data.js'];
  const H = { 'Authorization': 'token ' + token, 'Accept': 'application/vnd.github+json', 'User-Agent': 'shiguangji-updater' };
  const api = 'https://api.github.com/repos/' + REPO;

  const ref = await fetch(api + '/git/ref/heads/main', { headers: H }).then(r => { if (!r.ok) throw new Error('ref -> ' + r.status); return r.json(); });
  const head = ref.object.sha;
  const commit = await fetch(api + '/git/commits/' + head, { headers: H }).then(r => { if (!r.ok) throw new Error('commit -> ' + r.status); return r.json(); });

  const entries = [];
  for (const f of files) {
    const p = path.join(dir, f);
    if (!fs.existsSync(p)) { console.log('[API推送] 跳过不存在的文件: ' + f); continue; }
    const blob = await post(api + '/git/blobs', { content: fs.readFileSync(p, 'utf8'), encoding: 'utf-8' }, H);
    entries.push({ path: f.replace(/\\/g, '/'), mode: '100644', type: 'blob', sha: blob.sha });
  }
  if (!entries.length) { console.log('[API推送] 无可提交文件'); process.exit(0); }

  const tree = await post(api + '/git/trees', { base_tree: commit.tree.sha, tree: entries }, H);
  const nc = await post(api + '/git/commits', {
    message: 'daily refresh ' + new Date().toISOString().slice(0, 10) + ' (via API)',
    tree: tree.sha, parents: [head]
  }, H);
  await post(api + '/git/refs/heads/main', { sha: nc.sha, force: false }, H);
  console.log('✔ API 推送完成 ' + nc.sha.slice(0, 8) + '，文件: ' + entries.map(e => e.path).join(', '));
  console.log('  提示：下次 github.com 可达时执行 git pull --rebase 同步本地历史');
})().catch(e => { console.error('[API推送] 失败: ' + e.message); process.exit(1); });
