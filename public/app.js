import { indiaDestinations, toPlannerPlace } from './india-destinations.js?v=india-guide-4';

/* Triwal Traviator front-end. Itinerary preferences are sent to the first-party planner API on request; contact details are sent only on enquiry submission. */
document.documentElement.classList.add('js');

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// A brief, non-blocking brand loader; fail-safe and load-event paths both release it.
const pageLoader = $('#page-loader');
const pageMain = $('#main');
const loaderStartedAt = performance.now();
let loaderFinished = false;
if (pageLoader) {
  pageLoader.hidden = false;
  pageLoader.removeAttribute('aria-hidden');
  document.body.classList.add('is-loading');
  pageMain?.setAttribute('aria-busy', 'true');
}
function finishPageLoader(fast = false) {
  if (!pageLoader || loaderFinished) return;
  loaderFinished = true;
  const minimumShow = reducedMotion ? 0 : 520;
  const wait = fast ? 0 : Math.max(0, minimumShow - (performance.now() - loaderStartedAt));
  window.setTimeout(() => {
    pageLoader.classList.add('is-leaving');
    pageLoader.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('is-loading');
    pageMain?.removeAttribute('aria-busy');
    window.setTimeout(() => { pageLoader.hidden = true; pageLoader.classList.remove('is-leaving'); }, reducedMotion ? 0 : 500);
  }, wait);
}
if (document.readyState === 'complete') finishPageLoader();
else window.addEventListener('load', () => finishPageLoader(), { once: true });
window.setTimeout(() => finishPageLoader(true), 4500);
$('#skip-loader')?.addEventListener('click', () => finishPageLoader(true));

// A quiet reading-progress line gives the long, editorial page a little movement.
const scrollProgressFill = $('#scroll-progress-fill');
let scrollProgressQueued = false;
function updateScrollProgress() {
  if (!scrollProgressFill) return;
  const maxScroll = document.documentElement.scrollHeight - window.innerHeight;
  const progress = maxScroll > 0 ? Math.max(0, Math.min(1, window.scrollY / maxScroll)) : 0;
  scrollProgressFill.style.transform = `scaleX(${progress})`;
}
updateScrollProgress();
window.addEventListener('scroll', () => {
  if (scrollProgressQueued) return;
  scrollProgressQueued = true;
  window.requestAnimationFrame(() => {
    updateScrollProgress();
    scrollProgressQueued = false;
  });
}, { passive: true });

// Progressive reveal: content remains visible if IntersectionObserver is unavailable.
const revealItems = $$('[data-reveal="rise"]');
if ('IntersectionObserver' in window && !reducedMotion) {
  const revealObserver = new IntersectionObserver((entries, observer) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add('is-visible');
        observer.unobserve(entry.target);
      }
    });
  }, { threshold: 0.1, rootMargin: '0px 0px -28px 0px' });
  revealItems.forEach((item) => revealObserver.observe(item));
} else {
  revealItems.forEach((item) => item.classList.add('is-visible'));
}

// Compact, keyboard-friendly mobile navigation.
const menuToggle = $('.menu-toggle');
const primaryNav = $('#primary-nav');
function closeMobileNav() {
  if (!menuToggle || !primaryNav) return;
  menuToggle.setAttribute('aria-expanded', 'false');
  menuToggle.setAttribute('aria-label', 'Open menu');
  primaryNav.classList.remove('is-open');
}
menuToggle?.addEventListener('click', () => {
  const isOpen = menuToggle.getAttribute('aria-expanded') === 'true';
  menuToggle.setAttribute('aria-expanded', String(!isOpen));
  menuToggle.setAttribute('aria-label', isOpen ? 'Open menu' : 'Close menu');
  primaryNav?.classList.toggle('is-open', !isOpen);
});
$$('#primary-nav a').forEach((link) => link.addEventListener('click', closeMobileNav));
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') closeMobileNav();
});

// Sticky header treatment.
const header = $('.site-header');
const updateHeader = () => header?.classList.toggle('is-scrolled', window.scrollY > 8);
updateHeader();
window.addEventListener('scroll', updateHeader, { passive: true });

