# Instagram Automation 🎬

Browser automation for Instagram with persistent login, screenshots, and intelligent saved reels extraction with full-text search indexing.


---

## ✨ Features

| Feature | Description |
|---------|-------------|
| 🔐 **Persistent Login** | One-time login, auto-restores session for 30 days |
| 📸 **Screenshots** | Capture feed, profile, or saved posts |
| 🎬 **Saved Reels Extraction** | Export all saved reels with links, captions, hashtags |
| 🔍 **Full-Text Search** | Search across captions, hashtags, creators |
| 🗄️ **JSON Database** | Structured storage with metadata indexing |
| ⚡ **Voice Shortcuts** | Auto-trigger workflows with natural phrases |
| 🔄 **Auto-Sync** | Daily sync via cron job at 3:00 PM IST |

---

## 🚀 Quick Start

### Prerequisites

```bash
# Install Playwright browsers (one-time setup)
npx playwright install chromium
```

### 1. Save Credentials & Login

```bash
# First time: save credentials and create persistent session
node scripts/instagram-login.js --save <username> <password>
```

### 2. Use Saved Session (Instant!)

```bash
# Take screenshot (no login needed!)
node scripts/instagram-login.js --use-saved

# Extract saved reels
node scripts/instagram-saved-reels.js --use-saved
```

### 3. Sync to Database

```bash
# Fast import to searchable database (~2 seconds)
node scripts/quick-import.js

# Or full sync with metadata extraction
node scripts/reels-indexer.js sync <username>
```

---

## 🗣️ Voice Shortcuts (Auto-Trigger)

Say these phrases to trigger workflows **automatically** without confirmation:

| Phrase | Action |
|--------|--------|
| "Update my reel list" | Extract reels + sync database |
| "Show my saved reels" | Same as above + display results |
| "What's my saved reel" | Same as above + search/display |
| "Get my Instagram saved" | Same as above |

**What happens automatically:**
```bash
# Step 1: Extract from Instagram
node scripts/instagram-saved-reels.js --use-saved

# Step 2: Import to database
node scripts/quick-import.js

# Step 3: Display stats
node scripts/search-reels.js stats
```

---

## 📚 Available Scripts

### Login & Screenshots

| Command | Description |
|---------|-------------|
| `node scripts/instagram-login.js --save <user> <pass>` | Save credentials & create session |
| `node scripts/instagram-login.js --use-saved [path]` | Use saved session, take screenshot |
| `node scripts/instagram-login.js --check-session` | Check if session is valid |
| `node scripts/instagram-login.js --force-login` | Force fresh login |
| `node scripts/instagram-login.js --clear` | Delete all saved data |

### Saved Reels Extraction

| Command | Description |
|---------|-------------|
| `node scripts/instagram-saved-reels.js --use-saved` | Extract all saved reels to text file |
| `node scripts/instagram-saved-reels.js --use-saved [path]` | Custom output path |
| `node scripts/instagram-saved-reels.js --force-login` | Force re-login |

### Reels Indexing & Database

| Command | Description |
|---------|-------------|
| `node scripts/reels-indexer.js sync <username>` | Full sync: extract + index all reels |
| `node scripts/reels-indexer.js index` | Index existing text file to JSON DB |
| `node scripts/quick-import.js` | Fast import from text to JSON (~2 sec) |

### Search Commands

| Command | Description |
|---------|-------------|
| `node scripts/search-reels.js search <keyword>` | Full-text search in captions |
| `node scripts/search-reels.js hashtag <tag>` | Search by hashtag |
| `node scripts/search-reels.js creator <name>` | Search by creator |
| `node scripts/search-reels.js tag <category>` | Search by category tag |
| `node scripts/search-reels.js stats` | Show database statistics |
| `node scripts/search-reels.js all` | List all saved reels |
| `node scripts/search-reels.js tags` | List all hashtags |

---

## 📁 File Structure

