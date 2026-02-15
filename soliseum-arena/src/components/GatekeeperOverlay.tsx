import { motion } from "framer-motion";
import { Lock, Zap } from "lucide-react";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";

interface GatekeeperOverlayProps {
  children: React.ReactNode;
  isProtected: boolean;
  isConnected: boolean;
}

/**
 * Gatekeeper Overlay: Semi-transparent blurred overlay over protected sections
 * when no wallet is connected. Displays holographic card and "INITIALIZE CONNECTION" button.
 */
export function GatekeeperOverlay({ children, isProtected, isConnected }: GatekeeperOverlayProps) {
  const { setVisible } = useWalletModal();

  if (!isProtected || isConnected) {
    return <>{children}</>;
  }

  return (
    <div className="relative min-h-[400px]">
      {/* Blurred content behind overlay */}
      <div className="pointer-events-none select-none blur-md opacity-40 scale-[0.98] origin-center">
        {children}
      </div>

      {/* Semi-transparent blurred overlay */}
      <div
        className="absolute inset-0 flex items-center justify-center z-10 backdrop-blur-xl bg-background/60"
        aria-hidden="false"
      >
        {/* Floating holographic card */}
        <motion.div
          initial={{ opacity: 0, y: 20, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.5, ease: "easeOut" }}
          className="relative max-w-sm w-full mx-4"
        >
          <div className="holographic rounded-2xl p-8 sm:p-10 neon-border-purple border-2 shadow-2xl">
            {/* Lock icon */}
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ delay: 0.2, type: "spring", stiffness: 200 }}
              className="flex justify-center mb-4"
            >
              <div className="w-16 h-16 rounded-full bg-primary/20 border-2 border-primary/50 flex items-center justify-center glow-purple">
                <Lock className="w-8 h-8 text-primary" />
              </div>
            </motion.div>

            <h2 className="font-display text-center text-lg sm:text-xl font-bold text-foreground tracking-wider mb-2 text-glow-purple">
              THE ARENA REQUIRES AUTHENTICATION
            </h2>
            <p className="text-center text-sm text-muted-foreground mb-6">
              Connect your Solana wallet to access this secure terminal.
            </p>

            {/* INITIALIZE CONNECTION button */}
            <motion.button
              whileHover={{ scale: 1.03, boxShadow: "0 0 30px hsl(var(--neon-teal) / 0.4)" }}
              whileTap={{ scale: 0.98 }}
              onClick={() => setVisible(true)}
              className="w-full flex items-center justify-center gap-3 px-6 py-4 rounded-xl font-display text-base font-bold text-primary-foreground bg-primary glow-teal border-2 border-secondary/50 transition-all hover:border-secondary"
            >
              <Zap className="w-5 h-5" />
              INITIALIZE CONNECTION
            </motion.button>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
