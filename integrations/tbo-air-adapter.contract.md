# TBO Air adapter contract

`TBO_AIR_ADAPTER_MODULE` is deliberately unset by default. Implement this contract in a private file under `integrations/` using the current flight API spec and credentials issued to the agency. Do not put supplier credentials in browser code or in this sample project.

The module can export its functions directly or as `default` / `adapter`:

```js
export async function searchFlights(input) { /* return normalized, supplier-backed results */ }
export async function priceFlight(input) { /* revalidate a selected offer before checkout */ }
export async function createBooking(input) { /* supplier booking/ticketing flow */ }
export async function getBooking(input) { /* reconcile by supplier reference */ }
export async function cancelBooking(input) { /* supplier cancellation workflow */ }
```

The adapter must validate inputs, use HTTPS, enforce supplier/session expiry, preserve supplier booking references, avoid logging passenger PII, and make booking/cancel/retry operations idempotent. The server only reports `ready` when every method is present **and** `TBO_FLIGHT_CERTIFIED=true`. Set that flag only after TBO's required partner approval/certification and end-to-end sandbox signoff.
