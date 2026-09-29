# Changelog

## 2.3.1

- AMO release-preparation update only; no functional changes.
- Added Mozilla-required `browser_specific_settings.gecko.data_collection_permissions`.
- Declares `required: ["none"]` because the extension does not collect or transmit user data.
- Permanent Firefox extension ID remains `x-image-downloader@Tomoya404`.
- Prepared a clean AMO upload package with `manifest.json` at ZIP root.

## 2.3.0

- Added clearer image-download failure messages.
- Image download failures now show a temporary on-page error notification instead of only `ERR`.
- Added optional debug logging under **About**.
- Added **Copy debug report** with live X selector/video diagnostics.
- Added **Clear log**.
- Debug logging is off by default and stored only in Firefox extension storage.
- Debug logs are bounded to the most recent 250 events.
- Replaced the old README with a complete project README.
- Removed the obsolete `docs/` folder.
- Removed the duplicate `firefox-extension/README.md`.
- Removed outdated helper/native-messaging discussion from project documentation.
- Preserved image success `✓`, video tools, fixed calendar, date search, batch URL list, and permanent ID `x-image-downloader@Tomoya404`.

## 2.2.1

- Fixed batch `.txt` download failure caused by Firefox blocking `data:` URLs in `downloads.download()`.
- Batch text export now uses a Blob/Object URL.
- Removed URL-inline batch command generation.
- Batch command now uses yt-dlp batch-file mode: `yt-dlp -a "filename.txt"`.
- Added compact one-line batch command field shown after URL-list creation.
- Added separate manual Copy button.
- No automatic clipboard copying.
- Preserved permanent ID `x-image-downloader@Tomoya404`.

## 2.2.0

- Added **Download URL List (.txt)** for selected X video tabs.
- Batch text files contain one status URL per line and save through Firefox Downloads.
- Kept **Copy batch command** as a separate manual action.
- No automatic clipboard copying.
- Kept the batch UI compact; no command-preview/comment box.
- Added a collapsed **About** section.
- About shows the live extension version.
- Added GitHub profile link: `https://github.com/Tomoya404`.
- Changed the permanent Firefox extension ID to `x-image-downloader@Tomoya404`.
- Preserved v2.1.3 direct live-tab video detection.
- Preserved image downloading, date-range search, and the fixed custom calendar.

## 2.1.3

- Rebuilt video detection around direct live-tab DOM inspection.
- Added Firefox `scripting` permission for contextual video detection.
- Detects `videoPlayer`, `videoComponent`, `videoPlayerControls`,
  `videoPlayerOverlay`, visible `<video>` nodes, video thumbnail URLs,
  playback-time text, and video controls.
- Uses the same detection for selected-tab batch yt-dlp commands.
- Preserved all image and date-range functionality.

## 2.1.2

- Renamed the date-search button to **Search Date Range**.
- Search still opens X's **Latest** result category.
- Strengthened video detection for X's current video-player layout.
- Detects video/player data-testid values, video thumbnails, visible video elements,
  playback sliders, and current/total playback-time controls.
- Added short popup retries for lazily mounted X video players.
- Preserved the fixed custom calendar and all image-download behavior.

## 2.1.1

- Date-range profile searches now open X's **Latest** results tab (`f=live`).
- Kept `filter:media` so date-range results remain media posts.
- Renamed the popup action to **Search Latest**.
- Preserved the custom fixed date picker and all v2.1.0 functionality.

## 2.1.0

- Converted the project back to a pure Firefox extension.
- Removed Native Messaging and all helper code.
- Removed the arbitrary custom-folder option.
- Removed direct yt-dlp execution.
- Removed the `nativeMessaging` permission.
- Set final extension ID to `x-image-downloader@haru`.
- Kept Firefox-folder and Ask-where-to-save modes in a compact dropdown.
- Kept profile date-range Media search.
- Kept adjacent-tab opening for search results.
- Kept ready-made single yt-dlp command copying.
- Kept selected-tab batch yt-dlp command copying.
- Preserved the working v2 image detector and v2.0.2 video detection logic.
