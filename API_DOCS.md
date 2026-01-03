# API Documentation for Frontend Integration
This backend service uses a stateful browser session to verify GSTINs. The process is split into two steps because the GST portal requires a CAPTCHA.

---
## 1. Initiate Verification
**Endpoint:** `POST /verify`  
**Content-Type:** `application/json`

**Request Body:**
```json
{
  "gstin": "27BEVPK8479R1ZX"
}
```

**Response (If CAPTCHA is required - Standard Flow):**
The backend will launch a browser, enter the GSTIN, and return the CAPTCHA image.
```json
{
  "status": "captcha_required",
  "message": "CAPTCHA detected. Please solve the CAPTCHA.",
  "captcha_image": "data:image/png;base64,iVBORw0KGgo...", 
  "gstin": "27BEVPK8479R1ZX"
}
```
> **Frontend Action:** Display the `captcha_image` (Base64) to the user and ask them to type the text.

---

## 2. Submit CAPTCHA Solution
**Endpoint:** `POST /submit-captcha`  
**Content-Type:** `application/json`

**Request Body:**
```json
{
  "gstin": "27BEVPK8479R1ZX",
  "captcha_solution": "123456"
}
```
> **Note:** The `gstin` is required here to ensure we are continuing the correct session context (though the session is primarily maintained by the server).

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
- **200 OK**: Request successful.
- **400 Bad Request**: Missing GSTIN, invalid format, or malformed JSON.
- **500 Internal Server Error**: Browser crash or unexpected failure.
