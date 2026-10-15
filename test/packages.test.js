import test from 'node:test';
import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';

const htmlUrl = new URL('../public/index.html', import.meta.url);
const scriptUrl = new URL('../public/app.js', import.meta.url);

test('every curated package has working detail, save and personalize targets plus local gallery assets', async () => {
  const [html, script] = await Promise.all([readFile(htmlUrl, 'utf8'), readFile(scriptUrl, 'utf8')]);
  const ids = [...html.matchAll(/data-package-id="([^"]+)"/g)].map((match) => match[1]);
  assert.equal(ids.length, 8, 'expected eight visible package cards');
  assert.equal(new Set(ids).size, ids.length, 'package IDs should be unique');
  for (const id of ids) {
    assert.match(html, new RegExp(`data-package-details="${id}"`));
    assert.match(html, new RegExp(`data-package-favorite="${id}"`));
    assert.match(html, new RegExp(`data-package-start="${id}"`));
    assert.ok(script.includes(`'${id}': {`), `missing itinerary detail record for ${id}`);
  }
  const galleryImages = [...script.matchAll(/'((?:\/assets\/)[^']+\.(?:jpg|webp))'/g)].map((match) => match[1]);
  for (const image of new Set(galleryImages)) await access(new URL(`../public${image}`, import.meta.url));
  assert.match(html, /id="page-loader"/);
  assert.match(html, /id="package-search"/);
  assert.match(html, /id="package-destination-filter"/);
});
