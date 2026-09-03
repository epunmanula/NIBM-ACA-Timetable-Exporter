"use strict";
(() => {
  // src/content/page-interceptor.ts
  (function initPageInterceptor() {
    if (window.__NIBM_INTERCEPTOR_ACTIVE__) {
      return;
    }
    window.__NIBM_INTERCEPTOR_ACTIVE__ = true;
    const TARGET_KEYWORDS = ["lectures", "batches", "calendar", "schedule", "events", "dashboard"];
    function isTargetUrl(urlStr) {
      if (!urlStr) return false;
      const lower = urlStr.toLowerCase();
      return TARGET_KEYWORDS.some((kw) => lower.includes(kw));
    }
    function dispatchPayload(data, sourceUrl) {
      if (!data || typeof data !== "object") return;
      window.postMessage(
        {
          type: "NIBM_ACA_API_INTERCEPTED",
          sourceUrl,
          payload: data
        },
        window.location.origin
      );
    }
    if (typeof window.fetch === "function") {
      const originalFetch = window.fetch;
      window.fetch = async function(...args) {
        const response = await originalFetch.apply(this, args);
        try {
          const reqUrl = typeof args[0] === "string" ? args[0] : args[0]?.url || "";
          if (isTargetUrl(reqUrl)) {
            const clone = response.clone();
            clone.json().then((jsonData) => {
              dispatchPayload(jsonData, reqUrl);
            }).catch(() => {
            });
          }
        } catch {
        }
        return response;
      };
    }
    if (typeof window.XMLHttpRequest === "function") {
      const originalOpen = XMLHttpRequest.prototype.open;
      const originalSend = XMLHttpRequest.prototype.send;
      XMLHttpRequest.prototype.open = function(method, url, ...rest) {
        this.__nibm_url = typeof url === "string" ? url : url.toString();
        return originalOpen.apply(this, [method, url, ...rest]);
      };
      XMLHttpRequest.prototype.send = function(...sendArgs) {
        this.addEventListener("load", () => {
          try {
            const reqUrl = this.__nibm_url || "";
            if (isTargetUrl(reqUrl) && this.responseText) {
              const data = JSON.parse(this.responseText);
              dispatchPayload(data, reqUrl);
            }
          } catch {
          }
        });
        return originalSend.apply(this, sendArgs);
      };
    }
  })();
})();
