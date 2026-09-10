import fs from "node:fs";
import path from "node:path";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  Baby,
  Bell,
  Bookmark,
  CalendarPlus,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronUp,
  CircleUserRound,
  Coffee,
  Compass,
  Gem,
  Gift,
  Heart,
  LayoutGrid,
  MapPin,
  MapPinned,
  MessageCircle,
  Minus,
  PackageOpen,
  Plus,
  RotateCcw,
  SlidersHorizontal,
  Sparkles,
  Timer,
  UsersRound,
  X,
} from "lucide-react";

const root = process.cwd();
const tokens = JSON.parse(fs.readFileSync(path.join(root, "design-system/qideng-tokens.json"), "utf8"));
const output = path.join(root, "miniprogram/assets/icons");
const icons = {
  baby: Baby,
  bell: Bell,
  bookmark: Bookmark,
  calendar: CalendarPlus,
  check: Check,
  "chevron-down": ChevronDown,
  "chevron-left": ChevronLeft,
  "chevron-up": ChevronUp,
  coffee: Coffee,
  companion: UsersRound,
  discover: Compass,
  favorite: Heart,
  filter: SlidersHorizontal,
  first: Gem,
  gift: Gift,
  map: MapPin,
  mine: CircleUserRound,
  minus: Minus,
  new: CalendarPlus,
  notices: Bell,
  plus: Plus,
  project: LayoutGrid,
  recommended: Sparkles,
  replies: MessageCircle,
  reset: RotateCcw,
  route: MapPinned,
  self: PackageOpen,
  timer: Timer,
  users: UsersRound,
  close: X,
};
const tones = {
  muted: tokens.colors.muted,
  active: tokens.colors.accentPressed,
  ink: tokens.colors.ink,
  light: tokens.colors.onDark,
  lamp: tokens.colors.warning,
};

fs.mkdirSync(output, { recursive: true });
for (const [name, Icon] of Object.entries(icons)) {
  for (const [tone, color] of Object.entries(tones)) {
    const svg = renderToStaticMarkup(React.createElement(Icon, {
      color,
      fill: "none",
      height: 24,
      width: 24,
      strokeWidth: 1.8,
      absoluteStrokeWidth: true,
      "aria-hidden": "true",
    }));
    fs.writeFileSync(path.join(output, `${name}-${tone}.svg`), `${svg}\n`);
  }
}

console.log(`Generated ${Object.keys(icons).length * Object.keys(tones).length} mini-program icon assets.`);
