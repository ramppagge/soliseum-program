import { useEffect, useState, useMemo, useRef } from "react";
import { useParams, useNavigate, useLocation } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { battles, type Battle, type Agent } from "@/data/mockData";
import { Button } from "@/components/ui/button";
import { ArrowLeft, ExternalLink, Share2 } from "lucide-react";

/** Solana green for victory */
const SOLANA_GREEN = "#14F195";

/** Location state when navigating from BattleStation or Arena */
export interface VictoryHallState {
  userBackedWinner?: boolean;
  userStake?: number;
  winnerSide?: "A" | "B";
}

function DigitalConfetti({ active }: { active: boolean }) {
  const particles = useMemo(
    () =>
      Array.from({ length: 60 }, (_, i) => ({
        id: i,
        x: Math.random() * 100 - 50,
        delay: Math.random() * 0.8,
        duration: 1.5 + Math.random() * 1,
        size: 4 + Math.random() * 6,
        color: [SOLANA_GREEN, "#00D9FF", "#FFFFFF", "#14F195"][Math.floor(Math.random() * 4)],
      })),
    []
  );

  if (!active) return null;

  return (
    <div className="pointer-events-none fixed inset-0 z-0 overflow-hidden">
      {particles.map((p) => (
        <motion.div
          key={p.id}
          className="absolute rounded-sm"
          style={{
            left: "50%",
            top: "-10%",
            width: p.size,
            height: p.size,
            backgroundColor: p.color,
            boxShadow: `0 0 ${p.size * 2}px ${p.color}`,
          }}
          initial={{ y: 0, x: 0, opacity: 1, rotate: 0 }}
          animate={{
            y: window.innerHeight + 50,
            x: p.x * 8,
            opacity: 0,
            rotate: 360 * 2,
          }}
          transition={{
            delay: p.delay,
            duration: p.duration,
            ease: "easeIn",
          }}
        />
      ))}
    </div>
  );
}

