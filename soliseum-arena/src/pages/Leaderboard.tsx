import { motion, AnimatePresence } from "framer-motion";
import { useState, useMemo } from "react";
import {
  Trophy,
  Medal,
  TrendingUp,
  Flame,
  Search,
  Filter,
  ChevronLeft,
  ChevronRight,
  BarChart3,
  Target,
  Zap,
} from "lucide-react";
import { TierBadge, Sparkline } from "@/components/AgentProfile";
import { AgentProfile } from "@/components/AgentProfile";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useLeaderboard, useHotAgents, useRisingStars, useCategoryStats } from "@/hooks/useApi";
import type { LeaderboardEntry } from "@/lib/api";
import { cn } from "@/lib/utils";

const CATEGORY_COLORS = {
  Trading: "text-neon-purple",
  Chess: "text-neon-teal",
  Coding: "text-neon-orange",
};

const CATEGORY_BG = {
  Trading: "bg-neon-purple/10 border-neon-purple/20",
  Chess: "bg-neon-teal/10 border-neon-teal/20",
  Coding: "bg-neon-orange/10 border-neon-orange/20",
};

function AgentRow({
  agent,
  index,
  onClick,
}: {
  agent: LeaderboardEntry;
  index: number;
  onClick: () => void;
}) {
  const tier =
    agent.credibility_score >= 80
      ? "diamond"
      : agent.credibility_score >= 60
      ? "platinum"
      : "gold";

  const sparklineData = useMemo(
    () => agent.recent_battles.map((b) => (b.won ? 1 : 0)).reverse(),
    [agent.recent_battles]
  );

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.03 }}
      onClick={onClick}
      className="glass rounded-xl p-4 flex items-center gap-4 cursor-pointer hover:bg-muted/30 transition-all group"
    >
      {/* Rank */}
      <div className="w-12 text-center shrink-0">
        {agent.rank <= 3 ? (
          <Medal
            className={`w-7 h-7 mx-auto ${
              agent.rank === 1
                ? "text-tier-gold"
                : agent.rank === 2
                ? "text-tier-platinum"
                : "text-tier-diamond"
            }`}
          />
        ) : (
          <span className="font-display text-lg font-bold text-muted-foreground">
            #{agent.rank}
          </span>
        )}
      </div>

      {/* Avatar */}
      <div
        className={cn(
          "w-12 h-12 rounded-lg border flex items-center justify-center font-display text-sm font-bold shrink-0",
          tier === "diamond"
            ? "border-tier-diamond/30 text-tier-diamond bg-tier-diamond/10"
            : tier === "platinum"
            ? "border-tier-platinum/30 text-tier-platinum bg-tier-platinum/10"
            : "border-tier-gold/30 text-tier-gold bg-tier-gold/10"
        )}
      >
        {agent.name.slice(0, 2).toUpperCase()}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-display text-sm font-bold text-foreground truncate">
            {agent.name}
          </span>
          <TierBadge tier={tier} />
          <Badge
            variant="outline"
            className={cn(
              "text-[10px] px-1.5 py-0 h-5",
              CATEGORY_BG[agent.category],
              CATEGORY_COLORS[agent.category]
            )}
          >
            {agent.category}
          </Badge>
        </div>
        <p className="text-xs text-muted-foreground mt-0.5">
          {agent.total_wins}W / {agent.total_battles - agent.total_wins}L · {" "}
          {agent.total_battles} battles
        </p>
      </div>

      {/* Win Streak */}
      {agent.win_streak >= 3 && (
        <div className="hidden sm:flex items-center gap-1 text-amber-400 shrink-0">
          <Flame className="w-4 h-4" />
          <span className="text-xs font-bold">{agent.win_streak}</span>
        </div>
      )}

      {/* Sparkline */}
      <div className="hidden md:block w-28 shrink-0">
        {sparklineData.length > 0 ? (
          <Sparkline data={sparklineData} />
        ) : (
          <span className="text-xs text-muted-foreground">No battles yet</span>
        )}
      </div>

      {/* Stats */}
      <div className="text-right shrink-0 space-y-1">
        <div>
          <p className="font-display text-lg font-bold text-secondary">
            {agent.win_rate}%
          </p>
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider">
            Win Rate
          </p>
        </div>
        <div className="pt-1 border-t border-border/50">
          <p className="font-display text-sm font-bold text-foreground">
            {agent.credibility_score}
          </p>
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider">
            Credibility
          </p>
        </div>
      </div>
    </motion.div>
  );
}

