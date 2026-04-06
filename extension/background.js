/*
 * uGet Integration is an extension to integrate uGet Download manager
 * with Google Chrome, Chromium, and other Chromium-based browsers in Linux and Windows.
 *
 * Copyright (C) 2016  Gobinath
 * Copyright (C) 2025  shravan
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <http://www.gnu.org/licenses/>.
 */

const EXTENSION_VERSION = "3.0.0";
const REQUIRED_INTEGRATOR_VERSION = "1.0.0";
const HOST_NAME = 'com.ugetdm.chrome';

// In-memory state (re-populated from storage on service worker wake-up)
let interruptDownloads = true;
let ugetIntegratorNotFound = true;
let ugetIntegratorVersion = '';
let ugetVersion = '';
let minFileSizeToInterrupt = 300 * 1024; // 300 KB
let urlsToSkip = [];
let urlsToInterrupt = [];
let mimeToSkip = [];
let mimeToInterrupt = [];
let mediasInTab = {};
let disposition = '';
let cookies = '';
let filter = [];

let message = {
    URL: '',
    Cookies: '',
    UserAgent: '',
    FileName: '',
    FileSize: '',
    Referer: '',
    PostData: '',
    Batch: false,
    Version: EXTENSION_VERSION
};

// Circular buffer for recent request metadata
let requestList = [
    { cookies: '', postData: '', id: '', referrer: '' },
    { cookies: '', postData: '', id: '', referrer: '' },
    { cookies: '', postData: '', id: '', referrer: '' }
];
let currRequest = 0;

// ===================== Initialization =====================

/**
 * Load all settings from storage into in-memory variables.
 * Must be called on every service worker start to restore state.
 */
async function loadState() {
    const items = await chrome.storage.sync.get(null);

    if (items["uget-urls-exclude"]) {
        urlsToSkip = items["uget-urls-exclude"].split(/[\s,]+/);
    }
    if (items["uget-urls-include"]) {
        urlsToInterrupt = items["uget-urls-include"].split(/[\s,]+/);
    }
    if (items["uget-mime-exclude"]) {
        mimeToSkip = items["uget-mime-exclude"].split(/[\s,]+/);
    }
    if (items["uget-mime-include"]) {
        mimeToInterrupt = items["uget-mime-include"].split(/[\s,]+/);
    }
    if (items["uget-min-file-size"] !== undefined) {
        minFileSizeToInterrupt = parseInt(items["uget-min-file-size"]);
    }
    if (items["uget-interrupt"] !== undefined) {
        interruptDownloads = (items["uget-interrupt"] === "true");
    }

    changeIcon();
}

/**
 * Initialize defaults in storage if they don't exist yet.
 */
async function initializeDefaults() {
    const items = await chrome.storage.sync.get(null);
    const defaults = {};
    if (!items["uget-urls-exclude"]) defaults["uget-urls-exclude"] = '';
    if (!items["uget-urls-include"]) defaults["uget-urls-include"] = '';
    if (!items["uget-mime-exclude"]) defaults["uget-mime-exclude"] = '';
    if (!items["uget-mime-include"]) defaults["uget-mime-include"] = '';
    if (!items["uget-min-file-size"]) defaults["uget-min-file-size"] = minFileSizeToInterrupt;
    if (!items["uget-interrupt"]) defaults["uget-interrupt"] = 'true';
    if (Object.keys(defaults).length > 0) {
        await chrome.storage.sync.set(defaults);
    }
}

// ===================== Service Worker Startup =====================

async function start() {
    await initializeDefaults();
    await loadState();
    sendMessageToHost(message); // Ping uget-integrator to check connectivity
}

// Run startup
start();

// ===================== Context Menus =====================
// Use onInstalled to create context menus (they persist across restarts)

