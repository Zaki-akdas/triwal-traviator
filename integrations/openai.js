const OPENAI_MODEL = process.env.AI_MODEL || 'gpt-5.4-mini';
const OPENAI_BASE_URL = (process.env.AI_BASE_URL || 'https://api.openai.com/v1').replace(/\/+$/, '');
const OPENAI_API_KEY = process.env.AI_API_KEY || process.env.OPENAI_API_KEY || '';

export function openAiStatus() {
  return {
    configured: Boolean(OPENAI_API_KEY && OPENAI_MODEL),
    model: OPENAI_MODEL,
    provider: 'openai-responses'
  };
}

const itinerarySchema = {
  type: 'object',
  properties: {
    title: { type: 'string' },
    overview: { type: 'string' },
    days: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          theme: { type: 'string' },
          morning: { type: 'string' },
          lunch: { type: 'string' },
          afternoon: { type: 'string' },
          evening: { type: 'string' }
        },
        required: ['theme', 'morning', 'lunch', 'afternoon', 'evening'],
        additionalProperties: false
      }
    },
    tips: { type: 'array', items: { type: 'string' } }
  },
  required: ['title', 'overview', 'days', 'tips'],
  additionalProperties: false
};

function getOutputText(response) {
  if (typeof response.output_text === 'string' && response.output_text.trim()) return response.output_text;
  for (const item of response.output || []) {
    for (const part of item.content || []) {
      if (part.type === 'output_text' && typeof part.text === 'string') return part.text;
      if (part.type === 'refusal') throw new Error('The itinerary provider declined this request.');
    }
  }
  throw new Error('The AI provider returned no itinerary text.');
}

export async function generateOpenAiItinerary(input, place) {
  if (!OPENAI_API_KEY) throw new Error('OpenAI is not configured.');
  const endpoint = new URL(`${OPENAI_BASE_URL}/responses`);
  if (process.env.NODE_ENV === 'production' && endpoint.protocol !== 'https:') {
    throw new Error('AI_BASE_URL must use HTTPS in production.');
  }

  const instructions = [
    'You are Triwal Traviator’s careful travel itinerary assistant. Create a concise, realistic starter itinerary, never a booking or availability claim.',
    'Return exactly the requested number of day objects. Each day needs a theme, morning, lunch, afternoon and evening, with one concise, geographically plausible suggestion for each.',
    'Respect the destination, travel style, pace, party type and season. Use the supplied destination highlights, local foods and planning notes when present. Leave room for rest. Do not invent confirmed reservations, exact prices, live schedules, opening hours, entry rules or safety guarantees.',
    'Include useful verification tips: check current opening times, local transport and entry requirements before travel. Be respectful around religious sites and protected communities, and never guarantee wildlife sightings. If the destination is Bhutan, specifically advise checking current entry requirements and local rules with a qualified travel professional.'
  ].join(' ');
  const prompt = {
    destination: `${place.name}, ${place.country}`,
    destinationRegion: place.region || '',
    localHighlights: Array.isArray(place.highlights) ? place.highlights.slice(0, 6) : [],
    localFoods: Array.isArray(place.foods) ? place.foods.slice(0, 4) : [],
    suggestedTravelWindow: place.bestTime || '',
    planningNote: place.goodToKnow || '',
    days: input.days,
    travelStyle: input.style,
    pace: input.pace,
    travellingWith: input.party,
    season: input.month,
    language: 'English'
  };

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${OPENAI_API_KEY}`,
      'Content-Type': 'application/json',
      'Accept': 'application/json'
    },
    body: JSON.stringify({
      model: OPENAI_MODEL,
      instructions,
      input: JSON.stringify(prompt),
      text: {
        format: {
          type: 'json_schema',
          name: 'triwal_itinerary',
          strict: true,
          schema: itinerarySchema
        }
      },
      max_output_tokens: 2800,
      store: false
    }),
    signal: AbortSignal.timeout(25_000)
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = String(payload.error?.message || '').slice(0, 180);
    throw new Error(`OpenAI returned ${response.status}${message ? `: ${message}` : ''}`);
  }
  const outputText = getOutputText(payload);
  let plan;
  try { plan = JSON.parse(outputText); }
  catch { throw new Error('The AI response did not match the itinerary JSON schema.'); }
  if (!plan || !Array.isArray(plan.days) || plan.days.length < 3) {
    throw new Error('The AI response did not contain enough itinerary days.');
  }
  return plan;
}
