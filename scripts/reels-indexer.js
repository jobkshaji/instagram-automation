#!/usr/bin/env node
/**
 * Instagram Saved Reels Indexer
 * 
 * Maintains a searchable, well-organized index of saved reels with:
 * - Structured metadata extraction (captions, hashtags, creators, dates)
 * - JSON database for efficient storage and querying
 * - Full-text search capabilities
 * - Tag-based filtering
 * - Automatic syncing
 */

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

// Configuration
const CONFIG = {
  DB_PATH: '/home/picoclaw/.picoclaw/workspace/instagram_screenshot/reels_database.json',
  INDEX_PATH: '/home/picoclaw/.picoclaw/workspace/instagram_screenshot/reels_index.json',
  OUTPUT_DIR: '/home/picoclaw/.picoclaw/workspace/instagram_screenshot',
  COOKIES_PATH: path.join(__dirname, '..', '.cookies.json'),
  AUTH_PATH: path.join(__dirname, '..', 'instagram_auth.json'),
  SCROLL_ATTEMPTS: 10,
  DELAY_BETWEEN_SCROLLS: 1500,
};

/**
 * Load saved session cookies
 */
function loadCookies() {
  try {
    if (fs.existsSync(CONFIG.COOKIES_PATH)) {
      return JSON.parse(fs.readFileSync(CONFIG.COOKIES_PATH, 'utf8'));
    }
    if (fs.existsSync(CONFIG.AUTH_PATH)) {
      return JSON.parse(fs.readFileSync(CONFIG.AUTH_PATH, 'utf8'));
    }
  } catch (e) {
    console.error('Error loading cookies:', e.message);
  }
  return null;
}

/**
 * Save session cookies
 */
function saveCookies(cookies) {
  try {
    const cookiesWithExpiry = {
      cookies,
      savedAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
    };
    fs.writeFileSync(CONFIG.COOKIES_PATH, JSON.stringify(cookiesWithExpiry, null, 2));
    fs.chmodSync(CONFIG.COOKIES_PATH, 0o600);
  } catch (e) {
    console.error('Error saving cookies:', e.message);
  }
}

/**
 * Load or initialize the reels database
 */
function loadDatabase() {
  try {
    if (fs.existsSync(CONFIG.DB_PATH)) {
      return JSON.parse(fs.readFileSync(CONFIG.DB_PATH, 'utf8'));
    }
  } catch (e) {
    console.error('Error loading database:', e.message);
  }
  return {
    version: '1.0',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    reels: [],
    stats: {
      totalReels: 0,
      totalCreators: 0,
      totalHashtags: 0,
      lastSync: null
    },
    metadata: {
      username: null,
      syncHistory: []
    }
  };
}

/**
 * Save the reels database
 */
function saveDatabase(db) {
  try {
    db.updatedAt = new Date().toISOString();
    fs.writeFileSync(CONFIG.DB_PATH, JSON.stringify(db, null, 2));
    console.log(`💾 Database saved (${db.reels.length} reels)`);
  } catch (e) {
    console.error('Error saving database:', e.message);
  }
}

/**
 * Extract hashtags from text
 */
