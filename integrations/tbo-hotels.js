import { XMLParser } from 'fast-xml-parser';

const SOAP_NS = 'http://TekTravel/HotelBookingApi';
const WSA_NS = 'http://www.w3.org/2005/08/addressing';
const parser = new XMLParser({
  removeNSPrefix: true,
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  parseTagValue: true,
  trimValues: true,
  processEntities: false,
  maxNestedTags: 64
});

function envUrl() {
  const raw = (process.env.TBO_HOTEL_API_URL || '').trim();
  if (!raw) return null;
  try { return new URL(raw); } catch { return null; }
}
export function tboHotelStatus() {
  const endpoint = envUrl();
  const enabled = process.env.TBO_HOTEL_ENABLED === 'true';
  const certified = process.env.TBO_HOTEL_CERTIFIED === 'true';
  const approvedSupplierHost = Boolean(endpoint && (endpoint.hostname.toLowerCase() === 'api.tbotechnology.in' || endpoint.hostname.toLowerCase().endsWith('.tbotechnology.in')));
  const credentialsConfigured = Boolean(process.env.TBO_HOTEL_USERNAME && process.env.TBO_HOTEL_PASSWORD && endpoint);
  const secureEndpoint = endpoint?.protocol === 'https:' && approvedSupplierHost && !endpoint.username && !endpoint.password;
  const mode = process.env.TBO_HOTEL_ENV || 'unconfigured';
  const productionAccess = process.env.NODE_ENV !== 'production' || (certified && mode === 'production');
  return {
    provider: 'tbo-hotels-soap-v7',
    credentialsConfigured,
    enabled,
    certified,
    ready: Boolean(enabled && credentialsConfigured && secureEndpoint && productionAccess),
    mode
  };
}
function requireHotelReadiness() {
  const status = tboHotelStatus();
  if (!status.ready) {
    const error = new Error('TBO hotel availability is disabled until a secure endpoint, partner credentials, and required access/certification are configured.');
    error.statusCode = 503;
    throw error;
  }
  return envUrl();
}
function xmlEscape(value) {
  return String(value ?? '').replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[character]);
}
function validDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value || ''))) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}
function validateSearch(input) {
  const cityId = Number(input.cityId);
  const cityName = String(input.cityName || '').trim().slice(0, 100);
  const countryName = String(input.countryName || '').trim().slice(0, 100);
  const checkIn = String(input.checkIn || '');
  const checkOut = String(input.checkOut || '');
  const guestNationality = String(input.guestNationality || 'IN').trim().toUpperCase();
  const currency = String(input.currency || 'INR').trim().toUpperCase();
  const roomsInput = Array.isArray(input.rooms) ? input.rooms : [{ adults: input.adults || 2, childAges: [] }];
  if (!Number.isInteger(cityId) || cityId < 1 || !cityName || !countryName) throw Object.assign(new Error('TBO hotel searches require a valid supplier city ID, city name, and country name.'), { statusCode: 400 });
  if (!validDate(checkIn) || !validDate(checkOut) || checkOut <= checkIn) throw Object.assign(new Error('Choose valid hotel check-in and check-out dates.'), { statusCode: 400 });
  const nights = (Date.parse(`${checkOut}T00:00:00Z`) - Date.parse(`${checkIn}T00:00:00Z`)) / 86_400_000;
  if (nights > 60) throw Object.assign(new Error('Hotel stays are limited to 60 nights per search.'), { statusCode: 400 });
  if (!/^[A-Z]{2}$/.test(guestNationality)) throw Object.assign(new Error('Guest nationality must be a two-letter country code.'), { statusCode: 400 });
  if (!/^[A-Z]{3}$/.test(currency)) throw Object.assign(new Error('Use a three-letter currency code.'), { statusCode: 400 });
  if (roomsInput.length < 1 || roomsInput.length > 4) throw Object.assign(new Error('Search between one and four rooms at a time.'), { statusCode: 400 });
  const rooms = roomsInput.map((room) => {
    const adults = Number(room.adults);
    const childAges = Array.isArray(room.childAges) ? room.childAges.map(Number) : [];
    if (!Number.isInteger(adults) || adults < 1 || adults > 8) throw Object.assign(new Error('Each room must have between one and eight adults.'), { statusCode: 400 });
    if (childAges.length > 6 || childAges.some((age) => !Number.isInteger(age) || age < 0 || age > 17)) throw Object.assign(new Error('Child ages must be between 0 and 17.'), { statusCode: 400 });
    return { adults, childAges };
  });
  return { cityId, cityName, countryName, checkIn, checkOut, guestNationality, currency, rooms };
}
function buildHotelSearchSoap(search) {
  const roomsXml = search.rooms.map(({ adults, childAges }) => `
      <hot:RoomGuest AdultCount="${adults}" ChildCount="${childAges.length}">${childAges.length ? `<hot:ChildAge>${childAges.map((age) => `<hot:int>${age}</hot:int>`).join('')}</hot:ChildAge>` : ''}</hot:RoomGuest>`).join('');
  const username = xmlEscape(process.env.TBO_HOTEL_USERNAME);
  const password = xmlEscape(process.env.TBO_HOTEL_PASSWORD);
  const endpoint = xmlEscape(envUrl().toString());
  return `<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:soap="http://www.w3.org/2003/05/soap-envelope" xmlns:hot="${SOAP_NS}">
  <soap:Header xmlns:wsa="${WSA_NS}">
    <hot:Credentials UserName="${username}" Password="${password}" />
    <wsa:Action>${SOAP_NS}/HotelSearch</wsa:Action>
    <wsa:To>${endpoint}</wsa:To>
  </soap:Header>
  <soap:Body>
    <hot:HotelSearchRequest>
      <hot:CheckInDate>${search.checkIn}</hot:CheckInDate>
      <hot:CheckOutDate>${search.checkOut}</hot:CheckOutDate>
      <hot:CountryName>${xmlEscape(search.countryName)}</hot:CountryName>
      <hot:CityName>${xmlEscape(search.cityName)}</hot:CityName>
      <hot:CityId>${search.cityId}</hot:CityId>
      <hot:IsNearBySearchAllowed>false</hot:IsNearBySearchAllowed>
      <hot:NoOfRooms>${search.rooms.length}</hot:NoOfRooms>
      <hot:GuestNationality>${search.guestNationality}</hot:GuestNationality>
      <hot:RoomGuests>${roomsXml}</hot:RoomGuests>
      <hot:PreferredCurrencyCode>${search.currency}</hot:PreferredCurrencyCode>
      <hot:ResultCount>0</hot:ResultCount>
      <hot:Filters><hot:StarRating>All</hot:StarRating><hot:OrderBy>PriceAsc</hot:OrderBy></hot:Filters>
      <hot:ResponseTime>10</hot:ResponseTime>
    </hot:HotelSearchRequest>
  </soap:Body>
</soap:Envelope>`;
}
function findNode(object, key) {
  if (!object || typeof object !== 'object') return undefined;
  for (const [name, value] of Object.entries(object)) {
    if (name.split(':').at(-1) === key) return value;
    const nested = findNode(value, key);
    if (nested !== undefined) return nested;
  }
  return undefined;
}
function text(value) {
  if (value == null) return '';
  if (typeof value === 'object') return String(value['#text'] ?? '');
  return String(value);
}
function attribute(value, key) {
  if (!value || typeof value !== 'object') return '';
  return text(value[`@_${key}`]);
}
function asArray(value) {
  if (value == null) return [];
  return Array.isArray(value) ? value : [value];
}
function safeNumber(value) {
  const result = Number(value);
  return Number.isFinite(result) ? result : null;
}
function safeSupplierImage(value) {
  try {
    const url = new URL(String(value || ''));
    if (url.protocol !== 'https:') return '';
    const host = url.hostname.toLowerCase();
    if (!(host === 'api.tbotechnology.in' || host.endsWith('.tbo.com') || host.endsWith('.tboholidays.com'))) return '';
    return url.toString().slice(0, 1000);
  } catch { return ''; }
}
async function readLimitedText(response, maxBytes = 2_000_000) {
  if (!response.body) return '';
  const reader = response.body.getReader();
  const chunks = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > maxBytes) {
      await reader.cancel().catch(() => {});
      throw new Error('TBO response exceeded the allowed size.');
    }
    chunks.push(Buffer.from(value));
  }
  return Buffer.concat(chunks, size).toString('utf8');
}
function normalizeHotelResponse(xml) {
  if (xml.length > 2_000_000) throw new Error('TBO response exceeded the allowed size.');
  if (/<!DOCTYPE|<!ENTITY/i.test(xml)) throw new Error('TBO response contained a disallowed XML declaration.');
  const parsed = parser.parse(xml);
  const root = findNode(parsed, 'HotelSearchResponse');
  if (!root) throw new Error('TBO returned an unreadable hotel-search response.');
  const status = findNode(root, 'Status');
  const statusCode = text(findNode(status, 'StatusCode')).padStart(2, '0');
  const statusDescription = text(findNode(status, 'Description'));
  if (statusCode !== '01') throw Object.assign(new Error(`TBO hotel search was not successful${statusDescription ? `: ${statusDescription.slice(0, 160)}` : ''}.`), { statusCode: 502 });
  const sessionId = text(findNode(root, 'SessionId'));
  const resultList = findNode(root, 'HotelResultList');
  const hotelNodes = asArray(findNode(resultList, 'HotelResult')).slice(0, 40);
  const hotels = hotelNodes.map((hotel) => {
    const info = findNode(hotel, 'HotelInfo') || {};
    const price = findNode(hotel, 'MinHotelPrice') || {};
    return {
      resultIndex: text(findNode(hotel, 'ResultIndex')),
      hotelCode: text(findNode(info, 'HotelCode')),
      name: text(findNode(info, 'HotelName')).slice(0, 180),
      address: text(findNode(info, 'HotelAddress')).slice(0, 240),
      description: text(findNode(info, 'HotelDescription')).slice(0, 500),
      imageUrl: safeSupplierImage(text(findNode(info, 'HotelPicture'))),
      rating: text(findNode(info, 'Rating')).slice(0, 40),
      price: safeNumber(attribute(price, 'PrefPrice') || attribute(price, 'TotalPrice')),
      currency: (attribute(price, 'PrefCurrency') || attribute(price, 'Currency')).slice(0, 3),
      refundableOrPolicy: 'Confirm current room policy and final price with TBO before booking.'
    };
  }).filter((hotel) => hotel.hotelCode && hotel.name);
  return { provider: 'tbo', sessionId, hotels, statusDescription: statusDescription.slice(0, 200) };
}

export async function searchTboHotels(rawInput) {
  const endpoint = requireHotelReadiness();
  const input = validateSearch(rawInput);
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/soap+xml; charset=utf-8',
      'Accept': 'application/soap+xml, text/xml'
    },
    body: buildHotelSearchSoap(input),
    signal: AbortSignal.timeout(20_000)
  });
  const responseText = await readLimitedText(response);
  if (!response.ok) throw Object.assign(new Error(`TBO hotel service returned HTTP ${response.status}.`), { statusCode: 502 });
  return normalizeHotelResponse(responseText);
}

export const tboHotelInternals = Object.freeze({ validateSearch, buildHotelSearchSoap, normalizeHotelResponse });
