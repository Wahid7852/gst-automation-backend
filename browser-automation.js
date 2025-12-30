const { chromium } = require('playwright');
const os = require('os');
const fs = require('fs');
const path = require('path');

class GSTBrowserAutomation {
  constructor() {
    this.browser = null;
    this.context = null;
    this.page = null;
    this.isInitialized = false;
    this.sessionPath = path.join(__dirname, 'browser-session');
    this.cookiesPath = path.join(__dirname, 'browser-cookies.json');
  }

  getPlatformUserAgent() {
    const platform = os.platform();
    if (platform === 'win32') {
      return 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
    } else if (platform === 'linux') {
      return 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
    } else if (platform === 'darwin') {
      return 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
    }
    return 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
  }

  async initialize() {
    if (this.isInitialized && this.browser) {
      return;
    }

    console.log('Launching browser (non-headless mode)...');
    
    this.browser = await chromium.launch({
      headless: false,
      slowMo: 100,
      args: [
        '--disable-blink-features=AutomationControlled',
        '--disable-dev-shm-usage'
      ]
    });

    let savedCookies = [];
    try {
      if (fs.existsSync(this.cookiesPath)) {
        const cookiesData = fs.readFileSync(this.cookiesPath, 'utf8');
        savedCookies = JSON.parse(cookiesData);
        console.log(`Loaded ${savedCookies.length} saved cookies`);
      }
    } catch (error) {
      console.log('Could not load saved cookies, starting fresh session');
    }

    this.context = await this.browser.newContext({
      viewport: { width: 1280, height: 720 },
      userAgent: this.getPlatformUserAgent(),
      storageState: savedCookies.length > 0 ? { cookies: savedCookies } : undefined
    });

    if (savedCookies.length > 0) {
      await this.context.addCookies(savedCookies);
    }

    this.page = await this.context.newPage();
    
    this.page.on('close', () => {
      console.log('Page was closed, will reinitialize on next request');
      this.isInitialized = false;
    });
    
    this.isInitialized = true;
    console.log('Browser initialized successfully');
  }

  async saveCookies() {
    try {
      const cookies = await this.context.cookies();
      fs.writeFileSync(this.cookiesPath, JSON.stringify(cookies, null, 2), 'utf8');
      console.log(`Saved ${cookies.length} cookies for future sessions`);
    } catch (error) {
      console.error('Error saving cookies:', error.message);
    }
  }

  async waitForCaptchaToBeSolved(maxWaitTime = 300000) {
    console.log('\n🔍 Checking for CAPTCHA...');
    
    const startTime = Date.now();
    const checkInterval = 2000;
    let captchaDetected = false;
    let lastStatusTime = startTime;
    
    while (Date.now() - startTime < maxWaitTime) {
      try {
        const captchaSelectors = [
          'iframe[src*="recaptcha"]',
          'iframe[src*="captcha"]',
          '.g-recaptcha',
          '#captcha',
          '[class*="captcha"]',
          '[id*="captcha"]',
          'div[data-sitekey]',
          '.recaptcha-checkbox',
          '[class*="recaptcha"]'
        ];

        let captchaFound = false;
        for (const selector of captchaSelectors) {
          try {
            const element = await this.page.$(selector);
            if (element) {
              const isVisible = await element.isVisible().catch(() => false);
              if (isVisible) {
                captchaFound = true;
                break;
              }
            }
          } catch (e) {
            continue;
          }
        }

        if (!captchaFound) {
          try {
            const pageText = await this.page.textContent('body').catch(() => '');
            if (pageText.toLowerCase().includes('captcha') || 
                pageText.toLowerCase().includes('verify you are human') ||
                pageText.toLowerCase().includes('i\'m not a robot')) {
              captchaFound = true;
            }
          } catch (e) {
          }
        }

        if (captchaFound && !captchaDetected) {
          captchaDetected = true;
          console.log('⚠️  CAPTCHA detected! Please solve it in the browser window.');
          console.log('💡 Once solved, the session will be saved for future requests.');
        }

        if (!captchaFound) {
          const inputSelectors = [
            'input[name="gstin"]',
            'input[id="gstin"]',
            '#gstin',
            'input[type="text"]'
          ];
          
          let canProceed = false;
          for (const selector of inputSelectors) {
            try {
              const input = await this.page.$(selector);
              if (input) {
                const isDisabled = await input.isDisabled().catch(() => true);
                const isVisible = await input.isVisible().catch(() => false);
                if (!isDisabled && isVisible) {
                  canProceed = true;
                  break;
                }
              }
            } catch (e) {
              continue;
            }
          }

          if (canProceed) {
            if (captchaDetected) {
              console.log('✅ CAPTCHA solved! Waiting for page to stabilize...');
              await this.page.waitForTimeout(2000);
              
              try {
                await this.page.waitForLoadState('networkidle', { timeout: 8000 });
              } catch (e) {
                console.log('Waiting for page to finish loading...');
              }
              
              await this.page.waitForTimeout(2000);
              console.log('Page stabilized. Proceeding with form fill...');
            } else {
              console.log('✅ No CAPTCHA detected. Proceeding...');
            }
            await this.saveCookies();
            return captchaDetected;
          }
        }

        if (captchaDetected && Date.now() - lastStatusTime > 10000) {
          const elapsed = Math.floor((Date.now() - startTime) / 1000);
          console.log(`⏳ Still waiting... (${elapsed}s elapsed)`);
          lastStatusTime = Date.now();
        }

        await this.page.waitForTimeout(checkInterval);
      } catch (error) {
        await this.page.waitForTimeout(checkInterval);
      }
    }

    console.log('⏱️  Timeout waiting for CAPTCHA. Proceeding anyway...');
    await this.saveCookies();
    return false;
  }

