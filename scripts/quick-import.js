#!/usr/bin/env node
/**
 * Quick Import - Parse extracted reels and add to database
 * Fast alternative to full indexer - no browser needed
 */

const fs = require('fs');
const path = require('path');

const CONFIG = {
  DB_PATH: '/home/picoclaw/.picoclaw/workspace/instagram_screenshot/reels_database.json',
  INDEX_PATH: '/home/picoclaw/.picoclaw/workspace/instagram_screenshot/reels_index.json',
  REELS_FILE: '/home/picoclaw/.picoclaw/workspace/instagram_screenshot/MY_SAVED_REELS.txt'
};

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
    stats: { totalReels: 0, totalCreators: 0, totalHashtags: 0, lastSync: null },
    metadata: { username: null, syncHistory: [] }
  };
}

function saveDatabase(db) {
  db.updatedAt = new Date().toISOString();
  fs.writeFileSync(CONFIG.DB_PATH, JSON.stringify(db, null, 2));
  console.log(`💾 Database saved (${db.reels.length} reels)`);
}

function extractHashtags(text) {
  if (!text) return [];
  const hashtags = text.match(/#[\w]+/g) || [];
  return [...new Set(hashtags.map(h => h.toLowerCase()))];
}

function extractMentions(text) {
  if (!text) return [];
  const mentions = text.match(/@[\w.]+/g) || [];
  return [...new Set(mentions.map(m => m.toLowerCase()))];
}

function autoTag(reel) {
  const tags = new Set();
  const text = (reel.caption + ' ' + reel.altText + ' ' + reel.hashtags.join(' ')).toLowerCase();
  
  // Travel tags
  if (text.includes('travel') || text.includes('paris') || text.includes('vietnam') || 
      text.includes('beach') || text.includes('hotel') || text.includes('trip') ||
      text.includes('destination') || text.includes('blossom') || text.includes('spring')) {
    tags.add('travel');
  }
  if (text.includes('paris') || text.includes('france') || text.includes('eiffel')) {
    tags.add('paris');
    tags.add('france');
  }
  if (text.includes('vietnam') || text.includes('phuquoc')) {
    tags.add('vietnam');
    tags.add('asia');
  }
  if (text.includes('hotel') || text.includes('luxury')) {
    tags.add('luxury');
    tags.add('hotel');
  }
  if (text.includes('beach') || text.includes('island')) {
    tags.add('beach');
  }
  
  // Sports tags
  if (text.includes('f1') || text.includes('formula') || text.includes('racing') || text.includes('car')) {
    tags.add('sports');
    tags.add('racing');
    tags.add('motorsport');
    tags.add('formula1');
    tags.add('f1');
  }
  
  // Fitness tags
  if (text.includes('gym') || text.includes('fitness') || text.includes('workout') || 
      text.includes('train') || text.includes('weight')) {
    tags.add('fitness');
    tags.add('gym');
    tags.add('workout');
    tags.add('motivation');
    tags.add('health');
    tags.add('exercise');
  }
  
  // Math/Education tags
  if (text.includes('math') || text.includes('riddle') || text.includes('solve') || 
      text.includes('quiz') || text.includes('trick') || text.includes('brain')) {
    tags.add('math');
    tags.add('puzzle');
    tags.add('riddle');
    tags.add('brainteaser');
    tags.add('quiz');
    tags.add('education');
    tags.add('fun');
  }
  
  // Social tags
  if (text.includes('friend') || text.includes('ask') || text.includes('social')) {
    tags.add('friends');
    tags.add('questions');
    tags.add('social');
  }
  
  return Array.from(tags);
}

function parseReelsFile() {
  const content = fs.readFileSync(CONFIG.REELS_FILE, 'utf8');
  const reels = [];
  
  // Split by reel separator
  const reelBlocks = content.split('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  
  for (const block of reelBlocks) {
    // Extract link
    const linkMatch = block.match(/🔗 Link: (https:\/\/www\.instagram\.com\/p\/([^\/]+)\/)/);
    if (!linkMatch) continue;
    
    const url = linkMatch[1];
    const shortcode = linkMatch[2];
    
    // Extract creator (new format)
    const creatorMatch = block.match(/👤 Creator: @([^\n]+)/);
    let creator = 'Unknown';
    let creatorHandle = '@Unknown';
    
    if (creatorMatch) {
      creator = creatorMatch[1].trim();
      creatorHandle = `@${creator}`;
    }
    
    // Extract description
    const descMatch = block.match(/📝 Description: (.+)/);
    let description = descMatch && !descMatch[1].includes('Unable') ? descMatch[1].trim() : '';
    
    // Extract alt text
    const altMatch = block.match(/📸 Alt Text: ([\s\S]+?)(?=\n[👍🤩🔗📅🏷️💬🎵❤️👁️💭]|\n{2,})/);
    const altText = altMatch ? altMatch[1].trim() : '';
    
    // Extract audio
    const audioMatch = block.match(/🎵\s*Audio: (.+)/);
    const audio = audioMatch ? audioMatch[1].trim() : '';
    
    // Extract views
    const viewsMatch = block.match(/👁️\s*Views: (.+)/);
    const views = viewsMatch ? viewsMatch[1].trim() : '';
    
    // Extract comments
    const commentsMatch = block.match(/💭\s*Comments: (.+)/);
    const comments = commentsMatch ? commentsMatch[1].trim() : '';
    
    // Extract likes
    const likesMatch = block.match(/❤️\s*Likes: (.+)/);
    const likes = likesMatch ? likesMatch[1].trim() : '';
    
    // Use description or alt text as caption
    // BUT if description looks like a date (February 22) or UI text (Notifications),
    // use the views/comments field which often contains the real caption
    let caption = description || altText;
    
    // Check if caption is invalid (date pattern or UI label)
    const isInvalidCaption = (text) => {
      if (!text || text.length < 5) return true;
      // Date pattern: "February 22", "March 15"
      const datePattern = /^(January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2}$/i;
      if (datePattern.test(text)) return true;
      // UI labels
      const uiLabels = ['notifications', 'messages', 'search', 'home', 'profile', 'menu', 'settings'];
      if (uiLabels.includes(text.toLowerCase().trim())) return true;
      return false;
    };
    
    // If caption is invalid, try to get it from views or comments
    if (isInvalidCaption(caption)) {
      // Views field sometimes contains the full post text
      if (views && views.length > 20 && !views.includes('View all') && !views.includes('replies')) {
        caption = views;
      }
      // Comments field often has the caption
      else if (comments && comments.length > 20 && !comments.includes('comments from Facebook')) {
        caption = comments;
      }
    }
    
    // Extract hashtags from block (new format) or parse from caption/altText
    let hashtags = [];
    const hashtagsMatch = block.match(/🏷️\s*Hashtags: (.+)/);
    if (hashtagsMatch) {
      hashtags = hashtagsMatch[1].trim().split(/\s+/).filter(h => h.startsWith('#'));
    }
    // Extract from the (possibly corrected) caption
    if (hashtags.length === 0) {
      hashtags = extractHashtags(caption);
    }
    // Fallback: extract from alt text (where Instagram puts them)
    if (hashtags.length === 0 && altText) {
      hashtags = extractHashtags(altText);
    }
    
    // Extract mentions from block (new format) or parse from caption
    let mentions = [];
    const mentionsMatch = block.match(/💬\s*Mentions: (.+)/);
    if (mentionsMatch) {
      mentions = mentionsMatch[1].trim().split(/\s+/).filter(m => m.startsWith('@'));
    }
    // Fallback: extract from caption
    if (mentions.length === 0) {
      mentions = extractMentions(caption);
    }
    
    // Extract date
    const dateMatch = block.match(/📅\s*Date: (.+)/);
    let dateSaved = new Date().toISOString();
    if (dateMatch) {
      const parsedDate = new Date(dateMatch[1].trim());
      if (!isNaN(parsedDate)) {
        dateSaved = parsedDate.toISOString();
      }
    }
    
    // If creator still unknown, try to find from mentions or text
    if (creator === 'Unknown') {
      if (mentions.length > 0) {
        const mainMention = mentions.find(m => !m.includes('trip.')) || mentions[0];
        creator = mainMention.replace('@', '');
        creatorHandle = mainMention.startsWith('@') ? mainMention : `@${mainMention}`;
      }
      
      // Try to extract from "Cr:" credit line
      const creditMatch = caption.match(/Cr:\s*([\w.]+)/i);
      if (creditMatch) {
        creator = creditMatch[1];
        creatorHandle = `@${creator}`;
      }
    }
    
    // Special cases for known creators
    if (caption.includes('F1') || caption.includes('Formula 1') || hashtags.includes('#f1')) {
      if (creator === 'Unknown') {
        creator = 'f1';
        creatorHandle = '@f1';
      }
    }
    
    if (caption.includes('trip') || caption.includes('travel') || hashtags.some(h => h.includes('trip'))) {
      if (creator === 'Unknown' && mentions.includes('@trip')) {
        creator = 'trip';
        creatorHandle = '@trip';
      }
    }
    
    const reel = {
      id: shortcode,
      shortcode: shortcode,
      url: url,
      creator: creator,
      creatorHandle: creatorHandle,
      caption: caption.replace(/Cr:\s*[\w.]+/i, '').trim(),
      altText: altText,
      hashtags: hashtags,
      mentions: mentions,
      audio: audio,
      likes: likes,
      views: views,
      comments: comments,
      isVideo: true,
      isReel: true,
      dateSaved: dateSaved,
      lastUpdated: new Date().toISOString(),
      tags: autoTag({ caption, altText, hashtags })
    };
    
    reels.push(reel);
  }
  
  return reels;
}

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

    // Index by date
    if (reel.dateSaved) {
      const monthKey = reel.dateSaved.substring(0, 7);
      if (!index.byDate[monthKey]) index.byDate[monthKey] = [];
      if (!index.byDate[monthKey].includes(reel.id)) {
        index.byDate[monthKey].push(reel.id);
      }
    }

    // Index keywords
    const keywords = [
      ...(reel.caption || '').toLowerCase().split(/\s+/),
      ...(reel.altText || '').toLowerCase().split(/\s+/),
      ...(reel.tags || [])
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

function saveIndex(index) {
  fs.writeFileSync(CONFIG.INDEX_PATH, JSON.stringify(index, null, 2));
  console.log(`🔍 Search index updated`);
}

function mergeReels(db, newReels) {
  const existingIds = new Set(db.reels.map(r => r.id));
  let added = 0;
  let updated = 0;

  newReels.forEach(newReel => {
    const existingIndex = db.reels.findIndex(r => r.id === newReel.id);
    
    if (existingIndex === -1) {
      db.reels.push(newReel);
      added++;
    } else {
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

async function main() {
  console.log('⚡ Quick Import - Fast Database Update\n');
  
  // Load existing database
  const db = loadDatabase();
  console.log(`📂 Loaded database with ${db.reels.length} reels`);
  
  // Parse reels from extraction file
  console.log('📄 Parsing extracted reels...');
  const newReels = parseReelsFile();
  console.log(`   Found ${newReels.length} reels in extraction file`);
  
  // Show what was found
  newReels.forEach((reel, i) => {
    console.log(`   ${i + 1}. ${reel.shortcode} - ${reel.creatorHandle} - "${reel.caption.substring(0, 50)}..."`);
  });
  
  // Merge into database
  const result = mergeReels(db, newReels);
  
  // Save database
  saveDatabase(db);
  
  // Build and save index
  const index = buildSearchIndex(db);
  saveIndex(index);
  
  // Print summary
  console.log('\n✅ Import complete!');
  console.log(`   Added: ${result.added} new reels`);
  console.log(`   Updated: ${result.updated} existing reels`);
  console.log(`   Total: ${result.total} reels in database`);
  console.log(`\n🏷️  Hashtags: ${db.stats.totalHashtags}`);
  console.log(`👤 Creators: ${db.stats.totalCreators}`);
  
  // Show all reels
  console.log('\n📊 Current Database Contents:');
  db.reels.forEach((reel, i) => {
    console.log(`   ${i + 1}. [${reel.tags?.slice(0, 3).join(', ') || 'no tags'}] ${reel.creatorHandle} - ${reel.hashtags.slice(0, 3).join(' ')}`);
  });
}

main().catch(console.error);