chrome.runtime.onInstalled.addListener(() => {
    chrome.contextMenus.create({
        title: 'Download with uGet',
        id: "download_with_uget",
        contexts: ['link']
    });

    chrome.contextMenus.create({
        title: 'Download all links with uGet',
        id: "download_all_links_with_uget",
        contexts: ['page']
    });

    chrome.contextMenus.create({
        title: 'Download media with uGet',
        id: "download_media_with_uget",
        enabled: false,
        contexts: ['page']
    });
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
    "use strict";
    const page_url = info.pageUrl;

    if (info.menuItemId === "download_with_uget") {
        message.URL = info.linkUrl;
        message.Referer = page_url;
        const cookiesArr = await chrome.cookies.getAll({ url: extractRootURL(page_url) });
        parseCookiesAndSend(cookiesArr);

    } else if (info.menuItemId === "download_all_links_with_uget") {
        try {
            const results = await chrome.scripting.executeScript({
                target: { tabId: tab.id },
                files: ['extract.js']
            });
            if (results && results[0] && results[0].result && results[0].result.success) {
                message.URL = results[0].result.urls;
                message.Referer = page_url;
                message.Batch = true;
                const cookiesArr = await chrome.cookies.getAll({ url: extractRootURL(page_url) });
                parseCookiesAndSend(cookiesArr);
            }
        } catch (e) {
            console.error('Failed to extract links:', e);
        }

    } else if (info.menuItemId === "download_media_with_uget") {
        if (page_url && page_url.includes('/www.youtube.com/watch?v=')) {
            message.URL = page_url;
            message.Referer = page_url;
            const cookiesArr = await chrome.cookies.getAll({ url: extractRootURL(page_url) });
            parseCookiesAndSend(cookiesArr);
        } else {
            const media_set = mediasInTab[tab.id];
            if (media_set) {
                const urls = Array.from(media_set);
                if (urls.length === 1) {
                    message.URL = urls[0];
                    message.Referer = page_url;
                    const cookiesArr = await chrome.cookies.getAll({ url: extractRootURL(page_url) });
                    parseCookiesAndSend(cookiesArr);
                } else if (urls.length > 1) {
                    message.URL = urls.join('\n');
                    message.Referer = page_url;
                    message.Batch = true;
                    const cookiesArr = await chrome.cookies.getAll({ url: extractRootURL(page_url) });
                    parseCookiesAndSend(cookiesArr);
                }
            }
        }
    }
});

// ===================== Keyboard Shortcut =====================

chrome.commands.onCommand.addListener((command) => {
    if ("toggle-interruption" === command) {
        setInterruptDownload(!interruptDownloads, true);
    }
});

// ===================== Download Interception =====================

