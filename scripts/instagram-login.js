#!/usr/bin/env node
/**
 * Instagram Login and Screenshot Automation
 * 
 * Usage:
 *   node instagram-login.js <username> <password> [output_path]
 *   node instagram-login.js --save <username> <password>
 *   node instagram-login.js --use-saved [output_path]
 * 
 * Examples:
 *   node instagram-login.js myusername mypassword ./feed.png
 *   node instagram-login.js --use-saved ./my_feed.png
 */

const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
const os = require('os');

// Path to store credentials and cookies (in skill directory for portability)
const SKILL_DIR = path.dirname(__dirname);
const CREDENTIALS_FILE = path.join(SKILL_DIR, '.credentials.json');
const COOKIES_FILE = path.join(SKILL_DIR, '.cookies.json');

// Default screenshot directory (workspace instagram_screenshot folder)
const DEFAULT_SCREENSHOT_DIR = '/home/picoclaw/.picoclaw/workspace/instagram_screenshot';
const DEFAULT_SCREENSHOT_PATH = path.join(DEFAULT_SCREENSHOT_DIR, 'instagram_feed.png');

// Ensure screenshot directory exists
if (!fs.existsSync(DEFAULT_SCREENSHOT_DIR)) {
  fs.mkdirSync(DEFAULT_SCREENSHOT_DIR, { recursive: true });
}



/**
 * Save credentials to file
 * @param {string} username - Instagram username
 * @param {string} password - Instagram password
 */
function saveCredentials(username, password) {
  const data = {
    username,
    password,
    savedAt: new Date().toISOString()
  };
  fs.writeFileSync(CREDENTIALS_FILE, JSON.stringify(data, null, 2), { mode: 0o600 }); // Restricted permissions
  console.log(`✅ Credentials saved for user: ${username}`);
  console.log(`📁 Stored at: ${CREDENTIALS_FILE}`);
}

/**
 * Load credentials from file
 * @returns {object|null} Credentials object or null if not found
 */
