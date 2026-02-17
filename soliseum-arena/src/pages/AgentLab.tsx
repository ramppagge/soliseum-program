import { useState, useMemo, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Cpu, Zap, BarChart3, Coins, Trophy, Timer, Users, Plus } from "lucide-react";
import type { Agent } from "@/data/mockData";
import { AgentProfile } from "@/components/AgentProfile";
import { AgentGladiatorCard } from "@/components/AgentGladiatorCard";
import { RegisterAgentModal } from "@/components/RegisterAgentModal";
import { GatekeeperOverlay } from "@/components/GatekeeperOverlay";
import { useWallet, useConnection } from "@solana/wallet-adapter-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { enterMatchmaking, fetchMatchmakingStatus, fetchUserAgents, registerAgent as apiRegisterAgent } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Keypair } from "@solana/web3.js";

// Convert backend agent to frontend Agent type
function backendAgentToAgent(backendAgent: any): Agent {
  return {
    id: backendAgent.pubkey,
    name: backendAgent.name,
    avatar: backendAgent.name.slice(0, 2).toUpperCase(),
    tier: backendAgent.credibilityScore >= 80 ? "diamond" : 
          backendAgent.credibilityScore >= 60 ? "platinum" : 
          backendAgent.credibilityScore >= 40 ? "gold" : "silver",
    wins: backendAgent.totalWins || 0,
    losses: (backendAgent.totalBattles || 0) - (backendAgent.totalWins || 0),
    winRate: backendAgent.totalBattles > 0 
      ? Math.round((backendAgent.totalWins / backendAgent.totalBattles) * 100) 
      : 0,
    stats: { logic: 50, speed: 50, risk: 50, consistency: 50, adaptability: 50 },
    recentPerformance: [],
    last7DaysPerformance: [0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5],
    totalEarnings: 0,
    status: backendAgent.agentStatus === "active" ? "IDLE" : "INACTIVE",
    category: backendAgent.category === "Trading" ? "Trading Blitz" : 
              backendAgent.category === "Chess" ? "Quick Chess" : 
              backendAgent.category === "Coding" ? "Code Wars" : "Trading Blitz",
    description: backendAgent.description,
    endpointUrl: backendAgent.apiUrl,
  };
}

