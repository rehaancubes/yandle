(function () {
  try {
    var scriptEl = document.currentScript;
    if (!scriptEl) return;

    var handle = (scriptEl.getAttribute("data-handle") || "")
      .toLowerCase().replace(/[^a-z0-9-]/g, "").replace(/^-+|-+$/g, "");
    if (!handle) return;

    var color    = scriptEl.getAttribute("data-color")    || "#6366f1";
    var bg       = scriptEl.getAttribute("data-bg")       || "#ffffff";
    var position = scriptEl.getAttribute("data-position") || "bottom-right";
    var label    = scriptEl.getAttribute("data-label")    || "Chat";
    // data-origin MUST point to the Voxa app host (set by the Dashboard snippet generator).
    // Never fall back to window.location.origin — that would iframe the host page itself.
    var origin = (scriptEl.getAttribute("data-origin") || "").replace(/\/$/, "");
    if (!origin) return;

    var isRight = position !== "bottom-left";
    var ICON_CHAT = '<svg width="24" height="24" fill="none" stroke="white" stroke-width="2" viewBox="0 0 24 24"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>';
    var ICON_CLOSE = '<svg width="20" height="20" fill="none" stroke="white" stroke-width="2.5" viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>';

    /* ── wrapper ── */
    var wrapper = document.createElement("div");
    wrapper.style.cssText =
      "position:fixed;bottom:20px;" + (isRight ? "right" : "left") + ":20px;" +
      "z-index:2147483647;font-family:system-ui,-apple-system,BlinkMacSystemFont,sans-serif;";

    /* ── chat panel ── */
    var panel = document.createElement("div");
    panel.style.cssText =
      "display:none;margin-bottom:12px;border-radius:16px;overflow:hidden;" +
      "box-shadow:0 8px 32px rgba(0,0,0,0.22);background:" + bg + ";";

    var iframe = document.createElement("iframe");
    iframe.src = origin.replace(/\/$/, "") + "/shareable/" + encodeURIComponent(handle) + "?embed=1";
    iframe.style.cssText = "width:360px;height:520px;border:none;display:block;";
    iframe.allow = "microphone; clipboard-read; clipboard-write";
    iframe.title = label;

    panel.appendChild(iframe);

    /* ── bubble button ── */
    var bubble = document.createElement("button");
    bubble.innerHTML = ICON_CHAT;
    bubble.title = label;
    bubble.style.cssText =
      "width:60px;height:60px;border-radius:50%;border:none;padding:0;" +
      "background:" + color + ";cursor:pointer;display:flex;align-items:center;" +
      "justify-content:center;box-shadow:0 4px 16px rgba(0,0,0,0.22);" +
      "transition:transform 0.15s;outline:none;";
    bubble.onmouseenter = function () { bubble.style.transform = "scale(1.08)"; };
    bubble.onmouseleave = function () { bubble.style.transform = "scale(1)"; };

    wrapper.appendChild(panel);
    wrapper.appendChild(bubble);
    document.body.appendChild(wrapper);

    /* ── toggle ── */
    var open = false;
    bubble.addEventListener("click", function () {
      open = !open;
      panel.style.display = open ? "block" : "none";
      bubble.innerHTML = open ? ICON_CLOSE : ICON_CHAT;
    });

    /* ── postMessage from iframe ── */
    window.addEventListener("message", function (e) {
      if (!e.data || e.data.type !== "voxa-embed") return;
      if (e.data.action === "expand") {
        iframe.style.width  = "420px";
        iframe.style.height = "600px";
      } else if (e.data.action === "collapse") {
        iframe.style.width  = "360px";
        iframe.style.height = "520px";
      } else if (e.data.action === "close") {
        open = false;
        panel.style.display = "none";
        bubble.innerHTML = ICON_CHAT;
      }
    });
  } catch (e) { /* fail silently on host page */ }
})();
