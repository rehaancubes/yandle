import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { completeLoginFromHash } from "@/lib/auth";

export default function AuthCallback() {
  const navigate = useNavigate();
  const [status, setStatus] = useState("Signing you in...");

  useEffect(() => {
    const result = completeLoginFromHash(window.location.hash);
    if (!result.ok) {
      setStatus(result.error || "Authentication failed.");
      return;
    }

    setStatus("Success. Redirecting...");
    navigate("/dashboard", { replace: true });
  }, [navigate]);

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-6">
      <p className="text-sm text-muted-foreground">{status}</p>
    </div>
  );
}
