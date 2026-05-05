#!/usr/bin/env node

/**
 * Instagram Saved Reels Extraction Script
 * 
 * Extracts all saved reels from Instagram with links, descriptions,
 * and metadata into a comprehensive text file.
 * 
 * Usage:
 *   node instagram-saved-reels.js --use-saved
 *   node instagram-saved-reels.js --use-saved /custom/output/path.txt
 *   node instagram-saved-reels.js --use-saved --force-login
 */

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const COOKIES_PATH = path.join(__dirname, '../.cookies.json');
const CREDENTIALS_PATH = path.join(__dirname, '../.credentials.json');

// Default output path
const DEFAULT_OUTPUT = '/home/picoclaw/.picoclaw/workspace/instagram_screenshot/MY_SAVED_REELS.txt';

function loadCookies() {
  if (fs.existsSync(COOKIES_PATH)) {
    try {
      const data = JSON.parse(fs.readFileSync(COOKIES_PATH, 'utf8'));
      if (data.cookies && Array.isArray(data.cookies)) {
        return data.cookies;
      }
    } catch (e) {
      console.error('Error loading cookies:', e.message);
    }
  }
  return null;
}

function loadCredentials() {
  if (fs.existsSync(CREDENTIALS_PATH)) {
    try {
      return JSON.parse(fs.readFileSync(CREDENTIALS_PATH, 'utf8'));
    } catch (e) {
      console.error('Error loading credentials:', e.message);
    }
  }
  return null;
}

async function saveCookies(context) {
  try {
    const cookies = await context.cookies();
    fs.writeFileSync(COOKIES_PATH, JSON.stringify({
      cookies,
      savedAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
    }, null, 2));
    console.log('💾 Session saved for future use');
  } catch (e) {
    console.error('Error saving cookies:', e.message);
  }
}

async function loginToInstagram(page, username, password) {
  console.log('🔐 Logging into Instagram...');
  
  await page.goto('https://www.instagram.com/', { waitUntil: 'networkidle' });
  
  // Handle cookie consent
  try {
    const cookieButton = page.getByRole('button', { name: /allow all cookies|accept all/i });
    if (await cookieButton.isVisible({ timeout: 3000 })) {
      await cookieButton.click();
    }
  } catch (e) {}

  // Fill credentials
  await page.getByLabel('Phone number, username, or email').fill(username);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Log in' }).click();

  // Wait for login
  await Promise.race([
    page.waitForSelector('main[role="main"]', { timeout: 15000 }),
    page.waitForSelector('text=Save your login info?', { timeout: 15000 })
  ]);

  // Handle dialogs
  const saveLoginVisible = await page.getByText('Save your login info?').isVisible().catch(() => false);
  if (saveLoginVisible) {
    await page.getByRole('button', { name: 'Not now' }).click();
    await page.waitForTimeout(1000);
  }

  // Handle notification dialog
  const notifSelectors = ['text=Turn on Notifications', 'text=Notifications'];
  for (const selector of notifSelectors) {
    try {
      const dialog = await page.$(selector);
      if (dialog && await dialog.isVisible().catch(() => false)) {
        const dismissBtns = ['button:has-text("Not now")', 'button:has-text("Not Now")', '[aria-label="Close"]'];
        for (const btnSel of dismissBtns) {
          try {
            const btn = await page.$(btnSel);
            if (btn && await btn.isVisible().catch(() => false)) {
              await btn.click();
              await page.waitForTimeout(1000);
              break;
            }
          } catch (e) {}
        }
        break;
      }
    } catch (e) {}
  }

  console.log('✅ Login successful');
}

