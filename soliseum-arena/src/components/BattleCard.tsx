import { motion } from "framer-motion";
import { Eye, Clock, Zap, Timer, Flame } from "lucide-react";
import type { Battle } from "@/data/mockData";
import { useState, useEffect } from "react";

function AnimatedPrize({ base }: { base: number }) {
  const [value, setValue] = useState(base);
  useEffect(() => {
    const interval = setInterval(() => {
      setValue((v) => v + Math.random() * 2);
    }, 1500);
    return () => clearInterval(interval);
  }, [base]);
  return <span>{value.toFixed(1)}</span>;
}

function CountdownDisplay({ seconds }: { seconds: number }) {
  const [timeLeft, setTimeLeft] = useState(seconds);

  useEffect(() => {
    setTimeLeft(seconds);
    const interval = setInterval(() => {
      setTimeLeft((t) => Math.max(0, t - 1));
    }, 1000);
    return () => clearInterval(interval);
  }, [seconds]);

  const mins = Math.floor(timeLeft / 60);
  const secs = timeLeft % 60;

  return (
    <span className="font-display font-bold tabular-nums">
      {mins}:{secs.toString().padStart(2, "0")}
    </span>
  );
}

function ProbBar({ probA, probB }: { probA: number; probB: number }) {
  return (
    <div className="relative flex h-2 rounded-full overflow-hidden bg-muted/50 backdrop-blur-sm">
      <motion.div
        className="bg-gradient-to-r from-primary to-primary/80 h-full rounded-l-full"
        initial={{ width: 0 }}
        animate={{ width: `${probA}%` }}
        transition={{ duration: 0.8, ease: "easeOut" }}
        style={{ boxShadow: `0 0 8px hsla(var(--neon-purple) / 0.4)` }}
      />
      <motion.div
        className="bg-gradient-to-l from-secondary to-secondary/80 h-full rounded-r-full"
        initial={{ width: 0 }}
        animate={{ width: `${probB}%` }}
        transition={{ duration: 0.8, ease: "easeOut" }}
        style={{ boxShadow: `0 0 8px hsla(var(--neon-teal) / 0.4)` }}
      />
      <div className="absolute inset-0 flex items-center justify-center">
        <div className="w-0.5 h-full bg-foreground/10" />
      </div>
    </div>
  );
}

function AgentBadge({ name, avatar, prob, side }: { name: string; avatar: string; prob: number; side: "left" | "right" }) {
  const colorClass = side === "left" ? "text-primary border-primary/40 bg-primary/5" : "text-secondary border-secondary/40 bg-secondary/5";
  const glowClass = side === "left" ? "shadow-[0_0_12px_hsla(var(--neon-purple)/0.3)]" : "shadow-[0_0_12px_hsla(var(--neon-teal)/0.3)]";
  
  return (
    <div className={`flex items-center gap-2.5 ${side === "right" ? "flex-row-reverse text-right" : ""}`}>
      <motion.div 
        whileHover={{ scale: 1.1, rotate: [0, -5, 5, 0] }}
        transition={{ duration: 0.3 }}
        className={`w-12 h-12 rounded-xl border-2 ${colorClass} flex items-center justify-center font-display text-sm font-bold backdrop-blur-sm ${glowClass} transition-all`}
      >
        {avatar}
      </motion.div>
      <div className="min-w-0">
        <p className="text-sm font-semibold text-foreground truncate">{name}</p>
        <div className="flex items-center gap-1.5">
          <p className={`text-xs font-display font-bold ${side === "left" ? "text-primary" : "text-secondary"}`}>
            {prob}%
          </p>
          <motion.div
            animate={{ scale: [1, 1.2, 1] }}
            transition={{ duration: 2, repeat: Infinity, delay: side === "left" ? 0 : 1 }}
            className={`w-1.5 h-1.5 rounded-full ${side === "left" ? "bg-primary" : "bg-secondary"}`}
          />
        </div>
      </div>
    </div>
  );
}

interface BattleCardProps {
  battle: Battle;
  onClick?: () => void;
  countdownSeconds?: number;
  stakeCount?: number;
  totalStakeA?: number;
  totalStakeB?: number;
}

