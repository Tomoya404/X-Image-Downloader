"use strict";

const $ = id => document.getElementById(id);

const RESERVED = new Set([
  "home", "explore", "notifications", "messages", "i", "search",
  "settings", "compose", "jobs", "communities", "grok",
  "tos", "privacy", "login", "signup"
]);

let activeTab = null;
let activePageInfo = null;
let selectedVideoTabs = [];
let selectedTabCount = 0;
let lastBatchFilename = null;

let calendarTarget = null;
let calendarYear = 0;
let calendarMonth = 0;

function setStatus(text) {
  $("status").textContent = text;
}

function logDebug(event, data = null) {
  browser.runtime.sendMessage({
    type: "XDL_DEBUG_LOG",
    source: "popup",
    event,
    data
  }).catch(() => {});
}

function isXHost(hostname) {
  return /^(x\.com|www\.x\.com|twitter\.com|www\.twitter\.com)$/.test(hostname);
}

function profileFromUrl(raw) {
  try {
    const url = new URL(raw);
    if (!isXHost(url.hostname)) return null;

    const first = url.pathname.split("/").filter(Boolean)[0] || "";
    if (
      !/^[A-Za-z0-9_]{1,15}$/.test(first) ||
      RESERVED.has(first.toLowerCase())
    ) {
      return null;
    }

    return first;
  } catch {
    return null;
  }
}

function statusUrlFromTabUrl(raw) {
  try {
    const url = new URL(raw);
    if (!isXHost(url.hostname)) return null;

    const match = url.pathname.match(
      /^\/([A-Za-z0-9_]{1,15})\/status\/(\d+)/
    );

    return match
      ? `https://x.com/${match[1]}/status/${match[2]}`
      : null;
  } catch {
    return null;
  }
}

function tabUrlClearlyVideo(raw) {
  try {
    return /\/status\/\d+\/video\/\d+/.test(new URL(raw).pathname);
  } catch {
    return false;
  }
}

