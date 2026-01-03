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

**Response**
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

## 2. Submit CAPTCHA Solution (Verify)

**Endpoint:** `POST /verify`  
**Content-Type:** `application/json`

**Request Body:**
```json
{
  "gstin": "27BEVPK8479R1ZX",
  "captcha_solution": "123456"
}
```
