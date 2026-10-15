import { createHmac, timingSafeEqual } from 'node:crypto';

const API_ROOT = 'https://api.razorpay.com/v1';
function credentials() {
  return {
    keyId: process.env.RAZORPAY_KEY_ID || '',
    keySecret: process.env.RAZORPAY_KEY_SECRET || '',
    webhookSecret: process.env.RAZORPAY_WEBHOOK_SECRET || ''
  };
}
export function razorpayStatus() {
  const c = credentials();
  const mode = process.env.RAZORPAY_MODE || 'unconfigured';
  const keysConfigured = Boolean(c.keyId && c.keySecret && c.webhookSecret);
  const productionModeValid = process.env.NODE_ENV !== 'production' || (mode === 'live' && c.keyId.startsWith('rzp_live_'));
  return {
    configured: Boolean(keysConfigured && productionModeValid),
    keysConfigured,
    mode,
    provider: 'razorpay'
  };
}
function authHeader() {
  const { keyId, keySecret } = credentials();
  if (!keyId || !keySecret) throw new Error('Razorpay server credentials are not configured.');
  return `Basic ${Buffer.from(`${keyId}:${keySecret}`).toString('base64')}`;
}
function isValidHexSignature(received, expectedHex) {
  if (!/^[a-f\d]{64}$/i.test(String(received || ''))) return false;
  const actual = Buffer.from(received, 'hex');
  const expected = Buffer.from(expectedHex, 'hex');
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export async function createRazorpayOrder({ amountMinor, currency = 'INR', receipt, notes = {} }) {
  const amount = Number(amountMinor);
  if (!Number.isSafeInteger(amount) || amount < 100 || amount > 100_000_000_000) {
    throw new Error('Payment amount is invalid.');
  }
  const normalizedCurrency = String(currency).toUpperCase();
  if (!/^[A-Z]{3}$/.test(normalizedCurrency)) throw new Error('Payment currency is invalid.');
  const safeReceipt = String(receipt || '').replace(/[^A-Za-z0-9_.-]/g, '').slice(0, 40);
  if (!safeReceipt) throw new Error('A server-generated payment receipt is required.');
  const safeNotes = Object.fromEntries(Object.entries(notes || {}).slice(0, 10).map(([key, value]) => [
    String(key).slice(0, 40), String(value).slice(0, 240)
  ]));

  const response = await fetch(`${API_ROOT}/orders`, {
    method: 'POST',
    headers: {
      'Authorization': authHeader(),
      'Content-Type': 'application/json',
      'Accept': 'application/json'
    },
    body: JSON.stringify({ amount, currency: normalizedCurrency, receipt: safeReceipt, notes: safeNotes }),
    signal: AbortSignal.timeout(12_000)
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !payload.id) {
    const message = String(payload.error?.description || `HTTP ${response.status}`).slice(0, 180);
    throw new Error(`Razorpay order creation failed: ${message}`);
  }
  return {
    id: String(payload.id),
    amount: Number(payload.amount),
    currency: String(payload.currency || normalizedCurrency),
    status: String(payload.status || 'created'),
    keyId: credentials().keyId
  };
}

export function verifyRazorpayCheckoutSignature({ orderId, paymentId, signature }) {
  const secret = credentials().keySecret;
  if (!secret) throw new Error('Razorpay server credentials are not configured.');
  if (!orderId || !paymentId || !signature) return false;
  const expected = createHmac('sha256', secret).update(`${orderId}|${paymentId}`, 'utf8').digest('hex');
  return isValidHexSignature(signature, expected);
}

export function verifyRazorpayWebhookSignature(rawBody, signature) {
  const secret = credentials().webhookSecret;
  if (!secret) throw new Error('Razorpay webhook secret is not configured.');
  if (!rawBody || !signature) return false;
  const expected = createHmac('sha256', secret).update(rawBody).digest('hex');
  return isValidHexSignature(signature, expected);
}

export async function fetchRazorpayPayment(paymentId) {
  const id = String(paymentId || '');
  if (!/^pay_[A-Za-z0-9]+$/.test(id)) throw new Error('Payment ID is invalid.');
  const response = await fetch(`${API_ROOT}/payments/${encodeURIComponent(id)}`, {
    headers: { 'Authorization': authHeader(), 'Accept': 'application/json' },
    signal: AbortSignal.timeout(12_000)
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`Razorpay payment lookup failed (HTTP ${response.status}).`);
  return payload;
}

export function razorpayClientKeyId() {
  return credentials().keyId || '';
}