// Match found modal
function MatchFoundModal({
  battle,
  onClose,
}: {
  battle: { battle_id: string; agent_a_name: string; agent_b_name: string; seconds_until_battle: number };
  onClose: () => void;
}) {
  const [timeLeft, setTimeLeft] = useState(battle.seconds_until_battle);

  useEffect(() => {
    const interval = setInterval(() => {
      setTimeLeft((t) => Math.max(0, t - 1));
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  const formatTime = (s: number) => {
    const mins = Math.floor(s / 60);
    const secs = s % 60;
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.95, opacity: 0 }}
        onClick={(e) => e.stopPropagation()}
        className="glass rounded-2xl p-6 max-w-md w-full border border-secondary/30"
      >
        <div className="text-center mb-6">
          <Trophy className="w-12 h-12 mx-auto text-tier-gold mb-3" />
          <h2 className="font-display text-xl font-bold text-foreground">Match Found!</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Your opponent has been selected
          </p>
        </div>

        <div className="flex items-center justify-center gap-4 mb-6">
          <div className="text-center">
            <div className="w-16 h-16 rounded-xl bg-primary/10 border border-primary/30 flex items-center justify-center font-display font-bold text-primary mb-2">
              {battle.agent_a_name.slice(0, 2).toUpperCase()}
            </div>
            <p className="text-xs font-medium truncate max-w-[100px]">{battle.agent_a_name}</p>
          </div>

          <div className="text-center">
            <p className="font-display text-2xl font-bold text-muted-foreground">VS</p>
          </div>

          <div className="text-center">
            <div className="w-16 h-16 rounded-xl bg-secondary/10 border border-secondary/30 flex items-center justify-center font-display font-bold text-secondary mb-2">
              {battle.agent_b_name.slice(0, 2).toUpperCase()}
            </div>
            <p className="text-xs font-medium truncate max-w-[100px]">{battle.agent_b_name}</p>
          </div>
        </div>

        <Card className="glass border-secondary/20 mb-6">
          <CardContent className="p-4 flex items-center justify-center gap-2">
            <Timer className="w-5 h-5 text-secondary" />
            <span className="font-display text-2xl font-bold text-secondary">
              {formatTime(timeLeft)}
            </span>
            <span className="text-sm text-muted-foreground">until battle starts</span>
          </CardContent>
        </Card>

        <div className="space-y-2">
          <Button 
            className="w-full glow-purple" 
            onClick={() => window.open(`/arena/battle/${battle.battle_id}`, "_blank")}
          >
            <Users className="w-4 h-4 mr-2" />
            Watch & Stake
          </Button>
          <Button variant="ghost" className="w-full" onClick={onClose}>
            Continue to Lab
          </Button>
        </div>

        <p className="text-xs text-muted-foreground text-center mt-4">
          Place your stake before the countdown ends to support your agent!
        </p>
      </motion.div>
    </motion.div>
  );
}

export default function AgentLab() {
  const { connected, publicKey } = useWallet();
  const { token } = useAuth();
  const queryClient = useQueryClient();
  const [modalOpen, setModalOpen] = useState(false);
  const [selectedAgent, setSelectedAgent] = useState<Agent | null>(null);
  const [matchedBattle, setMatchedBattle] = useState<any>(null);

  // Fetch real agents from backend
  const { data: backendAgents, isLoading: agentsLoading } = useQuery({
    queryKey: ["user", "agents", publicKey?.toString()],
    queryFn: () => fetchUserAgents(publicKey!.toString()),
    enabled: !!publicKey && connected,
  });

  // Convert backend agents to frontend format
  const agents = useMemo(() => {
    if (!backendAgents || backendAgents.length === 0) return [];
    return backendAgents.map(backendAgentToAgent);
  }, [backendAgents]);

  const stats = useMemo(() => {
    const total = agents.length;
    const totalBattles = agents.reduce((s, a) => s + a.wins + a.losses, 0);
    const totalWins = agents.reduce((s, a) => s + a.wins, 0);
    const globalWinRate = totalBattles > 0 ? (totalWins / totalBattles) * 100 : 0;
    const totalSOL = agents.reduce((s, a) => s + a.totalEarnings, 0);
    return { totalAgents: total, globalWinRate, totalSOL };
  }, [agents]);

  const enterArenaMutation = useMutation({
    mutationFn: async ({ agent, category }: { agent: Agent; category: Agent["category"] }) => {
      if (!token) throw new Error("Not authenticated");
      const result = await enterMatchmaking(agent.id, category, token);
      return { result, agent };
    },
    onSuccess: ({ result, agent }) => {
      if (result.success) {
        toast.success(result.message);
        
        if (result.battle) {
          setMatchedBattle({
            battle_id: result.battle.battle_id,
            agent_a_name: result.battle.agent_a_name,
            agent_b_name: result.battle.agent_b_name,
            seconds_until_battle: result.battle.seconds_until_battle,
          });
        }
        
        pollForMatch(agent.id);
      } else {
        toast.error(result.message);
      }
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Failed to enter arena");
    },
  });

  const pollForMatch = async (agentPubkey: string) => {
    const checkStatus = async () => {
      const status = await fetchMatchmakingStatus(agentPubkey);
      
      if (status.battle && status.battle.status === "staking") {
        setMatchedBattle({
          battle_id: status.battle.battle_id,
          agent_a_name: status.agent?.name || "Agent A",
          agent_b_name: "Opponent",
          seconds_until_battle: status.battle.seconds_until_battle,
        });
        return true;
      }
      
      return false;
    };

    // Poll every 5 seconds for up to 5 minutes (reduced from frequent polling to reduce DB load)
    let attempts = 0;
    const maxAttempts = 60;
    
    const interval = setInterval(async () => {
      attempts++;
      const found = await checkStatus();
      
      if (found || attempts >= maxAttempts) {
        clearInterval(interval);
      }
    }, 3000);
  };

  const registerMutation = useMutation({
    mutationFn: async (payload: {
      name: string;
      description: string;
      category: "Trading" | "Chess" | "Coding";
      apiUrl: string;
    }) => {
      if (!token) throw new Error("Not authenticated");
      
      // Generate a new keypair for the agent
      const agentKeypair = Keypair.generate();
      const pubkey = agentKeypair.publicKey.toBase58();
      
      return apiRegisterAgent({
        pubkey,
        name: payload.name,
        description: payload.description,
        category: payload.category,
        apiUrl: payload.apiUrl?.trim() || undefined,  // Send undefined if empty
        // Don't send metadataUrl at all - let backend use default
      }, token);
    },
    onSuccess: () => {
      toast.success("Agent registered successfully!");
      queryClient.invalidateQueries({ queryKey: ["user", "agents"] });
      setModalOpen(false);
    },
    onError: (error: any) => {
      console.error("[RegisterAgent] Error:", error);
      const message = error?.message || "Failed to register agent";
      toast.error(message);
    },
  });

  const handleViewLogs = (agent: Agent) => {
    toast.info(`Logs for ${agent.name} (coming soon)`);
  };

  const handleEnterArena = (agent: Agent) => {
    if (!connected) {
      toast.error("Connect wallet to enter arena");
      return;
    }
    if (!token) {
      toast.error("Sign in to enter arena");
      return;
    }

    const category = agent.category === "Trading Blitz" ? "Trading" : 
                     agent.category === "Quick Chess" ? "Chess" : "Coding";
    
    enterArenaMutation.mutate({ agent, category });
  };

  const handleEditConfig = (agent: Agent) => {
    setSelectedAgent(agent);
  };

  const handleRegister = (payload: {
    name: string;
    description: string;
    category: "Trading" | "Chess" | "Coding";
    apiUrl: string;
  }) => {
    registerMutation.mutate(payload);
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

        {/* Empty state */}
        {agents.length === 0 && !agentsLoading && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex flex-col items-center justify-center py-20"
          >
            <div className="glass rounded-2xl p-8 text-center border border-border">
              <Cpu className="w-16 h-16 mx-auto mb-4 text-muted-foreground opacity-50" />
              <h3 className="font-display text-xl font-bold text-foreground mb-2">No Agents Found</h3>
              <p className="text-sm text-muted-foreground mb-4 max-w-md">
                You don't have any registered agents yet. Create your first AI agent to enter the arena!
              </p>
              <Button onClick={() => setModalOpen(true)} className="glow-purple">
                <Plus className="w-4 h-4 mr-2" />
                Register Your First Agent
              </Button>
            </div>
          </motion.div>
        )}

        {/* Loading state */}
        {agentsLoading && (
          <div className="flex items-center justify-center py-20">
            <div className="animate-spin w-8 h-8 border-2 border-primary border-t-transparent rounded-full" />
          </div>
        )}

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
              isEntering={enterArenaMutation.isPending && enterArenaMutation.variables?.agent.id === agent.id}
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
        {matchedBattle && (
          <MatchFoundModal
            battle={matchedBattle}
            onClose={() => setMatchedBattle(null)}
          />
        )}
      </AnimatePresence>
    </div>
    </GatekeeperOverlay>
  );
}
