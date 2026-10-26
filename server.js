import { createServer } from 'node:http';
import { createReadStream } from 'node:fs';
import { appendFile, mkdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { randomBytes } from 'node:crypto';
import { generateOpenAiItinerary, openAiStatus } from './integrations/openai.js';
import { upsertZohoLead, zohoStatus } from './integrations/zoho-crm.js';
import { searchTboHotels, tboHotelStatus } from './integrations/tbo-hotels.js';
import { searchTboFlights, tboFlightStatus } from './integrations/tbo-flights.js';
import { createRazorpayOrder, fetchRazorpayPayment, razorpayStatus, razorpayClientKeyId, verifyRazorpayCheckoutSignature, verifyRazorpayWebhookSignature } from './integrations/razorpay.js';
import { indiaDestinations, toPlannerPlace } from './public/india-destinations.js';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.join(ROOT, 'public');
const STORAGE_DIR = path.join(ROOT, 'storage');
const PORT = Number(process.env.PORT || 4173);
const HOST = process.env.HOST || '0.0.0.0';
const IS_PRODUCTION = process.env.NODE_ENV === 'production';
const AI_API_KEY = process.env.AI_API_KEY || process.env.OPENAI_API_KEY || '';
const LEADS_WEBHOOK_URL = process.env.LEADS_WEBHOOK_URL || '';
const LEADS_WEBHOOK_TOKEN = process.env.LEADS_WEBHOOK_TOKEN || '';
const BOOKING_ADAPTER_MODULE = process.env.TRIWAL_BOOKING_ADAPTER_MODULE || '';
const LIVE_BOOKING_ENABLED = process.env.TRIWAL_LIVE_BOOKING === 'true';

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml', '.webp': 'image/webp', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.json': 'application/json; charset=utf-8', '.webmanifest': 'application/manifest+json; charset=utf-8', '.txt': 'text/plain; charset=utf-8'
};
const requestWindows = new Map();

