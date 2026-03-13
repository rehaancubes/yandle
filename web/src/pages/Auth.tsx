import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Eye, EyeOff, Loader2, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import {
  signIn,
  signUp,
  confirmSignUp,
  resendConfirmationCode,
  forgotPassword,
  confirmForgotPassword,
  isAuthenticated,
  getOnboardingStorageKey,
  getCurrentUserSub,
} from "@/lib/auth";

const apiBase = (import.meta.env.VITE_API_BASE_URL || "").replace(/\/$/, "");

type Screen = "main" | "otp" | "forgot" | "forgot-otp";

export default function Auth() {
  const navigate = useNavigate();
  const { toast } = useToast();

  const [screen, setScreen] = useState<Screen>("main");
  const [tab, setTab] = useState<"signin" | "signup">("signin");
  const [loading, setLoading] = useState(false);
  const [showPass, setShowPass] = useState(false);

  // Form state
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPass, setConfirmPass] = useState("");
  const [otp, setOtp] = useState("");
  const [newPass, setNewPass] = useState("");
  const [error, setError] = useState("");

  const clearError = () => setError("");

  async function handleAfterLogin() {
    // Check if user needs onboarding
    const sub = getCurrentUserSub();
    const storageKey = getOnboardingStorageKey(sub);
    const hasOnboarding = localStorage.getItem(storageKey);
    if (hasOnboarding) {
      navigate("/dashboard", { replace: true });
      return;
    }
    // Check if they already have a handle in the API
    if (apiBase) {
      try {
        const res = await fetch(`${apiBase}/handles`, {
          headers: { authorization: `Bearer ${localStorage.getItem("voxa_id_token") || ""}` },
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

  async function handleSignIn(e: React.FormEvent) {
    e.preventDefault();
    if (!email || !password) return;
    setLoading(true);
    clearError();
    const result = await signIn(email, password);
    setLoading(false);
    if (result.ok) {
      await handleAfterLogin();
    } else if (result.needsConfirmation) {
      setScreen("otp");
      setError("");
      toast({ title: "Check your email", description: "Enter the verification code we sent you." });
    } else {
      setError(result.error || "Sign in failed.");
    }
  }

  async function handleSignUp(e: React.FormEvent) {
    e.preventDefault();
    if (!email || !password) return;
    if (password !== confirmPass) {
      setError("Passwords do not match.");
      return;
    }
    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    setLoading(true);
    clearError();
    const result = await signUp(email, password);
    setLoading(false);
    if (result.ok) {
      setScreen("otp");
      toast({ title: "Check your email", description: "We sent a verification code to " + email });
    } else {
      setError(result.error || "Sign up failed.");
    }
  }

  async function handleOtp(e: React.FormEvent) {
    e.preventDefault();
    if (!otp) return;
    setLoading(true);
    clearError();
    const result = await confirmSignUp(email, otp);
    setLoading(false);
    if (result.ok) {
      // Auto sign-in after verification
      const loginResult = await signIn(email, password);
      if (loginResult.ok) {
        toast({ title: "Email verified!", description: "Welcome to Yandle." });
        await handleAfterLogin();
      } else {
        toast({ title: "Verified!", description: "Please sign in." });
        setScreen("main");
        setTab("signin");
      }
    } else {
      setError(result.error || "Verification failed.");
    }
  }

  async function handleResendOtp() {
    setLoading(true);
    const result = await resendConfirmationCode(email);
    setLoading(false);
    if (result.ok) {
      toast({ title: "Code resent", description: "Check your inbox." });
    } else {
      setError(result.error || "Could not resend code.");
    }
  }

  async function handleForgotPassword(e: React.FormEvent) {
    e.preventDefault();
    if (!email) return;
    setLoading(true);
    clearError();
    const result = await forgotPassword(email);
    setLoading(false);
    if (result.ok) {
      setScreen("forgot-otp");
      toast({ title: "Code sent", description: "Enter the code from your email." });
    } else {
      setError(result.error || "Could not send reset code.");
    }
  }

  async function handleResetPassword(e: React.FormEvent) {
    e.preventDefault();
    if (!otp || !newPass) return;
    if (newPass.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    setLoading(true);
    clearError();
    const result = await confirmForgotPassword(email, otp, newPass);
    setLoading(false);
    if (result.ok) {
      toast({ title: "Password reset!", description: "Please sign in with your new password." });
      setScreen("main");
      setTab("signin");
      setOtp("");
      setNewPass("");
    } else {
      setError(result.error || "Reset failed.");
    }
  }

  // ─── OTP screen ─────────────────────────────────────────────────────────────
  if (screen === "otp") {
    return (
      <AuthShell>
        <Card className="w-full max-w-md bg-card/80 border-border/60 backdrop-blur">
          <CardHeader>
            <Button variant="ghost" size="sm" className="w-fit -ml-2 mb-2" onClick={() => { setScreen("main"); clearError(); }}>
              <ArrowLeft className="h-4 w-4 mr-1" /> Back
            </Button>
            <CardTitle className="text-2xl font-display">Verify your email</CardTitle>
            <CardDescription>Enter the 6-digit code sent to <span className="text-foreground font-medium">{email}</span></CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleOtp} className="space-y-4">
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

  // ─── Forgot password - enter email ──────────────────────────────────────────
  if (screen === "forgot") {
    return (
      <AuthShell>
        <Card className="w-full max-w-md bg-card/80 border-border/60 backdrop-blur">
          <CardHeader>
            <Button variant="ghost" size="sm" className="w-fit -ml-2 mb-2" onClick={() => { setScreen("main"); clearError(); }}>
              <ArrowLeft className="h-4 w-4 mr-1" /> Back
            </Button>
            <CardTitle className="text-2xl font-display">Reset password</CardTitle>
            <CardDescription>We'll send a code to your email</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleForgotPassword} className="space-y-4">
              {error && <p className="text-sm text-destructive">{error}</p>}
              <div className="space-y-1">
                <Label>Email</Label>
                <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" autoFocus />
              </div>
              <Button type="submit" className="w-full" disabled={loading || !email}>
                {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                Send code
              </Button>
            </form>
          </CardContent>
        </Card>
      </AuthShell>
    );
  }

  // ─── Forgot password - enter OTP + new password ─────────────────────────────
  if (screen === "forgot-otp") {
    return (
      <AuthShell>
        <Card className="w-full max-w-md bg-card/80 border-border/60 backdrop-blur">
          <CardHeader>
            <CardTitle className="text-2xl font-display">New password</CardTitle>
            <CardDescription>Enter the code sent to {email} and choose a new password</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleResetPassword} className="space-y-4">
              {error && <p className="text-sm text-destructive">{error}</p>}
              <div className="space-y-1">
                <Label>Code</Label>
                <Input value={otp} onChange={(e) => setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))} placeholder="123456" maxLength={6} />
              </div>
              <div className="space-y-1">
                <Label>New password</Label>
                <PasswordInput value={newPass} onChange={setNewPass} show={showPass} onToggle={() => setShowPass(!showPass)} />
              </div>
              <Button type="submit" className="w-full" disabled={loading || !otp || !newPass}>
                {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                Reset password
              </Button>
            </form>
          </CardContent>
        </Card>
      </AuthShell>
    );
  }

  // ─── Main screen ─────────────────────────────────────────────────────────────
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
          <CardTitle className="text-2xl font-display">
            {tab === "signin" ? "Welcome back" : "Create your account"}
          </CardTitle>
          <CardDescription>
            {tab === "signin" ? "Sign in to your business dashboard" : "Start your free Yandle business account"}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs value={tab} onValueChange={(v) => { setTab(v as any); clearError(); }}>
            <TabsList className="w-full mb-4">
              <TabsTrigger value="signin" className="flex-1">Sign In</TabsTrigger>
              <TabsTrigger value="signup" className="flex-1">Sign Up</TabsTrigger>
            </TabsList>

            <TabsContent value="signin">
              <form onSubmit={handleSignIn} className="space-y-4">
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
                <div className="space-y-1">
                  <Label>Password</Label>
                  <PasswordInput value={password} onChange={setPassword} show={showPass} onToggle={() => setShowPass(!showPass)} />
                </div>
                <Button
                  type="button"
                  variant="link"
                  size="sm"
                  className="h-auto p-0 text-muted-foreground hover:text-foreground"
                  onClick={() => { setScreen("forgot"); clearError(); }}
                >
                  Forgot password?
                </Button>
                <Button type="submit" className="w-full" disabled={loading || !email || !password}>
                  {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                  Sign In
                </Button>
              </form>
            </TabsContent>

            <TabsContent value="signup">
              <form onSubmit={handleSignUp} className="space-y-4">
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
                <div className="space-y-1">
                  <Label>Password</Label>
                  <PasswordInput value={password} onChange={setPassword} show={showPass} onToggle={() => setShowPass(!showPass)} />
                  <p className="text-xs text-muted-foreground">At least 8 characters</p>
                </div>
                <div className="space-y-1">
                  <Label>Confirm Password</Label>
                  <Input
                    type={showPass ? "text" : "password"}
                    value={confirmPass}
                    onChange={(e) => setConfirmPass(e.target.value)}
                    placeholder="••••••••"
                    autoComplete="new-password"
                  />
                </div>
                <Button type="submit" className="w-full" disabled={loading || !email || !password || !confirmPass}>
                  {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                  Create Account
                </Button>
                <p className="text-xs text-muted-foreground text-center">
                  We'll send a verification code to your email.
                </p>
              </form>
            </TabsContent>
          </Tabs>
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

function PasswordInput({
  value,
  onChange,
  show,
  onToggle,
  placeholder = "••••••••",
  autoComplete = "current-password",
}: {
  value: string;
  onChange: (v: string) => void;
  show: boolean;
  onToggle: () => void;
  placeholder?: string;
  autoComplete?: string;
}) {
  return (
    <div className="relative">
      <Input
        type={show ? "text" : "password"}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        autoComplete={autoComplete}
        className="pr-10"
      />
      <button
        type="button"
        onClick={onToggle}
        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
      >
        {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
      </button>
    </div>
  );
}