// Dates are constrained to today or later; the agency confirms actual availability separately.
const quickDate = $('#search-date');
if (quickDate) {
  const today = new Date();
  const localToday = new Date(today.getTime() - today.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
  quickDate.min = localToday;
}

// Discovery filters work together with the quick-search form.
const destinationCards = $$('[data-destination-card]');
const filterButtons = $$('.filter-chip');
const emptyFilter = $('#empty-filter');
const searchStatus = $('#search-status');
let activeTag = 'all';
let activePlace = null;
function applyJourneyFilters() {
  let shown = 0;
  destinationCards.forEach((card) => {
    const tags = (card.dataset.tags || '').split(/\s+/);
    const matchesTag = activeTag === 'all' || tags.includes(activeTag);
    const matchesPlace = !activePlace || card.dataset.place === activePlace;
    const visible = matchesTag && matchesPlace;
    card.classList.toggle('is-filtered-out', !visible);
    if (visible) shown += 1;
  });
  if (emptyFilter) emptyFilter.hidden = shown !== 0;
}
filterButtons.forEach((button) => {
  button.addEventListener('click', () => {
    activeTag = button.dataset.filter || 'all';
    activePlace = null;
    filterButtons.forEach((chip) => {
      const selected = chip === button;
      chip.classList.toggle('is-active', selected);
      chip.setAttribute('aria-pressed', String(selected));
    });
    applyJourneyFilters();
    if (searchStatus) searchStatus.textContent = activeTag === 'all' ? 'Showing every handpicked starting point.' : `Showing journeys for ${button.textContent.trim().toLowerCase()}.`;
  });
});

$('#quick-search')?.addEventListener('submit', (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const data = new FormData(form);
  const place = String(data.get('destination') || 'any');
  const date = String(data.get('date') || '');
  const travelers = String(data.get('travelers') || '2');
  if (place === 'india' || indiaDestinationById.has(place)) {
    activeTag = 'all';
    activePlace = null;
    filterButtons.forEach((chip) => {
      const selected = chip.dataset.filter === 'all';
      chip.classList.toggle('is-active', selected);
      chip.setAttribute('aria-pressed', String(selected));
    });
    applyJourneyFilters();
    indiaSearchInput.value = '';
    indiaRegionFilter.value = 'all';
    selectedIndiaPlaceId = place === 'india' ? null : place;
    activeIndiaTag = 'all';
    indiaThemeButtons.forEach((chip) => {
      const selected = chip.dataset.indiaTag === 'all';
      chip.classList.toggle('is-active', selected);
      chip.setAttribute('aria-pressed', String(selected));
    });
    applyIndiaFilters();
    if (searchStatus) searchStatus.textContent = place === 'india'
      ? 'Opening the India field guide with every region ready to explore.'
      : `Opening the India field guide for ${indiaDestinationById.get(place).name}.`;
    $('#india-guide')?.scrollIntoView({ behavior: reducedMotion ? 'auto' : 'smooth', block: 'start' });
    return;
  }
  activeTag = 'all';
  activePlace = place === 'any' ? null : place;
  filterButtons.forEach((chip) => {
    const selected = chip.dataset.filter === 'all';
    chip.classList.toggle('is-active', selected);
    chip.setAttribute('aria-pressed', String(selected));
  });
  applyJourneyFilters();
  const placeLabel = place === 'any' ? 'all our starting points' : (form.querySelector(`[value="${CSS.escape(place)}"]`)?.textContent || 'your chosen place');
  const dateLabel = date ? ` for ${new Date(`${date}T12:00:00`).toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}` : '';
  const travelerLabel = travelers === '1' ? 'one traveller' : `${travelers === '6' ? '6+' : travelers} travellers`;
  if (searchStatus) {
    searchStatus.textContent = place !== 'any' && destinationCards.every((card) => card.dataset.place !== place)
      ? `We'd love to plan ${placeLabel}${dateLabel} for ${travelerLabel}. Tell us more in the trip studio.`
      : `A lovely start: ${placeLabel}${dateLabel}, for ${travelerLabel}. Browse the ideas below or make a personal plan.`;
  }
  $('#journeys')?.scrollIntoView({ behavior: reducedMotion ? 'auto' : 'smooth', block: 'start' });
});

// Searchable India field guide. Destination facts and planner profiles share one data source.
const indiaDestinationById = new Map(indiaDestinations.map((place) => [place.id, place]));
const indiaGrid = $('#india-destination-grid');
const indiaSearchInput = $('#india-search');
const indiaRegionFilter = $('#india-region-filter');
const indiaThemeButtons = $$('.india-theme-chip');
const indiaResultCount = $('#india-result-count');
const indiaEmpty = $('#india-empty');
const indiaDialog = $('#india-place-dialog');
let activeIndiaTag = 'all';
let selectedIndiaPlaceId = null;
let activeIndiaPlace = null;

function createIndiaCard(place, index) {
  const card = document.createElement('article');
  card.className = 'india-card';
  card.dataset.indiaCard = place.id;
  const visual = document.createElement('div');
  visual.className = 'india-card-visual';
  const image = document.createElement('img');
  image.src = place.image;
  image.alt = place.alt;
  image.loading = 'lazy';
  image.decoding = 'async';
  const visualShade = document.createElement('span');
  visualShade.className = 'india-card-shade';
  visualShade.setAttribute('aria-hidden', 'true');
  const photoButton = document.createElement('button');
  photoButton.className = 'india-card-photo-button';
  photoButton.type = 'button';
  photoButton.dataset.indiaDetails = place.id;
  photoButton.setAttribute('aria-label', `Open the ${place.name} destination guide`);
  const region = document.createElement('span');
  region.className = 'india-card-region';
  region.textContent = place.region;
  const indexLabel = document.createElement('span');
  indexLabel.className = 'india-card-index';
  indexLabel.textContent = `${String(index + 1).padStart(2, '0')} / ${String(indiaDestinations.length).padStart(2, '0')}`;
  visual.append(image, visualShade, photoButton, region, indexLabel);

  const copy = document.createElement('div');
  copy.className = 'india-card-copy';
  const state = document.createElement('p');
  state.className = 'india-card-state';
  state.textContent = place.state;
  const title = document.createElement('h3');
  title.textContent = place.name;
  const tagline = document.createElement('p');
  tagline.className = 'india-card-tagline';
  tagline.textContent = place.tagline;
  const chips = document.createElement('div');
  chips.className = 'india-card-tags';
  place.tags.slice(0, 3).forEach((tag) => {
    const chip = document.createElement('span');
    chip.textContent = ({ culture: 'Heritage', nature: 'Nature', food: 'Food', coast: 'Coast', spiritual: 'Sacred sites', wildlife: 'Wildlife' })[tag] || tag;
    chips.append(chip);
  });
  const action = document.createElement('button');
  action.className = 'india-card-action';
  action.type = 'button';
  action.dataset.indiaDetails = place.id;
  action.setAttribute('aria-label', `Explore ${place.name}: about, highlights, local food and planning notes`);
  action.innerHTML = '<span>Explore this place</span><span aria-hidden="true">↗</span>';
  copy.append(state, title, tagline, chips, action);
  card.append(visual, copy);
  return card;
}

function renderIndiaCards() {
  if (!indiaGrid) return;
  const fragment = document.createDocumentFragment();
  indiaDestinations.forEach((place, index) => fragment.append(createIndiaCard(place, index)));
  indiaGrid.replaceChildren(fragment);
}

function applyIndiaFilters() {
  const query = (indiaSearchInput?.value || '').trim().toLocaleLowerCase();
  const region = indiaRegionFilter?.value || 'all';
  let shown = 0;
  $$('.india-card', indiaGrid || document).forEach((card) => {
    const place = indiaDestinationById.get(card.dataset.indiaCard);
    if (!place) return;
    const searchText = [place.name, place.state, place.region, place.tagline, place.about, place.route, place.bestTime, place.goodToKnow, ...place.highlights, ...place.foods].join(' ').toLocaleLowerCase();
    const matchesQuery = !query || searchText.includes(query);
    const matchesRegion = region === 'all' || place.regionKey === region;
    const matchesTag = activeIndiaTag === 'all' || place.tags.includes(activeIndiaTag);
    const matchesPinnedPlace = !selectedIndiaPlaceId || place.id === selectedIndiaPlaceId;
    const visible = matchesQuery && matchesRegion && matchesTag && matchesPinnedPlace;
    card.hidden = !visible;
    if (visible) shown += 1;
  });
  if (indiaResultCount) indiaResultCount.textContent = selectedIndiaPlaceId
    ? `Showing ${shown} selected India destination.`
    : `Showing ${shown} of ${indiaDestinations.length} India destinations.`;
  if (indiaEmpty) indiaEmpty.hidden = shown !== 0;
}

function fillIndiaList(target, items) {
  if (!target) return;
  target.replaceChildren(...items.map((item) => {
    const li = document.createElement('li');
    li.textContent = safeText(item, 320);
    return li;
  }));
}

function openIndiaDetails(id) {
  const place = indiaDestinationById.get(id);
  if (!place || !indiaDialog) return;
  activeIndiaPlace = place;
  const image = $('#india-place-image');
  image.src = place.image;
  image.alt = place.alt;
  $('#india-place-kicker').textContent = `${place.region} · ${place.state}`;
  $('#india-place-title').textContent = place.name;
  $('#india-place-tagline').textContent = place.tagline;
  $('#india-place-about').textContent = place.about;
  $('#india-place-route').textContent = place.route;
  $('#india-place-note').textContent = place.goodToKnow;
  const imageSource = $('#india-image-source');
  imageSource.hidden = !place.imageSource;
  if (place.imageSource) imageSource.href = place.imageSource;
  const imageProvider = place.imageSource?.includes('commons.wikimedia.org') ? 'Wikimedia Commons' : 'Unsplash';
  $('#india-image-type').textContent = place.imageSource ? `Photograph · ${imageProvider}` : 'AI-generated photo-style illustration';
  const credit = $('#india-image-credit');
  credit.replaceChildren();
  if (place.imageCredit && place.imageLicense) {
    const licenseLink = document.createElement('a');
    licenseLink.href = place.imageLicense;
    licenseLink.target = '_blank';
    licenseLink.rel = 'noopener noreferrer';
    licenseLink.textContent = place.imageLicenseLabel || 'Creative Commons license';
    credit.append(document.createTextNode(`Photo by ${place.imageCredit}. Local web copy; display crop may vary. License: `), licenseLink, document.createTextNode('.'));
    credit.hidden = false;
  } else {
    credit.hidden = true;
  }
  fillIndiaList($('#india-place-highlights'), place.highlights);
  fillIndiaList($('#india-place-foods'), place.foods);
  const facts = [
    ['State / territory', place.state],
    ['Region', place.region],
    ['Time to set aside', place.timeNeeded],
    ['Often most comfortable', place.bestTime]
  ];
  const factsTarget = $('#india-place-facts');
  factsTarget.replaceChildren(...facts.map(([label, value]) => {
    const fact = document.createElement('div');
    fact.className = 'india-fact';
    const term = document.createElement('dt');
    term.textContent = label;
    const detail = document.createElement('dd');
    detail.textContent = safeText(value, 220);
    fact.append(term, detail);
    return fact;
  }));
  indiaDialog.scrollTop = 0;
  if (typeof indiaDialog.showModal === 'function') indiaDialog.showModal();
  else indiaDialog.setAttribute('open', '');
  document.body.classList.add('dialog-open');
}

renderIndiaCards();
applyIndiaFilters();
indiaSearchInput?.addEventListener('input', () => {
  selectedIndiaPlaceId = null;
  applyIndiaFilters();
});
indiaRegionFilter?.addEventListener('change', () => {
  selectedIndiaPlaceId = null;
  applyIndiaFilters();
});
indiaThemeButtons.forEach((button) => button.addEventListener('click', () => {
  activeIndiaTag = button.dataset.indiaTag || 'all';
  selectedIndiaPlaceId = null;
  indiaThemeButtons.forEach((chip) => {
    const selected = chip === button;
    chip.classList.toggle('is-active', selected);
    chip.setAttribute('aria-pressed', String(selected));
  });
  applyIndiaFilters();
}));
indiaGrid?.addEventListener('click', (event) => {
  const button = event.target.closest('[data-india-details]');
  if (button) openIndiaDetails(button.dataset.indiaDetails);
});
$('#clear-india-filters')?.addEventListener('click', () => {
  if (indiaSearchInput) indiaSearchInput.value = '';
  if (indiaRegionFilter) indiaRegionFilter.value = 'all';
  selectedIndiaPlaceId = null;
  activeIndiaTag = 'all';
  indiaThemeButtons.forEach((button) => {
    const selected = button.dataset.indiaTag === 'all';
    button.classList.toggle('is-active', selected);
    button.setAttribute('aria-pressed', String(selected));
  });
  applyIndiaFilters();
  indiaSearchInput?.focus();
});
$('#india-dialog-close')?.addEventListener('click', () => indiaDialog?.close());
indiaDialog?.addEventListener('click', (event) => { if (event.target === indiaDialog) indiaDialog.close(); });
indiaDialog?.addEventListener('close', () => {
  activeIndiaPlace = null;
  if (!$('#package-dialog')?.open && !$('#inquiry-dialog')?.open) document.body.classList.remove('dialog-open');
});
$('#india-place-plan')?.addEventListener('click', () => {
  if (!activeIndiaPlace || !placeSelect) return;
  const place = activeIndiaPlace;
  const range = $('#trip-days');
  const suggestedDays = (place.timeNeeded.match(/\d+/g) || []).map(Number);
  if (range && suggestedDays.length) range.value = String(Math.max(3, Math.min(12, Math.round(suggestedDays.reduce((sum, day) => sum + day, 0) / suggestedDays.length))));
  placeSelect.value = place.id;
  updateDaysOutput();
  clearActivePackage();
  if (plannerResult) plannerResult.hidden = true;
  indiaDialog?.close();
  showToast(`${place.name} is ready in the Trip Studio. Adjust the route to suit you.`);
  $('#studio')?.scrollIntoView({ behavior: reducedMotion ? 'auto' : 'smooth', block: 'start' });
});

// Pick a place card and carry that choice into the Trip Studio.
const placeSelect = $('#trip-destination');
$$('[data-plan-destination]').forEach((button) => {
  button.addEventListener('click', () => {
    const place = button.dataset.planDestination;
    if (placeSelect && place) placeSelect.value = place;
    const card = button.closest('[data-destination-card]');
    const placeName = card?.querySelector('h3')?.textContent.replace(/\s+/g, ' ').trim() || 'Your chosen destination';
    showToast(`${placeName} is ready in the Trip Studio. Make it your own.`);
    $('#studio')?.scrollIntoView({ behavior: reducedMotion ? 'auto' : 'smooth', block: 'start' });
  });
});

// Live day-count output for the planner.
const daysRange = $('#trip-days');
const daysOutput = $('#days-output');
function updateDaysOutput() {
  if (daysRange && daysOutput) daysOutput.value = `${daysRange.value} ${Number(daysRange.value) === 1 ? 'day' : 'days'}`;
}
daysRange?.addEventListener('input', updateDaysOutput);
updateDaysOutput();

const placeDetails = {
  kyoto: {
    name: 'Kyoto', country: 'Japan',
    morning: ['Walk the vermilion gates of Fushimi Inari before the lanes wake.', 'Visit a quiet temple garden, then pause for matcha in a neighbourhood tea room.', 'Follow the Philosopher’s Path while the city is still finding its feet.', 'Browse Nishiki Market slowly, with room for a second breakfast.'],
    lunch: ['Settle into a small soba shop and try the seasonal special.', 'Make time for a set lunch of Kyoto vegetables and delicate dashi.', 'Choose a counter seat for a comforting bowl of noodles and local pickles.'],
    afternoon: ['Wander the wooden lanes of Higashiyama and step into a family-run craft shop.', 'Explore a pocket-sized museum, then take the long way along the river.', 'Visit a second garden only if the first one leaves you wanting more.'],
    evening: ['Book a relaxed kaiseki dinner, or ask for a neighbourhood favourite.', 'Let lantern-lit Pontocho set the pace for an unhurried evening.', 'Keep the evening open for a small izakaya and whatever catches your eye.'],
    themes: ['A softer start in the old capital', 'Garden paths and good things to eat', 'The city between the guidebook lines', 'A little craft, a little quiet']
  },
  bhutan: {
    name: 'Bhutan', country: 'Bhutan',
    morning: ['Take a slow valley walk while the hills catch their first light.', 'Climb the path to a hilltop monastery with time for rest and tea.', 'Visit a local market with a guide who knows the small stories behind it.', 'Begin with a gentle stretch and a mountain-view breakfast.'],
    lunch: ['Try ema datshi and red rice at a welcoming family-run table.', 'Pause for a simple seasonal lunch and a view of the valley below.', 'Share buckwheat pancakes and local cheese at a roadside stop.'],
    afternoon: ['Explore a dzong courtyard and learn how the town gathers around it.', 'Leave an open hour for a village visit or a riverside pause.', 'Follow a pine-forest trail at a pace that lets you notice the prayer flags.'],
    evening: ['Watch the valley light change before a warming local supper.', 'Wind down with tea and a quiet evening at your lodge.', 'Share a home-style meal and ask your host what to see tomorrow.'],
    themes: ['Arrive gently in the high valley', 'Paths, prayer flags and a slower pace', 'A hillside day with time to breathe', 'Small encounters, wide horizons']
  },
  rajasthan: {
    name: 'Rajasthan', country: 'India',
    morning: ['Walk the old quarter before the sun reaches the painted havelis.', 'Visit an artisan workshop and hear how the family craft is passed on.', 'Start early at a fort, with time to linger over the details and the view.', 'Find a quiet courtyard for chai before the city stirs.'],
    lunch: ['Try a home-style thali with regional dishes and a little explanation.', 'Settle into a shaded haveli courtyard for a slow lunch.', 'Follow a local recommendation to a beloved vegetarian kitchen.'],
    afternoon: ['Wander the bazaars with an easy list and space for a detour.', 'Drive out toward the desert edge for a village visit and a golden-hour walk.', 'Cool down at your hotel before one more beautiful old lane.'],
    evening: ['Watch the sandstone turn amber, then choose a rooftop dinner.', 'Share a relaxed supper of dal baati churma and seasonal favourites.', 'Let a folk-music evening end early enough for a good night’s sleep.'],
    themes: ['Colour in the old city', 'Craft, courtyards and a very good lunch', 'The long way through the bazaar', 'A golden-hour kind of day']
  },
  amalfi: {
    name: 'Amalfi Coast', country: 'Italy',
    morning: ['Start with a cliffside walk before the day-trippers arrive.', 'Take a slow breakfast, then follow a lemon-scented lane toward the sea.', 'Catch an early ferry and watch the coastline unfold from the water.', 'Leave the morning loose for a swim, a coffee, or both.'],
    lunch: ['Find a family trattoria for just-caught fish and a long lunch.', 'Order pasta al limone on a shaded terrace above the water.', 'Stop for a bakery picnic and let the view choose the table.'],
    afternoon: ['Browse a small ceramics studio, then take the quieter path back.', 'Spend a few hours by the water with absolutely nothing to prove.', 'Visit a neighbouring village by ferry and follow the lane that looks lovely.'],
    evening: ['Aperitivo as the light softens, followed by dinner at a booked table.', 'Take the scenic walk home after a sea-view supper.', 'Keep sunset unscheduled and let the evening sort itself out.'],
    themes: ['Arrive to sea air and no rush', 'Village lanes and a proper long lunch', 'A coast day, with the crowds left behind', 'Saltwater, ceramics and a late sunset']
  }
};

for (const destination of indiaDestinations) placeDetails[destination.id] = toPlannerPlace(destination);

const itineraryPackages = {
  'amalfi-lemon-light': {
    title: 'Lemon light & long lunches', destination: 'amalfi', days: 7, style: 'food', month: 'summer', pace: 'easy', party: 'two',
    summary: 'A coastal food-and-ferry sketch with unhurried village time.', route: 'Sorrento → Positano → Amalfi & Ravello → Capri → Sorrento', season: 'Late spring to early autumn',
    goodFor: 'Couples, slow-food lovers, and anyone happiest near the water.',
    highlights: ['Ferry-led movement along the coast', 'A lemon-grove or cooking experience to explore with your planner', 'Open afternoons for swimming, ceramics, or a slower lunch'],
    itinerary: [
      { title: 'Arrive by the water', detail: 'Settle into the Sorrento area, stretch your legs, and keep dinner close to home.' },
      { title: 'Positano, before the rush', detail: 'Take an early ferry or pre-arranged transfer, then wander the lanes at an easy pace.' },
      { title: 'Lemons and long lunch', detail: 'Leave space for a local food experience and an unhurried table in the hills.' },
      { title: 'Amalfi and Ravello', detail: 'Pair the cathedral quarter with a garden visit, allowing time for the coast road.' },
      { title: 'A day by boat', detail: 'Choose a Capri day or a quieter cove depending on sea conditions and your mood.' },
      { title: 'Nothing urgent', detail: 'Keep the day open for a swim, a ceramics studio, or a second favourite lunch.' },
      { title: 'A soft goodbye', detail: 'Enjoy breakfast by the sea before the onward journey.' }
    ],
    planningNotes: ['Coastal ferries and roads are seasonal and weather-dependent; confirm current schedules before travel.', 'This is a planning outline only—stays, meals, transfers and activities are not reserved.']
  },
  'amalfi-ferry-days': {
    title: 'Ferries, footpaths & sea glass', destination: 'amalfi', days: 5, style: 'nature', month: 'anytime', pace: 'balanced', party: 'two',
    summary: 'A lighter Amalfi loop built around sea air, village walks, and open evenings.', route: 'Amalfi → Atrani → Ravello → Positano → Amalfi', season: 'April to October for the easiest ferry connections',
    goodFor: 'Short-break travellers who want a little walking without racing the coast.',
    highlights: ['A compact base-and-branch route', 'A village-to-village walk with a flexible return', 'Evenings left open for the sea breeze and local tables'],
    itinerary: [
      { title: 'Arrive in Amalfi', detail: 'Check in, find the waterfront, and keep your first evening deliberately simple.' },
      { title: 'Atrani on foot', detail: 'Take a gentle walk into the neighbouring village and pause in its small piazza.' },
      { title: 'High gardens, slow steps', detail: 'Head toward Ravello for viewpoints and garden time; choose the easier return if it is hot.' },
      { title: 'Positano by sea', detail: 'Use a ferry if operating, leave time for the lanes, and return before the last connection.' },
      { title: 'One last coffee', detail: 'A relaxed breakfast and a short promenade before departure.' }
    ],
    planningNotes: ['Ferry routes vary by month and sea state; an overland alternative should be agreed in advance.', 'Walking distances, steps, and heat can be adjusted to your comfort.']
  },
  'kyoto-old-lanes': {
    title: 'Old lanes, new rituals', destination: 'kyoto', days: 6, style: 'culture', month: 'autumn', pace: 'easy', party: 'two',
    summary: 'A gentle Kyoto stay with temple mornings, tea pauses, and craft-filled lanes.', route: 'Higashiyama → Fushimi → Arashiyama → Nishiki → Gion', season: 'Spring blossoms or autumn colour; both are popular',
    goodFor: 'First-time Kyoto visitors, culture-minded couples, and gentle walkers.',
    highlights: ['Early starts for quieter temple approaches', 'A neighbourhood tea or craft stop', 'A free afternoon so the city can set the pace'],
    itinerary: [
      { title: 'Arrive and find your bearings', detail: 'Check in, take a short neighbourhood walk, and choose an easy first dinner.' },
      { title: 'Gates and gardens', detail: 'Visit Fushimi Inari early, then slow down over tea and a garden visit.' },
      { title: 'The old eastern lanes', detail: 'Explore Higashiyama on foot, with time for small shops and a temple courtyard.' },
      { title: 'A green edge to the city', detail: 'Spend the morning in Arashiyama and return before the afternoon becomes crowded.' },
      { title: 'Market tastes and craft', detail: 'Browse Nishiki Market, then follow one craft interest rather than trying to see it all.' },
      { title: 'A quiet departure', detail: 'Leave the final morning open for a last cup of matcha or a riverside stroll.' }
    ],
    planningNotes: ['Autumn and blossom periods book up early; exact dates and crowd levels change each year.', 'Temple hours, entry rules, and local etiquette should be checked close to travel.']
  },
  'kyoto-market-makers': {
    title: 'Market mornings & makers', destination: 'kyoto', days: 8, style: 'food', month: 'spring', pace: 'full', party: 'friends',
    summary: 'A food-loving week of neighbourhood kitchens, small studios, and slower afternoons.', route: 'Nishiki → Higashiyama → Uji → central Kyoto → Arashiyama', season: 'March to May or October to November',
    goodFor: 'Friends travelling together, curious eaters, and craft enthusiasts.',
    highlights: ['Market browsing with time to taste', 'A tea-focused outing toward Uji', 'Independent workshops and a flexible final day'],
    itinerary: [
      { title: 'Arrive and settle in', detail: 'Keep the first day light, discover your nearest café, and enjoy a simple local supper.' },
      { title: 'Market morning', detail: 'Explore Nishiki with a short tasting list and a nearby lunch reservation if desired.' },
      { title: 'Tea country', detail: 'Make a day trip toward Uji for tea culture, riverside paths, and a slower return.' },
      { title: 'Craft and old streets', detail: 'Visit a small workshop or museum, then wander Higashiyama at your own pace.' },
      { title: 'A kitchen day', detail: 'Add a cooking class or food walk if available; otherwise build a self-guided tasting route.' },
      { title: 'Arashiyama with room', detail: 'Go early for the riverside and bamboo area, then retreat to a quiet lunch.' },
      { title: 'Choose your favourite', detail: 'Return to a place you loved, or leave the day unscheduled for a new discovery.' },
      { title: 'Depart well fed', detail: 'Enjoy a final breakfast and an easy transfer onward.' }
    ],
    planningNotes: ['Small workshops and cooking classes need advance confirmation and may not run every day.', 'Food preferences and allergies should be shared with providers before any reservation.']
  },
  'bhutan-valleys': {
    title: 'Valleys & monasteries', destination: 'bhutan', days: 9, style: 'culture', month: 'autumn', pace: 'balanced', party: 'two',
    summary: 'A gradual high-country journey pairing quiet trails with local stories and rest.', route: 'Paro → Thimphu → Punakha → Paro', season: 'Spring and autumn are popular; check local conditions',
    goodFor: 'Travellers who value cultural context, mountain scenery, and an unhurried pace.',
    highlights: ['A gentle first day to acclimatise', 'Dzong and valley visits with a qualified local guide', 'Time for rest between scenic drives'],
    itinerary: [
      { title: 'Arrive in Paro', detail: 'Meet your local operator, settle in, and keep the first afternoon restful.' },
      { title: 'Paro at a gentle pace', detail: 'Explore the valley and cultural sites that are open, with time to adjust to altitude.' },
      { title: 'On to Thimphu', detail: 'Travel by road with stops chosen for interest and comfort; keep the evening easy.' },
      { title: 'Capital stories', detail: 'Visit selected cultural sites or a market with your guide, leaving room for a quiet lunch.' },
      { title: 'Across the pass', detail: 'Journey toward Punakha with weather- and road-appropriate pauses along the way.' },
      { title: 'Punakha valley', detail: 'Spend the day around the valley and its dzong, subject to local access and timing.' },
      { title: 'A softer day', detail: 'Choose a short village walk, a riverside pause, or simply more time at your lodge.' },
      { title: 'Return to Paro', detail: 'Break up the drive with a scenic stop and prepare for departure.' },
      { title: 'Depart from the valley', detail: 'Leave with a generous airport buffer and your local operator’s support.' }
    ],
    planningNotes: ['Bhutan entry rules, permits, route access, and local requirements must be verified for your nationality and dates.', 'A licensed local operator and guide are essential; altitude and road conditions can change the plan.']
  },
  'bhutan-pine-trails': {
    title: 'Prayer flags & pine trails', destination: 'bhutan', days: 8, style: 'nature', month: 'autumn', pace: 'easy', party: 'solo',
    summary: 'A nature-first sketch with gentle hikes, valley viewpoints, and roomy evenings.', route: 'Paro valley → Thimphu → Punakha valley → Paro', season: 'Spring or autumn, depending on trail and weather conditions',
    goodFor: 'Independent-minded travellers seeking nature, quiet, and flexible walking days.',
    highlights: ['Low-pressure walks with optional rest days', 'Pine-forest and valley viewpoints', 'A local guide to adjust routes to weather and fitness'],
    itinerary: [
      { title: 'Arrive and rest', detail: 'Keep the first day free of ambitious walking and follow your guide’s acclimatisation advice.' },
      { title: 'A valley introduction', detail: 'Take a short, low-effort walk near Paro and spend the afternoon at an easy pace.' },
      { title: 'Optional hillside walk', detail: 'Choose a guided trail suited to your fitness; the Tiger’s Nest climb is optional, not assumed.' },
      { title: 'Road to Thimphu', detail: 'Travel with scenic pauses and a short nature walk only if conditions feel right.' },
      { title: 'Forest and city edges', detail: 'Explore a nearby pine trail with your guide, keeping a gentler alternative available.' },
      { title: 'Punakha at your pace', detail: 'Continue to the valley and choose between a riverside walk, village visit, or rest.' },
      { title: 'A flexible final day', detail: 'Return toward Paro with time for a favourite viewpoint or an early night.' },
      { title: 'Depart', detail: 'Transfer to the airport with local support and a comfortable time buffer.' }
    ],
    planningNotes: ['Walking routes are indicative and must be adjusted for weather, altitude, fitness, and local advice.', 'Check entry rules and permits with a qualified Bhutanese operator before confirming travel.']
  },
  'rajasthan-forts': {
    title: 'Forts, havelis & chai', destination: 'rajasthan', days: 7, style: 'culture', month: 'winter', pace: 'balanced', party: 'friends',
    summary: 'A culture-led route through courtyards, artisan lanes, and soft desert evenings.', route: 'Jaipur → Jodhpur → Jaisalmer', season: 'October to March; daytime temperatures still vary',
    goodFor: 'Friends, architecture lovers, and travellers drawn to craft and local history.',
    highlights: ['Early fort visits with a guide', 'A hands-on craft stop to explore', 'A desert-edge evening subject to season and conditions'],
    itinerary: [
      { title: 'Arrive in Jaipur', detail: 'Settle in, take a short orientation walk, and keep dinner close to your stay.' },
      { title: 'Pink City details', detail: 'Explore selected old-city landmarks with time for a chai stop and a shaded lunch.' },
      { title: 'Craft and courtyards', detail: 'Visit a workshop or haveli with a local host, then leave the afternoon loose.' },
      { title: 'Travel to Jodhpur', detail: 'Make the road journey with comfortable breaks and an easy evening on arrival.' },
      { title: 'Blue City and fort', detail: 'Visit the fort and old quarter with a guide, leaving time for the city’s smaller lanes.' },
      { title: 'On toward Jaisalmer', detail: 'Travel west and settle in before a sunset viewpoint or quiet rooftop supper.' },
      { title: 'Sandstone morning', detail: 'Explore the old fort quarter at a gentle pace before the onward journey.' }
    ],
    planningNotes: ['Road times can be long; the final route should be checked against your arrival and departure points.', 'Desert excursions, heritage-site access, and guide services must be confirmed for your dates.']
  },
  'rajasthan-desert-tables': {
    title: 'Desert nights & royal tables', destination: 'rajasthan', days: 9, style: 'food', month: 'winter', pace: 'full', party: 'two',
    summary: 'A food-and-heritage journey, from old-city breakfasts to open skies.', route: 'Jaipur → Jodhpur → Thar Desert area → Udaipur', season: 'October to March, with cooler desert nights',
    goodFor: 'Couples who want regional food, historic stays to consider, and a little desert air.',
    highlights: ['Regional breakfasts and a guided food walk to explore', 'A desert-side overnight option subject to availability', 'A lake city finale with an intentionally slower last day'],
    itinerary: [
      { title: 'Arrive hungry, travel gently', detail: 'Check in around Jaipur, enjoy a simple first meal, and rest after the journey.' },
      { title: 'Jaipur on the plate', detail: 'Pair an old-city walk with regional breakfast tastes and a relaxed lunch.' },
      { title: 'A fort and a market', detail: 'Take a guided heritage visit, then spend the afternoon browsing without a long checklist.' },
      { title: 'Road to Jodhpur', detail: 'Transfer west with a planned rest stop and an easy rooftop evening.' },
      { title: 'Blue City flavours', detail: 'Explore the old quarter and choose a local food experience after checking availability.' },
      { title: 'Toward the desert', detail: 'Travel to a suitable desert-area stay; exact location and drive time depend on the proposal.' },
      { title: 'Desert light', detail: 'Keep the day weather-led, with a local-led outing or a restful evening at the stay.' },
      { title: 'Udaipur by road', detail: 'Make the longer transfer with comfort breaks and a calm lakeside evening.' },
      { title: 'A lake-side farewell', detail: 'Take a gentle morning walk, enjoy breakfast, and depart with a generous buffer.' }
    ],
    planningNotes: ['Desert camps, food walks, and heritage stays are examples to confirm—not reservations or inclusions.', 'Long intercity drives need realistic timing; transport and any overnight stop should be quoted separately.']
  }
};

const packageGallery = {
  amalfi: { first: '/assets/hero-destination.webp', second: '/assets/gallery-amalfi.jpg', firstAlt: 'Amalfi Coast cove viewed from above', secondAlt: 'Amalfi village and Mediterranean coastline in warm morning light' },
  kyoto: { first: '/assets/kyoto.webp', second: '/assets/gallery-kyoto.jpg', firstAlt: 'A traditional Kyoto lane framed by autumn leaves', secondAlt: 'Quiet wooden lane in Kyoto with temple roof and lantern light' },
  bhutan: { first: '/assets/bhutan.webp', second: '/assets/gallery-bhutan.jpg', firstAlt: 'Tiger’s Nest monastery above a Bhutanese forest', secondAlt: 'Bhutanese mountain valley, pine forest, and a cliffside monastery' },
  rajasthan: { first: '/assets/rajasthan.webp', second: '/assets/gallery-rajasthan.jpg', firstAlt: 'Carved sandstone architecture in Rajasthan', secondAlt: 'Golden light falling through a carved sandstone haveli courtyard' }
};

const savedPackagesStorageKey = 'triwal-traviator-saved-packages';
let savedPackageIds = new Set();
let favoriteStorageAvailable = true;
try {
  const storedPackages = JSON.parse(window.localStorage.getItem(savedPackagesStorageKey) || '[]');
  if (Array.isArray(storedPackages)) savedPackageIds = new Set(storedPackages.filter((id) => Object.prototype.hasOwnProperty.call(itineraryPackages, id)));
} catch { favoriteStorageAvailable = false; }
const packageCards = $$('[data-package-card]');
const packageFilterButtons = $$('[data-package-filter]');
const packageFilterStatus = $('#package-filter-status');
const packageEmpty = $('#package-empty');
const packageSearchInput = $('#package-search');
const packageDestinationFilter = $('#package-destination-filter');
let activePackageFilter = 'all';
function persistSavedPackages() {
  try {
    window.localStorage.setItem(savedPackagesStorageKey, JSON.stringify([...savedPackageIds]));
    favoriteStorageAvailable = true;
    return true;
  } catch {
    favoriteStorageAvailable = false;
    return false;
  }
}
function refreshPackageFavorites() {
  $$('[data-package-favorite]').forEach((button) => {
    const id = button.dataset.packageFavorite;
    const saved = savedPackageIds.has(id);
    const title = itineraryPackages[id]?.title || 'this journey';
    button.classList.toggle('is-saved', saved);
    button.setAttribute('aria-pressed', String(saved));
    button.setAttribute('aria-label', saved ? `Remove ${title} from saved journeys` : `Save ${title} for later`);
    const icon = $('span', button);
    if (icon) icon.textContent = saved ? '♥' : '♡';
  });
  const count = $('#saved-package-count');
  if (count) count.textContent = String(savedPackageIds.size);
}
function applyPackageFilters() {
  const destination = packageDestinationFilter?.value || 'all';
  const query = (packageSearchInput?.value || '').trim().toLowerCase();
  let shown = 0;
  packageCards.forEach((card) => {
    const id = card.dataset.packageId || '';
    const item = itineraryPackages[id];
    const tags = (card.dataset.packageTags || '').split(/\s+/);
    const matchesTag = activePackageFilter === 'all' || activePackageFilter === 'saved' || tags.includes(activePackageFilter);
    const matchesSaved = activePackageFilter !== 'saved' || savedPackageIds.has(id);
    const matchesDestination = destination === 'all' || card.dataset.packageDestination === destination;
    const searchable = `${card.textContent} ${item?.route || ''} ${item?.summary || ''} ${(item?.highlights || []).join(' ')}`.toLowerCase();
    const matchesSearch = !query || searchable.includes(query);
    const visible = matchesTag && matchesSaved && matchesDestination && matchesSearch;
    card.hidden = !visible;
    if (visible) shown += 1;
  });
  if (packageEmpty) packageEmpty.hidden = shown !== 0;
  if (packageFilterStatus) packageFilterStatus.textContent = `Showing ${shown} of ${packageCards.length} itinerary ${packageCards.length === 1 ? 'idea' : 'ideas'}.${activePackageFilter === 'saved' ? ` ${savedPackageIds.size} saved on this device.` : ''}`;
}
packageFilterButtons.forEach((button) => {
  button.addEventListener('click', () => {
    activePackageFilter = button.dataset.packageFilter || 'all';
    packageFilterButtons.forEach((filter) => {
      const active = filter === button;
      filter.classList.toggle('is-active', active);
      filter.setAttribute('aria-pressed', String(active));
    });
    applyPackageFilters();
  });
});
packageSearchInput?.addEventListener('input', applyPackageFilters);
packageDestinationFilter?.addEventListener('change', applyPackageFilters);
$('#clear-package-filters')?.addEventListener('click', () => {
  activePackageFilter = 'all';
  packageFilterButtons.forEach((button) => {
    const active = button.dataset.packageFilter === 'all';
    button.classList.toggle('is-active', active);
    button.setAttribute('aria-pressed', String(active));
  });
  if (packageSearchInput) packageSearchInput.value = '';
  if (packageDestinationFilter) packageDestinationFilter.value = 'all';
  applyPackageFilters();
  packageSearchInput?.focus();
});
$$('[data-package-favorite]').forEach((button) => {
  button.addEventListener('click', () => {
    const id = button.dataset.packageFavorite;
    if (!itineraryPackages[id]) return;
    if (savedPackageIds.has(id)) savedPackageIds.delete(id);
    else savedPackageIds.add(id);
    const persisted = persistSavedPackages();
    refreshPackageFavorites();
    applyPackageFilters();
    const saved = savedPackageIds.has(id);
    showToast(saved
      ? (persisted ? 'Journey saved on this device.' : 'Journey saved for this visit only; browser storage is unavailable.')
      : 'Journey removed from your saved list.');
  });
});
refreshPackageFavorites();
applyPackageFilters();

const styleNotes = {
  culture: 'with time for local stories and thoughtful encounters',
  nature: 'with fresh air, generous scenery and a lighter footprint',
  food: 'with memorable tables and the flavours that make a place',
  slow: 'with easy mornings and space to follow your curiosity'
};
const paceNotes = { easy: 'We have kept the pace gentle and left a little more breathing room.', balanced: 'The days mix a few good discoveries with time to enjoy them.', full: 'There is a little more to explore each day, with sensible pauses built in.' };

function buildLocalPlan(input) {
  const place = placeDetails[input.destination] || placeDetails.kyoto;
  const days = Math.max(3, Math.min(12, Number(input.days) || 5));
  const style = input.style || 'culture';
  const pace = input.pace || 'balanced';
  const styleLabel = ({ culture: 'culture-led', nature: 'outdoors', food: 'food-loving', slow: 'slow-travel' })[style] || 'curious';
  const rhythm = paceNotes[pace] || paceNotes.balanced;
  const people = ({ solo: 'solo traveller', family: 'family trip', friends: 'trip with friends', two: 'trip for two' })[input.party] || 'trip for two';
  const resultDays = Array.from({ length: days }, (_, index) => {
    const n = index + 1;
    const start = (index * 2) % place.morning.length;
    return {
      day: n,
      theme: place.themes[index % place.themes.length],
      morning: place.morning[start],
      lunch: place.lunch[(index + (style === 'food' ? 1 : 0)) % place.lunch.length],
      afternoon: place.afternoon[(index + (style === 'nature' ? 1 : 0)) % place.afternoon.length],
      evening: place.evening[(index + (style === 'slow' ? 1 : 0)) % place.evening.length]
    };
  });
  return {
    source: 'local',
    title: `${days} days in ${place.name}, your way`,
    overview: `A ${styleLabel} ${people} ${styleNotes[style] || styleNotes.culture}. ${rhythm} Use this as a first draft — local opening times, transport and availability still need checking.`,
    days: resultDays,
    tips: ['Leave a little room for spontaneous discoveries.', 'Confirm seasonal opening hours and local transport before you go.']
  };
}

function safeText(value, max = 600) {
  return String(value ?? '').trim().slice(0, max);
}

function renderPlan(plan, input) {
  const title = $('#result-title');
  const overview = $('#result-overview');
  const meta = $('#result-meta');
  const source = $('#result-source');
  const daysList = $('#itinerary-days');
  if (!title || !overview || !meta || !source || !daysList) return;

  const place = placeDetails[input.destination] || placeDetails.kyoto;
  title.textContent = safeText(plan.title, 140) || `${input.days} days in ${place.name}, your way`;
  overview.textContent = safeText(plan.overview, 700) || 'A considered starting point for your next journey. Review local details before booking.';
  meta.textContent = input.packageTitle
    ? `${safeText(input.packageTitle, 80).toUpperCase()} · ${input.days} DAYS`
    : `${input.days} DAYS · ${place.name.toUpperCase()} · ${String(input.style || 'culture').toUpperCase()}`;
  source.textContent = plan.source === 'ai' ? 'AI-ASSISTED DRAFT · REVIEW BEFORE YOU GO' : 'SMART PREVIEW · CURATED STARTING POINT';
  daysList.replaceChildren();

  const days = Array.isArray(plan.days) ? plan.days.slice(0, 12) : [];
  days.forEach((day, index) => {
    const details = document.createElement('details');
    details.className = 'day-card';
    if (index === 0) details.open = true;
    const summary = document.createElement('summary');
    const number = document.createElement('span');
    number.className = 'day-index';
    number.textContent = String(day.day || index + 1).padStart(2, '0');
    const copy = document.createElement('span');
    copy.className = 'day-summary-copy';
    const theme = document.createElement('strong');
    theme.textContent = safeText(day.theme || day.title || `A day to discover ${place.name}`, 100);
    const note = document.createElement('small');
    note.textContent = `Day ${day.day || index + 1} · a good rhythm, not a rigid timetable`;
    copy.append(theme, note);
    summary.append(number, copy);
    details.append(summary);

    const activities = document.createElement('div');
    activities.className = 'day-activities';
    [['Morning', day.morning], ['Lunch', day.lunch], ['Afternoon', day.afternoon], ['Evening', day.evening]].forEach(([label, value]) => {
      if (!value) return;
      const activity = document.createElement('div');
      activity.className = 'day-activity';
      const heading = document.createElement('strong');
      heading.textContent = label;
      const text = document.createElement('p');
      text.textContent = safeText(value, 280);
      activity.append(heading, text);
      activities.append(activity);
    });
    details.append(activities);
    daysList.append(details);
  });
  $('#planner-feedback').textContent = plan.note
    ? safeText(plan.note, 220)
    : plan.source === 'ai'
      ? 'AI-assisted ideas are a starting point; check opening times, travel advisories and availability before booking.'
      : 'This is an offline-friendly starter plan. Add an AI_API_KEY on the server for live model-generated suggestions.';
  $('#planner-result').hidden = false;
  $('#planner-result').scrollIntoView({ behavior: reducedMotion ? 'auto' : 'smooth', block: 'nearest' });
}

const plannerForm = $('#planner-form');
const plannerLoading = $('#planner-loading');
const plannerResult = $('#planner-result');
const plannerSubmit = $('.planner-submit');
let currentPlan = null;
let currentPlanInput = null;
let activePackage = null;
const selectedPackageNote = $('#selected-package');
const selectedPackageName = $('#selected-package-name');
function clearActivePackage() {
  activePackage = null;
  if (selectedPackageNote) selectedPackageNote.hidden = true;
  if (selectedPackageName) selectedPackageName.textContent = '';
}
function applyPackage(packageId) {
  const packageData = itineraryPackages[packageId];
  if (!packageData) return;
  activePackage = packageData;
  if (placeSelect) placeSelect.value = packageData.destination;
  if (daysRange) daysRange.value = String(packageData.days);
  updateDaysOutput();
  $('#trip-month').value = packageData.month;
  $('#trip-pace').value = packageData.pace;
  $('#trip-party').value = packageData.party;
  const styleInput = $(`input[name="style"][value="${packageData.style}"]`, plannerForm);
  if (styleInput) styleInput.checked = true;
  if (selectedPackageName) selectedPackageName.textContent = `Starting point: ${packageData.title} · ${packageData.days} days. Adjust anything you like.`;
  if (selectedPackageNote) selectedPackageNote.hidden = false;
  showToast(`${packageData.title} is ready in the Trip Studio.`);
  $('#planner-form')?.scrollIntoView({ behavior: reducedMotion ? 'auto' : 'smooth', block: 'center' });
}
plannerForm?.addEventListener('change', (event) => {
  if (!event.target.closest('[data-package-start]')) clearActivePackage();
});
$('#clear-package')?.addEventListener('click', clearActivePackage);
$$('[data-package-start]').forEach((button) => button.addEventListener('click', () => applyPackage(button.dataset.packageStart)));

const packageDialog = $('#package-dialog');
let openPackageId = '';
let openPackageGallery = null;
let openPackagePlace = '';
let openPackageGalleryIndex = 0;
function setPackageGalleryIndex(index) {
  if (!openPackageGallery) return;
  const photos = [
    { src: openPackageGallery.first, alt: openPackageGallery.firstAlt },
    { src: openPackageGallery.second, alt: openPackageGallery.secondAlt }
  ];
  openPackageGalleryIndex = (index + photos.length) % photos.length;
  const mainPhoto = photos[openPackageGalleryIndex];
  const alternatePhoto = photos[(openPackageGalleryIndex + 1) % photos.length];
  const mainImage = $('#package-image-main');
  const alternateImage = $('#package-image-second');
  mainImage.src = mainPhoto.src;
  mainImage.alt = mainPhoto.alt;
  alternateImage.src = alternatePhoto.src;
  alternateImage.alt = alternatePhoto.alt;
  $('#package-image-caption').textContent = `${openPackagePlace} · ${mainPhoto.alt}`;
  $('#package-image-second-caption').textContent = `${openPackagePlace} · ${alternatePhoto.alt}`;
  $('#package-gallery-count').textContent = `${String(openPackageGalleryIndex + 1).padStart(2, '0')} / 02`;
  $('#package-gallery-select').setAttribute('aria-label', `Show this photo as the main ${openPackagePlace} image`);
}
function fillPackageList(target, items) {
  if (!target) return;
  target.replaceChildren(...items.map((item) => {
    const li = document.createElement('li');
    li.textContent = safeText(item, 260);
    return li;
  }));
}
function openPackageDetails(packageId) {
  const item = itineraryPackages[packageId];
  if (!item || !packageDialog) return;
  const place = placeDetails[item.destination] || placeDetails.kyoto;
  const gallery = packageGallery[item.destination];
  if (!gallery) return;
  openPackageId = packageId;
  openPackageGallery = gallery;
  openPackagePlace = place.name;
  $('#package-dialog-kicker').textContent = `${place.country} · ${item.days} DAYS · ${item.style.toUpperCase()}-LED`;
  $('#package-dialog-title').textContent = item.title;
  $('#package-dialog-summary').textContent = item.summary;
  $('#package-dialog-route').textContent = item.route;
  setPackageGalleryIndex(0);
  const facts = [
    ['Duration', `${item.days} days`],
    ['Travel style', ({ culture: 'Culture & craft', nature: 'Nature-led', food: 'Food-focused', slow: 'Slow travel' })[item.style] || item.style],
    ['Suggested season', item.season],
    ['Trip rhythm', ({ easy: 'Easy, roomy days', balanced: 'Balanced pace', full: 'Full but flexible' })[item.pace] || item.pace],
    ['Best for', item.goodFor]
  ];
  const factsTarget = $('#package-facts');
  factsTarget.replaceChildren(...facts.map(([label, value]) => {
    const fact = document.createElement('div');
    fact.className = 'package-fact';
    const title = document.createElement('span');
    title.textContent = label;
    const detail = document.createElement('strong');
    detail.textContent = safeText(value, 180);
    fact.append(title, detail);
    return fact;
  }));
  const daysTarget = $('#package-day-list');
  daysTarget.replaceChildren(...item.itinerary.map((day, index) => {
    const row = document.createElement('article');
    row.className = 'package-day-row';
    const number = document.createElement('span');
    number.className = 'package-day-number';
    number.textContent = String(index + 1).padStart(2, '0');
    const copy = document.createElement('div');
    copy.className = 'package-day-copy';
    const heading = document.createElement('h4');
    heading.textContent = safeText(day.title, 120);
    const description = document.createElement('p');
    description.textContent = safeText(day.detail, 280);
    copy.append(heading, description);
    row.append(number, copy);
    return row;
  }));
  fillPackageList($('#package-highlights'), item.highlights);
  fillPackageList($('#package-planning-notes'), item.planningNotes);
  packageDialog.scrollTop = 0;
  if (typeof packageDialog.showModal === 'function') packageDialog.showModal();
  else packageDialog.setAttribute('open', '');
  document.body.classList.add('dialog-open');
}
$$('[data-package-details]').forEach((button) => button.addEventListener('click', () => openPackageDetails(button.dataset.packageDetails)));
$('#package-gallery-prev')?.addEventListener('click', () => setPackageGalleryIndex(openPackageGalleryIndex - 1));
$('#package-gallery-next')?.addEventListener('click', () => setPackageGalleryIndex(openPackageGalleryIndex + 1));
$('#package-gallery-select')?.addEventListener('click', () => setPackageGalleryIndex(openPackageGalleryIndex + 1));
packageDialog?.addEventListener('keydown', (event) => {
  if (event.key === 'ArrowLeft') { event.preventDefault(); setPackageGalleryIndex(openPackageGalleryIndex - 1); }
  if (event.key === 'ArrowRight') { event.preventDefault(); setPackageGalleryIndex(openPackageGalleryIndex + 1); }
});
const packageGalleryMain = $('.package-gallery-main');
let gallerySwipeStartX = null;
packageGalleryMain?.addEventListener('pointerdown', (event) => {
  if (event.pointerType === 'mouse' || event.target.closest('button')) return;
  gallerySwipeStartX = event.clientX;
});
packageGalleryMain?.addEventListener('pointerup', (event) => {
  if (gallerySwipeStartX === null) return;
  const distance = event.clientX - gallerySwipeStartX;
  gallerySwipeStartX = null;
  if (Math.abs(distance) > 42) setPackageGalleryIndex(openPackageGalleryIndex + (distance < 0 ? 1 : -1));
});
packageGalleryMain?.addEventListener('pointercancel', () => { gallerySwipeStartX = null; });
$('#package-dialog-close')?.addEventListener('click', () => packageDialog?.close());
$('#package-build-button')?.addEventListener('click', () => {
  if (!openPackageId) return;
  const packageId = openPackageId;
  packageDialog?.close();
  applyPackage(packageId);
});
packageDialog?.addEventListener('click', (event) => { if (event.target === packageDialog) packageDialog.close(); });
packageDialog?.addEventListener('close', () => {
  if (!$('#inquiry-dialog')?.open) document.body.classList.remove('dialog-open');
});
plannerForm?.addEventListener('submit', async (event) => {
  event.preventDefault();
  const formData = new FormData(plannerForm);
  const selectedPackage = activePackage;
  const input = {
    destination: safeText(formData.get('destination'), 40),
    month: safeText(formData.get('month'), 30),
    days: Math.max(3, Math.min(12, Number(formData.get('days')) || 5)),
    style: safeText(formData.get('style'), 30),
    pace: safeText(formData.get('pace'), 30),
    party: safeText(formData.get('party'), 30),
    packageTitle: selectedPackage?.title || ''
  };
  plannerLoading.hidden = false;
  plannerResult.hidden = true;
  if (plannerSubmit) {
    plannerSubmit.disabled = true;
    plannerSubmit.setAttribute('aria-busy', 'true');
    $('.button-label', plannerSubmit).textContent = 'Gathering good ideas…';
  }
  let plan;
  try {
    const response = await fetch('/api/itinerary', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: JSON.stringify(input),
      signal: AbortSignal.timeout(30000)
    });
    if (!response.ok) throw new Error(`Planner service responded ${response.status}`);
    plan = await response.json();
    if (!Array.isArray(plan.days) || !plan.days.length) throw new Error('The planner returned an empty itinerary');
  } catch (error) {
    // This local engine keeps the planner useful when no server or AI provider is configured.
    plan = buildLocalPlan(input);
  } finally {
    plannerLoading.hidden = true;
    if (plannerSubmit) {
      plannerSubmit.disabled = false;
      plannerSubmit.removeAttribute('aria-busy');
      $('.button-label', plannerSubmit).textContent = 'Dream up my days';
    }
  }
  if (selectedPackage) {
    plan.title = `${selectedPackage.title} · ${input.days} days`;
    plan.overview = `${selectedPackage.summary} ${safeText(plan.overview, 600)}`;
  }
  currentPlan = plan;
  currentPlanInput = input;
  renderPlan(plan, input);
  $('#save-itinerary').textContent = 'Save this draft ♡';
  $('#save-itinerary').setAttribute('aria-pressed', 'false');
});

