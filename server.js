const express = require('express');
const cors = require('cors');
const GSTBrowserAutomation = require('./browser-automation');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

const browserAutomation = new GSTBrowserAutomation();

setInterval(async () => {
  try {
    await browserAutomation.keepAlive();
  } catch (error) {
    console.error('Error keeping browser alive:', error.message);
  }
}, 60000);

process.on('SIGINT', async () => {
  console.log('\nShutting down gracefully...');
  await browserAutomation.close();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('\nShutting down gracefully...');
  await browserAutomation.close();
  process.exit(0);
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok', message: 'GST Verification Service is running' });
});

app.post('/verify', async (req, res) => {
  const { gstin } = req.body;

  if (!gstin) {
    return res.status(400).json({
      error: 'GSTIN is required',
      message: 'Please provide a GSTIN in the request body'
    });
  }

  const gstinRegex = /^[0-9A-Z]{15}$/;
  if (!gstinRegex.test(gstin.toUpperCase())) {
    return res.status(400).json({
      error: 'Invalid GSTIN format',
      message: 'GSTIN must be 15 alphanumeric characters'
    });
  }

  const normalizedGSTIN = gstin.toUpperCase();

  try {
    console.log(`Fetching GSTIN from portal: ${normalizedGSTIN}`);
    const extractedData = await browserAutomation.verifyGSTIN(normalizedGSTIN);

    const responseData = {
      gstin: extractedData.gstin || normalizedGSTIN,
      legal_name: extractedData.legal_name || 'N/A',
      trade_name: extractedData.trade_name || 'N/A',
      address: extractedData.address || 'N/A',
      status: extractedData.status || 'N/A',
      effective_date: extractedData.effective_date || extractedData.registration_date || 'N/A',
      constitution: extractedData.constitution || 'N/A',
      taxpayer_type: extractedData.taxpayer_type || 'N/A',
      jurisdiction: extractedData.jurisdiction || 'N/A',
      center_jurisdiction: extractedData.center_jurisdiction || 'N/A',
      cancellation_date: extractedData.cancellation_date || 'N/A',
      nature_of_business: extractedData.nature_of_business || 'N/A',
      composition_rate: extractedData.composition_rate || 'N/A',
      aadhaar_verified: extractedData.aadhaar_verified || 'N/A',
      aadhaar_verification_date: extractedData.aadhaar_verification_date || 'N/A',
      ekyc_verified: extractedData.ekyc_verified || 'N/A',
      e_invoice_status: extractedData.e_invoice_status || 'N/A',
      field_visit_conducted: extractedData.field_visit_conducted || 'N/A',
      nature_of_contact: extractedData.nature_of_contact || 'N/A',
      goods_services: extractedData.goods_services || 'N/A',
      verified_at: new Date().toISOString()
    };

    res.json(responseData);

  } catch (error) {
    console.error('Error verifying GSTIN:', error);
    
    let statusCode = 500;
    if (error.message && error.message.includes('timeout')) {
      statusCode = 504;
    } else if (error.message && error.message.includes('Invalid')) {
      statusCode = 400;
    }
    
    res.status(statusCode).json({
      error: 'Verification failed',
      message: error.message || 'An error occurred while verifying the GSTIN',
      gstin: normalizedGSTIN,
      suggestion: 'Please check if the GSTIN is correct and try again. If the issue persists, the GST portal structure may have changed.'
    });
  }
});

app.listen(PORT, () => {
  console.log(`GST Verification Service running on http://localhost:${PORT}`);
  console.log(`Health check: http://localhost:${PORT}/health`);
  console.log(`Verify endpoint: POST http://localhost:${PORT}/verify`);
});

