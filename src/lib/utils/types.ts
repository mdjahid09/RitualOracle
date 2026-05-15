export enum Prediction {
  UP = "UP",
  DOWN = "DOWN"
}

export enum Asset {
  BTC = "BTC",
  ETH = "ETH",
  SOL = "SOL"
}

export enum Outcome {
  WIN = "WIN",
  LOSS = "LOSS",
  DRAW = "DRAW"
}

export interface AIAgent {
  id: string;
  name: string;
  type: string;
  description: string;
  avatar: string;
  behavior: "balanced" | "aggressive" | "conservative";
  color: string;
  stats?: AgentStats;
}

export interface AgentStats {
  wins: number;
  losses: number;
  draws: number;
}

export interface GameState {
  xp: number;
  level: number;
  streak: number;
  totalWins: number;
  totalLosses: number;
  totalDraws: number;
  lastCheckIn?: number;
  badges: string[];
  agentStats?: Record<string, AgentStats>;
}

export interface PredictionRound {
  asset: Asset;
  userChoice: Prediction;
  agentChoice: Prediction;
  outcome: Outcome;
  xpAwarded: number;
  streakBonus: number;
  startPrice: number;
  endPrice: number;
}
