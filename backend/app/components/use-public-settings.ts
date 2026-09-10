"use client";

import { useEffect, useState } from "react";
import { defaultPlatformSettings } from "../../lib/platform-settings";
import type { PlatformSettings } from "../../lib/types";

export function usePublicSettings() {
  const [settings, setSettings] = useState<PlatformSettings>(defaultPlatformSettings);
  useEffect(() => {
    let active = true;
    fetch("/api/public/settings", { cache: "no-store" })
      .then((response) => response.json())
      .then((data) => {
        if (active && data.settings) setSettings(data.settings);
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, []);
  return settings;
}
