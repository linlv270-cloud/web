import { getPlatformSettings } from "./repository";
import { isSmsConfigured } from "./sms";
import type { PlatformSettings } from "./types";

export function getPublicPlatformSettings(): PlatformSettings {
  const settings = getPlatformSettings();
  return {
    ...settings,
    sms: {
      ...settings.sms,
      enabled: isSmsConfigured(settings),
    },
  };
}
