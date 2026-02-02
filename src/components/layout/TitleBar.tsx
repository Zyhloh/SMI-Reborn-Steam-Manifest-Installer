"use client";

import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { HiMinus, HiXMark, HiBell } from "react-icons/hi2";
import { useNotifications } from "@/context/NotificationContext";

export default function TitleBar() {
  const { notifications, removeNotification } = useNotifications();
  const [showTray, setShowTray] = useState(false);
  const [bellRing, setBellRing] = useState(false);
  const trayRef = useRef<HTMLDivElement>(null);

  const hasNotifications = notifications.length > 0;

  const handleMinimize = () => {
    if (typeof window !== "undefined" && window.electronAPI) {
      window.electronAPI.minimizeWindow();
    }
  };

  const handleClose = () => {
    if (typeof window !== "undefined" && window.electronAPI) {
      window.electronAPI.closeWindow();
    }
  };

  useEffect(() => {
    if (!hasNotifications) return;
    const interval = setInterval(() => {
      setBellRing(true);
      setTimeout(() => setBellRing(false), 500);
    }, 4000);
    return () => clearInterval(interval);
  }, [hasNotifications]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (trayRef.current && !trayRef.current.contains(e.target as Node)) {
        setShowTray(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <div className="h-11 bg-[#0c0c0e] border-b border-zinc-800/50 flex items-center justify-between px-4 select-none app-drag">
      <div className="flex items-center gap-2">
        <span className="text-base font-bold bg-gradient-to-r from-amber-400 via-orange-400 to-amber-400 bg-[length:200%_100%] bg-clip-text text-transparent animate-gradient">
          SMI
        </span>
        <span className="text-[10px] text-zinc-600 font-medium">REBORN</span>
      </div>

      <div className="flex items-center gap-1.5 app-no-drag">
        <div className="relative" ref={trayRef}>
          <button
            onClick={() => setShowTray(!showTray)}
            className={`w-8 h-8 flex items-center justify-center rounded-lg transition-all duration-200 ${
              hasNotifications
                ? "bg-gradient-to-br from-amber-500/20 to-orange-500/10 text-amber-400 border border-amber-500/30"
                : "bg-zinc-800/50 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-300"
            }`}
          >
            <HiBell className={`w-4 h-4 transition-transform ${bellRing ? "animate-bell" : ""}`} />
            {hasNotifications && (
              <span className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 rounded-full text-[10px] font-bold text-white flex items-center justify-center">
                {notifications.length}
              </span>
            )}
          </button>

          <AnimatePresence>
            {showTray && (
              <motion.div
                initial={{ opacity: 0, y: -10, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -10, scale: 0.95 }}
                transition={{ duration: 0.15 }}
                className="absolute right-0 top-full mt-2 w-80 bg-[#111114] border border-zinc-800/80 rounded-xl shadow-2xl shadow-black/50 overflow-hidden z-50"
              >
                <div className="p-3 border-b border-zinc-800/50 flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-zinc-200">Notifications</h3>
                  {hasNotifications && (
                    <span className="text-xs text-zinc-500">{notifications.length} new</span>
                  )}
                </div>
                <div className="max-h-72 overflow-y-auto">
                  {notifications.length === 0 ? (
                    <div className="p-6 text-center">
                      <HiBell className="w-8 h-8 text-zinc-700 mx-auto mb-2" />
                      <p className="text-zinc-500 text-sm">No notifications</p>
                    </div>
                  ) : (
                    notifications.map((notification) => (
                      <motion.div
                        key={notification.id}
                        initial={{ opacity: 0, x: -10 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: 10 }}
                        className={`p-3 border-b border-zinc-800/30 hover:bg-zinc-800/20 transition-colors cursor-pointer ${
                          notification.type === "warning" ? "border-l-2 border-l-amber-500" :
                          notification.type === "error" ? "border-l-2 border-l-red-500" :
                          notification.type === "success" ? "border-l-2 border-l-emerald-500" :
                          "border-l-2 border-l-blue-500"
                        }`}
                        onClick={() => {
                          if (notification.action) {
                            notification.action.onClick();
                            removeNotification(notification.id);
                            setShowTray(false);
                          }
                        }}
                      >
                        <p className={`text-sm font-medium ${
                          notification.type === "warning" ? "text-amber-400" :
                          notification.type === "error" ? "text-red-400" :
                          notification.type === "success" ? "text-emerald-400" :
                          "text-blue-400"
                        }`}>
                          {notification.title}
                        </p>
                        <p className="text-xs text-zinc-400 mt-1 leading-relaxed">{notification.message}</p>
                        {notification.action && (
                          <p className="mt-2 text-xs text-amber-400 hover:text-amber-300">
                            {notification.action.label} →
                          </p>
                        )}
                      </motion.div>
                    ))
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <button
          onClick={handleMinimize}
          className="w-8 h-8 flex items-center justify-center rounded-lg bg-zinc-800/50 text-zinc-500 hover:bg-zinc-700 hover:text-zinc-200 transition-all duration-200"
        >
          <HiMinus className="w-4 h-4" />
        </button>
        <button
          onClick={handleClose}
          className="w-8 h-8 flex items-center justify-center rounded-lg bg-zinc-800/50 text-zinc-500 hover:bg-red-500/80 hover:text-white transition-all duration-200"
        >
          <HiXMark className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
