import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { tboHotelInternals, tboHotelStatus } from '../integrations/tbo-hotels.js';
import { razorpayStatus, verifyRazorpayCheckoutSignature, verifyRazorpayWebhookSignature } from '../integrations/razorpay.js';

const sampleTboXml = `<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:soap="http://www.w3.org/2003/05/soap-envelope" xmlns:hot="http://TekTravel/HotelBookingApi">
  <soap:Body><hot:HotelSearchResponse>
    <hot:Status><hot:StatusCode>01</hot:StatusCode><hot:Description>Successful: HotelSearch Successful</hot:Description></hot:Status>
    <hot:SessionId>session-test-001</hot:SessionId>
    <hot:HotelResultList><hot:HotelResult><hot:ResultIndex>4</hot:ResultIndex>
      <hot:HotelInfo><hot:HotelCode>1042</hot:HotelCode><hot:HotelName>Example Hotel</hot:HotelName><hot:HotelAddress>Kyoto</hot:HotelAddress><hot:Rating>FourStar</hot:Rating></hot:HotelInfo>
      <hot:MinHotelPrice PrefPrice="12000.50" PrefCurrency="INR" TotalPrice="140.00" Currency="USD" />
    </hot:HotelResult></hot:HotelResultList>
  </hot:HotelSearchResponse></soap:Body>
</soap:Envelope>`;

