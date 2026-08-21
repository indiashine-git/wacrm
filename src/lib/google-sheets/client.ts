// ============================================================
// Google Sheets API v4 client via a service-account JWT -- no
// `googleapis` dependency, matches this codebase's existing pattern
// of raw fetch calls to third-party APIs (Meta, Razorpay). Standard,
// stable OAuth2 service-account flow (RFC 7523 JWT bearer grant),
// unchanged by Google for years.
//
// NOT verified against a real Google account -- roadmap item 10,
// parked the same way as Flutterwave/Shopify pending real
// credentials. The JWT signing + token exchange + Sheets v4 request
// shapes below are written directly from Google's documented API,
// but nothing here has actually round-tripped to Google's servers.
// The real proof is the "Test connection" button once a real service
// account exists.
// ============================================================

import { createSign } from 'node:crypto'

export interface ServiceAccountKey {
  client_email: string
  private_key: string
}

function base64url(input: Buffer | string): string {
  return Buffer.from(input)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
}

/**
 * Mint a short-lived OAuth2 access token from a service-account JSON
 * key, scoped to Sheets read/write. RS256-signs a JWT per RFC 7523,
 * exchanges it at Google's token endpoint.
 */
export async function getAccessToken(serviceAccount: ServiceAccountKey): Promise<string> {
  const now = Math.floor(Date.now() / 1000)
  const header = { alg: 'RS256', typ: 'JWT' }
  const claims = {
    iss: serviceAccount.client_email,
    scope: 'https://www.googleapis.com/auth/spreadsheets',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
  }
  const unsigned = `${base64url(JSON.stringify(header))}.${base64url(JSON.stringify(claims))}`
  const signer = createSign('RSA-SHA256')
  signer.update(unsigned)
  const signature = base64url(signer.sign(serviceAccount.private_key))
  const jwt = `${unsigned}.${signature}`

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt,
    }),
  })
  const data = await res.json()
  if (!res.ok) {
    throw new Error(data?.error_description || data?.error || 'Failed to authenticate with Google')
  }
  return data.access_token as string
}

/** GET /v4/spreadsheets/{id}/values/{range} -- all values in a sheet/tab. */
export async function readSheetRows(
  accessToken: string,
  spreadsheetId: string,
  sheetName: string,
): Promise<string[][]> {
  const range = encodeURIComponent(sheetName)
  const res = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${range}`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  )
  const data = await res.json()
  if (!res.ok) {
    throw new Error(data?.error?.message || 'Failed to read the sheet')
  }
  return (data.values as string[][] | undefined) ?? []
}

/** POST /v4/spreadsheets/{id}/values/{range}:append -- adds one row at the end. */
export async function appendSheetRow(
  accessToken: string,
  spreadsheetId: string,
  sheetName: string,
  values: (string | number)[],
): Promise<void> {
  const range = encodeURIComponent(sheetName)
  const res = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${range}:append?valueInputOption=USER_ENTERED`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ values: [values] }),
    },
  )
  if (!res.ok) {
    const data = await res.json().catch(() => ({}))
    throw new Error(data?.error?.message || 'Failed to append the row')
  }
}