function detectVideoInCurrentXPage() {
  const match = location.pathname.match(
    /^\/([A-Za-z0-9_]{1,15})\/status\/(\d+)/
  );

  if (!match) {
    return {
      isStatusPage: false,
      hasVideo: false,
      statusUrl: null
    };
  }

  const username = match[1];
  const statusId = match[2];
  const statusUrl = `https://x.com/${username}/status/${statusId}`;

  if (
    new RegExp(`/status/${statusId}/video/\\d+`)
      .test(location.pathname)
  ) {
    return {
      isStatusPage: true,
      hasVideo: true,
      statusUrl,
      reason: "video-route"
    };
  }

  function elementVisible(el) {
    if (!(el instanceof Element)) return false;

    const rect = el.getBoundingClientRect();
    if (rect.width < 8 || rect.height < 8) return false;

    const style = getComputedStyle(el);
    return (
      style.display !== "none" &&
      style.visibility !== "hidden" &&
      Number(style.opacity || 1) > 0
    );
  }

  function findCurrentArticle() {
    const articles = Array.from(
      document.querySelectorAll('article[data-testid="tweet"], article')
    );

    // Prefer the article that actually contains this status permalink.
    for (const article of articles) {
      const links = article.querySelectorAll('a[href*="/status/"]');

      for (const link of links) {
        try {
          const path = new URL(link.href, location.href).pathname;

          if (
            path === `/${username}/status/${statusId}` ||
            path.startsWith(`/${username}/status/${statusId}/`)
          ) {
            return article;
          }
        } catch {}
      }
    }

    // On a status page X normally renders the requested tweet first.
    return articles[0] || null;
  }

  function rootHasVideo(root) {
    if (!(root instanceof Element)) return false;

    const strongSelectors = [
      "video",
      '[data-testid="videoPlayer"]',
      '[data-testid="videoComponent"]',
      '[data-testid="videoPlayerControls"]',
      '[data-testid="videoPlayerOverlay"]',
      '[data-testid*="video" i]',
      '[data-testid*="player" i]',
      'video[poster]',
      'img[src*="ext_tw_video_thumb"]',
      'img[src*="amplify_video_thumb"]',
      'img[src*="tweet_video_thumb"]',
      '[poster*="ext_tw_video_thumb"]',
      '[poster*="amplify_video_thumb"]',
      '[poster*="tweet_video_thumb"]',
      '[style*="ext_tw_video_thumb"]',
      '[style*="amplify_video_thumb"]',
      '[style*="tweet_video_thumb"]',
      '[aria-label^="Play video" i]',
      '[aria-label*="video player" i]'
    ];

    for (const selector of strongSelectors) {
      for (const el of root.querySelectorAll(selector)) {
        // Reject media belonging to a nested quoted tweet article.
        const nearestArticle = el.closest("article");
        if (root.matches("article") && nearestArticle && nearestArticle !== root) {
          continue;
        }

        if (elementVisible(el) || el.matches("video")) {
          return true;
        }
      }
    }

    // X's player controls expose text such as "-0:03 / 1:20".
    const timerPattern =
      /(?:-?\d{1,2}:)?\d{1,2}:\d{2}\s*\/\s*(?:\d{1,2}:)?\d{1,2}:\d{2}/;

    const text = root.innerText || "";
    if (timerPattern.test(text)) {
      return true;
    }

    // A seek/progress slider plus player-ish controls is another strong signal.
    const sliders = root.querySelectorAll('[role="slider"]');
    if (sliders.length) {
      const buttons = Array.from(
        root.querySelectorAll('button,[role="button"]')
      );

      const playerButton = buttons.some(button => {
        const label = (
          button.getAttribute("aria-label") ||
          button.getAttribute("title") ||
          button.textContent ||
          ""
        ).toLowerCase();

        return (
          label.includes("play") ||
          label.includes("pause") ||
          label.includes("mute") ||
          label.includes("unmute") ||
          label.includes("fullscreen") ||
          label.includes("full screen")
        );
      });

      if (playerButton) {
        return true;
      }
    }

    return false;
  }

  const article = findCurrentArticle();

  if (article && rootHasVideo(article)) {
    return {
      isStatusPage: true,
      hasVideo: true,
      statusUrl,
      reason: "current-article"
    };
  }

  // X sometimes portals the active player outside the tweet article.
  // Limit this fallback to visible player elements in the main content column.
  const main = document.querySelector("main");
  if (main) {
    const explicitPlayers = main.querySelectorAll(
      [
        "video",
        '[data-testid="videoPlayer"]',
        '[data-testid="videoComponent"]',
        '[data-testid="videoPlayerControls"]',
        '[data-testid="videoPlayerOverlay"]'
      ].join(",")
    );

    for (const el of explicitPlayers) {
      if (!elementVisible(el) && !el.matches("video")) continue;

      const rect = el.getBoundingClientRect();
      if (
        rect.top < Math.max(window.innerHeight, 900) &&
        rect.bottom > 0
      ) {
        return {
          isStatusPage: true,
          hasVideo: true,
          statusUrl,
          reason: "visible-main-player"
        };
      }
    }
  }

  return {
    isStatusPage: true,
    hasVideo: false,
    statusUrl,
    reason: "not-detected"
  };
}

async function getPageInfo(tab) {
  const statusUrl = statusUrlFromTabUrl(tab?.url || "");

  if (!tab?.id || !statusUrl) {
    return null;
  }

  if (tabUrlClearlyVideo(tab.url || "")) {
    return {
      ok: true,
      statusUrl,
      hasVideo: true,
      url: tab.url,
      reason: "video-route"
    };
  }

  // Inspect the live tab directly. This avoids depending on X's SPA/content
  // script message state and works even when the player is mounted lazily.
  const waits = [0, 120, 350, 700];

  for (const wait of waits) {
    if (wait) {
      await new Promise(resolve => setTimeout(resolve, wait));
    }

    try {
      const results = await browser.scripting.executeScript({
        target: { tabId: tab.id },
        func: detectVideoInCurrentXPage
      });

      const result = results?.[0]?.result;

      if (result?.hasVideo) {
        return {
          ok: true,
          ...result,
          url: tab.url
        };
      }
    } catch (error) {
      console.debug("XDL direct video detection failed:", error);
    }
  }

  return {
    ok: true,
    statusUrl,
    hasVideo: false,
    url: tab.url,
    reason: "not-detected"
  };
}

function parseDate(text) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec((text || "").trim());
  if (!match) return null;

  const y = Number(match[1]);
  const m = Number(match[2]);
  const d = Number(match[3]);

  const date = new Date(Date.UTC(y, m - 1, d));

  if (
    date.getUTCFullYear() !== y ||
    date.getUTCMonth() !== m - 1 ||
    date.getUTCDate() !== d
  ) {
    return null;
  }

  return { y, m, d, date };
}

