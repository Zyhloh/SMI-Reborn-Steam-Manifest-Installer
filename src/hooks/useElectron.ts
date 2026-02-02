"use client";

import { useState, useEffect } from "react";
import type { AppConfig } from "@/types/electron";

export function useElectron() {
  const [isElectron, setIsElectron] = useState(false);
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [version, setVersion] = useState("0.0.1-beta");
  const [platform, setPlatform] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window !== "undefined" && window.electronAPI) {
      setIsElectron(true);
      setPlatform(window.electronAPI.platform);

      window.electronAPI.getConfig().then((cfg) => setConfig(cfg as AppConfig));
      window.electronAPI.getAppVersion().then(setVersion);
    }
  }, []);

  return {
    isElectron,
    config,
    version,
    platform,
  };
}
