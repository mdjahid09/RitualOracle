import { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Wallet, 
  Trophy, 
  User, 
  Zap, 
  ChevronRight, 
  CheckCircle2, 
  ArrowUp, 
  ArrowDown, 
  Gamepad2,
  TrendingUp,
  History,
  ShieldCheck,
  Flame,
  Coins,
  Loader2,
  X,
  Minus
} from 'lucide-react';
import { cn } from './lib/utils';
import { AI_AGENTS, REWARDS, XP_THRESHOLDS, ASSETS } from './constants';
import { Prediction, Outcome, AIAgent, GameState, PredictionRound, Asset } from './lib/utils/types';
import RealTimeChart from './components/RealTimeChart';
import logo from './assets/logo.jpg';
import { supabase } from './lib/supabase';
import { 
  WagmiProvider, 
  useAccount, 
  useConnect, 
  useDisconnect, 
  useSendTransaction, 
  useBalance,
  useWaitForTransactionReceipt
} from 'wagmi';
import { 
  RainbowKitProvider, 
  darkTheme,
  useConnectModal
} from '@rainbow-me/rainbowkit';
import '@rainbow-me/rainbowkit/styles.css';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { config, ritualTestnet } from './lib/wagmi';
import { formatUnits, parseEther } from 'viem';
import { reconnect } from '@wagmi/core';

const queryClient = new QueryClient();

// Real Wallet Hook using Wagmi
function useWallet() {
  const { address, isConnected } = useAccount();
  const { connectors } = useConnect();
  const { disconnect } = useDisconnect();
  const { data: balance } = useBalance({ address });
  const { data: ritualBalance } = useBalance({ 
    address, 
    chainId: ritualTestnet.id 
  });

  return { 
    address, 
    connectors,
    disconnect, 
    isConnected,
    balance: balance ? formatUnits(balance.value, balance.decimals) : '0',
    symbol: balance?.symbol || 'RITUAL',
    ritualBalance: ritualBalance ? formatUnits(ritualBalance.value, ritualBalance.decimals) : '0',
    ritualSymbol: ritualBalance?.symbol || 'RITUAL'
  };
}

