import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { AlertTriangle, ChevronDown, ExternalLink } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { SolanaCluster } from "@/config/soliseum";

interface NetworkGuardianProps {
  /** Current app cluster */
  cluster: SolanaCluster;
  /** Whether wallet is connected - only show when connected */
  isConnected: boolean;
  /** Optional: attempt to switch network (Solana wallets don't support this programmatically, but we expose the UI) */
  onAttemptSwitch?: () => void;
}

const CLUSTER_LABELS: Record<SolanaCluster, string> = {
  devnet: "DEVNET",
  testnet: "TESTNET",
  "mainnet-beta": "MAINNET",
};

/**
 * Network Guardian: Top-bar urgent alert when app is on Devnet (or mismatch scenario).
 * Warning Orange (#FF9D00) styling with vibrating animation.
 */
export function NetworkGuardian({
  cluster,
  isConnected,
  onAttemptSwitch,
}: NetworkGuardianProps) {
  const [isDismissed, setIsDismissed] = useState(false);
  const [showHowTo, setShowHowTo] = useState(false);

  // Only show when connected and on devnet (testing mode - common mismatch scenario)
  const shouldShow = isConnected && cluster === "devnet" && !isDismissed;

  return (
    <AnimatePresence>
      {shouldShow && (
      <motion.div
        key="network-guardian"
        initial={{ height: 0, opacity: 0 }}
        animate={{ height: "auto", opacity: 1 }}
        exit={{ height: 0, opacity: 0 }}
        transition={{ duration: 0.3 }}
        className="overflow-hidden"
      >
        <div
          className="flex items-center justify-center gap-3 px-4 py-2.5 animate-[vibrate_0.3s_ease-in-out_2]"
          style={{
            background: "linear-gradient(90deg, #FF9D00 0%, #FFB833 50%, #FF9D00 100%)",
            backgroundSize: "200% 100%",
            animation: "shimmer-warning 2s ease-in-out infinite",
          }}
        >
          <AlertTriangle className="w-4 h-4 text-black shrink-0" />
          <span className="font-display text-xs font-bold text-black tracking-wider">
            NETWORK MISMATCH: You may be on Mainnet. Soliseum is currently active on{" "}
            {CLUSTER_LABELS[cluster]} for testing.
          </span>
          <div className="flex items-center gap-2 shrink-0">
            <TooltipProvider delayDuration={0}>
              <Tooltip open={showHowTo} onOpenChange={setShowHowTo}>
                <TooltipTrigger asChild>
                  <button
                    onClick={() => setShowHowTo(!showHowTo)}
                    className="flex items-center gap-1 px-2.5 py-1 rounded-md bg-black/20 hover:bg-black/30 font-display text-xs font-bold text-black transition-colors"
                  >
                    How to change network
                    <ChevronDown
                      className={`w-3.5 h-3.5 transition-transform ${showHowTo ? "rotate-180" : ""}`}
                    />
                  </button>
                </TooltipTrigger>
                <TooltipContent
                  side="bottom"
                  className="max-w-xs p-4 bg-black/90 text-white border-[#FF9D00]/50"
                >
                  <p className="text-xs mb-2 font-semibold">Switch to Devnet in your wallet:</p>
                  <ul className="text-xs space-y-1 text-muted-foreground">
                    <li>
                      <strong className="text-foreground">Phantom:</strong> Settings → Developer
                      Settings → Change Network → Devnet
                    </li>
                    <li>
                      <strong className="text-foreground">Solflare:</strong> Settings → Network →
                      Devnet
                    </li>
                  </ul>
                  <a
                    href="https://solana.com/docs/core/clusters"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 mt-2 text-xs text-[#FF9D00] hover:underline"
                  >
                    Learn more
                    <ExternalLink className="w-3 h-3" />
                  </a>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
            <button
              onClick={onAttemptSwitch ?? (() => setShowHowTo(true))}
              className="px-2.5 py-1 rounded-md bg-black/20 hover:bg-black/30 font-display text-xs font-bold text-black transition-colors"
            >
              Attempt Network Switch
            </button>
            <button
              onClick={() => setIsDismissed(true)}
              className="px-2 py-0.5 rounded text-black/70 hover:text-black hover:bg-black/10 text-xs font-medium"
            >
              Dismiss
            </button>
          </div>
        </div>
      </motion.div>
      )}
    </AnimatePresence>
  );
}
