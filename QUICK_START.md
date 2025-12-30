# Quick Start Guide

## PowerShell cURL Commands

### ✅ Recommended: Use Single Quotes (curl.exe)
```powershell
curl.exe -X POST http://localhost:3000/verify -H "Content-Type: application/json" -d '{"gstin": "27ABCDE1234F1Z5"}'
```

### ✅ Best: Use Invoke-RestMethod (PowerShell Native - No Escaping Issues)
```powershell
Invoke-RestMethod -Uri "http://localhost:3000/verify" -Method Post -Body '{"gstin":"27ABCDE1234F1Z5"}' -ContentType "application/json"
```

### ✅ Alternative: Using Hashtable (Cleaner)
```powershell
$body = @{ gstin = "27ABCDE1234F1Z5" } | ConvertTo-Json
Invoke-RestMethod -Uri "http://localhost:3000/verify" -Method Post -Body $body -ContentType "application/json"
```

### ✅ Best: Use the Test Script
```powershell
.\test-service.ps1 27ABCDE1234F1Z5
```

## Why curl.exe Failed Before

PowerShell interprets double quotes and escaped quotes differently. Using single quotes for the JSON body avoids this issue.

## Data Extraction Improvements

The service now:
- Filters out menu/navigation items
- Validates extracted values
- Skips invalid short text
- Focuses on actual GST data tables
- Provides better error messages
- Always fetches fresh data (no caching)

## Testing

1. Start server: `npm start`
2. Run test: `.\test-service.ps1 27BEVPK8479R1ZX`
3. Check browser window for CAPTCHA (if needed)
4. Wait for results

## Troubleshooting

If you get wrong data:
- Clear cache: Delete `gst_cache.json`
- Check browser: Make sure page fully loaded
- Check console: Look for extraction logs
- Try again: Sometimes portal takes time to load

