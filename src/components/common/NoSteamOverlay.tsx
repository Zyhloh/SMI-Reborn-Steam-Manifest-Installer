"use client";

import { motion } from "framer-motion";
import { HiExclamationTriangle } from "react-icons/hi2";

export default function NoSteamOverlay() {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="absolute inset-0 bg-[#0a0a0c]/95 backdrop-blur-md flex items-center justify-center z-10"
    >
      <div className="text-center max-w-sm px-6">
        <motion.div
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ delay: 0.1 }}
          className="w-20 h-20 mx-auto mb-6 rounded-2xl bg-gradient-to-br from-amber-500/20 to-orange-500/10 border border-amber-500/20 flex items-center justify-center"
        >
          <HiExclamationTriangle className="w-10 h-10 text-amber-500" />
        </motion.div>
        <motion.h2
          initial={{ y: 10, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.2 }}
          className="text-xl font-semibold text-zinc-200 mb-3"
        >
          Steam Path Required
        </motion.h2>
        <motion.p
          initial={{ y: 10, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.3 }}
          className="text-sm text-zinc-500 leading-relaxed"
        >
          Set your Steam installation path using the button in the sidebar to start using SMI.
        </motion.p>
      </div>
    </motion.div>
  );
}
