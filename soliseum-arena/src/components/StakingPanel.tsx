import { motion } from "framer-motion";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Slider } from "@/components/ui/slider";
import { Zap, TrendingUp, X } from "lucide-react";
import { toast } from "sonner";
import type { Battle } from "@/data/mockData";

export function StakingPanel({ battle, onClose }: { battle: Battle; onClose: () => void }) {
  const navigate = useNavigate();
  const [confidence, setConfidence] = useState([50]);
  const [selectedAgent, setSelectedAgent] = useState<"A" | "B">("A");

  const stakeAmount = (confidence[0] / 100) * 10; // max 10 SOL
  const agent = selectedAgent === "A" ? battle.agentA : battle.agentB;
  const prob = selectedAgent === "A" ? battle.winProbA : battle.winProbB;
  const potentialReturn = stakeAmount * (100 / prob);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm"
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.9, opacity: 0, y: 20 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0.9, opacity: 0, y: 20 }}
        onClick={(e) => e.stopPropagation()}
        className="glass rounded-2xl p-6 w-full max-w-sm neon-border-purple"
      >
        <div className="flex items-center justify-between mb-6">
          <h2 className="font-display text-sm font-bold tracking-wider text-foreground">STAKING TERMINAL</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Game info */}
        <div className="glass rounded-lg p-3 mb-4">
          <p className="text-xs text-muted-foreground mb-1">{battle.gameType}</p>
          <p className="text-sm font-display font-bold text-foreground">
            {battle.agentA.name} vs {battle.agentB.name}
          </p>
        </div>

        {/* Agent selection */}
        <div className="grid grid-cols-2 gap-2 mb-6">
          {(["A", "B"] as const).map((side) => {
            const a = side === "A" ? battle.agentA : battle.agentB;
            const p = side === "A" ? battle.winProbA : battle.winProbB;
            return (
              <button
                key={side}
                onClick={() => setSelectedAgent(side)}
                className={`p-3 rounded-lg border transition-all ${
                  selectedAgent === side
                    ? "neon-border-purple bg-primary/10"
                    : "border-border hover:border-muted-foreground"
                }`}
              >
                <p className="font-display text-sm font-bold text-foreground">{a.name}</p>
                <p className="text-xs text-primary mt-1">{p}% odds</p>
              </button>
            );
          })}
        </div>

        {/* Confidence slider */}
        <div className="mb-6">
          <div className="flex items-center justify-between mb-2">
            <label className="text-xs font-display text-muted-foreground tracking-wider">CONFIDENCE</label>
            <span className="text-sm font-display font-bold text-accent">{confidence[0]}%</span>
          </div>
          <Slider
            value={confidence}
            onValueChange={setConfidence}
            max={100}
            step={1}
            className="[&_[role=slider]]:bg-primary [&_[role=slider]]:border-primary [&_[role=slider]]:glow-purple [&_.relative>div:first-child]:bg-primary"
          />
        </div>

        {/* Stake info */}
        <div className="glass rounded-lg p-4 mb-6 space-y-3">
          <div className="flex justify-between items-center">
            <span className="text-xs text-muted-foreground">Stake Amount</span>
            <span className="font-display text-sm font-bold text-foreground flex items-center gap-1">
              <Zap className="w-3 h-3 text-accent" />
              {stakeAmount.toFixed(2)} SOL
            </span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-xs text-muted-foreground">Backing</span>
            <span className="text-sm font-semibold text-primary">{agent.name}</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-xs text-muted-foreground">Potential Return</span>
            <span className="font-display text-sm font-bold text-secondary flex items-center gap-1">
              <TrendingUp className="w-3 h-3" />
              {potentialReturn.toFixed(2)} SOL
            </span>
          </div>
        </div>

        {/* Place stake button - navigates to battle page for live staking */}
        <motion.button
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          className="w-full py-3 rounded-xl bg-primary font-display text-sm font-bold text-primary-foreground glow-purple glitch-hover transition-all"
          onClick={() => {
            onClose();
            if (battle.status === "live") {
              navigate(`/arena/battle/${battle.id}`);
            } else {
              toast.info("Staking opens when the battle goes live. Check back soon!");
            }
          }}
        >
          PLACE STAKE
        </motion.button>
      </motion.div>
    </motion.div>
  );
}