function formatDate(y, m, d) {
  return `${String(y).padStart(4, "0")}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

function addDays(text, days) {
  const parsed = parseDate(text);
  if (!parsed) throw new Error("Invalid date");

  const date = new Date(parsed.date.getTime());
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

async function copyText(text, successText) {
  try {
    await navigator.clipboard.writeText(text);
    setStatus(successText);

    logDebug(
      "clipboard-copy-success",
      {
        kind:
          text.startsWith("yt-dlp")
            ? "yt-dlp-command"
            : "text"
      }
    );

    return true;
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : String(error);

    setStatus(
      `Clipboard copy failed: ${message}`
    );

    logDebug(
      "clipboard-copy-error",
      { error: message }
    );

    return false;
  }
}

function ytCommand(urls) {
  return `yt-dlp ${urls
    .map(url => `"${url.replace(/"/g, "")}"`)
    .join(" ")}`;
}

function batchListFilename() {
  const now = new Date();
  const date = [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, "0"),
    String(now.getDate()).padStart(2, "0")
  ].join("-");

  const time = [
    String(now.getHours()).padStart(2, "0"),
    String(now.getMinutes()).padStart(2, "0"),
    String(now.getSeconds()).padStart(2, "0")
  ].join("");

  return `xdl-batch-${date}-${time}.txt`;
}

async function downloadUrlList(urls) {
  if (!urls.length) {
    throw new Error("No video URLs selected.");
  }

  const body = `${urls.join("\r\n")}\r\n`;
  const blob = new Blob([body], {
    type: "text/plain;charset=utf-8"
  });
  const objectUrl = URL.createObjectURL(blob);
  const filename = batchListFilename();

  try {
    const downloadId = await browser.downloads.download({
      url: objectUrl,
      filename,
      saveAs: false,
      conflictAction: "uniquify"
    });

    return { filename, downloadId };
  } finally {
    // Give Firefox time to consume the object URL before revoking it.
    setTimeout(() => URL.revokeObjectURL(objectUrl), 10000);
  }
}

async function discoverVideoTabs() {
  const highlighted = await browser.tabs.query({
    highlighted: true,
    currentWindow: true
  });

  selectedTabCount = highlighted.length;

  const candidates = highlighted.filter(tab =>
    Boolean(statusUrlFromTabUrl(tab.url || ""))
  );

  const checked = await Promise.all(
    candidates.map(async tab => ({
      tab,
      info: await getPageInfo(tab)
    }))
  );

  selectedVideoTabs = checked
    .filter(item => item.info?.hasVideo && item.info?.statusUrl)
    .map(item => ({
      tabId: item.tab.id,
      url: item.info.statusUrl
    }));

  const batch = $("batchVideoTools");

  if (highlighted.length > 1 && selectedVideoTabs.length > 0) {
    batch.classList.remove("hidden");

    $("batchLabel").textContent =
      `${selectedVideoTabs.length} selected video tab` +
      (selectedVideoTabs.length === 1 ? "" : "s");

    const skipped = highlighted.length - selectedVideoTabs.length;

    $("batchNote").textContent =
      skipped > 0
        ? `${skipped} selected tab${skipped === 1 ? " was" : "s were"} skipped because no current-post video was detected.`
        : "All selected tabs contain detected X videos.";
  } else {
    batch.classList.add("hidden");
  }
}

function updateDownloadModeNote(mode) {
  $("downloadModeNote").textContent =
    mode === "saveAs"
      ? "Firefox opens Save As for every image."
      : "One click, no picker.";
}


function collectLiveDiagnosticsInPage() {
  const count = selector =>
    document.querySelectorAll(selector).length;

  const currentStatus =
    location.pathname.match(
      /^\/([A-Za-z0-9_]{1,15})\/status\/(\d+)/
    );

  const visibleVideoPlayers =
    Array.from(
      document.querySelectorAll(
        [
          "video",
          '[data-testid="videoPlayer"]',
          '[data-testid="videoComponent"]',
          '[data-testid="videoPlayerControls"]',
          '[data-testid="videoPlayerOverlay"]'
        ].join(",")
      )
    )
    .filter(el => {
      const rect =
        el.getBoundingClientRect();

      if (
        rect.width < 8 ||
        rect.height < 8
      ) {
        return false;
      }

      const style =
        getComputedStyle(el);

      return (
        style.display !== "none" &&
        style.visibility !== "hidden" &&
        Number(style.opacity || 1) > 0
      );
    })
    .length;

  return {
    href: location.href,
    pathname: location.pathname,
    title: document.title,
    route: {
      profileMedia:
        /^\/[^/]+\/media\/?$/
          .test(location.pathname),
      status:
        currentStatus
          ? {
              username:
                currentStatus[1],
              id:
                currentStatus[2]
            }
          : null
    },
    counts: {
      articles:
        count(
          'article[data-testid="tweet"], article'
        ),
      tweetPhoto:
        count(
          '[data-testid="tweetPhoto"]'
        ),
      pbsMediaImages:
        count(
          'img[src*="pbs.twimg.com/media/"]'
        ),
      xdlButtons:
        count(
          ".xdl-download-button"
        ),
      videoElements:
        count("video"),
      videoPlayer:
        count(
          '[data-testid="videoPlayer"]'
        ),
      videoComponent:
        count(
          '[data-testid="videoComponent"]'
        ),
      videoPlayerControls:
        count(
          '[data-testid="videoPlayerControls"]'
        ),
      videoPlayerOverlay:
        count(
          '[data-testid="videoPlayerOverlay"]'
        ),
      videoThumbs:
        count(
          [
            'img[src*="ext_tw_video_thumb"]',
            'img[src*="amplify_video_thumb"]',
            'img[src*="tweet_video_thumb"]'
          ].join(",")
        ),
      visibleVideoPlayers
    }
  };
}

async function buildDebugReport() {
  const state =
    await browser.runtime.sendMessage({
      type: "XDL_GET_STATE"
    });

  const log =
    await browser.runtime.sendMessage({
      type: "XDL_GET_DEBUG_LOG"
    });

  let liveDiagnostics = null;

  if (activeTab?.id) {
    try {
      const result =
        await browser.scripting.executeScript({
          target: {
            tabId: activeTab.id
          },
          func:
            collectLiveDiagnosticsInPage
        });

      liveDiagnostics =
        result?.[0]?.result || null;
    } catch (error) {
      liveDiagnostics = {
        error:
          error instanceof Error
            ? error.message
            : String(error)
      };
    }
  }

  const report = {
    generatedAt:
      new Date().toISOString(),

    extension: {
      name:
        browser.runtime.getManifest().name,
      version:
        browser.runtime.getManifest().version,
      id:
        "x-image-downloader@Tomoya404"
    },

    environment: {
      userAgent:
        navigator.userAgent,
      platform:
        navigator.platform
    },

    settings: {
      enabled:
        state?.enabled !== false,
      downloadMode:
        state?.downloadMode || "firefox",
      debugEnabled:
        state?.debugEnabled === true
    },

    activeTab: activeTab
      ? {
          id: activeTab.id,
          index: activeTab.index,
          title: activeTab.title,
          url: activeTab.url
        }
      : null,

    activePageInfo,

    selectedTabs: {
      highlightedCount:
        selectedTabCount,
      detectedVideoTabs:
        selectedVideoTabs
    },

    liveDiagnostics,

    recentDebugLog:
      Array.isArray(log?.entries)
        ? log.entries.slice(-150)
        : []
  };

  return [
    "X Image Downloader — Debug Report",
    "",
    JSON.stringify(report, null, 2)
  ].join("\n");
}

async function init() {
  $("versionDisplay").textContent = browser.runtime.getManifest().version;

  const [state, tabs] = await Promise.all([
    browser.runtime.sendMessage({ type: "XDL_GET_STATE" }),
    browser.tabs.query({ active: true, currentWindow: true })
  ]);

  activeTab = tabs[0] || null;

  $("enabledToggle").checked = state.enabled !== false;
  $("toggleLabel").textContent = state.enabled !== false ? "ON" : "OFF";
  $("debugToggle").checked =
    state.debugEnabled === true;

  const mode = state.downloadMode === "saveAs" ? "saveAs" : "firefox";
  $("downloadMode").value = mode;
  updateDownloadModeNote(mode);

  const profile = profileFromUrl(activeTab?.url || "");
  $("profileName").textContent = profile ? `@${profile}` : "No profile";
  $("searchButton").disabled = !profile;

  const isX =
    activeTab?.url?.includes("x.com") ||
    activeTab?.url?.includes("twitter.com");

  $("pageContext").textContent = isX
    ? (activeTab.title || "Current X tab")
    : "Open an X profile or post";

  if (!profile) {
    $("searchNote").textContent =
      "Open an X profile first to use date-range search.";
  }

  activePageInfo = await getPageInfo(activeTab);

  logDebug(
    "active-tab-video-detection",
    {
      tabUrl:
        activeTab?.url || null,
      result:
        activePageInfo || null
    }
  );

  const hasSingleVideo = Boolean(
    activePageInfo?.hasVideo &&
    activePageInfo?.statusUrl
  );

  $("singleVideoTools").classList.toggle(
    "hidden",
    !hasSingleVideo
  );

  await discoverVideoTabs();

  const anyVideoTools =
    hasSingleVideo ||
    (selectedTabCount > 1 && selectedVideoTabs.length > 0);

  $("videoSection").classList.toggle(
    "hidden",
    !anyVideoTools
  );
}

$("enabledToggle").addEventListener("change", async event => {
  const enabled = event.target.checked;

  await browser.runtime.sendMessage({
    type: "XDL_SET_ENABLED",
    enabled
  });

  $("toggleLabel").textContent = enabled ? "ON" : "OFF";

  setStatus(
    enabled
      ? "Image downloader enabled."
      : "Image downloader disabled."
  );
});

$("downloadMode").addEventListener("change", async event => {
  const mode = event.target.value === "saveAs"
    ? "saveAs"
    : "firefox";

  await browser.runtime.sendMessage({
    type: "XDL_SET_DOWNLOAD_MODE",
    downloadMode: mode
  });

  updateDownloadModeNote(mode);

  setStatus(
    mode === "saveAs"
      ? "Firefox will ask where to save every image."
      : "Images will save directly to Firefox's configured download folder."
  );
});

$("searchButton").addEventListener("click", async () => {
  const profile = profileFromUrl(activeTab?.url || "");
  const from = $("fromDate").value.trim();
  const to = $("toDate").value.trim();

  if (!profile) {
    return setStatus("Open an X profile first.");
  }

  if (!parseDate(from) || !parseDate(to)) {
    return setStatus("Use valid dates in YYYY-MM-DD format.");
  }

  if (from > to) {
    return setStatus("From date must not be after To date.");
  }

  const query =
    `from:${profile} since:${from} until:${addDays(to, 1)} filter:media`;

  const url =
    `https://x.com/search?q=${encodeURIComponent(query)}` +
    `&src=typed_query&f=live`;

  await browser.tabs.create({
    url,
    windowId: activeTab.windowId,
    index: activeTab.index + 1,
    openerTabId: activeTab.id,
    active: true
  });

  window.close();
});

