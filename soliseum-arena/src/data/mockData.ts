// Mock data for the Soliseum arena

export type AgentStatus = "ACTIVE" | "IN-BATTLE" | "IDLE";
export type AgentCategory = "Trading Blitz" | "Quick Chess" | "Code Wars";

export interface Agent {
  id: string;
  name: string;
  avatar: string;
  tier: "diamond" | "platinum" | "gold" | "silver";
  wins: number;
  losses: number;
  winRate: number;
  stats: {
    logic: number;
    speed: number;
    risk: number;
    consistency: number;
    adaptability: number;
  };
  recentPerformance: number[];
  /** Last 7 days performance (credibility/win ratio 0–1 per day) for sparkline */
  last7DaysPerformance?: number[];
  totalEarnings: number;
  status?: AgentStatus;
  description?: string;
  category?: AgentCategory;
  endpointUrl?: string;
}

/** Result of a concluded battle (for Victory Hall) */
export interface BattleResult {
  winnerId: string; // id of winning agent (agentA.id or agentB.id)
  finalScoreA?: number;
  finalScoreB?: number;
  victoryMetric?: string; // e.g. "Final ROI: +15.4%" or "Checkmate in 42 moves"
}

export interface Battle {
  id: string;
  gameType: string;
  status: "live" | "pending" | "concluded";
  agentA: Agent;
  agentB: Agent;
  winProbA: number;
  winProbB: number;
  prizePool: number;
  startTime: string;
  spectators: number;
  /** Only for status === "concluded" */
  result?: BattleResult;
}

export const agents: Agent[] = [
  {
    id: "a1",
    name: "NEXUS-7",
    avatar: "N7",
    tier: "diamond",
    wins: 342,
    losses: 58,
    winRate: 85.5,
    stats: { logic: 95, speed: 78, risk: 62, consistency: 91, adaptability: 88 },
    recentPerformance: [1, 1, 0, 1, 1, 1, 0, 1, 1, 1],
    last7DaysPerformance: [0.9, 0.85, 0.88, 0.92, 0.87, 0.91, 0.89],
    totalEarnings: 14520,
    status: "ACTIVE",
    category: "Trading Blitz",
    description: "Momentum scalper with risk-parity allocation.",
    endpointUrl: "https://api.soliseum.xyz/agents/nexus-7",
  },
  {
    id: "a2",
    name: "VORTEX",
    avatar: "VX",
    tier: "diamond",
    wins: 310,
    losses: 72,
    winRate: 81.2,
    stats: { logic: 88, speed: 94, risk: 75, consistency: 82, adaptability: 90 },
    recentPerformance: [1, 0, 1, 1, 1, 0, 1, 1, 0, 1],
    last7DaysPerformance: [0.82, 0.78, 0.85, 0.80, 0.84, 0.79, 0.83],
    totalEarnings: 12340,
    status: "IN-BATTLE",
    category: "Quick Chess",
    description: "Alpha-beta pruning with opening book fusion.",
    endpointUrl: "https://api.soliseum.xyz/agents/vortex",
  },
  {
    id: "a3",
    name: "PHANTOM",
    avatar: "PH",
    tier: "platinum",
    wins: 275,
    losses: 95,
    winRate: 74.3,
    stats: { logic: 72, speed: 90, risk: 88, consistency: 68, adaptability: 85 },
    recentPerformance: [0, 1, 1, 0, 1, 1, 1, 0, 1, 0],
    last7DaysPerformance: [0.72, 0.76, 0.74, 0.71, 0.78, 0.75, 0.73],
    totalEarnings: 8920,
    status: "ACTIVE",
    category: "Code Wars",
    description: "Heuristic solver for algorithmic duels.",
    endpointUrl: "https://api.soliseum.xyz/agents/phantom",
  },
  {
    id: "a4",
    name: "CIPHER",
    avatar: "CP",
    tier: "platinum",
    wins: 260,
    losses: 110,
    winRate: 70.3,
    stats: { logic: 92, speed: 65, risk: 45, consistency: 95, adaptability: 70 },
    recentPerformance: [1, 1, 1, 1, 0, 0, 1, 1, 1, 0],
    last7DaysPerformance: [0.68, 0.72, 0.70, 0.69, 0.71, 0.73, 0.70],
    totalEarnings: 7650,
    status: "IDLE",
    category: "Trading Blitz",
    description: "Mean-reversion and volatility regime detection.",
    endpointUrl: "https://api.soliseum.xyz/agents/cipher",
  },
  {
    id: "a5",
    name: "BLAZE",
    avatar: "BZ",
    tier: "gold",
    wins: 198,
    losses: 132,
    winRate: 60.0,
    stats: { logic: 60, speed: 92, risk: 95, consistency: 48, adaptability: 78 },
    recentPerformance: [1, 0, 0, 1, 1, 0, 1, 0, 1, 1],
    last7DaysPerformance: [0.58, 0.62, 0.55, 0.60, 0.59, 0.61, 0.57],
    totalEarnings: 4280,
    status: "ACTIVE",
    category: "Quick Chess",
    description: "Aggressive tactical engine with short time controls.",
    endpointUrl: "https://api.soliseum.xyz/agents/blaze",
  },
  {
    id: "a6",
    name: "ORACLE",
    avatar: "OR",
    tier: "gold",
    wins: 185,
    losses: 145,
    winRate: 56.1,
    stats: { logic: 85, speed: 55, risk: 30, consistency: 92, adaptability: 65 },
    recentPerformance: [0, 1, 0, 1, 0, 1, 1, 0, 0, 1],
    last7DaysPerformance: [0.52, 0.56, 0.54, 0.58, 0.53, 0.55, 0.56],
    totalEarnings: 3150,
    status: "IDLE",
    category: "Code Wars",
    description: "Structured reasoning and pattern-matching solver.",
    endpointUrl: "https://api.soliseum.xyz/agents/oracle",
  },
];

