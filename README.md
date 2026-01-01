# LCP Weight Analyzer

A zero-dependency, in-page analyzer that explains why Largest Contentful Paint (LCP) is slow by attributing the time to network, JavaScript blocking, render delay, and idle gaps. Built for real-user conditions using browser performance APIs only.

## What it shows

- LCP value (ms)
- Stacked breakdown: JS blocking, Network, Render delay, Idle/unexplained
- Drill-down: top blocking scripts before LCP
- LCP resource details (size, timing)
- Simple timeline of key events
- One-click JSON export + bookmarklet generator

## Quick start

1. Open `index.html` in your browser.
2. Wait for the page to load; the analyzer renders automatically into the `#report` container.
3. Use **Export JSON** to download the report, or drag/copy the generated bookmarklet.
4. Reload with network throttling in DevTools to see how the weights shift.

## Using on another page

Copy `lcp-weight-analyzer.js` to your project and include it:

```html
<script src="/path/to/lcp-weight-analyzer.js"></script>
<script>
  // After page load or when you want the report
  window.addEventListener("load", () => {
    requestIdleCallback(
      () => {
        LCPWeightAnalyzer.render("#report");
      },
      { timeout: 2000 }
    );
  });
</script>
```

- `LCPWeightAnalyzer.getReport()` returns the raw JSON report.
- `LCPWeightAnalyzer.render(target)` renders the default UI into a DOM node or selector.
- `LCPWeightAnalyzer.exportJson(filename?, report?)` triggers a JSON download (defaults to `lcp-report.json`).
- `LCPWeightAnalyzer.createBookmarklet(options?)` returns `{ href, raw, scriptUrl, containerId }` for building bookmarklets. Supports `{ useCdn: true }` to bake a hosted URL.
- `LCPWeightAnalyzer.cdnUrl` exposes the default CDN script URL.

### Bookmarklet (quick how-to)

The demo page generates a ready-to-drag bookmarklet whose code loads `lcp-weight-analyzer.js` from the current origin, injects a fixed-position card, and renders the analyzer. You can also build one manually:

```js
const bm = LCPWeightAnalyzer.createBookmarklet({
  useCdn: true, // bake the hosted CDN URL (jsDelivr default)
  // or provide your own:
  // scriptUrl: "https://your-host/lcp-weight-analyzer.js",
  containerId: "lcpwa-bookmarklet-report", // optional override
});
console.log(bm.href); // use this as the bookmarklet URL
```

### JSON export (programmatic)

```js
// Trigger download with default filename
LCPWeightAnalyzer.exportJson();

// Or pass your own filename and precomputed report
const report = LCPWeightAnalyzer.getReport();
if (!report.error) {
  LCPWeightAnalyzer.exportJson("my-lcp.json", report);
}
```

## Attribution model

- **Network time**: Fetch start → response end of the LCP resource.
- **JS blocking time**: Sum of long tasks before LCP.
- **Render delay**: Time from resource ready → LCP, excluding long tasks.
- **Idle/unexplained**: Remaining gap so the parts ≈ LCP.

## Notes & limitations

- Requires browsers that support `PerformanceObserver` for LCP and long tasks (modern Chromium-based, Firefox, Safari TP).
- Matching the LCP element to a resource uses the LCP entry URL; if the element is text (no URL), network time will be 0.
- Data stays on the page; there is no network or storage.

Bookmarklet works best on HTTPS origins (Clipboard and downloads may be restricted on file:// URLs).
If you rely on the CDN option, ensure the URL stays reachable for your team (fork + host if needed).

## Next ideas

- Bookmarklet builder
- JSON export button
- Highlight LCP element in the DOM
