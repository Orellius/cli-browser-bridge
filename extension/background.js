// CLI Browser Bridge — service worker entry point.
// Handles native messaging, CDP events, tool dispatch, popup status.

import { toolHandlers, consoleMessages, networkRequests } from './tools.js';
import { recoverTabGroupState, getTabGroupTabs, getTabGroupId } from './tabs.js';

self.addEventListener("unhandledrejection", (e) => e.preventDefault());

const NATIVE_HOST_NAME = "com.orellius.browser_bridge";

let nativePort = null;
let lastMessageTimestamp = 0;

// --- Keep-alive ---
chrome.alarms.create("keepalive", { periodInMinutes: 0.4 });
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === "keepalive" && !nativePort) connectNativeHost();
});

// --- Native messaging ---
function connectNativeHost() {
  if (nativePort) return;
  try {
    nativePort = chrome.runtime.connectNative(NATIVE_HOST_NAME);

    nativePort.onMessage.addListener((msg) => {
      lastMessageTimestamp = Date.now();
      if (msg.type === "tool_request" && msg.id) {
        handleToolRequest(msg.id, msg.tool, msg.args || {});
      }
    });

    nativePort.onDisconnect.addListener(() => {
      const err = chrome.runtime.lastError;
      console.error("[bridge] native host disconnected:", err?.message || "no error");
      nativePort = null;
      setTimeout(connectNativeHost, 2000);
    });
  } catch (e) {
    console.error("[bridge] connectNative threw:", e);
    nativePort = null;
    setTimeout(connectNativeHost, 2000);
  }
}

function sendResponse(id, result) {
  if (!nativePort) return;
  try {
    nativePort.postMessage({ id, type: "tool_response", result });
  } catch { /* disconnected */ }
}

function sendError(id, error) {
  if (!nativePort) return;
  try {
    nativePort.postMessage({ id, type: "tool_error", error: String(error) });
  } catch { /* disconnected */ }
}

// --- CDP event listeners ---
chrome.debugger.onEvent.addListener((source, method, params) => {
  const tabId = source.tabId;

  if (method === "Console.messageAdded" && params.message) {
    const msgs = consoleMessages.get(tabId) || [];
    msgs.push({
      level: params.message.level,
      text: params.message.text,
      url: params.message.url || "",
      timestamp: Date.now(),
    });
    if (msgs.length > 1000) msgs.splice(0, msgs.length - 1000);
    consoleMessages.set(tabId, msgs);
  }

  if (method === "Runtime.consoleAPICalled" && params.args) {
    const msgs = consoleMessages.get(tabId) || [];
    const text = params.args.map((a) => a.value ?? a.description ?? "").join(" ");
    msgs.push({
      level: params.type || "log",
      text,
      url: params.stackTrace?.callFrames?.[0]?.url || "",
      timestamp: Date.now(),
    });
    if (msgs.length > 1000) msgs.splice(0, msgs.length - 1000);
    consoleMessages.set(tabId, msgs);
  }

  if (method === "Network.responseReceived" && params.response) {
    const reqs = networkRequests.get(tabId) || [];
    reqs.push({
      url: params.response.url,
      method: "GET",
      status: params.response.status,
      statusText: params.response.statusText,
      type: params.type || "Other",
      mimeType: params.response.mimeType,
      timestamp: Date.now(),
    });
    if (reqs.length > 1000) reqs.splice(0, reqs.length - 1000);
    networkRequests.set(tabId, reqs);
  }

  if (method === "Network.requestWillBeSent" && params.request) {
    const reqs = networkRequests.get(tabId) || [];
    reqs.push({
      url: params.request.url,
      method: params.request.method,
      status: 0,
      type: params.type || "Other",
      timestamp: Date.now(),
    });
    if (reqs.length > 1000) reqs.splice(0, reqs.length - 1000);
    networkRequests.set(tabId, reqs);
  }
});

// --- Tool dispatch ---
async function handleToolRequest(id, tool, args) {
  // Check advanced tools first, then core
  const handler = toolHandlers[tool];
  if (!handler) {
    sendError(id, `Unknown tool: ${tool}`);
    return;
  }
  try {
    const result = await handler(args);
    sendResponse(id, result);
  } catch (err) {
    sendError(id, `${tool} failed: ${err.message}`);
  }
}

// --- Popup status ---
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.type === "getStatus") {
    sendResponse({
      connected: nativePort !== null,
      tabGroupId: getTabGroupId(),
      tabCount: getTabGroupTabs().size,
      lastMessageTimestamp,
    });
    return false;
  }
  if (msg.type === "reconnect") {
    if (nativePort) {
      try { nativePort.disconnect(); } catch {}
      nativePort = null;
    }
    connectNativeHost();
    sendResponse({ ok: true });
    return true;
  }
  if (msg.type === "disconnect") {
    if (nativePort) {
      try { nativePort.disconnect(); } catch {}
      nativePort = null;
    }
    // Clear keepalive so it doesn't auto-reconnect
    chrome.alarms.clear("keepalive");
    sendResponse({ ok: true });
    return true;
  }
});

// --- Init ---
recoverTabGroupState();
connectNativeHost();
