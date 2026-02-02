"use client";

import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { HiCheckCircle, HiXCircle, HiArrowPath, HiCog6Tooth, HiExclamationTriangle } from "react-icons/hi2";
import type { SmiStatus } from "@/types";

interface SettingsTabProps {
  steamPath: string | null;
  setIsProcessing: (processing: boolean) => void;
}

export default function SettingsTab({ steamPath, setIsProcessing }: SettingsTabProps) {
  const [currentBitness, setCurrentBitness] = useState<"32" | "64" | null>(null);
  const [selectedBitness, setSelectedBitness] = useState<"32" | "64" | null>(null);
  const [hasUserChangedToggle, setHasUserChangedToggle] = useState(false);
  const [isApplying, setIsApplying] = useState(false);
  const [applyStatus, setApplyStatus] = useState<string | null>(null);
  const [smiStatus, setSmiStatus] = useState<SmiStatus | null>(null);
  const [isInstallingResources, setIsInstallingResources] = useState(false);
  const [showUninstallConfirm, setShowUninstallConfirm] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);
  const totalSteps = 4;

  const stepLabels = [
    "Preparing downgrade...",
    "Closing Steam processes...",
    "Downloading 32-bit client...",
    "Installing files...",
    "Completed!"
  ];

  const hasChanges = currentBitness !== null && selectedBitness !== null && currentBitness !== selectedBitness;

  const checkStatus = useCallback(async () => {
    if (!steamPath || typeof window === "undefined" || !window.electronAPI) return;

    try {
      const bitness = await window.electronAPI.checkSteamBitness(steamPath);
      setCurrentBitness(bitness);
      if (!hasUserChangedToggle) {
        setSelectedBitness(bitness);
      }
    } catch {}

    try {
      const status = await window.electronAPI.checkSmiStatus(steamPath);
      setSmiStatus(status);
    } catch {}
  }, [steamPath, hasUserChangedToggle]);

  useEffect(() => {
    checkStatus();
    const interval = setInterval(checkStatus, 15000);
    return () => clearInterval(interval);
  }, [checkStatus]);

  const handleInstallResources = async () => {
    if (!steamPath || typeof window === "undefined" || !window.electronAPI) return;
    
    setIsInstallingResources(true);
    try {
      await window.electronAPI.installSmiResources(steamPath);
      await checkStatus();
    } catch (e) {
      console.error("Failed to install SMI resources:", e);
    } finally {
      setIsInstallingResources(false);
    }
  };

  const handleUninstallResources = async () => {
    if (!steamPath || typeof window === "undefined" || !window.electronAPI) return;
    
    setIsInstallingResources(true);
    try {
      await window.electronAPI.uninstallSmiResources(steamPath);
      await checkStatus();
    } catch (e) {
      console.error("Failed to uninstall SMI resources:", e);
    } finally {
      setIsInstallingResources(false);
    }
  };

  const handleApply = async () => {
    if (!steamPath || !selectedBitness || typeof window === "undefined" || !window.electronAPI) return;

    setIsApplying(true);
    setIsProcessing(true);
    setCurrentStep(0);

    try {
      if (selectedBitness === "32") {
        setCurrentStep(1);
        await new Promise((r) => setTimeout(r, 800));
        
        setCurrentStep(2);
        
        let progressCount = 0;
        window.electronAPI.onDowngradeProgress(() => {
          progressCount++;
          if (progressCount > 5 && currentStep < 3) {
            setCurrentStep(3);
          }
        });
        
        await window.electronAPI.downgradeSteam(steamPath);
        
        window.electronAPI.removeDowngradeProgressListener();
        setCurrentStep(4);
        setApplyStatus("Downgrade complete! Restart Steam to apply changes.");
      } else {
        setCurrentStep(1);
        await new Promise((r) => setTimeout(r, 500));
        setCurrentStep(2);
        await window.electronAPI.upgradeSteam(steamPath);
        setCurrentStep(4);
        setApplyStatus("Complete! Steam will update to 64-bit on next launch.");
      }
      await new Promise((r) => setTimeout(r, 2000));
      setHasUserChangedToggle(false);
      await checkStatus();
    } catch (e) {
      console.error("Failed to change Steam version:", e);
      setApplyStatus("Operation failed. Make sure Steam is closed and try again.");
      window.electronAPI.removeDowngradeProgressListener();
    } finally {
      setIsApplying(false);
      setIsProcessing(false);
      setCurrentStep(0);
    }
  };

  if (!steamPath) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-center px-6">
        <div className="w-20 h-20 rounded-2xl bg-zinc-800/50 flex items-center justify-center mb-6">
          <HiCog6Tooth className="w-10 h-10 text-zinc-600" />
        </div>
        <h3 className="text-lg font-semibold text-zinc-300 mb-2">Steam Path Required</h3>
        <p className="text-sm text-zinc-500 max-w-xs">
          Set your Steam installation path first to access settings
        </p>
      </div>
    );
  }

  if (isApplying) {
    return (
      <div className="h-full flex flex-col items-center justify-center">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="bg-zinc-800/50 rounded-2xl border border-zinc-700/30 p-10 max-w-md w-full"
        >
          <h3 className="text-lg font-semibold text-zinc-200 mb-6 text-center">
            {selectedBitness === "32" ? "Downgrading Steam" : "Upgrading Steam"}
          </h3>
          
          <div className="space-y-4 mb-6">
            {[1, 2, 3, 4].map((step) => (
              <div key={step} className="flex items-center gap-4">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold transition-all duration-300 ${
                  currentStep > step 
                    ? "bg-emerald-500 text-white" 
                    : currentStep === step 
                      ? "bg-amber-500 text-white" 
                      : "bg-zinc-700 text-zinc-500"
                }`}>
                  {currentStep > step ? (
                    <HiCheckCircle className="w-5 h-5" />
                  ) : (
                    step
                  )}
                </div>
                <div className="flex-1">
                  <p className={`text-sm font-medium transition-colors ${
                    currentStep >= step ? "text-zinc-200" : "text-zinc-500"
                  }`}>
                    Step {step}
                  </p>
                  <p className={`text-xs transition-colors ${
                    currentStep === step ? "text-amber-400" : currentStep > step ? "text-emerald-400" : "text-zinc-600"
                  }`}>
                    {currentStep === step && step < 4 ? stepLabels[step] : currentStep > step ? "Complete" : "Waiting..."}
                  </p>
                </div>
                {currentStep === step && step < 4 && (
                  <motion.div
                    animate={{ rotate: 360 }}
                    transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                    className="w-5 h-5 border-2 border-amber-500 border-t-transparent rounded-full"
                  />
                )}
              </div>
            ))}
          </div>

          {currentStep === 4 ? (
            <div className="text-center">
              <p className="text-emerald-400 font-medium">{stepLabels[4]}</p>
              <p className="text-xs text-zinc-500 mt-2">{applyStatus}</p>
            </div>
          ) : (
            <p className="text-xs text-zinc-500 text-center">This may take a few minutes. Please don&apos;t close the app.</p>
          )}
        </motion.div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      <div className="mb-6">
        <h2 className="text-xl font-semibold text-zinc-100 mb-1">Settings</h2>
        <p className="text-sm text-zinc-500">Configure SMI and Steam settings</p>
      </div>

      <div className="space-y-4">
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-gradient-to-br from-zinc-800/40 to-zinc-900/40 rounded-2xl border border-zinc-700/30 p-5"
        >
          <h3 className="text-sm font-semibold text-zinc-200 mb-4 flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-amber-500" />
            SMI Setup
          </h3>

          <div className="space-y-3">
            {[
              { label: "hid.dll", status: smiStatus?.hidDllInstalled, statusText: smiStatus?.hidDllInstalled ? "Installed" : "Not Installed" },
              { label: "depotcache folder", status: smiStatus?.depotcacheExists, statusText: smiStatus?.depotcacheExists ? "Exists" : "Missing" },
              { label: "stplug-in folder", status: smiStatus?.stpluginExists, statusText: smiStatus?.stpluginExists ? "Exists" : "Missing" },
            ].map((item) => (
              <div key={item.label} className="flex items-center justify-between py-2">
                <div className="flex items-center gap-3">
                  {item.status ? (
                    <HiCheckCircle className="w-5 h-5 text-emerald-500" />
                  ) : (
                    <HiXCircle className="w-5 h-5 text-red-500" />
                  )}
                  <span className="text-sm text-zinc-300">{item.label}</span>
                </div>
                <span className={`text-xs font-medium ${item.status ? "text-emerald-400" : "text-red-400"}`}>
                  {item.statusText}
                </span>
              </div>
            ))}
          </div>

          <div className="mt-5 pt-4 border-t border-zinc-700/30">
            {!smiStatus?.isSetup ? (
              <button
                onClick={handleInstallResources}
                disabled={isInstallingResources}
                className="w-full px-4 py-3 bg-gradient-to-r from-emerald-500 to-green-500 hover:from-emerald-400 hover:to-green-400 text-white text-sm font-semibold rounded-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {isInstallingResources ? (
                  <>
                    <HiArrowPath className="w-4 h-4 animate-spin" />
                    Installing...
                  </>
                ) : (
                  "Install SMI Resources"
                )}
              </button>
            ) : (
              <button
                onClick={() => setShowUninstallConfirm(true)}
                disabled={isInstallingResources}
                className="w-full px-4 py-3 bg-zinc-700 hover:bg-zinc-600 text-zinc-300 text-sm font-semibold rounded-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {isInstallingResources ? (
                  <>
                    <HiArrowPath className="w-4 h-4 animate-spin" />
                    Uninstalling...
                  </>
                ) : (
                  "Uninstall SMI Resources"
                )}
              </button>
            )}
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="bg-gradient-to-br from-zinc-800/40 to-zinc-900/40 rounded-2xl border border-zinc-700/30 p-5"
        >
          <h3 className="text-sm font-semibold text-zinc-200 mb-4 flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-blue-500" />
            Steam Version
          </h3>

          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-zinc-300">Steam Client Architecture</p>
              <p className="text-xs text-zinc-500 mt-1">
                {currentBitness === "64"
                  ? "SMI requires 32-bit Steam to function"
                  : "Your Steam is compatible with SMI"}
              </p>
            </div>

            <div className="flex items-center gap-3">
              <span className={`text-xs font-medium ${selectedBitness === "64" ? "text-red-400" : "text-zinc-600"}`}>
                64-bit
              </span>
              <button
                onClick={() => {
                  setHasUserChangedToggle(true);
                  setSelectedBitness(selectedBitness === "64" ? "32" : "64");
                }}
                disabled={currentBitness === null || isApplying}
                className={`relative w-14 h-7 rounded-full transition-colors ${
                  selectedBitness === "64" ? "bg-red-500" : "bg-emerald-500"
                } ${currentBitness === null || isApplying ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}`}
              >
                <motion.span
                  layout
                  className="absolute top-1 w-5 h-5 rounded-full bg-white shadow-md"
                  style={{ left: selectedBitness === "64" ? 4 : "auto", right: selectedBitness === "32" ? 4 : "auto" }}
                />
              </button>
              <span className={`text-xs font-medium ${selectedBitness === "32" ? "text-emerald-400" : "text-zinc-600"}`}>
                32-bit
              </span>
            </div>
          </div>

          {hasChanges && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              className="mt-5 pt-4 border-t border-zinc-700/30"
            >
              <div className="flex items-center justify-between gap-4">
                <p className="text-xs text-amber-400">
                  {selectedBitness === "32"
                    ? "This will downgrade Steam to 32-bit"
                    : "This will allow Steam to update to 64-bit"}
                </p>
                <button
                  onClick={handleApply}
                  disabled={isApplying}
                  className="px-5 py-2.5 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 text-white text-sm font-semibold rounded-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                >
                  Apply Changes
                </button>
              </div>
            </motion.div>
          )}
        </motion.div>
      </div>

      <AnimatePresence>
        {showUninstallConfirm && (
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
              className="bg-[#111114] border border-red-500/30 rounded-2xl p-6 max-w-md w-full mx-4 shadow-2xl shadow-red-500/10"
            >
              <div className="flex items-start gap-4">
                <div className="w-12 h-12 rounded-full bg-red-500/20 flex items-center justify-center flex-shrink-0">
                  <HiExclamationTriangle className="w-6 h-6 text-red-400" />
                </div>
                <div className="flex-1">
                  <h3 className="text-lg font-semibold text-red-400">Uninstall SMI Resources?</h3>
                  <p className="text-sm text-zinc-400 mt-2 leading-relaxed">
                    This will permanently delete:
                  </p>
                  <ul className="text-sm text-zinc-500 mt-2 space-y-1">
                    <li>• <span className="text-zinc-400">hid.dll</span> - SMI loader</li>
                    <li>• <span className="text-zinc-400">depotcache/</span> - All manifest files</li>
                    <li>• <span className="text-zinc-400">stplug-in/</span> - All game configs</li>
                  </ul>
                  <p className="text-sm text-amber-400 mt-3 font-medium">
                    All installed game manifests will be lost!
                  </p>
                </div>
              </div>
              <div className="flex gap-3 mt-6">
                <button
                  onClick={() => setShowUninstallConfirm(false)}
                  className="flex-1 py-2.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-sm font-medium transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={async () => {
                    setShowUninstallConfirm(false);
                    await handleUninstallResources();
                  }}
                  className="flex-1 py-2.5 rounded-xl bg-red-500 hover:bg-red-400 text-white text-sm font-semibold transition-colors"
                >
                  Uninstall
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
