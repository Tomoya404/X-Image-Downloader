# X Image Downloader

A lightweight Firefox extension for quickly downloading original-quality images from X/Twitter and preparing video downloads for `yt-dlp`.

**Current version:** 2.3.1  
**Firefox extension ID:** `x-image-downloader@Tomoya404`  
**GitHub:** https://github.com/Tomoya404

## What it does

X Image Downloader adds a small `DL ↓` button to genuine X/Twitter post images. The button requests X's highest available public image variant (`name=orig`) and sends it to Firefox's normal download system.

The extension also includes profile date-range search and video tools for generating ready-to-paste `yt-dlp` commands.

## Features

### Image downloading

- Permanent `DL ↓` button on supported X/Twitter post images.
- Downloads the highest available X image variant.
- Uses your normal Firefox download folder by default.
- Optional **Ask where to save** mode.
- Supports Profile → Media pages.
- Supports X's infinite scrolling.
- Supports images opened in X's multi-image viewer.
- Ignores avatars, profile banners, emoji, interface graphics, and videos.

### Profile date-range search

When you are viewing an X profile:

1. Open the extension popup.
2. Choose **From** and **To** dates.
3. Click **Search Date Range**.

The extension opens X's media-filtered **Latest** search results immediately to the right of your current tab.

### Video tools

For an X post containing a video, the popup shows:

**Copy yt-dlp command**

Example:

```powershell
yt-dlp "https://x.com/user/status/123456789"
```

The extension does not download videos itself and does not launch local programs.

### Batch video workflow

Firefox lets you Ctrl/Shift-select multiple tabs.

When multiple selected X tabs contain videos, the extension can generate a text file containing one status URL per line:

```text
https://x.com/user/status/111
https://x.com/user/status/222
https://x.com/user/status/333
```

After saving the file, the popup shows a compact command such as:

```powershell
yt-dlp -a "xdl-batch-2026-09-28-040000.txt"
```

Open PowerShell in the folder containing the text file, copy the command from the extension, paste it, and press Enter.

Nothing is copied automatically.

## Download behavior

The popup provides two modes:

- **Use Firefox download folder** — default; one-click image downloads.
- **Ask where to save** — Firefox opens its Save As dialog for each image.

Firefox extensions cannot silently choose and permanently use an arbitrary Windows folder outside Firefox's configured download location.

## Diagnostics

X changes its frontend frequently, so the extension includes an optional diagnostics system under **About**.

Debug logging is **off by default**.

When enabled, it stores a small bounded log locally in Firefox extension storage. The log can include:

- extension version
- X page route
- image/video selector counts
- video-detection results
- download errors
- extension state changes

It does **not** collect:

- X cookies
- Bearer tokens
- CSRF tokens
- guest tokens
- passwords
- authentication credentials

Use **Copy debug report** when a future X layout change breaks detection. The report is copied to your clipboard only when you explicitly press the button.

## Privacy

The extension has no analytics, telemetry, server, account system, or cloud component.

Normal extension operation stays inside Firefox and X/Twitter's public media URLs.

## Permissions

- `downloads` — save images and generated batch URL-list files.
- `storage` — remember extension settings and optional local debug logs.
- `tabs` — inspect the active/highlighted X tabs and open date-search results beside the current tab.
- `clipboardWrite` — copy ready-made `yt-dlp` commands and debug reports when requested.
- `scripting` — inspect the current X tab for video-player elements.

Host access is limited to X/Twitter pages and `pbs.twimg.com` image media.

## Project structure

```text
X-Image-Downloader/
├── README.md
├── CHANGELOG.md
└── firefox-extension/
    ├── manifest.json
    ├── background.js
    ├── content.js
    ├── styles.css
    ├── popup/
    │   ├── popup.html
    │   ├── popup.css
    │   └── popup.js
    └── icons/
```

`content.js` handles X page image detection and `DL ↓` buttons.

`background.js` handles Firefox downloads, settings, and optional local diagnostics.

The popup handles download preferences, date-range search, video detection, batch URL-list generation, and command copying.

## Temporary installation for testing

1. Extract the release ZIP.
2. Open Firefox.
3. Go to `about:debugging`.
4. Select **This Firefox**.
5. Remove the previous temporary X Image Downloader build if necessary.
6. Click **Load Temporary Add-on...**
7. Select `firefox-extension/manifest.json`.
8. Reload existing X/Twitter tabs.

Temporary add-ons are removed when Firefox fully restarts. A signed `.xpi` will be used for permanent installation later.
