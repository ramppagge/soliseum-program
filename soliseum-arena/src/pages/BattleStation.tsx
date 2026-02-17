import { useEffect, useState, useCallback, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQueryClient, useQuery } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { battles, type Battle } from "@/data/mockData";
import { useActiveArenas, useActiveBattles } from "@/hooks/useApi";
import { arenaToBattle } from "@/lib/api";
import { useBattleSocket } from "@/hooks/useBattleSocket";
import { useAuth } from "@/contexts/AuthContext";
import { fetchBattleStart, fetchResetArena, fetchArenaByAddress, fetchSyncArena, type ArenaActive, type ActiveBattle } from "@/lib/api";
import { DigitalSmoke } from "@/components/DigitalSmoke";
import { BattleVisualizer } from "@/components/BattleVisualizer";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from "@/components/ui/tooltip";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useWallet, useConnection } from "@solana/wallet-adapter-react";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";
import { Zap, TrendingUp, ArrowLeft, Swords, HelpCircle, RotateCcw, Clock, Flame, Users, Timer, Wallet } from "lucide-react";
import { toast } from "sonner";
import { buildPlaceStakeInstruction, solToLamports } from "@/lib/solanaProgram";
import { API_URL } from "@/config/soliseum";

type LogEntry = { id: number; time: string; agent: string; message: string; isAdvantage?: boolean };

const MOCK_LOG_TEMPLATES: { message: string; isAdvantage?: boolean }[] = [
  { message: "Analyzing SOL/USDC volatility..." },
  { message: "Hedge strategy deployed. Target: 145.20." },
  { message: "Momentum signal detected. Long entry." },
  { message: "Counter-trade executed. Position neutralized.", isAdvantage: true },
  { message: "Risk-parity rebalance in progress..." },
  { message: "Alpha-beta pruning active. Confidence +12%.", isAdvantage: true },
];

function formatTime(now: Date) {
  return now.toTimeString().slice(0, 8);
}

