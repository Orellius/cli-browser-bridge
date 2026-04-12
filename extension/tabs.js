// MCP tab group management — survives service worker restarts.

let tabGroupId = null;
let tabGroupTabs = new Set();
let recoveryDone = false;
let recoveryPromise = null;

async function recover() {
  try {
    const groups = await chrome.tabGroups.query({ title: 'MCP' });
    if (groups.length > 0) {
      tabGroupId = groups[0].id;
      const tabs = await chrome.tabs.query({ groupId: tabGroupId });
      tabGroupTabs = new Set(tabs.map(t => t.id));
    }
  } catch { /* no groups */ }
  recoveryDone = true;
}

async function waitForRecovery() {
  if (recoveryDone) return;
  if (!recoveryPromise) recoveryPromise = recover();
  await recoveryPromise;
}

export async function recoverTabGroupState() {
  await waitForRecovery();
}

export async function ensureTabGroup(createIfEmpty = false) {
  await waitForRecovery();

  // Check if cached group still exists
  if (tabGroupId !== null) {
    try {
      await chrome.tabGroups.get(tabGroupId);
      const tabs = await chrome.tabs.query({ groupId: tabGroupId });
      tabGroupTabs = new Set(tabs.map(t => t.id));
      if (tabGroupTabs.size > 0) return;
    } catch {
      tabGroupId = null;
      tabGroupTabs.clear();
    }
  }

  // Re-scan — another tool call or session may have created one
  try {
    const groups = await chrome.tabGroups.query({ title: 'MCP' });
    if (groups.length > 0) {
      tabGroupId = groups[0].id;
      const tabs = await chrome.tabs.query({ groupId: tabGroupId });
      tabGroupTabs = new Set(tabs.map(t => t.id));
      if (tabGroupTabs.size > 0) return;
    }
  } catch { /* ok */ }

  if (!createIfEmpty) return;

  // Create in the current focused window, not a new one
  const [activeTab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  const windowId = activeTab?.windowId;

  const tab = await chrome.tabs.create({
    url: 'about:blank',
    active: false,
    ...(windowId ? { windowId } : {}),
  });

  const groupId = await chrome.tabs.group({
    tabIds: [tab.id],
    ...(windowId ? { createProperties: { windowId } } : {}),
  });

  await chrome.tabGroups.update(groupId, { title: 'MCP', color: 'blue' });

  tabGroupId = groupId;
  tabGroupTabs = new Set([tab.id]);
}

export function getTabGroupId() { return tabGroupId; }
export function getTabGroupTabs() { return tabGroupTabs; }

export async function isInGroup(tabId) {
  await waitForRecovery();
  try {
    const tab = await chrome.tabs.get(tabId);
    if (tab.groupId === -1) return false;

    if (tabGroupId !== null && tab.groupId === tabGroupId) {
      tabGroupTabs.add(tabId);
      return true;
    }

    // Recovery path — check group title
    try {
      const group = await chrome.tabGroups.get(tab.groupId);
      if (group.title === 'MCP') {
        tabGroupId = group.id;
        const tabs = await chrome.tabs.query({ groupId: tabGroupId });
        tabGroupTabs = new Set(tabs.map(t => t.id));
        return true;
      }
    } catch { /* group gone */ }

    return false;
  } catch { return false; }
}

export function formatTabContext(tabs) {
  const list = tabs.map(t => ({
    tabId: t.id, title: t.title || 'Untitled', url: t.url || '',
  }));
  let out = `Tab Context:\n- Available tabs:\n`;
  for (const t of list) out += `  • tabId ${t.tabId}: "${t.title}" (${t.url})\n`;
  return {
    content: [{
      type: 'text',
      text: JSON.stringify({ availableTabs: list, tabGroupId }) + '\n\n' + out,
    }],
  };
}

// Fire recovery on module load
recoveryPromise = recover();
