/**
 * Battle Visualizer - Central combat display for Soliseum AI battles.
 * - Tug-of-War progress bar (DominanceScore)
 * - Real-time Terminal Log (WebSocket, neon green on black)
 * - Agent Cards with pulsing Confidence Level
 * - Impact Flash on significant lead
 * - Transparent Result Overlay with breakdown
 */

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface AgentVisualizer {
  id: string;
  name: string;
  avatar: string;
  confidenceLevel: number; // 0–100
}

export interface LogEntry {
  id: string | number;
  time: string;
  agent: string;
  message: string;
  type?: "info" | "action" | "success";
}

export interface ResultMetric {
  label: string;
  valueA: number;
  valueB: number;
  unit?: string;
}

export interface BattleResultBreakdown {
  winner: "A" | "B";
  metrics: ResultMetric[];
  victoryReason?: string;
}

export interface BattleVisualizerProps {
  agentA: AgentVisualizer;
  agentB: AgentVisualizer;
  /** 0 = full A, 100 = full B. 50 = even. */
  dominanceScore: number;
  logs: LogEntry[];
  /** Callback when new log arrives (for external scroll sync) */
  onLogsChange?: (logs: LogEntry[]) => void;
  /** When battle ends, show overlay with this breakdown */
  result?: BattleResultBreakdown | null;
  /** Threshold (0–50) for impact flash. e.g. 15 = flash when lead >= 15 points */
  impactThreshold?: number;
  /** Called when user clicks "View result & claim" in result overlay */
  onViewResult?: () => void;
  /** Direct link target for "View result & claim" (more reliable than callback) */
  resultLink?: { to: string; state?: object };
  /** Called when user clicks "Close" in result overlay */
  onResultClose?: () => void;
  /** Optional: inject logs from WebSocket. Component also accepts logs via prop. */
  className?: string;
}

// ─── Terminal Log (neon green on black, auto-scroll) ──────────────────────────