// Primary interception: catch downloads as they are created
chrome.downloads.onCreated.addListener(async (downloadItem) => {
    if (ugetIntegratorNotFound || !interruptDownloads) {
        return;
    }

    if ("in_progress" !== downloadItem.state.toString().toLowerCase()) {
        return;
    }

    const fileSize = downloadItem.fileSize;
    const mime = downloadItem.mime;
    const url = downloadItem.finalUrl || downloadItem.url;

    if (fileSize < minFileSizeToInterrupt && !(isWhiteListedURL(url) || isWhiteListedContent(mime))) {
        return;
    }
    if (isBlackListedURL(url) || isBlackListedContent(mime)) {
        return;
    }

    // Cancel the download
    chrome.downloads.cancel(downloadItem.id);
    // Erase the download from list
    chrome.downloads.erase({ id: downloadItem.id });

    message.URL = url;
    message.FileName = unescape(downloadItem.filename).replace(/\"/g, "");
    message.FileSize = fileSize;
    message.Referer = downloadItem.referrer;

    const cookiesArr = await chrome.cookies.getAll({ url: extractRootURL(url) });
    parseCookiesAndSend(cookiesArr);
});

// ===================== webRequest Observers (Non-Blocking) =====================

// Observe POST data from form submissions
chrome.webRequest.onBeforeRequest.addListener(
    (details) => {
        if (details.method === 'POST' && details.requestBody && details.requestBody.formData) {
            message.PostData = postParams(details.requestBody.formData);
        }
    },
    {
        urls: ['<all_urls>'],
        types: ['main_frame', 'sub_frame']
    },
    ['requestBody']
);

// Observe request headers to capture User-Agent, Referer, Cookies
chrome.webRequest.onBeforeSendHeaders.addListener(
    (details) => {
        currRequest++;
        if (currRequest > 2) currRequest = 2;
        requestList[currRequest].id = details.requestId;
        for (let i = 0; i < details.requestHeaders.length; ++i) {
            const name = details.requestHeaders[i].name.toLowerCase();
            if (name === 'user-agent') {
                message.UserAgent = details.requestHeaders[i].value;
            } else if (name === 'referer') {
                requestList[currRequest].referrer = details.requestHeaders[i].value;
            } else if (name === 'cookie') {
                requestList[currRequest].cookies = details.requestHeaders[i].value;
            }
        }
    },
    {
        urls: ['<all_urls>'],
        types: ['main_frame', 'sub_frame', 'xmlhttprequest']
    },
    ['requestHeaders']
);

// Observe response headers to detect downloadable content
// In MV3 this is non-blocking — we can't redirect or cancel here.
// Instead we set metadata so downloads.onCreated can use it.
chrome.webRequest.onHeadersReceived.addListener(
    async (details) => {
        if (ugetIntegratorNotFound || !interruptDownloads) {
            return;
        }

        // Check HTTP status code (statusLine removed in MV3)
        if (details.statusCode !== 200) {
            return;
        }

        if (isBlackListedURL(details.url)) {
            return;
        }

        let interruptDownload = false;
        message.URL = details.url;
        let contentType = "";

        for (let i = 0; i < details.responseHeaders.length; ++i) {
            const headerName = details.responseHeaders[i].name.toLowerCase();

            if (headerName === 'content-length') {
                message.FileSize = details.responseHeaders[i].value;
                const fileSize = parseInt(message.FileSize);
                if (fileSize < minFileSizeToInterrupt && !isWhiteListedURL(message.URL)) {
                    return;
                }
            } else if (headerName === 'content-disposition') {
                disposition = details.responseHeaders[i].value;
                if (disposition.lastIndexOf('filename') !== -1) {
                    const found = disposition.match(/filename[^;=\n]*\*=UTF-8''((['"]).*?\2|[^;\n]*)/);
                    if (found) {
                        message.FileName = decodeURI(found[1]);
                    } else {
                        message.FileName = disposition.match(/filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/)[1];
                        message.FileName = unescape(message.FileName).replace(/\"/g, "");
                    }
                    interruptDownload = true;
                }
            } else if (headerName === 'content-type') {
                contentType = details.responseHeaders[i].value;
                if (isBlackListedContent(contentType)) {
                    interruptDownload = false;
                    return;
                } else if (isWhiteListedContent(contentType)) {
                    interruptDownload = true;
                } else {
                    return;
                }
            }
        }

        if (interruptDownload) {
            for (let i = 0; i < filter.length; i++) {
                if (filter[i] !== "" && contentType.lastIndexOf(filter[i]) !== -1) {
                    return;
                }
            }
            for (let j = 0; j < 3; j++) {
                if (details.requestId === requestList[j].id && requestList[j].id !== "") {
                    message.Referer = requestList[j].referrer;
                    message.Cookies = requestList[j].cookies;
                    break;
                }
            }
            if (details.method !== "POST") {
                message.PostData = '';
            }
            const cookiesArr = await chrome.cookies.getAll({ url: extractRootURL(message.URL) });
            parseCookiesAndSend(cookiesArr);
        } else {
            clearMessage();
        }
    },
    {
        urls: ['<all_urls>'],
        types: ['main_frame', 'sub_frame']
    },
    ['responseHeaders']
);

// ===================== Video Grabber =====================

function checkForYoutube(tabId, disableIfNot) {
    chrome.tabs.get(tabId, (tab) => {
        if (chrome.runtime.lastError) return; // Tab may not exist
        const isYoutube = tab.url && tab.url.includes('/www.youtube.com/watch?v=');
        if (isYoutube) {
            chrome.contextMenus.update("download_media_with_uget", { enabled: true });
        } else if (disableIfNot) {
            chrome.contextMenus.update("download_media_with_uget", { enabled: false });
        }
    });
}

chrome.tabs.onActivated.addListener((activeInfo) => {
    if (mediasInTab[activeInfo.tabId] !== undefined) {
        chrome.contextMenus.update("download_media_with_uget", { enabled: true });
    } else {
        checkForYoutube(activeInfo.tabId, true);
    }
});

chrome.tabs.onRemoved.addListener((tabId) => {
    if (mediasInTab[tabId]) {
        delete mediasInTab[tabId];
    }
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
    if (changeInfo.status === 'loading') {
        delete mediasInTab[tabId];
    }
    checkForYoutube(tabId, false);
});

chrome.webRequest.onResponseStarted.addListener(
    (details) => {
        const content_url = details.url;
        const type = details.type;
        if (type === 'media' || content_url.includes('mp4')) {
            const tabId = details.tabId;
            let mediaSet = mediasInTab[tabId];
            if (mediaSet === undefined) {
                mediaSet = new Set();
                mediasInTab[tabId] = mediaSet;
            }
            mediaSet.add(content_url);
            chrome.contextMenus.update("download_media_with_uget", { enabled: true });
        }
    },
    {
        urls: ['<all_urls>'],
        types: ['media', 'object']
    }
);

// ===================== Message Handler (Popup ↔ Service Worker) =====================

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'getState') {
        sendResponse({
            state: getState(),
            interruptDownloads: interruptDownloads,
            ugetIntegratorVersion: ugetIntegratorVersion,
            ugetVersion: ugetVersion
        });
    } else if (request.action === 'setInterruptDownload') {
        setInterruptDownload(request.enabled, true);
        sendResponse({ success: true });
    } else if (request.action === 'updateExcludeKeywords') {
        updateExcludeKeywords(request.value);
        sendResponse({ success: true });
    } else if (request.action === 'updateIncludeKeywords') {
        updateIncludeKeywords(request.value);
        sendResponse({ success: true });
    } else if (request.action === 'updateExcludeMIMEs') {
        updateExcludeMIMEs(request.value);
        sendResponse({ success: true });
    } else if (request.action === 'updateIncludeMIMEs') {
        updateIncludeMIMEs(request.value);
        sendResponse({ success: true });
    } else if (request.action === 'updateMinFileSize') {
        updateMinFileSize(request.value);
        sendResponse({ success: true });
    }
    return false; // Synchronous response
});

// ===================== Utility Functions =====================

/**
 * Send message to uget-integrator native host.
 */
function sendMessageToHost(msg) {
    chrome.runtime.sendNativeMessage(HOST_NAME, msg, (response) => {
        if (chrome.runtime.lastError) {
            console.warn('Native messaging error:', chrome.runtime.lastError.message);
        }
        clearMessage();
        ugetIntegratorNotFound = (response == null);
        if (!ugetIntegratorNotFound && !ugetIntegratorVersion) {
            ugetIntegratorVersion = response.Version;
            ugetVersion = response.Uget;
        }
        changeIcon();
    });
}

/**
 * Return the internal state.
 */
function getState() {
    if (ugetIntegratorNotFound || !ugetIntegratorVersion) {
        return 2;
    } else if (!ugetIntegratorVersion.startsWith(REQUIRED_INTEGRATOR_VERSION)) {
        return 1;
    } else {
        return 0;
    }
}

/**
 * Clear the message.
 */
function clearMessage() {
    message.URL = '';
    message.Cookies = '';
    message.FileName = '';
    message.FileSize = '';
    message.Referer = '';
    message.UserAgent = '';
    message.Batch = false;
}

/**
 * Extract POST parameters from form data.
 */
function postParams(source) {
    const array = [];
    for (const key in source) {
        array.push(encodeURIComponent(key) + '=' + encodeURIComponent(source[key]));
    }
    return array.join('&');
}

/**
 * Extract the root URL.
 */
function extractRootURL(url) {
    let domain;
    if (url.indexOf("://") > -1) {
        domain = url.split('/')[0] + '/' + url.split('/')[1] + '/' + url.split('/')[2];
    } else {
        domain = url.split('/')[0];
    }
    return domain;
}

/**
 * Parse cookies and send the message to the native host.
 */
function parseCookiesAndSend(cookies_arr) {
    let cookieStr = '';
    for (const cookie of cookies_arr) {
        cookieStr += cookie.domain + '\t';
        cookieStr += (cookie.httpOnly ? "FALSE" : "TRUE") + '\t';
        cookieStr += cookie.path + '\t';
        cookieStr += (cookie.secure ? "TRUE" : "FALSE") + '\t';
        cookieStr += Math.round(cookie.expirationDate) + '\t';
        cookieStr += cookie.name + '\t';
        cookieStr += cookie.value;
        cookieStr += '\n';
    }
    message.Cookies = cookieStr;
    sendMessageToHost(message);
}

/**
 * Update the exclude keywords.
 */
function updateExcludeKeywords(exclude) {
    if (exclude === "") {
        urlsToSkip = [];
    } else {
        urlsToSkip = exclude.split(/[\s,]+/);
    }
    chrome.storage.sync.set({ "uget-urls-exclude": exclude });
}

/**
 * Update the include keywords.
 */
function updateIncludeKeywords(include) {
    if (include === "") {
        urlsToInterrupt = [];
    } else {
        urlsToInterrupt = include.split(/[\s,]+/);
    }
    chrome.storage.sync.set({ "uget-urls-include": include });
}

/**
 * Update the exclude MIMEs.
 */
function updateExcludeMIMEs(exclude) {
    if (exclude === "") {
        mimeToSkip = [];
    } else {
        mimeToSkip = exclude.split(/[\s,]+/);
    }
    chrome.storage.sync.set({ "uget-mime-exclude": exclude });
}

/**
 * Update the include MIMEs.
 */
function updateIncludeMIMEs(include) {
    if (include === "") {
        mimeToInterrupt = [];
    } else {
        mimeToInterrupt = include.split(/[\s,]+/);
    }
    chrome.storage.sync.set({ "uget-mime-include": include });
}

/**
 * Update the minimum file size to interrupt.
 */
function updateMinFileSize(size) {
    minFileSizeToInterrupt = size;
    chrome.storage.sync.set({ "uget-min-file-size": size });
}

/**
 * Check whether not to interrupt the given URL.
 */
function isBlackListedURL(url) {
    if (!url) return true;
    let blackListed = false;
    if (url.includes("//docs.google.com/") || url.includes("googleusercontent.com/docs")) {
        blackListed = true;
    }
    for (const keyword of urlsToSkip) {
        if (keyword && url.includes(keyword)) {
            blackListed = true;
            break;
        }
    }
    return blackListed;
}

/**
 * Check whether not to interrupt the given content type.
 */
function isBlackListedContent(contentType) {
    let blackListed = false;
    if (contentType) {
        if (/\b(?:xml|rss|javascript|json|html|text)\b/.test(contentType)) {
            blackListed = true;
        } else {
            for (const keyword of mimeToSkip) {
                if (keyword && contentType.includes(keyword)) {
                    blackListed = true;
                    break;
                }
            }
        }
    }
    return blackListed;
}

/**
 * Check whether to interrupt the given URL.
 */
function isWhiteListedURL(url) {
    if (!url) return false;
    let whiteListed = false;
    if (url.includes("video")) {
        whiteListed = true;
    }
    for (const keyword of urlsToInterrupt) {
        if (keyword && url.includes(keyword)) {
            whiteListed = true;
            break;
        }
    }
    return whiteListed;
}

/**
 * Check whether to interrupt the given content type.
 */
function isWhiteListedContent(contentType) {
    let whiteListed = false;
    if (contentType) {
        for (const keyword of mimeToInterrupt) {
            if (keyword && contentType.includes(keyword)) {
                whiteListed = true;
                break;
            }
        }
    }
    return whiteListed;
}

/**
 * Enable/Disable the plugin and update the icon.
 */
function setInterruptDownload(interrupt, writeToStorage) {
    interruptDownloads = interrupt;
    if (writeToStorage) {
        chrome.storage.sync.set({ "uget-interrupt": interrupt.toString() });
    }
    changeIcon();
}

/**
 * Change extension icon based on current state.
 */
function changeIcon() {
    const state = getState();
    let iconPath = "./icon_32.png";
    if (state === 0 && !interruptDownloads) {
        iconPath = "./icon_disabled_32.png";
    } else if (state === 1) {
        iconPath = "./icon_warning_32.png";
    } else if (state === 2) {
        iconPath = "./icon_error_32.png";
    }
    chrome.action.setIcon({ path: iconPath });
}
