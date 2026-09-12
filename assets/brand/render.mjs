// Render editable native layouts, then check that the complete kit remains usable.
// Run from the repository: node assets/brand/render.mjs
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
const require = createRequire(new URL('../../app/package.json', import.meta.url));
const { chromium } = require('@playwright/test');
const browser = await chromium.launch();
const page = await browser.newPage({ deviceScaleFactor: 1 });
const errors = [];
page.on('pageerror', error => errors.push(error.message));
page.on('requestfailed', request => errors.push(request.url()));
const output = name => fileURLToPath(new URL(name, import.meta.url));
async function ready() {
  await page.evaluate(async () => {
    await document.fonts.ready;
    await Promise.all(Array.from(document.images, image => image.decode()));
  });
}
try {
  for (const [name, width, height] of [
    ['brand-board', 1600, 1200], ['social-card', 1200, 630],
    ['demo-cover', 1920, 1080], ['whiteboard-sheet', 1600, 1320],
  ]) {
    await page.setViewportSize({ width, height });
    await page.goto(new URL(`index.html#${name}`, import.meta.url).href);
    await ready();
    const art = page.locator(`#${name}`);
    const box = await art.boundingBox();
    assert.equal(box.width, width);
    assert.equal(box.height, height);
    const overflow = await art.evaluate(element => [...element.querySelectorAll('*')].filter(child => {
      if (child.classList.contains('demo-curve') || child.classList.contains('social-orbit') || child.classList.contains('social-art')) return false;
      const box = child.getBoundingClientRect(), parent = element.getBoundingClientRect();
      return box.width && box.height && (box.bottom > parent.bottom + 1 || box.right > parent.right + 1 || box.left < parent.left - 1 || box.top < parent.top - 1);
    }).map(element => element.className || element.tagName));
    assert.deepEqual(overflow, [], `${name}: content exceeds artboard`);
    await art.screenshot({ path: output(`${name}.png`) });
    console.log(`${name}.png: ${width} × ${height}`);
  }
  for (const size of [32, 128, 512]) {
    await page.setViewportSize({ width: size, height: size });
    await page.goto(new URL('mark.svg', import.meta.url).href);
    await page.locator('svg').evaluate((svg, size) => { svg.setAttribute('width', size); svg.setAttribute('height', size); }, size);
    await page.screenshot({ path: output(`mark-${size}.png`), omitBackground: true });
  }
  for (const name of ['logo', 'logo-reversed']) {
    await page.setViewportSize({ width: 960, height: 200 });
    await page.goto(new URL(`${name}.svg`, import.meta.url).href);
    await page.locator('svg').first().evaluate(svg => { svg.setAttribute('width', '960'); svg.setAttribute('height', '200'); });
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({ path: output(`${name}.png`), omitBackground: true });
  }
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto(new URL('index.html', import.meta.url).href);
    await ready();
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `Gallery overflows at ${width}px`);
  }
  assert.deepEqual(errors, [], 'Browser errors');
  console.log('PASS: native exports, loaded images, artboard boundaries, responsive gallery, and browser errors.');
} finally {
  await browser.close();
}
