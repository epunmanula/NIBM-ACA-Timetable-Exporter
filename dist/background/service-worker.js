// src/background/service-worker.ts
chrome.runtime.onInstalled.addListener(() => {
  console.log("[NIBM Exporter] Extension installed successfully.");
});
chrome.tabs.onActivated.addListener(async (activeInfo) => {
  try {
    const tab = await chrome.tabs.get(activeInfo.tabId);
    if (tab.url && tab.url.includes("aca.mynibm.com")) {
      chrome.action.setBadgeText({ text: "ACA", tabId: activeInfo.tabId });
      chrome.action.setBadgeBackgroundColor({ color: "#1B5E8C", tabId: activeInfo.tabId });
    } else {
      chrome.action.setBadgeText({ text: "", tabId: activeInfo.tabId });
    }
  } catch {
  }
});