export function BattleCard({ 
  battle, 
  onClick, 
  countdownSeconds,
  stakeCount = 0,
  totalStakeA = 0,
  totalStakeB = 0,
}: BattleCardProps) {
  const isLive = battle.status === "live";
  const isPending = battle.status === "pending";
  const isStaking = countdownSeconds !== undefined && countdownSeconds > 0;
  const isBattling = countdownSeconds !== undefined && countdownSeconds <= 0;

  // Real-time prize pool for scheduled battles
  const realPrizePool = isStaking || isBattling 
    ? (totalStakeA + totalStakeB) / 1e9 
    : battle.prizePool;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={{ scale: 1.02, y: -4 }}
      transition={{ duration: 0.3, type: "spring", stiffness: 300 }}
      onClick={onClick}
      className={`glass rounded-xl p-5 cursor-pointer transition-all duration-300 relative overflow-hidden group ${
        isLive || isBattling
          ? "pulse-live neon-border-teal hover:shadow-[0_0_30px_hsla(var(--neon-teal)/0.3)]" 
          : isStaking
          ? "neon-border-amber hover:shadow-[0_0_30px_hsla(var(--neon-amber)/0.3)]" 
          : isPending 
          ? "neon-border-purple hover:shadow-[0_0_30px_hsla(var(--neon-purple)/0.3)]" 
          : "border border-border opacity-70 hover:opacity-90 hover:border-primary/30"
      }`}
    >
      {/* Gradient overlay on hover */}
      <div className={`absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none ${
        isLive || isBattling ? "bg-gradient-to-br from-secondary/5 to-transparent" : 
        isStaking ? "bg-gradient-to-br from-amber/5 to-transparent" :
        isPending ? "bg-gradient-to-br from-primary/5 to-transparent" : 
        "bg-gradient-to-br from-primary/5 to-transparent"
      }`} />

      <div className="relative z-10">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2.5">
            {/* LIVE Badge */}
            {(isLive || isBattling) && (
              <motion.span 
                animate={{ scale: [1, 1.1, 1] }}
                transition={{ duration: 1.5, repeat: Infinity }}
                className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-secondary/10 border border-secondary/30 text-xs font-display font-bold text-secondary"
              >
                <span className="w-2 h-2 rounded-full bg-secondary animate-pulse shadow-[0_0_8px_hsla(var(--neon-teal)/0.8)]" />
                LIVE
              </motion.span>
            )}
            
            {/* STAKING OPEN Badge */}
            {isStaking && (
              <motion.span 
                animate={{ scale: [1, 1.05, 1] }}
                transition={{ duration: 1.5, repeat: Infinity }}
                className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-amber/10 border border-amber/30 text-xs font-display font-bold text-amber"
              >
                <Flame className="w-3 h-3" />
                STAKE NOW
              </motion.span>
            )}
            
            {/* PENDING Badge */}
            {isPending && !isStaking && (
              <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-primary/10 border border-primary/30 text-xs font-display font-bold text-primary">
                <Clock className="w-3 h-3" />
                PENDING
              </span>
            )}
            
            {/* Game Type */}
            <span className="text-xs text-muted-foreground font-medium px-2 py-1 rounded bg-muted/30">
              {battle.gameType}
            </span>
          </div>
          
          {/* Spectators / Backers */}
          <div className="flex items-center gap-1.5 px-2 py-1 rounded bg-muted/20 text-xs text-muted-foreground">
            <Eye className="w-3.5 h-3.5" />
            <span className="font-display font-semibold">
              {isStaking || isBattling ? stakeCount : battle.spectators.toLocaleString()}
            </span>
          </div>
        </div>

        {/* Countdown for staking battles */}
        {isStaking && (
          <div className="mb-4 p-3 rounded-lg bg-amber/5 border border-amber/20">
            <div className="flex items-center justify-between">
              <span className="text-xs text-amber font-medium">Battle starts in</span>
              <div className="flex items-center gap-1.5 text-amber">
                <Timer className="w-4 h-4" />
                <CountdownDisplay seconds={countdownSeconds} />
              </div>
            </div>
          </div>
        )}

        {/* Agents */}
        <div className="flex items-center justify-between mb-4">
          <AgentBadge name={battle.agentA.name} avatar={battle.agentA.avatar} prob={battle.winProbA} side="left" />
          <motion.div 
            animate={{ scale: [1, 1.1, 1] }}
            transition={{ duration: 2, repeat: Infinity }}
            className="text-xs font-display font-bold text-muted-foreground mx-3 px-2 py-1 rounded bg-muted/20"
          >
            VS
          </motion.div>
          <AgentBadge name={battle.agentB.name} avatar={battle.agentB.avatar} prob={battle.winProbB} side="right" />
        </div>

        {/* Prob bar */}
        <div className="mb-4">
          <ProbBar probA={battle.winProbA} probB={battle.winProbB} />
        </div>

        {/* Prize pool */}
        <div className="flex items-center justify-between pt-3 border-t border-border/50">
          <motion.div 
            whileHover={{ scale: 1.05 }}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-accent/10 border border-accent/20 group/prize"
          >
            <Zap className="w-4 h-4 text-accent group-hover/prize:rotate-12 transition-transform" />
            <span className="text-sm font-display font-bold text-accent">
              {isLive || isBattling ? <AnimatedPrize base={realPrizePool} /> : realPrizePool.toFixed(1)}
            </span>
            <span className="text-xs text-muted-foreground font-medium">SOL</span>
          </motion.div>
          <span className="text-xs text-muted-foreground font-medium">
            {isStaking ? "Staking open" : battle.startTime}
          </span>
        </div>

        {/* Staking pools display for scheduled battles */}
        {(isStaking || isBattling) && (
          <div className="mt-3 pt-3 border-t border-border/30 grid grid-cols-2 gap-2">
            <div className="text-center p-2 rounded bg-primary/5">
              <p className="text-xs text-muted-foreground">{battle.agentA.name}</p>
              <p className="font-display text-sm font-bold text-primary">{(totalStakeA / 1e9).toFixed(2)} SOL</p>
            </div>
            <div className="text-center p-2 rounded bg-secondary/5">
              <p className="text-xs text-muted-foreground">{battle.agentB.name}</p>
              <p className="font-display text-sm font-bold text-secondary">{(totalStakeB / 1e9).toFixed(2)} SOL</p>
            </div>
          </div>
        )}
      </div>
    </motion.div>
  );
}
