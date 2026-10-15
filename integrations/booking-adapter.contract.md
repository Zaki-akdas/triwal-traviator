# Persistent booking adapter contract

`TRIWAL_BOOKING_ADAPTER_MODULE` is intentionally unset. This adapter is the transactional boundary between a supplier-verified quote, Razorpay and TBO booking confirmation. Implement it against a durable transactional database (for example, PostgreSQL on the agency's chosen host); do not use in-memory state or the development JSONL file for live orders.

The server loads a module inside `integrations/` only when the live feature flag is set. It must export all of these functions directly or under `default` / `adapter`:

```js
export async function getPricedQuote({ quoteId }) {
  // Return only a server-owned, supplier-revalidated quote:
  // { id, status: 'priced', supplierValidated: true,
  //   amountMinor: 250000, currency: 'INR', expiresAt: 'ISO-8601' }
}

export async function createPaymentIntent({ quoteId, amountMinor, currency, expiresAt }) {
  // Persist/lock the quote and create an idempotent intent before calling Razorpay.
  // Return { id, receipt } with a unique receipt of <= 40 safe characters.
}

export async function attachRazorpayOrder({ paymentIntentId, quoteId, order }) {
  // Persist the Razorpay order ID and its exact amount/currency against the intent.
}

export async function findPaymentIntentByOrderId({ orderId }) {
  // Return the intent including id, quoteId, amountMinor, currency, and status.
}

export async function confirmAfterCapture({ paymentIntentId, quoteId, payment }) {
  // Idempotently confirm with TBO after server verification. If supplier booking
  // is delayed or fails after capture, retain a pending/manual-review state and
  // start the agency's refund/reconciliation workflow; never claim confirmation.
  // Return { status: 'confirmed' | 'pending' | 'manual-review', reference }.
}

export async function recordWebhookEvent({ eventId, eventType, paymentIntentId, outcome }) {
  // Persist/dedupe the verified event ID so provider retries are safe.
}
```

Live checkout stays closed unless this module loads successfully, both TBO inventory products are certified, Razorpay keys and webhook secret exist, and `TRIWAL_LIVE_BOOKING=true`. The client can submit a quote ID only; the server reads and validates the price from this adapter. Implement database transactions, quote expiry, idempotency, duplicate webhook handling, and an operational/manual refund path before setting the live flag.