$("copyVideo").addEventListener("click", async () => {
  if (!activePageInfo?.statusUrl) return;

  await copyText(
    ytCommand([activePageInfo.statusUrl]),
    "Ready-made yt-dlp command copied."
  );
});

$("downloadBatchList").addEventListener("click", async () => {
  const urls = selectedVideoTabs.map(item => item.url);

  if (!urls.length) {
    setStatus("No selected video URLs to export.");
    return;
  }

  try {
    const result = await downloadUrlList(urls);
    lastBatchFilename = result.filename;

    const command = `yt-dlp -a "${lastBatchFilename}"`;
    $("batchCommandField").value = command;
    $("batchCommandWrap").classList.remove("hidden");

    setStatus(
      `Saved ${lastBatchFilename} with ${urls.length} video URL${urls.length === 1 ? "" : "s"}.`
    );
  } catch (error) {
    console.error(error);
    setStatus(`Could not create URL list: ${error.message || error}`);
  }
});

$("copyBatchFileCommand").addEventListener("click", async () => {
  const command = $("batchCommandField").value.trim();

  if (!command) {
    setStatus("Download the URL list first.");
    return;
  }

  await copyText(
    command,
    "Batch-file yt-dlp command copied."
  );
});

function openCalendar(targetId) {
  calendarTarget = $(targetId);

  const current = parseDate(calendarTarget.value);
  const now = new Date();

  calendarYear = current?.y || now.getFullYear();
  calendarMonth = current ? current.m - 1 : now.getMonth();

  renderCalendar();

  $("calendarOverlay").classList.remove("hidden");
  $("calendarOverlay").setAttribute("aria-hidden", "false");
}