// Save only when the visitor asks; itinerary data stays in localStorage on this device.
$('#save-itinerary')?.addEventListener('click', () => {
  if (!currentPlan || !currentPlanInput) return;
  try {
    localStorage.setItem('triwal-traviator-saved-itinerary', JSON.stringify({ plan: currentPlan, input: currentPlanInput, savedAt: new Date().toISOString() }));
    $('#save-itinerary').textContent = 'Saved on this device ✓';
    $('#save-itinerary').setAttribute('aria-pressed', 'true');
    $('#planner-feedback').textContent = 'Saved in this browser only. Clear browser storage to remove it.';
    showToast('Your itinerary draft is saved on this device.');
  } catch (error) {
    $('#planner-feedback').textContent = 'This browser could not save the draft. You can copy it instead.';
  }
});

function itineraryAsText() {
  if (!currentPlan || !currentPlanInput) return '';
  const place = placeDetails[currentPlanInput.destination] || placeDetails.kyoto;
  const lines = [
    `${safeText(currentPlan.title, 140)}`,
    `${currentPlanInput.packageTitle ? `${safeText(currentPlanInput.packageTitle, 80)} · ` : ''}${place.name} · ${currentPlanInput.days} days · ${currentPlanInput.style} · Triwal Traviator`,
    '', safeText(currentPlan.overview, 700), ''
  ];
  (currentPlan.days || []).forEach((day, index) => {
    lines.push(`DAY ${day.day || index + 1} — ${safeText(day.theme || '', 100)}`);
    [['Morning', day.morning], ['Lunch', day.lunch], ['Afternoon', day.afternoon], ['Evening', day.evening]].forEach(([label, value]) => {
      if (value) lines.push(`${label}: ${safeText(value, 280)}`);
    });
    lines.push('');
  });
  lines.push('Illustrative itinerary only. Confirm local details and availability before booking.');
  return lines.join('\n');
}
$('#copy-itinerary')?.addEventListener('click', async () => {
  const text = itineraryAsText();
  if (!text) return;
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
    } else {
      const temporary = document.createElement('textarea');
      temporary.value = text;
      temporary.setAttribute('readonly', '');
      temporary.style.position = 'fixed';
      temporary.style.opacity = '0';
      document.body.append(temporary);
      temporary.select();
      document.execCommand('copy');
      temporary.remove();
    }
    $('#planner-feedback').textContent = 'The itinerary text is copied and ready to share.';
    showToast('Itinerary copied to your clipboard.');
  } catch (error) {
    $('#planner-feedback').textContent = 'Copy was not available in this browser. Try selecting the itinerary text.';
  }
});
$('#edit-itinerary')?.addEventListener('click', () => {
  plannerResult.hidden = true;
  $('#planner-feedback').textContent = '';
  $('#trip-destination')?.focus();
  plannerForm?.scrollIntoView({ behavior: reducedMotion ? 'auto' : 'smooth', block: 'center' });
});
$('#request-itinerary')?.addEventListener('click', () => {
  const place = currentPlanInput ? (placeDetails[currentPlanInput.destination]?.name || 'Your trip') : '';
  openInquiry(place, currentPlan ? itineraryAsText().slice(0, 1000) : '');
});