const places = {
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
for (const destination of indiaDestinations) places[destination.id] = toPlannerPlace(destination);

const allowedStyles = new Set(['culture', 'nature', 'food', 'slow']);
const allowedPaces = new Set(['easy', 'balanced', 'full']);
const allowedParties = new Set(['solo', 'two', 'family', 'friends']);
const allowedMonths = new Set(['anytime', 'spring', 'summer', 'autumn', 'winter']);

function setHeaders(response) {
  response.setHeader('X-Content-Type-Options', 'nosniff');
  response.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  response.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  response.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
  response.setHeader('Content-Security-Policy', "default-src 'self'; base-uri 'self'; object-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self' data:; connect-src 'self'; form-action 'self'");
}
function sendJson(response, status, payload) {
  setHeaders(response);
  response.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff'
  });
  response.end(JSON.stringify(payload));
}
function limited(key, limit, windowMs) {
  const now = Date.now();
  if (requestWindows.size > 2_000) {
    for (const [storedKey, value] of requestWindows) {
      if (now > value.resetAt) requestWindows.delete(storedKey);
    }
  }
  const entry = requestWindows.get(key);
  if (!entry || now > entry.resetAt) {
    requestWindows.set(key, { count: 1, resetAt: now + windowMs });
    return false;
  }
  entry.count += 1;
  return entry.count > limit;
}
function clientKey(request) {
  return request.socket.remoteAddress || 'unknown';
}
function readJson(request, maxBytes = 16_384) {
  return new Promise((resolve, reject) => {
    const contentType = request.headers['content-type'] || '';
    if (!contentType.toLowerCase().includes('application/json')) {
      reject(Object.assign(new Error('Send the form as JSON.'), { statusCode: 415 }));
      request.resume();
      return;
    }
    const chunks = [];
    let size = 0;
    let finished = false;
    request.on('data', (chunk) => {
      if (finished) return;
      size += chunk.length;
      if (size > maxBytes) {
        finished = true;
        reject(Object.assign(new Error('The request is too large.'), { statusCode: 413 }));
        request.resume();
        return;
      }
      chunks.push(chunk);
    });
    request.on('end', () => {
      if (finished) return;
      try {
        const body = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
        if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error('Expected a JSON object.');
        resolve(body);
      } catch (error) {
        reject(Object.assign(new Error('The request body is not valid JSON.'), { statusCode: 400 }));
      }
    });
    request.on('error', (error) => {
      if (!finished) reject(error);
    });
  });
}
function clean(value, maxLength = 400) {
  return String(value ?? '').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').trim().slice(0, maxLength);
}
function validateItinerary(body) {
  const destination = clean(body.destination, 40).toLowerCase();
  const days = Number(body.days);
  const style = clean(body.style, 20).toLowerCase();
  const pace = clean(body.pace, 20).toLowerCase();
  const party = clean(body.party, 20).toLowerCase();
  const month = clean(body.month, 20).toLowerCase();
  if (!places[destination]) throw Object.assign(new Error('Choose one of the supported starting destinations.'), { statusCode: 400 });
  if (!Number.isInteger(days) || days < 3 || days > 12) throw Object.assign(new Error('Trip duration must be between 3 and 12 days.'), { statusCode: 400 });
  if (!allowedStyles.has(style)) throw Object.assign(new Error('Choose a travel style to continue.'), { statusCode: 400 });
  if (!allowedPaces.has(pace)) throw Object.assign(new Error('Choose a travel pace to continue.'), { statusCode: 400 });
  if (!allowedParties.has(party)) throw Object.assign(new Error('Choose who is travelling.'), { statusCode: 400 });
  if (!allowedMonths.has(month)) throw Object.assign(new Error('Choose a travel season to continue.'), { statusCode: 400 });
  return { destination, days, style, pace, party, month };
}
function buildLocalPlan(input) {
  const place = places[input.destination];
  const styleNames = { culture: 'culture-led', nature: 'outdoors', food: 'food-loving', slow: 'slow-travel' };
  const styleNotes = {
    culture: 'with time for local stories and thoughtful encounters',
    nature: 'with fresh air, generous scenery and a lighter footprint',
    food: 'with memorable tables and the flavours that make a place',
    slow: 'with easy mornings and space to follow your curiosity'
  };
  const paceNotes = {
    easy: 'The rhythm is gentle, with a little more breathing room.',
    balanced: 'The days mix a few good discoveries with time to enjoy them.',
    full: 'There is a little more to explore each day, with sensible pauses built in.'
  };
  const people = { solo: 'solo journey', two: 'journey for two', family: 'family journey', friends: 'journey with friends' };
  const days = Array.from({ length: input.days }, (_, index) => {
    const n = index + 1;
    return {
      day: n,
      theme: place.themes[index % place.themes.length],
      morning: place.morning[(index * 2) % place.morning.length],
      lunch: place.lunch[(index + (input.style === 'food' ? 1 : 0)) % place.lunch.length],
      afternoon: place.afternoon[(index + (input.style === 'nature' ? 1 : 0)) % place.afternoon.length],
      evening: place.evening[(index + (input.style === 'slow' ? 1 : 0)) % place.evening.length]
    };
  });
  return {
    source: 'local',
    title: `${input.days} days in ${place.name}, your way`,
    overview: `A ${styleNames[input.style]} ${people[input.party]} ${styleNotes[input.style]}. ${paceNotes[input.pace]} This is a starting point — check local opening times, transport and availability before booking.`,
    days,
    tips: ['Leave room for spontaneous discoveries.', 'Confirm seasonal opening hours and local transport before you go.']
  };
}
function normaliseAiPlan(raw, input) {
  if (!raw || typeof raw !== 'object' || !Array.isArray(raw.days)) throw new Error('The AI response did not include a day-by-day plan.');
  const days = raw.days.slice(0, input.days).map((day, index) => ({
    day: index + 1,
    theme: clean(day.theme || day.title, 100) || `A day to discover ${places[input.destination].name}`,
    morning: clean(day.morning, 260),
    lunch: clean(day.lunch, 260),
    afternoon: clean(day.afternoon, 260),
    evening: clean(day.evening, 260)
  }));
  if (days.length < Math.min(3, input.days)) throw new Error('The AI response was too short to form a useful plan.');
  return {
    source: 'ai',
    title: clean(raw.title, 140) || `${input.days} days in ${places[input.destination].name}, your way`,
    overview: clean(raw.overview, 700) || 'A personalized starting point for your journey. Verify local details before booking.',
    days,
    tips: Array.isArray(raw.tips) ? raw.tips.slice(0, 5).map((tip) => clean(tip, 220)) : []
  };
}
async function buildWithConfiguredAi(input) {
  const rawPlan = await generateOpenAiItinerary(input, places[input.destination]);
  return normaliseAiPlan(rawPlan, input);
}
async function handleItinerary(request, response) {
  if (limited(`itinerary:${clientKey(request)}`, 30, 60_000)) {
    return sendJson(response, 429, { error: 'A few too many itinerary requests. Please try again in a minute.' });
  }
  const body = await readJson(request);
  const input = validateItinerary(body);
  if (AI_API_KEY) {
    try {
      const plan = await buildWithConfiguredAi(input);
      return sendJson(response, 200, plan);
    } catch (error) {
      // A local itinerary is still useful if a configured provider times out or returns invalid data.
      console.error(`[planner] AI provider unavailable: ${clean(error.message, 240)}`);
      const plan = buildLocalPlan(input);
      plan.note = 'The configured AI service was unavailable, so a curated starter plan is shown.';
      return sendJson(response, 200, plan);
    }
  }
  return sendJson(response, 200, buildLocalPlan(input));
}
function validEmail(email) {
  if (email.length > 160) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email);
}
async function forwardLead(lead) {
  const url = new URL(LEADS_WEBHOOK_URL);
  if (IS_PRODUCTION && url.protocol !== 'https:') throw new Error('The lead webhook must use HTTPS in production.');
  const headers = { 'Content-Type': 'application/json', 'Accept': 'application/json' };
  if (LEADS_WEBHOOK_TOKEN) headers.Authorization = `Bearer ${LEADS_WEBHOOK_TOKEN}`;
  const response = await fetch(url, {
    method: 'POST', headers, body: JSON.stringify(lead), signal: AbortSignal.timeout(12_000)
  });
  if (!response.ok) throw new Error(`Lead webhook returned ${response.status}.`);
}
async function handleInquiry(request, response) {
  if (limited(`inquiry:${clientKey(request)}`, 8, 60_000)) {
    return sendJson(response, 429, { error: 'Please wait a moment before sending another enquiry.' });
  }
  const body = await readJson(request, 12_000);
  // Quietly accept spam honeypots without retaining their content.
  if (clean(body.website, 200)) return sendJson(response, 202, { ok: true, delivery: 'accepted' });
  const name = clean(body.name, 100);
  const email = clean(body.email, 160).toLowerCase();
  const destination = clean(body.destination, 120);
  const travelDate = clean(body.travelDate, 80);
  const notes = clean(body.notes, 1200);
  if (name.length < 2) return sendJson(response, 400, { error: 'Please add your name.' });
  if (!validEmail(email)) return sendJson(response, 400, { error: 'Please enter a valid email address.' });
  if (!destination && !notes) return sendJson(response, 400, { error: 'Please share a destination or a little about the trip you have in mind.' });
  const reference = `TT-${randomBytes(3).toString('hex').toUpperCase()}`;
  const lead = {
    reference,
    submittedAt: new Date().toISOString(),
    name,
    email,
    destination: destination || 'Not decided yet',
    travelDate,
    notes
  };
  if (zohoStatus().configured) {
    try {
      await upsertZohoLead(lead);
      return sendJson(response, 202, { ok: true, delivery: 'zoho', reference });
    } catch (error) {
      console.error(`[inquiry] Zoho delivery failed for ${reference}: ${clean(error.message, 180)}`);
      return sendJson(response, 502, { error: 'Our enquiry service is temporarily unavailable. Your note has not been sent; please try again shortly.' });
    }
  }
  if (LEADS_WEBHOOK_URL) {
    try {
      await forwardLead(lead);
      return sendJson(response, 202, { ok: true, delivery: 'webhook', reference });
    } catch (error) {
      console.error(`[inquiry] webhook delivery failed for ${reference}: ${clean(error.message, 180)}`);
      return sendJson(response, 502, { error: 'Our enquiry service is temporarily unavailable. Your note has not been sent; please try again shortly.' });
    }
  }
  if (IS_PRODUCTION) {
    return sendJson(response, 503, { error: 'The enquiry service is not configured yet. Your note has not been sent.' });
  }
  await mkdir(STORAGE_DIR, { recursive: true });
  await appendFile(path.join(STORAGE_DIR, 'inquiries.jsonl'), `${JSON.stringify(lead)}\n`, { encoding: 'utf8', mode: 0o600 });
  console.info(`[inquiry] local preview note saved: ${reference} (details stored outside public/)`);
  return sendJson(response, 202, { ok: true, delivery: 'local', reference });
}
async function readRawBody(request, maxBytes = 1_000_000) {
  return new Promise((resolve, reject) => {
    const contentType = String(request.headers['content-type'] || '').toLowerCase();
    if (!contentType.includes('application/json')) {
      reject(Object.assign(new Error('Send the webhook as JSON.'), { statusCode: 415 }));
      request.resume();
      return;
    }
    const chunks = [];
    let size = 0;
    let finished = false;
    request.on('data', (chunk) => {
      if (finished) return;
      size += chunk.length;
      if (size > maxBytes) {
        finished = true;
        reject(Object.assign(new Error('Webhook body is too large.'), { statusCode: 413 }));
        request.resume();
        return;
      }
      chunks.push(chunk);
    });
    request.on('end', () => {
      if (!finished) resolve(Buffer.concat(chunks));
    });
    request.on('error', (error) => { if (!finished) reject(error); });
  });
}

