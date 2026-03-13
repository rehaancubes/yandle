import { type ReactNode, useEffect, useState } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { isAuthenticated, ensureAuthenticated } from "@/lib/auth";

export default function ProtectedRoute({ children }: { children: ReactNode }) {
  const location = useLocation();

  // Fast path: token is still valid — render immediately
  if (isAuthenticated()) {
    return children;
  }

  // Token expired — try refreshing (async)
  return <RefreshGate redirectTo="/auth" from={location.pathname}>{children}</RefreshGate>;
}

function RefreshGate({
  children,
  redirectTo,
  from,
}: {
  children: ReactNode;
  redirectTo: string;
  from: string;
}) {
  const [state, setState] = useState<"loading" | "ok" | "redirect">("loading");

  useEffect(() => {
    let cancelled = false;
    ensureAuthenticated().then((ok) => {
      if (!cancelled) setState(ok ? "ok" : "redirect");
    });
    return () => { cancelled = true; };
  }, []);

  if (state === "loading") return null; // brief flash while refreshing
  if (state === "redirect") return <Navigate to={redirectTo} replace state={{ from }} />;
  return children;
}