function closeCalendar() {
  $("calendarOverlay").classList.add("hidden");
  $("calendarOverlay").setAttribute("aria-hidden", "true");
  calendarTarget = null;
}

function renderCalendar() {
  $("calendarTitle").textContent =
    new Date(calendarYear, calendarMonth, 1)
      .toLocaleString(undefined, {
        month: "long",
        year: "numeric"
      });

  const grid = $("calendarGrid");
  grid.textContent = "";

  const firstDay =
    new Date(calendarYear, calendarMonth, 1).getDay();

  const daysThis =
    new Date(calendarYear, calendarMonth + 1, 0).getDate();

  const daysPrev =
    new Date(calendarYear, calendarMonth, 0).getDate();

  const selected = calendarTarget
    ? parseDate(calendarTarget.value)
    : null;

  const today = new Date();

  for (let cell = 0; cell < 42; cell += 1) {
    let y = calendarYear;
    let m = calendarMonth;
    let d;
    let other = false;

    if (cell < firstDay) {
      d = daysPrev - firstDay + cell + 1;
      m -= 1;
      if (m < 0) {
        m = 11;
        y -= 1;
      }
      other = true;
    } else if (cell >= firstDay + daysThis) {
      d = cell - firstDay - daysThis + 1;
      m += 1;
      if (m > 11) {
        m = 0;
        y += 1;
      }
      other = true;
    } else {
      d = cell - firstDay + 1;
    }

    const button = document.createElement("button");
    button.type = "button";
    button.className =
      "calendar-day" + (other ? " other" : "");
    button.textContent = String(d);

    if (
      selected &&
      selected.y === y &&
      selected.m === m + 1 &&
      selected.d === d
    ) {
      button.classList.add("selected");
    }

    if (
      today.getFullYear() === y &&
      today.getMonth() === m &&
      today.getDate() === d
    ) {
      button.classList.add("today");
    }

    button.addEventListener("click", () => {
      if (calendarTarget) {
        calendarTarget.value =
          formatDate(y, m + 1, d);
      }
      closeCalendar();
    });

    grid.appendChild(button);
  }
}

