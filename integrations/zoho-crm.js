let cachedToken = null;
let tokenRequest = null;

function zohoCredentials() {
  return {
    clientId: process.env.ZOHO_CLIENT_ID || '',
    clientSecret: process.env.ZOHO_CLIENT_SECRET || '',
    refreshToken: process.env.ZOHO_REFRESH_TOKEN || '',
    accountsUrl: (process.env.ZOHO_ACCOUNTS_URL || 'https://accounts.zoho.in').replace(/\/+$/, ''),
    apiDomainOverride: process.env.ZOHO_API_DOMAIN || ''
  };
}
export function zohoStatus() {
  const config = zohoCredentials();
  let region = 'unconfigured';
  try { region = new URL(config.accountsUrl).hostname; } catch { region = 'invalid-accounts-url'; }
  return {
    configured: Boolean(config.clientId && config.clientSecret && config.refreshToken && region !== 'invalid-accounts-url'),
    region,
    provider: 'zoho-crm-v8'
  };
}

async function refreshAccessToken() {
  const config = zohoCredentials();
  if (!config.clientId || !config.clientSecret || !config.refreshToken) {
    throw new Error('Zoho CRM OAuth is not configured.');
  }
  const accounts = new URL(config.accountsUrl);
  const allowedAccountsHosts = new Set(['accounts.zoho.com', 'accounts.zoho.in', 'accounts.zoho.eu', 'accounts.zoho.com.au', 'accounts.zoho.com.cn', 'accounts.zoho.jp', 'accounts.zoho.sa']);
  if (accounts.protocol !== 'https:' || !allowedAccountsHosts.has(accounts.hostname)) throw new Error('ZOHO_ACCOUNTS_URL must be an official HTTPS Zoho Accounts domain.');
  const tokenUrl = new URL('/oauth/v2/token', accounts);
  const form = new URLSearchParams({
    refresh_token: config.refreshToken,
    client_id: config.clientId,
    client_secret: config.clientSecret,
    grant_type: 'refresh_token'
  });
  const response = await fetch(tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Accept': 'application/json' },
    body: form,
    signal: AbortSignal.timeout(12_000)
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !payload.access_token) {
    throw new Error(`Zoho OAuth refresh failed${payload.error ? ` (${String(payload.error).slice(0, 80)})` : ` (${response.status})`}.`);
  }
  const apiDomain = config.apiDomainOverride || payload.api_domain;
  if (!apiDomain) throw new Error('Zoho did not return an API domain.');
  const parsedDomain = new URL(apiDomain);
  const allowedApiHosts = new Set(['www.zohoapis.com', 'www.zohoapis.in', 'www.zohoapis.eu', 'www.zohoapis.com.au', 'www.zohoapis.jp', 'www.zohoapis.sa', 'www.zohoapis.com.cn', 'zohoapis.com', 'zohoapis.in', 'zohoapis.eu', 'zohoapis.com.au', 'zohoapis.jp', 'zohoapis.sa', 'zohoapis.com.cn']);
  if (parsedDomain.protocol !== 'https:' || !allowedApiHosts.has(parsedDomain.hostname)) {
    throw new Error('Zoho returned an unexpected API domain.');
  }
  cachedToken = {
    accessToken: payload.access_token,
    apiDomain: parsedDomain.origin,
    expiresAt: Date.now() + Math.max(60, Number(payload.expires_in) || 3600) * 1000 - 60_000
  };
  return cachedToken;
}
async function getAccessToken() {
  if (cachedToken && Date.now() < cachedToken.expiresAt) return cachedToken;
  if (!tokenRequest) {
    tokenRequest = refreshAccessToken().finally(() => { tokenRequest = null; });
  }
  return tokenRequest;
}

function buildLeadRecord(lead) {
  const nameParts = String(lead.name || '').trim().split(/\s+/).filter(Boolean);
  const lastName = nameParts.length > 1 ? nameParts.pop() : (nameParts[0] || 'Website enquiry');
  const firstName = nameParts.join(' ');
  const description = [
    `Triwal Traviator website enquiry ${lead.reference || ''}`,
    `Destination: ${lead.destination || 'Not decided yet'}`,
    `Travel timing: ${lead.travelDate || 'Not specified'}`,
    lead.notes ? `Trip notes: ${lead.notes}` : ''
  ].filter(Boolean).join('\n').slice(0, 1900);
  return {
    ...(firstName ? { First_Name: firstName.slice(0, 40) } : {}),
    Last_Name: lastName.slice(0, 80),
    Email: String(lead.email || '').slice(0, 160),
    Company: (process.env.ZOHO_DEFAULT_COMPANY || 'Individual traveller').slice(0, 100),
    Lead_Source: 'Website',
    Description: description
  };
}

export async function upsertZohoLead(lead) {
  const token = await getAccessToken();
  const endpoint = new URL('/crm/v8/Leads/upsert', `${token.apiDomain}/`);
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Authorization': `Zoho-oauthtoken ${token.accessToken}`,
      'Content-Type': 'application/json',
      'Accept': 'application/json'
    },
    body: JSON.stringify({ data: [buildLeadRecord(lead)], duplicate_check_fields: ['Email'] }),
    signal: AbortSignal.timeout(12_000)
  });
  const payload = await response.json().catch(() => ({}));
  const record = payload.data?.[0];
  if (!response.ok || !record || String(record.status).toLowerCase() !== 'success') {
    const message = String(record?.message || payload.message || payload.code || `HTTP ${response.status}`).slice(0, 180);
    throw new Error(`Zoho lead upsert failed: ${message}`);
  }
  return {
    provider: 'zoho',
    recordId: String(record.details?.id || ''),
    action: String(record.action || 'upsert')
  };
}