// The globe is an inline SVG model with real pointer/keyboard rotation — no WebGL dependency.
const globeStage = $('#globe-stage');
const globe = $('#globe');
let globeRotation = -8;
let globeTilt = 7;
let dragStartX = 0;
let dragStartY = 0;
let dragStartRotation = globeRotation;
let dragStartTilt = globeTilt;
let draggingGlobe = false;
function setGlobeRotation() {
  if (globe) globe.style.transform = `rotateX(${globeTilt}deg) rotateY(${globeRotation}deg)`;
}
globeStage?.addEventListener('pointerdown', (event) => {
  if (event.button !== undefined && event.button !== 0) return;
  draggingGlobe = true;
  dragStartX = event.clientX;
  dragStartY = event.clientY;
  dragStartRotation = globeRotation;
  dragStartTilt = globeTilt;
  globeStage.setPointerCapture?.(event.pointerId);
  if (globe) globe.style.transition = 'none';
});
globeStage?.addEventListener('pointermove', (event) => {
  if (!draggingGlobe) return;
  globeRotation = dragStartRotation + (event.clientX - dragStartX) * .65;
  globeTilt = Math.max(-20, Math.min(24, dragStartTilt - (event.clientY - dragStartY) * .28));
  setGlobeRotation();
});
function endGlobeDrag() {
  if (!draggingGlobe) return;
  draggingGlobe = false;
  if (globe) globe.style.transition = 'transform .28s ease-out';
}
globeStage?.addEventListener('pointerup', endGlobeDrag);
globeStage?.addEventListener('pointercancel', endGlobeDrag);
globeStage?.addEventListener('lostpointercapture', endGlobeDrag);
globeStage?.addEventListener('keydown', (event) => {
  if (event.key === 'ArrowLeft') { event.preventDefault(); globeRotation -= 16; setGlobeRotation(); }
  if (event.key === 'ArrowRight') { event.preventDefault(); globeRotation += 16; setGlobeRotation(); }
  if (event.key === 'ArrowUp') { event.preventDefault(); globeTilt = Math.max(-20, globeTilt - 7); setGlobeRotation(); }
  if (event.key === 'ArrowDown') { event.preventDefault(); globeTilt = Math.min(24, globeTilt + 7); setGlobeRotation(); }
  if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); globeRotation += 24; setGlobeRotation(); }
});

