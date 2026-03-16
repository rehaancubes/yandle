import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Loader2, ArrowLeft, Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import {
  sendEmailOtp,
  verifyEmailOtp,
  isAuthenticated,
  getOnboardingStorageKey,
  getCurrentUserSub,
} from "@/lib/auth";

const apiBase = (import.meta.env.VITE_API_BASE_URL || "").replace(/\/$/, "");

type Screen = "email" | "otp";

export default function Auth() {
  const navigate = useNavigate();
  const { toast } = useToast();

  const [screen, setScreen] = useState<Screen>("email");
  const [loading, setLoading] = useState(false);

  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [error, setError] = useState("");

  const clearError = () => setError("");

  async function handleAfterLogin() {
    const sub = getCurrentUserSub();
    const storageKey = getOnboardingStorageKey(sub);
    const hasOnboarding = localStorage.getItem(storageKey);
    if (hasOnboarding) {
      navigate("/dashboard", { replace: true });
      return;
    }
    if (apiBase) {
      try {
        const res = await fetch(`${apiBase}/handles`, {
          headers: { authorization: `Bearer ${localStorage.getItem("yandle_id_token") || ""}` },
        });
        if (res.ok) {
          const data = await res.json();
          if (data.handles?.length > 0) {
            navigate("/dashboard", { replace: true });
            return;
          }
        }
      } catch { /* ignore */ }
    }
    navigate("/onboarding", { replace: true });
  }

  async function handleSendOtp(e: React.FormEvent) {
    e.preventDefault();
    if (!email) return;
    setLoading(true);
    clearError();
    const result = await sendEmailOtp(email);
    setLoading(false);
    if (result.ok) {
      setOtp("");
      setScreen("otp");
      toast({ title: "Code sent", description: `We sent a verification code to ${email}` });
    } else {
      setError(result.error || "Failed to send code.");
    }
  }

  async function handleVerifyOtp(e: React.FormEvent) {
    e.preventDefault();
    if (otp.length < 6) return;
    setLoading(true);
    clearError();
    const result = await verifyEmailOtp(email, otp);
    setLoading(false);
    if (result.ok) {
      toast({ title: "Welcome to Yandle!" });
      await handleAfterLogin();
    } else {
      setError(result.error || "Verification failed.");
    }
  }

  async function handleResendOtp() {
    setLoading(true);
    clearError();
    const result = await sendEmailOtp(email);
    setLoading(false);
    if (result.ok) {
      toast({ title: "Code resent", description: "Check your inbox." });
    } else {
      setError(result.error || "Could not resend code.");
    }
  }

  // ─── OTP screen ─────────────────────────────────────────────────────────────
  if (screen === "otp") {
    return (
      <AuthShell>
        <Card className="w-full max-w-md bg-card/80 border-border/60 backdrop-blur">
          <CardHeader>
            <Button variant="ghost" size="sm" className="w-fit -ml-2 mb-2" onClick={() => { setScreen("email"); clearError(); }}>
              <ArrowLeft className="h-4 w-4 mr-1" /> Back
            </Button>
            <CardTitle className="text-2xl font-display">Check your email</CardTitle>
            <CardDescription>Enter the 6-digit code sent to <span className="text-foreground font-medium">{email}</span></CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleVerifyOtp} className="space-y-4">
              {error && <p className="text-sm text-destructive">{error}</p>}
              <div className="space-y-1">
                <Label>Verification Code</Label>
                <Input
                  value={otp}
                  onChange={(e) => setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))}
                  placeholder="123456"
                  className="text-center text-xl tracking-widest"
                  maxLength={6}
                  autoFocus
                />
              </div>
              <Button type="submit" className="w-full" disabled={loading || otp.length < 6}>
                {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                Verify
              </Button>
              <Button type="button" variant="ghost" size="sm" className="w-full text-muted-foreground" onClick={handleResendOtp} disabled={loading}>
                Resend code
              </Button>
            </form>
          </CardContent>
        </Card>
      </AuthShell>
    );
  }

  // ─── Email screen ───────────────────────────────────────────────────────────
  return (
    <AuthShell>
      <Card className="w-full max-w-md bg-card/80 border-border/60 backdrop-blur">
        <CardHeader className="pb-2">
          <div className="flex items-center gap-2 mb-1">
            <div className="h-8 w-8 rounded-lg bg-primary flex items-center justify-center">
              <span className="text-primary-foreground font-bold text-sm">Y</span>
            </div>
            <span className="font-display text-xl font-semibold">Yandle</span>
          </div>
          <CardTitle className="text-2xl font-display">Welcome to Yandle</CardTitle>
          <CardDescription>Enter your email to sign in or create an account</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSendOtp} className="space-y-4">
            {error && <p className="text-sm text-destructive">{error}</p>}
            <div className="space-y-1">
              <Label>Email</Label>
              <Input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                autoComplete="email"
                autoFocus
              />
            </div>
            <Button type="submit" className="w-full" disabled={loading || !email}>
              {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Mail className="h-4 w-4 mr-2" />}
              Send Code
            </Button>
            <p className="text-xs text-muted-foreground text-center">
              We'll send a verification code to your email. No password needed.
            </p>
          </form>
        </CardContent>
      </Card>
    </AuthShell>
  );
}

function AuthShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-background bg-grid flex items-center justify-center p-6">
      {children}
    </div>
  );
}
