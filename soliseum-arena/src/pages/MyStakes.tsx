import { motion } from "framer-motion";
import { Coins, TrendingUp, TrendingDown, Clock } from "lucide-react";
import { useWallet } from "@solana/wallet-adapter-react";
import { GatekeeperOverlay } from "@/components/GatekeeperOverlay";
import { useUserHistory } from "@/hooks/useApi";

const mockStakes = [
  { id: 1, game: "Trading Blitz", agent: "NEXUS-7", amount: 2.5, potential: 4.3, status: "active" as const },
  { id: 2, game: "Quick Chess", agent: "PHANTOM", amount: 1.0, potential: 2.8, status: "active" as const },
  { id: 3, game: "Code Wars", agent: "VORTEX", amount: 3.0, potential: 5.1, status: "won" as const },
  { id: 4, game: "Trading Blitz", agent: "BLAZE", amount: 1.5, potential: 0, status: "lost" as const },
];

type StakeRow = { id: number; game: string; agent: string; amount: number; potential: number; status: "active" | "won" | "lost" };

function apiStakesToRows(history: import("@/lib/api").UserStakeHistory[]): StakeRow[] {
  return history.map((h, i) => ({
    id: h.stakeId,
    game: "Trading Blitz",
    agent: h.side === 0 ? "Agent A" : "Agent B",
    amount: h.amount,
    potential: h.won ? h.amount * 1.5 : h.arenaStatus === "Live" ? h.amount : 0,
    status: h.arenaStatus === "Settled" ? (h.won ? "won" : "lost") : "active",
  }));
}

export default function MyStakes() {
  const { connected, publicKey } = useWallet();
  const { data: apiHistory } = useUserHistory(publicKey?.toBase58());

  const stakes: StakeRow[] = apiHistory && apiHistory.length > 0 ? apiStakesToRows(apiHistory) : mockStakes;
  const activeStakes = stakes.filter((s) => s.status === "active");
  const totalStaked = activeStakes.reduce((s, st) => s + st.amount, 0);
  const totalPnl = stakes.filter((s) => s.status === "won").reduce((s, st) => s + (st.potential - st.amount), 0) -
    stakes.filter((s) => s.status === "lost").reduce((s, st) => s + st.amount, 0);

  return (
    <GatekeeperOverlay isProtected isConnected={connected}>
    <div className="min-h-screen grid-bg">
      <header className="border-b border-border glass px-6 py-4">
        <h1 className="font-display text-xl md:text-2xl font-bold text-foreground text-glow-purple">
          <Coins className="w-5 h-5 inline-block mr-2 text-accent" />
          MY STAKES
        </h1>
        <p className="text-sm text-muted-foreground mt-1">Track your active positions and history</p>
      </header>

      <main className="p-4 md:p-6 space-y-6">
        {/* Summary */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="glass rounded-xl p-5 neon-border-purple">
            <p className="text-xs font-display text-muted-foreground tracking-wider">TOTAL STAKED</p>
            <p className="font-display text-2xl font-bold text-accent mt-1">{totalStaked.toFixed(1)} SOL</p>
          </div>
          <div className="glass rounded-xl p-5">
            <p className="text-xs font-display text-muted-foreground tracking-wider">ACTIVE POSITIONS</p>
            <p className="font-display text-2xl font-bold text-secondary mt-1">{activeStakes.length}</p>
          </div>
          <div className="glass rounded-xl p-5">
            <p className="text-xs font-display text-muted-foreground tracking-wider">ALL-TIME P&L</p>
            <p className={`font-display text-2xl font-bold mt-1 flex items-center gap-1 ${totalPnl >= 0 ? "text-secondary" : "text-destructive"}`}>
              {totalPnl >= 0 ? <TrendingUp className="w-5 h-5" /> : <TrendingDown className="w-5 h-5" />}
              {totalPnl >= 0 ? "+" : ""}{totalPnl.toFixed(1)} SOL
            </p>
          </div>
        </div>

        {/* Stakes list */}
        <div className="space-y-3">
          {stakes.map((stake, i) => (
            <motion.div
              key={stake.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.08 }}
              className={`glass rounded-xl p-4 flex items-center gap-4 ${
                stake.status === "active" ? "neon-border-teal" : "border border-border"
              }`}
            >
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-display text-sm font-bold text-foreground">{stake.agent}</span>
                  <span className="text-xs text-muted-foreground">· {stake.game}</span>
                </div>
                <div className="flex items-center gap-2 mt-1">
                  {stake.status === "active" && (
                    <span className="flex items-center gap-1 text-xs text-secondary">
                      <Clock className="w-3 h-3" />
                      In Progress
                    </span>
                  )}
                  {stake.status === "won" && (
                    <span className="flex items-center gap-1 text-xs text-secondary">
                      <TrendingUp className="w-3 h-3" />
                      Won
                    </span>
                  )}
                  {stake.status === "lost" && (
                    <span className="flex items-center gap-1 text-xs text-destructive">
                      <TrendingDown className="w-3 h-3" />
                      Lost
                    </span>
                  )}
                </div>
              </div>

              <div className="text-right">
                <p className="font-display text-sm font-bold text-foreground">{stake.amount} SOL</p>
                {stake.status !== "lost" && (
                  <p className="text-xs text-secondary">→ {stake.potential} SOL</p>
                )}
              </div>
            </motion.div>
          ))}
        </div>
      </main>
    </div>
    </GatekeeperOverlay>
  );
}
