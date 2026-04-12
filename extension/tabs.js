// MCP tab group management for cli-browser-bridge.
// Tracks a single "MCP" tab group across service worker restarts.

let tabGroupId = null;
let tabGroupTabs = new Set();

// --- Recovery ---

export async function recoverTabGroupState() {
  try {
    const groups = await chrome.tabGroups.query({ title: "MCP" });
    if (groups.length === 0) return;

    const group = groups[0];
    tabGroupId = group.id;
    tabGroupTabs = new Set();

    const tabs = await chrome.tabs.query({ groupId: tabGroupId });
    for (const tab of tabs) {
      tabGroupTabs.add(tab.id);
    }
  } catch {
    // tabGroups API unavailable or no groups found — stay null
  }
}

// --- Group lifecycle ---

export async function ensureTabGroup(createIfEmpty = false) {
  if (tabGroupId !== null) {
    try {
      await chrome.tabGroups.get(tabGroupId);
      return; // group still alive
    } catch {
      tabGroupId = null;
      tabGroupTabs = new Set();
    }
  }

  if (!createIfEmpty) return;

  const win = await chrome.windows.create({ focused: false });
  const tab = win.tabs[0];

  const groupId = await chrome.tabs.group({
    tabIds: [tab.id],
    createProperties: { windowId: win.id },
  });

  await chrome.tabGroups.update(groupId, { title: "MCP", color: "blue" });

  tabGroupId = groupId;
  tabGroupTabs = new Set([tab.id]);
}

// --- Query helpers ---

export function getTabGroupId() {
  return tabGroupId;
}

export function getTabGroupTabs() {
  return tabGroupTabs;
}

// --- Tab membership ---

export async function isInGroup(tabId) {
  try {
    const tab = await chrome.tabs.get(tabId);

    if (tab.groupId === chrome.tabGroups.TAB_GROUP_ID_NONE) return false;

    if (tabGroupId !== null && tab.groupId === tabGroupId) {
      tabGroupTabs.add(tabId);
      return true;
    }

    // Service worker may have restarted — check group title
    try {
      const group = await chrome.tabGroups.get(tab.groupId);
      if (group.title === "MCP") {
        tabGroupId = group.id;
        tabGroupTabs.add(tabId);
        return true;
      }
    } catch {
      // group gone
    }

    return false;
  } catch {
    return false;
  }
}

// --- Formatting ---

export function formatTabContext(tabs) {
  const structured = tabs.map((t) => ({
    id: t.id,
    title: t.title ?? "",
    url: t.url ?? t.pendingUrl ?? "",
    active: t.active,
    status: t.status,
    windowId: t.windowId,
    groupId: t.groupId === chrome.tabGroups.TAB_GROUP_ID_NONE ? null : t.groupId,
  }));

  const list = structured
    .map((t, i) => `${i + 1}. [${t.id}] ${t.title || "(untitled)"}\n   ${t.url}`)
    .join("\n");

  const text = `${structured.length} tab(s) in MCP group:\n\n${list}\n\n${JSON.stringify(structured, null, 2)}`;

  return {
    content: [{ type: "text", text }],
  };
}

// Run on module load
recoverTabGroupState();