function TerminalLog({
  logs,
  agentAName,
  agentBName,
}: {
  logs: LogEntry[];
  agentAName: string;
  agentBName: string;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [logs.length]);

  return (
    <div className="rounded-xl overflow-hidden border border-[hsl(120,70%,40%)]/40 bg-black min-h-[180px] flex flex-col">
      <div className="px-3 py-2 border-b border-[hsl(120,70%,40%)]/30 font-display text-xs tracking-wider text-[#39ff14]">
        LOGIC FEED
      </div>
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto p-3 font-mono text-xs space-y-1 max-h-[160px]"
      >
        {logs.map((log) => (
          <div
            key={log.id}
            className={`flex gap-2 ${
              log.agent === agentAName
                ? "text-[#39ff14]"
                : log.agent === agentBName
                ? "text-[#00d4ff]"
                : "text-[#39ff14]"
            }`}
          >
            <span className="text-[#39ff14]/70 shrink-0">[{log.time}]</span>
            <span className="font-display shrink-0">{log.agent}:</span>
            <span className="text-[#39ff14]/95">{log.message}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Agent Card (Avatar, Name, Pulsing Confidence Bar) ────────────────────────

function AgentCard({
  agent,
  side,
  isFlashing,
}: {
  agent: AgentVisualizer;
  side: "left" | "right";
  isFlashing: boolean;
}) {
  const isLeft = side === "left";
  const colorClass = isLeft
    ? "border-primary text-primary"
    : "border-secondary text-secondary";
  const barColor = isLeft ? "bg-primary" : "bg-secondary";

  return (
    <motion.div
      layout
      animate={
        isFlashing
          ? {
              scale: [1, 1.03, 1],
              boxShadow: [
                "0 0 12px transparent",
                "0 0 24px hsl(var(--neon-teal))",
                "0 0 12px transparent",
              ],
            }
          : {}
      }
      transition={{ duration: 0.3 }}
      className={`rounded-xl border-2 p-4 flex flex-col items-center ${colorClass} ${
        isFlashing ? "ring-2 ring-offset-2 ring-offset-black ring-secondary" : ""
      }`}
    >
      <div
        className={`w-16 h-16 rounded-xl border-2 flex items-center justify-center font-display text-xl font-bold mb-2 ${colorClass}`}
      >
        {agent.avatar}
      </div>
      <p className="font-display font-bold text-foreground">{agent.name}</p>
      <div className="w-full mt-2">
        <p className="text-[10px] text-muted-foreground mb-1">Confidence</p>
        <div className="h-2.5 rounded-full bg-muted overflow-hidden">
          <motion.div
            className={`h-full rounded-full ${barColor}`}
            initial={{ width: 0 }}
            animate={{
              width: `${agent.confidenceLevel}%`,
              opacity: [0.85, 1, 0.85],
            }}
            transition={{
              width: { type: "spring", stiffness: 100, damping: 20 },
              opacity: { duration: 1.2, repeat: Infinity, ease: "easeInOut" },
            }}
          />
        </div>
      </div>
    </motion.div>
  );
}

// ─── Tug-of-War Bar ──────────────────────────────────────────────────────────

function TugOfWarBar({ dominanceScore }: { dominanceScore: number }) {
  const pctA = 100 - dominanceScore;
  const pctB = dominanceScore;

  return (
    <div className="flex items-center gap-2 my-4">
      <span className="font-display text-sm text-primary w-12 text-right tabular-nums">
        {Math.round(pctA)}
      </span>
      <div className="flex-1 h-5 rounded-full bg-muted overflow-hidden flex">
        <motion.div
          className="h-full bg-primary rounded-l-full"
          animate={{ width: `${pctA}%` }}
          transition={{ type: "spring", stiffness: 150, damping: 25 }}
        />
        <motion.div
          className="h-full bg-secondary rounded-r-full"
          animate={{ width: `${pctB}%` }}
          transition={{ type: "spring", stiffness: 150, damping: 25 }}
        />
      </div>
      <span className="font-display text-sm text-secondary w-12 tabular-nums">
        {Math.round(pctB)}
      </span>
    </div>
  );
}

// ─── Result Overlay (transparent, breakdown) ──────────────────────────────────

function ResultOverlay({
  result,
  agentA,
  agentB,
  onClose,
  onViewResult,
  resultLink,
}: {
  result: BattleResultBreakdown;
  agentA: AgentVisualizer;
  agentB: AgentVisualizer;
  onClose?: () => void;
  onViewResult?: () => void;
  resultLink?: { to: string; state?: object };
}) {
  const winner = result.winner === "A" ? agentA : agentB;
  const unit = (m: ResultMetric) => m.unit ?? "%";

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/70 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose?.();
      }}
    >
      <motion.div
        initial={{ scale: 0.8, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.9, opacity: 0 }}
        transition={{ type: "spring", stiffness: 200, damping: 25 }}
        className="glass rounded-2xl p-8 max-w-lg w-full mx-4 border border-white/10"
        onClick={(e) => e.stopPropagation()}
      >
        <p className="font-display text-sm tracking-widest text-muted-foreground mb-2">
          BATTLE ENDED
        </p>
        <motion.p
          className="font-display text-2xl md:text-3xl font-bold text-secondary mb-2"
          initial={{ y: 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.1 }}
        >
          {winner.name} WINS
        </motion.p>
        {result.victoryReason && (
          <p className="text-sm text-muted-foreground mb-6">{result.victoryReason}</p>
        )}

        <div className="space-y-1">
          {result.metrics.map((m, i) => {
            const aWins = m.valueA >= m.valueB;

            return (
              <motion.div
                key={m.label}
                initial={{ x: -20, opacity: 0 }}
                animate={{ x: 0, opacity: 1 }}
                transition={{ delay: 0.15 + i * 0.05 }}
                className="flex items-center justify-between py-2 border-b border-border/50 last:border-0"
              >
                <span className="text-sm text-muted-foreground">{m.label}</span>
                <div className="flex items-center gap-4">
                  <span
                    className={
                      aWins ? "text-secondary font-bold" : "text-muted-foreground"
                    }
                  >
                    {m.valueA}
                    {unit(m)}
                  </span>
                  <span className="text-muted-foreground">vs</span>
                  <span
                    className={
                      !aWins ? "text-secondary font-bold" : "text-muted-foreground"
                    }
                  >
                    {m.valueB}
                    {unit(m)}
                  </span>
                </div>
              </motion.div>
            );
          })}
        </div>

        <div className="mt-6 flex gap-3">
          {(onViewResult || resultLink) &&
            (resultLink ? (
              <a
                href={resultLink.to}
                target="_self"
                rel="noopener noreferrer"
                className="flex-1 py-2 rounded-lg bg-secondary text-secondary-foreground font-display font-bold text-sm hover:bg-secondary/90 transition-colors glow-teal cursor-pointer flex items-center justify-center no-underline"
              >
                View result & claim
              </a>
            ) : (
              <motion.button
                type="button"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.4 }}
                onClick={(e) => {
                  e.stopPropagation();
                  e.preventDefault();
                  onViewResult?.();
                }}
                className="flex-1 py-2 rounded-lg bg-secondary text-secondary-foreground font-display font-bold text-sm hover:bg-secondary/90 transition-colors glow-teal cursor-pointer"
              >
                View result & claim
              </motion.button>
            ))}
          {(onClose || onViewResult) && (
            <motion.button
              type="button"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.4 }}
              onClick={(e) => {
                e.stopPropagation();
                onClose?.();
              }}
              className={`relative z-10 py-2 rounded-lg border border-border hover:bg-muted/50 text-sm font-display transition-colors cursor-pointer ${(onViewResult || resultLink) ? "flex-1" : "w-full"}`}
            >
              Back to Arena
            </motion.button>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function BattleVisualizer({
  agentA,
  agentB,
  dominanceScore,
  logs,
  onLogsChange,
  result,
  impactThreshold = 15,
  onViewResult,
  resultLink,
  onResultClose,
  className = "",
}: BattleVisualizerProps) {
  const [impactSide, setImpactSide] = useState<"left" | "right" | null>(null);

  // Detect significant lead change → impact flash
  useEffect(() => {
    const diff = Math.abs(dominanceScore - 50);
    if (diff >= impactThreshold) {
      const side = dominanceScore < 50 ? "left" : "right";
      if (side !== impactSide) {
        setImpactSide(side);
        const t = setTimeout(() => setImpactSide(null), 400);
        return () => clearTimeout(t);
      }
    }
  }, [dominanceScore, impactThreshold, impactSide]);

  useEffect(() => {
    onLogsChange?.(logs);
  }, [logs, onLogsChange]);

  return (
    <div className={`relative ${className}`}>
      {/* Impact flash overlay */}
      <AnimatePresence>
        {impactSide && (
          <motion.div
            key="impact-flash"
            initial={{ opacity: 0 }}
            animate={{ opacity: [0, 0.4, 0] }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.35 }}
            className={`absolute inset-0 pointer-events-none z-10 rounded-xl ${
              impactSide === "left"
                ? "bg-primary/30"
                : "bg-secondary/30"
            }`}
          />
        )}
      </AnimatePresence>

      <motion.div
        layout
        className={`relative flex flex-col p-4 md:p-6 ${
          impactSide === "left" ? "screen-shake" : impactSide === "right" ? "screen-shake-right" : ""
        }`}
      >
        {/* Agent Cards */}
        <div className="grid grid-cols-2 gap-4 mb-4">
          <AgentCard
            agent={agentA}
            side="left"
            isFlashing={impactSide === "left"}
          />
          <AgentCard
            agent={agentB}
            side="right"
            isFlashing={impactSide === "right"}
          />
        </div>

        {/* Tug-of-War */}
        <TugOfWarBar dominanceScore={dominanceScore} />

        {/* Terminal Log */}
        <div className="mt-4 flex-1 min-h-0">
          <TerminalLog
            logs={logs}
            agentAName={agentA.name}
            agentBName={agentB.name}
          />
        </div>
      </motion.div>

      {/* Result Overlay - portaled to body to escape overflow/transform ancestors */}
      {result &&
        createPortal(
          <AnimatePresence>
            <ResultOverlay
              result={result}
              agentA={agentA}
              agentB={agentB}
              onClose={onResultClose}
              onViewResult={onViewResult}
              resultLink={resultLink}
            />
          </AnimatePresence>,
          document.body
        )}
    </div>
  );
}
