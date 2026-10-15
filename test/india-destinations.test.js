import test from 'node:test';
import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
import { indiaDestinations, toPlannerPlace } from '../public/india-destinations.js';

const htmlUrl = new URL('../public/index.html', import.meta.url);
const serverUrl = new URL('../server.js', import.meta.url);

test('India field guide covers multiple regions with unique destinations and local photo-style images', async () => {
  const html = await readFile(htmlUrl, 'utf8');
  const credits = await readFile(new URL('../IMAGE_CREDITS.md', import.meta.url), 'utf8');
  assert.equal(indiaDestinations.length, 57);
  assert.equal(new Set(indiaDestinations.map((place) => place.id)).size, 57);
  assert.deepEqual(new Set(indiaDestinations.map((place) => place.regionKey)), new Set(['north', 'west', 'central', 'south', 'east', 'northeast', 'islands']));
  const expectedStatesAndTerritories = [
    'Andaman & Nicobar Islands', 'Andhra Pradesh', 'Arunachal Pradesh', 'Assam', 'Bihar', 'Chandigarh (UT)', 'Chhattisgarh',
    'Dadra & Nagar Haveli and Daman & Diu (UT)', 'Delhi (NCT)', 'Goa', 'Gujarat', 'Haryana', 'Himachal Pradesh', 'Jammu & Kashmir',
    'Jharkhand', 'Karnataka', 'Kerala', 'Ladakh', 'Lakshadweep (UT)', 'Madhya Pradesh', 'Maharashtra', 'Manipur', 'Meghalaya',
    'Mizoram', 'Nagaland', 'Odisha', 'Puducherry (UT)', 'Punjab', 'Rajasthan', 'Sikkim', 'Tamil Nadu', 'Telangana', 'Tripura',
    'Uttar Pradesh', 'Uttarakhand', 'West Bengal'
  ].sort();
  assert.deepEqual([...new Set(indiaDestinations.map((place) => place.state))].sort(), expectedStatesAndTerritories);
  for (const place of indiaDestinations) {
    assert.ok(place.name && place.state && place.about && place.tagline && place.alt, `incomplete place profile for ${place.id}`);
    assert.ok(place.highlights.length >= 3, `missing highlights for ${place.id}`);
    assert.ok(place.foods.length >= 2, `missing food notes for ${place.id}`);
    assert.ok(place.bestTime && place.timeNeeded && place.goodToKnow, `missing planning notes for ${place.id}`);
    assert.match(place.image, /^\/assets\/india\/[a-z0-9-]+\.jpg$/, `photo-style local JPG required for ${place.id}`);
    await access(new URL(`../public${place.image}`, import.meta.url));
    if (place.imageSource) {
      assert.match(place.imageSource, /^https:\/\/(?:unsplash\.com|commons\.wikimedia\.org)\//, `unexpected image source for ${place.id}`);
      assert.ok(credits.includes(place.imageSource), `image source missing from IMAGE_CREDITS.md for ${place.id}`);
    }
    if (place.imageSource?.includes('commons.wikimedia.org')) {
      assert.ok(place.imageCredit && place.imageLicense && place.imageLicenseLabel, `missing Commons attribution/license for ${place.id}`);
      assert.ok(credits.includes(place.imageCredit), `Commons attribution missing from IMAGE_CREDITS.md for ${place.id}`);
    }
    assert.equal((html.match(new RegExp(`value="${place.id}"`, 'g')) || []).length, 2, `${place.name} should be selectable in quick search and Trip Studio`);
    const planner = toPlannerPlace(place);
    for (const field of ['morning', 'lunch', 'afternoon', 'evening', 'themes']) assert.ok(planner[field].length > 0, `${field} planner ideas missing for ${place.id}`);
  }
  assert.match(html, /id="india-guide"/);
  assert.match(html, /id="india-search"/);
  assert.match(html, /id="india-region-filter"/);
  assert.match(html, /id="india-place-dialog"/);
  assert.match(await readFile(serverUrl, 'utf8'), /for \(const destination of indiaDestinations\) places\[destination\.id\] = toPlannerPlace\(destination\)/);
});
