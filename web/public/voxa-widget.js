(function () {
  try {
    var scriptEl = document.currentScript;
    if (!scriptEl) return;

    var handle = scriptEl.getAttribute("data-handle") || "";
    handle = String(handle || "").toLowerCase().replace(/[^a-z0-9-]/g, "").replace(/^-+|-+$/g, "");
    if (!handle) return;

    var origin =
      scriptEl.getAttribute("data-origin") ||
      (function () {
        var loc = window.location;
        return loc.protocol + "//" + loc.host;
      })();

    var iframe = document.createElement("iframe");
    iframe.src = origin.replace(/\/$/, "") + "/" + encodeURIComponent(handle) + "?mode=widget";
    iframe.style.border = "none";
    iframe.style.width = "360px";
    iframe.style.maxWidth = "100%";
    iframe.style.height = "520px";
    iframe.style.borderRadius = "16px";
    iframe.style.boxShadow = "0 18px 45px rgba(15, 23, 42, 0.25)";
    iframe.allow = "microphone; clipboard-read; clipboard-write";

    var container = document.createElement("div");
    container.style.position = "fixed";
    container.style.zIndex = "2147483647";
    container.style.bottom = "24px";
    container.style.right = "24px";
    container.style.maxWidth = "100%";
    container.style.fontFamily = "system-ui, -apple-system, BlinkMacSystemFont, sans-serif";

    container.appendChild(iframe);
    document.body.appendChild(container);
  } catch (e) {
    // fail silently in host page
  }
})();

