/**
 * Embeddable widget: bubble in corner that expands to show chat + voice (same as shareable link).
 * Designed to be loaded in an iframe. Posts expand/collapse to parent so host can resize iframe.
 */
import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { MessageCircle, X } from "lucide-react";
import { Button } from "@/components/ui/button";

const EMBED_ORIGIN = typeof window !== "undefined" ? window.location.origin : "";

function postToParent(action: "expand" | "collapse") {
  try {
    if (typeof window !== "undefined" && window.parent !== window) {
      window.parent.postMessage({ type: "voxa-embed", action }, "*");
    }
  } catch {
    // ignore
  }
}

const Embed = () => {
  const { handle } = useParams();
  const safeHandle = (handle || "").toLowerCase().replace(/[^a-z0-9-]/g, "") || "demo";
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    postToParent(expanded ? "expand" : "collapse");
  }, [expanded]);

  const iframeSrc = `${EMBED_ORIGIN}/shareable/${safeHandle}?embed=1`;

  return (
    <div className="fixed bottom-0 right-0 flex flex-col items-end justify-end p-0 m-0 w-full h-full pointer-events-none">
      <div className="pointer-events-auto flex flex-col items-end gap-0" style={{ width: expanded ? 420 : "auto", height: expanded ? 600 : "auto", maxWidth: "100vw", maxHeight: "100vh" }}>
        {expanded && (
          <div className="rounded-t-xl border border-border border-b-0 bg-card shadow-xl flex flex-col w-full flex-1 min-h-0 overflow-hidden">
            <div className="flex items-center justify-between px-3 py-2 border-b border-border bg-muted/50">
              <span className="text-sm font-medium truncate">Chat & Voice</span>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 shrink-0"
                onClick={() => setExpanded(false)}
                aria-label="Close"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
            <iframe
              src={iframeSrc}
              title="Voice and chat"
              className="flex-1 w-full min-h-0 border-0 rounded-b-xl"
              style={{ height: 540 }}
            />
          </div>
        )}
        <Button
          size="icon"
          className={`rounded-full shadow-lg ${expanded ? "mt-2" : ""}`}
          style={{ width: 56, height: 56 }}
          onClick={() => setExpanded((e) => !e)}
          aria-label={expanded ? "Close" : "Open chat"}
        >
          <MessageCircle className="h-6 w-6" />
        </Button>
      </div>
    </div>
  );
};

export default Embed;
