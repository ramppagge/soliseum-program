import { useState, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Cpu, Zap, BarChart3, Coins } from "lucide-react";
import { agents as initialAgents } from "@/data/mockData";
import type { Agent } from "@/data/mockData";
import { AgentProfile } from "@/components/AgentProfile";
import { AgentGladiatorCard } from "@/components/AgentGladiatorCard";
import { RegisterAgentModal } from "@/components/RegisterAgentModal";
import { GatekeeperOverlay } from "@/components/GatekeeperOverlay";
import { useWallet } from "@solana/wallet-adapter-react";
import { toast } from "sonner";

export default function AgentLab() {
  const { connected } = useWallet();
  const [agents, setAgents] = useState<Agent[]>(initialAgents);
  const [modalOpen, setModalOpen] = useState(false);
  const [selectedAgent, setSelectedAgent] = useState<Agent | null>(null);

  const stats = useMemo(() => {
    const total = agents.length;
    const totalBattles = agents.reduce((s, a) => s + a.wins + a.losses, 0);
    const totalWins = agents.reduce((s, a) => s + a.wins, 0);
    const globalWinRate = totalBattles > 0 ? (totalWins / totalBattles) * 100 : 0;
    const totalSOL = agents.reduce((s, a) => s + a.totalEarnings, 0);
    return { totalAgents: total, globalWinRate, totalSOL };
  }, [agents]);

  const handleRegister = (payload: {
    name: string;
    description: string;
    category: Agent["category"];
    endpointUrl: string;
  }) => {
    const id = `a${Date.now()}`;
    const avatar = payload.name
      .split(/[\s-]+/)
      .map((w) => w[0])
      .join("")
      .toUpperCase()
      .slice(0, 2) || "??";
    const newAgent: Agent = {
      id,
      name: payload.name,
      avatar,
      tier: "silver",
      wins: 0,
      losses: 0,
      winRate: 0,
      stats: { logic: 50, speed: 50, risk: 50, consistency: 50, adaptability: 50 },
      recentPerformance: [],
      last7DaysPerformance: [0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5],
      totalEarnings: 0,
      status: "IDLE",
      category: payload.category ?? "Trading Blitz",
      description: payload.description,
      endpointUrl: payload.endpointUrl || undefined,
    };
    setAgents((prev) => [newAgent, ...prev]);
    toast.success(`Agent "${payload.name}" registered. Deploy to the Arena when ready.`);
  };

  const handleViewLogs = (agent: Agent) => {
    toast.info(`Logs for ${agent.name} (coming soon)`);
  };

  const handleEnterArena = (agent: Agent) => {
    toast.success(`Redirecting ${agent.name} to Arena...`);
    // In a real app: navigate to /arena with agent pre-selected
  };

  const handleEditConfig = (agent: Agent) => {
    setSelectedAgent(agent);
  };

  return (
    <GatekeeperOverlay isProtected isConnected={connected}>
    <div className="min-h-screen grid-bg overflow-x-hidden" style={{ backgroundColor: "#050505" }}>
      <header className="border-b border-border glass px-3 sm:px-4 md:px-6 py-4 sm:py-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
          <div className="min-w-0">
            <h1 className="font-display text-lg sm:text-xl md:text-2xl font-bold text-foreground text-glow-purple flex items-center gap-2 truncate">
              <Cpu className="w-5 h-5 sm:w-6 sm:h-6 text-primary shrink-0" />
              <span className="truncate">ARCHITECT LAB</span>
            </h1>
            <p className="text-xs sm:text-sm text-muted-foreground mt-1 truncate">
              Manage and deploy your neural combatants.
            </p>
          </div>
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => setModalOpen(true)}
            className="w-full sm:w-auto min-h-[44px] flex items-center justify-center gap-2 px-4 sm:px-5 py-3 rounded-xl bg-primary font-display text-xs sm:text-sm font-bold text-primary-foreground glow-purple glitch-hover transition-all shrink-0"
          >
            <Zap className="w-4 h-4 shrink-0" />
            Register New Agent
          </motion.button>
        </div>
      </header>

      <main className="p-3 sm:p-4 md:p-6 min-w-0">
        {/* Stats row */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="grid grid-cols-1 sm:grid-cols-3 gap-2 sm:gap-3 md:gap-4 mb-4 sm:mb-6"
        >
          <div className="glass rounded-xl p-3 sm:p-4 md:p-5 neon-border-purple flex items-center sm:items-start gap-3 min-w-0">
            <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-lg bg-primary/10 border border-primary/30 flex items-center justify-center shrink-0">
              <Cpu className="w-4 h-4 sm:w-5 sm:h-5 text-primary" />
            </div>
            <div className="min-w-0">
              <p className="text-[10px] font-display text-muted-foreground tracking-wider mb-0.5">
                TOTAL AGENTS
              </p>
              <p className="font-display text-xl sm:text-2xl md:text-3xl font-bold text-foreground tabular-nums">
                {stats.totalAgents}
              </p>
            </div>
          </div>
          <div className="glass rounded-xl p-3 sm:p-4 md:p-5 neon-border-teal flex items-center sm:items-start gap-3 min-w-0">
            <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-lg bg-secondary/10 border border-secondary/30 flex items-center justify-center shrink-0">
              <BarChart3 className="w-4 h-4 sm:w-5 sm:h-5 text-secondary" />
            </div>
            <div className="min-w-0">
              <p className="text-[10px] font-display text-muted-foreground tracking-wider mb-0.5">
                GLOBAL WIN RATE
              </p>
              <p className="font-display text-xl sm:text-2xl md:text-3xl font-bold text-secondary tabular-nums">
                {stats.globalWinRate.toFixed(1)}%
              </p>
            </div>
          </div>
          <div className="glass rounded-xl p-3 sm:p-4 md:p-5 neon-border-purple flex items-center sm:items-start gap-3 min-w-0">
            <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-lg bg-accent/10 border border-accent/30 flex items-center justify-center shrink-0">
              <Coins className="w-4 h-4 sm:w-5 sm:h-5 text-accent" />
            </div>
            <div className="min-w-0">
              <p className="text-[10px] font-display text-muted-foreground tracking-wider mb-0.5">
                TOTAL SOL EARNED
              </p>
              <p className="font-display text-xl sm:text-2xl md:text-3xl font-bold text-accent tabular-nums">
                {(stats.totalSOL / 1000).toFixed(1)}k
              </p>
            </div>
          </div>
        </motion.div>

        {/* Agent cards grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3 sm:gap-4 min-w-0">
          {agents.map((agent, i) => (
            <AgentGladiatorCard
              key={agent.id}
              agent={agent}
              index={i}
              onViewLogs={handleViewLogs}
              onEnterArena={handleEnterArena}
              onEditConfig={handleEditConfig}
              onSelect={setSelectedAgent}
            />
          ))}
        </div>
      </main>

      <RegisterAgentModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onSubmit={handleRegister}
      />

      <AnimatePresence>
        {selectedAgent && (
          <AgentProfile agent={selectedAgent} onClose={() => setSelectedAgent(null)} />
        )}
      </AnimatePresence>
    </div>
    </GatekeeperOverlay>
  );
}
