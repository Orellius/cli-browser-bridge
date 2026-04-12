// Tool handlers for cli-browser-bridge — aligned with MCP tool schemas

import { ensureTabGroup, formatTabContext, isInGroup, getTabGroupId } from './tabs.js';
import { cdp, takeScreenshot, dispatchMouse, mouseClick, humanType, sleep, getScreenshotStore, ensureAttached, ensureDomain } from './cdp.js';
import { advancedToolHandlers } from './tools-advanced.js';

export const consoleMessages = new Map();
export const networkRequests = new Map();

function text(t) { return { content: [{ type: 'text', text: String(t) }] }; }
function err(t) { return { content: [{ type: 'text', text: t }], isError: true }; }

async function sendContentMessage(tabId, message) {
  try { return await chrome.tabs.sendMessage(tabId, message); } catch {
    await chrome.scripting.executeScript({ target: { tabId }, files: ['content.js'] });
    return chrome.tabs.sendMessage(tabId, message);
  }
}

async function resolveRef(tabId, ref) {
  const resp = await sendContentMessage(tabId, { type: 'getRefCoordinates', ref });
  if (resp?.result) return [resp.result.x, resp.result.y];
  return null;
}

function parseKeyCombo(keyStr) {
  const MAP = { enter:'Enter',return:'Enter',tab:'Tab',escape:'Escape',esc:'Escape',backspace:'Backspace',delete:'Delete',space:'Space',' ':'Space',arrowup:'ArrowUp',arrowdown:'ArrowDown',arrowleft:'ArrowLeft',arrowright:'ArrowRight',up:'ArrowUp',down:'ArrowDown',left:'ArrowLeft',right:'ArrowRight',home:'Home',end:'End',pageup:'PageUp',pagedown:'PageDown' };
  const parts = keyStr.split('+').map(p => p.trim().toLowerCase());
  let modifiers = 0, key = '';
  for (const p of parts) {
    if (p === 'ctrl' || p === 'control') modifiers |= 2;
    else if (p === 'alt') modifiers |= 1;
    else if (p === 'shift') modifiers |= 8;
    else if (p === 'meta' || p === 'cmd' || p === 'command') modifiers |= 4;
    else key = MAP[p] || p;
  }
  return { key, modifiers };
}

function parseModifiers(str) {
  if (!str) return 0;
  let m = 0;
  for (const p of str.split('+').map(s => s.trim().toLowerCase())) {
    if (p === 'ctrl' || p === 'control') m |= 2;
    else if (p === 'alt') m |= 1;
    else if (p === 'shift') m |= 8;
    else if (p === 'meta' || p === 'cmd' || p === 'command') m |= 4;
  }
  return m;
}

// --- Core handlers ---

async function tabs_context_mcp(args) {
  await ensureTabGroup(args.createIfEmpty);
  const groupId = getTabGroupId();
  if (groupId === null) return text('No MCP tab group. Use createIfEmpty: true.');
  const tabs = await chrome.tabs.query({ groupId });
  return formatTabContext(tabs);
}

async function tabs_create_mcp() {
  await ensureTabGroup(true);
  const groupId = getTabGroupId();
  const tab = await chrome.tabs.create({ active: true });
  if (groupId !== null) await chrome.tabs.group({ tabIds: [tab.id], groupId });
  const tabs = await chrome.tabs.query({ groupId });
  const ctx = formatTabContext(tabs);
  ctx.content[0].text = `Created tab ${tab.id}\n\n` + ctx.content[0].text;
  return ctx;
}

