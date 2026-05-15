import { AIAgent, Asset } from "./lib/utils/types";
import jezImg from "./assets/Jez.jpg";
import joshImg from "./assets/Josh.jpg";
import stefanImg from "./assets/Stefan.jpg";
import jahidImg from "./assets/jahid.jpg";

export interface AssetConfig {
  id: Asset;
  symbol: string;
  name: string;
  color: string;
  logo: string;
}

export const ASSETS: AssetConfig[] = [
  { 
    id: Asset.BTC, 
    symbol: "BTC", 
    name: "Bitcoin", 
    color: "#F7931A",
    logo: "https://assets.coingecko.com/coins/images/1/small/bitcoin.png"
  },
  { 
    id: Asset.ETH, 
    symbol: "ETH", 
    name: "Ethereum", 
    color: "#627EEA",
    logo: "https://assets.coingecko.com/coins/images/279/small/ethereum.png"
  },
  { 
    id: Asset.SOL, 
    symbol: "SOL", 
    name: "Solana", 
    color: "#14F195",
    logo: "https://assets.coingecko.com/coins/images/4128/small/solana.png"
  }
];

export const AI_AGENTS: AIAgent[] = [
  {
    id: "alpha",
    name: "Jez",
    type: "Balanced",
    description: "Neutral probability-based decision engine. The standard for stable performance.",
    avatar: jezImg,
    behavior: "balanced",
    color: "#00FF88"
  },
  {
    id: "risk",
    name: "Josh",
    type: "Aggressive",
    description: "Volatility-seeking intelligence. Erratic but offers high-stakes rewards.",
    avatar: joshImg,
    behavior: "aggressive",
    color: "#FF4444"
  },
  {
    id: "safe",
    name: "Stefan",
    type: "Conservative",
    description: "Stable, trend-following logic. High consistency with lower but reliable gains.",
    avatar: stefanImg,
    behavior: "conservative",
    color: "#4488FF"
  },
  {
    id: "lose",
    name: "Jahid",
    type: "Unpredictable",
    description: "The legendary predictor. Known for bold moves that often defy market logic. High entertainment value.",
    avatar: jahidImg,
    behavior: "aggressive",
    color: "#FFBD44"
  }
];

export const XP_THRESHOLDS = [
  { level: 1, title: "Dunce", xp: 0 },
  { level: 2, title: "Bitty", xp: 100 },
  { level: 3, title: "Ritty", xp: 200 },
  { level: 4, title: "Ritualist", xp: 300 },
  { level: 5, title: "Radiant Ritualist", xp: 5000 }
];

export const REWARDS = {
  WIN: 20,
  DRAW: 10,
  LOSS: 5,
  CHECK_IN: 25,
  STREAK_2: 5,
  STREAK_5: 15
};