let cachedBookingAdapter = null;
let cachedBookingAdapterPath = '';
let cachedBookingAdapterMtime = 0;
const BOOKING_ADAPTER_METHODS = [
  'getPricedQuote', 'createPaymentIntent', 'attachRazorpayOrder',
  'findPaymentIntentByOrderId', 'confirmAfterCapture', 'recordWebhookEvent'
];
async function loadBookingAdapter() {
  if (!BOOKING_ADAPTER_MODULE) return null;
  const integrationsRoot = path.resolve(ROOT, 'integrations');
  const resolved = path.resolve(ROOT, BOOKING_ADAPTER_MODULE);
  if (!resolved.startsWith(`${integrationsRoot}${path.sep}`)) throw new Error('Booking adapter must resolve inside integrations/.');
  const fileInfo = await stat(resolved);
  if (!fileInfo.isFile()) throw new Error('Configured booking adapter is not a file.');
  if (cachedBookingAdapter && cachedBookingAdapterPath === resolved && cachedBookingAdapterMtime === fileInfo.mtimeMs) return cachedBookingAdapter;
  const imported = await import(`${pathToFileURL(resolved).href}?modified=${Math.trunc(fileInfo.mtimeMs)}`);
  const adapter = imported.default || imported.adapter || imported;
  const missing = BOOKING_ADAPTER_METHODS.filter((method) => typeof adapter[method] !== 'function');
  if (missing.length) throw new Error(`Booking adapter is missing methods: ${missing.join(', ')}.`);
  cachedBookingAdapter = adapter;
  cachedBookingAdapterPath = resolved;
  cachedBookingAdapterMtime = fileInfo.mtimeMs;
  return adapter;
}
async function getBookingReadiness() {
  const [tboAir, adapter] = await Promise.all([
    tboFlightStatus(),
    loadBookingAdapter().catch((error) => ({ adapterError: clean(error.message, 180) }))
  ]);
  const hotel = tboHotelStatus();
  const payments = razorpayStatus();
  const bookingAdapter = adapter && !adapter.adapterError ? adapter : null;
  const missing = [];
  if (!LIVE_BOOKING_ENABLED) missing.push('TRIWAL_LIVE_BOOKING=true');
  if (!hotel.ready) missing.push('TBO hotel access, HTTPS endpoint, credentials and certification');
  if (!tboAir.ready) missing.push('TBO air adapter and production certification');
  if (!payments.configured) missing.push('Razorpay key ID, secret, webhook secret and required mode');
  if (!bookingAdapter) missing.push('persistent, idempotent booking adapter');
  return { ready: missing.length === 0, missing, hotel, tboAir, payments, bookingAdapter };
}

