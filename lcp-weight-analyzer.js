(function () {
  const longTasks = [];
  let lastLcpEntry = null;
  const DEFAULT_CDN_URL =
    "https://dendysatrya.github.io/lcp-weight-analyzer/lcp-weight-analyzer.js";

  const longTaskObserver = new PerformanceObserver((list) => {
    for (const entry of list.getEntries()) {
      longTasks.push(entry);
    }
  });

  const lcpObserver = new PerformanceObserver((list) => {
    const entries = list.getEntries();
    if (entries.length) {
      lastLcpEntry = entries[entries.length - 1];
    }
  });

  try {
    longTaskObserver.observe({ entryTypes: ["longtask"], buffered: true });
  } catch (e) {
    console.warn("[LCPWeightAnalyzer] LongTask observer unavailable", e);
  }

  try {
    lcpObserver.observe({ type: "largest-contentful-paint", buffered: true });
  } catch (e) {
    console.warn("[LCPWeightAnalyzer] LCP observer unavailable", e);
  }

  function getNavigationEntry() {
    const nav = performance.getEntriesByType("navigation");
    return nav && nav[0];
  }

  function getLcpEntry() {
    if (lastLcpEntry) return lastLcpEntry;
    const entries = performance.getEntriesByType("largest-contentful-paint");
    return entries[entries.length - 1] || null;
  }

  function getResourceForLcp(lcpEntry) {
    if (!lcpEntry || !lcpEntry.url) return null;
    const resources = performance.getEntriesByType("resource");
    const match = resources
      .filter((r) => r.name === lcpEntry.url)
      .sort((a, b) => b.responseEnd - a.responseEnd)[0];
    return match || null;
  }

  function sumLongTasksBefore(time) {
    return longTasks
      .filter((task) => task.startTime < time)
      .reduce((sum, task) => sum + task.duration, 0);
  }

  function aggregateLongTasks(time, limit = 5) {
    const buckets = new Map();
    for (const task of longTasks) {
      if (task.startTime >= time) continue;
      const firstAttribution =
        Array.isArray(task.attribution) && task.attribution[0];
      const name =
        firstAttribution?.name || firstAttribution?.containerName || "unknown";
      const key = name || "unknown";
      buckets.set(key, (buckets.get(key) || 0) + task.duration);
    }
    return Array.from(buckets.entries())
      .map(([name, duration]) => ({ name, duration }))
      .sort((a, b) => b.duration - a.duration)
      .slice(0, limit);
  }

  function computeWeights() {
    const nav = getNavigationEntry();
    const lcp = getLcpEntry();
    if (!lcp) {
      return { error: "No LCP entry recorded yet." };
    }

    const lcpTime = lcp.startTime || lcp.renderTime || lcp.loadTime || 0;
    const resource = getResourceForLcp(lcp);

    const networkTime = resource
      ? Math.max(0, resource.responseEnd - resource.fetchStart)
      : 0;
    const jsBlockingTime = sumLongTasksBefore(lcpTime);
    const baseReady = resource?.responseEnd ?? nav?.responseEnd ?? 0;
    const renderDelayRaw = lcpTime - baseReady - jsBlockingTime;
    const renderDelay = Math.max(0, renderDelayRaw);
    const explained = networkTime + jsBlockingTime + renderDelay;
    const idle = Math.max(0, lcpTime - explained);

    const total = lcpTime || explained || 1;

    return {
      lcpTime,
      lcpEntry: simplifyLcp(lcp),
      resource: simplifyResource(resource),
      weights: {
        networkTime,
        jsBlockingTime,
        renderDelay,
        idle,
      },
      percentages: {
        network: (networkTime / total) * 100,
        jsBlocking: (jsBlockingTime / total) * 100,
        renderDelay: (renderDelay / total) * 100,
        idle: (idle / total) * 100,
      },
      longTasks: aggregateLongTasks(lcpTime),
      timeline: buildTimeline(lcpTime, resource, nav),
    };
  }

  function simplifyLcp(entry) {
    if (!entry) return null;
    const element = entry.element;
    return {
      url: entry.url || null,
      tagName: element?.tagName || null,
      size: entry.size,
      startTime: entry.startTime,
      renderTime: entry.renderTime,
      loadTime: entry.loadTime,
      id: element?.id || null,
      classList: element?.className || null,
      text:
        element && element.textContent
          ? truncate(element.textContent.trim(), 60)
          : null,
    };
  }

  function simplifyResource(resource) {
    if (!resource) return null;
    return {
      name: resource.name,
      initiatorType: resource.initiatorType,
      transferSize: resource.transferSize,
      encodedBodySize: resource.encodedBodySize,
      decodedBodySize: resource.decodedBodySize,
      startTime: resource.startTime,
      fetchStart: resource.fetchStart,
      responseStart: resource.responseStart,
      responseEnd: resource.responseEnd,
      duration: resource.duration,
    };
  }

  function buildTimeline(lcpTime, resource, nav) {
    const events = [];
    if (nav) {
      events.push({ label: "Navigation Start", time: 0 });
      events.push({ label: "Response End", time: nav.responseEnd });
    }
    if (resource) {
      events.push({ label: "LCP Fetch Start", time: resource.fetchStart });
      events.push({ label: "LCP Response End", time: resource.responseEnd });
    }
    events.push({ label: "LCP", time: lcpTime });
    return events.sort((a, b) => a.time - b.time);
  }

  function truncate(str, len) {
    if (str.length <= len) return str;
    return str.slice(0, len - 3) + "...";
  }

  function formatMs(num) {
    if (typeof num !== "number" || Number.isNaN(num)) return "—";
    return Math.round(num).toLocaleString() + " ms";
  }

  function makeBarSegment(label, percent, color) {
    const width = Math.max(0, Math.min(100, percent));
    return `<div class="lcpwa-segment" style="width:${width}%;background:${color}" title="${label}: ${percent.toFixed(
      1
    )}%"></div>`;
  }

  function ensureStyles() {
    const STYLE_ID = "lcpwa-style";
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
      .lcpwa-card { background:#fff;color:#0f172a;padding:16px;border-radius:12px;box-shadow:0 6px 18px rgba(0,0,0,0.08);font-family:system-ui,-apple-system,"Segoe UI",sans-serif; }
      .lcpwa-header { display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;gap:12px; }
      .lcpwa-label { text-transform:uppercase;font-size:12px;letter-spacing:0.05em;color:#64748b; }
      .lcpwa-value { font-size:32px;font-weight:700; }
      .lcpwa-chip { background:#e2e8f0;color:#0f172a;padding:6px 10px;border-radius:999px;font-weight:600;font-size:13px; }
      .lcpwa-bar { display:flex;height:18px;border-radius:12px;overflow:hidden;background:#e2e8f0;margin:6px 0; }
      .lcpwa-segment { height:100%; }
      .lcpwa-legend { display:flex;gap:12px;font-size:13px;color:#475569;margin:8px 0 0;flex-wrap:wrap; }
      .lcpwa-dot { width:12px;height:12px;border-radius:999px;display:inline-block;margin-right:6px; }
      .lcpwa-grid { display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-top:16px; }
      .lcpwa-table { width:100%;border-collapse:collapse;font-size:14px; }
      .lcpwa-table th, .lcpwa-table td { text-align:left;padding:8px;border-bottom:1px solid #e2e8f0; }
      .lcpwa-table th { color:#475569;font-weight:600;font-size:13px; }
      @media (max-width: 720px) { .lcpwa-grid { grid-template-columns:1fr; } .lcpwa-header { flex-direction:column; align-items:flex-start; } }
    `;
    document.head.appendChild(style);
  }

  function renderReport(target) {
    const container =
      typeof target === "string" ? document.querySelector(target) : target;
    if (!container) throw new Error("LCPWeightAnalyzer: container not found");
    ensureStyles();
    const report = computeWeights();
    if (report.error) {
      container.innerHTML = `<div class="lcpwa-card">${report.error}</div>`;
      return report;
    }

    const {
      lcpTime,
      weights,
      percentages,
      lcpEntry,
      resource,
      longTasks,
      timeline,
    } = report;
    const bar = `
      <div class="lcpwa-bar" aria-label="LCP breakdown">
        ${makeBarSegment("JS blocking", percentages.jsBlocking, "#ff8c66")}
        ${makeBarSegment("Network", percentages.network, "#66b3ff")}
        ${makeBarSegment("Render delay", percentages.renderDelay, "#6edc9e")}
        ${makeBarSegment("Idle/unexplained", percentages.idle, "#cfcfcf")}
      </div>`;

    const longTaskRows = longTasks.length
      ? longTasks
          .map(
            (t) =>
              `<tr><td>${escapeHtml(t.name)}</td><td>${formatMs(
                t.duration
              )}</td></tr>`
          )
          .join("")
      : '<tr><td colspan="2">No long tasks before LCP 🎉</td></tr>';

    const resourceRows = resource
      ? `<tr>
          <td>${escapeHtml(resource.name)}</td>
          <td>${resource.initiatorType || "—"}</td>
          <td>${formatBytes(
            resource.transferSize || resource.decodedBodySize
          )}</td>
          <td>${formatMs(resource.duration)}</td>
        </tr>`
      : '<tr><td colspan="4">No matching resource found for LCP element</td></tr>';

    const timelineRows = timeline
      .map(
        (e) =>
          `<tr><td>${escapeHtml(e.label)}</td><td>${formatMs(e.time)}</td></tr>`
      )
      .join("");

    container.innerHTML = `
      <div class="lcpwa-card">
        <div class="lcpwa-header">
          <div>
            <div class="lcpwa-label">Largest Contentful Paint</div>
            <div class="lcpwa-value">${formatMs(lcpTime)}</div>
          </div>
          <div class="lcpwa-chip">${lcpEntry?.tagName || "Element"}${
      lcpEntry?.id ? " #" + lcpEntry.id : ""
    }</div>
        </div>
        ${bar}
        <div class="lcpwa-legend">
          <span><span class="lcpwa-dot" style="background:#ff8c66"></span>JS blocking</span>
          <span><span class="lcpwa-dot" style="background:#66b3ff"></span>Network</span>
          <span><span class="lcpwa-dot" style="background:#6edc9e"></span>Render delay</span>
          <span><span class="lcpwa-dot" style="background:#cfcfcf"></span>Idle/unexplained</span>
        </div>
        <div class="lcpwa-grid">
          <div>
            <h3>Top blocking scripts before LCP</h3>
            <table class="lcpwa-table">
              <thead><tr><th>Script</th><th>Blocking time</th></tr></thead>
              <tbody>${longTaskRows}</tbody>
            </table>
          </div>
          <div>
            <h3>LCP resource</h3>
            <table class="lcpwa-table">
              <thead><tr><th>URL</th><th>Type</th><th>Size</th><th>Duration</th></tr></thead>
              <tbody>${resourceRows}</tbody>
            </table>
          </div>
        </div>
        <div>
          <h3>Timeline</h3>
          <table class="lcpwa-table">
            <thead><tr><th>Event</th><th>Time</th></tr></thead>
            <tbody>${timelineRows}</tbody>
          </table>
        </div>
      </div>
    `;

    return report;
  }

  function escapeHtml(str) {
    if (str == null) return "";
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function formatBytes(bytes) {
    if (typeof bytes !== "number" || bytes <= 0) return "—";
    const units = ["B", "KB", "MB"];
    let i = 0;
    let num = bytes;
    while (num >= 1024 && i < units.length - 1) {
      num /= 1024;
      i += 1;
    }
    return `${num.toFixed(num >= 10 || num < 1 ? 0 : 1)} ${units[i]}`;
  }

  function detectScriptUrl() {
    const scripts = document.getElementsByTagName("script");
    for (const s of scripts) {
      if (s.src && s.src.includes("lcp-weight-analyzer")) return s.src;
    }
    return null;
  }

  function createBookmarklet(options = {}) {
    const useCdn = options.useCdn === true;
    const scriptUrl =
      options.scriptUrl ||
      (useCdn ? DEFAULT_CDN_URL : null) ||
      detectScriptUrl() ||
      new URL("lcp-weight-analyzer.js", location.href).href;
    const containerId = options.containerId || "lcpwa-bookmarklet-report";
    const selector = `#${containerId}`;
    const code = `(function(){var sid='${containerId}';var c=document.getElementById(sid);if(!c){c=document.createElement('div');c.id=sid;c.style.position='fixed';c.style.top='12px';c.style.right='12px';c.style.zIndex='2147483647';c.style.background='#fff';c.style.padding='12px';c.style.borderRadius='12px';c.style.boxShadow='0 10px 30px rgba(0,0,0,.2)';c.style.maxWidth='400px';c.style.width='min(90vw,400px)';c.style.maxHeight='90vh';c.style.overflow='auto';c.style.fontFamily='system-ui,-apple-system,"Segoe UI",sans-serif';document.body.appendChild(c);}function run(){if(!window.LCPWeightAnalyzer)return;try{window.LCPWeightAnalyzer.render('${selector}');}catch(e){console.error('LCPWeightAnalyzer render failed',e);}}if(!window.LCPWeightAnalyzer){var s=document.createElement('script');s.src='${scriptUrl}';s.onload=run;document.head.appendChild(s);}else{run();}})();`;
    const minified = code.replace(/\s+/g, " ");
    const hrefPlain = "javascript:" + minified;
    const hrefEncoded = "javascript:" + encodeURIComponent(minified);
    return {
      href: hrefEncoded,
      hrefPlain,
      raw: minified,
      scriptUrl,
      containerId,
    };
  }

  function exportJson(filename = "lcp-report.json", report) {
    const payload = report || computeWeights();
    if (payload?.error) return { error: payload.error };
    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1500);
    return { filename, report: payload };
  }

  window.LCPWeightAnalyzer = {
    getReport: computeWeights,
    render: renderReport,
    createBookmarklet,
    exportJson,
    cdnUrl: DEFAULT_CDN_URL,
  };
})();
