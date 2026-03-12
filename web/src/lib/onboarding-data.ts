import {
  Stethoscope, Scissors, Monitor,
  Calendar, Users,
  MessageSquare, BarChart3,
  type LucideIcon,
} from "lucide-react";

export type BusinessType = "gaming_cafe" | "salon" | "clinic";

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
  mockValue?: string;
  mockItems?: { label: string; value: string; status?: string }[];
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
      { id: "machine_bookings", title: "Machine Bookings", icon: Calendar, type: "list", mockItems: [] },
      { id: "conversations", title: "AI Conversations", icon: MessageSquare, type: "chart", mockValue: "" },
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
      { id: "todays_bookings", title: "Today's Bookings", icon: Calendar, type: "stat", mockValue: "9" },
      { id: "appointments", title: "Upcoming Appointments", icon: Scissors, type: "list", mockItems: [
        { label: "Emma R. — Haircut + Color", value: "11:00 AM", status: "confirmed" },
        { label: "Sophie L. — Blowout", value: "1:30 PM", status: "new" },
      ]},
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
      { id: "appointments_today", title: "Today's Appointments", icon: Calendar, type: "stat", mockValue: "14" },
      { id: "patient_intake", title: "New Patient Intake", icon: Users, type: "list", mockItems: [
        { label: "John D. — General Checkup", value: "10:30 AM", status: "confirmed" },
        { label: "Maria S. — Dental Cleaning", value: "2:00 PM", status: "new" },
      ]},
      { id: "weekly_patients", title: "Weekly Patients", icon: BarChart3, type: "stat", mockValue: "67" },
      { id: "conversations", title: "AI Conversations", icon: MessageSquare, type: "chart" },
    ],
  },
];

export function getUseCaseById(id: string): UseCase | undefined {
  return businessCases.find((uc) => uc.id === id);
}
