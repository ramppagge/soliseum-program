import { motion } from "framer-motion";
import type { Agent } from "@/data/mockData";
import { X } from "lucide-react";

function RadarChart({ stats }: { stats: Agent["stats"] }) {
  const keys = Object.keys(stats) as (keyof Agent["stats"])[];
  const size = 140;
  const center = size / 2;
  const radius = 55;
  const angleStep = (2 * Math.PI) / keys.length;

  const points = keys.map((key, i) => {
    const angle = i * angleStep - Math.PI / 2;
    const value = stats[key] / 100;
    return {
      x: center + radius * value * Math.cos(angle),
      y: center + radius * value * Math.sin(angle),
      labelX: center + (radius + 18) * Math.cos(angle),
      labelY: center + (radius + 18) * Math.sin(angle),
      key,
      value: stats[key],
    };
  });

  const polygon = points.map((p) => `${p.x},${p.y}`).join(" ");

  // Grid rings
  const rings = [0.25, 0.5, 0.75, 1];

  return (
    <svg viewBox={`0 0 ${size} ${size}`} className="w-full max-w-[200px] mx-auto">
      {/* Grid */}
      {rings.map((r) => (
        <polygon
          key={r}
          points={keys
            .map((_, i) => {
              const angle = i * angleStep - Math.PI / 2;
              return `${center + radius * r * Math.cos(angle)},${center + radius * r * Math.sin(angle)}`;
            })
            .join(" ")}
          fill="none"
          stroke="hsla(0,0%,100%,0.06)"
          strokeWidth="0.5"
        />
      ))}
      {/* Axes */}
      {keys.map((_, i) => {
        const angle = i * angleStep - Math.PI / 2;
        return (
          <line
            key={i}
            x1={center}
            y1={center}
            x2={center + radius * Math.cos(angle)}
            y2={center + radius * Math.sin(angle)}
            stroke="hsla(0,0%,100%,0.06)"
            strokeWidth="0.5"
          />
        );
      })}
      {/* Data polygon */}
      <motion.polygon
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        points={polygon}
        fill="hsla(261,100%,63%,0.15)"
        stroke="hsl(261,100%,63%)"
        strokeWidth="1.5"
      />
      {/* Data points */}
      {points.map((p) => (
        <circle key={p.key} cx={p.x} cy={p.y} r="2.5" fill="hsl(261,100%,63%)" />
      ))}
      {/* Labels */}
      {points.map((p) => (
        <text
          key={p.key}
          x={p.labelX}
          y={p.labelY}
          textAnchor="middle"
          dominantBaseline="middle"
          className="fill-muted-foreground"
          fontSize="6"
          fontFamily="Orbitron"
        >
          {p.key.charAt(0).toUpperCase() + p.key.slice(1, 3).toUpperCase()}
        </text>
      ))}
    </svg>
  );
}

function Sparkline({ data }: { data: number[] }) {
  const width = 160;
  const height = 40;
  const step = width / (data.length - 1);

  const points = data.map((v, i) => `${i * step},${height - v * height * 0.8 - height * 0.1}`).join(" ");

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-10">
      <defs>
        <linearGradient id="sparkGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="hsl(160,93%,52%)" stopOpacity="0.3" />
          <stop offset="100%" stopColor="hsl(160,93%,52%)" stopOpacity="0" />
        </linearGradient>
      </defs>
      <polygon
        points={`0,${height} ${points} ${width},${height}`}
        fill="url(#sparkGrad)"
      />
      <polyline
        points={points}
        fill="none"
        stroke="hsl(160,93%,52%)"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {data.map((v, i) => (
        <circle
          key={i}
          cx={i * step}
          cy={height - v * height * 0.8 - height * 0.1}
          r="2"
          fill={v === 1 ? "hsl(160,93%,52%)" : "hsl(0,84%,60%)"}
        />
      ))}
    </svg>
  );
}

function TierBadge({ tier }: { tier: Agent["tier"] }) {
  const config = {
    diamond: "text-tier-diamond border-tier-diamond/30 bg-tier-diamond/10",
    platinum: "text-tier-platinum border-tier-platinum/30 bg-tier-platinum/10",
    gold: "text-tier-gold border-tier-gold/30 bg-tier-gold/10",
    silver: "text-muted-foreground border-border bg-muted",
  };
  return (
    <span className={`text-[10px] font-display font-bold px-2 py-0.5 rounded border ${config[tier]}`}>
      {tier.toUpperCase()}
    </span>
  );
}

export { TierBadge, Sparkline };

export function AgentProfile({ agent, onClose }: { agent: Agent; onClose: () => void }) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm"
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.9, opacity: 0 }}
        onClick={(e) => e.stopPropagation()}
        className="glass rounded-2xl p-6 w-full max-w-md neon-border-purple"
      >
        {/* Header */}
        <div className="flex items-start justify-between mb-6">
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 rounded-xl border border-primary/30 flex items-center justify-center font-display text-xl font-bold text-primary bg-primary/10 glow-purple">
              {agent.avatar}
            </div>
            <div>
              <h2 className="font-display text-xl font-bold text-foreground">{agent.name}</h2>
              <div className="flex items-center gap-2 mt-1">
                <TierBadge tier={agent.tier} />
                <span className="text-xs text-muted-foreground">
                  {agent.wins}W - {agent.losses}L
                </span>
              </div>
            </div>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Stats */}
        <div className="mb-6">
          <h3 className="text-xs font-display text-muted-foreground mb-3 tracking-wider">COMBAT STATS</h3>
          <RadarChart stats={agent.stats} />
        </div>

        {/* Quick stats row */}
        <div className="grid grid-cols-3 gap-3 mb-6">
          <div className="glass rounded-lg p-3 text-center">
            <p className="text-xs text-muted-foreground">Win Rate</p>
            <p className="font-display text-lg font-bold text-secondary">{agent.winRate}%</p>
          </div>
          <div className="glass rounded-lg p-3 text-center">
            <p className="text-xs text-muted-foreground">Earnings</p>
            <p className="font-display text-lg font-bold text-accent">{(agent.totalEarnings / 1000).toFixed(1)}k</p>
          </div>
          <div className="glass rounded-lg p-3 text-center">
            <p className="text-xs text-muted-foreground">Battles</p>
            <p className="font-display text-lg font-bold text-foreground">{agent.wins + agent.losses}</p>
          </div>
        </div>

        {/* Battle History */}
        <div>
          <h3 className="text-xs font-display text-muted-foreground mb-2 tracking-wider">RECENT PERFORMANCE</h3>
          <Sparkline data={agent.recentPerformance} />
        </div>
      </motion.div>
    </motion.div>
  );
}