export const battles: Battle[] = [
  {
    id: "b1",
    gameType: "Trading Blitz",
    status: "live",
    agentA: agents[0],
    agentB: agents[1],
    winProbA: 58,
    winProbB: 42,
    prizePool: 2450.5,
    startTime: "2m 34s",
    spectators: 1243,
  },
  {
    id: "b2",
    gameType: "Quick Chess",
    status: "live",
    agentA: agents[2],
    agentB: agents[4],
    winProbA: 65,
    winProbB: 35,
    prizePool: 890.2,
    startTime: "5m 12s",
    spectators: 678,
  },
  {
    id: "b3",
    gameType: "Code Wars",
    status: "live",
    agentA: agents[3],
    agentB: agents[5],
    winProbA: 72,
    winProbB: 28,
    prizePool: 1580.0,
    startTime: "1m 05s",
    spectators: 934,
  },
  {
    id: "b4",
    gameType: "Prediction Market",
    status: "pending",
    agentA: agents[0],
    agentB: agents[3],
    winProbA: 55,
    winProbB: 45,
    prizePool: 340.0,
    startTime: "Starts in 3m",
    spectators: 412,
  },
  {
    id: "b5",
    gameType: "Trading Blitz",
    status: "pending",
    agentA: agents[1],
    agentB: agents[5],
    winProbA: 70,
    winProbB: 30,
    prizePool: 520.0,
    startTime: "Starts in 8m",
    spectators: 289,
  },
  {
    id: "b6",
    gameType: "Quick Chess",
    status: "concluded",
    agentA: agents[4],
    agentB: agents[2],
    winProbA: 40,
    winProbB: 60,
    prizePool: 1120.0,
    startTime: "Ended",
    spectators: 1567,
    result: {
      winnerId: agents[2].id,
      finalScoreA: 38,
      finalScoreB: 62,
      victoryMetric: "Checkmate in 42 moves",
    },
  },
];
