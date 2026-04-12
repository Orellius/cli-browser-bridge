// Tool handlers for cli-browser-bridge — MV3 service worker

import { ensureTabGroup, formatTabContext, isInGroup, getTabGroupId } from './tabs.js';
import { cdp, takeScreenshot, dispatchMouse, mouseClick, humanType, sleep, getScreenshotStore, ensureAttached, ensureDomain } from './cdp.js';

export const consoleMessages = new Map(); // tabId -> [msgs]
export const networkRequests = new Map(); // tabId -> [reqs]

// --- Helpers ---

async function sendContentMessage(tabId, message) {
  try {
    return await chrome.tabs.sendMessage(tabId, message);
  } catch {
    await chrome.scripting.executeScript({ target: { tabId }, files: ['content.js'] });
    return chrome.tabs.sendMessage(tabId, message);
  }
}

async function resolveRefToCoordinates(tabId, ref) {
  const resp = await sendContentMessage(tabId, { type: 'getRefCoordinates', ref });
  if (!resp) throw new Error(`Ref ${ref} not found`);
  return resp;
}

function parseModifierString(modStr = '') {
  let mod = 0;
  if (modStr.includes('Alt')) mod |= 1;
  if (modStr.includes('Ctrl') || modStr.includes('Control')) mod |= 2;
  if (modStr.includes('Meta') || modStr.includes('Command')) mod |= 4;
  if (modStr.includes('Shift')) mod |= 8;
  return mod;
}

function parseKeyCombo(keyStr) {
  const parts = keyStr.split('+');
  const key = parts.pop();
  const modifiers = parseModifierString(parts.join('+'));
  return { key, modifiers };
}

function text(str) {
  return { content: [{ type: 'text', text: str }] };
}

// --- Handlers ---

async function tabs_context_mcp() {
  await ensureTabGroup();
  const groupId = getTabGroupId();
  const tabs = groupId !== null
    ? await chrome.tabs.query({ groupId })
    : await chrome.tabs.query({ currentWindow: true });
  return formatTabContext(tabs);
}

async function tabs_create_mcp(args) {
  await ensureTabGroup(true);
  const groupId = getTabGroupId();
  const tab = await chrome.tabs.create({ url: args.url || 'about:blank', active: false });
  if (groupId !== null) await chrome.tabs.group({ tabIds: [tab.id], groupId });
  return text(`Created tab ${tab.id}`);
}

async function navigate(args) {
  const { tabId, url } = args;
  if (!(await isInGroup(tabId))) return text('Error: tab not in MCP group');

  if (url === 'back') {
    await chrome.tabs.goBack(tabId);
  } else if (url === 'forward') {
    await chrome.tabs.goForward(tabId);
  } else {
    await chrome.tabs.update(tabId, { url });
  }

  // Wait for load (10s max)
  await new Promise((resolve) => {
    const timeout = setTimeout(resolve, 10000);
    function onUpdated(id, info) {
      if (id === tabId && info.status === 'complete') {
        chrome.tabs.onUpdated.removeListener(onUpdated);
        clearTimeout(timeout);
        resolve();
      }
    }
    chrome.tabs.onUpdated.addListener(onUpdated);
  });

  const tab = await chrome.tabs.get(tabId);
  return text(`Navigated to ${tab.url}`);
}

async function computer(args) {
  const { tabId, action } = args;

  if (action === 'screenshot') {
    const { base64, imageId } = await takeScreenshot(tabId);
    return { content: [{ type: 'image', data: base64, mimeType: 'image/jpeg', imageId }] };
  }

  if (['left_click', 'right_click', 'double_click', 'triple_click'].includes(action)) {
    let x = args.x, y = args.y;
    if (args.ref) ({ x, y } = await resolveRefToCoordinates(tabId, args.ref));
    const opts = {
      button: action === 'right_click' ? 'right' : 'left',
      clickCount: action === 'double_click' ? 2 : action === 'triple_click' ? 3 : 1,
    };
    await mouseClick(tabId, x, y, opts);
    return text(`Clicked (${x}, ${y})`);
  }

  if (action === 'hover') {
    let x = args.x, y = args.y;
    if (args.ref) ({ x, y } = await resolveRefToCoordinates(tabId, args.ref));
    await dispatchMouse(tabId, 'mouseMoved', x, y);
    return text(`Hovered (${x}, ${y})`);
  }

  if (action === 'type') {
    if (args.humanlike) {
      await humanType(tabId, args.text);
    } else {
      for (const ch of args.text) {
        await cdp(tabId, 'Input.insertText', { text: ch });
        await sleep(10);
      }
    }
    return text(`Typed ${args.text.length} chars`);
  }

  if (action === 'key') {
    const { key, modifiers } = parseKeyCombo(args.key);
    const repeat = args.repeat ?? 1;
    for (let i = 0; i < repeat; i++) {
      await cdp(tabId, 'Input.dispatchKeyEvent', { type: 'keyDown', key, modifiers });
      await cdp(tabId, 'Input.dispatchKeyEvent', { type: 'keyUp', key, modifiers });
    }
    return text(`Key: ${args.key} x${repeat}`);
  }

  if (action === 'scroll') {
    await cdp(tabId, 'Input.dispatchMouseEvent', {
      type: 'mouseWheel', x: args.x, y: args.y,
      deltaX: args.deltaX ?? 0, deltaY: args.deltaY ?? 300,
    });
    const { base64, imageId } = await takeScreenshot(tabId);
    return { content: [{ type: 'image', data: base64, mimeType: 'image/jpeg', imageId }] };
  }

  if (action === 'scroll_to') {
    if (args.ref) {
      await sendContentMessage(tabId, { type: 'scrollToRef', ref: args.ref });
    } else {
      await cdp(tabId, 'Runtime.evaluate', { expression: `window.scrollTo(${args.x ?? 0}, ${args.y ?? 0})` });
    }
    return text('Scrolled');
  }

  if (action === 'wait') {
    await sleep((args.duration ?? 1) * 1000);
    return text(`Waited ${args.duration ?? 1}s`);
  }

  if (action === 'left_click_drag') {
    const { startX, startY, endX, endY } = args;
    await dispatchMouse(tabId, 'mousePressed', startX, startY);
    const steps = 10;
    for (let i = 1; i <= steps; i++) {
      const x = Math.round(startX + (endX - startX) * (i / steps));
      const y = Math.round(startY + (endY - startY) * (i / steps));
      await dispatchMouse(tabId, 'mouseMoved', x, y);
      await sleep(20);
    }
    await dispatchMouse(tabId, 'mouseReleased', endX, endY);
    return text(`Dragged (${startX},${startY}) → (${endX},${endY})`);
  }

  if (action === 'zoom') {
    const { base64, imageId } = await takeScreenshot(tabId);
    const regionInfo = args.region ? ` region=${JSON.stringify(args.region)}` : '';
    return { content: [{ type: 'image', data: base64, mimeType: 'image/jpeg', imageId }, { type: 'text', text: regionInfo }] };
  }

  return text(`Unknown action: ${action}`);
}

