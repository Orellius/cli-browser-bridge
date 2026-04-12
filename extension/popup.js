const dot = document.getElementById("dot");
const statusText = document.getElementById("status");
const tabCount = document.getElementById("tab-count");
const lastActivity = document.getElementById("last-activity");
const reconnectBtn = document.getElementById("reconnect");

function relativeTime(ts) {
  if (!ts) return "—";
  const diff = Math.floor((Date.now() - ts) / 1000);
  if (diff < 5) return "just now";
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  return `${Math.floor(diff / 3600)}h ago`;
}

function update() {
  chrome.runtime.sendMessage({ type: "getStatus" }, (resp) => {
    if (chrome.runtime.lastError || !resp) {
      dot.className = "dot disconnected";
      statusText.textContent = "Service worker unavailable";
      return;
    }

    if (resp.connected) {
      dot.className = "dot connected";
      statusText.textContent = "Connected";
    } else {
      dot.className = "dot disconnected";
      statusText.textContent = "Disconnected";
    }

    tabCount.textContent = resp.tabCount || 0;
    lastActivity.textContent = relativeTime(resp.lastMessageTimestamp);
  });
}

reconnectBtn.addEventListener("click", () => {
  reconnectBtn.textContent = "Reconnecting...";
  chrome.runtime.sendMessage({ type: "reconnect" }, () => {
    setTimeout(() => {
      reconnectBtn.textContent = "Reconnect";
      update();
    }, 1500);
  });
});

update();
setInterval(update, 2000);
