"use strict";

(() => {
  if (window.__XDL_011_LOADED__) return;
  window.__XDL_011_LOADED__ = true;

  const PHOTO_CONTAINER = '[data-testid="tweetPhoto"]';
  const MEDIA_IMG = 'img[src*="pbs.twimg.com/media/"], img[srcset*="pbs.twimg.com/media/"]';
  const MEDIA_STYLE = '[style*="pbs.twimg.com/media/"]';
  const BUTTON_CLASS = "xdl-download-button";
  const HOST_CLASS = "xdl-overlay-host";

  let enabled = true;
  let debugEnabled = false;
  let lastPath = location.pathname;

  function validMediaUrl(raw) {
    if (!raw) return null;
    try {
      const url = new URL(raw, location.href);
      if (
        url.protocol === "https:" &&
        url.hostname === "pbs.twimg.com" &&
        url.pathname.startsWith("/media/")
      ) {
        return url.toString();
      }
    } catch {}
    return null;
  }

  function urlFromImage(img) {
    if (!(img instanceof HTMLImageElement)) return null;

    for (const raw of [img.currentSrc, img.src]) {
      const valid = validMediaUrl(raw);
      if (valid) return valid;
    }

    const srcset = img.getAttribute("srcset") || "";
    for (const part of srcset.split(",")) {
      const raw = part.trim().split(/\s+/)[0];
      const valid = validMediaUrl(raw);
      if (valid) return valid;
    }

    return null;
  }

  function urlFromBackground(el) {
    if (!(el instanceof Element)) return null;

    const values = [
      el.getAttribute("style") || "",
      getComputedStyle(el).backgroundImage || ""
    ];

    for (const value of values) {
      const matches = value.match(/https:\/\/pbs\.twimg\.com\/media\/[^"'()\s]+/g) || [];
      for (const raw of matches) {
        const cleaned = raw.replace(/&amp;/g, "&");
        const valid = validMediaUrl(cleaned);
        if (valid) return valid;
      }
    }
    return null;
  }

  function extractMediaUrl(host) {
    if (!host) return null;

    if (host instanceof HTMLImageElement) {
      const direct = urlFromImage(host);
      if (direct) return direct;
    }

    const images = [];
    if (host.matches?.(MEDIA_IMG)) images.push(host);
    host.querySelectorAll?.(MEDIA_IMG).forEach(img => images.push(img));

    // Prefer a large visible image when there are several candidates.
    images.sort((a, b) => {
      const ar = a.getBoundingClientRect();
      const br = b.getBoundingClientRect();
      return (br.width * br.height) - (ar.width * ar.height);
    });

    for (const img of images) {
      const url = urlFromImage(img);
      if (url) return url;
    }

    const styled = [];
    if (host.matches?.(MEDIA_STYLE)) styled.push(host);
    host.querySelectorAll?.(MEDIA_STYLE).forEach(el => styled.push(el));

    for (const el of styled) {
      const url = urlFromBackground(el);
      if (url) return url;
    }

    // Final fallback: computed background-image on the host itself.
    return urlFromBackground(host);
  }

  function isProfileMediaRoute() {
    return /^\/[^/]+\/media\/?$/.test(location.pathname);
  }

  function isPhotoViewerRoute() {
    return /\/status\/\d+\/photo\/\d+/.test(location.pathname);
  }

  function mediaBox(host) {
    if (!host) return null;
    const img = host.matches?.(MEDIA_IMG) ? host : host.querySelector?.(MEDIA_IMG);
    const target = img || host;
    const rect = target.getBoundingClientRect();
    if (rect.width < 40 || rect.height < 40) return null;
    return rect;
  }

  function looksLikeMultiImageMediaTile(host) {
    if (!isProfileMediaRoute() || isPhotoViewerRoute()) return false;

    const rect = mediaBox(host);
    if (!rect) return false;

    // Find X's small stacked-image glyph in the lower-right corner.
    // Keep this deliberately strict so ordinary single-image tiles are not hidden.
    const scope =
      host.closest?.('a[href*="/status/"]') ||
      host.closest?.("article") ||
      host.parentElement ||
      host;

    const icons = scope.querySelectorAll?.("svg") || [];
    for (const icon of icons) {
      if (icon.closest?.(`.${BUTTON_CLASS}`)) continue;

      const r = icon.getBoundingClientRect();
      if (r.width < 8 || r.height < 8 || r.width > 30 || r.height > 30) continue;

      const cx = r.left + r.width / 2;
      const cy = r.top + r.height / 2;

      const nearRight = cx >= rect.right - 34 && cx <= rect.right + 4;
      const nearBottom = cy >= rect.bottom - 34 && cy <= rect.bottom + 4;

      if (nearRight && nearBottom) return true;
    }

    return false;
  }

  function chooseOverlayHost(source) {
    if (!source) return null;

    const tweetPhoto = source.matches?.(PHOTO_CONTAINER)
      ? source
      : source.closest?.(PHOTO_CONTAINER);
    if (tweetPhoto) return tweetPhoto;

    if (source instanceof HTMLImageElement && urlFromImage(source)) {
      const ir = source.getBoundingClientRect();
      let node = source.parentElement;
      for (let depth = 0; node && depth < 3; depth += 1, node = node.parentElement) {
        const r = node.getBoundingClientRect();
        if (ir.width < 40 || ir.height < 40) return null;
        const widthClose = r.width <= ir.width * 1.35 + 24;
        const heightClose = r.height <= ir.height * 1.35 + 24;
        const aligned = Math.abs(r.left - ir.left) <= 24 && Math.abs(r.top - ir.top) <= 24;
        if (widthClose && heightClose && aligned) return node;
      }
      return null;
    }

    if (source.matches?.(MEDIA_STYLE) && urlFromBackground(source)) return source;
    return null;
  }

  function ensurePositioned(host) {
    if (!(host instanceof HTMLElement)) return;
    host.classList.add(HOST_CLASS);

    const position = getComputedStyle(host).position;
    if (position === "static") {
      host.style.setProperty("position", "relative", "important");
    }
  }

  function existingButton(host) {
    if (!(host instanceof Element)) return null;
    return Array.from(host.children).find(
      child => child instanceof HTMLElement && child.classList.contains(BUTTON_CLASS)
    ) || null;
  }

  function removeButton(host) {
    existingButton(host)?.remove();
  }

  function debugLog(event, data = null) {
    if (!debugEnabled) return;

    browser.runtime.sendMessage({
      type: "XDL_DEBUG_LOG",
      source: "content",
      event,
      data: {
        url: location.href,
        ...(data && typeof data === "object"
          ? data
          : { value: data })
      }
    }).catch(() => {});
  }

  function showToast(message, kind = "error") {
    const old =
      document.querySelector(".xdl-page-toast");

    if (old) old.remove();

    const toast =
      document.createElement("div");

    toast.className =
      `xdl-page-toast xdl-page-toast-${kind}`;

    toast.textContent = message;
    toast.setAttribute("role", "status");

    document.documentElement.appendChild(
      toast
    );

    window.setTimeout(() => {
      toast.remove();
    }, kind === "error" ? 4200 : 1800);
  }

  async function doDownload(button) {
    const url = button.dataset.xdlUrl;

    if (!url) {
      showToast(
        "Download failed: no image URL was found."
      );
      debugLog(
        "download-missing-url"
      );
      return;
    }

    const old = button.textContent;
    button.disabled = true;
    button.textContent = "…";

    try {
      const result =
        await browser.runtime.sendMessage({
          type: "XDL_DOWNLOAD",
          url
        });

      if (!result?.ok) {
        throw new Error(
          result?.error ||
          "Download failed for an unknown reason."
        );
      }

      button.textContent = "✓";
      button.title =
        `Downloaded ${result.filename}`;

      debugLog(
        "download-success",
        {
          filename:
            result.filename,
          downloadId:
            result.downloadId
        }
      );

      window.setTimeout(() => {
        if (!button.isConnected) return;

        button.textContent = "DL ↓";
        button.disabled = false;
      }, 1000);
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : String(error);

      console.error(
        "X Image Downloader:",
        error
      );

      button.textContent = "FAIL";
      button.classList.add(
        "xdl-error"
      );

      button.title = message;

      showToast(message, "error");

      debugLog(
        "download-error",
        { error: message }
      );

      window.setTimeout(() => {
        if (!button.isConnected) return;

        button.textContent =
          old || "DL ↓";

        button.classList.remove(
          "xdl-error"
        );

        button.disabled = false;
      }, 2200);
    }
  }

  function makeButton(host, url) {
    ensurePositioned(host);

    let button = existingButton(host);
    if (!button) {
      button = document.createElement("button");
      button.type = "button";
      button.className = BUTTON_CLASS;
      button.textContent = "DL ↓";
      button.title = "Download highest available X image";
      button.setAttribute("aria-label", "Download highest available X image");

      const stop = event => {
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
      };

      button.addEventListener("pointerdown", stop, true);
      button.addEventListener("mousedown", stop, true);
      button.addEventListener("click", event => {
        stop(event);
        if (enabled) void doDownload(button);
      }, true);

      host.appendChild(button);
    }

    button.dataset.xdlUrl = url;
    button.hidden = !enabled;
    return button;
  }

  function processSource(source) {
    if (!enabled || !(source instanceof Element)) return;

    const host = chooseOverlayHost(source);
    if (!host) return;

    const url = extractMediaUrl(host) || extractMediaUrl(source);
    if (!url) {
      removeButton(host);
      return;
    }

    const box = mediaBox(host);
    if (!box) {
      removeButton(host);
      return;
    }

    // On profile Media grids, leave multi-image cover tiles alone.
    // The user opens X's viewer and downloads each visible photo there.
    if (looksLikeMultiImageMediaTile(host)) {
      removeButton(host);
      return;
    }

    makeButton(host, url);
  }

  function scan(root = document) {
    if (!enabled) return;

    const found = new Set();

    if (root instanceof Element) {
      if (root.matches(PHOTO_CONTAINER)) found.add(root);
      if (root.matches(MEDIA_IMG) || root.matches(MEDIA_STYLE)) found.add(root);
    }

    root.querySelectorAll?.(PHOTO_CONTAINER).forEach(el => found.add(el));
    root.querySelectorAll?.(MEDIA_IMG).forEach(el => found.add(el));
    root.querySelectorAll?.(MEDIA_STYLE).forEach(el => found.add(el));

    found.forEach(processSource);

    // Remove orphaned or stale controls left behind by X's virtualized DOM.
    document.querySelectorAll(`.${BUTTON_CLASS}`).forEach(button => {
      const host = button.parentElement;
      if (!button.isConnected || !host) {
        button.remove();
        return;
      }
      const currentUrl = extractMediaUrl(host);
      const box = mediaBox(host);
      if (!currentUrl || !box) {
        button.remove();
        return;
      }
      button.dataset.xdlUrl = currentUrl;
    });
  }

  function setEnabled(next) {
    enabled = next;
    if (!enabled) {
      document.querySelectorAll(`.${BUTTON_CLASS}`).forEach(button => button.remove());
    } else {
      scan(document);
    }
  }

  browser.storage.onChanged.addListener((changes, area) => {
    if (area !== "local") return;

    if (changes.enabled) {
      setEnabled(
        changes.enabled.newValue !== false
      );
    }

    if (changes.debugEnabled) {
      debugEnabled =
        changes.debugEnabled.newValue === true;

      debugLog(
        "debug-toggle",
        { enabled: debugEnabled }
      );
    }
  });

  const observer = new MutationObserver(mutations => {
    if (!enabled) return;

    for (const mutation of mutations) {
      if (mutation.type === "attributes") {
        if (mutation.target instanceof Element) processSource(mutation.target);
        continue;
      }

      if (mutation.type === "childList") {
        if (mutation.target instanceof Element) processSource(mutation.target);

        for (const node of mutation.addedNodes) {
          if (node instanceof Element) scan(node);
        }
      }
    }
  });

  observer.observe(document.documentElement, {
    subtree: true,
    childList: true,
    attributes: true,
    attributeFilter: ["src", "srcset", "style"]
  });

  // X is a SPA. We do NOT continuously rescan the page; this interval only
  // detects route changes, then performs one scan for the newly displayed route.
  const routeWatcher = window.setInterval(() => {
    if (location.pathname !== lastPath) {
      lastPath = location.pathname;

      debugLog(
        "route-change",
        { pathname: lastPath }
      );

      window.setTimeout(() => scan(document), 150);
      window.setTimeout(() => scan(document), 700);
    }
  }, 500);

  window.addEventListener("pagehide", () => {
    observer.disconnect();
    window.clearInterval(routeWatcher);
  }, { once: true });

  async function init() {
    try {
      const state = await browser.runtime.sendMessage({ type: "XDL_GET_STATE" });
      enabled = state?.enabled !== false;
      debugEnabled =
        state?.debugEnabled === true;
    } catch {
      const stored = await browser.storage.local.get("enabled");
      enabled = stored.enabled !== false;
    }

    if (enabled) {
      scan(document);

      debugLog(
        "content-init",
        {
          pathname:
            location.pathname,
          tweetPhotos:
            document.querySelectorAll(
              '[data-testid="tweetPhoto"]'
            ).length,
          mediaImages:
            document.querySelectorAll(
              'img[src*="pbs.twimg.com/media/"]'
            ).length,
          downloadButtons:
            document.querySelectorAll(
              ".xdl-download-button"
            ).length
        }
      );

      // X often finishes laying out media shortly after document_idle.
      window.setTimeout(() => scan(document), 500);
      window.setTimeout(() => scan(document), 1500);
    }
  }

  void init();
})();

// ---- XDL v2.1.2 contextual page information (video/profile tools) ----
(() => {
  if (window.__XDL_V212_CONTEXT_LOADED__) return;
  window.__XDL_V212_CONTEXT_LOADED__ = true;

  const RESERVED = new Set([
    "home","explore","notifications","messages","i","search","settings",
    "compose","jobs","communities","grok","tos","privacy","login","signup"
  ]);

  const VIDEO_THUMB_PARTS = [
    "/ext_tw_video_thumb/",
    "/amplify_video_thumb/",
    "/tweet_video_thumb/"
  ];

  const PLAYER_TIME_RE = /-?\d{1,2}:\d{2}\s*\/\s*\d{1,2}:\d{2}/;

  function parseStatusContext() {
    const match = location.pathname.match(
      /^\/([A-Za-z0-9_]{1,15})\/status\/(\d+)/
    );

    if (!match) return null;

    return {
      username: match[1],
      statusId: match[2],
      statusUrl: `https://x.com/${match[1]}/status/${match[2]}`
    };
  }

  function profileUsername() {
    const first = location.pathname.split("/").filter(Boolean)[0] || "";

    if (
      !/^[A-Za-z0-9_]{1,15}$/.test(first) ||
      RESERVED.has(first.toLowerCase())
    ) {
      return null;
    }

    return first;
  }

  function pathExplicitlyShowsVideo(statusId) {
    return new RegExp(`/status/${statusId}/video/\\d+`).test(
      location.pathname
    );
  }

  function isVisible(el, minWidth = 20, minHeight = 20) {
    if (!(el instanceof Element)) return false;

    const rect = el.getBoundingClientRect();

    if (rect.width < minWidth || rect.height < minHeight) return false;
    if (rect.bottom <= 0 || rect.right <= 0) return false;

    const style = getComputedStyle(el);

    return (
      style.display !== "none" &&
      style.visibility !== "hidden" &&
      Number(style.opacity || 1) > 0
    );
  }

  function elementHasVideoThumbnail(el) {
    if (!(el instanceof Element)) return false;

    const attrs = [
      el.getAttribute("src") || "",
      el.getAttribute("poster") || "",
      el.getAttribute("style") || ""
    ];

    if (el instanceof HTMLImageElement) {
      attrs.push(
        el.currentSrc || "",
        el.src || "",
        el.srcset || ""
      );
    }

    try {
      attrs.push(getComputedStyle(el).backgroundImage || "");
    } catch {}

    return attrs.some(value =>
      VIDEO_THUMB_PARTS.some(part => value.includes(part))
    );
  }

  function belongsToArticle(el, article) {
    if (!article) return true;

    const closestArticle = el.closest?.("article");

    // X sometimes renders player controls just outside the article subtree.
    // Only reject it if it clearly belongs to a different nested article.
    return !closestArticle || closestArticle === article;
  }

  function isDirectVideoSignal(el, article = null) {
    if (!(el instanceof Element)) return false;
    if (!belongsToArticle(el, article)) return false;

    if (el.matches("video")) return true;

    const testId =
      (el.getAttribute("data-testid") || "").toLowerCase();

    if (
      testId.includes("video") ||
      testId.includes("player")
    ) {
      return true;
    }

    if (elementHasVideoThumbnail(el)) return true;

    const aria =
      (el.getAttribute("aria-label") || "")
        .trim()
        .toLowerCase();

    if (
      aria === "play" ||
      aria.startsWith("play video") ||
      aria.includes("video player")
    ) {
      return true;
    }

    return false;
  }

  function hasPlayerTimeText(scope) {
    if (!(scope instanceof Element)) return false;

    if (PLAYER_TIME_RE.test(scope.innerText || "")) {
      return true;
    }

    return false;
  }

  function articleHasDirectVideo(article) {
    if (!(article instanceof Element)) return false;

    const selectors = [
      "video",
      '[data-testid*="video" i]',
      '[data-testid*="player" i]',
      'img[src*="ext_tw_video_thumb"]',
      'img[src*="amplify_video_thumb"]',
      'img[src*="tweet_video_thumb"]',
      '[poster*="ext_tw_video_thumb"]',
      '[poster*="amplify_video_thumb"]',
      '[poster*="tweet_video_thumb"]',
      '[style*="ext_tw_video_thumb"]',
      '[style*="amplify_video_thumb"]',
      '[style*="tweet_video_thumb"]',
      '[aria-label="Play"]',
      '[aria-label^="Play video"]',
      '[aria-label*="video player" i]',
      '[role="slider"]'
    ];

    for (const selector of selectors) {
      for (const el of article.querySelectorAll(selector)) {
        if (!belongsToArticle(el, article)) continue;

        // A slider alone can be unrelated, so require playback-time text.
        if (selector === '[role="slider"]') {
          if (hasPlayerTimeText(article)) return true;
          continue;
        }

        if (isDirectVideoSignal(el, article)) return true;
      }
    }

    // X's current player can render controls without a useful data-testid.
    // A "current / total" timer such as "-0:03 / 1:20" is a strong video signal.
    if (hasPlayerTimeText(article)) return true;

    return false;
  }

  function statusArticle(statusId) {
    const links =
      document.querySelectorAll(`a[href*="/status/${statusId}"]`);

    for (const link of links) {
      try {
        const path =
          new URL(link.href, location.href).pathname;

        if (!path.includes(`/status/${statusId}`)) {
          continue;
        }

        const article = link.closest("article");
        if (article) return article;
      } catch {}
    }

    const main = document.querySelector("main");

    if (main) {
      const articles = Array.from(
        main.querySelectorAll('article[data-testid="tweet"], article')
      );

      // On a status-detail page the first large top-level tweet article is
      // normally the requested post.
      for (const article of articles) {
        const rect = article.getBoundingClientRect();

        if (rect.width >= 250 && rect.height >= 180) {
          return article;
        }
      }
    }

    return null;
  }

  function statusHasExplicitVideoLink(statusId) {
    for (
      const link of
      document.querySelectorAll(
        `a[href*="/status/${statusId}/video/"]`
      )
    ) {
      try {
        const path =
          new URL(link.href, location.href).pathname;

        if (
          new RegExp(`/status/${statusId}/video/\\d+`)
            .test(path)
        ) {
          return true;
        }
      } catch {}
    }

    return false;
  }

  function viewerHasVideo() {
    for (
      const dialog of
      document.querySelectorAll('[role="dialog"]')
    ) {
      if (articleHasDirectVideo(dialog)) return true;
    }

    return false;
  }

  function visibleGlobalVideoSignal() {
    const selectors = [
      "video",
      '[data-testid*="video" i]',
      '[data-testid*="player" i]',
      'img[src*="ext_tw_video_thumb"]',
      'img[src*="amplify_video_thumb"]',
      'img[src*="tweet_video_thumb"]',
      '[poster*="ext_tw_video_thumb"]',
      '[poster*="amplify_video_thumb"]',
      '[poster*="tweet_video_thumb"]',
      '[style*="ext_tw_video_thumb"]',
      '[style*="amplify_video_thumb"]',
      '[style*="tweet_video_thumb"]'
    ];

    for (const selector of selectors) {
      for (const el of document.querySelectorAll(selector)) {
        if (!isVisible(el, 80, 60)) continue;

        const rect = el.getBoundingClientRect();

        // Restrict this fallback to media near the top/current-post area.
        if (rect.top > Math.max(window.innerHeight * 0.95, 900)) {
          continue;
        }

        return true;
      }
    }

    // Final fallback for X's custom video player controls.
    const main = document.querySelector("main");

    if (main) {
      const nodes = main.querySelectorAll(
        "div, span"
      );

      let checked = 0;

      for (const el of nodes) {
        if (++checked > 4000) break;
        if (el.children.length > 4) continue;

        const text = (el.textContent || "").trim();

        if (
          text.length <= 24 &&
          PLAYER_TIME_RE.test(text) &&
          isVisible(el, 10, 10)
        ) {
          const rect = el.getBoundingClientRect();

          if (
            rect.top <
            Math.max(window.innerHeight * 0.95, 900)
          ) {
            return true;
          }
        }
      }
    }

    return false;
  }

  function hasCurrentPostVideo() {
    const ctx = parseStatusContext();
    if (!ctx) return false;

    if (pathExplicitlyShowsVideo(ctx.statusId)) {
      return true;
    }

    if (statusHasExplicitVideoLink(ctx.statusId)) {
      return true;
    }

    const article = statusArticle(ctx.statusId);

    if (article && articleHasDirectVideo(article)) {
      return true;
    }

    if (viewerHasVideo()) {
      return true;
    }

    if (visibleGlobalVideoSignal()) {
      return true;
    }

    return false;
  }

  browser.runtime.onMessage.addListener(message => {
    if (
      !message ||
      message.type !== "XDL_GET_PAGE_INFO"
    ) {
      return undefined;
    }

    const status = parseStatusContext();

    return {
      ok: true,
      url: location.href,
      profileUsername: profileUsername(),
      isStatusPage: Boolean(status),
      statusUrl: status?.statusUrl || null,
      hasVideo: hasCurrentPostVideo()
    };
  });
})();
