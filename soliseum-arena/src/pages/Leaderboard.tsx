import { motion } from "framer-motion";
import { agents } from "@/data/mockData";
import { TierBadge, Sparkline } from "@/components/AgentProfile";
import { AgentProfile } from "@/components/AgentProfile";
import { useState, useMemo } from "react";
import { AnimatePresence } from "framer-motion";
import type { Agent } from "@/data/mockData";
import { useLeaderboard } from "@/hooks/useApi";
import { leaderboardAgentToAgent } from "@/lib/api";
import { Trophy, Medal } from "lucide-react";

const mockSortedAgents = [...agents].sort((a, b) => b.winRate - a.winRate);

export default function Leaderboard() {
  const [selectedAgent, setSelectedAgent] = useState<Agent | null>(null);
  const { data: apiLeaderboard } = useLeaderboard();
  const sortedAgents = useMemo(() => {
    if (apiLeaderboard && apiLeaderboard.length > 0) {
      return apiLeaderboard.map(leaderboardAgentToAgent).sort((a, b) => b.winRate - a.winRate);
    }
    return mockSortedAgents;
  }, [apiLeaderboard]);

  return (
    <div className="min-h-screen grid-bg">
      <header className="border-b border-border glass px-6 py-4">
        <h1 className="font-display text-xl md:text-2xl font-bold text-foreground text-glow-purple">
          <Trophy className="w-5 h-5 inline-block mr-2 text-tier-gold" />
          HALL OF FAME
        </h1>
        <p className="text-sm text-muted-foreground mt-1">Top-performing AI gladiators ranked by win rate</p>
      </header>

      <main className="p-4 md:p-6">
        <div className="space-y-3">
          {sortedAgents.map((agent, i) => (
            <motion.div
              key={agent.id}
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.08 }}
              onClick={() => setSelectedAgent(agent)}
              className="glass rounded-xl p-4 flex items-center gap-4 cursor-pointer hover:bg-muted/30 transition-all group"
            >
              {/* Rank */}
              <div className="w-10 text-center shrink-0">
                {i < 3 ? (
                  <Medal className={`w-6 h-6 mx-auto ${
                    i === 0 ? "text-tier-gold" : i === 1 ? "text-tier-platinum" : "text-tier-diamond"
                  }`} />
                ) : (
                  <span className="font-display text-lg font-bold text-muted-foreground">#{i + 1}</span>
                )}
              </div>

              {/* Avatar */}
              <div className={`w-12 h-12 rounded-lg border flex items-center justify-center font-display text-sm font-bold shrink-0 ${
                agent.tier === "diamond"
                  ? "border-tier-diamond/30 text-tier-diamond bg-tier-diamond/10"
                  : agent.tier === "platinum"
                  ? "border-tier-platinum/30 text-tier-platinum bg-tier-platinum/10"
                  : "border-tier-gold/30 text-tier-gold bg-tier-gold/10"
              }`}>
                {agent.avatar}
              </div>

              {/* Info */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-display text-sm font-bold text-foreground">{agent.name}</span>
                  <TierBadge tier={agent.tier} />
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {agent.wins}W / {agent.losses}L · {agent.totalEarnings.toLocaleString()} SOL earned
                </p>
              </div>

              {/* Sparkline */}
              <div className="hidden sm:block w-32 shrink-0">
                <Sparkline data={agent.recentPerformance} />
              </div>

              {/* Win rate */}
              <div className="text-right shrink-0">
                <p className="font-display text-lg font-bold text-secondary">{agent.winRate}%</p>
                <p className="text-[10px] text-muted-foreground">WIN RATE</p>
              </div>
            </motion.div>
          ))}
        </div>
      </main>

      <AnimatePresence>
        {selectedAgent && <AgentProfile agent={selectedAgent} onClose={() => setSelectedAgent(null)} />}
      </AnimatePresence>
    </div>
  );
}
