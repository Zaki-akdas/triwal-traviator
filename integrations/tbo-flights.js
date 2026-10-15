import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { stat } from 'node:fs/promises';

const REQUIRED_METHODS = ['searchFlights', 'priceFlight', 'createBooking', 'getBooking', 'cancelBooking'];
const configuredAdapterPath = () => process.env.TBO_AIR_ADAPTER_MODULE || process.env.TBO_FLIGHT_ADAPTER_MODULE || '';
let cachedModule = '';
let cachedMtime = 0;
let cachedAdapter = null;

async function loadAdapter() {
  const configuredPath = configuredAdapterPath();
  if (!configuredPath) return null;
  const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const integrationsRoot = path.join(projectRoot, 'integrations');
  const resolved = path.resolve(projectRoot, configuredPath);
  if (!resolved.startsWith(`${integrationsRoot}${path.sep}`)) {
    throw new Error('TBO_FLIGHT_ADAPTER_MODULE must resolve inside the integrations/ directory.');
  }
  const fileInfo = await stat(resolved);
  if (!fileInfo.isFile()) throw new Error('Configured TBO flight adapter is not a file.');
  if (cachedAdapter && cachedModule === resolved && cachedMtime === fileInfo.mtimeMs) return cachedAdapter;
  const moduleUrl = `${pathToFileURL(resolved).href}?modified=${Math.trunc(fileInfo.mtimeMs)}`;
  const imported = await import(moduleUrl);
  const adapter = imported.default || imported.adapter || imported;
  const missing = REQUIRED_METHODS.filter((method) => typeof adapter[method] !== 'function');
  if (missing.length) throw new Error(`TBO flight adapter is missing: ${missing.join(', ')}.`);
  cachedModule = resolved;
  cachedMtime = fileInfo.mtimeMs;
  cachedAdapter = adapter;
  return adapter;
}
export async function tboFlightStatus() {
  const certified = process.env.TBO_FLIGHT_CERTIFIED === 'true';
  const enabled = process.env.TBO_FLIGHT_ENABLED === 'true';
  const mode = process.env.TBO_FLIGHT_ENV || 'unconfigured';
  const productionAccess = process.env.NODE_ENV !== 'production' || (certified && mode === 'production');
  const adapterPath = configuredAdapterPath();
  let adapterAvailable = false;
  let error = '';
  if (adapterPath) {
    try { adapterAvailable = Boolean(await loadAdapter()); }
    catch { error = 'Adapter unavailable; check server-side configuration and logs.'; }
  }
  return {
    provider: 'tbo-air-partner-adapter',
    adapterConfigured: Boolean(adapterPath),
    adapterAvailable,
    enabled,
    certified,
    mode,
    ready: Boolean(enabled && adapterAvailable && (process.env.NODE_ENV !== 'production' || productionAccess) && (process.env.NODE_ENV === 'production' ? certified : true)),
    ...(error ? { configurationError: error } : {})
  };
}
export async function searchTboFlights(input) {
  const status = await tboFlightStatus();
  if (!status.ready) throw Object.assign(new Error('TBO air search is disabled until the partner flight adapter is installed and certified.'), { statusCode: 503 });
  const adapter = await loadAdapter();
  return adapter.searchFlights(input);
}
export async function priceTboFlight(input) {
  const status = await tboFlightStatus();
  if (!status.ready) throw Object.assign(new Error('TBO air pricing is disabled until the partner flight adapter is installed and certified.'), { statusCode: 503 });
  const adapter = await loadAdapter();
  return adapter.priceFlight(input);
}
