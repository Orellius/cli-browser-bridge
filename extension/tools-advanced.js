// Advanced tool handlers — new in CLI Browser Bridge v2.
// wait_for, storage, dom_query

import { cdp, ensureAttached, sleep } from './cdp.js';
import { isInGroup } from './tabs.js';

function notInGroup(tabId) {
  return { content: [{ type: "text", text: `Tab ${tabId} is not in the MCP group.` }] };
}

async function sendContentMessage(tabId, message) {
  try {
    return await chrome.tabs.sendMessage(tabId, message);
  } catch {
    await chrome.scripting.executeScript({ target: { tabId }, files: ["content.js"] });
    return chrome.tabs.sendMessage(tabId, message);
  }
}

export const advancedToolHandlers = {
  async wait_for(args) {
    const { tabId, condition, selector, text, predicate, pierceShadow = true } = args;
    if (!(await isInGroup(tabId))) return notInGroup(tabId);

    const timeout = Math.min(args.timeout || 10, 30) * 1000;
    const pollInterval = 200;
    const start = Date.now();

    while (Date.now() - start < timeout) {
      let met = false;

      switch (condition) {
        case "element_visible": {
          if (!selector) return { content: [{ type: "text", text: "selector required for element_visible" }] };
          const resp = await sendContentMessage(tabId, {
            type: "querySelector", selector, pierceShadow,
          });
          met = resp?.result?.visible === true;
          break;
        }
        case "element_hidden": {
          if (!selector) return { content: [{ type: "text", text: "selector required for element_hidden" }] };
          const resp = await sendContentMessage(tabId, {
            type: "querySelector", selector, pierceShadow,
          });
          met = !resp?.result || resp.result.visible === false;
          break;
        }
        case "text_match": {
          if (!text) return { content: [{ type: "text", text: "text required for text_match" }] };
          await ensureAttached(tabId);
          const result = await cdp(tabId, "Runtime.evaluate", {
            expression: `document.body?.innerText || ""`,
            returnByValue: true,
          });
          const pageText = result?.result?.value || "";
          try {
            met = new RegExp(text, "i").test(pageText);
          } catch {
            met = pageText.includes(text);
          }
          break;
        }
        case "network_idle": {
          await sleep(1000);
          met = true; // simplified — wait 1s of no activity
          break;
        }
        case "js_predicate": {
          if (!predicate) return { content: [{ type: "text", text: "predicate required for js_predicate" }] };
          await ensureAttached(tabId);
          const result = await cdp(tabId, "Runtime.evaluate", {
            expression: predicate,
            returnByValue: true,
            awaitPromise: true,
          });
          met = !!result?.result?.value;
          break;
        }
        default:
          return { content: [{ type: "text", text: `Unknown condition: ${condition}` }] };
      }

      if (met) {
        const elapsed = ((Date.now() - start) / 1000).toFixed(1);
        return { content: [{ type: "text", text: `Condition "${condition}" met after ${elapsed}s` }] };
      }
      await sleep(pollInterval);
    }

    return { content: [{ type: "text", text: `Timeout: "${condition}" not met within ${timeout / 1000}s` }] };
  },

  async storage(args) {
    const { tabId, action, store = "localStorage", key, value } = args;
    if (!(await isInGroup(tabId))) return notInGroup(tabId);
    await ensureAttached(tabId);

    switch (action) {
      case "get": {
        if (!key) return { content: [{ type: "text", text: "key required" }] };
        const r = await cdp(tabId, "Runtime.evaluate", {
          expression: `${store}.getItem(${JSON.stringify(key)})`,
          returnByValue: true,
        });
        return { content: [{ type: "text", text: r?.result?.value ?? "null" }] };
      }
      case "set": {
        if (!key) return { content: [{ type: "text", text: "key required" }] };
        await cdp(tabId, "Runtime.evaluate", {
          expression: `${store}.setItem(${JSON.stringify(key)}, ${JSON.stringify(value || "")})`,
        });
        return { content: [{ type: "text", text: `Set ${store}["${key}"]` }] };
      }
      case "delete": {
        if (!key) return { content: [{ type: "text", text: "key required" }] };
        await cdp(tabId, "Runtime.evaluate", {
          expression: `${store}.removeItem(${JSON.stringify(key)})`,
        });
        return { content: [{ type: "text", text: `Deleted ${store}["${key}"]` }] };
      }
      case "list": {
        const r = await cdp(tabId, "Runtime.evaluate", {
          expression: `JSON.stringify(Object.keys(${store}))`,
          returnByValue: true,
        });
        return { content: [{ type: "text", text: r?.result?.value || "[]" }] };
      }
      case "get_cookies": {
        const tab = await chrome.tabs.get(tabId);
        const url = tab.url;
        const cookies = await chrome.cookies.getAll({ url });
        const text = cookies.map(c => `${c.name}=${c.value} (${c.domain})`).join("\n");
        return { content: [{ type: "text", text: text || "No cookies" }] };
      }
      default:
        return { content: [{ type: "text", text: `Unknown storage action: ${action}` }] };
    }
  },

  async dom_query(args) {
    const { tabId, selector, pierceShadow = true, includeStyles = false, limit = 20 } = args;
    if (!(await isInGroup(tabId))) return notInGroup(tabId);

    const resp = await sendContentMessage(tabId, {
      type: "domQuery", selector, pierceShadow, includeStyles, limit,
    });

    if (!resp?.result || resp.result.length === 0) {
      return { content: [{ type: "text", text: `No elements match "${selector}"` }] };
    }

    let text = `Found ${resp.result.length} element(s) for "${selector}":\n\n`;
    for (const el of resp.result) {
      text += `[${el.ref}] <${el.tag}> "${el.text}" at (${el.x}, ${el.y}) ${el.w}x${el.h}`;
      if (el.styles) text += ` styles: ${JSON.stringify(el.styles)}`;
      text += "\n";
    }
    return { content: [{ type: "text", text }] };
  },
};
