---
name: instagram-login
description: Login to Instagram using provided credentials, capture screenshots of feed/profile, and extract saved reels collection. Use when the user wants to log into Instagram, view their feed, take screenshots, extract saved reels with links and descriptions, or automate Instagram login tasks.
---

# Instagram Login Skill

Automate Instagram interactions with session persistence, screenshots, and saved reels extraction.

## Features

- 🔐 **Persistent Login** - Save session cookies, stay logged in across runs
- 📸 **Screenshots** - Capture feed, profile, or saved posts
- 🎬 **Saved Reels** - Extract all saved reels with links, descriptions & metadata
- 🔍 **Search Index** - Full-text search across your saved reels

---

## Quick Start

### 1. First Time Setup

```bash
# Save credentials and create persistent session
node scripts/instagram-login.js --save <username> <password>
```

### 2. Use Saved Session

```bash
# Take screenshot (instant, no login needed!)
node scripts/instagram-login.js --use-saved

# Extract saved reels
node scripts/instagram-saved-reels.js --use-saved

# Check session status
node scripts/instagram-login.js --check-session
```

### 3. Voice Shortcuts (Auto-Trigger)

When you say these phrases, the system **automatically** runs the full update:

| You Say | System Runs |
|---------|-------------|
| "Update my reel list" | 1. Extract reels → 2. Import to database |
| "Show my saved reels" | Same as above + display results |
| "What's my saved reel" | Same as above + search/display |
| "Get my Instagram saved" | Same as above |

**What happens:**
```bash
# Step 1: Extract from Instagram
node scripts/instagram-saved-reels.js --use-saved

# Step 2: Fast import to database (~2 seconds)
node scripts/quick-import.js

# Step 3: (Optional) Search or display
node scripts/search-reels.js stats
```

**No confirmation needed** — these phrases trigger the full workflow automatically.

---

## Commands

### Login & Screenshots

| Command | Description |
|---------|-------------|
| `node scripts/instagram-login.js --save <user> <pass>` | Save credentials & session |
| `node scripts/instagram-login.js --use-saved [path]` | Use saved session, take screenshot |
| `node scripts/instagram-login.js --check-session` | Check if session is valid |
| `node scripts/instagram-login.js --use-saved --force-login` | Force fresh login |
| `node scripts/instagram-login.js --clear` | Delete all saved data |

### Saved Reels Extraction

| Command | Description |
|---------|-------------|
| `node scripts/instagram-saved-reels.js --use-saved` | Extract all saved reels |
| `node scripts/instagram-saved-reels.js --use-saved [path]` | Custom output path |
| `node scripts/instagram-saved-reels.js --use-saved --force-login` | Force re-login |

### Reels Indexing & Database

| Command | Description |
|---------|-------------|
| `node scripts/reels-indexer.js sync <username>` | Full sync: extract + index all reels |
| `node scripts/reels-indexer.js index` | Index existing reels file to database |
| `node scripts/quick-import.js` | Fast import from text export to JSON DB |
| `node scripts/search-reels.js search <keyword>` | Full-text search |
| `node scripts/search-reels.js hashtag <tag>` | Search by hashtag |
| `node scripts/search-reels.js creator <name>` | Search by creator |
| `node scripts/search-reels.js stats` | Show database stats |
| `node scripts/search-reels.js all` | List all saved reels |

---

## Reels Indexing Workflow

The indexing system creates a searchable database of your saved reels with full metadata.

### Scripts Explained

| Script | Purpose | When to Use |
|--------|---------|-------------|
| `instagram-saved-reels.js` | Extracts reels from Instagram, saves to `MY_SAVED_REELS.txt` | When you want raw text export |
| `reels-indexer.js` | Full workflow: extracts + indexes reels with metadata | For complete database sync |
| `quick-import.js` | Fast import from `MY_SAVED_REELS.txt` to JSON database (~2 sec) | When you already have the text file |
| `search-reels.js` | Search the indexed database | To find reels by keyword/hashtag |

### Typical Workflow

**Option 1: Quick Import (Fast)**
```bash
# Extract reels to text file
node scripts/instagram-saved-reels.js --use-saved

# Import to JSON database (~2 seconds)
node scripts/quick-import.js

# Search your reels
node scripts/search-reels.js search "gym"
```

