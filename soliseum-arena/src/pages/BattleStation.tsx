import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { battles, type Battle, type Agent } from "@/data/mockData";
import { useActiveArenas } from "@/hooks/useApi";
import { arenaToBattle } from "@/lib/api";
import { useBattleSocket } from "@/hooks/useBattleSocket";
import { useAuth } from "@/contexts/AuthContext";
import { fetchBattleStart, fetchResetArena, fetchArenaByAddress, fetchSyncArena, type ArenaActive } from "@/lib/api";
import { DigitalSmoke } from "@/components/DigitalSmoke";
import { BattleVisualizer } from "@/components/BattleVisualizer";
import { Input } from "@/components/ui/input";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  TooltipProvider,
} from "@/components/ui/tooltip";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useWallet, useConnection } from "@solana/wallet-adapter-react";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";
import { Zap, TrendingUp, ArrowLeft, Swords, HelpCircle, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import {
  buildPlaceStakeInstruction,
  solToLamports,
} from "@/lib/solanaProgram";

// Mock terminal log entry
type LogEntry = { id: number; time: string; agent: string; message: string; isAdvantage?: boolean };

const MOCK_LOG_TEMPLATES: { message: string; isAdvantage?: boolean }[] = [
  { message: "Analyzing SOL/USDC volatility..." },
  { message: "Hedge strategy deployed. Target: 145.20." },
  { message: "Momentum signal detected. Long entry." },
  { message: "Counter-trade executed. Position neutralized.", isAdvantage: true },
  { message: "Risk-parity rebalance in progress..." },
  { message: "Alpha-beta pruning active. Confidence +12%." },
  { message: "Scalp target hit. +0.34% gain.", isAdvantage: true },
  { message: "Volatility regime shift detected." },
  { message: "Mean-reversion trigger. Exit long." },
  { message: "Hedge strategy deployed. Target: 146.80." },
  { message: "Logic score updated. Lead +2.", isAdvantage: true },
  { message: "Adaptability module engaged." },
  { message: "Consistency check passed." },
  { message: "Speed advantage applied. Response -40ms.", isAdvantage: true },
  { message: "Next candle analysis queued." },
  { message: "Opening book fusion loaded." },
  { message: "Target 147.20. Stop 144.90." },
  { message: "Counter-strategy deployed. Neutralizing.", isAdvantage: true },
];

function formatTime(now: Date) {
  return now.toTimeString().slice(0, 8);
}

// Supporters list mock
const MOCK_SUPPORTERS = [
  { username: "alpha.sol", agent: "NEXUS-7", amount: 2 },
  { username: "cipher.sol", agent: "VORTEX", amount: 5 },
  { username: "nexus_fan.sol", agent: "NEXUS-7", amount: 0.5 },
  { username: "vortex_max.sol", agent: "VORTEX", amount: 1 },
  { username: "trader_joe.sol", agent: "NEXUS-7", amount: 10 },
  { username: "sol_whale.sol", agent: "VORTEX", amount: 25 },
];

function isArenaAddress(id: string): boolean {
  return /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(id);
}

export default function BattleStation() {
  const { battleId } = useParams<{ battleId: string }>();
  const navigate = useNavigate();
  const { data: apiArenas } = useActiveArenas();
  const [arenaByAddress, setArenaByAddress] = useState<ArenaActive | null | undefined>(undefined);
  const apiBattles = useMemo(() => (apiArenas ?? []).map(arenaToBattle), [apiArenas]);
  const mockBattle = battles.find((b) => b.id === battleId);
  const apiBattle = apiBattles.find((b) => b.id === battleId);
  const battleFromAddress = arenaByAddress != null ? arenaToBattle(arenaByAddress) : undefined;
  const battle: Battle | undefined = apiBattle ?? battleFromAddress ?? mockBattle;

  // Fetch arena by address when not in active list (e.g. settled arena)
  const needsArenaFetch = !!(battleId && isArenaAddress(battleId) && !apiBattle);
  useEffect(() => {
    if (!needsArenaFetch) return;
    fetchArenaByAddress(battleId!)
      .then((a) => setArenaByAddress(a ?? null));
  }, [battleId, needsArenaFetch]);

  const socketState = useBattleSocket(battleId ?? undefined);
  const queryClient = useQueryClient();
  const { token, login, isLoading: authLoading } = useAuth();
  const { connected, publicKey, sendTransaction } = useWallet();
  const { setVisible: setWalletModalVisible } = useWalletModal();

  const [mockLogs, setMockLogs] = useState<LogEntry[]>([]);
  const [scoreA, setScoreA] = useState(50);
  const [scoreB, setScoreB] = useState(50);
  const [countdown, setCountdown] = useState({ m: 2, s: 45 });
  const [battleEnd, setBattleEnd] = useState<"A" | "B" | null>(null);
  const [impactSide, setImpactSide] = useState<"left" | "right" | null>(null);
  const [solAmount, setSolAmount] = useState("");
  const [selectedAgent, setSelectedAgent] = useState<"A" | "B">("A");
  const [supporters] = useState(MOCK_SUPPORTERS);
  const [startBattleLoading, setStartBattleLoading] = useState(false);
  const [startBattleError, setStartBattleError] = useState<string | null>(null);
  const [resetLoading, setResetLoading] = useState(false);
  const [resetError, setResetError] = useState<string | null>(null);
  const [stakeLoading, setStakeLoading] = useState(false);
  const [stakingSheetOpen, setStakingSheetOpen] = useState(false);
  const { connection } = useConnection();

  const useRealTime = battleId && isArenaAddress(battleId);
  const logs = useRealTime && socketState.logs.length > 0 ? socketState.logs : mockLogs;

  // Sync socket winner to battleEnd
  useEffect(() => {
    if (socketState.winner !== null && battle) {
      setBattleEnd(socketState.winner === 0 ? "A" : "B");
    }
  }, [socketState.winner, battle]);

  // Sync settled arena winner to battleEnd
  useEffect(() => {
    if (arenaByAddress?.status === "Settled" && arenaByAddress.winnerSide !== undefined && arenaByAddress.winnerSide !== null) {
      setBattleEnd(arenaByAddress.winnerSide === 0 ? "A" : "B");
    }
  }, [arenaByAddress]);

  // Redirect if battle not found (allow settled arenas when useRealTime)
  useEffect(() => {
    if (!battleId) return;
    if (needsArenaFetch && arenaByAddress === undefined) return;
    if (!battle) {
      navigate("/arena", { replace: true });
      return;
    }
    if (battle.status !== "live" && battle.status !== "concluded" && !useRealTime) {
      navigate("/arena", { replace: true });
    }
  }, [battle, battleId, navigate, useRealTime, needsArenaFetch, arenaByAddress]);

  // Append mock log lines (only when NOT using real-time socket data)
  useEffect(() => {
    if (!battle || battleEnd || useRealTime) return;
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
      if (template.isAdvantage) {
        if (agent === battle.agentA.name) {
          setImpactSide("left");
          setScoreA((s) => Math.min(100, s + 2));
          setScoreB((s) => Math.max(0, s - 2));
        } else {
          setImpactSide("right");
          setScoreB((s) => Math.min(100, s + 2));
          setScoreA((s) => Math.max(0, s - 2));
        }
        setTimeout(() => setImpactSide(null), 400);
      }
      tick++;
    }, 2200);
    return () => clearInterval(interval);
  }, [battle, battleEnd, useRealTime]);

  // Update scores from socket logs (advantage = success type)
  useEffect(() => {
    if (!useRealTime || !battle) return;
    const lastLog = socketState.logs[socketState.logs.length - 1];
    if (lastLog?.isAdvantage) {
      if (lastLog.agent === battle.agentA.name) {
        setImpactSide("left");
        setScoreA((s) => Math.min(100, s + 2));
        setScoreB((s) => Math.max(0, s - 2));
      } else {
        setImpactSide("right");
        setScoreB((s) => Math.min(100, s + 2));
        setScoreA((s) => Math.max(0, s - 2));
      }
      setTimeout(() => setImpactSide(null), 400);
    }
  }, [socketState.logs, useRealTime, battle]);

  // Countdown (mock only)
  useEffect(() => {
    if (!battle || battleEnd || useRealTime) return;
    const t = setInterval(() => {
      setCountdown((c) => {
        let { m, s } = c;
        s--;
        if (s < 0) {
          s = 59;
          m--;
        }
        if (m < 0) {
          s = 0;
          return { m: 0, s: 0 };
        }
        return { m, s };
      });
    }, 1000);
    return () => clearInterval(t);
  }, [battle, battleEnd, useRealTime]);

  // When countdown hits 0 (mock only)
  useEffect(() => {
    if (!battle || battleEnd || useRealTime) return;
    if (countdown.m === 0 && countdown.s === 0) {
      setBattleEnd(scoreA >= scoreB ? "A" : "B");
    }
  }, [countdown.m, countdown.s, battle, battleEnd, scoreA, scoreB, useRealTime]);

  const handleStartBattle = useCallback(async () => {
    if (!battle || !battleId || !token) return;
    if (!isArenaAddress(battleId)) return;
    setStartBattleLoading(true);
    setStartBattleError(null);
    try {
      const res = await fetchBattleStart(
        {
          battleId: battleId,
          arenaAddress: battleId,
          agentA: { id: battle.agentA.id, name: battle.agentA.name, winRate: battle.agentA.winRate },
          agentB: { id: battle.agentB.id, name: battle.agentB.name, winRate: battle.agentB.winRate },
          gameMode: "TRADING_BLITZ",
        },
        token
      );
      if (!res.ok) {
        setStartBattleError(res.error ?? "Failed to start battle");
      }
    } catch (e) {
      setStartBattleError(e instanceof Error ? e.message : String(e));
    } finally {
      setStartBattleLoading(false);
    }
  }, [battle, battleId, token]);

  const handleResetArena = useCallback(async () => {
    if (!battleId || !isArenaAddress(battleId) || !token) return;
    setResetLoading(true);
    setResetError(null);
    setStartBattleError(null);
    try {
      await fetchResetArena(battleId, token);
      toast.success("Arena reset! Place your stake, then Start Battle.");
      setBattleEnd(null);
      setScoreA(50);
      setScoreB(50);
      // Refetch arena so status becomes Active/live (otherwise UI still shows concluded)
      queryClient.invalidateQueries({ queryKey: ["arena", "active"] });
      queryClient.invalidateQueries({ queryKey: ["arena", "settled"] });
      const updated = await fetchArenaByAddress(battleId);
      setArenaByAddress(updated ?? null);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setResetError(msg);
      toast.error(msg);
    } finally {
      setResetLoading(false);
    }
  }, [battleId, token, queryClient]);

  const quickBet = useCallback(
    (value: number | "MAX") => {
      if (value === "MAX") setSolAmount("100");
      else setSolAmount(String(value));
    },
    []
  );

  const handlePlaceStake = useCallback(async () => {
    if (!battleId || !battle) return;
    if (!useRealTime) {
      toast.info("Staking is only available for live arena battles");
      return;
    }
    if (battle.status === "concluded") {
      toast.error("This arena has ended. Reset it first to stake in a new battle.");
      return;
    }
    if (!connected || !publicKey) {
      setWalletModalVisible(true);
      return;
    }
    const amount = parseFloat(solAmount) || 0;
    if (amount <= 0) {
      toast.error("Enter a valid stake amount");
      return;
    }
    setStakeLoading(true);
    const toastId = toast.loading("Confirm stake in your wallet...");
    try {
      const { Transaction } = await import("@solana/web3.js");
      const ix = await buildPlaceStakeInstruction(
        connection,
        new (await import("@solana/web3.js")).PublicKey(battleId),
        publicKey,
        solToLamports(amount),
        selectedAgent === "A" ? 0 : 1
      );
      const tx = new Transaction().add(ix);
      const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash("confirmed");
      tx.recentBlockhash = blockhash;
      tx.feePayer = publicKey;

      // Simulate first to surface the real error (e.g. arena settled, insufficient funds)
      const sim = await connection.simulateTransaction(tx);
      if (sim.value.err) {
        const errLogs = sim.value.logs ?? [];
        const errLogStr = errLogs.join(" ");
        const errObj = sim.value.err;
        const errStr = typeof errObj === "object" ? JSON.stringify(errObj) : String(errObj);
        let hint = errLogStr || errStr;
        if (errLogStr.includes("InvalidArenaState") || errStr.includes("InvalidArenaState") || errStr.includes("6003")) {
          hint = "ARENA_SYNC_NEEDED";
        } else if (errLogStr.includes("insufficient") || errLogStr.includes("0x1") || errStr.includes("0x1")) {
          hint = "Insufficient SOL for stake + fees. Need at least stake amount + ~0.01 SOL for fees.";
        } else if (errLogStr.includes("Invalid arena account") || errLogStr.includes("not found")) {
          hint = "Arena account not found. Make sure you're on Devnet.";
        }
        throw new Error(hint);
      }

      const sig = await sendTransaction(tx, connection, {
        maxRetries: 5,
        preflightCommitment: "confirmed",
        skipPreflight: true,
      });

      // Wait for confirmation before showing success (tx can fail on-chain after submit)
      try {
        await connection.confirmTransaction(
          { signature: sig, blockhash, lastValidBlockHeight },
          "confirmed"
        );
      } catch (confirmErr) {
        const status = await connection.getSignatureStatus(sig).catch(() => null);
        const errStr = status?.err ? JSON.stringify(status.err) : "";
        if (errStr.includes("InvalidArenaState") || errStr.includes("6003")) {
          throw new Error("ARENA_SYNC_NEEDED");
        }
        throw confirmErr;
      }

      toast.success("Stake placed!", {
        id: toastId,
        description: `View on Solscan`,
        action: {
          label: "View",
          onClick: () =>
            window.open(`https://solscan.io/tx/${sig}`, "_blank"),
        },
      });
      setSolAmount("");
    } catch (e) {
      const err = e as Error & { transactionMessage?: string; logs?: string[] };
      const msg =
        err.transactionMessage ??
        err.message ??
        String(e);
      const isRejected = msg.includes("User rejected") || msg.includes("rejected") || msg.includes("denied");
      if (msg === "ARENA_SYNC_NEEDED" && battleId) {
        const syncRes = await fetchSyncArena(battleId);
        queryClient.invalidateQueries({ queryKey: ["arena", "active"] });
        queryClient.invalidateQueries({ queryKey: ["arena", "settled"] });
        if (syncRes.ok) {
          toast.success("Arena was already settled. Moved to Concluded. Reset it to stake again.", { id: toastId });
          const updated = await fetchArenaByAddress(battleId);
          setArenaByAddress(updated ?? null);
        } else {
          toast.error("This arena has already been settled. Reset it first to stake again.", { id: toastId });
        }
      } else {
        const userMsg = isRejected ? "Transaction cancelled" : msg;
        toast.error(userMsg, { id: toastId });
      }
    } finally {
      setStakeLoading(false);
    }
  }, [
    battleId,
    battle,
    connected,
    publicKey,
    useRealTime,
    solAmount,
    selectedAgent,
    connection,
    sendTransaction,
    setWalletModalVisible,
  ]);

  const agentA = battle?.agentA;
  const agentB = battle?.agentB;
  const probA = battle?.winProbA ?? 50;
  const probB = battle?.winProbB ?? 50;
  const sol = parseFloat(solAmount) || 0;
  const prob = selectedAgent === "A" ? probA : probB;
  const potentialReturn = prob > 0 ? (sol * 100) / prob : 0;

  const isLoading = needsArenaFetch && arenaByAddress === undefined;
  if (isLoading) {
    return (
      <div className="relative min-h-screen grid-bg overflow-hidden flex items-center justify-center">
        <div className="glass rounded-2xl p-8 border border-border text-center">
          <div className="animate-spin w-10 h-10 border-2 border-primary border-t-transparent rounded-full mx-auto mb-4" />
          <p className="font-display text-sm text-muted-foreground">Loading battle...</p>
        </div>
      </div>
    );
  }
  if (!battle || !agentA || !agentB) return null;

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
                className="p-2 rounded-lg border border-border hover:bg-muted/50 transition-colors text-muted-foreground hover:text-foreground"
                aria-label="Back to Arena"
              >
                <ArrowLeft className="w-4 h-4" />
              </button>
              <div>
                <h1 className="font-display text-lg md:text-xl font-bold text-foreground">
                  {battle.gameType}
                </h1>
                <p className="text-xs text-muted-foreground">Live AI battle — stake & spectate</p>
              </div>
              <span className="live-badge font-display text-xs font-bold px-2.5 py-1 rounded-md flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-white animate-pulse" />
                LIVE
              </span>
            </div>
            <div className="flex items-center gap-4 font-display text-sm">
              {useRealTime && !socketState.isLive && !battleEnd && (
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        size="sm"
                        onClick={token ? handleStartBattle : connected ? login : () => setWalletModalVisible(true)}
                        disabled={authLoading || startBattleLoading}
                        className="font-display"
                      >
                        <Swords className="w-4 h-4 mr-2" />
                        {token
                          ? (startBattleLoading ? "Starting..." : "Start Battle")
                          : connected
                          ? (authLoading ? "Signing..." : "Sign in to Start")
                          : "Connect wallet to Start"}
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent side="bottom" className="max-w-[240px]">
                      <p className="font-semibold">Stake first, then start</p>
                      <p className="text-xs text-muted-foreground mt-1">
                        Place your stake before starting. Once you click Start Battle, the battle runs and settles — no more staking.
                      </p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              )}
              {startBattleError && (
                <span className="text-destructive text-xs">{startBattleError}</span>
              )}
              {useRealTime && battleEnd && (
                <div className="flex items-center gap-2 flex-wrap">
                  <Button
                    size="sm"
                    variant="default"
                    onClick={() =>
                      navigate(`/arena/battle/${battle?.id}/result`, {
                        state: {
                          userBackedWinner: selectedAgent === battleEnd,
                          userStake: parseFloat(solAmount) || 0,
                        },
                      })
                    }
                    className="font-display"
                  >
                    Claim rewards
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={token ? handleResetArena : connected ? login : () => setWalletModalVisible(true)}
                    disabled={authLoading || resetLoading}
                    className="font-display"
                  >
                    <RotateCcw className="w-4 h-4 mr-2" />
                    {token
                      ? (resetLoading ? "Resetting..." : "Reset Arena")
                      : connected
                      ? (authLoading ? "Signing..." : "Sign in to Reset")
                      : "Connect wallet to Reset"}
                  </Button>
                </div>
              )}
              {resetError && (
                <span className="text-destructive text-xs block mt-1">
                  {resetError}
                  {resetError.includes("Vault must be empty") && (
                    <span className="block mt-0.5 text-muted-foreground">
                      Winners must claim rewards first, then reset.
                    </span>
                  )}
                </span>
              )}
              {!useRealTime && (
                <span className="text-muted-foreground">
                  Round ends in{" "}
                  <span className="text-foreground font-bold tabular-nums">
                    {String(countdown.m).padStart(2, "0")}:{String(countdown.s).padStart(2, "0")}
                  </span>
                </span>
              )}
              {useRealTime && socketState.isLive && (
                <span className="text-secondary text-xs font-bold">LIVE</span>
              )}
            </div>
          </div>
        </header>

        <div className="flex-1 flex flex-col md:flex-row min-h-0">
          {/* Combat Zone - Battle Visualizer */}
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
                      winner: battleEnd === "A" ? "A" : "B",
                      victoryReason: battleEnd === "A"
                        ? `${agentA.name} dominated with superior strategy`
                        : `${agentB.name} dominated with superior strategy`,
                      metrics: [
                        { label: "Accuracy", valueA: Math.min(100, scoreA + 42), valueB: Math.min(100, scoreB + 34) },
                        { label: "Logic", valueA: agentA.stats.logic, valueB: agentB.stats.logic },
                        { label: "Speed", valueA: agentA.stats.speed, valueB: agentB.stats.speed },
                        { label: "Adaptability", valueA: agentA.stats.adaptability, valueB: agentB.stats.adaptability },
                      ],
                    }
                  : null
              }
              resultLink={
                battleEnd && battle?.id
                  ? {
                      to: `/arena/battle/${battle.id}/result`,
                      state: {
                        userBackedWinner: selectedAgent === battleEnd,
                        userStake: parseFloat(solAmount) || 0,
                      },
                    }
                  : undefined
              }
              onResultClose={() => {
                setBattleEnd(null);
                navigate("/arena");
              }}
            />
          </div>

          {/* Staking Terminal (right sidebar) - hidden on mobile, shown via FAB + Sheet */}
          <aside className="hidden md:flex w-full md:w-[320px] lg:w-[360px] shrink-0 border-l border-border glass flex-col">
            <div className="p-4 border-b border-border">
              <div className="flex items-center gap-2 mb-4">
                <h2 className="font-display text-sm font-bold tracking-wider text-foreground">
                  STAKING TERMINAL
                </h2>
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        type="button"
                        className="text-muted-foreground hover:text-foreground transition-colors p-0.5"
                        aria-label="Staking help"
                      >
                        <HelpCircle className="w-3.5 h-3.5" />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent side="left" className="max-w-[260px]">
                      <p className="font-medium mb-1">Quick start</p>
                      <p className="text-xs text-muted-foreground mb-2">
                        <strong>Stake first, then Start Battle.</strong> Once you click Start Battle, the battle runs and settles — no more staking.
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Choose an agent to back. Higher odds = lower potential return.
                      </p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>
              <div className="space-y-3">
                <div>
                  <label className="text-xs text-muted-foreground block mb-1">Amount (SOL)</label>
                  <Input
                    type="number"
                    placeholder="0.00"
                    value={solAmount}
                    onChange={(e) => setSolAmount(e.target.value)}
                    className="font-mono bg-muted/50 border-border input-holographic-focus"
                    min={0}
                    step={0.1}
                  />
                </div>
                <div className="flex flex-wrap gap-2">
                  {([0.5, 1, 5, "MAX"] as const).map((v) => (
                    <Button
                      key={String(v)}
                      variant="outline"
                      size="sm"
                      className="font-display text-xs"
                      onClick={() => quickBet(v)}
                    >
                      {v === "MAX" ? "MAX" : v}
                    </Button>
                  ))}
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => setSelectedAgent("A")}
                    className={`p-3 rounded-lg border text-left transition-all ${
                      selectedAgent === "A"
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border hover:border-muted-foreground"
                    }`}
                  >
                    <p className="font-display text-sm font-bold">{agentA.name}</p>
                    <p className="text-xs text-muted-foreground">{probA}%</p>
                  </button>
                  <button
                    onClick={() => setSelectedAgent("B")}
                    className={`p-3 rounded-lg border text-left transition-all ${
                      selectedAgent === "B"
                        ? "border-secondary bg-secondary/10 text-secondary"
                        : "border-border hover:border-muted-foreground"
                    }`}
                  >
                    <p className="font-display text-sm font-bold">{agentB.name}</p>
                    <p className="text-xs text-muted-foreground">{probB}%</p>
                  </button>
                </div>
                <div className="flex justify-between items-center pt-2">
                  <span className="text-xs text-muted-foreground">Potential Return</span>
                  <span className="font-display text-sm font-bold text-secondary flex items-center gap-1">
                    <TrendingUp className="w-3.5 h-3.5" />
                    {potentialReturn.toFixed(2)} SOL
                  </span>
                </div>
                <Button
                  className="w-full font-display text-sm glow-teal bg-secondary text-secondary-foreground hover:bg-secondary/90"
                  onClick={handlePlaceStake}
                  disabled={stakeLoading}
                >
                  <Zap className="w-4 h-4" />
                  {stakeLoading ? "Placing stake..." : "PLACE STAKE"}
                </Button>
              </div>
            </div>
            <div className="flex-1 flex flex-col min-h-0 p-4">
              <h3 className="font-display text-xs font-bold tracking-wider text-muted-foreground mb-2">
                RECENT SUPPORTERS
              </h3>
              <ScrollArea className="flex-1">
                <ul className="space-y-2 text-xs">
                  {supporters.map((s, i) => (
                    <li key={i} className="text-muted-foreground">
                      <span className="text-foreground font-medium">{s.username}</span>
                      {" backed "}
                      <span
                        className={
                          s.agent === agentA.name ? "text-primary font-display" : "text-secondary font-display"
                        }
                      >
                        {s.agent}
                      </span>
                      {" with "}
                      <span className="text-accent font-display">{s.amount} SOL</span>
                      .
                    </li>
                  ))}
                </ul>
              </ScrollArea>
            </div>
          </aside>

          {/* Mobile: Floating Stake FAB + Sheet */}
          <div className="md:hidden fixed bottom-6 right-6 z-40">
            <Sheet open={stakingSheetOpen} onOpenChange={setStakingSheetOpen}>
              <SheetTrigger asChild>
                <Button
                  size="lg"
                  className="rounded-full h-14 w-14 p-0 shadow-lg glow-teal bg-secondary text-secondary-foreground hover:bg-secondary/90"
                  aria-label="Open staking"
                >
                  <Zap className="w-6 h-6" />
                </Button>
              </SheetTrigger>
              <SheetContent side="bottom" className="h-[85dvh] overflow-y-auto rounded-t-2xl">
                <SheetHeader>
                  <div className="flex items-center gap-2">
                    <SheetTitle className="font-display">STAKING TERMINAL</SheetTitle>
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <button
                            type="button"
                            className="text-muted-foreground hover:text-foreground transition-colors p-0.5"
                            aria-label="Staking help"
                          >
                            <HelpCircle className="w-3.5 h-3.5" />
                          </button>
                        </TooltipTrigger>
                        <TooltipContent side="left" className="max-w-[260px]">
                          <p className="font-medium mb-1">Quick start</p>
                          <p className="text-xs text-muted-foreground mb-2">
                            <strong>Stake first, then Start Battle.</strong> Once you click Start Battle, the battle runs and settles — no more staking.
                          </p>
                          <p className="text-xs text-muted-foreground">
                            Choose an agent to back. Higher odds = lower potential return.
                          </p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </div>
                </SheetHeader>
                <div className="mt-4 space-y-3">
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
                  <div className="flex flex-wrap gap-2">
                    {([0.5, 1, 5, "MAX"] as const).map((v) => (
                      <Button
                        key={String(v)}
                        variant="outline"
                        size="sm"
                        className="font-display text-xs"
                        onClick={() => quickBet(v)}
                      >
                        {v === "MAX" ? "MAX" : v}
                      </Button>
                    ))}
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      onClick={() => setSelectedAgent("A")}
                      className={`p-3 rounded-lg border text-left transition-all ${
                        selectedAgent === "A"
                          ? "border-primary bg-primary/10 text-primary"
                          : "border-border hover:border-muted-foreground"
                      }`}
                    >
                      <p className="font-display text-sm font-bold">{agentA.name}</p>
                      <p className="text-xs text-muted-foreground">{probA}%</p>
                    </button>
                    <button
                      onClick={() => setSelectedAgent("B")}
                      className={`p-3 rounded-lg border text-left transition-all ${
                        selectedAgent === "B"
                          ? "border-secondary bg-secondary/10 text-secondary"
                          : "border-border hover:border-muted-foreground"
                      }`}
                    >
                      <p className="font-display text-sm font-bold">{agentB.name}</p>
                      <p className="text-xs text-muted-foreground">{probB}%</p>
                    </button>
                  </div>
                  <div className="flex justify-between items-center pt-2">
                    <span className="text-xs text-muted-foreground">Potential Return</span>
                    <span className="font-display text-sm font-bold text-secondary flex items-center gap-1">
                      <TrendingUp className="w-3.5 h-3.5" />
                      {potentialReturn.toFixed(2)} SOL
                    </span>
                  </div>
                  <Button
                    className="w-full font-display text-sm glow-teal bg-secondary text-secondary-foreground hover:bg-secondary/90"
                    onClick={handlePlaceStake}
                    disabled={stakeLoading}
                  >
                    <Zap className="w-4 h-4" />
                    {stakeLoading ? "Placing stake..." : "PLACE STAKE"}
                  </Button>
                </div>
              </SheetContent>
            </Sheet>
          </div>
        </div>
      </div>

      {/* Result overlay is handled by BattleVisualizer */}
    </div>
  );
}

