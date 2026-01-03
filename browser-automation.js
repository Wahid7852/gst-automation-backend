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
    this.apiResponse = null;
    this.goodsServiceResponse = null;
    this.responseHandler = null;
    this.quiet = process.env.QUIET === '1' || process.env.LOG_LEVEL === 'silent';
  }
  
  log(...args) { if (!this.quiet) console.log(...args); }

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

    this.log('Launching browser (headless mode)...');
    
    this.browser = await chromium.launch({
      headless: true,
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
        this.log(`Loaded ${savedCookies.length} saved cookies`);
      }
    } catch (error) {
      this.log('Could not load saved cookies, starting fresh session');
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
      this.log('Page was closed, will reinitialize on next request');
      this.isInitialized = false;
    });
    
    this.isInitialized = true;
    this.log('Browser initialized successfully');
  }

  async saveCookies() {
    try {
      const cookies = await this.context.cookies();
      fs.writeFileSync(this.cookiesPath, JSON.stringify(cookies, null, 2), 'utf8');
      this.log(`Saved ${cookies.length} cookies for future sessions`);
    } catch (error) {
      console.error('Error saving cookies:', error.message);
    }
  }

  setupResponseListener() {
    this.apiResponse = null;
    this.goodsServiceResponse = null;

    if (this.responseHandler) {
      this.page.off('response', this.responseHandler);
    }

    this.responseHandler = async (response) => {
      const url = response.url();
      if (url.includes('/api/search/taxpayerDetails')) {
        try {
          const json = await response.json();
          this.apiResponse = json;
          this.log('Intercepted taxpayerDetails API response');
        } catch (e) {
          this.log('Could not parse API response:', e.message);
        }
      } else if (url.includes('/api/search/goodservice')) {
        try {
          const json = await response.json();
          this.goodsServiceResponse = json;
          this.log('Intercepted goodservice API response');
        } catch (e) {
          this.log('Could not parse goodservice API response:', e.message);
        }
      }
    };

    this.page.on('response', this.responseHandler);
  }

  cleanupResponseListener() {
    if (this.responseHandler) {
      this.page.off('response', this.responseHandler);
      this.responseHandler = null;
    }
  }

  async getCaptchaImage() {
    try {
      const selectors = ['#imgCaptcha', 'img.captcha', 'img[src*="captcha"]'];
      let captchaElement = null;
      
      for (const selector of selectors) {
        captchaElement = await this.page.$(selector);
        if (captchaElement && await captchaElement.isVisible()) {
          break;
        }
      }

      if (captchaElement) {
        // Scroll into view
        await captchaElement.scrollIntoViewIfNeeded();
        const buffer = await captchaElement.screenshot({ type: 'png' });
        return `data:image/png;base64,${buffer.toString('base64')}`;
      }
      return null;
    } catch (e) {
      console.error('Error capturing CAPTCHA:', e.message);
      return null;
    }
  }

  async initiateSearch(gstin) {
    if (!this.isInitialized || !this.browser || !this.page || this.page.isClosed()) {
      this.log('Browser not initialized or closed. Reinitializing...');
      await this.initialize();
    }
    
    if (this.page.isClosed()) {
        await this.initialize();
    }

    this.setupResponseListener();
    const gstSearchUrl = 'https://services.gst.gov.in/services/searchtp';
    
    try {
        this.log('Navigating to GST portal...');
        await this.page.goto(gstSearchUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
        
        // User requested wait for page setup
        this.log('Waiting 5 seconds for page initialization...');
        await this.page.waitForTimeout(5000);
        
        const inputSelector = '#for_gstin, input[name="for_gstin"], #gstin';
        await this.page.waitForSelector(inputSelector, { state: 'visible', timeout: 10000 });
        
        const input = await this.page.$(inputSelector);
        if (!input) throw new Error('GSTIN input field not found');
        
        // Enter GSTIN and trigger events
        this.log('Entering GSTIN...');
        await input.fill(gstin);
        await this.page.waitForTimeout(500);
        await input.click(); 
        await input.press('End');
        await this.page.keyboard.press('Space');
        await this.page.keyboard.press('Escape');
        
        this.log('Checking for CAPTCHA...');
        await this.page.waitForTimeout(2000); 
        
        const captchaImage = await this.getCaptchaImage();
        
        if (captchaImage) {
            this.log('CAPTCHA detected, returning image to client');
            return { status: 'captcha_required', captcha_image: captchaImage };
        }
        
        this.log('No CAPTCHA detected, attempting to search directly...');
        return await this.performSearch(gstin);

    } catch (error) {
        console.error('Error in initiateSearch:', error);
        throw error;
    }
  }

  async submitCaptcha(solution) {
      if (!this.page || this.page.isClosed()) {
          throw new Error('Browser session expired or closed. Please start over.');
      }
      
      try {
          this.log(`Submitting CAPTCHA solution`);
          const captchaInput = await this.page.$('#fo-captcha, input[name="cap"], #captcha');
          if (captchaInput) {
              await captchaInput.fill(solution);
          } else {
              this.log('CAPTCHA input not found, might have disappeared or not needed.');
          }
          
          return await this.performSearch();
      } catch (error) {
          console.error('Error in submitCaptcha:', error);
          throw error;
      }
  }

  async performSearch(gstin = null) {
      const buttonSelectors = ['#lotsearch', 'button[type="submit"]', 'button:has-text("Search")'];
      let button = null;
      
      for (const selector of buttonSelectors) {
          button = await this.page.$(selector);
          if (button) break;
      }
      
      if (button) {
          await button.click();
      } else {
          await this.page.keyboard.press('Enter');
      }
      
      return await this.waitForResults(gstin);
  }

  async waitForResults(gstin) {
      this.log('Waiting for API responses...');
      const maxWaitTime = 20000; // Increased to 20 seconds
      const startTime = Date.now();
      
      while (!this.apiResponse && (Date.now() - startTime < maxWaitTime)) {
          await this.page.waitForTimeout(500);
          
          const errorMsg = await this.page.$eval('.error-msg, .alert-danger', el => el.textContent).catch(() => null);
          if (errorMsg) {
              throw new Error(`GST Portal Error: ${errorMsg.trim()}`);
          }
      }
      
      if (!this.apiResponse) {
          // If API response wasn't intercepted, try scraping as fallback
          this.log('API response not intercepted, attempting to scrape data directly...');
          const scrapedData = await this.extractGSTData();
          if (scrapedData.legal_name || scrapedData.trade_name) {
             scrapedData.gstin = gstin;
             return scrapedData;
          }

          throw new Error('Timeout waiting for GST details. CAPTCHA might be incorrect or service unavailable.');
      }
      
      return this.extractDataFromResponse(this.apiResponse, this.goodsServiceResponse, gstin);
  }

  extractDataFromResponse(apiResponse, goodsServiceResponse, gstin) {
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
      
      this.cleanupResponseListener();
      return extractedData;
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
              result.__found = foundRows;
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
