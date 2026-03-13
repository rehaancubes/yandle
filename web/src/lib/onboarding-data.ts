import {
  Stethoscope, Scissors, Monitor, Building2, Headset,
  Calendar, Users,
  MessageSquare, BarChart3, Phone, Ticket,
  type LucideIcon,
} from "lucide-react";

export type BusinessType = "gaming_cafe" | "salon" | "clinic" | "general" | "customer_support";

export interface UseCase {
  id: string;
  title: string;
  desc: string;
  icon: LucideIcon;
  fields: OnboardingField[];
  dashboardWidgets: DashboardWidget[];
}

export interface OnboardingField {
  name: string;
  label: string;
  type: "text" | "textarea" | "select";
  placeholder: string;
  options?: string[];
}

export interface DashboardWidget {
  id: string;
  title: string;
  icon: LucideIcon;
  type: "stat" | "list" | "chart";
}

export const businessCases: UseCase[] = [
  {
    id: "gaming_cafe",
    title: "Gaming Cafe",
    desc: "Manage locations, machines, bookings, and availability with AI.",
    icon: Monitor,
    fields: [
      { name: "brand_name", label: "Brand / Cafe Name", type: "text", placeholder: "e.g. XP Arena" },
    ],
    dashboardWidgets: [
      { id: "machine_bookings", title: "Machine Bookings", icon: Calendar, type: "list" },
      { id: "conversations", title: "AI Conversations", icon: MessageSquare, type: "chart" },
    ],
  },
  {
    id: "salon",
    title: "Salon",
    desc: "Schedule appointments, answer service questions, manage branches.",
    icon: Scissors,
    fields: [
      { name: "salon_name", label: "Salon Name", type: "text", placeholder: "e.g. Glow Beauty Studio" },
      { name: "hours", label: "Operating Hours", type: "text", placeholder: "e.g. Tue-Sat 10am-7pm" },
    ],
    dashboardWidgets: [
      { id: "todays_bookings", title: "Today's Bookings", icon: Calendar, type: "stat" },
      { id: "appointments", title: "Upcoming Appointments", icon: Scissors, type: "list" },
      { id: "conversations", title: "AI Conversations", icon: MessageSquare, type: "chart" },
    ],
  },
  {
    id: "clinic",
    title: "Clinic",
    desc: "AI receptionist handles appointment booking, patient tokens, and intake.",
    icon: Stethoscope,
    fields: [
      { name: "clinic_name", label: "Clinic Name", type: "text", placeholder: "e.g. Sunrise Family Clinic" },
      { name: "hours", label: "Operating Hours", type: "text", placeholder: "e.g. Mon-Fri 9am-6pm" },
    ],
    dashboardWidgets: [
      { id: "appointments_today", title: "Today's Appointments", icon: Calendar, type: "stat" },
      { id: "patient_intake", title: "New Patient Intake", icon: Users, type: "list" },
      { id: "weekly_patients", title: "Weekly Patients", icon: BarChart3, type: "stat" },
      { id: "conversations", title: "AI Conversations", icon: MessageSquare, type: "chart" },
    ],
  },
  {
    id: "general",
    title: "General",
    desc: "Answer questions, capture leads, and manage callback requests with AI.",
    icon: Building2,
    fields: [
      { name: "business_name", label: "Business Name", type: "text", placeholder: "e.g. Acme Corp" },
      { name: "hours", label: "Operating Hours", type: "text", placeholder: "e.g. Mon-Fri 9am-6pm" },
      { name: "description", label: "Business Description", type: "textarea", placeholder: "Describe what your business does..." },
    ],
    dashboardWidgets: [
      { id: "requests_today", title: "Today's Requests", icon: Phone, type: "stat" },
      { id: "requests", title: "Recent Requests", icon: Phone, type: "list" },
      { id: "conversations", title: "AI Conversations", icon: MessageSquare, type: "chart" },
    ],
  },
  {
    id: "customer_support",
    title: "Customer Support",
    desc: "Categorize issues, create tickets, and track resolutions with AI.",
    icon: Headset,
    fields: [
      { name: "business_name", label: "Business Name", type: "text", placeholder: "e.g. Acme Support" },
      { name: "hours", label: "Support Hours", type: "text", placeholder: "e.g. 24/7 or Mon-Fri 9am-6pm" },
    ],
    dashboardWidgets: [
      { id: "open_tickets", title: "Open Tickets", icon: Ticket, type: "stat" },
      { id: "tickets", title: "Recent Tickets", icon: Ticket, type: "list" },
      { id: "conversations", title: "AI Conversations", icon: MessageSquare, type: "chart" },
    ],
  },
];

export function getUseCaseById(id: string): UseCase | undefined {
  return businessCases.find((uc) => uc.id === id);
}
