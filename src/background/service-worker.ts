/**
 * NIBM ACA Timetable Exporter - Background Service Worker (Manifest V3)
 */

chrome.runtime.onInstalled.addListener(() => {
  console.log('[NIBM Exporter] Extension installed successfully.');
});

// Update badge or state when active tab changes
chrome.tabs.onActivated.addListener(async (activeInfo) => {
  try {
    const tab = await chrome.tabs.get(activeInfo.tabId);
    if (tab.url && tab.url.includes('aca.mynibm.com')) {
      chrome.action.setBadgeText({ text: 'ACA', tabId: activeInfo.tabId });
      chrome.action.setBadgeBackgroundColor({ color: '#1B5E8C', tabId: activeInfo.tabId });
    } else {
      chrome.action.setBadgeText({ text: '', tabId: activeInfo.tabId });
    }
  } catch {
    // Tab might be closing
  }
});
