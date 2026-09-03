/**
 * NIBM ACA Timetable Exporter - Safe Page Context API Interceptor
 * 
 * Injected into the page to listen for read-only JSON responses matching
 * timetable and lecture endpoints.
 * 
 * STRICT PRIVACY GUARANTEE:
 * - NO authorization headers, cookies, or credentials are read or stored.
 * - Only response JSON bodies matching timetable keywords are checked.
 * - Data is forwarded strictly to the local content script via window.postMessage.
 */

(function initPageInterceptor() {
  // Prevent double injection
  if ((window as unknown as { __NIBM_INTERCEPTOR_ACTIVE__?: boolean }).__NIBM_INTERCEPTOR_ACTIVE__) {
    return;
  }
  (window as unknown as { __NIBM_INTERCEPTOR_ACTIVE__?: boolean }).__NIBM_INTERCEPTOR_ACTIVE__ = true;

  const TARGET_KEYWORDS = ['lectures', 'batches', 'calendar', 'schedule', 'events', 'dashboard'];

  function isTargetUrl(urlStr: string): boolean {
    if (!urlStr) return false;
    const lower = urlStr.toLowerCase();
    return TARGET_KEYWORDS.some((kw) => lower.includes(kw));
  }

  function dispatchPayload(data: unknown, sourceUrl: string) {
    if (!data || typeof data !== 'object') return;

    // Post to content script via local window message
    window.postMessage(
      {
        type: 'NIBM_ACA_API_INTERCEPTED',
        sourceUrl,
        payload: data,
      },
      window.location.origin
    );
  }

  // Intercept window.fetch
  if (typeof window.fetch === 'function') {
    const originalFetch = window.fetch;
    window.fetch = async function (...args) {
      const response = await originalFetch.apply(this, args);

      try {
        const reqUrl = typeof args[0] === 'string' ? args[0] : (args[0] as Request)?.url || '';
        if (isTargetUrl(reqUrl)) {
          const clone = response.clone();
          clone
            .json()
            .then((jsonData) => {
              dispatchPayload(jsonData, reqUrl);
            })
            .catch(() => {
              // Ignore non-JSON responses
            });
        }
      } catch {
        // Fail silently - never disrupt normal page operations
      }

      return response;
    };
  }

  // Intercept XMLHttpRequest
  if (typeof window.XMLHttpRequest === 'function') {
    const originalOpen = XMLHttpRequest.prototype.open;
    const originalSend = XMLHttpRequest.prototype.send;

    XMLHttpRequest.prototype.open = function (method: string, url: string | URL, ...rest: unknown[]) {
      (this as unknown as { __nibm_url?: string }).__nibm_url = typeof url === 'string' ? url : url.toString();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return (originalOpen as any).apply(this, [method, url, ...rest]);
    };

    XMLHttpRequest.prototype.send = function (...sendArgs: unknown[]) {
      this.addEventListener('load', () => {
        try {
          const reqUrl = (this as unknown as { __nibm_url?: string }).__nibm_url || '';
          if (isTargetUrl(reqUrl) && this.responseText) {
            const data = JSON.parse(this.responseText);
            dispatchPayload(data, reqUrl);
          }
        } catch {
          // Ignore parse errors or non-JSON payloads
        }
      });
      return originalSend.apply(this, sendArgs as [Document | XMLHttpRequestBodyInit | null | undefined]);
    };
  }
})();
