"use client";

import {
  Activity,
  Bell,
  Building2,
  CalendarCheck,
  CreditCard,
  FileBarChart,
  FileSpreadsheet,
  Handshake,
  Home,
  Inbox,
  KeyRound,
  LayoutGrid,
  LifeBuoy,
  MapPin,
  Megaphone,
  Receipt,
  Settings,
  ShieldCheck,
  Sparkles,
  Star,
  Tag,
  UserCog,
  Users,
  Webhook,
} from "lucide-react";
import type { ComponentType } from "react";
import type { IconKey } from "./nav-config";

/**
 * Client-side registry mapping nav-config `IconKey` strings to Lucide
 * components. The server passes string keys (functions can't cross the
 * server → client boundary in Next 15), the client renders the icon.
 */
export const NAV_ICONS: Record<IconKey, ComponentType<{ className?: string }>> = {
  activity: Activity,
  bell: Bell,
  building2: Building2,
  "calendar-check": CalendarCheck,
  "credit-card": CreditCard,
  "file-bar-chart": FileBarChart,
  "file-spreadsheet": FileSpreadsheet,
  handshake: Handshake,
  home: Home,
  inbox: Inbox,
  "key-round": KeyRound,
  "layout-grid": LayoutGrid,
  "life-buoy": LifeBuoy,
  "map-pin": MapPin,
  megaphone: Megaphone,
  receipt: Receipt,
  settings: Settings,
  "shield-check": ShieldCheck,
  sparkles: Sparkles,
  star: Star,
  tag: Tag,
  "user-cog": UserCog,
  users: Users,
  webhook: Webhook,
};
