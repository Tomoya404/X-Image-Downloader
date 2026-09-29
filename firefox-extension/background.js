"use strict";

const DEFAULT_ENABLED = true;
const DEFAULT_DOWNLOAD_MODE = "firefox"; // firefox | saveAs
const DEFAULT_DEBUG_ENABLED = false;
const MAX_DEBUG_ENTRIES = 250;

const PAGE_HOSTS = new Set([
  "x.com",
  "www.x.com",
  "twitter.com",
  "www.twitter.com"
]);

const IMAGE_HOST = "pbs.twimg.com";
const FORMATS = new Set(["jpg", "jpeg", "png", "webp", "gif"]);

let debugEnabledCache = false;
let debugWriteChain = Promise.resolve();

function safeString(value, max = 700) {
  const text = String(value ?? "");
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

function safeDebugValue(value, depth = 0) {
  if (depth > 3) return "[max-depth]";
  if (value == null || typeof value === "boolean" || typeof value === "number") {
    return value;
  }
  if (typeof value === "string") return safeString(value);

  if (Array.isArray(value)) {
    return value.slice(0, 30).map(item => safeDebugValue(item, depth + 1));
  }

  if (typeof value === "object") {
    const output = {};
    for (const [key, item] of Object.entries(value).slice(0, 40)) {
      output[safeString(key, 80)] = safeDebugValue(item, depth + 1);
    }
    return output;
  }

  return safeString(value);
}

async function getSettings() {
  const result = await browser.storage.local.get([
    "enabled",
    "downloadMode",
    "debugEnabled"
  ]);

  const allowedModes = new Set(["firefox", "saveAs"]);

  return {
    enabled:
      typeof result.enabled === "boolean"
        ? result.enabled
        : DEFAULT_ENABLED,

    downloadMode:
      allowedModes.has(result.downloadMode)
        ? result.downloadMode
        : DEFAULT_DOWNLOAD_MODE,

    debugEnabled:
      typeof result.debugEnabled === "boolean"
        ? result.debugEnabled
        : DEFAULT_DEBUG_ENABLED
  };
}

async function appendDebug(source, event, data = null) {
  if (!debugEnabledCache) return;

  const entry = {
    time: new Date().toISOString(),
    source: safeString(source, 80),
    event: safeString(event, 120),
    data: safeDebugValue(data)
  };

  debugWriteChain = debugWriteChain
    .then(async () => {
      const stored = await browser.storage.local.get("debugLog");
      const list = Array.isArray(stored.debugLog)
        ? stored.debugLog.slice(-(MAX_DEBUG_ENTRIES - 1))
        : [];

      list.push(entry);
      await browser.storage.local.set({ debugLog: list });
    })
    .catch(error => {
      console.error("XDL debug log write failed:", error);
    });

  return debugWriteChain;
}

async function updateToolbar(enabled) {
  await browser.action.setBadgeText({
    text: enabled ? "ON" : "OFF"
  });

  await browser.action.setBadgeBackgroundColor({
    color: enabled ? "#1d9bf0" : "#6b7280"
  });

  await browser.action.setTitle({
    title:
      enabled
        ? "X Image Downloader — ON"
        : "X Image Downloader — OFF"
  });
}

async function setEnabled(enabled) {
  await browser.storage.local.set({ enabled });
  await updateToolbar(enabled);
  await appendDebug("background", "downloader-toggle", { enabled });
  return enabled;
}

async function setDownloadMode(downloadMode) {
  const mode =
    downloadMode === "saveAs"
      ? "saveAs"
      : "firefox";

  await browser.storage.local.set({
    downloadMode: mode
  });

  await appendDebug("background", "download-mode", {
    downloadMode: mode
  });

  return mode;
}

async function setDebugEnabled(enabled) {
  debugEnabledCache = Boolean(enabled);
  await browser.storage.local.set({
    debugEnabled: debugEnabledCache
  });

  if (debugEnabledCache) {
    await appendDebug("background", "debug-enabled", {
      version: browser.runtime.getManifest().version
    });
  }

  return debugEnabledCache;
}

function senderIsX(sender) {
  try {
    const url = new URL(sender.url || "");
    return (
      url.protocol === "https:" &&
      PAGE_HOSTS.has(url.hostname)
    );
  } catch {
    return false;
  }
}

function normalizeMediaUrl(raw) {
  let url;

  try {
    url = new URL(raw);
  } catch {
    throw new Error(
      "Download failed: the image URL is invalid."
    );
  }

  if (
    url.protocol !== "https:" ||
    url.hostname !== IMAGE_HOST
  ) {
    throw new Error(
      "Download failed: this is not an X/Twitter image URL."
    );
  }

  if (!url.pathname.startsWith("/media/")) {
    throw new Error(
      "Download failed: this is not a supported X/Twitter post image."
    );
  }

  url.pathname = url.pathname.replace(
    /:(?:small|medium|large|orig|\d+x\d+)$/i,
    ""
  );

  url.hash = "";
  url.searchParams.set("name", "orig");
  return url;
}

function getFormat(url) {
  const fromQuery =
    (url.searchParams.get("format") || "").toLowerCase();

  if (FORMATS.has(fromQuery)) {
    return fromQuery === "jpeg" ? "jpg" : fromQuery;
  }

  const last =
    url.pathname.split("/").pop() || "";

  const match =
    last.match(/\.([a-z0-9]+)$/i);

  const ext =
    match ? match[1].toLowerCase() : "";

  if (FORMATS.has(ext)) {
    return ext === "jpeg" ? "jpg" : ext;
  }

  return "jpg";
}

function filenameFor(url) {
  const last = decodeURIComponent(
    url.pathname
      .split("/")
      .filter(Boolean)
      .pop() || "x-image"
  );

  const stem =
    last
      .replace(/\.(?:jpe?g|png|webp|gif)$/i, "")
      .replace(/[^a-zA-Z0-9._-]+/g, "_")
      .slice(0, 160) ||
    "x-image";

  return `${stem}.${getFormat(url)}`;
}

async function downloadImage(rawUrl) {
  const settings = await getSettings();

  if (!settings.enabled) {
    throw new Error(
      "Download failed: the image downloader is turned off."
    );
  }

  const url = normalizeMediaUrl(rawUrl);
  const filename = filenameFor(url);

  await appendDebug(
    "background",
    "image-download-request",
    {
      filename,
      downloadMode: settings.downloadMode,
      mediaPath: url.pathname
    }
  );

  try {
    const downloadId =
      await browser.downloads.download({
        url: url.toString(),
        filename,
        saveAs:
          settings.downloadMode === "saveAs",
        conflictAction: "uniquify"
      });

    await appendDebug(
      "background",
      "image-download-started",
      {
        filename,
        downloadId
      }
    );

    return {
      ok: true,
      downloadId,
      filename,
      resolvedUrl: url.toString()
    };
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : String(error);

    await appendDebug(
      "background",
      "image-download-error",
      {
        filename,
        error: message
      }
    );

    throw new Error(
      `Download failed: Firefox could not save the image. ${message}`
    );
  }
}

browser.runtime.onInstalled.addListener(
  async details => {
    const stored =
      await browser.storage.local.get([
        "enabled",
        "downloadMode",
        "debugEnabled",
        "debugLog"
      ]);

    const patch = {};

    if (typeof stored.enabled !== "boolean") {
      patch.enabled = DEFAULT_ENABLED;
    }

    if (
      !new Set(["firefox", "saveAs"])
        .has(stored.downloadMode)
    ) {
      patch.downloadMode =
        DEFAULT_DOWNLOAD_MODE;
    }

    if (
      typeof stored.debugEnabled !== "boolean"
    ) {
      patch.debugEnabled =
        DEFAULT_DEBUG_ENABLED;
    }

    if (!Array.isArray(stored.debugLog)) {
      patch.debugLog = [];
    }

    if (Object.keys(patch).length) {
      await browser.storage.local.set(patch);
    }

    const settings = await getSettings();
    debugEnabledCache = settings.debugEnabled;
    await updateToolbar(settings.enabled);

    await appendDebug(
      "background",
      "extension-installed-or-updated",
      {
        reason: details.reason,
        version:
          browser.runtime.getManifest().version
      }
    );
  }
);

browser.runtime.onStartup.addListener(
  async () => {
    const settings = await getSettings();
    debugEnabledCache =
      settings.debugEnabled;

    await updateToolbar(settings.enabled);

    await appendDebug(
      "background",
      "firefox-startup",
      {
        version:
          browser.runtime.getManifest().version
      }
    );
  }
);

browser.storage.onChanged.addListener(
  (changes, area) => {
    if (
      area === "local" &&
      changes.debugEnabled
    ) {
      debugEnabledCache =
        changes.debugEnabled.newValue === true;
    }
  }
);

browser.runtime.onMessage.addListener(
  async (message, sender) => {
    if (
      !message ||
      typeof message !== "object"
    ) {
      return undefined;
    }

    if (message.type === "XDL_GET_STATE") {
      return await getSettings();
    }

    if (message.type === "XDL_SET_ENABLED") {
      return {
        ok: true,
        enabled: await setEnabled(
          Boolean(message.enabled)
        )
      };
    }

    if (
      message.type ===
      "XDL_SET_DOWNLOAD_MODE"
    ) {
      return {
        ok: true,
        downloadMode:
          await setDownloadMode(
            message.downloadMode
          )
      };
    }

    if (
      message.type ===
      "XDL_SET_DEBUG_ENABLED"
    ) {
      return {
        ok: true,
        debugEnabled:
          await setDebugEnabled(
            Boolean(message.enabled)
          )
      };
    }

    if (
      message.type ===
      "XDL_DEBUG_LOG"
    ) {
      await appendDebug(
        safeString(
          message.source || "unknown",
          80
        ),
        safeString(
          message.event || "event",
          120
        ),
        message.data ?? null
      );

      return { ok: true };
    }

    if (
      message.type ===
      "XDL_GET_DEBUG_LOG"
    ) {
      const stored =
        await browser.storage.local.get(
          "debugLog"
        );

      return {
        ok: true,
        entries:
          Array.isArray(stored.debugLog)
            ? stored.debugLog
            : []
      };
    }

    if (
      message.type ===
      "XDL_CLEAR_DEBUG_LOG"
    ) {
      await browser.storage.local.set({
        debugLog: []
      });

      if (debugEnabledCache) {
        await appendDebug(
          "background",
          "debug-log-cleared"
        );
      }

      return { ok: true };
    }

    if (message.type === "XDL_DOWNLOAD") {
      if (!senderIsX(sender)) {
        const error =
          "Download blocked: the request did not come from an X/Twitter page.";

        await appendDebug(
          "background",
          "blocked-download-request",
          {
            senderUrl:
              sender?.url || null
          }
        );

        return {
          ok: false,
          error
        };
      }

      try {
        return await downloadImage(
          message.url
        );
      } catch (error) {
        const text =
          error instanceof Error
            ? error.message
            : String(error);

        return {
          ok: false,
          error: text
        };
      }
    }

    return undefined;
  }
);

getSettings()
  .then(async settings => {
    debugEnabledCache =
      settings.debugEnabled;

    await updateToolbar(
      settings.enabled
    );
  })
  .catch(console.error);