document
  .querySelectorAll(".calendar-open")
  .forEach(button => {
    button.addEventListener(
      "click",
      () => openCalendar(button.dataset.target)
    );
  });

$("calendarPrev").addEventListener("click", () => {
  calendarMonth -= 1;

  if (calendarMonth < 0) {
    calendarMonth = 11;
    calendarYear -= 1;
  }

  renderCalendar();
});

$("calendarNext").addEventListener("click", () => {
  calendarMonth += 1;

  if (calendarMonth > 11) {
    calendarMonth = 0;
    calendarYear += 1;
  }

  renderCalendar();
});

$("calendarToday").addEventListener("click", () => {
  const now = new Date();

  if (calendarTarget) {
    calendarTarget.value = formatDate(
      now.getFullYear(),
      now.getMonth() + 1,
      now.getDate()
    );
  }

  closeCalendar();
});

$("calendarClear").addEventListener("click", () => {
  if (calendarTarget) {
    calendarTarget.value = "";
  }

  closeCalendar();
});

$("calendarClose").addEventListener(
  "click",
  closeCalendar
);

$("calendarOverlay").addEventListener("click", event => {
  if (event.target === $("calendarOverlay")) {
    closeCalendar();
  }
});


$("debugToggle").addEventListener(
  "change",
  async event => {
    const enabled =
      event.target.checked;

    try {
      await browser.runtime.sendMessage({
        type:
          "XDL_SET_DEBUG_ENABLED",
        enabled
      });

      setStatus(
        enabled
          ? "Debug logging enabled."
          : "Debug logging disabled."
      );
    } catch (error) {
      event.target.checked =
        !enabled;

      setStatus(
        `Could not change debug logging: ${
          error.message || error
        }`
      );
    }
  }
);

$("copyDebugReport").addEventListener(
  "click",
  async () => {
    try {
      const report =
        await buildDebugReport();

      await copyText(
        report,
        "Debug report copied."
      );
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : String(error);

      setStatus(
        `Could not build debug report: ${message}`
      );

      logDebug(
        "debug-report-error",
        { error: message }
      );
    }
  }
);

$("clearDebugLog").addEventListener(
  "click",
  async () => {
    try {
      await browser.runtime.sendMessage({
        type:
          "XDL_CLEAR_DEBUG_LOG"
      });

      setStatus(
        "Debug log cleared."
      );
    } catch (error) {
      setStatus(
        `Could not clear debug log: ${
          error.message || error
        }`
      );
    }
  }
);

init().catch(error => {
  console.error(error);

  const message =
    error instanceof Error
      ? error.message
      : String(error);

  setStatus(
    `Extension initialization failed: ${message}`
  );

  logDebug(
    "popup-init-error",
    { error: message }
  );
});
