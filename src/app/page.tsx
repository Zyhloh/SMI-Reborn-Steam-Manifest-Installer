"use client";

import { useState, useCallback } from "react";
import { AnimatePresence } from "framer-motion";
import { SplashScreen } from "@/components/splash";
import { MainView } from "@/components/views";
import { NotificationProvider, useNotifications } from "@/context/NotificationContext";

function AppContent() {
  const [isLoading, setIsLoading] = useState(true);
  const [steamPath, setSteamPath] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState("install");
  const [isProcessing, setIsProcessing] = useState(false);
  const { addNotification, removeNotificationByTitle } = useNotifications();

  const checkSteamStatus = useCallback(
    async (path: string) => {
      if (typeof window === "undefined" || !window.electronAPI) return;

      try {
        const bitness = await window.electronAPI.checkSteamBitness(path);
        if (bitness === "64") {
          addNotification({
            type: "warning",
            title: "64-bit Steam Detected",
            message: "SMI requires 32-bit Steam. Go to Settings to downgrade.",
            action: {
              label: "Go to Settings",
              onClick: () => setActiveTab("settings"),
            },
          });
        } else {
          removeNotificationByTitle("64-bit Steam Detected");
        }
      } catch {}

      try {
        const status = await window.electronAPI.checkSmiStatus(path);
        if (!status.isSetup) {
          addNotification({
            type: "warning",
            title: "SMI Setup Required",
            message: "Install SMI resources in Settings to use manifest features.",
            action: {
              label: "Go to Settings",
              onClick: () => setActiveTab("settings"),
            },
          });
        } else {
          removeNotificationByTitle("SMI Setup Required");
        }
      } catch {}
    },
    [addNotification, removeNotificationByTitle]
  );

  const handleSplashComplete = useCallback(
    (path: string | null) => {
      setSteamPath(path);
      setIsLoading(false);
      if (!path) {
        addNotification({
          type: "error",
          title: "Steam Path Not Set",
          message: "Set your Steam path in the sidebar for SMI to work.",
        });
      } else {
        checkSteamStatus(path);
      }
    },
    [addNotification, checkSteamStatus]
  );

  const handleSteamPathChange = useCallback(
    (path: string) => {
      setSteamPath(path);
      removeNotificationByTitle("Steam Path Not Set");
      checkSteamStatus(path);
    },
    [removeNotificationByTitle, checkSteamStatus]
  );

  return (
    <>
      <AnimatePresence mode="wait">
        {isLoading && <SplashScreen key="splash" onComplete={handleSplashComplete} />}
      </AnimatePresence>
      {!isLoading && (
        <MainView
          steamPath={steamPath}
          setSteamPath={handleSteamPathChange}
          activeTab={activeTab}
          setActiveTab={setActiveTab}
          isProcessing={isProcessing}
          setIsProcessing={setIsProcessing}
        />
      )}
    </>
  );
}

export default function Home() {
  return (
    <NotificationProvider>
      <AppContent />
    </NotificationProvider>
  );
}
