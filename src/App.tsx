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
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { config, ritualTestnet } from './lib/wagmi';
import { formatUnits, parseEther } from 'viem';

const queryClient = new QueryClient();

// Real Wallet Hook using Wagmi
function useWallet() {
  const { address, isConnected } = useAccount();
  const { connect, connectors } = useConnect();
  const { disconnect } = useDisconnect();
  const { data: balance } = useBalance({ address });
  const { data: ritualBalance } = useBalance({ 
    address, 
    chainId: ritualTestnet.id 
  });

  return { 
    address, 
    connect,
    connectors,
    disconnect, 
    isConnected,
    balance: balance ? formatUnits(balance.value, balance.decimals) : '0',
    symbol: balance?.symbol || 'RITUAL',
    ritualBalance: ritualBalance ? formatUnits(ritualBalance.value, ritualBalance.decimals) : '0',
    ritualSymbol: ritualBalance?.symbol || 'RITUAL'
  };
}

function ConnectModal({ isOpen, onClose, connectors, onConnect }: { isOpen: boolean, onClose: () => void, connectors: readonly any[], onConnect: (connector: any) => void }) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center px-6">
      <motion.div 
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        className="absolute inset-0 bg-black/80 backdrop-blur-sm h-full w-full" 
      />
      <motion.div 
        initial={{ scale: 0.9, y: 20, opacity: 0 }}
        animate={{ scale: 1, y: 0, opacity: 1 }}
        exit={{ scale: 0.9, y: 20, opacity: 0 }}
        className="relative w-full max-w-sm glass p-8 ritual-glow-strong h-fit"
      >
        <h3 className="text-xl font-bold mb-2 text-center">Connect Wallet</h3>
        <p className="text-xs text-center text-white/40 mb-8 uppercase tracking-widest font-mono italic">Choose your preferred provider</p>
        <div className="space-y-3">
          {connectors.map((connector) => (
            <button
              key={connector.id}
              onClick={() => {
                onConnect(connector);
                onClose();
              }}
              className="w-full p-4 glass glass-hover flex items-center justify-between group transition-all border border-white/5 hover:border-primary/50"
            >
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 rounded-xl bg-white/5 flex items-center justify-center overflow-hidden border border-white/10 group-hover:border-primary/20 shrink-0">
                  {connector.icon ? (
                    <img src={connector.icon} alt={connector.name} className="w-full h-full p-1.5" />
                  ) : (
                    <div className="bg-primary/10 w-full h-full flex items-center justify-center">
                      <Wallet size={20} className="text-primary group-hover:scale-110 transition-transform" />
                    </div>
                  )}
                </div>
                <div className="text-left">
                  <span className="font-bold text-sm tracking-tight block">{connector.name}</span>
                  <span className="text-[10px] text-white/40 uppercase font-mono tracking-tighter">Ready to Connect</span>
                </div>
              </div>
              <ChevronRight size={16} className="text-white/20 group-hover:text-primary group-hover:translate-x-1 transition-all" />
            </button>
          ))}
        </div>
        <button 
          onClick={onClose}
          className="w-full mt-8 py-3 text-[10px] uppercase tracking-widest text-white/40 hover:text-white transition-colors border-t border-white/5 pt-6"
        >
          Cancel Connection
        </button>
      </motion.div>
    </div>
  );
}

