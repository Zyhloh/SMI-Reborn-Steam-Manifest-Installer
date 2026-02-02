"use client";

import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { HiArchiveBox, HiTrash } from "react-icons/hi2";
import type { InstalledGame } from "@/types";

interface LibraryTabProps {
  steamPath: string | null;
}

export default function LibraryTab({ steamPath }: LibraryTabProps) {
  const [games, setGames] = useState<InstalledGame[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [uninstallingId, setUninstallingId] = useState<string | null>(null);

  const loadGames = useCallback(async () => {
    if (!steamPath || typeof window === "undefined" || !window.electronAPI) return;
    
    try {
      const list = await window.electronAPI.listInstalledGames(steamPath);
      setGames(list);
    } catch {
      setGames([]);
    } finally {
      setIsLoading(false);
    }
  }, [steamPath]);

  useEffect(() => {
    loadGames();
    const interval = setInterval(loadGames, 30000);
    return () => clearInterval(interval);
  }, [loadGames]);

  const handleUninstall = async (gameId: string) => {
    if (!steamPath || typeof window === "undefined" || !window.electronAPI) return;
    
    setUninstallingId(gameId);
    try {
      await window.electronAPI.uninstallGame(steamPath, gameId);
      await loadGames();
    } catch (e) {
      console.error("Failed to uninstall:", e);
    }
    setUninstallingId(null);
  };

  if (isLoading) {
    return (
      <div className="h-full flex flex-col items-center justify-center">
        <div className="relative w-12 h-12">
          <div className="absolute inset-0 rounded-full border-2 border-zinc-800" />
          <motion.div
            animate={{ rotate: 360 }}
            transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
            className="absolute inset-0 rounded-full border-2 border-amber-500 border-t-transparent"
          />
        </div>
        <p className="text-sm text-zinc-500 mt-4">Loading installed games...</p>
      </div>
    );
  }

  if (games.length === 0) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-center px-6">
        <div className="w-20 h-20 rounded-2xl bg-zinc-800/50 flex items-center justify-center mb-6">
          <HiArchiveBox className="w-10 h-10 text-zinc-600" />
        </div>
        <h3 className="text-lg font-semibold text-zinc-300 mb-2">No Manifests Installed</h3>
        <p className="text-sm text-zinc-500 max-w-xs">
          Install manifests from the Install tab to see them here
        </p>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      <div className="mb-6">
        <h2 className="text-xl font-semibold text-zinc-100 mb-1">Library</h2>
        <p className="text-sm text-zinc-500">{games.length} manifest{games.length !== 1 ? "s" : ""} installed</p>
      </div>

      <div className="space-y-3 overflow-y-auto flex-1 pr-2">
        <AnimatePresence>
          {games.map((game, index) => (
            <motion.div
              key={game.gameId}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ delay: index * 0.05 }}
              className="group bg-gradient-to-br from-zinc-800/40 to-zinc-900/40 rounded-2xl border border-zinc-700/30 p-4 hover:border-zinc-600/50 transition-all duration-200"
            >
              <div className="flex items-center gap-4">
                <div className="w-16 h-16 rounded-xl bg-zinc-800/80 flex items-center justify-center overflow-hidden flex-shrink-0">
                  <img
                    src={`https://steamcdn-a.akamaihd.net/steam/apps/${game.gameId}/header.jpg`}
                    alt={game.gameName}
                    className="w-full h-full object-cover"
                    onError={(e) => {
                      (e.target as HTMLImageElement).style.display = "none";
                    }}
                  />
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="text-sm font-semibold text-zinc-200 truncate">{game.gameName}</h3>
                  <p className="text-xs text-zinc-500 mt-0.5">App ID: {game.gameId}</p>
                  <p className="text-xs text-zinc-600 mt-1">{game.manifestCount} manifest file{game.manifestCount !== 1 ? "s" : ""}</p>
                </div>
                <button
                  onClick={() => handleUninstall(game.gameId)}
                  disabled={uninstallingId === game.gameId}
                  className="px-4 py-2 bg-red-500/10 hover:bg-red-500/20 text-red-400 text-xs font-medium rounded-xl transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                >
                  {uninstallingId === game.gameId ? (
                    <>
                      <motion.div
                        animate={{ rotate: 360 }}
                        transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                        className="w-3.5 h-3.5 border border-red-400 border-t-transparent rounded-full"
                      />
                      Removing...
                    </>
                  ) : (
                    <>
                      <HiTrash className="w-3.5 h-3.5" />
                      Uninstall
                    </>
                  )}
                </button>
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </div>
  );
}
