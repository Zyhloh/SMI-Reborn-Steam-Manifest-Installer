"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { HiArrowUpTray, HiArchiveBox, HiCog6Tooth, HiFolder, HiArrowDownTray } from "react-icons/hi2";

interface SidebarProps {
  activeTab: string;
  onTabChange: (tab: string) => void;
  steamPath: string | null;
  onSteamPathChange: (path: string) => void;
  isProcessing: boolean;
}

const tabs = [
  { id: "install", label: "Install", icon: HiArrowUpTray },
  { id: "library", label: "Library", icon: HiArchiveBox },
  { id: "dumper", label: "Dumper", icon: HiArrowDownTray },
  { id: "settings", label: "Settings", icon: HiCog6Tooth },
];

export default function Sidebar({ activeTab, onTabChange, steamPath, onSteamPathChange, isProcessing }: SidebarProps) {
  const [isSelecting, setIsSelecting] = useState(false);

  const handleSelectSteamFolder = async () => {
    if (typeof window === "undefined" || !window.electronAPI) return;
    
    setIsSelecting(true);
    try {
      const selected = await window.electronAPI.selectFolder();
      if (selected) {
        const validPath = await window.electronAPI.validateSteamFolder(selected);
        await window.electronAPI.saveSteamPath(validPath);
        onSteamPathChange(validPath);
      }
    } catch (e) {
      console.error("Failed to set Steam path:", e);
    } finally {
      setIsSelecting(false);
    }
  };

  return (
    <aside className="w-64 bg-[#0c0c0e] border-r border-zinc-800/50 flex flex-col">
      <nav className="flex-1 p-3 pt-4 space-y-1">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          
          return (
            <button
              key={tab.id}
              onClick={() => !isProcessing && onTabChange(tab.id)}
              disabled={isProcessing}
              className={`relative w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 ${
                isActive
                  ? "text-amber-400"
                  : "text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/30"
              } ${isProcessing ? "opacity-50 cursor-not-allowed" : ""}`}
            >
              {isActive && (
                <motion.div
                  layoutId="activeTab"
                  className="absolute inset-0 bg-gradient-to-r from-amber-500/15 to-orange-500/5 border border-amber-500/20 rounded-xl"
                  transition={{ type: "spring", stiffness: 400, damping: 30 }}
                />
              )}
              <Icon className="w-5 h-5 relative z-10" />
              <span className="text-sm font-medium relative z-10">{tab.label}</span>
            </button>
          );
        })}
      </nav>

      <div className="p-4 border-t border-zinc-800/50">
        <div className="flex items-center gap-3 px-2 mb-3">
          <div className="relative">
            <img
              src="./steam.png"
              alt="Steam"
              width={36}
              height={36}
              className={`rounded-full ring-2 ring-offset-2 ring-offset-[#0c0c0e] transition-all duration-300 ${
                steamPath 
                  ? "ring-emerald-500 shadow-[0_0_12px_rgba(16,185,129,0.3)]" 
                  : "ring-red-500 shadow-[0_0_12px_rgba(239,68,68,0.3)]"
              }`}
            />
            <div className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-[#0c0c0e] ${
              steamPath ? "bg-emerald-500" : "bg-red-500"
            }`} />
          </div>
          <div className="flex-1 min-w-0">
            {steamPath ? (
              <>
                <p className="text-[10px] text-zinc-500 uppercase tracking-wider">Steam Path</p>
                <p className="text-xs text-zinc-400 truncate" title={steamPath}>{steamPath}</p>
              </>
            ) : (
              <p className="text-xs text-red-400 font-medium">Steam Not Found</p>
            )}
          </div>
        </div>
        
        <button
          onClick={handleSelectSteamFolder}
          disabled={isSelecting}
          className="w-full py-2.5 px-4 rounded-xl bg-zinc-800/80 hover:bg-zinc-700/80 border border-zinc-700/50 text-zinc-300 text-xs font-medium transition-all duration-200 flex items-center justify-center gap-2 disabled:opacity-50"
        >
          <HiFolder className="w-4 h-4" />
          {isSelecting ? "Selecting..." : steamPath ? "Change Path" : "Select Steam Folder"}
        </button>
      </div>
    </aside>
  );
}