export default function VictoryHall() {
  const { battleId } = useParams<{ battleId: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const state = (location.state ?? {}) as VictoryHallState;

  const battle = battles.find((b) => b.id === battleId);
  const [claimStatus, setClaimStatus] = useState<"idle" | "pending" | "claimed">("idle");
  const [txSignature, setTxSignature] = useState<string | null>(null);
  const [showConfetti, setShowConfetti] = useState(false);
  const confettiDone = useRef(false);

  const userWon = state.userBackedWinner ?? true;
  const userStake = state.userStake ?? 10;
  const totalPool = battle?.prizePool ?? 2500;
  const platformFeePercent = 2;
  const platformFee = (totalPool * platformFeePercent) / 100;
  const losersPool = totalPool * 0.45;
  const winnerShare = totalPool - platformFee;
  const multiplier = 1.8;
  const userShareOfPool = userWon ? (userStake / (totalPool * 0.55)) * winnerShare : 0;
  const payout = userWon ? userStake * multiplier : 0;
  const rewardsAvailable = userWon ? payout : 0;

  const winner: Agent | null = useMemo(() => {
    if (!battle?.result) return battle?.agentB ?? null;
    const isA = battle.result.winnerId === battle.agentA.id;
    return isA ? battle.agentA : battle.agentB;
  }, [battle]);

  const victoryMetric = battle?.result?.victoryMetric ?? "Final score: 62 – 38";

  useEffect(() => {
    if (!battle) navigate("/arena", { replace: true });
  }, [battle, navigate]);

  const handleClaim = async () => {
    setClaimStatus("pending");
    await new Promise((r) => setTimeout(r, 2200));
    const sig = "5K7mN9pQ2xR8vL3wE6jH4tY1uB0cF7dA9sG2mockSignature";
    setTxSignature(sig);
    setClaimStatus("claimed");
  };

  const solscanUrl = txSignature
    ? `https://solscan.io/tx/${txSignature}`
    : "https://solscan.io";

  const handleShare = () => {
    const text = `I just won ${rewardsAvailable.toFixed(2)} SOL on @Soliseum Arena! 🏆`;
    const url = `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}`;
    window.open(url, "_blank", "noopener,noreferrer");
  };

  useEffect(() => {
    if (userWon && !confettiDone.current) {
      confettiDone.current = true;
      setShowConfetti(true);
      const t = setTimeout(() => setShowConfetti(false), 3000);
      return () => clearTimeout(t);
    }
  }, [userWon]);

  if (!battle || !winner) return null;

  const isWinTheme = userWon;

  return (
    <div className="relative min-h-screen grid-bg overflow-hidden">
      {/* God ray / radial gradient behind winner */}
      <div
        className="absolute inset-0 z-0 pointer-events-none"
        style={{
          background: isWinTheme
            ? `radial-gradient(ellipse 80% 60% at 50% 25%, ${SOLANA_GREEN}18 0%, ${SOLANA_GREEN}08 35%, transparent 60%)`
            : "radial-gradient(ellipse 80% 60% at 50% 25%, hsl(261 100% 63% / 0.08) 0%, transparent 50%)",
        }}
      />

      <DigitalConfetti active={showConfetti} />

      <div className="relative z-10 flex flex-col min-h-screen">
        {/* Header */}
        <header className="border-b border-border glass shrink-0">
          <div className="px-4 py-3 flex items-center justify-between">
            <Button
              variant="ghost"
              size="sm"
              className="gap-2 text-muted-foreground hover:text-foreground"
              onClick={() => navigate("/arena")}
            >
              <ArrowLeft className="w-4 h-4" />
              Back to Arena
            </Button>
            <span className="font-display text-xs tracking-wider text-muted-foreground">VICTORY HALL</span>
          </div>
        </header>

        <main className="flex-1 p-4 md:p-6 max-w-3xl mx-auto w-full space-y-8 pb-12">
          {/* Winner announcement */}
          <section className="text-center">
            <motion.p
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="font-display text-sm tracking-widest text-muted-foreground mb-2"
            >
              BATTLE CONCLUDED
            </motion.p>
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ type: "spring", stiffness: 200, damping: 20 }}
              className="relative inline-block"
            >
              <div
                className="absolute -inset-4 rounded-2xl opacity-40"
                style={{
                  background: isWinTheme
                    ? `radial-gradient(circle, ${SOLANA_GREEN}40 0%, transparent 70%)`
                    : "radial-gradient(circle, hsl(261 100% 63% / 0.15) 0%, transparent 70%)",
                }}
              />
              <div
                className={`relative rounded-2xl border-2 p-6 md:p-8 ${
                  isWinTheme
                    ? "border-[#14F195]/50 bg-[#14F195]/5"
                    : "border-muted-foreground/30 bg-muted/20"
                }`}
                style={
                  isWinTheme
                    ? { boxShadow: `0 0 40px ${SOLANA_GREEN}25, inset 0 0 60px ${SOLANA_GREEN}08` }
                    : {}
                }
              >
                <span
                  className="inline-block font-display text-xs md:text-sm tracking-[0.35em] uppercase font-bold px-3 py-1 rounded-md mb-3"
                  style={{
                    color: isWinTheme ? "#050505" : "hsl(var(--muted-foreground))",
                    background: isWinTheme
                      ? `linear-gradient(135deg, ${SOLANA_GREEN}, #0EC78A)`
                      : "hsl(var(--muted))",
                    boxShadow: isWinTheme
                      ? `0 0 16px ${SOLANA_GREEN}50, inset 0 1px 0 rgba(255,255,255,0.2)`
                      : "inset 0 1px 0 rgba(255,255,255,0.05)",
                  }}
                >
                  Winner
                </span>
                <div
                  className={`w-20 h-20 md:w-24 md:h-24 rounded-xl border-2 mx-auto flex items-center justify-center font-display text-2xl md:text-3xl font-bold mb-3 ${
                    isWinTheme ? "border-[#14F195] text-[#14F195]" : "border-muted-foreground/50 text-muted-foreground"
                  }`}
                >
                  {winner.avatar}
                </div>
                <p className="font-display text-xl md:text-2xl font-bold text-foreground">{winner.name}</p>
                <p className="mt-2 text-sm text-muted-foreground">{victoryMetric}</p>
              </div>
            </motion.div>
            {!userWon && (
              <p className="mt-4 text-sm text-muted-foreground font-medium">Better luck next time.</p>
            )}
          </section>

          {/* Payoff breakdown */}
          <section className="rounded-xl border border-border bg-card/50 p-4 md:p-5">
            <h2 className="font-display text-sm font-bold tracking-wider text-foreground mb-4">
              Prize pool breakdown
            </h2>
            <div className="space-y-3 mb-4">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Total arena pool</span>
                <span className="font-mono font-bold text-foreground">{totalPool.toLocaleString()} SOL</span>
              </div>
              <div className="h-2 rounded-full bg-muted overflow-hidden flex">
                <motion.div
                  className="h-full rounded-l-full"
                  style={{ background: isWinTheme ? SOLANA_GREEN : "hsl(var(--muted-foreground))" }}
                  initial={{ width: 0 }}
                  animate={{ width: "100%" }}
                  transition={{ duration: 0.8, ease: "easeOut" }}
                />
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Your contribution</span>
                <span className="font-mono font-bold">{userStake} SOL</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Multiplier</span>
                <span className="font-mono font-bold">{multiplier}x</span>
              </div>
            </div>
            <div className="rounded-lg bg-muted/50 p-3 font-mono text-xs space-y-1 border border-border">
              <p className="text-muted-foreground">Earnings formula</p>
              <p className="text-foreground">
                Staked amount + share of losers&apos; pool − platform fee ({platformFeePercent}%) = your payout
              </p>
              <p className="pt-2 text-foreground">
                {userStake} + {(userShareOfPool - userStake).toFixed(2)} − {platformFee.toFixed(2)} ={" "}
                <span style={isWinTheme ? { color: SOLANA_GREEN } : {}}>{payout.toFixed(2)} SOL</span>
              </p>
            </div>
          </section>

          {/* Claim widget */}
          <section className="rounded-xl border border-border bg-card/50 p-4 md:p-5">
            <h2 className="font-display text-sm font-bold tracking-wider text-foreground mb-4">
              Your rewards
            </h2>
            <AnimatePresence mode="wait">
              {claimStatus === "idle" && (
                <motion.div
                  key="idle"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="space-y-4"
                >
                  <div
                    className="rounded-lg border-2 py-4 px-4 text-center"
                    style={
                      userWon
                        ? {
                            borderColor: `${SOLANA_GREEN}60`,
                            backgroundColor: `${SOLANA_GREEN}12`,
                            boxShadow: `0 0 24px ${SOLANA_GREEN}20`,
                          }
                        : { borderColor: "hsl(var(--border))", backgroundColor: "hsl(var(--muted) / 0.3)" }
                    }
                  >
                    <p className="text-xs text-muted-foreground mb-1">Rewards available</p>
                    <p
                      className="font-display text-2xl font-bold tabular-nums"
                      style={userWon ? { color: SOLANA_GREEN } : {}}
                    >
                      {rewardsAvailable.toFixed(2)} SOL
                    </p>
                  </div>
                  <Button
                    className="w-full font-display text-sm h-12"
                    style={
                      userWon
                        ? {
                            background: SOLANA_GREEN,
                            color: "#050505",
                            boxShadow: `0 0 24px ${SOLANA_GREEN}60, 0 0 48px ${SOLANA_GREEN}30`,
                          }
                        : {}
                    }
                    onClick={handleClaim}
                    disabled={!userWon}
                  >
                    {userWon ? "Claim rewards" : "No rewards to claim"}
                  </Button>
                </motion.div>
              )}
              {claimStatus === "pending" && (
                <motion.div
                  key="pending"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="py-6 flex flex-col items-center gap-3"
                >
                  <motion.div
                    className="w-12 h-12 rounded-full border-2 border-[#14F195] border-t-transparent"
                    style={{ borderColor: `${SOLANA_GREEN}40`, borderTopColor: SOLANA_GREEN }}
                    animate={{ rotate: 360 }}
                    transition={{ repeat: Infinity, duration: 1, ease: "linear" }}
                  />
                  <p className="font-display text-sm text-muted-foreground">Transaction pending</p>
                  <p className="text-xs text-muted-foreground">Confirm in your wallet</p>
                </motion.div>
              )}
              {claimStatus === "claimed" && (
                <motion.div
                  key="claimed"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="space-y-4"
                >
                  <div
                    className="rounded-lg border-2 py-4 px-4 text-center"
                    style={{
                      borderColor: `${SOLANA_GREEN}60`,
                      backgroundColor: `${SOLANA_GREEN}12`,
                    }}
                  >
                    <p className="font-display text-sm font-bold" style={{ color: SOLANA_GREEN }}>
                      Rewards transferred
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">Your balance has been updated.</p>
                  </div>
                  <a
                    href={solscanUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center justify-center gap-2 w-full rounded-lg border border-border py-3 text-sm text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
                  >
                    View on Solscan
                    <ExternalLink className="w-4 h-4" />
                  </a>
                </motion.div>
              )}
            </AnimatePresence>
          </section>

          {/* Navigation & share */}
          <div className="flex flex-col sm:flex-row gap-3">
            <Button
              variant="outline"
              className="flex-1 gap-2"
              onClick={() => navigate("/arena")}
            >
              <ArrowLeft className="w-4 h-4" />
              Back to Arena
            </Button>
            {userWon && (
              <Button variant="outline" className="flex-1 gap-2" onClick={handleShare}>
                <Share2 className="w-4 h-4" />
                Share my win
              </Button>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}
