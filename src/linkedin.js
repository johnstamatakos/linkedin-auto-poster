const axios = require('axios');
const { getSetting, setSetting } = require('./db');

const AUTH   = 'https://www.linkedin.com/oauth/v2';
const API_V2 = 'https://api.linkedin.com/v2';

// ─── Auth URL ─────────────────────────────────────────────────────────────────

function getAuthUrl(state) {
  return `${AUTH}/authorization?` + new URLSearchParams({
    response_type: 'code',
    client_id:     process.env.LINKEDIN_CLIENT_ID,
    redirect_uri:  process.env.LINKEDIN_REDIRECT_URI,
    state,
    scope: 'openid profile w_member_social',
  });
}

// ─── Token Exchange ───────────────────────────────────────────────────────────

async function exchangeCode(code) {
  const { data } = await axios.post(
    `${AUTH}/accessToken`,
    new URLSearchParams({
      grant_type:    'authorization_code',
      code,
      client_id:     process.env.LINKEDIN_CLIENT_ID,
      client_secret: process.env.LINKEDIN_CLIENT_SECRET,
      redirect_uri:  process.env.LINKEDIN_REDIRECT_URI,
    }).toString(),
    { headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, timeout: 15000 }
  );

  setSetting('linkedin_access_token',       data.access_token);
  setSetting('linkedin_token_expires_at',   String(Date.now() + data.expires_in * 1000));
  if (data.refresh_token) {
    setSetting('linkedin_refresh_token',              data.refresh_token);
    setSetting('linkedin_refresh_token_expires_at',   String(Date.now() + (data.refresh_token_expires_in || 5184000) * 1000));
  }
  return data;
}

// ─── Token Refresh ────────────────────────────────────────────────────────────

async function refreshToken() {
  const rt = getSetting('linkedin_refresh_token');
  if (!rt) throw new Error('No refresh token. Visit /auth/linkedin to reconnect.');

  const { data } = await axios.post(
    `${AUTH}/accessToken`,
    new URLSearchParams({
      grant_type:    'refresh_token',
      refresh_token: rt,
      client_id:     process.env.LINKEDIN_CLIENT_ID,
      client_secret: process.env.LINKEDIN_CLIENT_SECRET,
    }).toString(),
    { headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, timeout: 15000 }
  );

  setSetting('linkedin_access_token',     data.access_token);
  setSetting('linkedin_token_expires_at', String(Date.now() + data.expires_in * 1000));
  console.log('[linkedin] Token refreshed');
  return data.access_token;
}

// ─── Get Valid Token ──────────────────────────────────────────────────────────

async function getToken() {
  const token     = getSetting('linkedin_access_token');
  const expiresAt = Number(getSetting('linkedin_token_expires_at', '0'));
  if (!token) throw new Error('LinkedIn not connected. Visit /auth/linkedin.');
  if (expiresAt - Date.now() < 5 * 60 * 1000) return await refreshToken();
  return token;
}

// ─── Get Person URN ───────────────────────────────────────────────────────────

async function getPersonUrn(token) {
  const cached = getSetting('linkedin_person_urn');
  if (cached) return cached;

  const { data } = await axios.get(`${API_V2}/userinfo`, {
    headers: { Authorization: `Bearer ${token}` },
    timeout: 10000,
  });
  const urn = `urn:li:person:${data.sub}`;
  setSetting('linkedin_person_urn', urn);
  return urn;
}

// ─── Post ─────────────────────────────────────────────────────────────────────

async function postToLinkedIn(text) {
  const token  = await getToken();
  const author = await getPersonUrn(token);

  const { headers } = await axios.post(
    `${API_V2}/ugcPosts`,
    {
      author,
      lifecycleState: 'PUBLISHED',
      specificContent: {
        'com.linkedin.ugc.ShareContent': {
          shareCommentary:   { text },
          shareMediaCategory: 'NONE',
        },
      },
      visibility: {
        'com.linkedin.ugc.MemberNetworkVisibility': 'PUBLIC',
      },
    },
    {
      headers: {
        Authorization:             `Bearer ${token}`,
        'Content-Type':            'application/json',
        'X-Restli-Protocol-Version': '2.0.0',
      },
      timeout: 15000,
    }
  );

  return headers['x-restli-id'] || 'unknown';
}

// ─── Status ───────────────────────────────────────────────────────────────────

function getAuthStatus() {
  const token     = getSetting('linkedin_access_token');
  const expiresAt = Number(getSetting('linkedin_token_expires_at', '0'));
  if (!token) return { connected: false, reason: 'Not authenticated' };
  if (Date.now() > expiresAt && !getSetting('linkedin_refresh_token'))
    return { connected: false, reason: 'Token expired, no refresh token. Reconnect.' };
  return {
    connected:  true,
    expiresAt:  new Date(expiresAt).toISOString(),
    expiresIn:  Math.max(0, Math.floor((expiresAt - Date.now()) / 60000)),
    personUrn:  getSetting('linkedin_person_urn'),
  };
}

module.exports = { getAuthUrl, exchangeCode, postToLinkedIn, getAuthStatus };