async function handleIntegrationStatus(request, response) {
  const [air, booking] = await Promise.all([tboFlightStatus(), getBookingReadiness()]);
  const ai = openAiStatus();
  const zoho = zohoStatus();
  const hotel = tboHotelStatus();
  const payments = razorpayStatus();
  return sendJson(response, 200, {
    ai: { configured: ai.configured, provider: ai.provider, model: ai.model },
    crm: { zohoConfigured: zoho.configured, webhookConfigured: Boolean(LEADS_WEBHOOK_URL), deliveryConfigured: Boolean(zoho.configured || LEADS_WEBHOOK_URL) },
    inventory: { tboHotels: hotel, tboAir: air },
    payments: { razorpayConfigured: payments.configured },
    liveBooking: { enabled: LIVE_BOOKING_ENABLED, ready: booking.ready, missing: booking.missing }
  });
}
async function handleTboHotelSearch(request, response) {
  if (limited(`tbo-hotel:${clientKey(request)}`, 20, 60_000)) return sendJson(response, 429, { error: 'Please slow down and try the hotel search again in a minute.' });
  const input = await readJson(request, 12_000);
  const results = await searchTboHotels(input);
  return sendJson(response, 200, results);
}
async function handleTboFlightSearch(request, response) {
  if (limited(`tbo-air:${clientKey(request)}`, 20, 60_000)) return sendJson(response, 429, { error: 'Please slow down and try the flight search again in a minute.' });
  const input = await readJson(request, 12_000);
  const results = await searchTboFlights(input);
  return sendJson(response, 200, results);
}
function quoteIsValid(quote) {
  if (!quote || quote.status !== 'priced' || quote.supplierValidated !== true) return false;
  const amount = Number(quote.amountMinor);
  const expiry = Date.parse(quote.expiresAt || '');
  return Number.isSafeInteger(amount) && amount >= 100 && /^[A-Z]{3}$/.test(String(quote.currency || '')) && Number.isFinite(expiry) && expiry > Date.now();
}
async function requireLiveBookingAdapter() {
  const readiness = await getBookingReadiness();
  if (!readiness.ready) {
    const error = new Error('Live checkout is disabled until all supplier, payment and persistent-booking gates are ready.');
    error.statusCode = 503;
    error.missing = readiness.missing;
    throw error;
  }
  return readiness.bookingAdapter;
}
async function handleCreatePaymentOrder(request, response) {
  if (limited(`payment-order:${clientKey(request)}`, 8, 60_000)) return sendJson(response, 429, { error: 'Please wait before starting another checkout.' });
  const body = await readJson(request, 8_000);
  const quoteId = clean(body.quoteId, 120);
  if (!quoteId || !/^[A-Za-z0-9._:-]+$/.test(quoteId)) return sendJson(response, 400, { error: 'A valid server-issued quote ID is required.' });
  const adapter = await requireLiveBookingAdapter();
  const quote = await adapter.getPricedQuote({ quoteId });
  if (!quoteIsValid(quote)) return sendJson(response, 409, { error: 'The supplier quote is not current or has not been revalidated. Refresh availability before paying.' });
  const intent = await adapter.createPaymentIntent({
    quoteId,
    amountMinor: Number(quote.amountMinor),
    currency: String(quote.currency).toUpperCase(),
    expiresAt: quote.expiresAt
  });
  if (!intent?.id || !intent?.receipt) throw Object.assign(new Error('The booking store did not create a payment intent.'), { statusCode: 503 });
  const order = await createRazorpayOrder({
    amountMinor: Number(quote.amountMinor),
    currency: String(quote.currency).toUpperCase(),
    receipt: intent.receipt,
    notes: { triwalQuoteId: quoteId, triwalPaymentIntentId: String(intent.id) }
  });
  await adapter.attachRazorpayOrder({ paymentIntentId: String(intent.id), quoteId, order });
  return sendJson(response, 201, {
    orderId: order.id,
    amount: order.amount,
    currency: order.currency,
    keyId: razorpayClientKeyId(),
    quoteId,
    paymentIntentId: String(intent.id)
  });
}
async function handleVerifyPayment(request, response) {
  if (limited(`payment-verify:${clientKey(request)}`, 20, 60_000)) return sendJson(response, 429, { error: 'Please wait before checking this payment again.' });
  const body = await readJson(request, 8_000);
  const orderId = clean(body.razorpay_order_id, 80);
  const paymentId = clean(body.razorpay_payment_id, 80);
  const signature = clean(body.razorpay_signature, 200);
  const quoteId = clean(body.quoteId, 120);
  if (!orderId || !paymentId || !signature || !quoteId) return sendJson(response, 400, { error: 'Payment verification details are incomplete.' });
  const adapter = await requireLiveBookingAdapter();
  const intent = await adapter.findPaymentIntentByOrderId({ orderId });
  if (!intent || String(intent.quoteId) !== quoteId) return sendJson(response, 404, { error: 'Payment intent was not found for this quote.' });
  if (!verifyRazorpayCheckoutSignature({ orderId, paymentId, signature })) return sendJson(response, 400, { error: 'Payment signature could not be verified.' });
  const payment = await fetchRazorpayPayment(paymentId);
  if (String(payment.order_id) !== orderId || Number(payment.amount) !== Number(intent.amountMinor) || String(payment.currency).toUpperCase() !== String(intent.currency).toUpperCase()) {
    return sendJson(response, 409, { error: 'The payment details do not match the stored quote.' });
  }
  if (payment.status !== 'captured') return sendJson(response, 409, { error: 'Payment is not captured yet. The trip has not been confirmed.' });
  const outcome = await adapter.confirmAfterCapture({
    paymentIntentId: String(intent.id), quoteId,
    payment: { id: paymentId, orderId, amountMinor: Number(payment.amount), currency: String(payment.currency).toUpperCase(), status: payment.status }
  });
  const confirmed = outcome?.status === 'confirmed';
  return sendJson(response, confirmed ? 200 : 202, {
    ok: true,
    status: confirmed ? 'confirmed' : 'payment-received-pending-confirmation',
    reference: clean(outcome?.reference || intent.reference || '', 80),
    message: confirmed ? 'Payment verified and supplier booking confirmed.' : 'Payment is verified. The supplier booking is being reconciled; do not pay again.'
  });
}
async function handleRazorpayWebhook(request, response) {
  const rawBody = await readRawBody(request, 1_000_000);
  const signature = String(request.headers['x-razorpay-signature'] || '');
  if (!verifyRazorpayWebhookSignature(rawBody, signature)) return sendJson(response, 401, { error: 'Invalid payment webhook signature.' });
  let event;
  try { event = JSON.parse(rawBody.toString('utf8')); }
  catch { return sendJson(response, 400, { error: 'Webhook body is not valid JSON.' }); }
  const eventId = clean(request.headers['x-razorpay-event-id'] || event.id || '', 120);
  const eventType = clean(event.event, 80);
  if (!eventId) return sendJson(response, 400, { error: 'Webhook event ID is required.' });
  if (!['payment.captured', 'order.paid'].includes(eventType)) {
    setHeaders(response);
    return response.writeHead(204, { 'Cache-Control': 'no-store' }).end();
  }
  const adapter = await requireLiveBookingAdapter();
  const entity = eventType === 'payment.captured' ? event.payload?.payment?.entity : event.payload?.order?.entity;
  const orderId = clean(entity?.order_id || entity?.id || '', 80);
  const paymentId = clean(event.payload?.payment?.entity?.id || '', 80);
  if (!orderId || !paymentId) return sendJson(response, 400, { error: 'Webhook is missing a payment or order ID.' });
  const intent = await adapter.findPaymentIntentByOrderId({ orderId });
  if (!intent) return sendJson(response, 404, { error: 'No Triwal payment intent matches this provider order.' });
  const payment = await fetchRazorpayPayment(paymentId);
  if (String(payment.order_id) !== orderId || Number(payment.amount) !== Number(intent.amountMinor) || String(payment.currency).toUpperCase() !== String(intent.currency).toUpperCase() || payment.status !== 'captured') {
    return sendJson(response, 409, { error: 'Provider payment does not match the stored intent.' });
  }
  const outcome = await adapter.confirmAfterCapture({
    paymentIntentId: String(intent.id), quoteId: String(intent.quoteId),
    payment: { id: paymentId, orderId, amountMinor: Number(payment.amount), currency: String(payment.currency).toUpperCase(), status: payment.status }
  });
  await adapter.recordWebhookEvent({ eventId, eventType, paymentIntentId: String(intent.id), outcome: clean(outcome?.status || 'pending', 60) });
  return sendJson(response, 200, { ok: true });
}