function loadCredentials() {
  if (!fs.existsSync(CREDENTIALS_FILE)) {
    return null;
  }
  try {
    const data = fs.readFileSync(CREDENTIALS_FILE, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    console.error('❌ Error loading credentials:', error.message);
    return null;
  }
}

/**
 * Check if credentials exist
 * @returns {boolean}
 */
function hasCredentials() {
  return fs.existsSync(CREDENTIALS_FILE);
}

/**
 * Delete saved credentials
 */
function deleteCredentials() {
  if (fs.existsSync(CREDENTIALS_FILE)) {
    fs.unlinkSync(CREDENTIALS_FILE);
    console.log('🗑️  Credentials deleted');
  } else {
    console.log('ℹ️  No credentials to delete');
  }
  // Also clear cookies when clearing credentials
  if (fs.existsSync(COOKIES_FILE)) {
    fs.unlinkSync(COOKIES_FILE);
    console.log('🗑️  Session cookies deleted');
  }
}

/**
 * Save cookies to file for session persistence
 * @param {object} context - Playwright browser context
 */
async function saveCookies(context) {
  try {
    const cookies = await context.cookies();
    const data = {
      cookies,
      savedAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString() // 30 days
    };
    fs.writeFileSync(COOKIES_FILE, JSON.stringify(data, null, 2), { mode: 0o600 });
    console.log('💾 Session cookies saved for future use');
  } catch (error) {
    console.error('⚠️  Could not save cookies:', error.message);
  }
}

/**
 * Load cookies from file
 * @returns {object|null} Cookies data or null if not found/expired
 */
function loadCookies() {
  if (!fs.existsSync(COOKIES_FILE)) {
    return null;
  }
  try {
    const data = JSON.parse(fs.readFileSync(COOKIES_FILE, 'utf8'));
    // Check if cookies have expired
    if (data.expiresAt && new Date(data.expiresAt) < new Date()) {
      console.log('⏰ Saved session has expired, will need to login again');
      fs.unlinkSync(COOKIES_FILE);
      return null;
    }
    return data;
  } catch (error) {
    console.error('⚠️  Error loading cookies:', error.message);
    return null;
  }
}

/**
 * Check if valid session cookies exist
 * @returns {boolean}
 */
function hasValidSession() {
  return loadCookies() !== null;
}

function findSystemChromiumExecutable() {
  const fromEnv = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || process.env.CHROMIUM_PATH;
  if (fromEnv && fs.existsSync(fromEnv)) {
    return fromEnv;
  }
  const candidates = [
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    '/usr/lib/chromium/chrome', // Alpine apk: chromium
    '/usr/lib/chromium/chromium',
    '/usr/bin/google-chrome-stable',
    '/usr/bin/google-chrome',
  ];
  for (const p of candidates) {
    try {
      if (fs.existsSync(p)) {
        return p;
      }
    } catch {
      // ignore
    }
  }
  return null;
}

/**
 * Perform Instagram login and capture screenshot
 * Uses saved cookies if available for session persistence
 */
async function loginToInstagram({ username, password, screenshotPath = DEFAULT_SCREENSHOT_PATH, forceLogin = false }) {
  console.log('🚀 Starting Instagram automation...');
  
  // Check for existing valid session
  const savedCookies = !forceLogin ? loadCookies() : null;
  if (savedCookies) {
    console.log('✅ Found saved session, restoring...');
  }

  // Stealth browser arguments to avoid detection
  const dockerArgs = [
    '--no-sandbox',
    '--disable-setuid-sandbox',
    '--disable-dev-shm-usage',
    '--disable-accelerated-2d-canvas',
    '--no-first-run',
    '--no-zygote',
    '--disable-gpu',
    '--disable-blink-features=AutomationControlled',
    '--disable-features=IsolateOrigins,site-per-process',
    '--disable-web-security',
    '--disable-features=BlockInsecurePrivateNetworkRequests',
    '--disable-features=InterestFeedContentSuggestions',
    '--disable-features=MediaRouter',
    '--disable-features=OptimizationHints',
    '--disable-features=PasswordManagerOnboarding',
    '--disable-features=PrivacySandboxSettings4',
    '--disable-features=ReadLater',
    '--disable-features=SidePanel',
    '--disable-features=TabHoverCards',
    '--disable-features=TranslateUI',
    '--disable-features=WebUIDarkMode',
    '--disable-features=ClearDataOnExit',
    '--disable-background-networking',
    '--disable-background-timer-throttling',
    '--disable-backgrounding-occluded-windows',
    '--disable-breakpad',
    '--disable-client-side-phishing-detection',
    '--disable-component-extensions-with-background-pages',
    '--disable-default-apps',
    '--disable-extensions',
    '--disable-hang-monitor',
    '--disable-ipc-flooding-protection',
    '--disable-popup-blocking',
    '--disable-prompt-on-repost',
    '--disable-renderer-backgrounding',
    '--force-color-profile=srgb',
    '--metrics-recording-only',
    '--mute-audio',
    '--password-store=basic',
    '--use-mock-keychain',
    '--enable-automation=false',
    '--window-size=1920,1080'
  ];
  
  let browser;
  const sysExe = findSystemChromiumExecutable();
  
  // Check if we're running under Xvfb (virtual display)
  const useXvfb = process.env.DISPLAY && process.env.DISPLAY.startsWith(':');
  const headlessMode = useXvfb ? false : true;
  
  if (useXvfb) {
    console.log(`🖥️  Using Xvfb virtual display: ${process.env.DISPLAY}`);
    console.log('🎭 Running in headed mode to avoid detection');
  }

  if (sysExe) {
    try {
      console.log(`🔥 Using system Chromium: ${sysExe}`);
      browser = await chromium.launch({
        headless: headlessMode,
        executablePath: sysExe,
        args: dockerArgs,
      });
      console.log('✅ System Chromium launched successfully');
    } catch (systemError) {
      console.log('⚠️  System Chromium failed, trying Playwright-managed browser...');
      console.warn(systemError.message);
    }
  } else {
    console.log('ℹ️  No system Chromium in common paths; using Playwright-managed browser.');
  }

  if (!browser) {
    try {
      // Try using chromium-headless-shell channel
      browser = await chromium.launch({
        headless: headlessMode,
        args: dockerArgs,
        channel: 'chromium-headless-shell',
      });
      console.log('✅ Playwright Chromium (headless-shell) launched successfully');
    } catch (headlessError) {
      console.log('⚠️  chromium-headless-shell failed, trying default chromium...');
      try {
        browser = await chromium.launch({
          headless: headlessMode,
          args: dockerArgs,
        });
        console.log('✅ Playwright Chromium launched successfully');
      } catch (bundledError) {
        console.error('❌ Browser launch failed:', bundledError.message);
        console.error(
          'Run as the SAME user as this node process (often root for exec), from workspace:',
        );
        console.error('  cd /home/picoclaw/.picoclaw/workspace && npx playwright install chromium');
        console.error('Or: cd /home/picoclaw/.picoclaw/workspace && npx playwright install');
        throw new Error('No browser available');
      }
    }
  }
  
  const contextOptions = {
    viewport: { width: 1920, height: 1080 },
    userAgent: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.0.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    locale: 'en-US',
    timezoneId: 'America/New_York',
    permissions: ['notifications'],
    bypassCSP: true
  };
  
  const context = await browser.newContext(contextOptions);
  
  // Restore saved cookies if available
  if (savedCookies && savedCookies.cookies) {
    try {
      await context.addCookies(savedCookies.cookies);
      console.log('🍪 Session cookies restored');
    } catch (e) {
      console.log('⚠️  Could not restore cookies, will login fresh');
    }
  }
  
  // Add stealth scripts to remove automation detection
  await context.addInitScript(() => {
    // Remove webdriver property
    Object.defineProperty(navigator, 'webdriver', {
      get: () => undefined
    });
    
    // Mock plugins
    Object.defineProperty(navigator, 'plugins', {
      get: () => [
        { name: 'Chrome PDF Plugin', filename: 'internal-pdf-viewer' },
        { name: 'Native Client', filename: 'native-client' }
      ]
    });
    
    // Mock languages
    Object.defineProperty(navigator, 'languages', {
      get: () => ['en-US', 'en']
    });
    
    // Remove Playwright-specific attributes
    delete navigator.__proto__.webdriver;
  });
  
  const page = await context.newPage();

  try {
    // If we have saved cookies, try to go directly to feed
    if (savedCookies) {
      console.log('📱 Navigating to Instagram with saved session...');
      await page.goto('https://www.instagram.com/', { waitUntil: 'networkidle' });
      
      // Check if we're already logged in (look for feed or profile elements)
      await page.waitForTimeout(2000);
      const isLoggedIn = await page.$('main[role="main"]') || await page.$('a[href*="/direct/inbox/"]');
      
      if (isLoggedIn) {
        console.log('✅ Successfully restored session! Already logged in.');
        
        // Wait for feed to load
        await page.waitForTimeout(2000);
        
        // Take screenshot of feed
        const absolutePath = path.resolve(screenshotPath);
        await page.screenshot({ path: absolutePath, fullPage: false });
        console.log(`✅ Screenshot saved: ${absolutePath}`);
        
        // Refresh cookies to extend session
        await saveCookies(context);
        
        await browser.close();
        console.log('🔚 Browser closed');
        return { success: true, screenshotPath: absolutePath, restoredSession: true };
      } else {
        console.log('⚠️  Saved session expired or invalid, need to login again');
      }
    }
    
    // Navigate to Instagram login page with more realistic timing
    console.log('📱 Navigating to Instagram login page...');
    
    // Add random delay before navigation (human-like)
    await page.waitForTimeout(500 + Math.random() * 500);
    
    await page.goto('https://www.instagram.com/', { waitUntil: 'networkidle' });
    
    // Random delay after page load
    await page.waitForTimeout(800 + Math.random() * 700);
    
    // Handle cookie consent dialog if present
    try {
      const cookieButton = page.getByRole('button', { name: /allow all cookies|accept all/i });
      if (await cookieButton.isVisible({ timeout: 3000 })) {
        await cookieButton.click();
        console.log('🍪 Accepted cookies');
      }
    } catch (e) {
      // Cookie dialog might not appear
    }

    // Wait for the login form to be ready
    console.log('⏳ Waiting for login form...');
    await page.waitForTimeout(2000);
    
    // Fill in username and password using multiple selector strategies
    console.log(`🔐 Logging in as: ${username}`);
    
    // Try different selectors for username field
    const usernameSelectors = [
      'input[name="username"]',
      'input[autocomplete="username"]',
      'input[type="text"]',
      'input:not([type])',
      'input[aria-label*="username" i]',
      'input[aria-label*="phone" i]'
    ];
    
    let usernameField = null;
    for (const selector of usernameSelectors) {
      usernameField = await page.$(selector);
      if (usernameField) break;
    }
    
    if (!usernameField) {
      throw new Error('Could not find username input field');
    }
    
    // Type username with human-like delays
    await usernameField.type(username, { delay: 50 + Math.random() * 100 });
    
    // Random pause between fields
    await page.waitForTimeout(200 + Math.random() * 300);
    
    // Find password field (usually next to username or with name="password")
    const passwordSelectors = [
      'input[name="password"]',
      'input[type="password"]',
      'input[autocomplete="current-password"]'
    ];
    
    let passwordField = null;
    for (const selector of passwordSelectors) {
      passwordField = await page.$(selector);
      if (passwordField) break;
    }
    
    if (!passwordField) {
      throw new Error('Could not find password input field');
    }
    
    // Type password with human-like delays
    await passwordField.type(password, { delay: 50 + Math.random() * 100 });

    // Click login button
    console.log('⏳ Clicking login button...');
    
    // Random pause before clicking login (reading the page)
    await page.waitForTimeout(500 + Math.random() * 500);
    
    // Try multiple selectors for login button
    const loginButtonSelectors = [
      'button[type="submit"]',
      'button:has-text("Log in")',
      'button:has-text("Log In")',
      'button._acan._acap._acas',
      'div[role="button"]:has-text("Log in")'
    ];
    
    let loginClicked = false;
    for (const selector of loginButtonSelectors) {
      try {
        const button = await page.$(selector);
        if (button) {
          await button.click();
          loginClicked = true;
          console.log('✅ Login button clicked');
          break;
        }
      } catch (e) {
        // Try next selector
      }
    }
    
    if (!loginClicked) {
      throw new Error('Could not find login button');
    }

    // Wait for login to complete
    console.log('⏳ Waiting for login to complete...');
    await Promise.race([
      page.waitForSelector('main[role="main"]', { timeout: 15000 }),
      page.waitForSelector('text=Save your login info?', { timeout: 15000 })
    ]);

    // Handle "Save your login info" dialog
    const saveLoginVisible = await page.getByText('Save your login info?').isVisible().catch(() => false);
    if (saveLoginVisible) {
      console.log('💾 Handling "Save login info" dialog...');
      await page.getByRole('button', { name: 'Not now' }).click();
      await page.waitForTimeout(1000);
    }

    // Handle "Turn on Notifications" dialog - multiple detection strategies
    console.log('🔔 Checking for notification dialog...');
    const notifDialogSelectors = [
      'text=Turn on Notifications',
      'text=Turn On Notifications',
      'text=notifications',
      'text=Notifications',
      'div[role="dialog"] h3:has-text("Notifications")',
      'div[role="dialog"] h2:has-text("Notifications")',
      '[aria-label*="notification" i]',
      'div:has-text("Turn on Notifications"):has(button)'
    ];
    
    for (const selector of notifDialogSelectors) {
      try {
        const dialog = await page.$(selector);
        if (dialog) {
          const isVisible = await dialog.isVisible().catch(() => false);
          if (isVisible) {
            // Try multiple "Not now" button strategies
            const dismissSelectors = [
              'button:has-text("Not now")',
              'button:has-text("Not Now")',
              'div[role="button"]:has-text("Not now")',
              'div[role="button"]:has-text("Not Now")',
              'button[type="button"]:not([aria-label])',
              '[aria-label="Close" i]',
              '[aria-label="Dismiss" i]'
            ];
            
            let dismissed = false;
            for (const btnSelector of dismissSelectors) {
              try {
                const btn = await page.$(btnSelector);
                if (btn) {
                  const btnVisible = await btn.isVisible().catch(() => false);
                  if (btnVisible) {
                    await btn.click();
                    console.log('✅ Dismissed notification dialog');
                    dismissed = true;
                    await page.waitForTimeout(1000);
                    break;
                  }
                }
              } catch (e) {
                // Try next selector
              }
            }
            
            if (!dismissed) {
              // Fallback: press Escape key
              await page.keyboard.press('Escape');
              console.log('⌨️  Dismissed notification dialog with Escape key');
              await page.waitForTimeout(1000);
            }
            break;
          }
        }
      } catch (e) {
        // Try next selector
      }
    }

    // Wait for feed to load
    console.log('⏳ Waiting for feed to load...');
    await page.waitForTimeout(3000);

    // Take screenshot of feed
    const absolutePath = path.resolve(screenshotPath);
    await page.screenshot({ path: absolutePath, fullPage: false });
    console.log(`✅ Screenshot saved: ${absolutePath}`);

    // Save cookies for future session persistence
    await saveCookies(context);

    return { success: true, screenshotPath: absolutePath, sessionSaved: true };

  } catch (error) {
    console.error('❌ Error during login:', error.message);
    const errorPath = path.join(DEFAULT_SCREENSHOT_DIR, 'instagram_error.png');
    await page.screenshot({ path: errorPath, fullPage: true });
    console.log(`📸 Error screenshot saved: ${errorPath}`);
    return { success: false, error: error.message, errorScreenshot: errorPath };
  } finally {
    await browser.close();
    console.log('🔚 Browser closed');
  }
}

// CLI usage
if (require.main === module) {
  const args = process.argv.slice(2);
  
  // Show help
  if (args.includes('--help') || args.includes('-h')) {
    console.log(`
Instagram Login Automation

Usage:
  node instagram-login.js <username> <password> [output_path]
  node instagram-login.js --save <username> <password>
  node instagram-login.js --use-saved [output_path]
  node instagram-login.js --clear
  node instagram-login.js --check-session

Options:
  --save <user> <pass>    Save credentials for future use
  --use-saved [path]      Use saved credentials/session to login
  --force-login           Force fresh login even if session exists
  --clear                 Delete saved credentials and session
  --check-session         Check if valid session exists
  --help, -h              Show this help message

Examples:
  node instagram-login.js lone.wolf7109 Jobjoeld5@ ./feed.png
  node instagram-login.js --save lone.wolf7109 Jobjoeld5@
  node instagram-login.js --use-saved
  node instagram-login.js --use-saved ./my_feed.png
  node instagram-login.js --force-login    # Force re-login
    `);
    process.exit(0);
  }

  // Check session status
  if (args.includes('--check-session')) {
    if (hasValidSession()) {
      const cookies = loadCookies();
      console.log('✅ Valid Instagram session exists');
      console.log(`   Saved: ${cookies.savedAt}`);
      console.log(`   Expires: ${cookies.expiresAt}`);
    } else {
      console.log('❌ No valid Instagram session found');
      console.log('   Run with --use-saved to login and save a session');
    }
    process.exit(0);
  }

  // Clear credentials
  if (args.includes('--clear')) {
    deleteCredentials();
    process.exit(0);
  }

  // Save credentials mode
  if (args.includes('--save')) {
    const saveIndex = args.indexOf('--save');
    const username = args[saveIndex + 1];
    const password = args[saveIndex + 2];
    
    if (!username || !password) {
      console.error('❌ Error: --save requires username and password');
      console.log('Usage: node instagram-login.js --save <username> <password>');
      process.exit(1);
    }
    
    saveCredentials(username, password);
    process.exit(0);
  }

  // Use saved credentials
  if (args.includes('--use-saved')) {
    const forceLogin = args.includes('--force-login');
    
    if (forceLogin) {
      console.log('🔄 Forcing fresh login...');
    }
    
    const savedCreds = loadCredentials();
    if (!savedCreds) {
      console.error('❌ Error: No saved credentials found');
      console.log('💡 Use: node instagram-login.js --save <username> <password>');
      process.exit(1);
    }
    
    const useSavedIndex = args.indexOf('--use-saved');
    const outputPath = args[useSavedIndex + 1] || DEFAULT_SCREENSHOT_PATH;
    
    if (!forceLogin && hasValidSession()) {
      console.log(`🔑 Using saved session for: ${savedCreds.username}`);
    } else {
      console.log(`🔑 Using saved credentials for: ${savedCreds.username}`);
    }
    
    loginToInstagram({
      username: savedCreds.username,
      password: savedCreds.password,
      screenshotPath: outputPath,
      forceLogin: forceLogin
    }).then(result => {
      if (result.success) {
        if (result.restoredSession) {
          console.log('\n✨ Instagram session restored successfully! (No login needed)');
        } else {
          console.log('\n✨ Instagram login completed successfully!');
        }
        console.log('💡 Your session is now saved for future use');
        process.exit(0);
      } else {
        console.log('\n💥 Instagram login failed!');
        process.exit(1);
      }
    });
    return; // Prevent falling through to other checks
  }

  // Direct login mode (requires username and password)
  if (args.length < 2) {
    console.log('Usage: node instagram-login.js <username> <password> [output_path]');
    console.log('       node instagram-login.js --save <username> <password>');
    console.log('       node instagram-login.js --use-saved [output_path]');
    console.log('       node instagram-login.js --help');
    process.exit(1);
  }

  const [username, password, outputPath] = args;
  
  loginToInstagram({
    username,
    password,
    screenshotPath: outputPath || DEFAULT_SCREENSHOT_PATH
  }).then(result => {
    if (result.success) {
      console.log('\n✨ Instagram login completed successfully!');
      console.log('💡 Tip: Use --save to store credentials and enable session persistence!');
      process.exit(0);
    } else {
      console.log('\n💥 Instagram login failed!');
      process.exit(1);
    }
  });
}

module.exports = { 
  loginToInstagram, 
  saveCredentials, 
  loadCredentials, 
  hasCredentials,
  deleteCredentials,
  hasValidSession,
  loadCookies,
  saveCookies
};