function extractHashtags(text) {
  if (!text) return [];
  const hashtags = text.match(/#[\w]+/g) || [];
  return [...new Set(hashtags.map(h => h.toLowerCase()))];
}

/**
 * Extract mentions from text
 */
function extractMentions(text) {
  if (!text) return [];
  const mentions = text.match(/@[\w.]+/g) || [];
  return [...new Set(mentions.map(m => m.toLowerCase()))];
}

/**
 * Build search index from database
 */
function buildSearchIndex(db) {
  const index = {
    byHashtag: {},
    byCreator: {},
    byKeyword: {},
    byDate: {},
    allHashtags: [],
    allCreators: [],
    allKeywords: []
  };

  db.reels.forEach(reel => {
    // Index by hashtag
    reel.hashtags.forEach(tag => {
      if (!index.byHashtag[tag]) index.byHashtag[tag] = [];
      if (!index.byHashtag[tag].includes(reel.id)) {
        index.byHashtag[tag].push(reel.id);
      }
    });

    // Index by creator
    if (reel.creator) {
      const creatorKey = reel.creator.toLowerCase();
      if (!index.byCreator[creatorKey]) index.byCreator[creatorKey] = [];
      if (!index.byCreator[creatorKey].includes(reel.id)) {
        index.byCreator[creatorKey].push(reel.id);
      }
    }

    // Index by date (YYYY-MM)
    if (reel.dateSaved) {
      const monthKey = reel.dateSaved.substring(0, 7);
      if (!index.byDate[monthKey]) index.byDate[monthKey] = [];
      if (!index.byDate[monthKey].includes(reel.id)) {
        index.byDate[monthKey].push(reel.id);
      }
    }

    // Index keywords from caption, alt text, comments, and views
    const keywords = [
      ...(reel.caption || '').toLowerCase().split(/\s+/),
      ...(reel.altText || '').toLowerCase().split(/\s+/),
      ...(reel.audio || '').toLowerCase().split(/\s+/),
      ...(reel.comments || '').toLowerCase().split(/\s+/),
      ...(reel.views || '').toLowerCase().split(/\s+/)
    ].filter(w => w.length > 3);

    keywords.forEach(word => {
      const cleanWord = word.replace(/[^\w]/g, '');
      if (cleanWord.length > 3) {
        if (!index.byKeyword[cleanWord]) index.byKeyword[cleanWord] = [];
        if (!index.byKeyword[cleanWord].includes(reel.id)) {
          index.byKeyword[cleanWord].push(reel.id);
        }
      }
    });
  });

  index.allHashtags = Object.keys(index.byHashtag).sort();
  index.allCreators = Object.keys(index.byCreator).sort();
  index.allKeywords = Object.keys(index.byKeyword).sort();

  return index;
}

/**
 * Save search index
 */
function saveIndex(index) {
  try {
    fs.writeFileSync(CONFIG.INDEX_PATH, JSON.stringify(index, null, 2));
    console.log(`🔍 Search index updated`);
  } catch (e) {
    console.error('Error saving index:', e.message);
  }
}

/**
 * Extract reel details from the page
 */
async function extractReelDetails(page, shortcode) {
  try {
    // Try multiple selectors for different Instagram layouts
    const details = await page.evaluate(() => {
      const result = {
        creator: null,
        creatorHandle: null,
        caption: null,
        likes: null,
        views: null,
        comments: null,
        date: null,
        audio: null,
        altText: null,
        hashtags: [],
        mentions: [],
        isVideo: false,
        isReel: false
      };

      // Try to find creator/username with improved selectors
      const creatorSelectors = [
        'header a[href^="/"] h2',
        'header a[href^="/"] span',
        'a[href^="/"]:not([href*="/p/"]):not([href*="/reel/"]):not([href*="/explore/"]) h2',
        'article header a[role="link"]',
        'a[href^="/"] div[dir="auto"] span',
        '[data-testid="user-avatar"] ~ div a',
        'h2 a[href^="/"]',
        'a[href^="/"] > div > span'
      ];
      
      for (const selector of creatorSelectors) {
        const el = document.querySelector(selector);
        if (el) {
          const text = el.textContent?.trim();
          if (text && text.length > 0 && text.length < 50 && !text.includes(' ')) {
            result.creator = text;
            result.creatorHandle = text.startsWith('@') ? text : `@${text}`;
            break;
          }
        }
      }

      // Try to find caption with improved selectors
      // Instagram captions are typically in specific structures, not h1 or random spans
      const captionSelectors = [
        // Main caption container - most reliable
        'article h1[dir="auto"]',
        '[role="dialog"] h1[dir="auto"]',
        // Post content area
        '[data-testid="post-content"] div[dir="auto"]',
        '[data-testid="post-content"] span[dir="auto"]',
        // Article content
        'article div[dir="auto"] > span[dir="auto"]',
        'article [role="button"] div[dir="auto"]',
        // Dialog/modal content
        '[role="dialog"] div[dir="auto"] > span[dir="auto"]'
      ];
      
      // Helper to check if text looks like a caption vs UI element
      const isValidCaption = (text) => {
        if (!text || text.length < 5 || text.length > 2000) return false;
        
        // Skip date patterns like "February 22", "March 15"
        const datePattern = /^(January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2}$/i;
        if (datePattern.test(text)) return false;
        
        // Skip common UI labels
        const uiLabels = ['notifications', 'messages', 'search', 'home', 'profile', 'menu', 'settings', 'options', 'more', 'share', 'save', 'like', 'comment'];
        const lowerText = text.toLowerCase().trim();
        if (uiLabels.includes(lowerText)) return false;
        
        // Skip if it's just a number (like comment counts)
        if (/^\d+$/.test(text)) return false;
        
        return true;
      };
      
      let fullText = '';
      for (const selector of captionSelectors) {
        const els = document.querySelectorAll(selector);
        for (const el of els) {
          const text = el.textContent?.trim();
          if (isValidCaption(text)) {
            result.caption = text;
            fullText = text;
            break;
          }
        }
        if (result.caption) break;
      }
      
      // Fallback: Try to find caption in the article's text content more carefully
      if (!result.caption) {
        const article = document.querySelector('article, [role="dialog"] article');
        if (article) {
          // Look for the longest span[dir="auto"] that's not in a header
          const spans = article.querySelectorAll('div:not(header) span[dir="auto"], div:not([role="banner"]) span[dir="auto"]');
          let bestText = '';
          for (const span of spans) {
            const text = span.textContent?.trim();
            if (isValidCaption(text) && text.length > bestText.length) {
              bestText = text;
            }
          }
          if (bestText) {
            result.caption = bestText;
            fullText = bestText;
          }
        }
      }
      
      // Try to find alt text (often contains good descriptions)
      if (!result.caption) {
        const img = document.querySelector('img[alt]');
        if (img && img.alt) {
          result.altText = img.alt;
          fullText = img.alt;
        }
      }

      // Extract hashtags from caption, comments, and views
      const allText = [
        result.caption || '',
        result.comments || '',
        result.views || ''
      ].join(' ');
      
      if (allText) {
        const hashtagRegex = /#[\w\u00C0-\u017F]+/g;
        const hashtags = allText.match(hashtagRegex);
        if (hashtags) {
          result.hashtags = [...new Set(hashtags.map(h => h.toLowerCase()))];
        }
        
        // Extract mentions (@username)
        const mentionRegex = /@[\w.]+/g;
        const mentions = allText.match(mentionRegex);
        if (mentions) {
          result.mentions = [...new Set(mentions)];
        }
      }
      
      // Try to find likes count
      const allElements = document.querySelectorAll('span, a, button');
      for (const el of allElements) {
        const text = el.textContent?.toLowerCase() || '';
        if ((text.includes('like') || text.includes('likes')) && /\d/.test(text)) {
          result.likes = el.textContent.trim();
          break;
        }
      }
      
      // Try to find views count (for reels)
      for (const el of allElements) {
        const text = el.textContent?.toLowerCase() || '';
        if ((text.includes('view') || text.includes('views')) && /\d/.test(text)) {
          result.views = el.textContent.trim();
          break;
        }
      }
      
      // Try to find comments count
      for (const el of allElements) {
        const text = el.textContent?.toLowerCase() || '';
        if ((text.includes('comment') || text.includes('comments')) && /\d/.test(text)) {
          result.comments = el.textContent.trim();
          break;
        }
      }
      
      // Try to find audio information
      const audioLink = document.querySelector('a[href*="audio"]');
      if (audioLink && audioLink.textContent) {
        result.audio = audioLink.textContent.trim();
      } else {
        // Search for "original audio" or "original sound" text
        for (const el of allElements) {
          const text = el.textContent?.toLowerCase() || '';
          if (text.includes('original audio') || text.includes('original sound')) {
            result.audio = el.textContent.trim();
            break;
          }
        }
      }
      
      // Check if it's a video/reel
      const video = document.querySelector('video');
      result.isVideo = !!video;
      
      // Check if it's specifically a reel
      if (window.location.href.includes('/reel/') || window.location.href.includes('/p/')) {
        result.isReel = true;
      }

      return result;
    });

    return details;
  } catch (e) {
    console.error(`Error extracting details for ${shortcode}:`, e.message);
    return null;
  }
}

/**
 * Scrape saved reels from Instagram
 */
async function scrapeSavedReels(username, forceLogin = false) {
  console.log('🎬 Instagram Saved Reels Indexer');
  console.log('=====================================\n');

  const browser = await chromium.launch({ headless: true });
  
  try {
    let context;
    const savedCookies = loadCookies();
    
    if (savedCookies && savedCookies.cookies && !forceLogin) {
      console.log('🍪 Restoring saved session...');
      context = await browser.newContext({
        viewport: { width: 1920, height: 1080 },
        userAgent: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      });
      await context.addCookies(savedCookies.cookies);
    } else {
      throw new Error('No saved session found. Please login first.');
    }

    const page = await context.newPage();

    // Navigate to saved posts
    const savedUrl = `https://www.instagram.com/${username}/saved/all-posts/`;
    console.log(`📂 Navigating to saved posts...`);
    await page.goto(savedUrl, { waitUntil: 'networkidle', timeout: 60000 });

    // Handle cookie consent
    try {
      const cookieBtn = await page.$('button:has-text("Allow all cookies")');
      if (cookieBtn) await cookieBtn.click();
    } catch (e) {}

    await page.waitForTimeout(3000);

    // Scroll and collect all post links
    console.log('🔍 Scanning for reels...');
    const collectedShortcodes = new Set();
    
    for (let i = 0; i < CONFIG.SCROLL_ATTEMPTS; i++) {
      const links = await page.evaluate(() => {
        const posts = document.querySelectorAll('a[href*="/p/"], a[href*="/reel/"]');
        return Array.from(posts).map(a => {
          const href = a.getAttribute('href');
          const match = href.match(/\/(p|reel)\/([^\/]+)/);
          return match ? match[2] : null;
        }).filter(Boolean);
      });

      links.forEach(code => collectedShortcodes.add(code));
      
      process.stdout.write('.');
      
      // Scroll down
      await page.evaluate(() => window.scrollBy(0, 800));
      await page.waitForTimeout(CONFIG.DELAY_BETWEEN_SCROLLS);
    }

    console.log(`\n📊 Found ${collectedShortcodes.size} total items`);

    // Process each reel
    const reels = [];
    const shortcodesArray = Array.from(collectedShortcodes);

    for (let i = 0; i < shortcodesArray.length; i++) {
      const shortcode = shortcodesArray[i];
      console.log(`  [${i + 1}/${shortcodesArray.length}] Processing ${shortcode}...`);

      try {
        // Navigate to the post
        const postUrl = `https://www.instagram.com/p/${shortcode}/`;
        await page.goto(postUrl, { waitUntil: 'networkidle', timeout: 30000 });
        await page.waitForTimeout(2000);

        // Extract details
        const details = await extractReelDetails(page, shortcode);
        
        if (details) {
          const caption = details.caption || details.altText || '';
          // Use extracted hashtags/mentions if available, otherwise extract from caption
          const hashtags = details.hashtags?.length > 0 
            ? details.hashtags 
            : extractHashtags(caption);
          const mentions = details.mentions?.length > 0 
            ? details.mentions 
            : extractMentions(caption);

          reels.push({
            id: shortcode,
            shortcode: shortcode,
            url: postUrl,
            creator: details.creator || 'Unknown',
            creatorHandle: details.creatorHandle || '@Unknown',
            caption: details.caption || '',
            altText: details.altText || '',
            hashtags: hashtags,
            mentions: mentions,
            audio: details.audio || '',
            likes: details.likes || '',
            views: details.views || '',
            comments: details.comments || '',
            isVideo: details.isVideo,
            isReel: details.isReel,
            dateSaved: new Date().toISOString(),
            lastUpdated: new Date().toISOString()
          });
        }
      } catch (e) {
        console.error(`    ⚠️ Error processing ${shortcode}:`, e.message);
      }
    }

    // Save cookies for next time
    const cookies = await context.cookies();
    saveCookies(cookies);

    console.log(`\n✅ Successfully processed ${reels.length} reels`);
    return reels;

  } catch (error) {
    console.error('\n❌ Error:', error.message);
    throw error;
  } finally {
    await browser.close();
  }
}

/**
 * Merge new reels with existing database
 */
function mergeReels(db, newReels) {
  const existingIds = new Set(db.reels.map(r => r.id));
  let added = 0;
  let updated = 0;

  newReels.forEach(newReel => {
    const existingIndex = db.reels.findIndex(r => r.id === newReel.id);
    
    if (existingIndex === -1) {
      // New reel
      db.reels.push(newReel);
      added++;
    } else {
      // Update existing reel
      db.reels[existingIndex] = {
        ...db.reels[existingIndex],
        ...newReel,
        lastUpdated: new Date().toISOString()
      };
      updated++;
    }
  });

  // Update stats
  db.stats.totalReels = db.reels.length;
  db.stats.totalCreators = new Set(db.reels.map(r => r.creator?.toLowerCase())).size;
  db.stats.totalHashtags = new Set(db.reels.flatMap(r => r.hashtags)).size;
  db.stats.lastSync = new Date().toISOString();

  // Add to sync history
  db.metadata.syncHistory.push({
    date: new Date().toISOString(),
    added: added,
    updated: updated,
    total: db.reels.length
  });

  return { added, updated, total: db.reels.length };
}

/**
 * Search reels by query
 */
function searchReels(db, query) {
  const lowerQuery = query.toLowerCase();
  const results = [];

  db.reels.forEach(reel => {
    const searchable = [
      reel.caption,
      reel.altText,
      reel.creator,
      reel.audio,
      reel.comments,
      reel.views,
      ...reel.hashtags,
      ...reel.mentions
    ].join(' ').toLowerCase();

    if (searchable.includes(lowerQuery)) {
      results.push(reel);
    }
  });

  return results;
}

/**
 * Search reels by hashtag
 */
function searchByHashtag(db, hashtag) {
  const tag = hashtag.toLowerCase().startsWith('#') ? hashtag.toLowerCase() : `#${hashtag.toLowerCase()}`;
  return db.reels.filter(reel => reel.hashtags.includes(tag));
}

/**
 * Search reels by creator
 */
function searchByCreator(db, creator) {
  const lowerCreator = creator.toLowerCase().replace('@', '');
  return db.reels.filter(reel => 
    reel.creator?.toLowerCase().includes(lowerCreator) ||
    reel.creatorHandle?.toLowerCase().includes(lowerCreator)
  );
}

/**
 * Export reels to formatted text
 */
function exportToText(db, outputPath) {
  const lines = [
    '═══════════════════════════════════════════════════════════════════════════════',
    '                        INSTAGRAM SAVED REELS COLLECTION',
    `                              Total Reels: ${db.reels.length}`,
    `                         Last Updated: ${new Date(db.updatedAt).toLocaleString()}`,
    '═══════════════════════════════════════════════════════════════════════════════',
    ''
  ];

  db.reels.forEach((reel, index) => {
    lines.push('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    lines.push(`REEL #${index + 1}`);
    lines.push('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    lines.push(`👤 Creator: ${reel.creatorHandle || '@' + reel.creator || '@Unknown'}`);
    lines.push(`📝 Description: ${reel.caption || reel.altText || 'No description'}`);
    lines.push(`🔗 Link: ${reel.url}`);
    if (reel.hashtags && reel.hashtags.length > 0) {
      lines.push(`🏷️  Hashtags: ${reel.hashtags.join(' ')}`);
    }
    if (reel.mentions && reel.mentions.length > 0) {
      lines.push(`💬 Mentions: ${reel.mentions.join(' ')}`);
    }
    if (reel.audio) {
      lines.push(`🎵 Audio: ${reel.audio}`);
    }
    if (reel.likes) {
      lines.push(`❤️ Likes: ${reel.likes}`);
    }
    if (reel.views) {
      lines.push(`👁️  Views: ${reel.views}`);
    }
    if (reel.comments) {
      lines.push(`💭 Comments: ${reel.comments}`);
    }
    lines.push(`📅 Saved: ${new Date(reel.dateSaved).toLocaleDateString()}`);
    lines.push('');
  });

  lines.push('═══════════════════════════════════════════════════════════════════════════════');
  lines.push('                              QUICK LINKS');
  lines.push('═══════════════════════════════════════════════════════════════════════════════');
  lines.push('');
  
  db.reels.forEach((reel, index) => {
    lines.push(`${index + 1}. ${reel.url}`);
  });

  lines.push('');
  lines.push('═══════════════════════════════════════════════════════════════════════════════');
  lines.push('                              HASHTAG INDEX');
  lines.push('═══════════════════════════════════════════════════════════════════════════════');
  lines.push('');

  // Group by hashtag
  const hashtagMap = {};
  db.reels.forEach(reel => {
    reel.hashtags.forEach(tag => {
      if (!hashtagMap[tag]) hashtagMap[tag] = [];
      hashtagMap[tag].push(reel.id);
    });
  });

  Object.keys(hashtagMap).sort().forEach(tag => {
    lines.push(`${tag} (${hashtagMap[tag].length} reels)`);
  });

  fs.writeFileSync(outputPath, lines.join('\n'));
  console.log(`📝 Exported to ${outputPath}`);
}

/**
 * Print database statistics
 */
function printStats(db) {
  console.log('\n📊 Database Statistics');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log(`Total Reels: ${db.stats.totalReels}`);
  console.log(`Unique Creators: ${db.stats.totalCreators}`);
  console.log(`Unique Hashtags: ${db.stats.totalHashtags}`);
  console.log(`Last Sync: ${db.stats.lastSync ? new Date(db.stats.lastSync).toLocaleString() : 'Never'}`);
  console.log(`Database Version: ${db.version}`);
  console.log('═══════════════════════════════════════════════════════════════\n');
}

/**
 * Main function
 */
async function main() {
  const args = process.argv.slice(2);
  const command = args[0];

  // Load database
  const db = loadDatabase();

  switch (command) {
    case 'sync':
      // Sync with Instagram
      const username = args[1] || db.metadata.username;
      if (!username) {
        console.error('❌ Error: Username required. Usage: reels-indexer sync <username>');
        process.exit(1);
      }
      
      db.metadata.username = username;
      const forceLogin = args.includes('--force-login');
      
      console.log(`🔄 Syncing reels for @${username}...\n`);
      const newReels = await scrapeSavedReels(username, forceLogin);
      const mergeResult = mergeReels(db, newReels);
      
      saveDatabase(db);
      
      // Build and save search index
      const index = buildSearchIndex(db);
      saveIndex(index);
      
      // Export to text
      exportToText(db, path.join(CONFIG.OUTPUT_DIR, 'MY_SAVED_REELS.txt'));
      
      console.log(`\n✅ Sync complete!`);
      console.log(`   Added: ${mergeResult.added} new reels`);
      console.log(`   Updated: ${mergeResult.updated} existing reels`);
      console.log(`   Total: ${mergeResult.total} reels in database`);
      break;

    case 'search':
      // Search reels
      const query = args.slice(1).join(' ');
      if (!query) {
        console.error('❌ Error: Search query required. Usage: reels-indexer search <query>');
        process.exit(1);
      }
      
      const results = searchReels(db, query);
      console.log(`\n🔍 Search results for "${query}":`);
      console.log(`Found ${results.length} reels\n`);
      
      results.forEach((reel, i) => {
        console.log(`${i + 1}. ${reel.creatorHandle || '@' + reel.creator}`);
        console.log(`   ${reel.caption?.substring(0, 100) || reel.altText?.substring(0, 100) || 'No description'}...`);
        console.log(`   🔗 ${reel.url}`);
        console.log(`   🏷️  ${reel.hashtags.slice(0, 5).join(' ')}${reel.hashtags.length > 5 ? '...' : ''}\n`);
      });
      break;

    case 'hashtag':
      // Search by hashtag
      const tag = args[1];
      if (!tag) {
        console.error('❌ Error: Hashtag required. Usage: reels-indexer hashtag <tag>');
        process.exit(1);
      }
      
      const tagResults = searchByHashtag(db, tag);
      console.log(`\n🏷️ Reels with hashtag "${tag}":`);
      console.log(`Found ${tagResults.length} reels\n`);
      
      tagResults.forEach((reel, i) => {
        console.log(`${i + 1}. ${reel.creatorHandle || '@' + reel.creator}`);
        console.log(`   ${reel.caption?.substring(0, 100) || 'No description'}...`);
        console.log(`   🔗 ${reel.url}\n`);
      });
      break;

    case 'creator':
      // Search by creator
      const creator = args[1];
      if (!creator) {
        console.error('❌ Error: Creator required. Usage: reels-indexer creator <username>');
        process.exit(1);
      }
      
      const creatorResults = searchByCreator(db, creator);
      console.log(`\n👤 Reels by "${creator}":`);
      console.log(`Found ${creatorResults.length} reels\n`);
      
      creatorResults.forEach((reel, i) => {
        console.log(`${i + 1}. ${reel.caption?.substring(0, 100) || reel.altText?.substring(0, 100) || 'No description'}...`);
        console.log(`   🔗 ${reel.url}\n`);
      });
      break;

    case 'stats':
      printStats(db);
      break;

    case 'export':
      const exportPath = args[1] || path.join(CONFIG.OUTPUT_DIR, 'MY_SAVED_REELS.txt');
      exportToText(db, exportPath);
      break;

    case 'tags':
      // List all hashtags
      const tagIndex = buildSearchIndex(db);
      console.log('\n🏷️ All Hashtags in Your Collection:');
      console.log('═══════════════════════════════════════════════════════════════');
      tagIndex.allHashtags.forEach(tag => {
        const count = tagIndex.byHashtag[tag].length;
        console.log(`${tag.padEnd(25)} (${count} reels)`);
      });
      console.log('═══════════════════════════════════════════════════════════════');
      console.log(`Total: ${tagIndex.allHashtags.length} unique hashtags\n`);
      break;

    case 'creators':
      // List all creators
      const creatorIndex = buildSearchIndex(db);
      console.log('\n👤 All Creators in Your Collection:');
      console.log('═══════════════════════════════════════════════════════════════');
      creatorIndex.allCreators.forEach(creator => {
        const count = creatorIndex.byCreator[creator].length;
        console.log(`${creator.padEnd(25)} (${count} reels)`);
      });
      console.log('═══════════════════════════════════════════════════════════════');
      console.log(`Total: ${creatorIndex.allCreators.length} unique creators\n`);
      break;

    default:
      console.log('🎬 Instagram Saved Reels Indexer\n');
      console.log('Usage:');
      console.log('  reels-indexer sync <username> [--force-login]  Sync reels from Instagram');
      console.log('  reels-indexer search <query>                   Search reels by keyword');
      console.log('  reels-indexer hashtag <tag>                    Search reels by hashtag');
      console.log('  reels-indexer creator <username>               Search reels by creator');
      console.log('  reels-indexer stats                            Show database statistics');
      console.log('  reels-indexer tags                             List all hashtags');
      console.log('  reels-indexer creators                         List all creators');
      console.log('  reels-indexer export [path]                    Export to text file\n');
      console.log('Examples:');
      console.log('  reels-indexer sync lone.wolf7109');
      console.log('  reels-indexer search "gym workout"');
      console.log('  reels-indexer hashtag fitness');
      console.log('  reels-indexer creator formula1\n');
  }
}

// Run main function
main().catch(console.error);