**Option 2: Full Sync (Recommended)**
```bash
# Complete sync: extract + index with full metadata
node scripts/reels-indexer.js sync your_username

# Check database stats
node scripts/search-reels.js stats

# Search by hashtag
node scripts/search-reels.js hashtag "fitness"
```

### Database Features

- **Metadata captured:** Captions, hashtags, creators, dates, likes, views, audio
- **Hashtag extraction:** Automatically extracts hashtags from alt text
- **Full-text search:** Search captions, tags, descriptions
- **Auto-sync:** Daily sync via cron job at 3:00 PM IST

---

## File Locations

| File | Path |
|------|------|
| Screenshots | `/home/picoclaw/.picoclaw/workspace/instagram_screenshot/instagram_feed.png` |
| Saved Reels Export | `/home/picoclaw/.picoclaw/workspace/instagram_screenshot/MY_SAVED_REELS.txt` |
| Reels Database | `/home/picoclaw/.picoclaw/workspace/instagram_screenshot/reels_database.json` |
| Reels Search Index | `/home/picoclaw/.picoclaw/workspace/instagram_screenshot/reels_index.json` |
| Session Cookies | `skills/instagram-login/.cookies.json` |
| Credentials | `skills/instagram-login/.credentials.json` |
| Scripts | `skills/instagram-login/scripts/*.js` |

---

## Session Details

- **Duration:** 30 days (auto-refreshed on use)
- **Storage:** Plain JSON, file permissions 0o600
- **Security:** Gitignored, user-readable only
- **Auto-Sync:** Daily sync at 3:00 PM IST (cron job)

---

## Requirements

### Prerequisites

| Requirement | Version/Details | Install Command |
|-------------|-----------------|-----------------|
| **Node.js** | v16+ (v18+ recommended) | `node --version` |
| **npm** | v8+ | `npm --version` |
| **Playwright** | Latest | `npm install -g @playwright/test` |
| **Chromium Browser** | Auto-downloaded | `npx playwright install chromium` |

### Step-by-Step Installation

```bash
# 1. Verify Node.js is installed (must be v16+)
node --version

# 2. If not installed, get it from: https://nodejs.org/

# 3. Install Playwright browsers (REQUIRED - one time setup)
npx playwright install chromium

# 4. Verify installation
npx playwright --version
```

### System Dependencies

**Ubuntu/Debian:**
```bash
sudo apt-get update
sudo apt-get install -y libnss3 libatk-bridge2.0-0 libxss1 libgtk-3-0
```

**macOS:** No additional dependencies needed.

**Windows:** No additional dependencies needed (WSL recommended).

### Disk Space

| Component | Space Required |
|-----------|----------------|
| Chromium (~170MB) | ~170 MB |
| Session files | ~10 KB |
| Screenshots | ~500 KB each |
| Reels database | ~50 KB per 100 reels |

**Total recommended:** 500 MB free space

### File Permissions

The script requires:
- **Read/Write** access to `skills/instagram-login/` directory
- **Read/Write** access to `/home/picoclaw/.picoclaw/workspace/instagram_screenshot/`
- **Create files** permission for `.cookies.json` and `.credentials.json`

### Network Requirements

- Stable internet connection
- Access to `instagram.com` domains
- No VPN/proxy blocking Instagram (may trigger security checks)

---

## Troubleshooting

| Issue | Solution |
|-------|----------|
| Browser launch fails | Run `npx playwright install chromium` |
| Login fails | Check credentials, may need CAPTCHA |
| Blank screenshot | Increase wait time or check for redirect |
| Session expired | Use `--force-login` to refresh |
| 2FA not supported | Disable 2FA or use backup codes |

---

## Important Notes

1. **Security:** Never commit credentials. Files start with `.` and are gitignored.
2. **Rate Limiting:** Instagram may block excessive login attempts.
3. **2FA:** Not supported by this automation.
4. **Session Persistence:** Use `--check-session` to verify status before operations.
5. **Auto-Trigger Phrases:** Saying "update my reel list", "show my saved reels", "what's my saved reel", or "get my Instagram saved" automatically runs extraction + import without asking for confirmation.
