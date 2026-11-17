#!/usr/bin/env node
/*
 * 拾光集 · 每日数据更新脚本（零依赖，Node 18+）
 * 用法：node update.js
 * 功能：抓取今日 NASA APOD 与 Bing 每日一图，下载图片到 assets/，
 *      生成 data.js 供页面直接读取（file:// 打开也不受跨域限制）。
 * 定时：可在 Windows 任务计划程序中每天早上执行一次本脚本。
 */
const fs = require('fs');
const path = require('path');

const NASA_KEY = 'fLF78jP68Pn7QtrhMN67L98pwqcj8LjRRzmFf98d'; // 个人 key（api.nasa.gov 注册）
const dir = __dirname;

function cnDate() {
  const n = new Date();
  return n.getFullYear() + '.' + String(n.getMonth() + 1).padStart(2, '0') + '.' + String(n.getDate()).padStart(2, '0');
}
function ymd(d) { return d.toISOString().slice(0, 10); }

async function fetchJson(url) {
  const r = await fetch(url, { signal: AbortSignal.timeout(20000) });
  if (!r.ok) throw new Error('HTTP ' + r.status);
  return r.json();
}
async function download(url, file) {
  const r = await fetch(url, { signal: AbortSignal.timeout(60000) });
  if (!r.ok) throw new Error('HTTP ' + r.status + ' ' + url);
  fs.writeFileSync(file, Buffer.from(await r.arrayBuffer()));
}

function stripTags(s) {
  return s.replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&').replace(/&nbsp;/g, ' ').replace(/&#0?38;/g, '&')
    .replace(/\s+([,.!?;:])/g, '$1').replace(/\s+/g, ' ').trim();
}

// 备用通道：API 故障时直接抓取 APOD 官方页面（新版 NASA Science 版式）
async function getNasaFromPage() {
  try {
    const r = await fetch('https://apod.nasa.gov/apod/astropix.html', { signal: AbortSignal.timeout(30000) });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const html = await r.text();
    // 特征图：src 在 class 之前出现
    const img = html.match(/<img[^>]*\ssrc="([^"]+)"[^>]*class="smd-image-rollover__image[^"]*--primary"/i)
      || html.match(/class="smd-image-rollover__image[^"]*--primary"[^>]*\ssrc="([^"]+)"/i);
    // 标题：说明段落之前的那个 h2
    const descIdx = html.indexOf('media-detail-hero__description');
    const h2Idx = descIdx > -1 ? html.lastIndexOf('<h2', descIdx) : -1;
    const titleM = h2Idx > -1 ? html.slice(h2Idx).match(/<h2[^>]*>([\s\S]*?)<\/h2>/i) : null;
    // 说明：Explanation: 加粗起头，到 </p> 结束
    const explM = html.match(/<strong>Explanation:<\/strong>([\s\S]*?)<\/p>/i);
    if (!img || !img[1]) return null;
    const local = 'assets/nasa-today.jpg';
    let src = img[1];
    try { await download(img[1], path.join(dir, local)); src = local; } catch (e) { /* 下载失败则热链远程地址 */ }
    return {
      title: (titleM ? stripTags(titleM[1]) : '') || 'Astronomy Picture of the Day',
      desc: explM ? stripTags(explM[1]).replace(/Tomorrow's picture:.*$/is, '').trim() : '',
      src: src,
      meta: cnDate() + ' · NASA APOD'
    };
  } catch (e) { console.log('[NASA 网页] 失败: ' + e.message); return null; }
}

async function getNasa() {
  // 依次尝试：今天 → 昨天 → 前天（NASA 偶尔会有坏条目，如把 logo 当图返回）
  const tries = [0, -86400000, -172800000].map(off => ymd(new Date(Date.now() + off)));
  for (const date of tries) {
    try {
      const u = 'https://api.nasa.gov/planetary/apod?api_key=' + NASA_KEY + '&date=' + date;
      const d = await fetchJson(u);
      const bad = !d.url || d.media_type !== 'image'
        || /nasa-logo|nasa\.gov\/wp-content\/themes/i.test(d.url)
        || d.title === 'NASA Science';
      if (bad) { console.log('[NASA] ' + date + ' 条目异常，尝试前一天'); continue; }
      const src0 = d.hdurl || d.url;
      const local = 'assets/nasa-today.jpg';
      let src = src0;
      try { await download(src0, path.join(dir, local)); src = local; } catch (e) { /* 下载失败则热链远程地址 */ }
      const desc = (d.explanation || '').replace(/Tomorrow's picture:.*$/is, '').trim();
      return {
        title: d.title || 'Astronomy Picture of the Day',
        desc: desc,
        src: src,
        meta: (d.date || '') + (d.copyright ? (' · © ' + d.copyright) : ' · NASA APOD')
      };
    } catch (e) { console.log('[NASA] ' + date + ' 失败: ' + e.message); }
  }
  // API 整体故障（返回占位符）时，改抓官方页面
  console.log('[NASA] API 侧数据异常，切换网页抓取通道');
  return getNasaFromPage();
}

async function getBing() {
  try {
    const d = await fetchJson('https://cn.bing.com/HPImageArchive.aspx?format=js&idx=0&n=1');
    const im = d.images && d.images[0];
    if (!im) return null;
    const img = 'https://cn.bing.com' + im.url;
    const local = 'assets/bing-today.jpg';
    let src = img;
    try { await download(img, path.join(dir, local)); src = local; } catch (e) { /* 同上 */ }
    return {
      title: im.title || '今日之窗',
      desc: im.copyright || '',
      src: src,
      meta: cnDate() + ' · bing.com 每日壁纸'
    };
  } catch (e) { console.log('[Bing] 失败: ' + e.message); return null; }
}

(async () => {
  console.log('拾光集 · 数据更新 ' + cnDate());
  const nasa = await getNasa();
  const bing = await getBing();
  const data = { generated: new Date().toISOString(), date: cnDate(), nasa: nasa, bing: bing };
  fs.writeFileSync(path.join(dir, 'data.js'),
    '// 由 update.js 自动生成，请勿手改\nwindow.DAILY_DATA = ' + JSON.stringify(data, null, 2) + ';\n');
  console.log('✔ data.js 已生成   NASA: ' + (nasa ? '✔' : '✘（页面走兜底藏品）') + '   Bing: ' + (bing ? '✔' : '✘（页面走兜底藏品）'));
})();