function MainApp() {
  const wallet = useWallet();
  const { address, isConnected } = wallet;
  const [isConnectModalOpen, setIsConnectModalOpen] = useState(false);
  const [view, setView] = useState<'game' | 'agents' | 'leaderboard' | 'profile'>('game');
  const [selectedAgent, setSelectedAgent] = useState<AIAgent>(AI_AGENTS[0]);
  const [leaderboard, setLeaderboard] = useState<{address: string, xp: number}[]>([]);

  // Fetch Leaderboard from Supabase
  const fetchLeaderboard = async () => {
    try {
      const { data, error } = await supabase
        .from('players')
        .select('wallet, xp')
        .order('xp', { ascending: false })
        .limit(50);

      if (error) throw error;
      if (data) {
        setLeaderboard(data.map(p => ({ address: p.wallet, xp: p.xp })));
      }
    } catch (err) {
      console.error('Error fetching leaderboard:', err);
    }
  };

  // Upsert Player to Supabase
  const upsertPlayer = async (stats: { xp: number, wins: number, losses: number, draws: number }) => {
    if (!address) return;
    try {
      const { error } = await supabase
        .from('players')
        .upsert({
          wallet: address,
          xp: stats.xp,
          wins: stats.wins,
          losses: stats.losses,
          draws: stats.draws
        }, { onConflict: 'wallet' });

      if (error) throw error;
    } catch (err) {
      console.error('Error upserting player:', err);
    }
  };

  const [gameState, setGameState] = useState<GameState>(() => ({
    xp: 0,
    level: 1,
    streak: 0,
    totalWins: 0,
    totalLosses: 0,
    totalDraws: 0,
    badges: []
  }));

  // Fetch user data from Supabase on connect
  useEffect(() => {
    const fetchUserData = async () => {
      if (!address) return;
      try {
        const { data, error } = await supabase
          .from('players')
          .select('*')
          .eq('wallet', address)
          .single();

        if (error && error.code !== 'PGRST116') throw error;

        if (data) {
          setGameState(prev => ({
            ...prev,
            xp: data.xp,
            totalWins: data.wins,
            totalLosses: data.losses,
            totalDraws: data.draws,
          }));
        } else {
          // Reset for new user if needed, but the default state is already 0s
        }
      } catch (err) {
        console.error('Error fetching user data:', err);
      }
    };

    fetchUserData();
  }, [address]);

  // Real-time Leaderboard Subscription
  useEffect(() => {
    fetchLeaderboard();

    const channel = supabase
      .channel('public:players')
      .on('postgres_changes', { event: '*', table: 'players', schema: 'public' }, () => {
        fetchLeaderboard();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

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

  const myRank = useMemo(() => {
    if (!address) return null;
    const index = leaderboard.findIndex(p => p.address === address);
    return index !== -1 ? index + 1 : null;
  }, [leaderboard, address]);

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
      setIsConnectModalOpen(true);
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
    if (currentRound || isPredicting || isTxPending || isConfirming || isConnectModalOpen) return null;
    return (
      <nav className="fixed bottom-0 left-0 right-0 z-50 px-6 pb-6 pt-2 h-24">
        <div className="max-w-md mx-auto h-full glass flex items-center justify-around ritual-glow">
          <NavButton active={view === 'game'} onClick={() => setView('game')} icon={<Gamepad2 size={24} />} label="Play" />
          <NavButton active={view === 'agents'} onClick={() => setView('agents')} icon={<TrendingUp size={24} />} label="Agents" />
          <NavButton active={view === 'leaderboard'} onClick={() => setView('leaderboard')} icon={<Trophy size={24} />} label="LEADERBOARD" />
          <NavButton active={view === 'profile'} onClick={() => setView('profile')} icon={<User size={24} />} label="Stats" />
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

      <header className="relative z-10 px-6 py-6 flex items-center justify-between max-w-4xl mx-auto">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary flex items-center justify-center ritual-glow-strong overflow-hidden shrink-0">
            <img src={logo} alt="Ritual Logo" className="w-full h-full object-cover" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight">RitualOracle</h1>
            <p className="text-[10px] text-primary font-mono tracking-widest uppercase">Ritual Testnet</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {wallet.isConnected && (
            <div className="flex items-center gap-4 pr-2 border-r border-white/5">
              <div className="text-center hidden sm:block">
                <p className="text-[10px] text-primary/40 uppercase tracking-widest font-mono">My Level</p>
                <div className="flex items-center gap-1.5 justify-center">
                  <span className="text-xs font-bold text-white tracking-tight">{levelInfo.current.title}</span>
                </div>
              </div>
              <div className="text-right hidden sm:block">
                <p className="text-[10px] text-primary/40 uppercase tracking-widest font-mono">Balance</p>
                <p className="text-xs font-bold text-primary ritual-glow-text">{wallet.ritualBalance} {wallet.ritualSymbol}</p>
              </div>
            </div>
          )}
          <button 
            onClick={() => wallet.isConnected ? wallet.disconnect() : setIsConnectModalOpen(true)}
            className={cn(
              "px-4 py-2 rounded-xl text-sm font-medium flex items-center gap-2 transition-all h-10 border border-white/5",
              wallet.isConnected ? "glass" : "bg-white text-black hover:bg-primary hover:text-black shadow-[0_0_15px_rgba(255,255,255,0.1)]"
            )}
          >
            <Wallet size={16} />
            {wallet.isConnected ? (wallet.address?.slice(0, 6) + '...' + wallet.address?.slice(-4)) : "Connect Wallet"}
          </button>
        </div>
      </header>

      <AnimatePresence>
        {isConnectModalOpen && (
          <ConnectModal 
            isOpen={isConnectModalOpen} 
            onClose={() => setIsConnectModalOpen(false)} 
            connectors={wallet.connectors}
            onConnect={(connector) => wallet.connect({ connector })}
          />
        )}
      </AnimatePresence>

      <main className="relative z-10 max-w-4xl mx-auto px-6 py-4 pb-12">
        <AnimatePresence mode="wait">
          {view === 'game' && (
            <motion.div
              key="game"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="space-y-6 h-full w-full"
            >
              <div className="flex items-center justify-between glass p-4">
                <div className="flex items-center gap-4">
                  <div className="relative">
                    <div className="w-12 h-12 rounded-full border-2 border-primary overflow-hidden p-0.5">
                      <img src={selectedAgent.avatar} alt="Agent" className="w-full h-full rounded-full" />
                    </div>
                    <div className="absolute -bottom-1 -right-1 w-5 h-5 bg-black border border-primary rounded-full flex items-center justify-center">
                      <ShieldCheck size={12} className="text-primary" />
                    </div>
                  </div>
                  <div>
                    <h3 className="font-bold text-sm">{selectedAgent.name}</h3>
                    <p className="text-xs text-white/50">{selectedAgent.type}</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-xs text-white/50 mb-1">Current Streak</p>
                  <div className="flex items-center justify-end gap-1.5 font-bold text-primary">
                    <Flame size={14} fill="currentColor" />
                    {gameState.streak}
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-between glass p-4">
                <div className="flex gap-2 p-1 bg-white/5 rounded-xl border border-white/10">
                  {ASSETS.map((asset) => (
                    <button
                      key={asset.id}
                      onClick={() => setSelectedAsset(asset)}
                      className={cn(
                        "px-3 py-2 rounded-lg text-xs font-bold transition-all flex items-center gap-2",
                        selectedAsset.id === asset.id 
                          ? "bg-primary text-black shadow-lg ritual-glow" 
                          : "text-white/60 hover:text-white"
                      )}
                    >
                      <img src={asset.logo} alt={asset.symbol} className={cn("w-4 h-4 rounded-full", selectedAsset.id === asset.id ? "" : "grayscale")} />
                      ${asset.symbol}
                    </button>
                  ))}
                </div>
                <div className="flex items-center gap-3 pr-2">
                  <div className="text-right">
                    <p className="text-[10px] text-white/40 uppercase tracking-widest font-mono">Market Hint</p>
                    <div className={cn(
                      "flex items-center justify-end gap-1 font-bold text-xs",
                      lastPriceTrend === 'up' ? "text-primary" : "text-red-400"
                    )}>
                      {lastPriceTrend === 'up' ? <ArrowUp size={12} /> : <ArrowDown size={12} />}
                      {lastPriceTrend.toUpperCase()}
                    </div>
                  </div>
                </div>
              </div>

              <RealTimeChart asset={selectedAsset} />

              <div className="glass p-8 pt-20 min-h-[450px] flex flex-col items-center justify-start text-center relative overflow-hidden h-full w-full">
                <div className="absolute top-0 left-0 w-full p-4 border-b border-white/5 bg-white/[0.04] backdrop-blur-md flex items-center justify-between z-20">
                  <div className="flex items-center gap-2">
                    <History size={14} className="text-white/40" />
                    <span className="text-[10px] uppercase tracking-tighter text-white/40 font-mono">
                      {isPredicting ? `Lock Period: ${timeLeft}s` : "Interval: 15s"}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] uppercase tracking-tighter text-primary font-mono font-bold ritual-glow-text">
                      ${currentPrice.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                  </div>
                </div>

                <div className="flex flex-col items-center mb-10">
                  <div className="relative w-28 h-28 flex items-center justify-center shrink-0">
                    <svg className="absolute inset-0 w-full h-full -rotate-90">
                      <circle
                        cx="56" cy="56" r="44"
                        stroke="currentColor" strokeWidth="4"
                        fill="transparent"
                        className="text-white/5"
                      />
                      {isPredicting && (
                        <motion.circle
                          cx="56" cy="56" r="44"
                          stroke="currentColor" strokeWidth="4"
                          fill="transparent"
                          strokeDasharray="276.46"
                          initial={{ strokeDashoffset: 276.46 }}
                          animate={{ strokeDashoffset: (timeLeft / 15) * 276.46 }}
                          className="text-primary ritual-glow"
                        />
                      )}
                    </svg>
                    <motion.div 
                      animate={{ scale: isPredicting ? [1, 1.1, 1] : 1 }}
                      transition={{ duration: 1, repeat: Infinity }}
                      className="relative z-10 flex items-center justify-center"
                    >
                      <img src={selectedAsset.logo} alt={selectedAsset.symbol} className="w-12 h-12 object-contain drop-shadow-[0_0_15px_rgba(var(--color-primary),0.5)]" />
                    </motion.div>
                  </div>
                  <div className="mt-4 flex flex-col items-center h-6">
                    <span className="text-xl font-mono font-bold text-primary ritual-glow-text leading-none">
                      {isPredicting ? `${timeLeft}s` : "15s"}
                    </span>
                  </div>
                </div>

                <div className="flex flex-col items-center mb-10 h-fit">
                  <span className="text-4xl sm:text-5xl font-black text-white tracking-tighter italic uppercase ritual-glow-text px-4 border-x border-white/5">${selectedAsset.symbol}</span>
                  <p className="text-[10px] uppercase tracking-[0.4em] font-mono text-white/40 mt-3">Quantum Oracle Feed</p>
                  <h2 className="text-xl font-bold text-primary mt-8 uppercase tracking-[0.2em] bg-primary/5 py-3 px-8 rounded-2xl border border-primary/20 ritual-glow">Up or Down?</h2>
                </div>
                <p className="text-[11px] text-white/40 mb-10 max-w-[280px] h-fit uppercase tracking-wider font-mono">Predict next 15s movement to harvest XP</p>

                <div className="grid grid-cols-2 gap-4 w-full h-fit">
                  <button 
                    disabled={isPredicting || isTxPending || isConfirming}
                    onClick={() => handlePrediction(Prediction.UP)}
                    className={cn(
                      "group relative p-6 glass flex flex-col items-center gap-3 h-fit w-full transition-all",
                      isPredicting ? (pendingChoice === Prediction.UP ? "border-primary ritual-glow" : "opacity-30") : 
                      (isTxPending || isConfirming ? "opacity-50 cursor-wait" : "glass-hover cursor-pointer")
                    )}
                  >
                    <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center transition-colors">
                      <ArrowUp className={cn(isPredicting && pendingChoice === Prediction.UP ? "text-primary" : "text-primary/60")} />
                    </div>
                    <span className="font-bold tracking-widest uppercase text-xs">
                      {isTxPending && pendingChoice === Prediction.UP ? "Confirming..." : "Up"}
                    </span>
                  </button>
                  <button 
                    disabled={isPredicting || isTxPending || isConfirming}
                    onClick={() => handlePrediction(Prediction.DOWN)}
                    className={cn(
                      "group relative p-6 glass flex flex-col items-center gap-3 h-fit w-full transition-all",
                      isPredicting ? (pendingChoice === Prediction.DOWN ? "border-white/50" : "opacity-30") : 
                      (isTxPending || isConfirming ? "opacity-50 cursor-wait" : "glass-hover cursor-pointer")
                    )}
                  >
                    <div className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center transition-colors">
                      <ArrowDown className={cn(isPredicting && pendingChoice === Prediction.DOWN ? "text-white" : "text-white/60")} />
                    </div>
                    <span className="font-bold tracking-widest uppercase text-xs">
                      {isTxPending && pendingChoice === Prediction.DOWN ? "Confirming..." : "Down"}
                    </span>
                  </button>
                </div>

                {isTxPending && (
                  <div className="mt-4 flex items-center gap-2 text-primary text-[10px] uppercase font-bold tracking-widest animate-pulse">
                    <Loader2 size={12} className="animate-spin" />
                    Waiting for Wallet confirmation...
                  </div>
                )}
                {isConfirming && (
                  <div className="mt-4 flex items-center gap-2 text-primary text-[10px] uppercase font-bold tracking-widest animate-pulse">
                    <Loader2 size={12} className="animate-spin" />
                    Transaction Confirming on Ritual Testnet...
                  </div>
                )}
                {txError && (
                  <div className="mt-4 text-red-400 text-[10px] uppercase font-bold tracking-widest">
                    Transaction Failed: {txError.message.slice(0, 50)}...
                  </div>
                )}

                <div className="mt-8 flex items-center gap-2 p-2 bg-primary/5 rounded-lg border border-primary/10">
                  <Coins size={12} className="text-primary" />
                  <span className="text-[10px] text-white/60 uppercase font-mono tracking-tight">Entry Fee: 0.0001 RITUAL</span>
                </div>

                {isPredicting && (
                  <motion.div 
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="absolute inset-0 z-20 glass backdrop-blur-md flex flex-col items-center justify-center h-full w-full"
                  >
                    <div className="relative w-24 h-24 mb-6">
                      <div className="absolute inset-0 border-4 border-primary/20 rounded-full h-full w-full" />
                      <motion.div 
                        animate={{ rotate: 360 }}
                        transition={{ duration: 1.5, repeat: Infinity, ease: 'linear' }}
                        className="absolute inset-0 border-4 border-t-primary rounded-full h-full w-full" 
                      />
                      <div className="absolute inset-0 flex items-center justify-center">
                        <img src={selectedAgent.avatar} alt="Agent" className="w-16 h-16 rounded-full" />
                      </div>
                    </div>
                    <p className="text-lg font-bold">Agent {selectedAgent.name}</p>
                    <p className="text-sm text-white/50">Processing Prediction...</p>
                  </motion.div>
                )}
              </div>

              <div className="glass p-5 h-fit w-full">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <p className={cn(
                      "text-xs font-mono uppercase tracking-widest",
                      gameState.level === 5 ? "text-primary ritual-glow-text font-bold" : "text-white/40"
                    )}>
                      {levelInfo.current.title}
                    </p>
                  </div>
                  <p className="text-xs font-mono text-white/40">{gameState.xp} / {levelInfo.next?.xp || 'MAX'} XP</p>
                </div>
                <div className="w-full h-2 bg-white/5 rounded-full overflow-hidden">
                  <motion.div 
                    initial={{ width: 0 }}
                    animate={{ width: `${levelProgress}%` }}
                    className={cn(
                      "h-full ritual-glow",
                      gameState.level === 5 ? "bg-primary shadow-[0_0_15px_rgba(0,255,136,0.5)]" : "bg-primary"
                    )}
                  />
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
              className="space-y-6 h-full w-full"
            >
              <h2 className="text-2xl font-bold flex items-center gap-3">
                <Trophy className="text-primary" />
                Select Opponent
              </h2>
              <div className="grid gap-4 h-full w-full">
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
                        "p-6 glass flex items-center gap-6 text-left transition-all h-fit w-full",
                        selectedAgent.id === agent.id ? "border-primary ritual-glow" : "glass-hover"
                      )}
                    >
                      <div className="w-20 h-20 rounded-2xl overflow-hidden border border-white/10 shrink-0">
                        <img src={agent.avatar} alt={agent.name} className="w-full h-full object-cover" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between mb-1">
                          <div className="flex items-center gap-2">
                            <h3 className="font-bold text-lg truncate">{agent.name}</h3>
                            <span className="text-[10px] text-white/30 font-mono flex items-center gap-1">
                              · <span className="text-green-400/80">{totalWins}W</span> 
                              · <span className="text-red-400/80">{totalLosses}L</span> 
                              · <span className="text-white/40">{totalDraws}D</span> 
                              · <span className="text-primary font-bold">{winRate}%</span>
                            </span>
                          </div>
                          <span className="text-[10px] px-2 py-0.5 rounded-full border border-white/20 bg-white/5 uppercase tracking-widest">{agent.type}</span>
                        </div>
                        <p className="text-sm text-white/50 line-clamp-1 mb-3">{agent.description}</p>
                        <div className="flex items-center gap-4 text-[10px] text-white/40 uppercase tracking-widest">
                          <span className="flex items-center gap-1"><ShieldCheck size={10} /> Active</span>
                          <span className="flex items-center gap-1 border-l border-white/10 pl-4">Latency: 240ms</span>
                        </div>
                      </div>
                      <ChevronRight size={20} className={cn(selectedAgent.id === agent.id ? "text-primary" : "text-white/20")} />
                    </button>
                  );
                })}
              </div>
            </motion.div>
          )}

          {view === 'leaderboard' && (
            <motion.div
              key="leaderboard"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="space-y-6 h-full w-full"
            >
              <h2 className="text-2xl font-bold">LEADERBOARD</h2>

              <div className="glass p-6 h-fit w-full border-primary/20 bg-primary/5 ritual-glow">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <p className="text-[10px] text-primary/60 uppercase tracking-widest font-mono">My Global Status</p>
                    <p className="text-xl font-black text-white italic tracking-tighter uppercase">{levelInfo.current.title}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs font-mono text-primary font-bold">RANK #{myRank || '-'}</p>
                    <p className="text-[10px] text-white/20 uppercase font-mono tracking-widest">
                      {myRank ? (myRank === 1 ? 'King of ritual' : `Top ${Math.max(1, Math.round((myRank / Math.max(leaderboard.length, 1)) * 100))}%`) : 'Unranked'}
                    </p>
                  </div>
                </div>
                <div className="space-y-2">
                  <div className="flex justify-between items-center">
                    <span className="text-[9px] font-mono text-white/40 uppercase tracking-widest italic">{gameState.xp} XP</span>
                    <span className="text-[9px] font-mono text-white/40 uppercase tracking-widest italic">Target: {levelInfo.next?.xp || 'MAX'} XP</span>
                  </div>
                  <div className="h-1.5 w-full bg-white/5 rounded-full overflow-hidden">
                    <motion.div 
                      initial={{ width: 0 }}
                      animate={{ width: `${levelProgress}%` }}
                      className="h-full bg-primary ritual-glow"
                    />
                  </div>
                  <p className="text-[9px] text-white/20 font-mono italic text-center pt-1">
                    {levelInfo.next ? `Need ${levelInfo.next.xp - gameState.xp} XP to reach ${levelInfo.next.title}` : 'Maximum level reached'}
                  </p>
                </div>
              </div>
              
              <div className="glass h-fit w-full">
                <div className="p-4 border-b border-white/5 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold uppercase tracking-widest">Global Challengers</span>
                    <span className="text-[8px] bg-primary/10 text-primary border border-primary/20 px-1.5 py-0.5 rounded italic">LIVE</span>
                  </div>
                  <div className="flex gap-8 text-[10px] text-white/40 uppercase font-mono">
                    <span>Rank</span>
                    <span>XP</span>
                  </div>
                </div>
                <div className="divide-y divide-white/5 h-fit w-full">
                  {leaderboard.length > 0 ? leaderboard.map((p, i) => (
                    <div key={i} className="p-4 flex items-center justify-between h-fit w-full">
                      <div className="flex items-center gap-4">
                        <span className={cn("text-xs font-mono w-4 font-bold", i === 0 ? "text-primary text-xl" : "text-white/20")}>{i + 1}</span>
                        <div className="w-8 h-8 rounded-full bg-white/5 border border-white/10 flex items-center justify-center">
                          <User size={14} className="text-white/40" />
                        </div>
                        <span className={cn("text-sm font-medium", address === p.address ? "text-primary" : "text-white")}>
                          {p.address.slice(0, 6)}...{p.address.slice(-4)}
                          {address === p.address && <span className="ml-2 text-[8px] uppercase tracking-widest text-primary italic">(You)</span>}
                        </span>
                      </div>
                      <span className="text-xs font-mono font-bold text-primary">{p.xp} XP</span>
                    </div>
                  )) : (
                    <div className="p-8 text-center">
                      <p className="text-xs font-mono text-white/20 uppercase tracking-widest italic">No interactions recorded yet.</p>
                      <p className="text-[10px] text-white/10 mt-2">Be the first to secure a prediction!</p>
                    </div>
                  )}
                </div>
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
                className="relative w-full max-w-sm glass p-8 text-center ritual-glow-strong h-fit"
              >
                <div className="inline-flex items-center justify-center p-2 rounded-2xl bg-primary/10 border border-primary/20 mb-6 w-fit mx-auto gap-3 h-14 px-4">
                  <div className="w-10 h-10 rounded-xl overflow-hidden bg-white/5 border border-white/10 p-1">
                    <img src={ASSETS.find(a => a.id === currentRound.asset)?.logo} alt="Asset" className="w-full h-full object-contain" />
                  </div>
                  <span className="text-xl font-black text-primary tracking-tight">${currentRound.asset}</span>
                </div>
                
                <h3 className={cn(
                  "text-3xl font-bold mb-2 tracking-tighter",
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
        <MainApp />
      </QueryClientProvider>
    </WagmiProvider>
  );
}
