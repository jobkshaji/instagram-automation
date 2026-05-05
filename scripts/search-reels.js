#!/usr/bin/env node
/**
 * Quick Search Tool for Saved Reels
 * Simple wrapper for common searches
 */

const fs = require('fs');
const path = require('path');

const DB_PATH = '/home/picoclaw/.picoclaw/workspace/instagram_screenshot/reels_database.json';
const INDEX_PATH = '/home/picoclaw/.picoclaw/workspace/instagram_screenshot/reels_index.json';

function loadDatabase() {
  try {
    return JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
  } catch (e) {
    console.error('❌ Error loading database:', e.message);
    process.exit(1);
  }
}

function loadIndex() {
  try {
    return JSON.parse(fs.readFileSync(INDEX_PATH, 'utf8'));
  } catch (e) {
    return null;
  }
}

function searchReels(db, query) {
  const lowerQuery = query.toLowerCase();
  return db.reels.filter(reel => {
    const searchable = [
      reel.caption,
      reel.altText,
      reel.creator,
      reel.creatorHandle,
      reel.audio,
      ...reel.hashtags,
      ...reel.mentions,
      ...(reel.tags || [])
    ].filter(Boolean).join(' ').toLowerCase();
    return searchable.includes(lowerQuery);
  });
}

function searchByHashtag(db, hashtag) {
  const tag = hashtag.toLowerCase().startsWith('#') ? hashtag.toLowerCase() : `#${hashtag.toLowerCase()}`;
  return db.reels.filter(reel => reel.hashtags.includes(tag));
}

function searchByCreator(db, creator) {
  const lowerCreator = creator.toLowerCase().replace('@', '');
  return db.reels.filter(reel => 
    reel.creator?.toLowerCase().includes(lowerCreator) ||
    reel.creatorHandle?.toLowerCase().includes(lowerCreator)
  );
}

function searchByTag(db, tag) {
  const lowerTag = tag.toLowerCase();
  return db.reels.filter(reel => 
    reel.tags?.some(t => t.toLowerCase().includes(lowerTag))
  );
}

function displayReel(reel, index) {
  console.log(`\n${index + 1}. 🎬 ${reel.creatorHandle || '@' + reel.creator || '@Unknown'}`);
  console.log(`   ${reel.caption?.substring(0, 120) || reel.altText?.substring(0, 120) || 'No description'}${(reel.caption?.length > 120 || reel.altText?.length > 120) ? '...' : ''}`);
  console.log(`   🔗 ${reel.url}`);
  if (reel.hashtags?.length > 0) {
    console.log(`   🏷️  ${reel.hashtags.slice(0, 6).join(' ')}${reel.hashtags.length > 6 ? '...' : ''}`);
  }
  if (reel.tags?.length > 0) {
    console.log(`   🏷️  Tags: ${reel.tags.slice(0, 4).join(', ')}${reel.tags.length > 4 ? '...' : ''}`);
  }
}

function showStats(db) {
  console.log('\n📊 REELS DATABASE STATISTICS');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log(`Total Reels:      ${db.stats.totalReels}`);
  console.log(`Unique Creators:  ${db.stats.totalCreators}`);
  console.log(`Unique Hashtags:  ${db.stats.totalHashtags}`);
  console.log(`Last Sync:        ${db.stats.lastSync ? new Date(db.stats.lastSync).toLocaleString() : 'Never'}`);
  console.log(`Database Version: ${db.version}`);
  console.log(`Username:         @${db.metadata.username}`);
  console.log('═══════════════════════════════════════════════════════════════\n');
}

function showTags(db) {
  const index = loadIndex();
  if (!index) {
    console.log('❌ No search index found');
    return;
  }
  
  console.log('\n🏷️ HASHTAGS IN YOUR COLLECTION');
  console.log('═══════════════════════════════════════════════════════════════');
  index.allHashtags.forEach(tag => {
    const count = index.byHashtag[tag]?.length || 0;
    console.log(`  ${tag.padEnd(20)} ${count} reel${count !== 1 ? 's' : ''}`);
  });
  console.log('═══════════════════════════════════════════════════════════════');
  console.log(`Total: ${index.allHashtags.length} hashtags\n`);
}

