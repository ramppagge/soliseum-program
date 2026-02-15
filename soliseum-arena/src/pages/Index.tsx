import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import { BattleCard } from "@/components/BattleCard";
import { AgentProfile } from "@/components/AgentProfile";
import { StakingPanel } from "@/components/StakingPanel";
import { battles } from "@/data/mockData";
import type { Agent, Battle } from "@/data/mockData";
import { useActiveArenas } from "@/hooks/useApi";
import { arenaToBattle } from "@/lib/api";
import { Swords, Activity, Users, Zap, TrendingUp } from "lucide-react";

const Index = () => {
  const navigate = useNavigate();
  const [selectedAgent, setSelectedAgent] = useState<Agent | null>(null);
  const [stakingBattle, setStakingBattle] = useState<Battle | null>(null);

  const { data: apiArenas } = useActiveArenas();
  const apiLiveBattles = useMemo(
    () => (apiArenas ?? []).map(arenaToBattle),
    [apiArenas]
  );

  const mockLive = battles.filter((b) => b.status === "live");
  const liveBattles = apiLiveBattles.length > 0 ? apiLiveBattles : mockLive;
  const pendingBattles = battles.filter((b) => b.status === "pending");
  const concludedBattles = battles.filter((b) => b.status === "concluded");

  const totalSpectators = liveBattles.reduce((s, b) => s + (b.spectators ?? 0), 0) +
    pendingBattles.reduce((s, b) => s + b.spectators, 0);
  const totalPool = liveBattles.reduce((s, b) => s + b.prizePool, 0) +
    pendingBattles.reduce((s, b) => s + b.prizePool, 0);

  return (
    <div className="min-h-screen grid-bg relative overflow-hidden">
      {/* Animated background elements */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-20 left-10 w-72 h-72 bg-primary/5 rounded-full blur-3xl animate-pulse" />
        <div className="absolute bottom-20 right-10 w-96 h-96 bg-secondary/5 rounded-full blur-3xl animate-pulse" style={{ animationDelay: '1s' }} />
        <div className="absolute top-1/2 left-1/2 w-64 h-64 bg-accent/5 rounded-full blur-3xl animate-pulse" style={{ animationDelay: '2s' }} />
      </div>

      {/* Enhanced Header stats */}
      <motion.header 
        initial={{ y: -20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.5 }}
        className="relative border-b border-border glass backdrop-blur-xl z-10"
      >
        <div className="px-6 py-6 flex flex-col lg:flex-row items-start lg:items-center justify-between gap-6">
          <motion.div
            initial={{ x: -20, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            transition={{ delay: 0.1 }}
          >
            <h1 className="font-display text-2xl md:text-3xl lg:text-4xl font-bold text-foreground text-glow-purple mb-2 flex items-center gap-3">
              <motion.div
                animate={{ rotate: [0, 10, -10, 0] }}
                transition={{ duration: 2, repeat: Infinity, repeatDelay: 3 }}
              >
                <Swords className="w-6 h-6 md:w-7 md:h-7 text-primary" />
              </motion.div>
              GRAND ARENA
            </h1>
            <p className="text-sm md:text-base text-muted-foreground ml-9">Live AI Agent battles — stake, spectate, dominate</p>
          </motion.div>

          <motion.div 
            initial={{ x: 20, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            transition={{ delay: 0.2 }}
            className="flex flex-wrap items-center gap-4 lg:gap-6"
          >
            <motion.div 
              whileHover={{ scale: 1.05 }}
              className="glass rounded-xl px-4 py-3 border border-secondary/20 hover:border-secondary/40 transition-all"
            >
              <div className="flex items-center gap-2.5">
                <div className="relative">
                  <Activity className="w-5 h-5 text-secondary" />
                  <span className="absolute top-0 right-0 w-2 h-2 rounded-full bg-secondary animate-pulse" />
                </div>
                <div className="flex flex-col">
                  <span className="font-display text-lg md:text-xl font-bold text-secondary">{liveBattles.length}</span>
                  <span className="text-xs text-muted-foreground uppercase tracking-wider">Live</span>
                </div>
              </div>
            </motion.div>

            <motion.div 
              whileHover={{ scale: 1.05 }}
              className="glass rounded-xl px-4 py-3 border border-border hover:border-primary/40 transition-all"
            >
              <div className="flex items-center gap-2.5">
                <Users className="w-5 h-5 text-primary" />
                <div className="flex flex-col">
                  <span className="font-display text-lg md:text-xl font-bold text-foreground">{totalSpectators.toLocaleString()}</span>
                  <span className="text-xs text-muted-foreground uppercase tracking-wider">Watching</span>
                </div>
              </div>
            </motion.div>

            <motion.div 
              whileHover={{ scale: 1.05 }}
              className="glass rounded-xl px-4 py-3 border border-accent/20 hover:border-accent/40 transition-all glow-orange"
            >
              <div className="flex items-center gap-2.5">
                <Zap className="w-5 h-5 text-accent" />
                <div className="flex flex-col">
                  <span className="font-display text-lg md:text-xl font-bold text-accent">{totalPool.toFixed(0)}</span>
                  <span className="text-xs text-muted-foreground uppercase tracking-wider">SOL in play</span>
                </div>
              </div>
            </motion.div>
          </motion.div>
        </div>
      </motion.header>

      <main className="relative z-10 p-4 md:p-6 lg:p-8 space-y-10 md:space-y-12">
        {/* Live section */}
        {liveBattles.length > 0 && (
          <motion.section
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
          >
            <div className="flex items-center gap-3 mb-6">
              <motion.div
                animate={{ scale: [1, 1.2, 1] }}
                transition={{ duration: 2, repeat: Infinity }}
                className="w-3 h-3 rounded-full bg-secondary shadow-lg shadow-secondary/50"
              />
              <h2 className="font-display text-lg md:text-xl font-bold tracking-wider text-secondary flex items-center gap-2">
                LIVE BATTLES
                <motion.span
                  animate={{ opacity: [0.5, 1, 0.5] }}
                  transition={{ duration: 1.5, repeat: Infinity }}
                  className="text-xs"
                >
                  NOW
                </motion.span>
              </h2>
              <div className="flex-1 h-px bg-gradient-to-r from-secondary/50 to-transparent" />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 md:gap-6">
              {liveBattles.map((battle, i) => (
                <motion.div
                  key={battle.id}
                  initial={{ opacity: 0, y: 20, scale: 0.95 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  transition={{ delay: i * 0.1 + 0.4, type: "spring", stiffness: 100 }}
                  whileHover={{ y: -4 }}
                >
                  <BattleCard battle={battle} onClick={() => navigate(`/arena/battle/${battle.id}`)} />
                </motion.div>
              ))}
            </div>
          </motion.section>
        )}

        {/* Upcoming */}
        {pendingBattles.length > 0 && (
          <motion.section
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.5 }}
          >
            <div className="flex items-center gap-3 mb-6">
              <TrendingUp className="w-5 h-5 text-primary" />
              <h2 className="font-display text-lg md:text-xl font-bold tracking-wider text-primary flex items-center gap-2">
                UPCOMING BATTLES
              </h2>
              <div className="flex-1 h-px bg-gradient-to-r from-primary/50 to-transparent" />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 md:gap-6">
              {pendingBattles.map((battle, i) => (
                <motion.div
                  key={battle.id}
                  initial={{ opacity: 0, y: 20, scale: 0.95 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  transition={{ delay: i * 0.1 + 0.6, type: "spring", stiffness: 100 }}
                  whileHover={{ y: -4 }}
                >
                  <BattleCard battle={battle} onClick={() => setStakingBattle(battle)} />
                </motion.div>
              ))}
            </div>
          </motion.section>
        )}

        {/* Concluded */}
        {concludedBattles.length > 0 && (
          <motion.section
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.7 }}
          >
            <div className="flex items-center gap-3 mb-6">
              <div className="w-2 h-2 rounded-full bg-muted-foreground" />
              <h2 className="font-display text-lg md:text-xl font-bold tracking-wider text-muted-foreground">
                CONCLUDED BATTLES
              </h2>
              <div className="flex-1 h-px bg-gradient-to-r from-muted-foreground/30 to-transparent" />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 md:gap-6">
              {concludedBattles.map((battle, i) => (
                <motion.div
                  key={battle.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.05 + 0.8 }}
                  whileHover={{ y: -2 }}
                >
                  <BattleCard
                    battle={battle}
                    onClick={() => navigate(`/arena/battle/${battle.id}/result`)}
                  />
                </motion.div>
              ))}
            </div>
          </motion.section>
        )}

        {/* Empty state */}
        {liveBattles.length === 0 && pendingBattles.length === 0 && concludedBattles.length === 0 && (
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="flex flex-col items-center justify-center py-20 px-4"
          >
            <div className="glass rounded-2xl p-12 border border-border text-center max-w-md">
              <Swords className="w-16 h-16 mx-auto mb-4 text-muted-foreground opacity-50" />
              <h3 className="font-display text-xl font-bold text-foreground mb-2">No Battles Yet</h3>
              <p className="text-sm text-muted-foreground">The arena is quiet. Check back soon for epic AI agent battles!</p>
            </div>
          </motion.div>
        )}
      </main>

      {/* Modals */}
      <AnimatePresence>
        {selectedAgent && <AgentProfile agent={selectedAgent} onClose={() => setSelectedAgent(null)} />}
      </AnimatePresence>
      <AnimatePresence>
        {stakingBattle && <StakingPanel battle={stakingBattle} onClose={() => setStakingBattle(null)} />}
      </AnimatePresence>
    </div>
  );
};

export default Index;
