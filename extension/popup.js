/*
 * uGet Integration popup script.
 * Communicates with the service worker via chrome.runtime.sendMessage().
 *
 * Copyright (C) 2016  Gobinath
 * Copyright (C) 2025  shravan
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 */

document.addEventListener('DOMContentLoaded', () => {

    // ---- DOM references ----
    const infoEl = document.getElementById('info');
    const warnEl = document.getElementById('warn');
    const errorEl = document.getElementById('error');
    const chkEnable = document.getElementById('chk_enable');
    const fileSizeEl = document.getElementById('fileSize');
    const urlsToExcludeEl = document.getElementById('urlsToExclude');
    const urlsToIncludeEl = document.getElementById('urlsToInclude');
    const mimeToExcludeEl = document.getElementById('mimeToExclude');
    const mimeToIncludeEl = document.getElementById('mimeToInclude');

    // ---- Load current state from service worker ----
    chrome.runtime.sendMessage({ action: 'getState' }, (response) => {
        if (response) {
            const state = response.state;
            infoEl.style.display = state === 0 ? 'block' : 'none';
            warnEl.style.display = state === 1 ? 'block' : 'none';
            errorEl.style.display = state === 2 ? 'block' : 'none';
        }
    });

    // ---- Load settings from storage ----
    chrome.storage.sync.get(null, (items) => {
        urlsToExcludeEl.value = items["uget-urls-exclude"] || '';
        urlsToIncludeEl.value = items["uget-urls-include"] || '';
        mimeToExcludeEl.value = items["uget-mime-exclude"] || '';
        mimeToIncludeEl.value = items["uget-mime-include"] || '';
        fileSizeEl.value = parseInt(items["uget-min-file-size"]) / 1024 || 300;
        chkEnable.checked = (items["uget-interrupt"] === "true");
    });

    // ---- Event listeners ----
    chkEnable.addEventListener('change', () => {
        chrome.runtime.sendMessage({
            action: 'setInterruptDownload',
            enabled: chkEnable.checked
        });
    });

    fileSizeEl.addEventListener('change', () => {
        let minFileSize = parseInt(fileSizeEl.value);
        if (isNaN(minFileSize)) {
            minFileSize = 300;
        } else if (minFileSize < -1) {
            minFileSize = -1;
        }
        fileSizeEl.value = minFileSize;
        chrome.runtime.sendMessage({
            action: 'updateMinFileSize',
            value: minFileSize * 1024
        });
    });

    urlsToExcludeEl.addEventListener('change', () => {
        chrome.runtime.sendMessage({
            action: 'updateExcludeKeywords',
            value: urlsToExcludeEl.value.trim()
        });
    });

    urlsToIncludeEl.addEventListener('change', () => {
        chrome.runtime.sendMessage({
            action: 'updateIncludeKeywords',
            value: urlsToIncludeEl.value.trim()
        });
    });

    mimeToExcludeEl.addEventListener('change', () => {
        chrome.runtime.sendMessage({
            action: 'updateExcludeMIMEs',
            value: mimeToExcludeEl.value.trim()
        });
    });

    mimeToIncludeEl.addEventListener('change', () => {
        chrome.runtime.sendMessage({
            action: 'updateIncludeMIMEs',
            value: mimeToIncludeEl.value.trim()
        });
    });
});