// Pointer parallax lets the miniature suitcase scene respond to the viewer.
const heroScene = $('#hero-3d-scene');
const heroSection = $('.hero');
if (heroScene && heroSection && window.matchMedia('(hover: hover) and (pointer: fine)').matches && !reducedMotion) {
  heroSection.addEventListener('pointermove', (event) => {
    if (heroScene.offsetParent === null) return;
    const bounds = heroSection.getBoundingClientRect();
    const x = (event.clientX - bounds.left) / bounds.width - .5;
    const y = (event.clientY - bounds.top) / bounds.height - .5;
    heroScene.style.transform = `translate3d(${x * -14}px,${y * -11}px,0)`;
  });
  heroSection.addEventListener('pointerleave', () => { heroScene.style.transform = ''; });
}

// Gentle 3D tilt on destination and package cards on mouse/trackpad devices only.
if (window.matchMedia('(hover: hover) and (pointer: fine)').matches && !reducedMotion) {
  const tiltCards = [...destinationCards, ...$$('[data-package-card]')];
  tiltCards.forEach((card) => {
    card.addEventListener('pointermove', (event) => {
      if (card.classList.contains('is-filtered-out')) return;
      const bounds = card.getBoundingClientRect();
      const x = (event.clientX - bounds.left) / bounds.width - .5;
      const y = (event.clientY - bounds.top) / bounds.height - .5;
      card.style.transform = `perspective(900px) rotateX(${-y * 3.1}deg) rotateY(${x * 3.5}deg) translateY(-3px) translateZ(4px)`;
    });
    card.addEventListener('pointerleave', () => { card.style.transform = ''; });
  });
}