function formatCountdown(seconds: number) {
  const mins = Math.floor(Math.max(0, seconds) / 60);
  const secs = Math.max(0, seconds) % 60;
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

function isArenaAddress(id: string): boolean {
  return /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(id);
}

function isScheduledBattleId(id: string): boolean {
  return id.startsWith("sb_") || id.length > 44;
}

// Countdown Timer Component
function CountdownTimer({ seconds, label = "Battle starts in" }: { seconds: number; label?: string }) {
  const [timeLeft, setTimeLeft] = useState(seconds);

  useEffect(() => {
    setTimeLeft(seconds);
    const interval = setInterval(() => {
      setTimeLeft((t) => Math.max(0, t - 1));
    }, 1000);
    return () => clearInterval(interval);
  }, [seconds]);

  return (
    <div className="flex items-center gap-2 text-secondary">
      <Timer className="w-4 h-4 animate-pulse" />
      <span className="font-display text-sm font-bold">
        {label}: {formatCountdown(timeLeft)}
      </span>
    </div>
  );
}

// Staking Panel Component (for both scheduled and live battles)
function StakingPanel({
  battle,
  scheduledBattle,
  onStakePlaced,
}: {
  battle: Battle;
  scheduledBattle?: ActiveBattle;
  onStakePlaced?: () => void;
}) {
  const { connected, publicKey, sendTransaction } = useWallet();
  const { setVisible: setWalletModalVisible } = useWalletModal();
  const { connection } = useConnection();
  const { token } = useAuth();
  const queryClient = useQueryClient();

  const [solAmount, setSolAmount] = useState("");
  const [selectedAgent, setSelectedAgent] = useState<"A" | "B">("A");
  const [stakeLoading, setStakeLoading] = useState(false);

  const isScheduled = !!scheduledBattle;
  // Use API status as source of truth for staking lock
  // Staking is only open when status is 'staking' AND countdown hasn't expired
  const isStakingOpen = isScheduled 
    ? scheduledBattle.status === "staking" && scheduledBattle.seconds_until_battle > 0
    : true;

  const probA = battle.winProbA ?? 50;
  const probB = battle.winProbB ?? 50;
  const sol = parseFloat(solAmount) || 0;
  const prob = selectedAgent === "A" ? probA : probB;
  const potentialReturn = prob > 0 ? (sol * 100) / prob : 0;

  const quickBet = useCallback((value: number | "MAX") => {
    if (value === "MAX") setSolAmount("100");
    else setSolAmount(String(value));
  }, []);

  const handlePlaceStake = useCallback(async () => {
    if (!publicKey) {
      setWalletModalVisible(true);
      return;
    }

    const amount = parseFloat(solAmount) || 0;
    if (amount <= 0) {
      toast.error("Enter a valid stake amount");
      return;
    }

    // For scheduled battles with on-chain arena, do on-chain stake first
    if (isScheduled && scheduledBattle?.arena_address) {
      setStakeLoading(true);
      const toastId = toast.loading("Confirming on-chain transaction...");

      try {
        const { Transaction, PublicKey } = await import("@solana/web3.js");
        const ix = await buildPlaceStakeInstruction(
          connection,
          new PublicKey(scheduledBattle.arena_address),
          publicKey,
          solToLamports(amount),
          selectedAgent === "A" ? 0 : 1
        );
        const tx = new Transaction().add(ix);
        const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash("confirmed");
        tx.recentBlockhash = blockhash;
        tx.feePayer = publicKey;

        const sig = await sendTransaction(tx, connection, { maxRetries: 5, skipPreflight: true });
        await connection.confirmTransaction({ signature: sig, blockhash, lastValidBlockHeight }, "confirmed");

        // Send tx signature to backend to record the stake
        const res = await fetch(`${API_URL}/api/matchmaking/stake`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            battleId: scheduledBattle.id,
            agentPubkey: selectedAgent === "A" ? scheduledBattle.agent_a_pubkey : scheduledBattle.agent_b_pubkey,
            amount: solToLamports(amount).toString(),
            txSignature: sig,
          }),
        });

        const data = await res.json();
        if (!data.ok) throw new Error(data.error || "Failed to record stake");

        toast.success(`Staked ${amount} SOL on ${selectedAgent === "A" ? battle.agentA.name : battle.agentB.name}!`, {
          id: toastId,
          action: { label: "View", onClick: () => window.open(`https://solscan.io/tx/${sig}`, "_blank") },
        });
        setSolAmount("");
        onStakePlaced?.();
        queryClient.invalidateQueries({ queryKey: ["matchmaking", "battles"] });
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Transaction failed", { id: toastId });
      } finally {
        setStakeLoading(false);
      }
      return;
    }

    // For scheduled battles without on-chain arena (fallback), use API-only stake
    if (isScheduled && scheduledBattle) {
      setStakeLoading(true);
      try {
        const res = await fetch(`${API_URL}/api/matchmaking/stake`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            battleId: scheduledBattle.id,
            agentPubkey: selectedAgent === "A" ? scheduledBattle.agent_a_pubkey : scheduledBattle.agent_b_pubkey,
            amount: solToLamports(amount).toString(),
          }),
        });

        const data = await res.json();
        if (!data.ok) throw new Error(data.error || "Stake failed");

        toast.success(`Staked ${amount} SOL on ${selectedAgent === "A" ? battle.agentA.name : battle.agentB.name}!`);
        setSolAmount("");
        onStakePlaced?.();
        queryClient.invalidateQueries({ queryKey: ["matchmaking", "battles"] });
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Stake failed");
      } finally {
        setStakeLoading(false);
      }
      return;
    }

    // For live battles, use on-chain stake
    if (!battle.id || !isArenaAddress(battle.id)) {
      toast.error("Invalid battle for staking");
      return;
    }

    setStakeLoading(true);
    const toastId = toast.loading("Confirming transaction...");

    try {
      const { Transaction, PublicKey } = await import("@solana/web3.js");
      const ix = await buildPlaceStakeInstruction(
        connection,
        new PublicKey(battle.id),
        publicKey,
        solToLamports(amount),
        selectedAgent === "A" ? 0 : 1
      );
      const tx = new Transaction().add(ix);
      const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash("confirmed");
      tx.recentBlockhash = blockhash;
      tx.feePayer = publicKey;

      const sig = await sendTransaction(tx, connection, { maxRetries: 5, skipPreflight: true });
      await connection.confirmTransaction({ signature: sig, blockhash, lastValidBlockHeight }, "confirmed");

      toast.success("Stake placed!", {
        id: toastId,
        action: { label: "View", onClick: () => window.open(`https://solscan.io/tx/${sig}`, "_blank") },
      });
      setSolAmount("");
      onStakePlaced?.();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Transaction failed", { id: toastId });
    } finally {
      setStakeLoading(false);
    }
  }, [solAmount, selectedAgent, isScheduled, scheduledBattle, battle, publicKey, token, connection, sendTransaction]);

  if (!isStakingOpen) {
    return (
      <div className="p-4 text-center">
        <Flame className="w-12 h-12 mx-auto mb-3 text-orange-400" />
        <p className="font-display text-sm font-bold text-foreground">Staking Closed</p>
        <p className="text-xs text-muted-foreground mt-1">Battle has started. No more stakes allowed.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Countdown for scheduled battles */}
      {isScheduled && scheduledBattle && (
        <div className="p-3 rounded-lg bg-secondary/10 border border-secondary/30">
          <CountdownTimer seconds={scheduledBattle.seconds_until_battle} />
          <p className="text-xs text-muted-foreground mt-1">
            Place your stake before the countdown ends!
          </p>
        </div>
      )}

      {/* Amount Input */}
      <div>
        <label className="text-xs text-muted-foreground block mb-1">Amount (SOL)</label>
        <Input
          type="number"
          placeholder="0.00"
          value={solAmount}
          onChange={(e) => setSolAmount(e.target.value)}
          className="font-mono bg-muted/50 border-border"
          min={0}
          step={0.1}
        />
      </div>

      {/* Quick Bet Buttons */}
      <div className="flex flex-wrap gap-2">
        {[0.5, 1, 5, "MAX"].map((v) => (
          <Button key={String(v)} variant="outline" size="sm" className="font-display text-xs" onClick={() => quickBet(v as number | "MAX")}>
            {v === "MAX" ? "MAX" : v}
          </Button>
        ))}
      </div>

      {/* Agent Selection */}
      <div className="grid grid-cols-2 gap-2">
        <button
          onClick={() => setSelectedAgent("A")}
          className={`p-3 rounded-lg border text-left transition-all ${
            selectedAgent === "A"
              ? "border-primary bg-primary/10 text-primary"
              : "border-border hover:border-muted-foreground"
          }`}
        >
          <p className="font-display text-sm font-bold truncate">{battle.agentA.name}</p>
          <p className="text-xs text-muted-foreground">{probA}% win chance</p>
          {isScheduled && scheduledBattle && (
            <p className="text-xs text-accent mt-1">
              {(Number(scheduledBattle.total_stake_a) / 1e9).toFixed(2)} SOL staked
            </p>
          )}
        </button>
        <button
          onClick={() => setSelectedAgent("B")}
          className={`p-3 rounded-lg border text-left transition-all ${
            selectedAgent === "B"
              ? "border-secondary bg-secondary/10 text-secondary"
              : "border-border hover:border-muted-foreground"
          }`}
        >
          <p className="font-display text-sm font-bold truncate">{battle.agentB.name}</p>
          <p className="text-xs text-muted-foreground">{probB}% win chance</p>
          {isScheduled && scheduledBattle && (
            <p className="text-xs text-accent mt-1">
              {(Number(scheduledBattle.total_stake_b) / 1e9).toFixed(2)} SOL staked
            </p>
          )}
        </button>
      </div>

      {/* Potential Return */}
      <div className="flex justify-between items-center pt-2">
        <span className="text-xs text-muted-foreground">Potential Return</span>
        <span className="font-display text-sm font-bold text-secondary flex items-center gap-1">
          <TrendingUp className="w-3.5 h-3.5" />
          {potentialReturn.toFixed(2)} SOL
        </span>
      </div>

      {/* Stake Button */}
      <Button
        className="w-full font-display text-sm glow-teal bg-secondary text-secondary-foreground hover:bg-secondary/90"
        onClick={handlePlaceStake}
        disabled={stakeLoading || !connected}
      >
        {stakeLoading ? (
          <span className="animate-pulse">Placing stake...</span>
        ) : !connected ? (
          <>
            <Wallet className="w-4 h-4 mr-2" />
            Connect Wallet
          </>
        ) : (
          <>
            <Zap className="w-4 h-4 mr-2" />
            PLACE STAKE
          </>
        )}
      </Button>

      {/* Total Pool Info */}
      {isScheduled && scheduledBattle && (
        <div className="pt-3 border-t border-border/50">
          <div className="flex justify-between text-xs">
            <span className="text-muted-foreground">Total Prize Pool</span>
            <span className="font-display font-bold text-accent">
              {((Number(scheduledBattle.total_stake_a) + Number(scheduledBattle.total_stake_b)) / 1e9).toFixed(2)} SOL
            </span>
          </div>
          <div className="flex justify-between text-xs mt-1">
            <span className="text-muted-foreground">Backers</span>
            <span className="font-display font-bold">
              {scheduledBattle.stake_count_a + scheduledBattle.stake_count_b}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

export default function BattleStation() {
  const { battleId } = useParams<{ battleId: string }>();
  const navigate = useNavigate();
  const { data: apiArenas } = useActiveArenas();
  const { data: activeBattles } = useActiveBattles();
  const apiBattles = useMemo(() => (apiArenas ?? []).map(arenaToBattle), [apiArenas]);
  const mockBattle = battles.find((b) => b.id === battleId);
  const apiBattle = apiBattles.find((b) => b.id === battleId);
  
  // Find scheduled battle if applicable
  const scheduledBattle = useMemo(() => {
    return activeBattles?.battles.find((b) => b.battle_id === battleId);
  }, [activeBattles, battleId]);

  // Determine battle status from API (source of truth)
  const apiBattleStatus = useMemo(() => {
    if (!scheduledBattle) return null;
    if (scheduledBattle.status === "battling") return "live";
    if (scheduledBattle.status === "staking") return "pending";
    if (scheduledBattle.status === "completed") return "completed";
    return "pending";
  }, [scheduledBattle]);

  // Convert scheduled battle to Battle format
  const scheduledAsBattle: Battle | undefined = useMemo(() => {
    if (!scheduledBattle) return undefined;
    return {
      id: scheduledBattle.battle_id,
      gameType: scheduledBattle.game_mode.replace("_", " "),
      status: apiBattleStatus === "live" ? "live" : apiBattleStatus === "completed" ? "completed" : "pending",
      agentA: {
        id: scheduledBattle.agent_a_pubkey,
        name: scheduledBattle.agent_a_name,
        avatar: scheduledBattle.agent_a_name.slice(0, 2).toUpperCase(),
        tier: "gold",
        wins: 0,
        losses: 0,
        winRate: 50,
        stats: { logic: 50, speed: 50, risk: 50, consistency: 50, adaptability: 50 },
        recentPerformance: [],
        totalEarnings: 0,
      },
      agentB: {
        id: scheduledBattle.agent_b_pubkey,
        name: scheduledBattle.agent_b_name,
        avatar: scheduledBattle.agent_b_name.slice(0, 2).toUpperCase(),
        tier: "gold",
        wins: 0,
        losses: 0,
        winRate: 50,
        stats: { logic: 50, speed: 50, risk: 50, consistency: 50, adaptability: 50 },
        recentPerformance: [],
        totalEarnings: 0,
      },
      winProbA: 50,
      winProbB: 50,
      prizePool: (Number(scheduledBattle.total_stake_a) + Number(scheduledBattle.total_stake_b)) / 1e9,
      spectators: scheduledBattle.stake_count_a + scheduledBattle.stake_count_b,
      startTime: scheduledBattle.status === "battling" ? "Live now" : "Starting soon",
    };
  }, [scheduledBattle, apiBattleStatus]);

  const battle: Battle | undefined = scheduledAsBattle || apiBattle || mockBattle;

  const { token } = useAuth();
  const { connected } = useWallet();
  const socketState = useBattleSocket(battleId ?? undefined, token);

  const [mockLogs, setMockLogs] = useState<LogEntry[]>([]);
  const [countdownLogs, setCountdownLogs] = useState<LogEntry[]>([]);
  const [scoreA, setScoreA] = useState(50);
  const [scoreB, setScoreB] = useState(50);
  const [battleEnd, setBattleEnd] = useState<"A" | "B" | null>(null);
  const [impactSide, setImpactSide] = useState<"left" | "right" | null>(null);
  const [stakingSheetOpen, setStakingSheetOpen] = useState(false);

  const isScheduled = !!scheduledBattle;
  // Use API status as source of truth, socketState for real-time updates during battle
  const isLive = apiBattleStatus === "live" || socketState.isLive;
  const isPending = apiBattleStatus === "pending";
  const isCompleted = apiBattleStatus === "completed" || socketState.winner !== null;
  // Staking is open only when status is 'staking' and countdown hasn't expired
  // IMPORTANT: Use API data as source of truth, not local countdown
  const isStaking = isScheduled && scheduledBattle?.status === "staking" && scheduledBattle?.seconds_until_battle > 0;
  // Battle has started (staking closed) when status is 'battling' or 'completed'
  const hasBattleStarted = isScheduled && (scheduledBattle?.status === "battling" || scheduledBattle?.status === "completed");

  // Auto-refresh scheduled battle data
  const queryClient = useQueryClient();
  useEffect(() => {
    if (!isScheduled) return;
    const interval = setInterval(() => {
      queryClient.invalidateQueries({ queryKey: ["matchmaking", "battles"] });
    }, 3000);
    return () => clearInterval(interval);
  }, [isScheduled, queryClient]);

  // Redirect if battle not found
  useEffect(() => {
    if (!battleId) return;
    if (!battle) {
      navigate("/arena", { replace: true });
    }
  }, [battle, battleId, navigate]);

  // Generate countdown logs for staking phase
  useEffect(() => {
    if (!isStaking || !battle) return;
    
    let logId = 0;
    const initialLogs: LogEntry[] = [
      { id: ++logId, time: formatTime(new Date()), agent: "SYSTEM", message: "Staking window opened. Place your bets!" },
      { id: ++logId, time: formatTime(new Date()), agent: "SYSTEM", message: `Match: ${battle.agentA.name} vs ${battle.agentB.name}` },
      { id: ++logId, time: formatTime(new Date()), agent: "SYSTEM", message: `Category: ${battle.gameType}` },
    ];
    setCountdownLogs(initialLogs);

    const interval = setInterval(() => {
      const remaining = scheduledBattle?.seconds_until_battle ?? 0;
      const time = formatTime(new Date());
      
      if (remaining > 0 && remaining % 10 === 0) {
        // Log every 10 seconds
        setCountdownLogs((prev) => {
          const next = [...prev, { 
            id: ++logId, 
            time, 
            agent: "SYSTEM", 
            message: `Battle starts in ${Math.floor(remaining / 60)}:${(remaining % 60).toString().padStart(2, "0")}` 
          }];
          return next.slice(-50);
        });
      }
      
      if (remaining === 0) {
        setCountdownLogs((prev) => {
          const next = [...prev, { id: ++logId, time, agent: "SYSTEM", message: "Staking closed. Battle starting..." }];
          return next.slice(-50);
        });
        clearInterval(interval);
      }
    }, 1000);
    
    return () => clearInterval(interval);
  }, [isStaking, battle, scheduledBattle?.seconds_until_battle]);

  // Generate mock logs for visual effect (only for non-scheduled battles)
  useEffect(() => {
    if (!battle || battleEnd || isScheduled) return;
    let logId = 0;
    let tick = 0;
    const interval = setInterval(() => {
      const template = MOCK_LOG_TEMPLATES[Math.floor(Math.random() * MOCK_LOG_TEMPLATES.length)];
      const agent = tick % 2 === 0 ? battle.agentA.name : battle.agentB.name;
      const time = formatTime(new Date());
      setMockLogs((prev) => {
        const next = [...prev, { ...template, agent, id: ++logId, time }];
        return next.slice(-50);
      });
      tick++;
    }, 2200);
    return () => clearInterval(interval);
  }, [battle, battleEnd, isScheduled]);

  if (!battle) return null;

  const agentA = battle.agentA;
  const agentB = battle.agentB;
  
  // Determine which logs to show
  let logs: LogEntry[];
  if (isLive && socketState.logs.length > 0) {
    logs = socketState.logs;
  } else if (isStaking && countdownLogs.length > 0) {
    logs = countdownLogs;
  } else {
    logs = mockLogs;
  }

  return (
    <div className="relative min-h-screen grid-bg overflow-hidden">
      <DigitalSmoke />
      <div className="relative z-10 flex flex-col h-full">
        {/* Header */}
        <header className="border-b border-border glass shrink-0">
          <div className="px-4 py-3 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <button
                onClick={() => navigate("/arena")}
                className="p-2 rounded-lg border border-border hover:bg-muted/50 transition-colors"
              >
                <ArrowLeft className="w-4 h-4" />
              </button>
              <div>
                <h1 className="font-display text-lg md:text-xl font-bold text-foreground">
                  {battle.gameType}
                </h1>
                <p className="text-xs text-muted-foreground">
                  {isScheduled ? "Scheduled Battle — Stake Now!" : "Live AI Battle"}
                </p>
              </div>
              {/* Status Badge - uses API status as source of truth */}
              {isScheduled && scheduledBattle?.status === "staking" && (
                <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-primary/10 border border-primary/30 text-xs font-display font-bold text-primary">
                  <Clock className="w-3 h-3" />
                  STAKING OPEN
                </span>
              )}
              {isScheduled && scheduledBattle?.status === "battling" && (
                <span className="live-badge font-display text-xs font-bold px-2.5 py-1 rounded-md flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-white animate-pulse" />
                  LIVE
                </span>
              )}
              {isScheduled && scheduledBattle?.status === "completed" && (
                <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-muted border border-border text-xs font-display font-bold text-muted-foreground">
                  COMPLETED
                </span>
              )}
            </div>

            {/* Countdown Display */}
            {isScheduled && scheduledBattle && scheduledBattle.seconds_until_battle > 0 && (
              <CountdownTimer seconds={scheduledBattle.seconds_until_battle} />
            )}
          </div>
        </header>

        <div className="flex-1 flex flex-col md:flex-row min-h-0">
          {/* Battle Visualizer */}
          <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
            <BattleVisualizer
              agentA={{
                id: agentA.id,
                name: agentA.name,
                avatar: agentA.avatar,
                confidenceLevel: scoreA,
              }}
              agentB={{
                id: agentB.id,
                name: agentB.name,
                avatar: agentB.avatar,
                confidenceLevel: scoreB,
              }}
              dominanceScore={scoreB}
              logs={logs.map((l) => ({
                id: l.id,
                time: l.time,
                agent: l.agent,
                message: l.message,
                type: l.isAdvantage ? "success" : "info",
              }))}
              impactThreshold={15}
              result={
                battleEnd
                  ? {
                      winner: battleEnd,
                      victoryReason: `${battleEnd === "A" ? agentA.name : agentB.name} wins!`,
                      metrics: [],
                    }
                  : null
              }
            />
          </div>

          {/* Staking Sidebar (Desktop) */}
          <aside className="hidden md:flex w-[360px] shrink-0 border-l border-border glass flex-col">
            <div className="p-4 border-b border-border">
              <div className="flex items-center gap-2 mb-4">
                <h2 className="font-display text-sm font-bold tracking-wider">STAKING TERMINAL</h2>
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button className="text-muted-foreground hover:text-foreground">
                        <HelpCircle className="w-3.5 h-3.5" />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent side="left">
                      <p className="text-xs">Stake SOL on your predicted winner. Winners split the losing pool!</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>
              <StakingPanel battle={battle} scheduledBattle={scheduledBattle} />
            </div>

            {/* Recent Supporters */}
            <div className="flex-1 p-4">
              <h3 className="font-display text-xs font-bold text-muted-foreground mb-3">RECENT STAKES</h3>
              <ScrollArea className="h-[300px]">
                <div className="space-y-2">
                  {/* Mock supporters for now */}
                  {[1, 2, 3].map((i) => (
                    <div key={i} className="flex items-center justify-between p-2 rounded bg-muted/30 text-xs">
                      <span className="text-muted-foreground">User {i}</span>
                      <span className="font-display font-bold text-accent">{i * 0.5} SOL</span>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            </div>
          </aside>

          {/* Mobile Staking FAB */}
          <div className="md:hidden fixed bottom-6 right-6 z-40">
            <Sheet open={stakingSheetOpen} onOpenChange={setStakingSheetOpen}>
              <SheetTrigger asChild>
                <Button size="lg" className="rounded-full h-14 w-14 p-0 glow-teal bg-secondary">
                  <Zap className="w-6 h-6" />
                </Button>
              </SheetTrigger>
              <SheetContent side="bottom" className="h-[85dvh]">
                <SheetHeader>
                  <SheetTitle className="font-display">STAKING TERMINAL</SheetTitle>
                </SheetHeader>
                <div className="mt-4">
                  <StakingPanel battle={battle} scheduledBattle={scheduledBattle} />
                </div>
              </SheetContent>
            </Sheet>
          </div>
        </div>
      </div>
    </div>
  );
}
