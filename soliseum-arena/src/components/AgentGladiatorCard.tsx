import { motion } from "framer-motion";
import { BarChart3, Swords, FileText, Settings, Loader2, Clock, Flame } from "lucide-react";
import { ResponsiveContainer, Area, AreaChart, YAxis, Tooltip } from "recharts";
import type { Agent, AgentStatus } from "@/data/mockData";
import { useMatchmakingStatus } from "@/hooks/useApi";

function getStatusClass(status: AgentStatus | string) {
  switch (status) {
    case "ACTIVE":
    case "idle":
      return "status-active border border-[hsla(142,76%,46%,0.4)] bg-[hsla(142,76%,46%,0.08)]";
    case "IN-BATTLE":
    case "battling":
      return "status-in-battle border border-[hsl(var(--neon-orange))]/40 bg-[hsla(var(--neon-orange)/0.1)]";
    case "queued":
      return "status-queued border border-primary/40 bg-primary/10 text-primary";
    case "matched":
      return "status-matched border border-secondary/40 bg-secondary/10 text-secondary";
    case "IDLE":
    default:
      return "status-idle border border-border bg-muted/50";
  }
}

function getStatusDisplay(status: string, battleStatus?: string) {
  if (battleStatus === "staking") return "MATCH FOUND";
  if (battleStatus === "battling") return "IN BATTLE";
  if (status === "queued") return "IN QUEUE";
  if (status === "matched") return "MATCHED";
  if (status === "battling") return "IN BATTLE";
  return status.replace("-", " ").toUpperCase();
}