function showCreators(db) {
  const index = loadIndex();
  if (!index) {
    console.log('❌ No search index found');
    return;
  }
  
  console.log('\n👤 CREATORS IN YOUR COLLECTION');
  console.log('═══════════════════════════════════════════════════════════════');
  index.allCreators.forEach(creator => {
    const count = index.byCreator[creator]?.length || 0;
    console.log(`  @${creator.padEnd(20)} ${count} reel${count !== 1 ? 's' : ''}`);
  });
  console.log('═══════════════════════════════════════════════════════════════');
  console.log(`Total: ${index.allCreators.length} creators\n`);
}

function showAll(db) {
  console.log(`\n📱 ALL SAVED REELS (${db.reels.length})`);
  console.log('═══════════════════════════════════════════════════════════════');
  db.reels.forEach((reel, i) => displayReel(reel, i));
  console.log('\n═══════════════════════════════════════════════════════════════\n');
}

// Main
const args = process.argv.slice(2);
const command = args[0];
const query = args.slice(1).join(' ');

const db = loadDatabase();

switch (command) {
  case 'search':
  case 's':
    if (!query) {
      console.log('Usage: search-reels search <keyword>');
      process.exit(1);
    }
    const results = searchReels(db, query);
    console.log(`\n🔍 Found ${results.length} reel${results.length !== 1 ? 's' : ''} for "${query}":`);
    results.forEach((reel, i) => displayReel(reel, i));
    if (results.length === 0) {
      console.log('\n💡 Try searching with different keywords or check available hashtags with: search-reels tags');
    }
    console.log('');
    break;

  case 'hashtag':
  case 'h':
    if (!query) {
      console.log('Usage: search-reels hashtag <tag>');
      process.exit(1);
    }
    const tagResults = searchByHashtag(db, query);
    console.log(`\n🏷️ Found ${tagResults.length} reel${tagResults.length !== 1 ? 's' : ''} with #${query.replace('#', '')}:`);
    tagResults.forEach((reel, i) => displayReel(reel, i));
    console.log('');
    break;

  case 'creator':
  case 'c':
    if (!query) {
      console.log('Usage: search-reels creator <username>');
      process.exit(1);
    }
    const creatorResults = searchByCreator(db, query);
    console.log(`\n👤 Found ${creatorResults.length} reel${creatorResults.length !== 1 ? 's' : ''} by @${query.replace('@', '')}:`);
    creatorResults.forEach((reel, i) => displayReel(reel, i));
    console.log('');
    break;

  case 'tag':
  case 't':
    if (!query) {
      console.log('Usage: search-reels tag <category>');
      console.log('Examples: gym, funny, education, sports');
      process.exit(1);
    }
    const categoryResults = searchByTag(db, query);
    console.log(`\n🏷️ Found ${categoryResults.length} reel${categoryResults.length !== 1 ? 's' : ''} tagged with "${query}":`);
    categoryResults.forEach((reel, i) => displayReel(reel, i));
    console.log('');
    break;

  case 'stats':
    showStats(db);
    break;

  case 'tags':
    showTags(db);
    break;

  case 'creators':
    showCreators(db);
    break;

  case 'all':
    showAll(db);
    break;

  case 'help':
  default:
    console.log('\n🎬 REELS SEARCH TOOL');
    console.log('═══════════════════════════════════════════════════════════════');
    console.log('\nCommands:');
    console.log('  search, s <keyword>     Search by any keyword');
    console.log('  hashtag, h <tag>        Search by hashtag (with or without #)');
    console.log('  creator, c <username>   Search by creator username');
    console.log('  tag, t <category>       Search by category tag');
    console.log('  stats                   Show database statistics');
    console.log('  tags                    List all hashtags');
    console.log('  creators                List all creators');
    console.log('  all                     Show all saved reels');
    console.log('  help                    Show this help message');
    console.log('\nExamples:');
    console.log('  search-reels search gym');
    console.log('  search-reels h fitness');
    console.log('  search-reels c formula1');
    console.log('  search-reels tag funny');
    console.log('═══════════════════════════════════════════════════════════════\n');
}
