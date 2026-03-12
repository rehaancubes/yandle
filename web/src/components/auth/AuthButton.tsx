import { LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { isAuthenticated, signOut } from "@/lib/auth";

export default function AuthButton() {
  if (!isAuthenticated()) {
    return null;
  }

  return (
    <Button variant="ghost" size="sm" className="gap-2" onClick={signOut}>
      <LogOut className="h-4 w-4" /> Sign out
    </Button>
  );
}
