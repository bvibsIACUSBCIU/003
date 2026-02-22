import React, { useState, useEffect, useCallback } from 'react';
import { 
  LayoutDashboard, 
  Wallet, 
  Settings, 
  RefreshCw,
  Copy,
  Globe,
  Coins,
  DollarSign,
  TrendingUp,
  ShieldCheck,
  Activity,
  ArrowRightLeft,
  Link as LinkIcon,
  Menu,
  X,
  ArrowUpRight,
  ArrowDownRight,
  Vault
} from 'lucide-react';
import { AreaChart, Area, ResponsiveContainer } from 'recharts';

// Types & Services
import { ContractStats, VipAccountsData, ChartDataPoint, MonitoredWallet, LargeTransaction } from './types';
import { INITIAL_STATS, TARGET_CONTRACT_ADDRESS, B3_LP_ADDRESS, USDX_USDT_LP_ADDRESS } from './constants';
import { fetchRealChainData, fetchLargeTransactions } from './services/chainService';

// Context
import { useTranslation } from './contexts/LanguageContext';

// Components
import { StatCard } from './components/StatCard';
import { KeyAccountsPanel } from './components/KeyAccountsPanel';
import { MultiSigVaultPanel } from './components/MultiSigVaultPanel';
import { LargeTransactionsPanel } from './components/LargeTransactionsPanel';

// Mock Chart Data Generator
const generateChartData = (points: number): ChartDataPoint[] => {
  const data: ChartDataPoint[] = [];
  let baseValue = 140000;
  for (let i = 0; i < points; i++) {
    const change = (Math.random() - 0.45) * 5000;
    baseValue += change;
    data.push({
      time: `${i}:00`,
      value: Math.max(0, baseValue),
      type: Math.random() > 0.5 ? 'In' : 'Out'
    });
  }
  return data;
};

// Helper: Get Beijing Date String (YYYY-MM-DD)
const getBeijingDate = () => {
  return new Date().toLocaleString("en-CA", { timeZone: "Asia/Shanghai" }).substring(0, 10);
};

