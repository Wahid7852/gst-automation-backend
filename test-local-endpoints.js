const axios = require('axios');

const BASE_URL = 'http://localhost:3000';
const SAMPLE_GSTIN = '29GGGGG1314R9Z6'; // Dummy GSTIN format, might trigger invalid or captcha

async function testEndpoints() {
    try {
        // 1. Check Health
        console.log('Testing GET / ...');
        const healthRes = await axios.get(`${BASE_URL}/`);
        console.log('Health Response:', healthRes.data);

        // 2. Check Info (was /verify)
        console.log('\nTesting POST /info ...');
        try {
            const infoRes = await axios.post(`${BASE_URL}/info`, { gstin: SAMPLE_GSTIN });
            console.log('Info Response:', infoRes.data);
        } catch (err) {
            if (err.response) {
                console.log('Info Response Error (Expected if invalid GSTIN or timeout):', err.response.status, err.response.data);
            } else {
                console.error('Info Request Failed:', err.message);
            }
        }

    } catch (error) {
        console.error('Test Failed:', error.message);
    }
}

// Wait for server to start
setTimeout(testEndpoints, 3000);