// Accessible native dialog for considered trip enquiries.
const inquiryDialog = $('#inquiry-dialog');
const contactForm = $('#contact-form');
const contactFeedback = $('#contact-feedback');
let leadWebhookConfigured = false;
function inquiryHint() {
  return leadWebhookConfigured
    ? 'Your note will be sent to the configured trip-planning service. Please do not include payment or passport information.'
    : 'Preview only: enquiries are saved locally and are not sent to a travel adviser. Connect a CRM webhook before launch.';
}
fetch('/api/health', { headers: { 'Accept': 'application/json' } })
  .then((response) => response.ok ? response.json() : null)
  .then((health) => {
    if (!health) return;
    leadWebhookConfigured = Boolean(health.leadDeliveryConfigured);
    if (inquiryDialog?.open && contactForm?.dataset.submitted !== 'true') contactFeedback.textContent = inquiryHint();
  })
  .catch(() => {});
function openInquiry(destination = '', notes = '') {
  if (!inquiryDialog) return;
  if (contactForm?.dataset.submitted === 'true') {
    contactForm.reset();
    contactForm.dataset.submitted = 'false';
    const submit = contactForm.querySelector('button[type="submit"]');
    if (submit) submit.disabled = false;
    $('.contact-submit-label', contactForm).textContent = 'Send my note';
  }
  if (destination) $('#contact-destination').value = safeText(destination, 120);
  if (notes) $('#contact-message').value = `I have a first-draft itinerary and would like to talk it through.\n\n${safeText(notes, 1000)}`;
  contactFeedback.textContent = inquiryHint();
  contactFeedback.classList.remove('is-success', 'is-error');
  if (typeof inquiryDialog.showModal === 'function') inquiryDialog.showModal();
  else inquiryDialog.setAttribute('open', '');
  document.body.classList.add('dialog-open');
  window.setTimeout(() => $('#contact-name')?.focus(), 80);
}
$$('[data-open-inquiry]').forEach((button) => {
  button.addEventListener('click', () => openInquiry(button.dataset.destination || '', ''));
});
$('#dialog-close')?.addEventListener('click', () => inquiryDialog?.close());
inquiryDialog?.addEventListener('click', (event) => {
  if (event.target === inquiryDialog) inquiryDialog.close();
});
inquiryDialog?.addEventListener('close', () => document.body.classList.remove('dialog-open'));