async function navigate(args) {
  const { tabId, url } = args;
  if (!(await isInGroup(tabId))) return err(`Tab ${tabId} not in MCP group.`);
  if (url === 'back') await chrome.tabs.goBack(tabId);
  else if (url === 'forward') await chrome.tabs.goForward(tabId);
  else {
    let target = url;
    if (!target.match(/^https?:\/\//i) && !target.startsWith('about:')) {
      target = target.replace(/^[a-z]{1,5}:\/+/i, '');
      target = 'https://' + target;
    }
    await chrome.tabs.update(tabId, { url: target });
  }
  await new Promise(resolve => {
    const t = setTimeout(resolve, 10000);
    const fn = (id, info) => { if (id === tabId && info.status === 'complete') { chrome.tabs.onUpdated.removeListener(fn); clearTimeout(t); resolve(); } };
    chrome.tabs.onUpdated.addListener(fn);
  });
  const tab = await chrome.tabs.get(tabId);
  return text(`Navigated to ${tab.url}${tab.status !== 'complete' ? ' (still loading)' : ''}`);
}

async function computer(args) {
  const { tabId, action } = args;
  const coord = Array.isArray(args.coordinate) ? args.coordinate : null;
  const modifiers = parseModifiers(args.modifiers);

  let cx = coord ? Number(coord[0]) : undefined;
  let cy = coord ? Number(coord[1]) : undefined;
  if (args.ref && cx == null) {
    const resolved = await resolveRef(tabId, args.ref);
    if (!resolved) return err(`Could not resolve ref "${args.ref}"`);
    cx = Number(resolved[0]);
    cy = Number(resolved[1]);
  }

  switch (action) {
    case 'screenshot': {
      const { base64, imageId } = await takeScreenshot(tabId);
      let dims = '';
      try { const vp = await cdp(tabId, 'Runtime.evaluate', { expression: 'window.innerWidth+"x"+window.innerHeight' }); dims = vp?.result?.value || ''; } catch {}
      return { content: [{ type: 'text', text: `Screenshot (${dims}) ID: ${imageId}` }, { type: 'image', data: base64, mimeType: 'image/jpeg' }] };
    }
    case 'left_click': case 'right_click': case 'double_click': case 'triple_click': {
      if (cx == null) return err('coordinate or ref required');
      const btn = action === 'right_click' ? 'right' : 'left';
      const cc = action === 'double_click' ? 2 : action === 'triple_click' ? 3 : 1;
      await mouseClick(tabId, cx, cy, { button: btn, clickCount: cc, modifiers });
      return text(`Clicked (${cx}, ${cy})`);
    }
    case 'hover': {
      if (cx == null) return err('coordinate or ref required');
      await dispatchMouse(tabId, 'mouseMoved', cx, cy, { modifiers });
      await sleep(200);
      return text(`Hovered (${cx}, ${cy})`);
    }
    case 'type': {
      if (!args.text) return err('text required');
      if (args.humanlike) { await humanType(tabId, args.text); }
      else { for (const ch of args.text) { await cdp(tabId, 'Input.insertText', { text: ch }); await sleep(10); } }
      return text(`Typed "${args.text.substring(0, 50)}${args.text.length > 50 ? '...' : ''}"`);
    }
    case 'key': {
      const keyText = args.text || args.key || '';
      if (!keyText) return err('text required for key action');
      const repeat = Math.min(args.repeat || 1, 100);
      const keys = String(keyText).split(' ').filter(Boolean);
      for (let r = 0; r < repeat; r++) {
        for (const k of keys) {
          const { key, modifiers: km } = parseKeyCombo(k);
          await cdp(tabId, 'Input.dispatchKeyEvent', { type: 'keyDown', key, modifiers: km });
          await cdp(tabId, 'Input.dispatchKeyEvent', { type: 'keyUp', key, modifiers: km });
          await sleep(30);
        }
      }
      return text(`Key: ${args.text} x${repeat}`);
    }
    case 'scroll': {
      if (cx == null) return err('coordinate required for scroll');
      const dir = args.scroll_direction || 'down';
      const amt = Math.min(args.scroll_amount || 3, 10);
      const dX = dir === 'left' ? -amt * 100 : dir === 'right' ? amt * 100 : 0;
      const dY = dir === 'up' ? -amt * 100 : dir === 'down' ? amt * 100 : 0;
      await cdp(tabId, 'Input.dispatchMouseEvent', { type: 'mouseWheel', x: cx, y: cy, deltaX: dX, deltaY: dY, modifiers });
      await sleep(300);
      const { base64 } = await takeScreenshot(tabId);
      return { content: [{ type: 'text', text: `Scrolled ${dir} ${amt} ticks` }, { type: 'image', data: base64, mimeType: 'image/jpeg' }] };
    }
    case 'scroll_to': {
      if (args.ref) await sendContentMessage(tabId, { type: 'scrollToRef', ref: args.ref });
      else if (coord) await cdp(tabId, 'Runtime.evaluate', { expression: `window.scrollTo(${cx},${cy})` });
      await sleep(300);
      return text('Scrolled to target');
    }
    case 'wait': {
      const dur = Math.min(args.duration || 1, 30);
      await sleep(dur * 1000);
      return text(`Waited ${dur}s`);
    }
    case 'left_click_drag': {
      const sc = args.start_coordinate;
      if (!sc || !coord) return err('start_coordinate and coordinate required');
      const [sx, sy] = sc;
      await dispatchMouse(tabId, 'mouseMoved', sx, sy, { modifiers });
      await sleep(50);
      await dispatchMouse(tabId, 'mousePressed', sx, sy, { button: 'left', modifiers });
      for (let i = 1; i <= 10; i++) {
        await dispatchMouse(tabId, 'mouseMoved', sx + (cx - sx) * i / 10, sy + (cy - sy) * i / 10, { modifiers });
        await sleep(20);
      }
      await dispatchMouse(tabId, 'mouseReleased', cx, cy, { button: 'left', modifiers });
      return text(`Dragged (${sx},${sy}) → (${cx},${cy})`);
    }
    case 'zoom': {
      if (!args.region) return err('region required for zoom');
      const { base64 } = await takeScreenshot(tabId);
      return { content: [{ type: 'text', text: `Zoom region: [${args.region}]` }, { type: 'image', data: base64, mimeType: 'image/jpeg' }] };
    }
    default: return err(`Unknown action: ${action}`);
  }
}

async function find(args) {
  if (!(await isInGroup(args.tabId))) return err('Tab not in MCP group.');
  const resp = await sendContentMessage(args.tabId, { type: 'findElements', query: args.query, pierceShadow: args.pierceShadow ?? true });
  const results = resp?.result || [];
  if (!results.length) return text(`No elements found for "${args.query}"`);
  let t = `Found ${results.length} element(s):\n`;
  for (const r of results) t += `[${r.ref}] ${r.role} "${r.name}" at (${r.coordinates[0]}, ${r.coordinates[1]})\n`;
  return text(t);
}

async function form_input(args) {
  if (!(await isInGroup(args.tabId))) return err('Tab not in MCP group.');
  const resp = await sendContentMessage(args.tabId, { type: 'setFormValue', ref: args.ref, value: args.value });
  return text(resp?.result?.error ? `Error: ${resp.result.error}` : `Set ${args.ref} to "${args.value}"`);
}

async function get_page_text(args) {
  if (!(await isInGroup(args.tabId))) return err('Tab not in MCP group.');
  const resp = await sendContentMessage(args.tabId, { type: 'getPageText' });
  if (!resp?.result) return err('Could not extract text');
  try {
    const data = JSON.parse(resp.result);
    return text(`Title: ${data.title}\nURL: ${data.url}\n\n${data.text}`);
  } catch { return text(resp.result); }
}

async function read_page(args) {
  if (!(await isInGroup(args.tabId))) return err('Tab not in MCP group.');
  const resp = await sendContentMessage(args.tabId, {
    type: 'generateAccessibilityTree',
    options: { filter: args.filter, depth: args.depth, max_chars: args.max_chars, ref_id: args.ref_id, pierceShadow: args.pierceShadow ?? true },
  });
  let tree = resp?.result || 'Error: could not generate tree';
  try { await ensureAttached(args.tabId); const vp = await cdp(args.tabId, 'Runtime.evaluate', { expression: 'window.innerWidth+"x"+window.innerHeight' }); if (vp?.result?.value) tree += `\n\nViewport: ${vp.result.value}`; } catch {}
  return text(tree);
}

async function javascript_tool(args) {
  if (!(await isInGroup(args.tabId))) return err('Tab not in MCP group.');
  try {
    const result = await cdp(args.tabId, 'Runtime.evaluate', { expression: args.text, returnByValue: true, awaitPromise: true });
    if (result.exceptionDetails) return err(result.exceptionDetails.text || JSON.stringify(result.exceptionDetails));
    const val = result.result;
    if (val.type === 'undefined') return text('undefined');
    return text(val.value !== undefined ? JSON.stringify(val.value) : val.description || String(val));
  } catch (e) { return err(e.message); }
}

async function read_console_messages(args) {
  await ensureDomain(args.tabId, 'Console');
  await ensureDomain(args.tabId, 'Runtime');
  let msgs = consoleMessages.get(args.tabId) || [];
  if (args.onlyErrors) msgs = msgs.filter(m => ['error', 'exception'].includes(m.level));
  if (args.pattern) { try { const re = new RegExp(args.pattern, 'i'); msgs = msgs.filter(m => re.test(m.text)); } catch { msgs = msgs.filter(m => m.text.includes(args.pattern)); } }
  msgs = msgs.slice(-(args.limit || 100));
  if (args.clear) consoleMessages.set(args.tabId, []);
  if (!msgs.length) return text('No console messages matching pattern.');
  return text(msgs.map(m => `[${m.level}] ${m.text}`).join('\n'));
}

async function read_network_requests(args) {
  await ensureDomain(args.tabId, 'Network');
  let reqs = networkRequests.get(args.tabId) || [];
  if (args.urlPattern) reqs = reqs.filter(r => r.url.includes(args.urlPattern));
  reqs = reqs.slice(-(args.limit || 100));
  if (args.clear) networkRequests.set(args.tabId, []);
  if (!reqs.length) return text('No network requests matching pattern.');
  return text(reqs.map(r => `${r.method} ${r.url} ${r.status ? `→ ${r.status}` : '(pending)'}`).join('\n'));
}

async function gif_creator() { return text('GIF recording not yet implemented.'); }

async function resize_window(args) {
  if (!(await isInGroup(args.tabId))) return err('Tab not in MCP group.');
  const tab = await chrome.tabs.get(args.tabId);
  await chrome.windows.update(tab.windowId, { width: args.width, height: args.height });
  return text(`Resized to ${args.width}x${args.height}`);
}

async function shortcuts_list() { return text('No shortcuts available.'); }
async function shortcuts_execute() { return text('Shortcuts not supported.'); }
async function switch_browser() { return text('To switch browsers: disable extension in current browser, enable in target, restart both.'); }

async function update_plan(args) {
  let t = `Plan:\nDomains: ${(args.domains || []).join(', ')}\nApproach:\n`;
  for (const s of (args.approach || [])) t += `- ${s}\n`;
  t += '\nPlan auto-approved.';
  return text(t);
}

async function upload_image(args) {
  const store = getScreenshotStore();
  if (!store.has(args.imageId)) return err(`Image ${args.imageId} not found. Take a screenshot first.`);
  return text(`Image ${args.imageId} ready for upload. Use ref or coordinate to target.`);
}

// --- Export ---

export const toolHandlers = {
  tabs_context_mcp, tabs_create_mcp, navigate, computer, find, form_input,
  get_page_text, read_page, javascript_tool, read_console_messages,
  read_network_requests, gif_creator, resize_window, shortcuts_list,
  shortcuts_execute, switch_browser, update_plan, upload_image,
  ...advancedToolHandlers,
};