function withEnv(values, fn) {
  const before = Object.fromEntries(Object.keys(values).map((key) => [key, process.env[key]]));
  for (const [key, value] of Object.entries(values)) process.env[key] = value;
  try { return fn(); }
  finally {
    for (const [key, value] of Object.entries(before)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

async function withEnvAsync(values, fn) {
  const before = Object.fromEntries(Object.keys(values).map((key) => [key, process.env[key]]));
  for (const [key, value] of Object.entries(values)) {
    if (value == null) delete process.env[key];
    else process.env[key] = value;
  }
  try { return await fn(); }
  finally {
    for (const [key, value] of Object.entries(before)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

test('OpenAI uses the supported GPT-5.4 Mini model by default when no model override is set', async () => {
  await withEnvAsync({ AI_MODEL: null }, async () => {
    const { openAiStatus } = await import(`../integrations/openai.js?model-default-test=${Date.now()}`);
    assert.equal(openAiStatus().model, 'gpt-5.4-mini');
  });
});

test('TBO air readiness recognizes the documented adapter setting and legacy alias', async () => {
  for (const values of [
    { TBO_AIR_ADAPTER_MODULE: 'integrations/partner-flight-adapter.js', TBO_FLIGHT_ADAPTER_MODULE: null },
    { TBO_AIR_ADAPTER_MODULE: null, TBO_FLIGHT_ADAPTER_MODULE: 'integrations/partner-flight-adapter.js' }
  ]) {
    await withEnvAsync(values, async () => {
      const { tboFlightStatus } = await import(`../integrations/tbo-flights.js?adapter-env-test=${Date.now()}-${Math.random()}`);
      const status = await tboFlightStatus();
      assert.equal(status.adapterConfigured, true);
      assert.equal(status.ready, false, 'a missing, uncertified supplier module must remain gated');
    });
  }
});

test('TBO SOAP response normalizes supplier session, hotel and currency-price fields', () => {
  const result = tboHotelInternals.normalizeHotelResponse(sampleTboXml);
  assert.equal(result.sessionId, 'session-test-001');
  assert.equal(result.hotels.length, 1);
  assert.equal(result.hotels[0].hotelCode, '1042');
  assert.equal(result.hotels[0].name, 'Example Hotel');
  assert.equal(result.hotels[0].price, 12000.5);
  assert.equal(result.hotels[0].currency, 'INR');
});

test('TBO SOAP request escapes partner and destination attributes/text', () => {
  withEnv({
    TBO_HOTEL_API_URL: 'https://api.example.test/HotelService.svc',
    TBO_HOTEL_USERNAME: 'agent&name',
    TBO_HOTEL_PASSWORD: 'secret<value>'
  }, () => {
    const xml = tboHotelInternals.buildHotelSearchSoap({
      cityId: 42, cityName: 'A & B', countryName: 'Example <Country>', checkIn: '2027-01-10', checkOut: '2027-01-12',
      guestNationality: 'IN', currency: 'INR', rooms: [{ adults: 2, childAges: [8] }]
    });
    assert.match(xml, /UserName="agent&amp;name"/);
    assert.match(xml, /Password="secret&lt;value&gt;"/);
    assert.match(xml, /A &amp; B/);
    assert.match(xml, /Example &lt;Country&gt;/);
    assert.match(xml, /<hot:int>8<\/hot:int>/);
  });
});

test('TBO parser rejects unsuccessful supplier replies and DTD/entity payloads', () => {
  assert.throws(() => tboHotelInternals.normalizeHotelResponse('<HotelSearchResponse><Status><StatusCode>99</StatusCode><Description>Not available</Description></Status></HotelSearchResponse>'), /not successful/i);
  assert.throws(() => tboHotelInternals.normalizeHotelResponse('<!DOCTYPE x [<!ENTITY e "boom">]><HotelSearchResponse/>'), /disallowed XML/i);
});

test('TBO hotel production readiness requires the approved HTTPS supplier endpoint and certification', () => {
  const base = {
    NODE_ENV: 'production', TBO_HOTEL_ENABLED: 'true', TBO_HOTEL_CERTIFIED: 'true', TBO_HOTEL_ENV: 'production',
    TBO_HOTEL_USERNAME: 'user', TBO_HOTEL_PASSWORD: 'pass'
  };
  withEnv({ ...base, TBO_HOTEL_API_URL: 'https://example.test/service' }, () => assert.equal(tboHotelStatus().ready, false));
  withEnv({ ...base, TBO_HOTEL_API_URL: 'http://api.tbotechnology.in/service' }, () => assert.equal(tboHotelStatus().ready, false));
  withEnv({ ...base, TBO_HOTEL_API_URL: 'https://api.tbotechnology.in/hotelapi_v7/hotelservice.svc' }, () => assert.equal(tboHotelStatus().ready, true));
  withEnv({ ...base, TBO_HOTEL_CERTIFIED: 'false', TBO_HOTEL_API_URL: 'https://api.tbotechnology.in/service' }, () => assert.equal(tboHotelStatus().ready, false));
});

test('Razorpay production readiness rejects test keys and requires explicit live mode', () => {
  const values = { NODE_ENV: 'production', RAZORPAY_MODE: 'test', RAZORPAY_KEY_ID: 'rzp_test_123', RAZORPAY_KEY_SECRET: 'key-secret', RAZORPAY_WEBHOOK_SECRET: 'hook-secret' };
  withEnv(values, () => assert.equal(razorpayStatus().configured, false));
  withEnv({ ...values, RAZORPAY_MODE: 'live', RAZORPAY_KEY_ID: 'rzp_live_123' }, () => assert.equal(razorpayStatus().configured, true));
});

test('Razorpay checkout and webhook HMAC verification accept valid signatures only', () => {
  withEnv({ RAZORPAY_KEY_SECRET: 'test-key-secret', RAZORPAY_WEBHOOK_SECRET: 'test-hook-secret' }, () => {
    const orderId = 'order_demo123';
    const paymentId = 'pay_demo123';
    const checkoutSignature = createHmac('sha256', 'test-key-secret').update(`${orderId}|${paymentId}`).digest('hex');
    assert.equal(verifyRazorpayCheckoutSignature({ orderId, paymentId, signature: checkoutSignature }), true);
    assert.equal(verifyRazorpayCheckoutSignature({ orderId, paymentId, signature: `${checkoutSignature.slice(0, -1)}0` }), false);
    const rawBody = Buffer.from('{"event":"payment.captured","payload":{}}');
    const webhookSignature = createHmac('sha256', 'test-hook-secret').update(rawBody).digest('hex');
    assert.equal(verifyRazorpayWebhookSignature(rawBody, webhookSignature), true);
    assert.equal(verifyRazorpayWebhookSignature(rawBody, 'not-a-signature'), false);
  });
});