contactForm?.addEventListener('submit', async (event) => {
  event.preventDefault();
  const submit = contactForm.querySelector('button[type="submit"]');
  const label = $('.contact-submit-label', contactForm);
  if (submit) submit.disabled = true;
  if (label) label.textContent = 'Sending your note…';
  contactFeedback.classList.remove('is-success', 'is-error');
  const payload = Object.fromEntries(new FormData(contactForm).entries());
  try {
    const response = await fetch('/api/inquiries', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(15000)
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body.error || 'Your note could not be sent. Please try again.');
    const deliveredRemotely = ['zoho', 'webhook'].includes(body.delivery);
    contactFeedback.textContent = deliveredRemotely
      ? `Your enquiry has been received. Reference: ${body.reference}. A trip designer can follow up using the address you provided.`
      : `Saved to this local preview only (${body.reference}). It has not been sent to a travel designer. Connect Zoho CRM or a lead webhook before launch.`;
    contactFeedback.classList.add('is-success');
    contactForm.dataset.submitted = 'true';
    if (label) label.textContent = 'Note received ✓';
    showToast(deliveredRemotely ? 'Your note is on its way. Thank you.' : 'Preview note saved locally — not sent to an agent.');
  } catch (error) {
    contactFeedback.textContent = `${safeText(error.message, 220)} The form has not been sent.`;
    contactFeedback.classList.add('is-error');
    if (label) label.textContent = 'Try sending again';
    if (submit) submit.disabled = false;
  }
});

// Small status messages, never blocking the page.
let toastTimer;
function showToast(message) {
  const toast = $('#toast');
  if (!toast) return;
  toast.textContent = safeText(message, 180);
  toast.hidden = false;
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => { toast.hidden = true; }, 3500);
}

const year = $('#current-year');
if (year) year.textContent = String(new Date().getFullYear());
