"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { HiCheck } from "react-icons/hi2";

interface SplashScreenProps {
  onComplete: (steamPath: string | null) => void;
}

export default function SplashScreen({ onComplete }: SplashScreenProps) {
  const [phase, setPhase] = useState<"intro" | "loading" | "done">("intro");
  const [status, setStatus] = useState("Initializing...");

  useEffect(() => {
    const timer = setTimeout(() => setPhase("loading"), 800);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (phase !== "loading") return;

    const findSteamPath = async () => {
      setStatus("Checking configuration...");
      await new Promise((r) => setTimeout(r, 600));

      if (typeof window !== "undefined" && window.electronAPI) {
        try {
          setStatus("Looking for Steam...");
          const savedPath = await window.electronAPI.getSavedSteamPath();
          if (savedPath) {
            setStatus("Steam found!");
            await new Promise((r) => setTimeout(r, 400));
            setPhase("done");
            setTimeout(() => onComplete(savedPath), 600);
            return;
          }
        } catch {}

        try {
          const path = await window.electronAPI.getSteamPath();
          setStatus("Steam found!");
          await new Promise((r) => setTimeout(r, 400));
          setPhase("done");
          setTimeout(() => onComplete(path), 600);
          return;
        } catch {}
      }

      setStatus("Steam not found");
      await new Promise((r) => setTimeout(r, 800));
      setPhase("done");
      setTimeout(() => onComplete(null), 600);
    };

    findSteamPath();
  }, [phase, onComplete]);

  return (
    <AnimatePresence>
      {phase !== "done" || true ? (
        <motion.div
          initial={{ opacity: 1 }}
          animate={{ opacity: phase === "done" ? 0 : 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.5 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-[#0a0a0c]"
        >
          <div className="absolute inset-0 overflow-hidden">
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px]">
              <motion.div
                animate={{ rotate: 360 }}
                transition={{ duration: 20, repeat: Infinity, ease: "linear" }}
                className="absolute inset-0 rounded-full bg-gradient-to-r from-amber-500/10 via-transparent to-orange-500/10 blur-3xl"
              />
            </div>
          </div>

          <div className="relative z-10 flex flex-col items-center">
            <motion.div
              initial={{ scale: 0, rotate: -180 }}
              animate={{ scale: 1, rotate: 0 }}
              transition={{ type: "spring", stiffness: 200, damping: 20, delay: 0.1 }}
              className="relative mb-6"
            >
              <div className="absolute inset-0 bg-gradient-to-br from-amber-500 to-orange-600 rounded-2xl blur-xl opacity-50" />
              <div className="relative w-24 h-24 bg-gradient-to-br from-[#1a1a1f] to-[#0f0f12] rounded-2xl border border-zinc-800/50 flex items-center justify-center overflow-hidden">
                <img
                  src="./icon.ico"
                  alt="SMI"
                  className="w-16 h-16 object-contain"
                />
              </div>
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: [0, 1.2, 1] }}
                transition={{ delay: 0.5, duration: 0.5 }}
                className="absolute -bottom-1 -right-1 w-8 h-8 bg-gradient-to-br from-amber-400 to-orange-500 rounded-lg flex items-center justify-center"
              >
                <span className="text-xs font-bold text-black">R</span>
              </motion.div>
            </motion.div>

            <motion.h1
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 }}
              className="text-3xl font-bold bg-gradient-to-r from-amber-200 via-amber-400 to-orange-400 bg-clip-text text-transparent mb-2"
            >
              SMI Reborn
            </motion.h1>

            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 0.5 }}
              transition={{ delay: 0.5 }}
              className="text-zinc-500 text-sm tracking-[0.3em] uppercase mb-8"
            >
              Steam Manifest Installer
            </motion.p>

            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.7 }}
              className="flex flex-col items-center gap-4"
            >
              {phase === "loading" ? (
                <div className="relative w-10 h-10">
                  <motion.div
                    animate={{ rotate: 360 }}
                    transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                    className="absolute inset-0 rounded-full border-2 border-zinc-800 border-t-amber-500"
                  />
                </div>
              ) : phase === "done" ? (
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  className="w-10 h-10 rounded-full bg-emerald-500/20 flex items-center justify-center"
                >
                  <HiCheck className="w-6 h-6 text-emerald-400" />
                </motion.div>
              ) : (
                <div className="w-10 h-10" />
              )}

              <motion.p
                key={status}
                initial={{ opacity: 0, y: 5 }}
                animate={{ opacity: 1, y: 0 }}
                className="text-zinc-500 text-sm h-5"
              >
                {phase === "intro" ? "" : phase === "done" ? "Ready!" : status}
              </motion.p>
            </motion.div>
          </div>

          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 1 }}
            className="absolute bottom-6 text-zinc-600 text-xs"
          >
            v0.0.1b • by Zyhloh
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