  async verifyGSTIN(gstin, retries = 3) {
    if (!this.isInitialized || !this.browser || !this.page || this.page.isClosed()) {
      console.log('Browser not initialized or closed. Reinitializing...');
      await this.initialize();
    }

    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        if (!this.page || this.page.isClosed()) {
          console.log('Page closed, reinitializing...');
          await this.initialize();
        }
        
        console.log(`Verifying GSTIN: ${gstin} (Attempt ${attempt}/${retries})`);
        
        let apiResponse = null;
        let goodsServiceResponse = null;
        let responseReceived = false;
        
        const responseHandler = async (response) => {
          const url = response.url();
          if (url.includes('/api/search/taxpayerDetails')) {
            try {
              const json = await response.json();
              apiResponse = json;
              responseReceived = true;
              console.log('✅ Intercepted taxpayerDetails API response');
            } catch (e) {
              console.log('Could not parse API response:', e.message);
            }
          } else if (url.includes('/api/search/goodservice')) {
            try {
              const json = await response.json();
              goodsServiceResponse = json;
              console.log('✅ Intercepted goodservice API response');
            } catch (e) {
              console.log('Could not parse goodservice API response:', e.message);
            }
          }
        };
        
        this.page.on('response', responseHandler);
        
        const gstSearchUrl = 'https://services.gst.gov.in/services/searchtp';
        console.log('Navigating to GST portal...');
        
        try {
          await this.page.goto(gstSearchUrl, { 
            waitUntil: 'domcontentloaded',
            timeout: 60000 
          });
        } catch (navError) {
          if (attempt < retries) {
            console.log(`Navigation failed, retrying... (${navError.message})`);
            await this.page.waitForTimeout(3000);
            continue;
          }
          throw navError;
        }

        console.log('Waiting 5 seconds for page to fully load...');
        await this.page.waitForTimeout(5000);
        
        try {
          await this.page.waitForLoadState('networkidle', { timeout: 5000 });
        } catch (e) {
          console.log('Page may still be loading, continuing...');
        }

      const inputSelectors = [
        'input[name="for_gstin"]',
        'input[id="for_gstin"]',
        '#for_gstin',
        'input[name="gstin"]',
        'input[id="gstin"]',
        'input[placeholder*="GSTIN"]',
        'input[type="text"]',
        '#gstin',
        'input.form-control',
        'input[class*="gstin"]'
      ];

      let inputFound = false;
      let inputElement = null;

      for (const selector of inputSelectors) {
        try {
          await this.page.waitForSelector(selector, { timeout: 10000, state: 'visible' });
          inputElement = await this.page.$(selector);
          if (inputElement) {
            const isVisible = await inputElement.isVisible().catch(() => false);
            const isEnabled = await inputElement.isEnabled().catch(() => false);
            if (isVisible && isEnabled) {
              inputFound = true;
              console.log(`Found input field with selector: ${selector}`);
              break;
            }
          }
        } catch (e) {
          continue;
        }
      }

      if (!inputFound) {
        if (!this.page || this.page.isClosed()) {
          console.log('Page closed during input search, reinitializing...');
          await this.initialize();
          if (attempt < retries) {
            await this.page.waitForTimeout(2000);
            continue;
          }
        }
        const path = require('path');
        const screenshotPath = path.join(__dirname, 'debug-screenshot.png');
        try {
          await this.page.screenshot({ path: screenshotPath });
        } catch (e) {
          console.log('Could not take screenshot:', e.message);
        }
        throw new Error(`Could not find GSTIN input field. Screenshot saved as ${screenshotPath}`);
      }

      console.log('Filling GSTIN field...');
      await inputElement.click();
      await this.page.waitForTimeout(300);
      await inputElement.fill('');
      await this.page.waitForTimeout(200);
      await inputElement.fill(gstin);
      await this.page.waitForTimeout(2000);
      
      console.log('Checking if CAPTCHA is loaded...');
      const captchaLabel = await this.page.$('label[for="fo-captcha"], label:has-text("Type the characters")').catch(() => null);
      const captchaInput = await this.page.$('#fo-captcha, input[name="cap"]').catch(() => null);
      const captchaImage = await this.page.$('#imgCaptcha, img.captcha').catch(() => null);
      
      if (captchaLabel || captchaInput || captchaImage) {
        console.log('⚠️  CAPTCHA detected! Please fill the CAPTCHA in the browser window.');
        console.log('💡 Waiting for you to solve the CAPTCHA...');
        await this.waitForCaptchaToBeSolved();
      } else {
        console.log('✅ No CAPTCHA detected, proceeding with search...');
      }

      const buttonSelectors = [
        'button[id="lotsearch"]',
        '#lotsearch',
        'button[type="submit"]',
        'button:has-text("Search")',
        'button:has-text("SEARCH")',
        'input[type="submit"]',
        'button.btn-primary',
        'button[class*="search"]',
        '#search',
        '.search-btn'
      ];

      let buttonFound = false;
      for (const selector of buttonSelectors) {
        try {
          const button = await this.page.$(selector);
          if (button) {
            buttonFound = true;
            console.log(`Found button with selector: ${selector}`);
            await button.click();
            break;
          }
        } catch (e) {
          continue;
        }
      }

      if (!buttonFound) {
        console.log('Button not found, trying Enter key...');
        await inputElement.press('Enter');
      }

      console.log('Search button clicked. Waiting for API responses...');
      
      await this.page.waitForTimeout(2000);
      
      console.log('Waiting for taxpayerDetails and goodservice API calls...');
      
      const maxWaitTime = 15000;
      const startTime = Date.now();
      
      while (!responseReceived && (Date.now() - startTime < maxWaitTime)) {
        if (apiResponse) {
          console.log('✅ API response received!');
          break;
        }
        await this.page.waitForTimeout(1000);
      }
      
      await this.page.waitForTimeout(2000);
      
      if (!apiResponse) {
        console.log('❌ API response not received within 15 seconds.');
        console.log('⚠️  Please refresh the page in the browser and try again.');
        this.page.off('response', responseHandler);
        if (attempt < retries) {
          await this.page.waitForTimeout(5000);
          continue;
        }
        throw new Error('Search results not found. Please refresh the page and retry the request.');
      }
      
      this.page.off('response', responseHandler);
      
      console.log('Extracting data from API response...');
      
      const extractedData = {
        legal_name: apiResponse.lgnm || null,
        trade_name: apiResponse.tradeNam || null,
        address: apiResponse.pradr?.adr || null,
        status: apiResponse.sts || null,
        effective_date: apiResponse.rgdt || null,
        gstin: apiResponse.gstin || gstin,
        constitution: apiResponse.ctb || null,
        taxpayer_type: apiResponse.dty || null,
        jurisdiction: apiResponse.stj || null,
        center_jurisdiction: apiResponse.ctj || null,
        registration_date: apiResponse.rgdt || null,
        cancellation_date: apiResponse.cxdt || null,
        nature_of_business: apiResponse.nba || null,
        composition_rate: apiResponse.cmpRt || null,
        aadhaar_verified: apiResponse.adhrVFlag || null,
        aadhaar_verification_date: apiResponse.adhrVdt || null,
        ekyc_verified: apiResponse.ekycVFlag || null,
        e_invoice_status: apiResponse.einvoiceStatus || null,
        field_visit_conducted: apiResponse.isFieldVisitConducted || null,
        nature_of_contact: apiResponse.ntcrbs || null,
        goods_services: goodsServiceResponse?.bzgddtls || null
      };
      
      console.log('Extracted data:', JSON.stringify(extractedData, null, 2));

      if (!extractedData.legal_name && !extractedData.trade_name && !extractedData.address) {
        if (attempt < retries) {
          console.log('No data in API response, retrying...');
          await this.page.waitForTimeout(5000);
          continue;
        }
        throw new Error('Could not extract GST data from API. Please refresh the page in the browser and retry the request.');
      }

        await this.saveCookies();

        return extractedData;

      } catch (error) {
        console.error(`Error during GST verification (Attempt ${attempt}/${retries}):`, error.message);
        
        if (attempt === retries) {
          try {
            const path = require('path');
            const fs = require('fs');
            const timestamp = Date.now();
            const screenshotPath = path.join(__dirname, `error-screenshot-${timestamp}.png`);
            const htmlPath = path.join(__dirname, `error-page-${timestamp}.html`);
            await this.page.screenshot({ path: screenshotPath, fullPage: true });
            const html = await this.page.content();
            fs.writeFileSync(htmlPath, html);
            console.log(`Debug files saved for inspection: ${screenshotPath}, ${htmlPath}`);
          } catch (debugError) {
            console.error('Could not save debug files:', debugError.message);
          }
          throw error;
        }
        
        await this.page.waitForTimeout(5000);
      }
    }
    
    throw new Error('All retry attempts failed');
  }

  async extractGSTData() {
    const html = await this.page.content();
    
    const data = {
      legal_name: null,
      trade_name: null,
      address: null,
      status: null,
      effective_date: null
    };

    try {
      const extracted = await this.page.evaluate(() => {
        const result = {};
        
        const skipTexts = ['menu', 'navigation', 'header', 'footer', 'sidebar', 'nav', 'button', 'link', 'click', 'ok', 'cancel', 'submit', 'search', 'gst law', 'amendment'];
        
        const isInvalidValue = (text) => {
          if (!text || text.length < 3) return true;
          const lower = text.toLowerCase();
          return skipTexts.some(skip => lower.includes(skip)) || 
                 lower.length < 5 || 
                 lower === 'n/a' || 
                 lower === 'na' ||
                 lower.match(/^[^a-z]*$/);
        };

        const contentPane = document.querySelector('.content-pane, .mypage, .tabpane') || document.body;
        const tables = contentPane.querySelectorAll('table');
        
        tables.forEach(table => {
          const tableText = table.textContent.toLowerCase();
          const tableParent = table.closest('div');
          const parentText = tableParent ? tableParent.textContent.toLowerCase() : '';
          
          if ((tableText.includes('legal') || tableText.includes('trade') || tableText.includes('address') || tableText.includes('status') || tableText.includes('effective date')) &&
              !tableText.includes('menu') && !tableText.includes('navigation') && !tableText.includes('header') &&
              !parentText.includes('menu') && !parentText.includes('navigation')) {
            
            const rows = table.querySelectorAll('tr');
            let foundRows = 0;
            
            rows.forEach(row => {
              const cells = row.querySelectorAll('td, th');
              if (cells.length >= 2) {
                const label = cells[0].textContent.trim().toLowerCase();
                const value = cells[1] ? cells[1].textContent.trim() : '';
                
                if (value && !isInvalidValue(value) && value.length > 1) {
                  if ((label.includes('legal name of business') || (label.includes('legal') && label.includes('name') && label.includes('business'))) &&
                      !result.legal_name && value.length > 3) {
                    result.legal_name = value;
                    foundRows++;
                  }
                  if ((label.includes('trade name') || (label.includes('trade') && label.includes('name'))) && 
                      !result.trade_name && value.length > 0) {
                    result.trade_name = value;
                    foundRows++;
                  }
                  if ((label.includes('address') || label.includes('principal place') || label.includes('place of business')) && 
                      !result.address && value.length > 10) {
                    result.address = value;
                    foundRows++;
                  }
                  if ((label.includes('status') || label.includes('registration status') || label.includes('gst status') || label.includes('constitution')) && 
                      !result.status && !isInvalidValue(value) && value.length > 2) {
                    result.status = value;
                    foundRows++;
                  }
                  if ((label.includes('effective date of registration') || label.includes('effective date') || label.includes('date of registration')) && 
                      !result.effective_date && value.length > 5) {
                    result.effective_date = value;
                    foundRows++;
                  }
                }
              }
            });
            
            if (foundRows > 0) {
              console.log(`Found ${foundRows} data fields in table`);
            }
          }
        });
        
        return result;
      });

      if (extracted.legal_name) data.legal_name = extracted.legal_name;
      if (extracted.trade_name) data.trade_name = extracted.trade_name;
      if (extracted.address) data.address = extracted.address;
      if (extracted.status) data.status = extracted.status;
      if (extracted.effective_date) data.effective_date = extracted.effective_date;
    } catch (e) {
      console.log('Table extraction failed, trying alternative methods...');
    }

    if (!data.legal_name || !data.trade_name || !data.address) {
      try {
        const divData = await this.page.evaluate(() => {
          const result = {};
          const skipTexts = ['menu', 'navigation', 'header', 'footer', 'sidebar', 'nav', 'button', 'link'];
          
          const isInvalidValue = (text) => {
            if (!text || text.length < 3) return true;
            const lower = text.toLowerCase();
            return skipTexts.some(skip => lower.includes(skip)) || lower.length < 5;
          };

          const mainContent = document.querySelector('main, .content, .main-content, #content, .result, .search-result') || document.body;
          const allElements = mainContent.querySelectorAll('div, span, p, td, label, strong, li');
          
          allElements.forEach(el => {
            const text = el.textContent.trim().toLowerCase();
            
            if (text.includes('legal') && text.includes('name') && !result.legal_name) {
              const nextSibling = el.nextElementSibling;
              const parent = el.parentElement;
              let value = '';
              
              if (nextSibling) {
                value = nextSibling.textContent.trim();
              } else if (parent) {
                value = parent.textContent.replace(el.textContent, '').trim();
              }
              
              if (value && !isInvalidValue(value) && value.length > 3) {
                result.legal_name = value;
              }
            }
            
            if (text.includes('trade') && text.includes('name') && !result.trade_name) {
              const nextSibling = el.nextElementSibling;
              const parent = el.parentElement;
              let value = '';
              
              if (nextSibling) {
                value = nextSibling.textContent.trim();
              } else if (parent) {
                value = parent.textContent.replace(el.textContent, '').trim();
              }
              
              if (value && !isInvalidValue(value) && value.length > 1) {
                result.trade_name = value;
              }
            }
            
            if ((text.includes('address') || text.includes('principal place')) && !result.address) {
              const nextSibling = el.nextElementSibling;
              const parent = el.parentElement;
              let value = '';
              
              if (nextSibling) {
                value = nextSibling.textContent.trim();
              } else if (parent) {
                value = parent.textContent.replace(el.textContent, '').trim();
              }
              
              if (value && !isInvalidValue(value) && value.length > 10) {
                result.address = value;
              }
            }
            
            if ((text.includes('status') || text.includes('registration status')) && !result.status) {
              const nextSibling = el.nextElementSibling;
              const parent = el.parentElement;
              let value = '';
              
              if (nextSibling) {
                value = nextSibling.textContent.trim();
              } else if (parent) {
                value = parent.textContent.replace(el.textContent, '').trim();
              }
              
              if (value && !isInvalidValue(value) && value.length > 2) {
                result.status = value;
              }
            }
          });
          
          return result;
        });

        if (!data.legal_name && divData.legal_name) data.legal_name = divData.legal_name;
        if (!data.trade_name && divData.trade_name) data.trade_name = divData.trade_name;
        if (!data.address && divData.address) data.address = divData.address;
        if (!data.status && divData.status) data.status = divData.status;
      } catch (e) {
        console.log('Div extraction failed...');
      }
    }

    if (!data.legal_name || !data.trade_name || !data.address) {
      try {
        const pageText = await this.page.textContent('body');
        const lines = pageText.split('\n').map(l => l.trim()).filter(l => l.length > 0);
        
        for (let i = 0; i < lines.length; i++) {
          const line = lines[i].toLowerCase();
          if (line.includes('legal name') && i + 1 < lines.length) {
            data.legal_name = lines[i + 1];
          }
          if (line.includes('trade name') && i + 1 < lines.length) {
            data.trade_name = lines[i + 1];
          }
          if (line.includes('address') && i + 1 < lines.length) {
            data.address = lines[i + 1];
          }
          if (line.includes('status') && i + 1 < lines.length) {
            data.status = lines[i + 1];
          }
        }
      } catch (e) {
        console.log('Text extraction failed...');
      }
    }

    if (!data.legal_name && !data.trade_name && !data.address) {
      const fs = require('fs');
      const path = require('path');
      const debugPath = path.join(__dirname, 'debug-page.html');
      fs.writeFileSync(debugPath, html);
      console.log(`Could not extract data. HTML saved to ${debugPath} for inspection.`);
    }

    return data;
  }

  async close() {
    if (this.browser) {
      await this.saveCookies();
      await this.browser.close();
      this.browser = null;
      this.context = null;
      this.page = null;
      this.isInitialized = false;
    }
  }

  async keepAlive() {
    if (this.browser && this.isInitialized) {
      try {
        const pages = this.context.pages();
        if (pages.length === 0) {
          this.page = await this.context.newPage();
        } else {
          this.page = pages[0];
        }
      } catch (error) {
        console.log('Reinitializing browser context...');
        this.isInitialized = false;
        await this.initialize();
      }
    }
  }
}

module.exports = GSTBrowserAutomation;

