# X Image Downloader

A lightweight Firefox extension for one-click original-quality X/Twitter image downloads, date-range profile search, and convenient `yt-dlp` video workflows.

## Features

### Image downloading

- Adds a compact `DL ↓` button to supported X/Twitter post images.
- Requests X's highest publicly available image variant using `name=orig`.
- Uses Firefox's normal download system.
- Supports **Profile → Media** pages.
- Supports X's infinite scrolling.
- Supports images opened in X's multi-image viewer.
- Ignores avatars, profile banners, emoji, interface graphics, and video players.

### Download behavior

The extension provides two image-download modes:

- **Use Firefox download folder** — one-click downloads to Firefox's configured download location.
- **Ask where to save** — Firefox opens its Save As dialog for each image.

### Profile date-range search

When viewing an X profile:

1. Open the extension popup.
2. Choose **From** and **To** dates.
3. Click **Search Date Range**.

The extension opens media-filtered results in X's **Latest** search view in a new tab immediately beside the current tab.

### Video tools

For an X post containing a video, the extension provides a ready-to-use `yt-dlp` command:

```powershell
yt-dlp "https://x.com/user/status/123456789"
```

The extension does not download videos itself and does not launch external programs.

### Batch video workflow

Firefox allows multiple tabs to be selected with Ctrl/Shift.

When multiple selected X tabs contain videos, the extension can generate a `.txt` file containing one status URL per line:

```text
https://x.com/user/status/111
https://x.com/user/status/222
https://x.com/user/status/333
```

After saving the file, the popup shows a compact batch command:

```powershell
yt-dlp -a "xdl-batch-2026-09-28-040000.txt"
```

Open PowerShell in the folder containing the `.txt` file, copy the command from the extension, paste it, and press Enter.

Nothing is copied or executed automatically.

## Requirements

- Firefox 115 or newer.
- An X/Twitter account only when X itself requires login.
- `yt-dlp` is optional and only needed for the video-command workflow.

## Diagnostics

X changes its frontend frequently, so the extension includes an optional diagnostics system under **About**.

Debug logging is **off by default**.

When enabled, the extension stores a small bounded local log in Firefox extension storage. It can include:

- extension version
- current X route
- image/video selector counts
- video-detection results
- download errors
- extension state changes

Debug logs never intentionally include cookies, passwords, authentication tokens, or authorization headers.

Use **Copy debug report** when reporting a detection problem.

## Privacy

X Image Downloader has:

- no analytics
- no telemetry
- no advertising
- no remote server
- no cloud account
- no external data collection

Normal extension operation stays inside Firefox and X/Twitter's public page/media URLs.

## Permissions

The extension uses the following Firefox permissions:

- `downloads` — saves images and generated batch URL-list files.
- `storage` — remembers extension settings and optional local debug logs.
- `tabs` — inspects active/highlighted X tabs and opens date-search results beside the current tab.
- `clipboardWrite` — copies `yt-dlp` commands and debug reports when requested.
- `scripting` — inspects the current X tab for video-player elements.

Host access is limited to X/Twitter pages and `pbs.twimg.com` image media.

## Project structure

```text
X-Image-Downloader/
├── README.md
├── CHANGELOG.md
├── LICENSE
├── AI-MAINTENANCE-GUIDE.md
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

### Main files

- `content.js` — detects supported X images, injects `DL ↓` buttons, handles infinite scrolling and viewer changes.
- `background.js` — validates download requests, normalizes image URLs, starts Firefox downloads, stores settings, and manages optional debug logs.
- `popup.js` — handles download preferences, profile/date search, video detection, selected-tab batch tools, command copying, and diagnostics.
- `manifest.json` — Firefox extension metadata, permissions, version, and permanent extension ID.

Permanent Firefox extension ID:

```text
x-image-downloader@Tomoya404
```

## Development installation

To test the source directly in Firefox:

1. Clone or download this repository.
2. Open Firefox.
3. Go to `about:debugging`.
4. Select **This Firefox**.
5. Click **Load Temporary Add-on...**
6. Select `firefox-extension/manifest.json`.
7. Reload any existing X/Twitter tabs.

Temporary add-ons are removed when Firefox fully restarts.

## Bug reports

If X changes its layout and image or video detection stops working:

1. Open the extension popup.
2. Expand **About**.
3. Enable **Debug logging**.
4. Reproduce the problem.
5. Click **Copy debug report**.
6. Include the report when opening an issue.

Please remove any information you do not want to share before posting a debug report publicly.

## License

This project is licensed under the [MIT License](LICENSE).

## Author

**Tomoya404**

GitHub: https://github.com/Tomoya404

