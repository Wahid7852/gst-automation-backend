# GST Verification Service

A local GST verification service that uses browser automation to fetch GST details from the official GST portal. The service behaves like a REST API while using a real browser session under the hood to handle CAPTCHA and session cookies naturally.

## Features

- **REST API Interface**: Simple POST endpoint for GST verification
- **Browser Automation**: Uses Playwright with non-headless mode for real browser interaction
- **Always Fresh Data**: Every request fetches fresh data from the GST portal (no caching)
- **Resilient**: Handles page reloads, delays, and slow networks
- **Seamless CAPTCHA Handling**: Solve CAPTCHA once, session is saved and reused automatically
- **Session Persistence**: Browser cookies are saved and reused to avoid repeated CAPTCHAs

## Prerequisites

- Node.js (v14 or higher)
- npm or yarn

## Installation

1. Install dependencies:
```bash
npm install
```

2. Install Playwright browsers:
```bash
npm run install-browsers
```

## Usage

1. Start the server:
```bash
npm start
```

2. The server will start on `http://localhost:3000` (or the port specified in PORT environment variable)

3. Make a POST request to verify a GSTIN:

```bash
curl -X POST http://localhost:3000/verify \
  -H "Content-Type: application/json" \
  -d '{"gstin": "27ABCDE1234F1Z5"}'
```

Or using JavaScript:
```javascript
fetch('http://localhost:3000/verify', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    gstin: '27ABCDE1234F1Z5'
  })
})
.then(res => res.json())
.then(data => console.log(data));
```

## API Endpoints

### POST /verify

Verifies a GSTIN and returns business details.

**Request Body:**
```json
{
  "gstin": "27ABCDE1234F1Z5"
}
```

**Response:**
```json
{
  "gstin": "27ABCDE1234F1Z5",
  "legal_name": "ABC Company Private Limited",
  "trade_name": "ABC Co",
  "address": "123 Main Street, City, State, PIN",
  "status": "Active",
  "verified_at": "2024-01-15T10:30:00.000Z",
  "cached": false
}
```

### GET /health

Health check endpoint.

**Response:**
```json
{
  "status": "ok",
  "message": "GST Verification Service is running"
}
```

## How It Works

1. When a verification request is received, it opens a browser (non-headless) and navigates to the GST portal
2. The browser fills in the GSTIN and submits the form
3. After waiting for results, it extracts data from the rendered DOM
4. The extracted data is returned to the client
5. Every request fetches fresh data from the portal (no caching)

## Important Notes

- **Seamless CAPTCHA**: Solve CAPTCHA once on first use - the session is automatically saved and reused for all subsequent requests
- **Session Persistence**: Browser cookies are saved in `browser-cookies.json` and reused across requests
- **Browser Window**: The browser runs in non-headless mode and stays open between requests for seamless operation
- **No Caching**: Every request fetches fresh data directly from the GST portal for accuracy
- **Resilience**: The service includes multiple fallback strategies for finding and extracting data from the GST portal

## CAPTCHA Handling

The service now handles CAPTCHAs seamlessly:

1. **First Request**: Browser opens, you solve CAPTCHA once (if it appears)
2. **Session Saved**: After solving, cookies are automatically saved
3. **Subsequent Requests**: Browser reuses saved session - no CAPTCHA needed!
4. **Session Expiry**: If session expires (typically 30-60 minutes), solve CAPTCHA once again

See `CAPTCHA_SETUP.md` for detailed information.

## Troubleshooting

If data extraction fails:
- Check `debug-screenshot.png` to see what the browser captured
- Check `debug-page.html` to inspect the HTML structure
- The GST portal structure may have changed - you may need to update selectors in `browser-automation.js`

## License

ISC

