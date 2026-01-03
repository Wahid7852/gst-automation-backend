# API Documentation for Frontend Integration

This backend service uses a stateful browser session to verify GSTINs. The process is split into two steps because the GST portal requires a CAPTCHA.

---

## 1. Initiate Verification (Fetch Info)
Call this endpoint first to start the session and check if a CAPTCHA is required.

**Endpoint:** `POST /info`  
**Content-Type:** `application/json`

**Request Body:**
```json
{
  "gstin": "27BEVPK8479R1ZX"
}
```

**Response (If CAPTCHA is required - Standard Flow):**
The backend will launch a browser, enter the GSTIN, and return the CAPTCHA image as a Base64 string.
```json
{
  "status": "captcha_required",
  "message": "CAPTCHA detected. Please solve the CAPTCHA.",
  "captcha_image": "data:image/png;base64,iVBORw0KGgo...", 
  "gstin": "27BEVPK8479R1ZX"
}
```
> **Frontend Action:**  
> 1. Render the `captcha_image` string directly in an `<img>` tag: `<img src={response.captcha_image} />`.
> 2. Show an input field for the user to type the CAPTCHA code.

---

## 2. Submit CAPTCHA Solution (Verify)
Call this endpoint when the user submits the CAPTCHA code.

**Endpoint:** `POST /verify`  
**Content-Type:** `application/json`

**Request Body:**
```json
{
  "gstin": "27BEVPK8479R1ZX",
  "captcha_solution": "123456"
}
```
> **Note:** The `gstin` is required here to ensure context validation.

**Response (Success):**
```json
{
  "gstin": "27BEVPK8479R1ZX",
  "legal_name": "ABC PRIVATE LIMITED",
  "trade_name": "ABC TRADERS",
  "address": "123, EXAMPLE STREET, MUMBAI...",
  "status": "Active",
  "effective_date": "01/07/2017",
  "verified_at": "2023-12-25T10:00:00.000Z"
}
```

**Response (Error - e.g., Wrong CAPTCHA):**
```json
{
  "error": "Verification failed",
  "message": "Timeout waiting for GST details. CAPTCHA might be incorrect..."
}
```

---

## Error Handling
The API returns standard HTTP status codes:
- **200 OK**: Request successful (even if it returns a 'captcha_required' status).
- **400 Bad Request**: Missing GSTIN, invalid format, or malformed JSON.
- **500 Internal Server Error**: Browser crash or unexpected failure.
