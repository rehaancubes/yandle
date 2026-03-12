import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import {
  Phone,
  DollarSign,
  CreditCard,
  Building2,
  ShieldAlert,
  Loader2,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface Summary {
  totalNumbersSold: number;
  totalRevenue: number;
  totalPayments: number;
  activeBusinesses: number;
  currency: string;
}

interface PhoneNumber {
  phoneNumber: string;
  handle: string;
  businessName: string;
  assignedAt: string;
  monthlyPrice: number;
  status: string;
}

interface Payment {
  paymentId: string;
  handle: string;
  amount: number;
  currency: string;
  type: string;
  phoneNumber: string;
  status: string;
  createdAt: string;
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export default function BMS() {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [numbers, setNumbers] = useState<PhoneNumber[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [loading, setLoading] = useState(true);
  const [accessDenied, setAccessDenied] = useState(false);

  useEffect(() => {
    const apiBase =
      localStorage.getItem("voxa_api_base") ||
      "https://6kbd4veax6.execute-api.us-east-1.amazonaws.com";
    const token = localStorage.getItem("voxa_id_token") || "";
    const headers = { authorization: `Bearer ${token}` };

    async function fetchAll() {
      try {
        const [sumRes, numRes, payRes] = await Promise.all([
          fetch(`${apiBase}/bms/summary`, { headers }),
          fetch(`${apiBase}/bms/numbers`, { headers }),
          fetch(`${apiBase}/bms/payments`, { headers }),
        ]);

        // If any endpoint returns 403, show access denied
        if (
          sumRes.status === 403 ||
          numRes.status === 403 ||
          payRes.status === 403
        ) {
          setAccessDenied(true);
          setLoading(false);
          return;
        }

        const sumData = await sumRes.json();
        const numData = await numRes.json();
        const payData = await payRes.json();

        setSummary(sumData);
        setNumbers(numData.numbers || []);
        setPayments(payData.payments || []);
      } catch {
        // Network error — treat as access denied for safety
        setAccessDenied(true);
      } finally {
        setLoading(false);
      }
    }

    fetchAll();
  }, []);

  /* ---------------------------------------------------------------- */
  /*  Loading state                                                    */
  /* ---------------------------------------------------------------- */
  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  /* ---------------------------------------------------------------- */
  /*  Access denied                                                    */
  /* ---------------------------------------------------------------- */
  if (accessDenied) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center gap-4">
        <ShieldAlert className="h-12 w-12 text-red-400" />
        <h1 className="text-xl font-semibold">Access Denied</h1>
        <p className="text-muted-foreground text-sm">
          Super admin only
        </p>
      </div>
    );
  }

  /* ---------------------------------------------------------------- */
  /*  Stat cards config                                                */
  /* ---------------------------------------------------------------- */
  const stats = [
    {
      label: "Total Numbers Sold",
      value: summary?.totalNumbersSold ?? 0,
      icon: Phone,
      format: (v: number) => v.toLocaleString(),
    },
    {
      label: "Total Revenue",
      value: summary?.totalRevenue ?? 0,
      icon: DollarSign,
      format: (v: number) => `\u20B9${v.toLocaleString()}`,
    },
    {
      label: "Total Payments",
      value: summary?.totalPayments ?? 0,
      icon: CreditCard,
      format: (v: number) => v.toLocaleString(),
    },
    {
      label: "Active Businesses",
      value: summary?.activeBusinesses ?? 0,
      icon: Building2,
      format: (v: number) => v.toLocaleString(),
    },
  ];

  /* ---------------------------------------------------------------- */
  /*  Render                                                           */
  /* ---------------------------------------------------------------- */
  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border bg-background/80 backdrop-blur-sm sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <h1 className="font-display text-2xl font-bold">
            Business Management System
          </h1>
          <p className="text-sm text-muted-foreground">
            Super Admin Dashboard
          </p>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-6 py-6 space-y-6">
        {/* Summary stat cards */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
          className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4"
        >
          {stats.map((s) => (
            <Card key={s.label} className="bg-card/50 border-border">
              <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  {s.label}
                </CardTitle>
                <s.icon className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold">{s.format(s.value)}</p>
              </CardContent>
            </Card>
          ))}
        </motion.div>

        {/* Two-column tables */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.1 }}
          className="grid grid-cols-1 lg:grid-cols-2 gap-6"
        >
          {/* Phone Numbers table */}
          <Card className="bg-card/50 border-border">
            <CardHeader>
              <CardTitle className="text-base font-display font-semibold flex items-center gap-2">
                <Phone className="h-4 w-4" />
                Phone Numbers
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border text-muted-foreground">
                      <th className="text-left py-2 pr-4 font-medium">Number</th>
                      <th className="text-left py-2 pr-4 font-medium">Business</th>
                      <th className="text-left py-2 pr-4 font-medium">Assigned Date</th>
                      <th className="text-right py-2 font-medium">Monthly Price</th>
                    </tr>
                  </thead>
                  <tbody>
                    {numbers.length === 0 ? (
                      <tr>
                        <td
                          colSpan={4}
                          className="py-8 text-center text-muted-foreground"
                        >
                          No phone numbers found
                        </td>
                      </tr>
                    ) : (
                      numbers.map((n) => (
                        <tr
                          key={n.phoneNumber}
                          className="border-b border-border/50 hover:bg-secondary/20 transition-colors"
                        >
                          <td className="py-2 pr-4 font-mono text-xs">
                            {n.phoneNumber}
                          </td>
                          <td className="py-2 pr-4 truncate max-w-[160px]">
                            {n.businessName || n.handle}
                          </td>
                          <td className="py-2 pr-4 text-muted-foreground">
                            {new Date(n.assignedAt).toLocaleDateString()}
                          </td>
                          <td className="py-2 text-right">
                            {`\u20B9${n.monthlyPrice.toLocaleString()}`}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>

          {/* Payments table */}
          <Card className="bg-card/50 border-border">
            <CardHeader>
              <CardTitle className="text-base font-display font-semibold flex items-center gap-2">
                <CreditCard className="h-4 w-4" />
                Payments
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border text-muted-foreground">
                      <th className="text-left py-2 pr-4 font-medium">Date</th>
                      <th className="text-left py-2 pr-4 font-medium">Business</th>
                      <th className="text-right py-2 pr-4 font-medium">Amount</th>
                      <th className="text-left py-2 pr-4 font-medium">Type</th>
                      <th className="text-left py-2 font-medium">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {payments.length === 0 ? (
                      <tr>
                        <td
                          colSpan={5}
                          className="py-8 text-center text-muted-foreground"
                        >
                          No payments found
                        </td>
                      </tr>
                    ) : (
                      payments.map((p) => (
                        <tr
                          key={p.paymentId}
                          className="border-b border-border/50 hover:bg-secondary/20 transition-colors"
                        >
                          <td className="py-2 pr-4 text-muted-foreground">
                            {new Date(p.createdAt).toLocaleDateString()}
                          </td>
                          <td className="py-2 pr-4 truncate max-w-[120px]">
                            {p.handle}
                          </td>
                          <td className="py-2 pr-4 text-right font-medium">
                            {`\u20B9${p.amount.toLocaleString()}`}
                          </td>
                          <td className="py-2 pr-4 capitalize">
                            {p.type}
                          </td>
                          <td className="py-2">
                            <span
                              className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                                p.status === "completed" || p.status === "success"
                                  ? "bg-emerald-500/20 text-emerald-400"
                                  : p.status === "pending"
                                    ? "bg-yellow-500/20 text-yellow-400"
                                    : p.status === "failed"
                                      ? "bg-red-500/20 text-red-400"
                                      : "bg-secondary text-muted-foreground"
                              }`}
                            >
                              {p.status}
                            </span>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      </div>
    </div>
  );
}