async function extractSavedReels(username, outputPath, forceLogin = false) {
  const browser = await chromium.launch({ 
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  
  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 },
    userAgent: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.0.36'
  });
  
  const page = await context.newPage();

  try {
    // Try to use saved cookies first
    const cookies = loadCookies();
    let loggedIn = false;
    
    if (cookies && !forceLogin) {
      console.log('🍪 Restoring saved session...');
      await context.addCookies(cookies);
      
      // Test if session is valid
      await page.goto('https://www.instagram.com/', { waitUntil: 'domcontentloaded', timeout: 10000 });
      await page.waitForTimeout(2000);
      
      const currentUrl = page.url();
      if (!currentUrl.includes('/accounts/login/')) {
        console.log('✅ Session restored successfully');
        loggedIn = true;
      } else {
        console.log('⚠️  Session expired, need to login again');
      }
    }

    // Login if needed
    if (!loggedIn) {
      const creds = loadCredentials();
      if (!creds || !creds.username || !creds.password) {
        throw new Error('No saved credentials found. Please run: node instagram-login.js --save <username> <password>');
      }
      await loginToInstagram(page, creds.username, creds.password);
      await saveCookies(context);
    }

    console.log(`📂 Navigating to saved posts for @${username}...`);
    
    // Navigate to saved section
    await page.goto(`https://www.instagram.com/${username}/saved/all-posts/`, {
      waitUntil: 'networkidle',
      timeout: 30000
    });

    // Handle any dialogs
    await page.waitForTimeout(2000);
    const dismissSelectors = [
      'button:has-text("Not now")',
      'button:has-text("Not Now")',
      '[aria-label="Close"]'
    ];
    for (const selector of dismissSelectors) {
      try {
        const btn = await page.$(selector);
        if (btn && await btn.isVisible().catch(() => false)) {
          await btn.click();
          await page.waitForTimeout(500);
        }
      } catch (e) {}
    }

    console.log('🔍 Scanning for reels...');

    // Scroll to load all content
    let lastHeight = 0;
    let scrollAttempts = 0;
    const maxScrolls = 10;
    
    while (scrollAttempts < maxScrolls) {
      const currentHeight = await page.evaluate(() => document.body.scrollHeight);
      if (currentHeight === lastHeight) break;
      
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      await page.waitForTimeout(2000);
      lastHeight = currentHeight;
      scrollAttempts++;
      process.stdout.write('.');
    }
    console.log(`\n📜 Scrolled ${scrollAttempts} times`);

    // Extract reel data from the grid
    const reels = await page.evaluate(() => {
      const items = [];
      const links = document.querySelectorAll('a[href*="/p/"]');
      
      links.forEach(link => {
        const href = link.getAttribute('href');
        if (!href) return;
        
        // Check if it's a reel (look for indicators)
        const article = link.closest('article, div[role="button"]');
        const img = link.querySelector('img');
        const alt = img?.getAttribute('alt') || '';
        
        // Try to identify reel indicators
        const svgIndicators = article?.querySelectorAll('svg');
        let isReel = false;
        
        // Check for reel icon (play icon overlay)
        svgIndicators?.forEach(svg => {
          const path = svg.querySelector('path');
          if (path) {
            const d = path.getAttribute('d') || '';
            // Reel/play icon paths typically contain specific patterns
            if (d.includes('M0') || d.includes('play') || svg.closest('div')?.style.position === 'absolute') {
              isReel = true;
            }
          }
        });
        
        // Alternative: check for "Reels" text or overlay
        const overlayText = article?.textContent?.toLowerCase() || '';
        if (overlayText.includes('reel') || overlayText.includes('play')) {
          isReel = true;
        }
        
        // Get shortcode from URL
        const match = href.match(/\/p\/([^\/]+)/);
        const shortcode = match ? match[1] : null;
        
        if (shortcode) {
          items.push({
            shortcode: shortcode,
            url: `https://www.instagram.com/p/${shortcode}/`,
            alt: alt,
            isReel: isReel
          });
        }
      });
      
      return items;
    });

    console.log(`📊 Found ${reels.length} total items (${reels.filter(r => r.isReel).length} reels detected)`);

    // Filter to reels only and remove duplicates
    const uniqueReels = [];
    const seen = new Set();
    
    for (const reel of reels) {
      // Consider all items as potential reels (Instagram's layout makes detection hard)
      // Better to include all and let user sort through
      if (!seen.has(reel.shortcode)) {
        seen.add(reel.shortcode);
        uniqueReels.push(reel);
      }
    }

    console.log(`🎬 Processing ${uniqueReels.length} unique items...`);

    // Extract detailed info for each reel
    const reelDetails = [];
    
    for (let i = 0; i < uniqueReels.length; i++) {
      const reel = uniqueReels[i];
      console.log(`  [${i + 1}/${uniqueReels.length}] Processing ${reel.shortcode}...`);
      
      try {
        // Visit the reel page to get details
        await page.goto(reel.url, { waitUntil: 'domcontentloaded', timeout: 15000 });
        await page.waitForTimeout(2500);
        
        const details = await page.evaluate(() => {
          const result = {
            creator: '',
            creatorHandle: '',
            description: '',
            hashtags: [],
            mentions: [],
            likes: '',
            date: '',
            audio: '',
            views: '',
            comments: ''
          };
          
          // Creator username - try multiple selectors
          const creatorSelectors = [
            'header a[href^="/"] h2',
            'header a[href^="/"] span',
            'a[href^="/"]:not([href*="/p/"]):not([href*="/reel/"]) h2',
            'article header a[role="link"]',
            'a[href^="/"] div[dir="auto"] span',
            '[data-testid="user-avatar"] ~ div a',
            'h2 a[href^="/"]',
            'a[href^="/"] > div > span'
          ];
          
          for (const sel of creatorSelectors) {
            const el = document.querySelector(sel);
            if (el && el.textContent) {
              const text = el.textContent.trim();
              // Validate it looks like a username (no spaces, reasonable length)
              if (text && text.length > 0 && text.length < 50 && !text.includes(' ')) {
                result.creator = text;
                // Get the href to extract the handle
                const linkEl = el.closest('a') || el;
                if (linkEl.getAttribute) {
                  const href = linkEl.getAttribute('href');
                  if (href) {
                    result.creatorHandle = href.replace(/\//g, '');
                  } else {
                    result.creatorHandle = text;
                  }
                }
                break;
              }
            }
          }
          
          // Description/caption - comprehensive search
          const descSelectors = [
            'h1[data-testid="content-title"]',
            'h1',
            'article h1',
            'article span[dir="auto"]',
            'div[role="button"] span[dir="auto"]',
            '[data-testid="post-content"] span',
            'article div[dir="auto"] span'
          ];
          
          let fullText = '';
          for (const sel of descSelectors) {
            const elements = document.querySelectorAll(sel);
            for (const el of elements) {
              if (el && el.textContent) {
                const text = el.textContent.trim();
                if (text.length > 5) {
                  fullText = text;
                  result.description = text;
                  break;
                }
              }
            }
            if (result.description) break;
          }
          
          // Also try to get text from the main content area
          if (!result.description) {
            const mainContent = document.querySelector('article, main, [role="main"]');
            if (mainContent) {
              const spans = mainContent.querySelectorAll('span[dir="auto"]');
              for (const span of spans) {
                const text = span.textContent?.trim();
                if (text && text.length > 10 && text.length < 2000) {
                  result.description = text;
                  fullText = text;
                  break;
                }
              }
            }
          }
          
          // Extract hashtags from description
          if (result.description) {
            const hashtagRegex = /#[\w\u00C0-\u017F]+/g;
            const hashtags = result.description.match(hashtagRegex);
            if (hashtags) {
              result.hashtags = [...new Set(hashtags.map(h => h.toLowerCase()))];
            }
            
            // Extract mentions (@username)
            const mentionRegex = /@[\w.]+/g;
            const mentions = result.description.match(mentionRegex);
            if (mentions) {
              result.mentions = [...new Set(mentions)];
            }
          }
          
          // Likes count
          const allElements = document.querySelectorAll('span, a, button');
          for (const el of allElements) {
            const text = el.textContent?.toLowerCase() || '';
            if ((text.includes('like') || text.includes('likes')) && /\d/.test(text)) {
              result.likes = el.textContent.trim();
              break;
            }
          }
          
          // Views count (for reels)
          for (const el of allElements) {
            const text = el.textContent?.toLowerCase() || '';
            if ((text.includes('view') || text.includes('views')) && /\d/.test(text)) {
              result.views = el.textContent.trim();
              break;
            }
          }
          
          // Comments count
          for (const el of allElements) {
            const text = el.textContent?.toLowerCase() || '';
            if ((text.includes('comment') || text.includes('comments')) && /\d/.test(text)) {
              result.comments = el.textContent.trim();
              break;
            }
          }
          
          // Date
          const timeEl = document.querySelector('time');
          if (timeEl) {
            result.date = timeEl.getAttribute('datetime') || timeEl.textContent?.trim() || '';
          }
          
          // Audio - look for audio links or original audio text
          const audioLink = document.querySelector('a[href*="audio"]');
          if (audioLink && audioLink.textContent) {
            result.audio = audioLink.textContent.trim();
          } else {
            const audioSelectors = ['span', 'div', 'a'];
            for (const sel of audioSelectors) {
              const elements = document.querySelectorAll(sel);
              for (const el of elements) {
                const text = el.textContent?.toLowerCase() || '';
                if (text.includes('original audio') || text.includes('original sound')) {
                  result.audio = el.textContent.trim();
                  break;
                }
              }
              if (result.audio) break;
            }
          }
          
          return result;
        });
        
        reelDetails.push({
          ...reel,
          ...details
        });
        
        // Small delay to avoid rate limiting
        await page.waitForTimeout(1000);
        
      } catch (e) {
        console.log(`    ⚠️  Could not extract details: ${e.message}`);
        reelDetails.push({
          ...reel,
          creator: 'Unknown',
          description: 'Unable to extract description',
          likes: '',
          date: '',
          audio: ''
        });
      }
    }

    // Generate output
    const output = generateOutput(reelDetails);
    
    // Ensure directory exists
    const dir = path.dirname(outputPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    
    // Write file
    fs.writeFileSync(outputPath, output, 'utf8');
    console.log(`\n✅ Successfully saved ${reelDetails.length} reels to:`);
    console.log(`   ${outputPath}`);

    // Refresh cookies
    await saveCookies(context);
    
    return reelDetails;

  } catch (error) {
    console.error('\n❌ Error:', error.message);
    try {
      await page.screenshot({ path: './instagram_reels_error.png', fullPage: true });
      console.log('📸 Error screenshot saved to: ./instagram_reels_error.png');
    } catch (e) {}
    throw error;
  } finally {
    await browser.close();
  }
}

function generateOutput(reels) {
  const now = new Date().toLocaleString('en-US', { 
    timeZone: 'Asia/Kolkata',
    dateStyle: 'long',
    timeStyle: 'short'
  });
  
  let output = `═══════════════════════════════════════════════════════════════════════════════
                        INSTAGRAM SAVED REELS COLLECTION
                              Total Reels: ${reels.length}
                         Extracted: ${now}
═══════════════════════════════════════════════════════════════════════════════

`;

  for (let i = 0; i < reels.length; i++) {
    const reel = reels[i];
    output += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
REEL #${i + 1}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
`;
    
    if (reel.creator || reel.creatorHandle) {
      const handle = reel.creatorHandle || reel.creator;
      output += `👤 Creator: @${handle}\n`;
    }
    
    if (reel.description) {
      output += `📝 Description: ${reel.description}\n`;
    }
    
    output += `🔗 Link: ${reel.url}\n`;
    
    if (reel.hashtags && reel.hashtags.length > 0) {
      output += `🏷️  Hashtags: ${reel.hashtags.join(' ')}\n`;
    }
    
    if (reel.mentions && reel.mentions.length > 0) {
      output += `💬 Mentions: ${reel.mentions.join(' ')}\n`;
    }
    
    if (reel.audio) {
      output += `🎵 Audio: ${reel.audio}\n`;
    }
    
    if (reel.date) {
      const date = new Date(reel.date);
      if (!isNaN(date)) {
        output += `📅 Date: ${date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}\n`;
      }
    }
    
    if (reel.likes) {
      output += `❤️ Likes: ${reel.likes}\n`;
    }
    
    if (reel.views) {
      output += `👁️  Views: ${reel.views}\n`;
    }
    
    if (reel.comments) {
      output += `💭 Comments: ${reel.comments}\n`;
    }
    
    if (reel.alt && reel.alt.length > 10) {
      output += `📸 Alt Text: ${reel.alt}\n`;
    }
    
    output += `\n`;
  }

  // Quick Links Section
  output += `═══════════════════════════════════════════════════════════════════════════════
                              QUICK LINKS
═══════════════════════════════════════════════════════════════════════════════

`;
  
  reels.forEach((reel, idx) => {
    output += `${idx + 1}. ${reel.url}\n`;
  });

  // Usage Instructions
  output += `
═══════════════════════════════════════════════════════════════════════════════
                              HOW TO USE
═══════════════════════════════════════════════════════════════════════════════

🔗 SHARE A REEL:
   Copy any link above and paste it in Instagram, WhatsApp, or any browser

📥 DOWNLOAD A REEL:
   Use one of these methods:
   
   1. Instaloader (command line):
      instaloader -- -${reels[0]?.shortcode || 'SHORTCODE'}
   
   2. SnapInst.app (website):
      Visit https://snapinst.app and paste the reel link
   
   3. SSS Tik (website):
      Visit https://ssstik.io and paste the reel link

📱 VIEW ON INSTAGRAM:
   Tap any link on mobile to open directly in the Instagram app

💾 BACKUP:
   Keep this file as a backup of your saved reels collection

═══════════════════════════════════════════════════════════════════════════════
`;

  return output;
}

// Main
function showHelp() {
  console.log(`
Instagram Saved Reels Extractor

Usage:
  node instagram-saved-reels.js --use-saved [output_path]
  node instagram-saved-reels.js --use-saved --force-login [output_path]

Options:
  --use-saved       Use saved session/credentials (required)
  --force-login     Force fresh login even if session exists
  --help            Show this help message

Examples:
  # Extract reels using saved session
  node instagram-saved-reels.js --use-saved

  # Extract to custom location
  node instagram-saved-reels.js --use-saved ./my_reels.txt

  # Force re-login before extracting
  node instagram-saved-reels.js --use-saved --force-login
`);
}

async function main() {
  const args = process.argv.slice(2);
  
  if (args.includes('--help') || args.includes('-h')) {
    showHelp();
    process.exit(0);
  }
  
  if (!args.includes('--use-saved')) {
    console.error('❌ Error: --use-saved flag is required');
    console.error('   Run: node instagram-saved-reels.js --use-saved');
    process.exit(1);
  }
  
  const forceLogin = args.includes('--force-login');
  
  // Find output path (first non-flag argument)
  const outputPath = args.find(arg => !arg.startsWith('--')) || DEFAULT_OUTPUT;
  
  // Get username from credentials
  const creds = loadCredentials();
  const username = creds?.username || 'lone.wolf7109';
  
  console.log('🎬 Instagram Saved Reels Extractor');
  console.log('=====================================\n');
  
  try {
    await extractSavedReels(username, outputPath, forceLogin);
  } catch (error) {
    console.error('\n💥 Extraction failed:', error.message);
    process.exit(1);
  }
}

main();