function MainApp() {
  const wallet = useWallet();
  const { address, isConnected } = wallet;
  const { openConnectModal, connectModalOpen } = useConnectModal();

  useEffect(() => {
    reconnect(config);
  }, []);
  const [view, setView] = useState<'game' | 'agents' | 'profile'>('game');
  const [selectedAgent, setSelectedAgent] = useState<AIAgent>(AI_AGENTS[0]);

  const [gameState, setGameState] = useState<GameState>(() => ({
    xp: 0,
    level: 1,
    streak: 0,
    totalWins: 0,
    totalLosses: 0,
    totalDraws: 0,
    badges: []
  }));

  // Upsert Player to Supabase
  const upsertPlayer = async (stats: { xp: number, wins: number, losses: number, draws: number }) => {
    if (!address) {
      console.warn('Leaderboard: No wallet connected, skipping upsert.');
      return;
    }
    if (!supabase) {
      console.error('Leaderboard: Supabase client not initialized, skipping upsert.');
      return;
    }
    
    try {
      console.log(`Leaderboard: Upserting stats for ${address}...`, stats);
      const { data, error } = await supabase
        .from('players')
        .upsert({
          wallet: address,
          xp: stats.xp,
          wins: stats.wins,
          losses: stats.losses,
          draws: stats.draws
        }, { onConflict: 'wallet' });

      if (error) {
        console.error('Leaderboard: Upsert error:', error);
        throw error;
      }
      console.log('Leaderboard: Stats successfully synced with global database.');
    } catch (err) {
      console.error('Leaderboard: Unhandled error during upsert:', err);
    }
  };

  // Load user data from localStorage or Supabase on connect
  useEffect(() => {
    const fetchUserData = async () => {
      if (!address) {
        console.log('Profile: No wallet connected, using local/empty state.');
        setGameState({
          xp: 0,
          level: 1,
          streak: 0,
          totalWins: 0,
          totalLosses: 0,
          totalDraws: 0,
          badges: []
        });
        return;
      }

      // 1. Try Loading from localStorage first (requested behavior)
      const storageKey = `ritual-stats-${address}`;
      const savedStats = localStorage.getItem(storageKey);
      
      if (savedStats) {
        try {
          const parsedStats = JSON.parse(savedStats);
          console.log('Profile: Stats loaded from localStorage:', parsedStats);
          setGameState(parsedStats);
          // We still want to sync with Supabase in the background if possible, 
          // but we prioritize showing local data immediately.
        } catch (e) {
          console.error('Profile: Error parsing localStorage stats:', e);
        }
      }

      // 2. Fetch from Supabase as fallback/sync
      if (!supabase) {
        console.warn('Profile: Supabase client not initialized, skipping remote sync.');
        return;
      }
      
      try {
        console.log(`Profile: Fetching data from Supabase for ${address}...`);
        const { data, error } = await supabase
          .from('players')
          .select('*')
          .eq('wallet', address)
          .single();

        if (error && error.code !== 'PGRST116') {
          console.error('Profile: Supabase Fetch error:', error);
          throw error;
        }

        if (data) {
          console.log('Profile: Remote data fetched successfully:', data);
          setGameState(prev => {
            // Only update if remote data is "newer" or local was empty
            // For simplicity, we merge or prefer remote if local was not found
            if (!savedStats) {
              return {
                ...prev,
                xp: data.xp,
                totalWins: data.wins,
                totalLosses: data.losses,
                totalDraws: data.draws,
              };
            }
            return prev;
          });
        }
      } catch (err) {
        console.error('Profile: Unhandled remote fetch error:', err);
      }
    };

    fetchUserData();
  }, [address]);

  // Persist gameState to localStorage whenever it changes
  useEffect(() => {
    if (address && gameState.xp !== undefined) {
      const storageKey = `ritual-stats-${address}`;
      localStorage.setItem(storageKey, JSON.stringify(gameState));
    }
  }, [gameState, address]);

  const [isPredicting, setIsPredicting] = useState(false);
  const [currentRound, setCurrentRound] = useState<PredictionRound | null>(null);
  const [selectedAsset, setSelectedAsset] = useState(ASSETS[0]);
  const [lastPriceTrend, setLastPriceTrend] = useState<'up' | 'down'>(Math.random() > 0.5 ? 'up' : 'down');
  
  // New Timing & Price States
  const [timeLeft, setTimeLeft] = useState(0);
  const [startPrice, setStartPrice] = useState(0);
  const [currentPrice, setCurrentPrice] = useState(0);
  const [pendingChoice, setPendingChoice] = useState<Prediction | null>(null);

  // Mock Price Generation
  const getBasePrice = (asset: Asset) => {
    switch(asset) {
      case Asset.BTC: return 64000 + Math.random() * 500;
      case Asset.ETH: return 3200 + Math.random() * 50;
      case Asset.SOL: return 145 + Math.random() * 5;
      default: return 100;
    }
  };

  useEffect(() => {
    // Initial Price
    const initialPrice = getBasePrice(selectedAsset.id);
    setCurrentPrice(initialPrice);
  }, [selectedAsset]);

  // Price Simulation Feed
  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentPrice(prev => {
        const volatility = selectedAsset.id === Asset.SOL ? 0.0005 : 0.0002;
        const drift = lastPriceTrend === 'up' ? 0.0001 : -0.0001;
        const change = prev * (drift + (Math.random() - 0.5) * volatility);
        return prev + change;
      });
      
      if (Math.random() > 0.8) {
        setLastPriceTrend(Math.random() > 0.5 ? 'up' : 'down');
      }
    }, 2000);
    return () => clearInterval(interval);
  }, [selectedAsset, lastPriceTrend]);

  // Timer Countdown Effect
  useEffect(() => {
    let interval: any;
    if (timeLeft > 0) {
      interval = setInterval(() => {
        setTimeLeft(prev => prev - 1);
      }, 1000);
    } else if (timeLeft === 0 && isPredicting) {
      resolveRound();
    }
    return () => clearInterval(interval);
  }, [timeLeft, isPredicting]);

  useEffect(() => {
    // Session-based streak management
    if (isPredicting) return;
  }, [gameState.streak]);

  const levelInfo = useMemo(() => {
    const current = XP_THRESHOLDS.find(t => t.level === gameState.level) || XP_THRESHOLDS[0];
    const next = XP_THRESHOLDS.find(t => t.level === gameState.level + 1);
    return { current, next };
  }, [gameState.level]);

  const levelProgress = useMemo(() => {
    if (!levelInfo.next) return 100;
    const totalNeeded = levelInfo.next.xp - levelInfo.current.xp;
    const currentGained = gameState.xp - levelInfo.current.xp;
    return Math.min(100, (currentGained / totalNeeded) * 100);
  }, [gameState.xp, levelInfo]);

  // New Transaction States
  const { sendTransaction, data: hash, error: txError, isPending: isTxPending } = useSendTransaction();
  const { isLoading: isConfirming, isSuccess: isConfirmed } = useWaitForTransactionReceipt({ hash });

  const handlePrediction = async (prediction: Prediction) => {
    if (!isConnected) {
      if (openConnectModal) {
        openConnectModal();
      }
      return;
    }
    
    // Check balance (simple check)
    if (parseFloat(wallet.balance) < 0.0001) {
      alert("Insufficient Balance: You need at least 0.0001 RITUAL to play.");
      return;
    }

    try {
      // Trigger Onchain Transaction
      // Sending 0.0001 RITUAL to the specified fee collector address
      sendTransaction({
        to: '0x9BFe6fbd4B1318070DD502dBbE656AAbE4705880',
        value: parseEther('0.0001'),
      });
      
      setPendingChoice(prediction);
    } catch (e) {
      console.error("Transaction failed", e);
    }
  };

  // Start round only after transaction confirmation
  useEffect(() => {
    if (isConfirmed && pendingChoice && !isPredicting) {
      setStartPrice(currentPrice);
      setIsPredicting(true);
      setTimeLeft(15); 
      setCurrentRound(null);
    }
  }, [isConfirmed, pendingChoice, isPredicting, currentPrice]);

  const resolveRound = () => {
    // Agent logic
    const rand = Math.random();
    let agentChoice: Prediction;
    if (selectedAgent.behavior === 'balanced') {
      agentChoice = rand > 0.5 ? Prediction.UP : Prediction.DOWN;
    } else if (selectedAgent.behavior === 'aggressive') {
      const threshold = selectedAsset.id === Asset.SOL ? 0.8 : 0.7;
      agentChoice = rand > threshold ? Prediction.UP : Prediction.DOWN;
    } else {
      const threshold = selectedAsset.id === Asset.BTC ? 0.2 : 0.3;
      agentChoice = rand > threshold ? Prediction.UP : Prediction.DOWN;
    }

    const endPrice = currentPrice;
    let outcome: Outcome;
    if (endPrice > startPrice) {
      outcome = pendingChoice === Prediction.UP ? Outcome.WIN : (agentChoice === Prediction.UP ? Outcome.LOSS : Outcome.DRAW);
    } else if (endPrice < startPrice) {
      outcome = pendingChoice === Prediction.DOWN ? Outcome.WIN : (agentChoice === Prediction.DOWN ? Outcome.LOSS : Outcome.DRAW);
    } else {
      outcome = Outcome.DRAW;
    }

    let xpGained = outcome === Outcome.WIN ? REWARDS.WIN : (outcome === Outcome.DRAW ? REWARDS.DRAW : REWARDS.LOSS);
    
    const newStreak = outcome === Outcome.WIN ? gameState.streak + 1 : 0;
    let streakBonus = 0;
    if (newStreak === 2) streakBonus = REWARDS.STREAK_2;
    if (newStreak === 5) streakBonus = REWARDS.STREAK_5;

    const totalXp = gameState.xp + xpGained + streakBonus;
    
    // Check level up
    let newLevel = gameState.level;
    while (true) {
      const nextThreshold = XP_THRESHOLDS.find(t => t.level === newLevel + 1);
      if (nextThreshold && totalXp >= nextThreshold.xp) {
        newLevel += 1;
      } else {
        break;
      }
    }

    // Badge triggers
    const newBadges = [...gameState.badges];
    if (newStreak >= 3 && !newBadges.includes('Streak Master')) newBadges.push('Streak Master');
    if (newLevel >= 3 && !newBadges.includes('Veteran Predictor')) newBadges.push('Veteran Predictor');

    const newAgentStats = { ...(gameState.agentStats || {}) };
    const currentAgentStat = newAgentStats[selectedAgent.id] || { wins: 0, losses: 0, draws: 0 };
    
    if (outcome === Outcome.WIN) {
      currentAgentStat.losses += 1;
    } else if (outcome === Outcome.LOSS) {
      currentAgentStat.wins += 1;
    } else {
      currentAgentStat.draws += 1;
    }
    
    newAgentStats[selectedAgent.id] = currentAgentStat;

    const totalWins = outcome === Outcome.WIN ? gameState.totalWins + 1 : gameState.totalWins;
    const totalLosses = outcome === Outcome.LOSS ? (gameState.totalLosses || 0) + 1 : (gameState.totalLosses || 0);
    const totalDraws = outcome === Outcome.DRAW ? (gameState.totalDraws || 0) + 1 : (gameState.totalDraws || 0);

    setGameState(prev => ({
      ...prev,
      xp: totalXp,
      streak: newStreak,
      level: newLevel,
      totalWins,
      totalLosses,
      totalDraws,
      badges: newBadges,
      agentStats: newAgentStats
    }));

    // Update Global Leaderboard via Supabase
    if (address) {
      upsertPlayer({
        xp: totalXp,
        wins: totalWins,
        losses: totalLosses,
        draws: totalDraws
      });
    }

    setCurrentRound({
      asset: selectedAsset.id,
      userChoice: pendingChoice!,
      agentChoice,
      outcome,
      xpAwarded: xpGained,
      streakBonus,
      startPrice,
      endPrice
    });
    
    setIsPredicting(false);
    setPendingChoice(null);
  };

  const Nav = () => {
    if (currentRound || isPredicting || isTxPending || isConfirming || connectModalOpen) return null;
    return (
      <nav className="fixed bottom-0 left-0 right-0 z-50 px-4 sm:px-6 pb-4 sm:pb-6 pt-2 h-20 sm:h-24">
        <div className="max-w-md mx-auto h-full glass flex items-center justify-around ritual-glow shadow-2xl">
          <NavButton active={view === 'game'} onClick={() => setView('game')} icon={<Gamepad2 size={20} className="sm:w-6 sm:h-6" />} label="Play" />
          <NavButton active={view === 'agents'} onClick={() => setView('agents')} icon={<TrendingUp size={20} className="sm:w-6 sm:h-6" />} label="Agents" />
          <NavButton active={view === 'profile'} onClick={() => setView('profile')} icon={<User size={20} className="sm:w-6 sm:h-6" />} label="Stats" />
        </div>
      </nav>
    );
  };

  return (
    <div className="min-h-screen bg-black overflow-x-hidden pb-24">
      {/* Background Glow */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden h-full w-full">
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-primary/10 rounded-full blur-[120px]" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-blue-500/10 rounded-full blur-[120px]" />
      </div>

      <header className="relative z-10 px-4 sm:px-6 py-4 sm:py-6 flex items-center justify-between max-w-4xl lg:max-w-6xl mx-auto">
        <div className="flex items-center gap-2 sm:gap-3">
          <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-lg sm:rounded-xl bg-primary flex items-center justify-center ritual-glow-strong overflow-hidden shrink-0">
            <img src={logo} alt="Ritual Logo" className="w-full h-full object-cover" />
          </div>
          <div>
            <h1 className="text-lg sm:text-xl font-bold tracking-tight">RitualOracle</h1>
            <p className="text-[8px] sm:text-[10px] text-primary font-mono tracking-widest uppercase">Ritual Testnet</p>
          </div>
        </div>

        <div className="flex items-center gap-2 sm:gap-4">
          {isConnected ? (
            <div className="flex items-center gap-1.5 bg-white/5 border border-white/10 rounded-2xl p-1 pr-3 shadow-2xl ritual-glow-strong">
              <div className="flex flex-col items-end px-3 py-1 border-r border-white/5">
                <p className="text-[7px] sm:text-[8px] text-primary/60 uppercase tracking-widest font-mono leading-none mb-1">Ritual Balance</p>
                <p className="text-[10px] sm:text-xs font-bold text-primary italic leading-none whitespace-nowrap ritual-glow-text">
                  {parseFloat(wallet.ritualBalance).toFixed(4)} {wallet.ritualSymbol}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button 
                  onClick={() => wallet.disconnect()}
                  className="flex items-center gap-2 pl-2 pr-1 py-1 rounded-xl hover:bg-white/5 transition-colors group"
                >
                  <span className="hidden sm:inline text-[10px] font-mono font-bold text-white/60 group-hover:text-primary transition-colors">
                    {address?.slice(0, 6)}...{address?.slice(-4)}
                  </span>
                  <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-primary flex items-center justify-center border border-primary/20 shrink-0 ritual-glow transition-transform group-active:scale-95">
                    <User size={14} className="text-black" />
                  </div>
                </button>
              </div>
            </div>
          ) : (
            <button 
              onClick={() => openConnectModal?.()}
              className="px-4 sm:px-8 py-2 rounded-xl text-xs sm:text-sm font-black uppercase tracking-[0.2em] transition-all h-10 sm:h-12 bg-white text-black hover:bg-primary shadow-[0_0_30px_rgba(255,255,255,0.1)] flex items-center gap-3 active:scale-95"
            >
              <Wallet size={18} />
              Connect
            </button>
          )}
        </div>
      </header>

      <main className="relative z-10 max-w-4xl lg:max-w-6xl mx-auto px-4 sm:px-6 py-4 pb-12">
        <AnimatePresence mode="wait">
          {view === 'game' && (
            <motion.div
              key="game"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="h-full w-full"
            >
              {/* Responsive Parent: Stack on mobile, Split on Desktop */}
              <div className="flex flex-col lg:grid lg:grid-cols-[1fr_320px] gap-4 lg:gap-6">
                
                {/* LEFT COLUMN: Chart and Monitoring */}
                <div className="space-y-4 lg:space-y-6">
                  {/* Top Stats Bar - Desktop Optimization */}
                  <div className="flex items-center justify-between glass p-4 ritual-glow">
                    <div className="flex items-center gap-3">
                      <div className="relative">
                        <div className="w-10 h-10 rounded-full border border-primary overflow-hidden p-0.5">
                          <img src={selectedAgent.avatar} alt="Agent" className="w-full h-full rounded-full" />
                        </div>
                        <div className="absolute -bottom-1 -right-1 w-4 h-4 bg-black border border-primary rounded-full flex items-center justify-center">
                          <ShieldCheck size={10} className="text-primary" />
                        </div>
                      </div>
                      <div>
                        <h3 className="font-bold text-xs">{selectedAgent.name}</h3>
                        <p className="text-[10px] text-white/40 uppercase tracking-widest font-mono">Opponent</p>
                      </div>
                    </div>

                    <div className="flex items-center gap-6">
                      <div className="text-center hidden sm:block">
                        <p className="text-[9px] text-white/40 uppercase tracking-widest font-mono mb-0.5">Price Target</p>
                        <p className="text-sm font-bold text-primary ritual-glow-text">
                           ${currentPrice.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                        </p>
                      </div>
                      <div className="text-center">
                        <p className="text-[9px] text-white/40 uppercase tracking-widest font-mono mb-0.5">Timer</p>
                        <div className={cn(
                          "text-sm font-black font-mono transition-colors",
                          isPredicting ? "text-primary ritual-glow-text" : "text-white/40"
                        )}>
                          {isPredicting ? `${timeLeft}s` : "00:15"}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* The Chart - Elevated for Desktop */}
                  <div className="relative group">
                    <RealTimeChart asset={selectedAsset} />
                    <div className="absolute top-4 right-4 pointer-events-none">
                      <div className="px-3 py-1.5 rounded-lg bg-black/60 backdrop-blur-md border border-white/10 flex items-center gap-2">
                        <div className={cn("w-2 h-2 rounded-full animate-pulse", lastPriceTrend === 'up' ? "bg-primary" : "bg-red-500")} />
                        <span className="text-[10px] font-mono text-white/80 uppercase tracking-widest italic">{lastPriceTrend}</span>
                      </div>
                    </div>
                  </div>

                  {/* XP Progress - Wide on Desktop */}
                  <div className="glass p-5 h-fit w-full">
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <Trophy size={14} className="text-primary" />
                        <span className="text-[10px] font-bold uppercase tracking-widest text-primary italic">{levelInfo.current.title}</span>
                      </div>
                      <span className="text-[10px] font-mono text-white/40 uppercase tracking-widest">XP Progression</span>
                    </div>
                    <div className="w-full h-1.5 bg-white/5 rounded-full overflow-hidden">
                      <motion.div 
                        initial={{ width: 0 }}
                        animate={{ width: `${levelProgress}%` }}
                        className="h-full bg-primary ritual-glow shadow-[0_0_10px_rgba(0,255,136,0.5)]"
                      />
                    </div>
                    <div className="flex justify-between items-center mt-2">
                       <span className="text-[8px] font-mono text-white/20">Lv.{gameState.level}</span>
                       <span className="text-[8px] font-mono text-white/20">{gameState.xp} / {levelInfo.next?.xp || 'MAX'} XP</span>
                    </div>
                  </div>
                </div>

                {/* RIGHT COLUMN: Action & Controls */}
                <div className="space-y-4 lg:space-y-6">
                  {/* Asset Selection Panel */}
                  <div className="glass p-3 font-mono">
                    <p className="text-[9px] text-white/40 uppercase tracking-[0.2em] mb-3 ml-1">Instruments</p>
                    <div className="flex gap-2 w-full overflow-x-auto no-scrollbar">
                      {ASSETS.map((asset) => (
                        <button
                          key={asset.id}
                          onClick={() => setSelectedAsset(asset)}
                          className={cn(
                            "flex flex-1 items-center justify-center gap-2 px-3 py-2.5 rounded-xl border transition-all text-left min-w-[90px]",
                            selectedAsset.id === asset.id 
                              ? "bg-primary/10 border-primary shadow-[0_0_15px_rgba(0,255,136,0.1)]" 
                              : "glass bg-transparent border-white/5 hover:border-white/20"
                          )}
                        >
                          <div className={cn(
                            "w-6 h-6 rounded-full flex items-center justify-center shrink-0 border border-white/5 bg-black/20",
                            selectedAsset.id === asset.id ? "border-primary/50" : ""
                          )}>
                            <img src={asset.logo} alt={asset.symbol} className={cn("w-3.5 h-3.5 object-contain", selectedAsset.id === asset.id ? "" : "grayscale opacity-50")} />
                          </div>
                          <span className={cn("text-[11px] font-bold tracking-tight", selectedAsset.id === asset.id ? "text-primary" : "text-white/60")}>
                            {asset.symbol}
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Prediction Interaction Terminal */}
                  <div className="glass p-6 text-center relative overflow-hidden flex flex-col items-center ritual-glow border-primary/10">
                    {/* Header Info */}
                    <div className="mb-6 flex flex-col items-center w-full">
                      <div className="w-16 h-16 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center mb-4 ritual-glow">
                        <img src={selectedAsset.logo} alt={selectedAsset.symbol} className="w-8 h-8" />
                      </div>
                      <h4 className="text-lg font-black text-white italic tracking-tighter uppercase mb-1">${selectedAsset.symbol}</h4>
                      <p className="text-[10px] uppercase font-mono text-white/40 italic">Trading Pair</p>
                    </div>

                    {/* Action Title */}
                    <div className="w-full py-3 px-4 glass bg-primary/5 border-primary/20 rounded-xl mb-6">
                      <p className="text-[10px] text-primary/60 uppercase tracking-widest font-mono font-bold mb-1">Ritual Oracle Call</p>
                      <h3 className="text-lg font-bold text-white tracking-widest">UP OR DOWN?</h3>
                    </div>

                    {/* The Buttons */}
                    <div className="grid grid-cols-2 gap-3 w-full">
                      <button 
                        disabled={isPredicting || isTxPending || isConfirming}
                        onClick={() => handlePrediction(Prediction.UP)}
                        className={cn(
                          "group relative py-6 px-4 glass flex flex-col items-center justify-center gap-3 transition-all w-full border",
                          isPredicting ? (pendingChoice === Prediction.UP ? "border-primary ritual-glow bg-primary/10" : "opacity-30") : 
                          (isTxPending || isConfirming ? "opacity-50 cursor-wait" : "glass-hover cursor-pointer border-white/5 hover:border-primary/40")
                        )}
                      >
                        <div className="w-10 h-10 rounded-xl bg-primary/20 flex items-center justify-center ritual-glow">
                          <ArrowUp size={20} className="text-primary" />
                        </div>
                        <span className="font-bold tracking-widest uppercase text-xs text-primary">Predict Up</span>
                        {isTxPending && pendingChoice === Prediction.UP && <Loader2 size={14} className="absolute top-2 right-2 animate-spin text-primary" />}
                      </button>

                      <button 
                        disabled={isPredicting || isTxPending || isConfirming}
                        onClick={() => handlePrediction(Prediction.DOWN)}
                        className={cn(
                          "group relative py-6 px-4 glass flex flex-col items-center justify-center gap-3 transition-all w-full border",
                          isPredicting ? (pendingChoice === Prediction.DOWN ? "border-red-500/50 ritual-glow bg-red-500/10" : "opacity-30") : 
                          (isTxPending || isConfirming ? "opacity-50 cursor-wait" : "glass-hover cursor-pointer border-white/5 hover:border-red-500/40")
                        )}
                      >
                        <div className="w-10 h-10 rounded-xl bg-red-500/20 flex items-center justify-center shadow-[0_0_15px_rgba(239,68,68,0.2)]">
                          <ArrowDown size={20} className="text-red-500" />
                        </div>
                        <span className="font-bold tracking-widest uppercase text-xs text-red-500">Predict Down</span>
                        {isTxPending && pendingChoice === Prediction.DOWN && <Loader2 size={14} className="absolute top-2 right-2 animate-spin text-red-500" />}
                      </button>
                    </div>

                    {/* Status Messages */}
                    {(isTxPending || isConfirming) && (
                      <div className="mt-4 flex items-center gap-2 text-primary text-[9px] uppercase font-bold tracking-widest animate-pulse h-4">
                        <Loader2 size={10} className="animate-spin" />
                        {isTxPending ? "Wallet Sign Required..." : "Confirming Onchain..."}
                      </div>
                    )}

                    {!isPredicting && !isTxPending && !isConfirming && (
                      <div className="mt-4 grid grid-cols-2 gap-2 w-full">
                        <div className="flex items-center justify-center gap-2 py-1.5 px-2 rounded-lg bg-white/5 border border-white/10">
                          <Coins size={10} className="text-primary" />
                          <span className="text-[8px] text-white/40 uppercase font-mono tracking-tight">Fee: 0.0001</span>
                        </div>
                        <div className="flex items-center justify-center gap-2 py-1.5 px-2 rounded-lg bg-primary/5 border border-primary/10">
                          <Wallet size={10} className="text-primary" />
                          <span className="text-[8px] text-primary font-mono tracking-tight font-bold">
                            {parseFloat(wallet.ritualBalance).toFixed(4)}
                          </span>
                        </div>
                      </div>
                    )}

                    {/* Locked Prediction State */}
                    {isPredicting && (
                      <motion.div 
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        className="absolute inset-0 z-30 glass backdrop-blur-md flex flex-col items-center justify-center h-full w-full p-6"
                      >
                        <div className="relative w-20 h-20 mb-4">
                          <svg className="absolute inset-0 w-full h-full -rotate-90">
                            <circle cx="40" cy="40" r="38" stroke="currentColor" strokeWidth="2" fill="transparent" className="text-white/5" />
                            <motion.circle 
                              cx="40" cy="40" r="38" stroke="currentColor" strokeWidth="3" fill="transparent"
                              strokeDasharray="238.76"
                              initial={{ strokeDashoffset: 238.76 }}
                              animate={{ strokeDashoffset: (timeLeft / 15) * 238.76 }}
                              className="text-primary ritual-glow"
                            />
                          </svg>
                          <div className="absolute inset-0 flex items-center justify-center">
                            <img src={selectedAgent.avatar} alt="Agent" className="w-12 h-12 rounded-full border border-white/20" />
                          </div>
                        </div>
                        <p className="text-sm font-bold text-primary ritual-glow-text mb-1">{timeLeft}s Remaining</p>
                        <p className="text-[10px] text-white/40 uppercase font-mono tracking-widest">Processing Node...</p>
                      </motion.div>
                    )}
                  </div>

                  {/* Quick Links / Status */}
                  <div className="flex gap-2">
                    <div className="flex-1 glass p-3 text-center border-white/5">
                      <p className="text-[8px] text-white/40 uppercase font-mono mb-1">Win Rate</p>
                      <p className="text-xs font-bold text-white tracking-widest">{gameState.totalWins > 0 ? Math.round((gameState.totalWins / (gameState.totalWins + gameState.totalLosses + gameState.totalDraws)) * 100) : 0}%</p>
                    </div>
                    <div className="flex-1 glass p-3 text-center border-primary/20 bg-primary/5">
                      <p className="text-[8px] text-primary/60 uppercase font-mono mb-1">Streak</p>
                      <div className="flex items-center justify-center gap-1 font-bold text-primary ritual-glow-text">
                        <Flame size={12} fill="currentColor" />
                        <span className="text-xs">{gameState.streak}</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          )}

          {view === 'agents' && (
            <motion.div
              key="agents"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="space-y-4 sm:space-y-6 h-full w-full"
            >
              <h2 className="text-xl sm:text-2xl font-bold flex items-center gap-2 sm:gap-3 px-1">
                <Trophy className="text-primary w-5 h-5 sm:w-6 sm:h-6" />
                Select Opponent
              </h2>
              <div className="grid gap-3 sm:gap-4 h-full w-full">
                {AI_AGENTS.map((agent) => {
                  const dynamicStats = gameState.agentStats?.[agent.id] || { wins: 0, losses: 0, draws: 0 };
                  const totalWins = (agent.stats?.wins || 0) + dynamicStats.wins;
                  const totalLosses = (agent.stats?.losses || 0) + dynamicStats.losses;
                  const totalDraws = (agent.stats?.draws || 0) + dynamicStats.draws;
                  const totalGames = totalWins + totalLosses + totalDraws;
                  const winRate = totalGames > 0 ? Math.round((totalWins / totalGames) * 100) : 0;

                  return (
                    <button 
                      key={agent.id}
                      onClick={() => {
                        setSelectedAgent(agent);
                        setView('game');
                      }}
                      className={cn(
                        "p-4 sm:p-6 glass flex items-center gap-3 sm:gap-6 text-left transition-all h-fit w-full",
                        selectedAgent.id === agent.id ? "border-primary ritual-glow" : "glass-hover"
                      )}
                    >
                      <div className="w-14 h-14 sm:w-20 sm:h-20 rounded-xl sm:rounded-2xl overflow-hidden border border-white/10 shrink-0">
                        <img src={agent.avatar} alt={agent.name} className="w-full h-full object-cover" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-1 gap-1 sm:gap-2">
                          <div className="flex items-center gap-2">
                            <h3 className="font-bold text-base sm:text-lg truncate">{agent.name}</h3>
                            <span className="text-[8px] sm:text-[10px] text-white/30 font-mono flex items-center gap-1">
                              · <span className="text-green-400/80">{totalWins}W</span> 
                              · <span className="text-red-400/80">{totalLosses}L</span> 
                              · <span className="text-white/40">{totalDraws}D</span> 
                              · <span className="text-primary font-bold">{winRate}%</span>
                            </span>
                          </div>
                          <span className="w-fit text-[8px] sm:text-[10px] px-2 py-0.5 rounded-full border border-white/20 bg-white/5 uppercase tracking-widest">{agent.type}</span>
                        </div>
                        <p className="text-xs sm:text-sm text-white/50 line-clamp-1 mb-2 sm:mb-3">{agent.description}</p>
                        <div className="flex items-center gap-3 sm:gap-4 text-[9px] sm:text-[10px] text-white/40 uppercase tracking-widest">
                          <span className="flex items-center gap-1"><ShieldCheck size={10} /> Active</span>
                          <span className="flex items-center gap-1 border-l border-white/10 pl-3 sm:pl-4">Latency: 240ms</span>
                        </div>
                      </div>
                      <ChevronRight size={18} className={cn("shrink-0 sm:w-5 sm:h-5", selectedAgent.id === agent.id ? "text-primary" : "text-white/20")} />
                    </button>
                  );
                })}
              </div>
            </motion.div>
          )}


          {view === 'profile' && (
            <motion.div
              key="profile"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="space-y-6 h-full w-full"
            >
              <div className="glass p-8 flex flex-col h-fit w-full ritual-glow space-y-8">
                {/* 1. Wallet Address */}
                <div className="flex flex-col items-center text-center">
                  <div className={cn(
                    "w-20 h-20 rounded-full border-4 p-1 mb-4",
                    gameState.level === 5 ? "border-primary ritual-glow-strong" : "border-primary/50"
                  )}>
                    <div className="w-full h-full rounded-full bg-white/5 flex items-center justify-center">
                      <User size={32} className={cn(gameState.level === 5 ? "text-primary" : "text-white/20")} />
                    </div>
                  </div>
                  <h3 className="text-xl font-bold mb-1 font-mono tracking-tight">
                    {address ? `${address.slice(0, 8)}...${address.slice(-6)}` : "Anonymity"}
                  </h3>
                </div>

                {/* 2. Achievements label */}
                <div className="space-y-4">
                  <h4 className="text-[10px] uppercase tracking-[0.2em] font-bold font-mono text-white/40 border-b border-white/5 pb-2">Achievements</h4>
                  <div className="flex flex-wrap gap-2 justify-center">
                    {gameState.badges.length > 0 ? gameState.badges.map((badge, i) => (
                      <div key={i} className="glass px-3 py-1.5 border-primary/20 flex items-center gap-2 h-fit bg-primary/5">
                        <Trophy size={12} className="text-primary" />
                        <span className="font-bold text-[10px] uppercase tracking-wider">{badge}</span>
                      </div>
                    )) : (
                      <p className="text-[10px] text-white/20 italic font-mono">No achievements unlocked yet.</p>
                    )}
                  </div>
                </div>

                {/* 3. XP + Level section */}
                <div className="space-y-6 bg-white/[0.02] p-6 rounded-2xl border border-white/5">
                  <div className="flex items-center justify-between">
                    <div className="flex flex-col">
                      <p className="text-[10px] text-white/40 uppercase tracking-widest font-mono mb-1">Current Status</p>
                      <h4 className={cn(
                        "text-2xl font-black italic tracking-tighter uppercase",
                        gameState.level === 5 ? "text-primary ritual-glow-text" : "text-white"
                      )}>
                        {levelInfo.current.title}
                      </h4>
                    </div>
                    <div className="flex flex-col items-end">
                      <p className="text-[10px] text-white/40 uppercase tracking-widest font-mono mb-1">Experience</p>
                      <div className="flex items-center gap-2 text-primary">
                        <Zap size={16} fill="currentColor" className="ritual-glow" />
                        <span className="text-2xl font-black font-mono tracking-tighter">{gameState.xp} XP</span>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-4 pt-4 border-t border-white/5">
                    {/* Progress to next */}
                    <div className="space-y-2">
                       <div className="flex justify-between items-end">
                         <p className="text-[10px] text-white/40 uppercase font-mono italic">Next Level Goal</p>
                         <p className="text-[10px] font-bold font-mono">
                           {gameState.xp} / {levelInfo.next?.xp || 'MAX'} XP {levelInfo.next && <><span className="text-white/20">→</span> <span className="text-primary">{levelInfo.next.title}</span></>}
                         </p>
                       </div>
                       <div className="h-1.5 w-full bg-white/5 rounded-full overflow-hidden">
                         <motion.div 
                           initial={{ width: 0 }}
                           animate={{ width: `${levelProgress}%` }}
                           className="h-full bg-primary ritual-glow"
                         />
                       </div>
                    </div>

                    {/* Long term progress */}
                    <div className="flex justify-between items-center text-[9px] uppercase font-mono text-white/30">
                       <span>Path to Final Tier</span>
                       <span>{gameState.xp} / 5000 XP <span className="text-white/10">→</span> <span className={gameState.level === 5 ? "text-primary font-bold" : ""}>Radiant Ritualist</span></span>
                    </div>
                  </div>
                </div>

                {/* 4. Level roadmap */}
                <div className="space-y-4">
                   <h4 className="text-[10px] uppercase tracking-[0.2em] font-bold font-mono text-center text-white/20">Ritual Progression Track</h4>
                   <div className="grid grid-cols-5 gap-2">
                     {XP_THRESHOLDS.map((t) => (
                       <div key={t.level} className="flex flex-col items-center gap-2 group">
                         <span className={cn(
                           "text-[8px] font-mono",
                           gameState.level === t.level ? "text-primary font-bold" : "text-white/20"
                         )}>Lvl {t.level}</span>
                         <div className={cn(
                           "w-full h-1 rounded-full transition-all relative",
                           gameState.level >= t.level ? "bg-primary ritual-glow" : "bg-white/5",
                           t.level === 5 && gameState.level === 5 ? "shadow-[0_0_10px_rgba(0,255,136,0.5)]" : ""
                         )}>
                            {gameState.level === t.level && (
                              <motion.div 
                                layoutId="active-lvl"
                                className="absolute -top-1 -left-0.5 w-2 h-2 rounded-full bg-primary ritual-glow-strong"
                              />
                            )}
                         </div>
                         <div className="flex flex-col items-center">
                           <span className={cn(
                             "text-[9px] font-bold uppercase tracking-tighter text-center line-clamp-1",
                             gameState.level === t.level ? "text-primary" : (gameState.level > t.level ? "text-white/60" : "text-white/10")
                           )}>{t.title}</span>
                           <span className={cn(
                             "text-[7px] font-mono tracking-wider",
                             gameState.level >= t.level ? "text-primary/60" : "text-white/20"
                           )}>{t.xp} XP</span>
                         </div>
                       </div>
                     ))}
                   </div>
                </div>

                {/* 5. Performance stats */}
                <div className="grid grid-cols-3 gap-4 pt-4 border-t border-white/5">
                  <div className="glass p-4 bg-primary/5 border-primary/10 flex flex-col items-center text-center">
                    <div className="flex items-center gap-2 mb-2 text-primary">
                      <CheckCircle2 size={12} />
                      <span className="text-[9px] font-mono uppercase tracking-widest font-bold">Wins</span>
                    </div>
                    <p className="text-2xl font-black font-mono tracking-tighter">{gameState.totalWins || 0}</p>
                  </div>
                  <div className="glass p-4 bg-red-500/5 border-red-500/10 flex flex-col items-center text-center">
                    <div className="flex items-center gap-2 mb-2 text-red-500">
                      <X size={12} />
                      <span className="text-[9px] font-mono uppercase tracking-widest font-bold">Losses</span>
                    </div>
                    <p className="text-2xl font-black font-mono tracking-tighter">{gameState.totalLosses || 0}</p>
                  </div>
                  <div className="glass p-4 bg-white/5 border-white/10 flex flex-col items-center text-center">
                    <div className="flex items-center gap-2 mb-2 text-white/40">
                      <Minus size={12} />
                      <span className="text-[9px] font-mono uppercase tracking-widest font-bold">Draws</span>
                    </div>
                    <p className="text-2xl font-black font-mono tracking-tighter">{gameState.totalDraws || 0}</p>
                  </div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Result Modal */}
        <AnimatePresence>
          {currentRound && (
            <div className="fixed inset-0 z-[100] flex items-center justify-center px-6">
              <motion.div 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => setCurrentRound(null)}
                className="absolute inset-0 bg-black/80 backdrop-blur-sm h-full w-full" 
              />
              <motion.div 
                initial={{ scale: 0.9, y: 20, opacity: 0 }}
                animate={{ scale: 1, y: 0, opacity: 1 }}
                exit={{ scale: 0.9, y: 20, opacity: 0 }}
                className="relative w-full max-w-sm glass p-6 sm:p-8 text-center ritual-glow-strong h-fit mx-auto"
              >
                <div className="inline-flex items-center justify-center p-2 rounded-2xl bg-primary/10 border border-primary/20 mb-4 sm:mb-6 w-fit mx-auto gap-3 h-12 sm:h-14 px-4 font-mono">
                  <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-lg sm:rounded-xl overflow-hidden bg-white/5 border border-white/10 p-1 shrink-0">
                    <img src={ASSETS.find(a => a.id === currentRound.asset)?.logo} alt="Asset" className="w-full h-full object-contain" />
                  </div>
                  <span className="text-lg sm:text-xl font-black text-primary tracking-tight">${currentRound.asset}</span>
                </div>
                
                <h3 className={cn(
                  "text-2xl sm:text-3xl font-bold mb-2 tracking-tighter",
                  currentRound.outcome === Outcome.WIN ? "text-primary" : "text-white"
                )}>
                  {currentRound.outcome === Outcome.WIN ? "Victory" : (currentRound.outcome === Outcome.DRAW ? "Draw" : "Defeat")}
                </h3>
                
                <p className="text-sm text-white/50 mb-8 h-fit">
                  {currentRound.outcome === Outcome.WIN ? (
                    <>You outsmarted <span style={{ color: selectedAgent.color }} className="font-bold">{selectedAgent.name}</span>.</>
                  ) : currentRound.outcome === Outcome.LOSS ? (
                    <>Defeated by <span style={{ color: selectedAgent.color }} className="font-bold">{selectedAgent.name}</span>.</>
                  ) : (
                    <>You and <span style={{ color: selectedAgent.color }} className="font-bold">{selectedAgent.name}</span> reached the same outcome.</>
                  )}
                </p>

                <div className="grid grid-cols-2 gap-8 mb-8 border-y border-white/5 py-6 h-fit w-full">
                  <div className="h-fit">
                    <p className="text-[10px] uppercase text-white/40 font-mono mb-2">Start Price</p>
                    <div className="text-sm font-bold">
                      ${currentRound.startPrice.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </div>
                  </div>
                  <div className="h-fit">
                    <p className="text-[10px] uppercase text-white/40 font-mono mb-2">End Price</p>
                    <div className={cn(
                      "text-sm font-bold",
                      currentRound.endPrice > currentRound.startPrice ? "text-primary" : "text-red-400"
                    )}>
                      ${currentRound.endPrice.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-8 mb-8 h-fit w-full">
                  <div className="h-fit">
                    <p className="text-[10px] uppercase text-white/40 font-mono mb-2">Your Prediction</p>
                    <div className="flex items-center justify-center gap-1 font-bold text-sm">
                      {currentRound.userChoice === Prediction.UP ? <ArrowUp size={14} className="text-primary"/> : <ArrowDown size={14} />}
                      {currentRound.userChoice}
                    </div>
                  </div>
                  <div className="h-fit">
                    <p className="text-[10px] uppercase text-white/40 font-mono mb-2">Agent Prediction</p>
                    <div className="flex items-center justify-center gap-1 font-bold text-sm">
                      {currentRound.agentChoice === Prediction.UP ? <ArrowUp size={14} className="text-primary"/> : <ArrowDown size={14} />}
                      {currentRound.agentChoice}
                    </div>
                  </div>
                </div>

                <div className="space-y-3 mb-8 h-fit w-full">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-white/40">Base Reward</span>
                    <span className="font-bold">+{currentRound.xpAwarded} XP</span>
                  </div>
                  {currentRound.streakBonus > 0 && (
                    <div className="flex items-center justify-between text-sm text-primary">
                      <span className="flex items-center gap-1">Streak Bonus <Zap size={12} fill="currentColor" /></span>
                      <span className="font-bold">+{currentRound.streakBonus} XP</span>
                    </div>
                  )}
                </div>

                <button 
                  onClick={() => setCurrentRound(null)}
                  className="w-full py-4 bg-primary text-black font-bold uppercase tracking-widest text-xs rounded-xl shadow-lg h-12"
                >
                  Continue Journey
                </button>
              </motion.div>
            </div>
          )}
        </AnimatePresence>
      </main>

      <Nav />
    </div>
  );
}

function NavButton({ active, onClick, icon, label }: { active: boolean; onClick: () => void; icon: any; label: string }) {
  return (
    <button 
      onClick={onClick}
      className={cn(
        "flex flex-col items-center gap-1.5 transition-all w-full",
        active ? "text-primary" : "text-white/40 hover:text-white/60"
      )}
    >
      <div className={cn(
        "transition-transform duration-300",
        active ? "scale-110" : "scale-100"
      )}>
        {icon}
      </div>
      <span className="text-[10px] font-bold uppercase tracking-widest">{label}</span>
      {active && (
        <motion.div 
          layoutId="nav-active"
          className="absolute -bottom-2 w-1 h-1 bg-primary rounded-full"
        />
      )}
    </button>
  );
}

export default function App() {
  return (
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>
        <RainbowKitProvider 
          theme={darkTheme({
            accentColor: '#00ff88',
            accentColorForeground: 'black',
            borderRadius: 'large',
            fontStack: 'system',
            overlayBlur: 'small',
          })}
        >
          <MainApp />
        </RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}
