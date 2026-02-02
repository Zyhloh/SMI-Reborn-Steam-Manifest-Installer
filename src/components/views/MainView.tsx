"use client";

import { TitleBar, Sidebar } from "@/components/layout";
import { InstallTab, LibraryTab, DumperTab, SettingsTab } from "@/components/tabs";
import { NoSteamOverlay } from "@/components/common";

interface MainViewProps {
  steamPath: string | null;
  setSteamPath: (path: string) => void;
  activeTab: string;
  setActiveTab: (tab: string) => void;
  isProcessing: boolean;
  setIsProcessing: (processing: boolean) => void;
}

export default function MainView({
  steamPath,
  setSteamPath,
  activeTab,
  setActiveTab,
  isProcessing,
  setIsProcessing,
}: MainViewProps) {
  return (
    <div className="h-screen bg-[#0a0a0c] flex flex-col overflow-hidden">
      <TitleBar />
      <div className="flex-1 flex overflow-hidden">
        <Sidebar
          activeTab={activeTab}
          onTabChange={setActiveTab}
          steamPath={steamPath}
          onSteamPathChange={setSteamPath}
          isProcessing={isProcessing}
        />

        <main className="flex-1 flex flex-col relative bg-[#0f0f12]">
          <div className="flex-1 p-6 overflow-auto">
            {activeTab === "install" && <InstallTab steamPath={steamPath} />}
            {activeTab === "library" && <LibraryTab steamPath={steamPath} />}
            {activeTab === "dumper" && <DumperTab steamPath={steamPath} />}
            {activeTab === "settings" && <SettingsTab steamPath={steamPath} setIsProcessing={setIsProcessing} />}
          </div>
          {!steamPath && <NoSteamOverlay />}
        </main>
      </div>
    </div>
  );
}