```
instagram-automation/
├── scripts/
│   ├── instagram-login.js           # Login & screenshot
│   ├── instagram-persistent.js      # Persistent session handler
│   ├── instagram-saved-reels.js     # Reels extraction
│   ├── reels-indexer.js             # Database indexer
│   ├── search-reels.js              # Search tool
│   ├── quick-import.js              # Fast database import
│   ├── interactive-login.js         # Interactive login flow
│   └── example_screenshot.png       # Example output
├── .cookies.json                     # Session cookies (auto-generated)
├── .credentials.json                 # Saved credentials (auto-generated)
├── SKILL.md                          # Skill documentation
└── README.md                         # This file

# Output files (in workspace/instagram_screenshot/):
# ├── instagram_feed.png             # Screenshot output
# ├── MY_SAVED_REELS.txt             # Extracted reels list
# ├── reels_database.json            # Indexed database
# └── reels_index.json               # Search index
```

---

## 🔍 Example Workflow

### Quick Daily Update

```bash
# 1. Extract reels (uses saved session)
node scripts/instagram-saved-reels.js --use-saved

# 2. Import to database
node scripts/quick-import.js

# 3. Search for "gym" reels
node scripts/search-reels.js search gym
```

### Full Sync with Metadata

```bash
# Complete sync: extract + index with full metadata
node scripts/reels-indexer.js sync your_username

# Check stats
node scripts/search-reels.js stats

# Search by hashtag
node scripts/search-reels.js hashtag fitness
```

---

## 📝 Example Output

### MY_SAVED_REELS.txt
```
Reel #1
Link: https://www.instagram.com/reel/ABC123DEF/
Caption: "Amazing gym workout routine 💪🔥"
Creator: @fitness_guru
Likes: 15.2K | Views: 245K | Comments: 342
Audio: Original Audio
Hashtags: #fitness #gym #workout #motivation
---

Reel #2
Link: https://www.instagram.com/reel/XYZ789ABC/
Caption: "Travel vlog: Hidden gems in Bali 🌴"
Creator: @travel_diaries
Likes: 45K | Views: 890K | Comments: 1.2K
Audio: Summer Vibes
Hashtags: #travel #bali #wanderlust #vacation
---
```

### Search Results
```bash
$ node scripts/search-reels.js search gym

Found 3 reel(s):

1. Amazing gym workout routine 💪🔥
   Link: https://www.instagram.com/reel/ABC123DEF/
   Hashtags: #fitness #gym #workout #motivation
   Creator: @fitness_guru

2. Home workout, no equipment needed 💪
   Link: https://www.instagram.com/reel/GHI456JKL/
   Hashtags: #homeworkout #gym #fitness
   Creator: @home_fitness
```

---

## 🔒 Security

**⚠️ IMPORTANT:**

| File | Contents | Gitignored? |
|------|----------|-------------|
| `.cookies.json` | Session tokens | ✅ Yes |
| `.credentials.json` | Login credentials | ✅ Yes |
| `instagram_auth.json` | Session data | ✅ Yes |
| `instagram_cookies.json` | Cookies | ✅ Yes |

- All auth files are **automatically gitignored**
- Files use **0o600 permissions** (user-readable only)
- **Never commit** these files to GitHub
- Sessions last **30 days** and auto-refresh

---

## ⚠️ Disclaimer

This tool is for **educational and personal use only**.

Automating Instagram may violate their [Terms of Service](https://help.instagram.com/581066165581870). Use at your own risk. The authors are not responsible for any account restrictions, bans, or other consequences.

**Known Limitations:**
- Two-factor authentication (2FA) is **not supported**
- Excessive use may trigger rate limiting
- Instagram may require CAPTCHA verification

---

## 🛠️ Troubleshooting

| Issue | Solution |
|-------|----------|
| Browser launch fails | Run `npx playwright install chromium` |
| Login fails | Check credentials, may need CAPTCHA |
| Session expired | Use `--force-login` to refresh |
| Blank screenshot | Increase wait time or check connection |
| 2FA prompt | Disable 2FA on account or use backup codes |

---

## 📜 License

[MIT](LICENSE) © 2026

---

## 🤝 Contributing

PRs welcome! Please ensure:
1. Code follows existing style
2. Update documentation for new features
3. Test with `--use-saved` session

---

## 💡 Pro Tips

- 💾 **First run** will save session, subsequent runs are instant
- ⏰ **Schedule daily sync**: Set up cron job for `reels-indexer.js sync`
- 🚀 **Fastest workflow**: `instagram-saved-reels.js` → `quick-import.js`
- 🔍 **Best search**: Use `search-reels.js` (not browsing Instagram directly)
- 🕵️ **Headless mode**: All scripts run headless by default (no GUI)

---

*Built with [Playwright](https://playwright.dev/) and ❤️*