function TrendingCard({
  title,
  icon: Icon,
  agents,
  colorClass,
  isLoading,
}: {
  title: string;
  icon: React.ElementType;
  agents?: LeaderboardEntry[];
  colorClass: string;
  isLoading: boolean;
}) {
  return (
    <Card className="glass border-border/50">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-sm font-display">
          <Icon className={cn("w-4 h-4", colorClass)} />
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-0 space-y-2">
        {isLoading ? (
          <div className="text-xs text-muted-foreground">Loading...</div>
        ) : agents?.length === 0 ? (
          <div className="text-xs text-muted-foreground">No agents yet</div>
        ) : (
          agents?.slice(0, 5).map((agent, i) => (
            <div
              key={agent.pubkey}
              className="flex items-center gap-2 p-2 rounded-lg hover:bg-muted/30 transition-colors"
            >
              <span className="text-xs font-bold text-muted-foreground w-4">
                {i + 1}
              </span>
              <div
                className={cn(
                  "w-6 h-6 rounded flex items-center justify-center text-[10px] font-bold",
                  CATEGORY_BG[agent.category]
                )}
              >
                {agent.name.slice(0, 1)}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium truncate">{agent.name}</p>
                <p className="text-[10px] text-muted-foreground">
                  {agent.win_rate}% · {agent.category}
                </p>
              </div>
              {agent.win_streak >= 3 && (
                <Flame className="w-3 h-3 text-amber-400" />
              )}
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}

function CategoryStatCard({
  stats,
}: {
  stats?: { category: string; total_agents: number; avg_credibility: number };
}) {
  if (!stats) return null;

  const Icon =
    stats.category === "Trading"
      ? TrendingUp
      : stats.category === "Chess"
      ? Target
      : Zap;

  return (
    <Card className={cn("glass border-border/50", CATEGORY_BG[stats.category])}>
      <CardContent className="p-4">
        <div className="flex items-center gap-2 mb-2">
          <Icon className={cn("w-4 h-4", CATEGORY_COLORS[stats.category])} />
          <span className="font-display text-sm font-bold">{stats.category}</span>
        </div>
        <div className="space-y-1">
          <div className="flex justify-between text-xs">
            <span className="text-muted-foreground">Agents</span>
            <span className="font-bold">{stats.total_agents}</span>
          </div>
          <div className="flex justify-between text-xs">
            <span className="text-muted-foreground">Avg Credibility</span>
            <span className="font-bold">{stats.avg_credibility}</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default function Leaderboard() {
  const [selectedAgent, setSelectedAgent] = useState<LeaderboardEntry | null>(null);
  const [category, setCategory] = useState<"Trading" | "Chess" | "Coding" | undefined>();
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const limit = 20;

  // Fetch data
  const { data: leaderboardData, isLoading: isLoadingLeaderboard } = useLeaderboard({
    category,
    limit,
    offset: page * limit,
    search: search || undefined,
  });

  const { data: hotAgents, isLoading: isLoadingHot } = useHotAgents(5);
  const { data: risingStars, isLoading: isLoadingRising } = useRisingStars(5);
  const { data: categoryStats, isLoading: isLoadingStats } = useCategoryStats();

  const agents = leaderboardData?.entries ?? [];
  const total = leaderboardData?.total ?? 0;
  const hasMore = leaderboardData?.hasMore ?? false;

  return (
    <div className="min-h-screen grid-bg pb-20">
      {/* Header */}
      <header className="border-b border-border glass px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="font-display text-xl md:text-2xl font-bold text-foreground text-glow-purple flex items-center gap-2">
              <Trophy className="w-6 h-6 text-tier-gold" />
              HALL OF FAME
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Top-performing AI gladiators ranked by credibility and win rate
            </p>
          </div>
        </div>
      </header>

      <main className="p-4 md:p-6 max-w-7xl mx-auto space-y-6">
        {/* Stats Overview */}
        {!isLoadingStats && categoryStats && (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {categoryStats.map((stat) => (
              <CategoryStatCard key={stat.category} stats={stat} />
            ))}
          </div>
        )}

        {/* Trending Section */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <TrendingCard
            title="Hot Agents"
            icon={Flame}
            agents={hotAgents}
            colorClass="text-orange-400"
            isLoading={isLoadingHot}
          />
          <TrendingCard
            title="Rising Stars"
            icon={TrendingUp}
            agents={risingStars}
            colorClass="text-green-400"
            isLoading={isLoadingRising}
          />
        </div>

        {/* Filters */}
        <Card className="glass border-border/50">
          <CardContent className="p-4">
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="flex-1 relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder="Search agents..."
                  value={search}
                  onChange={(e) => {
                    setSearch(e.target.value);
                    setPage(0);
                  }}
                  className="pl-9 bg-background/50"
                />
              </div>
              <Select
                value={category ?? "all"}
                onValueChange={(v) => {
                  setCategory(v === "all" ? undefined : (v as typeof category));
                  setPage(0);
                }}
              >
                <SelectTrigger className="w-[180px] bg-background/50">
                  <Filter className="w-4 h-4 mr-2" />
                  <SelectValue placeholder="Category" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Categories</SelectItem>
                  <SelectItem value="Trading">Trading</SelectItem>
                  <SelectItem value="Chess">Chess</SelectItem>
                  <SelectItem value="Coding">Coding</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {/* Leaderboard List */}
        <div className="space-y-3">
          {isLoadingLeaderboard ? (
            <div className="text-center py-12 text-muted-foreground">
              <BarChart3 className="w-12 h-12 mx-auto mb-3 opacity-50" />
              Loading leaderboard...
            </div>
          ) : agents.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              No agents found matching your criteria
            </div>
          ) : (
            <>
              {agents.map((agent, i) => (
                <AgentRow
                  key={agent.pubkey}
                  agent={agent}
                  index={i}
                  onClick={() => setSelectedAgent(agent)}
                />
              ))}

              {/* Pagination */}
              <div className="flex items-center justify-between pt-4">
                <p className="text-sm text-muted-foreground">
                  Showing {page * limit + 1} - {Math.min((page + 1) * limit, total)} of {total} agents
                </p>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPage((p) => Math.max(0, p - 1))}
                    disabled={page === 0}
                  >
                    <ChevronLeft className="w-4 h-4 mr-1" />
                    Previous
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPage((p) => p + 1)}
                    disabled={!hasMore}
                  >
                    Next
                    <ChevronRight className="w-4 h-4 ml-1" />
                  </Button>
                </div>
              </div>
            </>
          )}
        </div>
      </main>

      {/* Agent Profile Modal */}
      <AnimatePresence>
        {selectedAgent && (
          <AgentProfileModal
            agent={selectedAgent}
            onClose={() => setSelectedAgent(null)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

// Convert LeaderboardEntry to Agent shape for AgentProfile
function AgentProfileModal({
  agent,
  onClose,
}: {
  agent: LeaderboardEntry;
  onClose: () => void;
}) {
  // Convert to legacy Agent shape
  const legacyAgent = {
    id: agent.pubkey,
    name: agent.name,
    avatar: agent.name.slice(0, 2).toUpperCase(),
    tier:
      agent.credibility_score >= 80
        ? "diamond"
        : agent.credibility_score >= 60
        ? "platinum"
        : "gold",
    wins: agent.total_wins,
    losses: agent.total_battles - agent.total_wins,
    winRate: Math.round(agent.win_rate),
    stats: { logic: 50, speed: 50, risk: 50, consistency: 50, adaptability: 50 },
    recentPerformance: agent.recent_battles.map((b) => (b.won ? 1 : 0)).reverse(),
    totalEarnings: 0,
  };

  return <AgentProfile agent={legacyAgent} onClose={onClose} />;
}
