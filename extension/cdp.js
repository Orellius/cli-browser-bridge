// CDP helpers for CLI Browser Bridge — MV3 service worker context

const attachedTabs = new Map(); // tabId -> { enabledDomains: Set }
const screenshotStore = new Map(); // imageId -> base64
const MAX_SCREENSHOTS = 10;
let screenshotCounter = 0;

export function getAttachedTabs() { return attachedTabs; }
export function getScreenshotStore() { return screenshotStore; }

export function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export async function ensureAttached(tabId) {
  if (attachedTabs.has(tabId)) return;

  await new Promise((resolve, reject) => {
    chrome.debugger.attach({ tabId }, '1.3', () => {
      if (chrome.runtime.lastError) {
        // Already attached is acceptable
        if (chrome.runtime.lastError.message?.includes('already attached')) {
          resolve();
        } else {
          reject(new Error(chrome.runtime.lastError.message));
        }
      } else {
        resolve();
      }
    });
  });

  attachedTabs.set(tabId, { enabledDomains: new Set() });

  // Force devicePixelRatio=1 so screenshot pixels match CSS coordinate space
  await chrome.debugger.sendCommand({ tabId }, 'Emulation.setDeviceMetricsOverride', {
    width: 0,
    height: 0,
    deviceScaleFactor: 1,
    mobile: false,
  });
}

export async function ensureDomain(tabId, domain) {
  await ensureAttached(tabId);
  const state = attachedTabs.get(tabId);
  if (state.enabledDomains.has(domain)) return;
  await chrome.debugger.sendCommand({ tabId }, `${domain}.enable`, {});
  state.enabledDomains.add(domain);
}

export async function cdp(tabId, method, params = {}) {
  await ensureAttached(tabId);
  return chrome.debugger.sendCommand({ tabId }, method, params);
}

export async function takeScreenshot(tabId) {
  await ensureAttached(tabId);

  const capture = async (quality) =>
    chrome.debugger.sendCommand({ tabId }, 'Page.captureScreenshot', {
      format: 'jpeg',
      quality,
      captureBeyondViewport: false,
      optimizeForSpeed: true,
    });

  let result = await capture(55);
  if (result.data.length > 500 * 1024 * (4 / 3)) {
    // base64 is ~4/3x raw size; 500KB raw -> ~667KB base64
    result = await capture(30);
  }

  const base64 = result.data;
  const imageId = `ss_${++screenshotCounter}`;

  screenshotStore.set(imageId, base64);

  // Evict oldest entries beyond MAX_SCREENSHOTS
  if (screenshotStore.size > MAX_SCREENSHOTS) {
    const oldest = screenshotStore.keys().next().value;
    screenshotStore.delete(oldest);
  }

  return { base64, imageId };
}

export async function dispatchMouse(tabId, type, x, y, opts = {}) {
  await cdp(tabId, 'Input.dispatchMouseEvent', {
    type,
    x,
    y,
    button: opts.button ?? 'left',
    clickCount: opts.clickCount ?? 1,
    modifiers: opts.modifiers ?? 0,
    ...opts.extra,
  });
}

export async function mouseClick(tabId, x, y, opts = {}) {
  await dispatchMouse(tabId, 'mouseMoved', x, y, opts);
  await sleep(50);
  await dispatchMouse(tabId, 'mousePressed', x, y, opts);
  await sleep(50);
  await dispatchMouse(tabId, 'mouseReleased', x, y, opts);
}

export async function humanType(tabId, text) {
  await ensureAttached(tabId);

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];

    await chrome.debugger.sendCommand({ tabId }, 'Input.insertText', { text: ch });

    const isSpace = ch === ' ' || ch === '\n';
    const delay = isSpace
      ? 200 + Math.random() * 200   // 200-400ms pause between words
      : 40 + Math.random() * 140;   // 40-180ms between characters

    await sleep(delay);
  }
}

// Cleanup: tab closed
chrome.tabs.onRemoved.addListener((tabId) => {
  if (!attachedTabs.has(tabId)) return;
  attachedTabs.delete(tabId);
  chrome.debugger.detach({ tabId }, () => {
    void chrome.runtime.lastError; // suppress "not attached" errors
  });
});

// Cleanup: debugger detached externally (DevTools opened, etc.)
chrome.debugger.onDetach.addListener(({ tabId }) => {
  attachedTabs.delete(tabId);
});
