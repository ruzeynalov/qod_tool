import { chromium, devices } from '@playwright/test';
const b = await chromium.launch();
const ctx = await b.newContext({ ...devices['iPhone 14'], defaultBrowserType: 'chromium', userAgent: undefined });
const p = await ctx.newPage();
await p.addInitScript(() => localStorage.setItem('qod-demo-mode','true'));
await p.goto('http://127.0.0.1:3002/projects/demo-ecommerce', { waitUntil: 'networkidle' });
const result = await p.evaluate(() => {
  const html = document.documentElement;
  const body = document.body;
  const ow = html.scrollWidth - html.clientWidth;
  // walk all elements and find ones whose right edge is past viewport
  const offenders = [];
  const all = document.querySelectorAll('*');
  for (const el of all) {
    const r = el.getBoundingClientRect();
    if (r.right > html.clientWidth + 1) {
      offenders.push({
        tag: el.tagName.toLowerCase(),
        cls: (el.className && typeof el.className === 'string' ? el.className.slice(0, 80) : ''),
        right: Math.round(r.right),
        width: Math.round(r.width),
        scrollW: el.scrollWidth,
      });
    }
  }
  // top 10 widest offenders
  offenders.sort((a, b) => b.width - a.width);
  return { overflow: ow, viewport: html.clientWidth, top10: offenders.slice(0, 12) };
});
console.log(JSON.stringify(result, null, 2));
await b.close();