const App: React.FC = () => {
  // Context
  const { t, lang, toggleLanguage } = useTranslation();

  // State
  const [stats, setStats] = useState<ContractStats>(INITIAL_STATS);
  
  // Daily Flow State (USDT & USDX)
  const [usdtChange, setUsdtChange] = useState<number>(0);
  const [usdxChange, setUsdxChange] = useState<number>(0);
  
  // Custom Wallets State (persisted in localStorage)
  const [monitoredWallets, setMonitoredWallets] = useState<MonitoredWallet[]>(() => {
    const saved = localStorage.getItem('xone_monitored_wallets');
    return saved ? JSON.parse(saved) : [
       { address: "0x1234567890123456789012345678901234567890", label: "做市商 A" }
    ];
  });

  // Multi-Sig Vaults State (persisted in localStorage)
  const [multiSigVaults, setMultiSigVaults] = useState<MonitoredWallet[]>(() => {
    const saved = localStorage.getItem('xone_multisig_vaults');
    return saved ? JSON.parse(saved) : [];
  });

  const [vipData, setVipData] = useState<VipAccountsData>({ portfolios: [] });
  const [vaultData, setVaultData] = useState<VipAccountsData>({ portfolios: [] });
  const [largeTransactions, setLargeTransactions] = useState<LargeTransaction[]>([]);
  const [chartData, setChartData] = useState<ChartDataPoint[]>(generateChartData(24));
  const [isLoadingChain, setIsLoadingChain] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date>(new Date());
  const [activeTab, setActiveTab] = useState('dashboard');
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  
  // Persist wallets
  useEffect(() => {
    localStorage.setItem('xone_monitored_wallets', JSON.stringify(monitoredWallets));
  }, [monitoredWallets]);

  // Persist vaults
  useEffect(() => {
    localStorage.setItem('xone_multisig_vaults', JSON.stringify(multiSigVaults));
  }, [multiSigVaults]);

  // Handlers for Wallet Management
  const handleAddWallet = (address: string, label: string) => {
    if (monitoredWallets.some(w => w.address.toLowerCase() === address.toLowerCase())) return;
    setMonitoredWallets(prev => [...prev, { address, label }]);
    fetchData();
  };

  const handleRemoveWallet = (address: string) => {
    setMonitoredWallets(prev => prev.filter(w => w.address !== address));
  };

  const handleImportWallets = (wallets: MonitoredWallet[]) => {
    setMonitoredWallets(prev => {
      const existing = new Set(prev.map(w => w.address.toLowerCase()));
      const newOnes = wallets.filter(w => !existing.has(w.address.toLowerCase()));
      return [...prev, ...newOnes];
    });
    setTimeout(fetchData, 100);
  };

  // Handlers for Vault Management
  const handleAddVault = (address: string, label: string) => {
    if (multiSigVaults.some(w => w.address.toLowerCase() === address.toLowerCase())) return;
    setMultiSigVaults(prev => [...prev, { address, label }]);
    fetchData();
  };

  const handleRemoveVault = (address: string) => {
    setMultiSigVaults(prev => prev.filter(w => w.address !== address));
  };

  const handleImportVaults = (wallets: MonitoredWallet[]) => {
    setMultiSigVaults(prev => {
      const existing = new Set(prev.map(w => w.address.toLowerCase()));
      const newOnes = wallets.filter(w => !existing.has(w.address.toLowerCase()));
      return [...prev, ...newOnes];
    });
    setTimeout(fetchData, 100);
  };

  // Daily Flow Logic (Pure Frontend)
  const processDailyFlow = (currentStats: Partial<ContractStats>) => {
    if (!currentStats.balanceUsdt || !currentStats.balanceUsdx) return;

    const todayStr = getBeijingDate();
    const storageKey = `xone_daily_start`;
    const storedData = localStorage.getItem(storageKey);
    
    let baselineData;

    if (storedData) {
      const parsed = JSON.parse(storedData);
      // If the stored data is from a previous day (Beijing Time), we reset the baseline to NOW.
      if (parsed.date !== todayStr) {
         baselineData = {
           date: todayStr,
           usdt: currentStats.balanceUsdt,
           usdx: currentStats.balanceUsdx
         };
         localStorage.setItem(storageKey, JSON.stringify(baselineData));
         setUsdtChange(0);
         setUsdxChange(0);
      } else {
        // It's the same day, use the stored open price
        baselineData = parsed;
        setUsdtChange(currentStats.balanceUsdt - baselineData.usdt);
        setUsdxChange(currentStats.balanceUsdx - baselineData.usdx);
      }
    } else {
      // First time ever running
      baselineData = {
        date: todayStr,
        usdt: currentStats.balanceUsdt,
        usdx: currentStats.balanceUsdx
      };
      localStorage.setItem(storageKey, JSON.stringify(baselineData));
      setUsdtChange(0);
      setUsdxChange(0);
    }
  };

  // Data Fetching
  const fetchData = useCallback(async () => {
    setIsLoadingChain(true);
    
    // Parallel fetch
    const [chainData, vaultChainData, largeTxs] = await Promise.all([
      fetchRealChainData(monitoredWallets),
      fetchRealChainData(multiSigVaults),
      fetchLargeTransactions()
    ]);

    const { stats: newStats, vipData: newVipData } = chainData;
    const { vipData: newVaultData } = vaultChainData;
    
    setStats(prev => ({
      ...prev,
      ...newStats,  
    }));

    // Process daily flow changes
    processDailyFlow(newStats);

    setVipData(newVipData);
    setVaultData(newVaultData);
    setLargeTransactions(largeTxs);
    setLastUpdated(new Date());
    setIsLoadingChain(false);
  }, [monitoredWallets, multiSigVaults]);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 15000); 
    return () => clearInterval(interval);
  }, [fetchData]);

  const handleCopyAddress = (addr: string) => {
    navigator.clipboard.writeText(addr);
    alert(t('copyAddress'));
  };

  const toggleMobileMenu = () => setIsMobileMenuOpen(!isMobileMenuOpen);

  return (
    <div className="min-h-screen bg-xone-900 text-gray-200 flex font-sans overflow-hidden relative">
      
      {/* Mobile Overlay */}
      {isMobileMenuOpen && (
        <div 
          className="fixed inset-0 bg-black/50 z-20 lg:hidden backdrop-blur-sm"
          onClick={() => setIsMobileMenuOpen(false)}
        />
      )}

      {/* Sidebar Navigation (Hidden on Mobile) */}
      <aside className={`
        hidden lg:flex fixed lg:static inset-y-0 left-0 z-30
        w-64 bg-xone-900 border-r border-xone-800 flex-col 
        transition-transform duration-300 ease-in-out
      `}>
        <div className="h-20 flex items-center justify-between px-6 border-b border-xone-800 bg-xone-900">
          <div className="flex items-center">
            <div className="w-8 h-8 bg-gradient-to-tr from-indigo-500 to-cyan-400 rounded flex items-center justify-center text-white font-bold text-lg shadow-[0_0_15px_rgba(59,130,246,0.5)]">
              B
            </div>
            <span className="ml-3 font-mono font-bold text-lg tracking-tighter text-white">
              B-3<span className="text-xone-accent"> | XONE</span>
            </span>
          </div>
        </div>

        <nav className="flex-1 py-6 flex flex-col gap-1 px-3">
          <button 
            onClick={() => setActiveTab('dashboard')}
            className={`flex items-center p-3 rounded-lg transition-all ${activeTab === 'dashboard' ? 'bg-xone-800 text-white border-l-4 border-xone-accent' : 'text-gray-500 hover:bg-xone-800 hover:text-gray-300'}`}
          >
            <LayoutDashboard size={20} />
            <span className="ml-3 font-medium text-sm tracking-wide">{t('dashboard')}</span>
          </button>
          
          <button 
            onClick={() => setActiveTab('keyAccounts')}
            className={`flex items-center p-3 rounded-lg transition-all ${activeTab === 'keyAccounts' ? 'bg-xone-800 text-white border-l-4 border-xone-accent' : 'text-gray-500 hover:bg-xone-800 hover:text-gray-300'}`}
          >
            <ShieldCheck size={20} />
            <span className="ml-3 font-medium text-sm tracking-wide">{t('keyAccounts')}</span>
          </button>

          <button 
            onClick={() => setActiveTab('multiSigVault')}
            className={`flex items-center p-3 rounded-lg transition-all ${activeTab === 'multiSigVault' ? 'bg-xone-800 text-white border-l-4 border-xone-accent' : 'text-gray-500 hover:bg-xone-800 hover:text-gray-300'}`}
          >
            <Vault size={20} />
            <span className="ml-3 font-medium text-sm tracking-wide">{t('multiSigVault')}</span>
          </button>

          <button 
            onClick={() => setActiveTab('largeTransactions')}
            className={`flex items-center p-3 rounded-lg transition-all ${activeTab === 'largeTransactions' ? 'bg-xone-800 text-white border-l-4 border-xone-accent' : 'text-gray-500 hover:bg-xone-800 hover:text-gray-300'}`}
          >
            <Activity size={20} />
            <span className="ml-3 font-medium text-sm tracking-wide">{t('settings')}</span>
          </button>
        </nav>

        <div className="p-4 border-t border-xone-800 bg-xone-900">
          <div className="bg-black/30 rounded p-3 border border-xone-800">
            <p className="text-[10px] text-gray-600 uppercase tracking-widest mb-2">{t('status')}</p>
            <div className="flex items-center gap-2">
              <span className={`w-1.5 h-1.5 rounded-full ${isLoadingChain ? 'bg-amber-500' : 'bg-green-500 shadow-[0_0_8px_#22c55e]'} animate-pulse`}></span>
              <span className="text-xs font-mono text-gray-400">{isLoadingChain ? 'SYNCING...' : t('connected')}</span>
            </div>
          </div>
        </div>
      </aside>

      {/* Bottom Navigation (Visible on Mobile) */}
      <div className="lg:hidden fixed bottom-0 left-0 right-0 bg-xone-900 border-t border-xone-800 z-50 flex justify-around items-center pb-safe pt-2 px-2 h-16">
          <button 
            onClick={() => setActiveTab('dashboard')}
            className={`flex flex-col items-center justify-center w-full h-full gap-1 ${activeTab === 'dashboard' ? 'text-xone-accent' : 'text-gray-500'}`}
          >
            <LayoutDashboard size={20} />
            <span className="text-[10px] font-medium">{t('dashboard')}</span>
          </button>
          
          <button 
            onClick={() => setActiveTab('keyAccounts')}
            className={`flex flex-col items-center justify-center w-full h-full gap-1 ${activeTab === 'keyAccounts' ? 'text-xone-accent' : 'text-gray-500'}`}
          >
            <ShieldCheck size={20} />
            <span className="text-[10px] font-medium">{t('keyAccounts')}</span>
          </button>

          <button 
            onClick={() => setActiveTab('multiSigVault')}
            className={`flex flex-col items-center justify-center w-full h-full gap-1 ${activeTab === 'multiSigVault' ? 'text-xone-accent' : 'text-gray-500'}`}
          >
            <Vault size={20} />
            <span className="text-[10px] font-medium">{t('multiSigVault')}</span>
          </button>

          <button 
            onClick={() => setActiveTab('largeTransactions')}
            className={`flex flex-col items-center justify-center w-full h-full gap-1 ${activeTab === 'largeTransactions' ? 'text-xone-accent' : 'text-gray-500'}`}
          >
            <Activity size={20} />
            <span className="text-[10px] font-medium">{t('settings')}</span>
          </button>
      </div>

      {/* Main Content Area */}
      <main className="flex-1 w-full p-4 lg:p-6 overflow-y-auto bg-[#0b1121] h-screen pb-20 lg:pb-6">
        
        {/* Header Bar */}
        <header className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6 sticky top-0 z-10 bg-[#0b1121]/95 backdrop-blur-sm py-2 -mx-4 px-4 lg:mx-0 lg:px-0">
          <div className="flex items-center gap-3">
             <div className="flex flex-col">
                <h1 className="text-lg md:text-xl font-bold text-white uppercase tracking-wider flex items-center gap-2">
                   {activeTab === 'dashboard' && t('dashboard')}
                   {activeTab === 'keyAccounts' && t('keyAccounts')}
                   {activeTab === 'multiSigVault' && t('multiSigVault')}
                   {activeTab === 'largeTransactions' && t('settings')}
                </h1>
                <div className="flex items-center gap-1 text-[10px] text-gray-500 font-mono">
                  <span className="hidden sm:inline">MASTER:</span>
                  <span className="text-gray-400 flex items-center gap-1 cursor-pointer hover:text-white" onClick={() => handleCopyAddress(TARGET_CONTRACT_ADDRESS)}>
                    {TARGET_CONTRACT_ADDRESS.substring(0, 4)}...{TARGET_CONTRACT_ADDRESS.substring(38)}
                    <Copy size={8} />
                  </span>
                  <span className="mx-1">|</span>
                  <span>{lastUpdated.toLocaleTimeString()}</span>
                </div>
             </div>
          </div>

          <div className="flex items-center gap-2 self-end md:self-auto">
            <button 
              onClick={toggleLanguage}
              className="flex items-center gap-2 px-3 py-1.5 bg-xone-800 border border-xone-700 rounded text-xs text-gray-300 hover:text-white hover:border-gray-500 transition-all font-medium"
            >
              <Globe size={14} />
              {lang === 'en' ? 'EN' : 'CN'}
            </button>
             <button 
              onClick={() => fetchData()}
              className="p-1.5 bg-xone-800 border border-xone-700 rounded text-gray-400 hover:text-xone-accent hover:border-xone-accent transition-all active:scale-95"
            >
              <RefreshCw size={16} className={isLoadingChain ? 'animate-spin' : ''} />
            </button>
          </div>
        </header>

        {activeTab === 'dashboard' && (
          <>
            {/* Top Row: Asset Holdings (Compact) */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
               <StatCard 
                  label={t('totalBalance')}
                  value={`$${stats.balanceUsd.toLocaleString(undefined, { maximumFractionDigits: 0 })}`}
                  icon={<Wallet size={18} />}
                />
                
                {/* USDT Card - Fund Inflow Monitor */}
                <div className="bg-xone-800 border border-xone-700 rounded-xl p-4 md:p-6 relative overflow-hidden group hover:border-green-500/50 transition-colors duration-300">
                   <div className="flex justify-between items-start mb-2">
                      <p className="text-gray-400 text-sm font-medium uppercase tracking-wider">USDT 储备 (24h)</p>
                      <DollarSign size={16} className="text-green-400" />
                   </div>
                   <h3 className="text-xl md:text-2xl font-bold text-white font-mono">{stats.balanceUsdt.toLocaleString(undefined, { maximumFractionDigits: 0 })}</h3>
                   <div className={`flex items-center mt-2 text-xs md:text-sm font-bold ${usdtChange >= 0 ? 'text-xone-success' : 'text-xone-danger'}`}>
                      {usdtChange >= 0 ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />}
                      <span className="ml-1">{usdtChange > 0 ? '+' : ''}{usdtChange.toLocaleString(undefined, {maximumFractionDigits: 0})}</span>
                      <span className="ml-2 text-[10px] text-gray-500 font-normal border border-gray-700 rounded px-1">业绩{usdtChange >= 0 ? '增长' : '流出'}</span>
                   </div>
                </div>

                {/* USDX Card - Fund Outflow Monitor */}
                <div className="bg-xone-800 border border-xone-700 rounded-xl p-4 md:p-6 relative overflow-hidden group hover:border-cyan-500/50 transition-colors duration-300">
                   <div className="flex justify-between items-start mb-2">
                      <p className="text-gray-400 text-sm font-medium uppercase tracking-wider">USDX 总量 (24h)</p>
                      <Coins size={16} className="text-cyan-400" />
                   </div>
                   <h3 className="text-xl md:text-2xl font-bold text-white font-mono">{stats.balanceUsdx.toLocaleString(undefined, { maximumFractionDigits: 0 })}</h3>
                    <div className={`flex items-center mt-2 text-xs md:text-sm font-bold text-gray-300`}>
                      {usdxChange >= 0 ? <ArrowUpRight size={14} className="text-gray-400" /> : <ArrowDownRight size={14} className="text-gray-400" />}
                      <span className="ml-1">{usdxChange > 0 ? '+' : ''}{usdxChange.toLocaleString(undefined, {maximumFractionDigits: 0})}</span>
                   </div>
                </div>

                <StatCard 
                  label={t('remainingB3')}
                  value={stats.balanceB3.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                  subValue="B3"
                  icon={<Coins size={18} className="text-indigo-400" />}
                />
            </div>

            {/* Middle Row: LP Monitors (Split Layout) */}
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 lg:gap-6 mb-6">
              
              {/* Card 1: B3/USDX (Trading Pair) */}
              <div className="bg-xone-800 border border-xone-700 rounded-xl overflow-hidden flex flex-col shadow-lg relative group">
                 <div className="p-4 border-b border-xone-700 flex justify-between items-center bg-gradient-to-r from-xone-800 to-indigo-900/20">
                    <div className="flex items-center gap-2">
                      <TrendingUp className="text-indigo-400" size={18} />
                      <h3 className="font-bold text-white tracking-wide text-sm md:text-base">{t('traderPair')}</h3>
                    </div>
                    <div className="flex gap-2 text-xs">
                       <span className="flex items-center gap-1 bg-black/20 text-gray-400 px-2 py-1 rounded border border-gray-700 cursor-pointer hover:text-white" onClick={() => handleCopyAddress(B3_LP_ADDRESS)}>
                          <LinkIcon size={10} /> <span className="hidden sm:inline">{t('contractAddress')}</span><span className="sm:hidden">LP</span>
                       </span>
                    </div>
                 </div>
                 
                 <div className="p-4 md:p-6 flex flex-col gap-4 md:gap-6">
                    <div className="flex justify-between items-end">
                      <span className="text-gray-400 text-xs md:text-sm font-mono uppercase">{t('price')}</span>
                      <div className="text-right">
                         <span className="text-2xl md:text-3xl font-bold text-white font-mono tracking-tight">
                            {stats.b3Price > 0 ? stats.b3Price.toFixed(4) : "0.0000"} 
                         </span>
                         <span className="text-[10px] md:text-xs text-gray-500 font-normal ml-2">USDX/B3</span>
                      </div>
                    </div>

                    {/* Chart Area */}
                    <div className="h-24 md:h-32 w-full bg-black/20 rounded-lg overflow-hidden border border-xone-700/50">
                        <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={chartData}>
                          <defs>
                            <linearGradient id="colorB3" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="5%" stopColor="#818cf8" stopOpacity={0.3}/>
                              <stop offset="95%" stopColor="#818cf8" stopOpacity={0}/>
                            </linearGradient>
                          </defs>
                          <Area type="monotone" dataKey="value" stroke="#818cf8" strokeWidth={2} fillOpacity={1} fill="url(#colorB3)" />
                        </AreaChart>
                      </ResponsiveContainer>
                    </div>

                    {/* Reserves & Stats */}
                    <div className="grid grid-cols-2 gap-3">
                        <div className="flex justify-between items-center bg-xone-900/40 p-2 rounded">
                          <div className="flex items-center gap-2">
                            <div className="w-1.5 h-1.5 rounded-full bg-indigo-500"></div>
                            <span className="text-gray-400 text-xs">B3</span>
                          </div>
                          <span className="font-mono text-indigo-300 text-sm">{stats.lpBalanceB3.toLocaleString(undefined, {maximumFractionDigits: 0})}</span>
                        </div>

                        <div className="flex justify-between items-center bg-xone-900/40 p-2 rounded">
                          <div className="flex items-center gap-2">
                            <div className="w-1.5 h-1.5 rounded-full bg-cyan-500"></div>
                            <span className="text-gray-400 text-xs">USDX</span>
                          </div>
                          <span className="font-mono text-cyan-300 text-sm">{stats.lpBalanceUsdx.toLocaleString(undefined, {maximumFractionDigits: 0})}</span>
                        </div>

                        <div className="col-span-2 flex justify-between gap-2">
                           <div className="flex-1 bg-black/20 p-2 rounded border border-gray-800">
                              <p className="text-[10px] text-gray-500 uppercase">{t('volume24h')}</p>
                              <p className="font-mono text-white text-sm">{stats.volume24h.toLocaleString()}</p>
                           </div>
                           <div className="flex-1 bg-indigo-900/20 p-2 rounded border border-indigo-500/30">
                              <p className="text-[10px] text-indigo-300 uppercase">{t('estFees')}</p>
                              <p className="font-mono text-indigo-100 text-sm">${stats.fees24h.toLocaleString(undefined, {maximumFractionDigits: 2})}</p>
                           </div>
                        </div>
                    </div>
                 </div>
              </div>

              {/* Card 2: USDX/USDT (Stable Pair) */}
              <div className="bg-xone-800 border border-xone-700 rounded-xl overflow-hidden flex flex-col shadow-lg">
                 <div className="p-4 border-b border-xone-700 flex justify-between items-center bg-gradient-to-r from-xone-800 to-teal-900/20">
                    <div className="flex items-center gap-2">
                      <Activity className="text-teal-400" size={18} />
                      <h3 className="font-bold text-white tracking-wide text-sm md:text-base">{t('stablePair')}</h3>
                    </div>
                    <div className="flex gap-2 text-xs">
                       <span className="flex items-center gap-1 bg-black/20 text-gray-400 px-2 py-1 rounded border border-gray-700 cursor-pointer hover:text-white" onClick={() => handleCopyAddress(USDX_USDT_LP_ADDRESS)}>
                          <LinkIcon size={10} /> <span className="hidden sm:inline">{t('contractAddress')}</span><span className="sm:hidden">LP</span>
                       </span>
                    </div>
                 </div>
                 
                 <div className="p-4 md:p-6 flex flex-col gap-4 md:gap-6">
                    <div className="flex justify-between items-end">
                      <span className="text-gray-400 text-xs md:text-sm font-mono uppercase">{t('pegRate')}</span>
                      <div className="text-right">
                         <span className={`text-2xl md:text-3xl font-bold font-mono tracking-tight ${Math.abs(stats.stablePeg - 1) < 0.01 ? 'text-green-400' : 'text-amber-400'}`}>
                            {stats.stablePeg.toFixed(4)}
                         </span>
                         <span className="text-[10px] md:text-xs text-gray-500 font-normal ml-2">USDT/USDX</span>
                      </div>
                    </div>

                    {/* Peg Visualization */}
                    <div className="h-24 md:h-32 w-full bg-black/20 rounded-lg border border-xone-700/50 flex flex-col items-center justify-center relative p-4">
                        <div className="w-full h-2 bg-gray-700 rounded-full overflow-hidden relative">
                           {/* Center Marker */}
                           <div className="absolute left-1/2 top-0 bottom-0 w-0.5 bg-white z-10 opacity-50"></div>
                           {/* Bar */}
                           <div 
                              className={`absolute top-0 bottom-0 transition-all duration-500 ${stats.stablePeg >= 1 ? 'left-1/2 bg-green-500' : 'right-1/2 bg-amber-500'}`}
                              style={{ width: `${Math.min(Math.abs(stats.stablePeg - 1) * 500, 50)}%` }} // Exaggerate scale for visibility
                           ></div>
                        </div>
                        <div className="flex justify-between w-full mt-2 text-[10px] text-gray-500 font-mono">
                           <span>0.98</span>
                           <span>1.00</span>
                           <span>1.02</span>
                        </div>
                        <div className="mt-4 flex items-center gap-2 text-xs text-gray-400">
                            <ArrowRightLeft size={14} />
                            <span>Pool Ratio: {(stats.lp2BalanceUsdx / (stats.lp2BalanceUsdx + stats.lp2BalanceUsdt || 1) * 100).toFixed(1)}% USDX</span>
                        </div>
                    </div>

                    {/* Reserves & Stats */}
                    <div className="grid grid-cols-2 gap-3">
                        <div className="flex justify-between items-center bg-xone-900/40 p-2 rounded">
                          <div className="flex items-center gap-2">
                            <div className="w-1.5 h-1.5 rounded-full bg-cyan-500"></div>
                            <span className="text-gray-400 text-xs">USDX</span>
                          </div>
                          <span className="font-mono text-cyan-300 text-sm">{stats.lp2BalanceUsdx.toLocaleString(undefined, {maximumFractionDigits: 0})}</span>
                        </div>

                        <div className="flex justify-between items-center bg-xone-900/40 p-2 rounded">
                          <div className="flex items-center gap-2">
                            <div className="w-1.5 h-1.5 rounded-full bg-green-500"></div>
                            <span className="text-gray-400 text-xs">USDT</span>
                          </div>
                          <span className="font-mono text-green-300 text-sm">{stats.lp2BalanceUsdt.toLocaleString(undefined, {maximumFractionDigits: 0})}</span>
                        </div>

                        <div className="col-span-2 bg-black/20 p-2 rounded border border-gray-800">
                            <p className="text-[10px] text-gray-500 uppercase">{t('poolLiquidity')}</p>
                            <p className="font-mono text-white text-sm">${(stats.lp2BalanceUsdx + stats.lp2BalanceUsdt).toLocaleString(undefined, {maximumFractionDigits: 0})}</p>
                         </div>
                    </div>
                 </div>
              </div>

            </div>
          </>
        )}

        {activeTab === 'keyAccounts' && (
          <div className="pb-6">
             <KeyAccountsPanel 
              portfolios={vipData.portfolios}
              onAddWallet={handleAddWallet}
              onRemoveWallet={handleRemoveWallet}
              onImportWallets={handleImportWallets}
            />
          </div>
        )}

        {activeTab === 'multiSigVault' && (
          <div className="pb-6">
             <MultiSigVaultPanel 
              portfolios={vaultData.portfolios}
              onAddWallet={handleAddVault}
              onRemoveWallet={handleRemoveVault}
              onImportWallets={handleImportVaults}
            />
          </div>
        )}

        {activeTab === 'largeTransactions' && (
          <div className="pb-6 h-full">
             <LargeTransactionsPanel transactions={largeTransactions} fullHeight={true} />
          </div>
        )}

      </main>
    </div>
  );
};

export default App;