async function find(args) {
  const { tabId, query, pierceShadow } = args;
  const resp = await sendContentMessage(tabId, { type: 'findElements', query, pierceShadow: pierceShadow ?? true });
  return text(JSON.stringify(resp?.result ?? []));
}

async function form_input(args) {
  const { tabId, ref, value } = args;
  const resp = await sendContentMessage(tabId, { type: 'setFormValue', ref, value });
  return text(JSON.stringify(resp?.result ?? {}));
}

async function get_page_text(args) {
  const resp = await sendContentMessage(args.tabId, { type: 'getPageText' });
  return text(resp?.result ?? '');
}

async function read_page(args) {
  const { tabId, filter, depth, pierceShadow } = args;
  const resp = await sendContentMessage(tabId, {
    type: 'generateAccessibilityTree',
    options: { filter: filter ?? 'all', depth, pierceShadow: pierceShadow ?? true },
  });
  const tab = await chrome.tabs.get(tabId);
  const dims = `\nViewport: ${tab.width ?? '?'}x${tab.height ?? '?'}`;
  return text((resp?.result ?? '') + dims);
}

async function javascript_tool(args) {
  const result = await cdp(args.tabId, 'Runtime.evaluate', {
    expression: args.code,
    returnByValue: true,
    awaitPromise: true,
  });
  const val = result?.result?.value;
  return text(val !== undefined ? JSON.stringify(val) : JSON.stringify(result?.result));
}

async function read_console_messages(args) {
  const { tabId } = args;
  await ensureDomain(tabId, 'Console');
  await ensureDomain(tabId, 'Runtime');
  const msgs = consoleMessages.get(tabId) ?? [];
  const filtered = args.level ? msgs.filter(m => m.level === args.level) : msgs;
  return text(JSON.stringify(filtered));
}

async function read_network_requests(args) {
  const { tabId } = args;
  await ensureDomain(tabId, 'Network');
  const reqs = networkRequests.get(tabId) ?? [];
  const filtered = args.urlFilter ? reqs.filter(r => r.url?.includes(args.urlFilter)) : reqs;
  return text(JSON.stringify(filtered));
}

async function gif_creator() {
  return text('not yet implemented');
}

async function resize_window(args) {
  await chrome.windows.update(args.windowId, { width: args.width, height: args.height });
  return text(`Resized window ${args.windowId} to ${args.width}x${args.height}`);
}

async function shortcuts_list() {
  return text('not supported');
}

async function shortcuts_execute() {
  return text('not supported');
}

async function switch_browser(args) {
  return text(`To switch browsers, install the extension in ${args.browser ?? 'the target browser'} and connect via the native messaging host.`);
}

async function update_plan(args) {
  const plan = args.plan ?? '';
  const formatted = `Plan updated:\n${plan}`;
  return text(formatted);
}

async function upload_image(args) {
  const { imageId } = args;
  const store = getScreenshotStore();
  if (!imageId || !store.has(imageId)) {
    return text(`Error: imageId "${imageId}" not found in screenshot store`);
  }
  return text(JSON.stringify({ imageId, stored: true }));
}

// --- Export (merge core + advanced) ---

import { advancedToolHandlers } from './tools-advanced.js';

export const toolHandlers = {
  tabs_context_mcp,
  tabs_create_mcp,
  navigate,
  computer,
  find,
  form_input,
  get_page_text,
  read_page,
  javascript_tool,
  read_console_messages,
  read_network_requests,
  gif_creator,
  resize_window,
  shortcuts_list,
  shortcuts_execute,
  switch_browser,
  update_plan,
  upload_image,
  ...advancedToolHandlers,
};
