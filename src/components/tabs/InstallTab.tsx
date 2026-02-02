"use client";

import { useState, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { HiArchiveBoxArrowDown, HiFolderOpen, HiCheckCircle, HiXCircle, HiArrowUpTray, HiExclamationTriangle } from "react-icons/hi2";

interface InstallTabProps {
  steamPath: string | null;
}

interface ModalState {
  isOpen: boolean;
  type: "success" | "error" | "warning";
  title: string;
  message: string;
  secondaryMessage?: string;
}

interface DroppedFile {
  name: string;
  path: string;
  data: string;
  isArchive?: boolean;
}

export default function InstallTab({ steamPath }: InstallTabProps) {
  const [modal, setModal] = useState<ModalState>({
    isOpen: false,
    type: "success",
    title: "",
    message: "",
  });
  const [isInstalling, setIsInstalling] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const dragCounterRef = useRef(0);

  const showResult = (type: "success" | "error", title: string, message: string) => {
    setModal({ isOpen: true, type, title, message });
  };

  const handleInstallComplete = useCallback(async () => {
    if (!steamPath || typeof window === "undefined" || !window.electronAPI) return;
    
    const bitness = await window.electronAPI.checkSteamBitness(steamPath);
    const isSteamRunning = await window.electronAPI.isSteamRunning();
    
    if (bitness === "64") {
      setModal({
        isOpen: true,
        type: "warning",
        title: "Installation Complete",
        message: "Manifest files installed, but your Steam is 64-bit.",
        secondaryMessage: "You must downgrade Steam to 32-bit in Settings before you can play this game.",
      });
    } else if (isSteamRunning) {
      await window.electronAPI.restartSteam(steamPath);
      setModal({
        isOpen: true,
        type: "success",
        title: "Installation Complete",
        message: "Manifest files installed successfully!",
        secondaryMessage: "Steam has been restarted. Your new game should now appear in your library.",
      });
    } else {
      setModal({
        isOpen: true,
        type: "success",
        title: "Installation Complete",
        message: "Manifest files installed successfully!",
        secondaryMessage: "Open Steam to see your new game in your library.",
      });
    }
  }, [steamPath]);

  const handleInstallFiles = useCallback(async (files: DroppedFile[]) => {
    if (!steamPath || typeof window === "undefined" || !window.electronAPI) return;
    
    setIsInstalling(true);
    try {
      await window.electronAPI.uploadManifestFiles(steamPath, files);
      await handleInstallComplete();
    } catch (err) {
      showResult("error", "Installation Failed", String(err) || "Failed to install manifest files.");
    } finally {
      setIsInstalling(false);
    }
  }, [steamPath, handleInstallComplete]);

  const handleDrag = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    
    if (e.type === "dragenter") {
      dragCounterRef.current++;
      setDragActive(true);
    } else if (e.type === "dragleave") {
      dragCounterRef.current--;
      if (dragCounterRef.current === 0) {
        setDragActive(false);
      }
    }
  }, []);

  const readFileAsBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result as string;
        const base64 = result.split(",")[1];
        resolve(base64);
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  };

  const traverseFileTree = (item: FileSystemEntry, path = ""): Promise<File[]> => {
    return new Promise((resolve) => {
      if (item.isFile) {
        (item as FileSystemFileEntry).file((file) => {
          resolve([file]);
        });
      } else if (item.isDirectory) {
        const dirReader = (item as FileSystemDirectoryEntry).createReader();
        dirReader.readEntries(async (entries) => {
          const files = await Promise.all(
            entries.map((entry) => traverseFileTree(entry, path + item.name + "/"))
          );
          resolve(files.flat());
        });
      } else {
        resolve([]);
      }
    });
  };

  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    dragCounterRef.current = 0;

    if (!steamPath || !e.dataTransfer?.items) return;

    const items = Array.from(e.dataTransfer.items);
    const filesToInstall: DroppedFile[] = [];

    for (const item of items) {
      if (item.kind !== "file") continue;
      
      const file = item.getAsFile();
      if (!file) continue;
      
      const fileName = file.name.toLowerCase();
      
      if (fileName.endsWith(".zip")) {
        const data = await readFileAsBase64(file);
        filesToInstall.push({
          name: file.name,
          path: "",
          data,
          isArchive: true,
        });
      } else if (fileName.endsWith(".lua") || fileName.endsWith(".manifest")) {
        const data = await readFileAsBase64(file);
        filesToInstall.push({
          name: file.name,
          path: "",
          data,
        });
      } else {
        const entry = item.webkitGetAsEntry?.();
        if (entry?.isDirectory) {
          const files = await traverseFileTree(entry);
          for (const f of files) {
            const fName = f.name.toLowerCase();
            if (fName.endsWith(".lua") || fName.endsWith(".manifest")) {
              const data = await readFileAsBase64(f);
              filesToInstall.push({
                name: f.name,
                path: "",
                data,
              });
            }
          }
        }
      }
    }

    if (filesToInstall.length > 0) {
      await handleInstallFiles(filesToInstall);
    } else {
      showResult("error", "Invalid Files", "Please drop a folder, .zip archive, or .lua/.manifest files.");
    }
  }, [steamPath, handleInstallFiles]);

  const handleZipInstall = async () => {
    if (!steamPath || typeof window === "undefined" || !window.electronAPI) return;
    
    try {
      const zipPath = await window.electronAPI.selectZipFile();
      if (!zipPath) return;
      
      setIsInstalling(true);
      await window.electronAPI.installManifestFromZip(steamPath, zipPath);
      await handleInstallComplete();
    } catch (err) {
      showResult("error", "Installation Failed", String(err) || "Failed to install manifest files.");
    } finally {
      setIsInstalling(false);
    }
  };

  const handleFolderInstall = async () => {
    if (!steamPath || typeof window === "undefined" || !window.electronAPI) return;
    
    try {
      const folderPath = await window.electronAPI.selectFolder();
      if (!folderPath) return;
      
      setIsInstalling(true);
      await window.electronAPI.installManifestFromFolder(steamPath, folderPath);
      await handleInstallComplete();
    } catch (err) {
      showResult("error", "Installation Failed", String(err) || "Failed to install manifest files.");
    } finally {
      setIsInstalling(false);
    }
  };

  return (
    <div className="h-full flex flex-col">
      <div className="mb-6">
        <h2 className="text-xl font-semibold text-zinc-100 mb-1">Install Manifests</h2>
        <p className="text-sm text-zinc-500">Add new game manifests to your Steam installation</p>
      </div>

      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        onDragEnter={handleDrag}
        onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }}
        onDragLeave={handleDrag}
        onDrop={handleDrop}
        className={`relative rounded-2xl border-2 border-dashed transition-all duration-300 p-8 mb-6 flex flex-col items-center justify-center min-h-[200px] ${
          dragActive
            ? "border-amber-500 bg-amber-500/10 scale-[1.02]"
            : "border-zinc-700 hover:border-zinc-600 hover:bg-zinc-800/20"
        } ${!steamPath ? "opacity-50 pointer-events-none" : ""}`}
      >
        <AnimatePresence mode="wait">
          {isInstalling ? (
            <motion.div
              key="installing"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex flex-col items-center"
            >
              <div className="relative w-12 h-12 mb-4">
                <motion.div
                  animate={{ rotate: 360 }}
                  transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                  className="absolute inset-0 rounded-full border-2 border-amber-500 border-t-transparent"
                />
              </div>
              <p className="text-zinc-400 text-sm">Installing manifest files...</p>
            </motion.div>
          ) : (
            <motion.div
              key="dropzone"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex flex-col items-center"
            >
              <motion.div
                animate={{ scale: dragActive ? 1.1 : 1 }}
                className={`w-16 h-16 rounded-2xl flex items-center justify-center mb-4 transition-colors ${
                  dragActive ? "bg-amber-500/20" : "bg-zinc-800"
                }`}
              >
                <HiArrowUpTray className={`w-8 h-8 transition-colors ${dragActive ? "text-amber-400" : "text-zinc-500"}`} />
              </motion.div>
              <h3 className={`text-lg font-medium mb-2 transition-colors ${dragActive ? "text-amber-400" : "text-zinc-200"}`}>
                {dragActive ? "Drop Files Here" : "Drag & Drop Files"}
              </h3>
              <p className="text-zinc-500 text-sm text-center max-w-xs mb-4">
                Drop folders, .zip archives, or individual .lua/.manifest files
              </p>
              <div className="flex items-center gap-2">
                <span className="px-3 py-1.5 bg-zinc-800 border border-zinc-700 rounded-lg text-xs text-amber-400 font-mono">.lua</span>
                <span className="px-3 py-1.5 bg-zinc-800 border border-zinc-700 rounded-lg text-xs text-amber-400 font-mono">.manifest</span>
                <span className="px-3 py-1.5 bg-zinc-800 border border-zinc-700 rounded-lg text-xs text-blue-400 font-mono">.zip</span>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>

      <div className="grid grid-cols-2 gap-4">
        <motion.button
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          onClick={handleZipInstall}
          disabled={!steamPath || isInstalling}
          className="group relative bg-gradient-to-br from-zinc-800/60 to-zinc-900/60 rounded-xl border border-zinc-700/30 p-4 hover:border-amber-500/30 transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed text-left"
        >
          <div className="flex items-center gap-4">
            <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center">
              <HiArchiveBoxArrowDown className="w-5 h-5 text-white" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-zinc-100">From ZIP</h3>
              <p className="text-xs text-zinc-500">Select archive</p>
            </div>
          </div>
        </motion.button>

        <motion.button
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
          onClick={handleFolderInstall}
          disabled={!steamPath || isInstalling}
          className="group relative bg-gradient-to-br from-zinc-800/60 to-zinc-900/60 rounded-xl border border-zinc-700/30 p-4 hover:border-zinc-600/50 transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed text-left"
        >
          <div className="flex items-center gap-4">
            <div className="w-10 h-10 rounded-lg bg-zinc-700 flex items-center justify-center">
              <HiFolderOpen className="w-5 h-5 text-zinc-300" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-zinc-100">From Folder</h3>
              <p className="text-xs text-zinc-500">Select directory</p>
            </div>
          </div>
        </motion.button>
      </div>

      <AnimatePresence>
        {modal.isOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className={`bg-[#111114] border rounded-2xl p-6 max-w-sm w-full mx-4 shadow-2xl ${
                modal.type === "success"
                  ? "border-emerald-500/30 shadow-emerald-500/10"
                  : modal.type === "warning"
                    ? "border-amber-500/30 shadow-amber-500/10"
                    : "border-red-500/30 shadow-red-500/10"
              }`}
            >
              <div className="flex items-start gap-4">
                <div className={`w-12 h-12 rounded-full flex items-center justify-center flex-shrink-0 ${
                  modal.type === "success" 
                    ? "bg-emerald-500/20" 
                    : modal.type === "warning"
                      ? "bg-amber-500/20"
                      : "bg-red-500/20"
                }`}>
                  {modal.type === "success" ? (
                    <HiCheckCircle className="w-7 h-7 text-emerald-400" />
                  ) : modal.type === "warning" ? (
                    <HiExclamationTriangle className="w-7 h-7 text-amber-400" />
                  ) : (
                    <HiXCircle className="w-7 h-7 text-red-400" />
                  )}
                </div>
                <div className="flex-1">
                  <h3 className={`font-semibold ${
                    modal.type === "success" 
                      ? "text-emerald-400" 
                      : modal.type === "warning"
                        ? "text-amber-400"
                        : "text-red-400"
                  }`}>
                    {modal.title}
                  </h3>
                  <p className="text-sm text-zinc-400 mt-1">{modal.message}</p>
                  {modal.secondaryMessage && (
                    <p className={`text-xs mt-2 ${modal.type === "warning" ? "text-amber-400/80" : "text-zinc-500"}`}>
                      {modal.secondaryMessage}
                    </p>
                  )}
                </div>
              </div>
              <button
                onClick={() => setModal({ ...modal, isOpen: false })}
                className="mt-5 w-full py-2.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-sm font-medium transition-colors"
              >
                Close
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
