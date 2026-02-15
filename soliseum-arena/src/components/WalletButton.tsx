import { Wallet, Copy, ExternalLink, LogOut } from "lucide-react";
import { motion } from "framer-motion";
import { useWallet } from "@solana/wallet-adapter-react";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";
import { useConnection } from "@solana/wallet-adapter-react";
import { LAMPORTS_PER_SOL } from "@solana/web3.js";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { SolanaLogo } from "@/components/SolanaLogo";

const SOLSCAN_BASE = "https://solscan.io/account";

export function WalletButton() {
  const { publicKey, disconnect, connected, connecting, error } = useWallet();
  const { setVisible } = useWalletModal();
  const { connection } = useConnection();
  const [balance, setBalance] = useState<number | null>(null);
  const prevConnectingRef = useRef(false);
  const prevErrorRef = useRef<Error | null>(null);

  // Fetch wallet balance when connected
  useEffect(() => {
    if (publicKey && connected) {
      connection.getBalance(publicKey).then((b) => setBalance(b / LAMPORTS_PER_SOL));
    } else {
      setBalance(null);
    }
  }, [publicKey, connected, connection]);

  // Connection Aborted toast when user cancels
  useEffect(() => {
    if (prevConnectingRef.current && !connecting && !connected) {
      if (error) {
        toast.error("Connection Aborted", {
          description: error.message || "Wallet connection was rejected.",
          position: "bottom-right",
        });
      }
    }
    prevConnectingRef.current = connecting;
    prevErrorRef.current = error;
  }, [connecting, connected, error]);

  const handleDisconnect = async () => {
    await disconnect();
  };

  const handleCopyAddress = () => {
    if (publicKey) {
      navigator.clipboard.writeText(publicKey.toBase58());
      toast.success("Address copied to clipboard", { position: "bottom-right" });
    }
  };

  const handleViewSolscan = () => {
    if (publicKey) {
      window.open(`${SOLSCAN_BASE}/${publicKey.toBase58()}`, "_blank");
    }
  };

  // Loading state: "Scanning Biometrics..."
  if (connecting) {
    return (
      <motion.div
        initial={{ opacity: 0.5 }}
        animate={{ opacity: 1 }}
        className="flex items-center gap-2 px-4 py-2 rounded-xl glass border border-primary/30"
      >
        <motion.div
          animate={{ scale: [1, 1.2, 1], opacity: [0.7, 1, 0.7] }}
          transition={{ duration: 1.2, repeat: Infinity, ease: "easeInOut" }}
        >
          <SolanaLogo className="w-5 h-5 text-primary" />
        </motion.div>
        <span className="font-display text-xs font-medium text-muted-foreground">
          Scanning Biometrics...
        </span>
      </motion.div>
    );
  }

  // Identity Badge (connected state)
  if (connected && publicKey) {
    const address = publicKey.toBase58();
    const shortAddress = `${address.slice(0, 4)}...${address.slice(-4)}`;

    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            className="flex items-center gap-2 px-3 py-2 rounded-xl glass border border-white/10 backdrop-blur-xl hover:border-primary/40 transition-all cursor-pointer"
          >
            <SolanaLogo className="w-4 h-4 text-primary shrink-0" />
            <span className="font-mono text-xs font-medium text-foreground">{shortAddress}</span>
            {balance !== null && (
              <span className="font-display text-xs font-bold text-secondary">{balance.toFixed(2)} SOL</span>
            )}
          </motion.button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="end"
          sideOffset={8}
          className="min-w-[200px] glass border-white/10 backdrop-blur-xl bg-background/95"
        >
          <DropdownMenuItem
            onClick={handleCopyAddress}
            className="flex items-center gap-2 cursor-pointer focus:bg-white/10"
          >
            <Copy className="w-4 h-4" />
            Copy Address
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={handleViewSolscan}
            className="flex items-center gap-2 cursor-pointer focus:bg-white/10"
          >
            <ExternalLink className="w-4 h-4" />
            View on Solscan
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={handleDisconnect}
            className="flex items-center gap-2 cursor-pointer focus:bg-destructive/20 focus:text-destructive text-destructive"
          >
            <LogOut className="w-4 h-4" />
            Disconnect
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    );
  }

  // Unconnected: Connect button
  return (
    <motion.button
      whileHover={{ scale: 1.03 }}
      whileTap={{ scale: 0.97 }}
      onClick={() => setVisible(true)}
      className="flex items-center gap-2 px-4 py-2 rounded-xl bg-primary font-display text-xs font-bold text-primary-foreground glow-purple glitch-hover transition-all"
    >
      <Wallet className="w-4 h-4" />
      Connect Wallet
    </motion.button>
  );
}
