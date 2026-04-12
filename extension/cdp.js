// CDP helpers for CLI Browser Bridge

const attachedTabs = new Map();
const screenshotStore = new Map();
const MAX_SCREENSHOTS = 10;
let screenshotCounter = 0;

export function getAttachedTabs() { return attachedTabs; }
export function getScreenshotStore() { return screenshotStore; }

export function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export async function ensureAttached(tabId) {
  if (attachedTabs.has(tabId)) return;

  await chrome.debugger.attach({ tabId }, '1.3').catch(e => {
    if (!e.message?.includes('already attached')) throw e;
  });

  attachedTabs.set(tabId, { enabledDomains: new Set() });

  // Force devicePixelRatio=1 using actual window size (not 0x0)
  const tab = await chrome.tabs.get(tabId);
  const win = await chrome.windows.get(tab.windowId);
  await chrome.debugger.sendCommand({ tabId }, 'Emulation.setDeviceMetricsOverride', {
    width: win.width || 1280,
    height: win.height || 800,
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
  let result = await chrome.debugger.sendCommand({ tabId }, 'Page.captureScreenshot', {
    format: 'jpeg', quality: 55, optimizeForSpeed: true, captureBeyondViewport: false,
  });
  if (result.data.length > 500000) {
    result = await chrome.debugger.sendCommand({ tabId }, 'Page.captureScreenshot', {
      format: 'jpeg', quality: 30, optimizeForSpeed: true, captureBeyondViewport: false,
    });
  }
  const imageId = `ss_${++screenshotCounter}`;
  screenshotStore.set(imageId, result.data);
  if (screenshotStore.size > MAX_SCREENSHOTS) {
    screenshotStore.delete(screenshotStore.keys().next().value);
  }
  return { base64: result.data, imageId };
}

export async function dispatchMouse(tabId, type, x, y, opts = {}) {
  // Explicit Number coercion — CDP requires numeric x/y
  await cdp(tabId, 'Input.dispatchMouseEvent', {
    type,
    x: Number(x),
    y: Number(y),
    button: opts.button || 'left',
    clickCount: opts.clickCount || 1,
    modifiers: opts.modifiers || 0,
  });
}

export async function mouseClick(tabId, x, y, opts = {}) {
  const button = opts.button || 'left';
  const clickCount = opts.clickCount || 1;
  const modifiers = opts.modifiers || 0;
  await dispatchMouse(tabId, 'mouseMoved', x, y, { modifiers });
  await sleep(50);
  await dispatchMouse(tabId, 'mousePressed', x, y, { button, clickCount, modifiers });
  await sleep(50);
  await dispatchMouse(tabId, 'mouseReleased', x, y, { button, clickCount, modifiers });
}

export async function humanType(tabId, text) {
  await ensureAttached(tabId);
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    await chrome.debugger.sendCommand({ tabId }, 'Input.insertText', { text: ch });
    const isSpace = ch === ' ' || ch === '\n';
    const delay = isSpace ? 200 + Math.random() * 200 : 40 + Math.random() * 140;
    await sleep(delay);
  }
}

chrome.tabs.onRemoved.addListener((tabId) => {
  if (!attachedTabs.has(tabId)) return;
  attachedTabs.delete(tabId);
  try { chrome.debugger.detach({ tabId }); } catch {}
});

chrome.debugger.onDetach.addListener(({ tabId }) => {
  attachedTabs.delete(tabId);
});