async function serveStatic(request, response, pathname) {
  let decoded;
  try { decoded = decodeURIComponent(pathname); }
  catch { return sendJson(response, 400, { error: 'Invalid URL path.' }); }
  if (decoded.includes('\0')) return sendJson(response, 400, { error: 'Invalid URL path.' });
  const pathWithIndex = decoded.endsWith('/') ? `${decoded}index.html` : decoded;
  const filePath = path.resolve(PUBLIC_DIR, `.${pathWithIndex}`);
  if (filePath !== PUBLIC_DIR && !filePath.startsWith(`${PUBLIC_DIR}${path.sep}`)) {
    return sendJson(response, 403, { error: 'Forbidden.' });
  }
  let info;
  try { info = await stat(filePath); }
  catch { return sendJson(response, 404, { error: 'Not found.' }); }
  if (!info.isFile()) return sendJson(response, 404, { error: 'Not found.' });
  const extension = path.extname(filePath).toLowerCase();
  setHeaders(response);
  response.writeHead(200, {
    'Content-Type': MIME_TYPES[extension] || 'application/octet-stream',
    'Content-Length': info.size,
    'Cache-Control': extension === '.html' ? 'no-cache' : extension === '.css' ? 'no-cache' : 'public, max-age=3600',
    'Last-Modified': info.mtime.toUTCString()
  });
  if (request.method === 'HEAD') return response.end();
  const stream = createReadStream(filePath);
  stream.on('error', () => {
    if (!response.headersSent) sendJson(response, 500, { error: 'Unable to read this file.' });
    else response.destroy();
  });
  stream.pipe(response);
}