function PerformanceSparkline({ data }: { data: number[] }) {
  const chartData = data.map((value, i) => ({ day: i + 1, score: value }));
  const teal = "hsl(160, 93%, 52%)";
  const purple = "hsl(261, 100%, 63%)";

  return (
    <div className="h-10 min-h-[2.5rem] w-full min-w-0">
      <ResponsiveContainer width="100%" height="100%" minHeight={40}>
        <AreaChart data={chartData} margin={{ top: 2, right: 2, bottom: 2, left: 2 }}>
          <defs>
            <linearGradient id="sparklineGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={teal} stopOpacity={0.35} />
              <stop offset="100%" stopColor={purple} stopOpacity={0} />
            </linearGradient>
          </defs>
          <YAxis domain={[0, 1]} hide />
          <Tooltip
            contentStyle={{
              background: "hsl(0,0%,8%)",
              border: "1px solid hsla(261,100%,63%,0.3)",
              borderRadius: "8px",
              fontSize: "11px",
            }}
            formatter={(value: number) => [`${(value * 100).toFixed(0)}%`, "Score"]}
            labelFormatter={(_, payload) => (payload[0] ? `Day ${payload[0].payload.day}` : "")}
          />
          <Area
            type="monotone"
            dataKey="score"
            stroke={teal}
            strokeWidth={1.5}
            fill="url(#sparklineGrad)"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

interface AgentGladiatorCardProps {
  agent: Agent;
  index: number;
  onViewLogs: (agent: Agent) => void;
  onEnterArena: (agent: Agent) => void;
  onEditConfig: (agent: Agent) => void;
  onSelect?: (agent: Agent) => void;
  isEntering?: boolean;
}

export function AgentGladiatorCard({
  agent,
  index,
  onViewLogs,
  onEnterArena,
  onEditConfig,
  onSelect,
  isEntering = false,
}: AgentGladiatorCardProps) {
  const { data: mmStatus } = useMatchmakingStatus(agent.id);
  
  const status = mmStatus?.battle?.status === "staking" 
    ? "matched" 
    : mmStatus?.battle?.status === "battling"
    ? "battling"
    : mmStatus?.agent?.status === "queued"
    ? "queued"
    : agent.status ?? "IDLE";
    
  const isInMatchmaking = status === "queued" || status === "matched" || status === "battling";
  
  const sparklineData =
    agent.last7DaysPerformance?.length === 7
      ? agent.last7DaysPerformance
      : agent.recentPerformance.slice(-7).map((v) => (v === 1 ? 0.85 : 0.35));

  const displayStatus = getStatusDisplay(status, mmStatus?.battle?.status);

  return (
    <motion.article
      initial={{ opacity: 0, y: 12, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ delay: index * 0.06, duration: 0.3 }}
      onClick={() => onSelect?.(agent)}
      className="glass rounded-xl p-4 sm:p-5 cursor-pointer neon-border-purple agent-card-hover group overflow-hidden min-w-0"
    >
      <div className="flex items-start justify-between gap-2 sm:gap-3 mb-3">
        <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1">
          <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-lg sm:rounded-xl border border-primary/30 flex items-center justify-center font-display text-sm sm:text-base font-bold text-primary bg-primary/10 group-hover:glow-purple transition-all shrink-0">
            {agent.avatar}
          </div>
          <div className="min-w-0 flex-1">
            <p className="font-display text-xs sm:text-sm font-bold text-foreground truncate">
              {agent.name}
            </p>
            <span
              className={`inline-block text-[10px] font-display font-bold px-1.5 sm:px-2 py-0.5 rounded mt-1 truncate max-w-full ${getStatusClass(
                status
              )}`}
            >
              {status === "queued" && <Loader2 className="w-3 h-3 inline animate-spin mr-1" />}
              {status === "matched" && <Clock className="w-3 h-3 inline mr-1" />}
              {status === "battling" && <Flame className="w-3 h-3 inline mr-1" />}
              {displayStatus}
            </span>
          </div>
        </div>
      </div>

      <div className="mb-3 sm:mb-4 min-w-0">
        <p className="text-[10px] font-display text-muted-foreground tracking-wider mb-1.5 flex items-center gap-1">
          <BarChart3 className="w-3 h-3 shrink-0" />
          LAST 7 DAYS
        </p>
        <div className="min-w-0 w-full">
          <PerformanceSparkline data={sparklineData} />
        </div>
      </div>

      <div className="grid grid-cols-2 sm:flex sm:flex-wrap gap-2">
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onViewLogs(agent);
          }}
          className="min-h-[44px] sm:min-h-0 flex-1 min-w-0 flex items-center justify-center gap-1 sm:gap-1.5 py-2.5 sm:py-2 rounded-lg text-[11px] sm:text-xs font-display font-medium bg-white/5 text-muted-foreground border border-white/10 hover:border-primary/30 hover:text-primary transition-all"
        >
          <FileText className="w-3 h-3 sm:w-3.5 sm:h-3.5 shrink-0" />
          <span className="truncate sm:inline hidden">View Logs</span>
        </button>
        <button
          type="button"
          disabled={isEntering || isInMatchmaking}
          onClick={(e) => {
            e.stopPropagation();
            onEnterArena(agent);
          }}
          className={`min-h-[44px] sm:min-h-0 flex-1 min-w-0 flex items-center justify-center gap-1 sm:gap-1.5 py-2.5 sm:py-2 rounded-lg text-[11px] sm:text-xs font-display font-medium transition-all
            ${isInMatchmaking 
              ? "bg-muted/30 text-muted-foreground border border-border cursor-not-allowed" 
              : "bg-primary/15 text-primary border border-primary/40 hover:glow-purple"
            }`}
        >
          {isEntering ? (
            <Loader2 className="w-3 h-3 sm:w-3.5 sm:h-3.5 shrink-0 animate-spin" />
          ) : (
            <Swords className="w-3 h-3 sm:w-3.5 sm:h-3.5 shrink-0" />
          )}
          <span className="truncate sm:inline hidden">
            {isInMatchmaking 
              ? status === "queued" 
                ? "In Queue..." 
                : status === "matched"
                ? "Match Found"
                : "Battling"
              : "Enter Arena"
            }
          </span>
        </button>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onEditConfig(agent);
          }}
          className="min-h-[44px] sm:min-h-0 col-span-2 sm:col-span-auto flex items-center justify-center gap-1 sm:gap-1.5 py-2.5 sm:py-2 px-3 rounded-lg text-[11px] sm:text-xs font-display font-medium bg-white/5 text-muted-foreground border border-white/10 hover:border-white/20 hover:text-foreground transition-all"
        >
          <Settings className="w-3 h-3 sm:w-3.5 sm:h-3.5 shrink-0" />
          Edit Config
        </button>
      </div>
    </motion.article>
  );
}