const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url || '/', 'http://triwal.local');
    const pathname = url.pathname;
    if (pathname.startsWith('/api/')) {
      if (pathname === '/api/health' && request.method === 'GET') {
        const booking = await getBookingReadiness();
        const ai = openAiStatus();
        const crmConfigured = zohoStatus().configured || Boolean(LEADS_WEBHOOK_URL);
        return sendJson(response, 200, {
          ok: true,
          aiConfigured: ai.configured,
          leadDeliveryConfigured: crmConfigured,
          zohoConfigured: zohoStatus().configured,
          tboHotelSearchReady: tboHotelStatus().ready,
          tboAirReady: booking.tboAir.ready,
          razorpayConfigured: razorpayStatus().configured,
          liveBookingReady: booking.ready
        });
      }
      if (pathname === '/api/integrations/status' && request.method === 'GET') return await handleIntegrationStatus(request, response);
      const postRoutes = {
        '/api/itinerary': handleItinerary,
        '/api/inquiries': handleInquiry,
        '/api/tbo/hotels/search': handleTboHotelSearch,
        '/api/tbo/air/search': handleTboFlightSearch,
        '/api/payments/orders': handleCreatePaymentOrder,
        '/api/payments/verify': handleVerifyPayment,
        '/api/payments/webhook': handleRazorpayWebhook
      };
      if (postRoutes[pathname] && request.method === 'POST') return await postRoutes[pathname](request, response);
      if (pathname === '/api/health' || pathname === '/api/integrations/status') {
        response.setHeader('Allow', 'GET');
        return sendJson(response, 405, { error: 'Method not allowed.' });
      }
      if (pathname in postRoutes) {
        response.setHeader('Allow', 'POST');
        return sendJson(response, 405, { error: 'Method not allowed.' });
      }
      return sendJson(response, 404, { error: 'API route not found.' });
    }
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      response.setHeader('Allow', 'GET, HEAD');
      return sendJson(response, 405, { error: 'Method not allowed.' });
    }
    return await serveStatic(request, response, pathname);
  } catch (error) {
    const statusCode = Number(error.statusCode) || 500;
    if (statusCode >= 500) console.error(`[server] ${clean(error.message, 240)}`);
    return sendJson(response, statusCode, { error: statusCode >= 500 && IS_PRODUCTION ? 'Something went wrong. Please try again.' : clean(error.message, 240) || 'Unexpected error.' });
  }
});

server.listen(PORT, HOST, () => {
  console.info(`Triwal Traviator ready at http://${HOST}:${PORT}`);
  if (!AI_API_KEY) console.info('Planner mode: local curated starter itineraries (set AI_API_KEY for OpenAI Responses API generation).');
  if (!zohoStatus().configured && !LEADS_WEBHOOK_URL) console.info(IS_PRODUCTION ? 'Lead delivery is not configured; production enquiries will be rejected.' : 'Lead mode: local preview only; submitted notes are written to storage/ (outside public/).');
  if (!LIVE_BOOKING_ENABLED) console.info('Checkout mode: disabled by default; supplier certification, a persistent booking adapter and Razorpay configuration are required.');
});

function shutdown(signal) {
  console.info(`Received ${signal}; closing server.`);
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 10_000).unref();
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
