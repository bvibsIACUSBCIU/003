import React, { createContext, useContext, useState, ReactNode } from 'react';

type Language = 'en' | 'zh';

interface LanguageContextType {
  lang: Language;
  toggleLanguage: () => void;
  t: (key: string) => string;
}

const translations: Record<Language, Record<string, string>> = {
  en: {
    dashboard: 'Trader Dashboard',
    settings: 'Settings',
    status: 'Node Status',
    connected: 'XONE: Synced',
    copyAddress: 'Copied!',
    totalBalance: 'Net Worth (Est.)',
    remainingUsdx: 'USDX Reserve',
    remainingUsdt: 'USDT Reserve',
    remainingB3: 'B3 Holdings',
    traderPair: 'B3 / USDX Pair',
    stablePair: 'USDX / USDT Stable',
    pegRate: 'Peg Rate',
    price: 'Price',
    poolReserves: 'Real-time Pool Reserves',
    keyAccounts: 'Custom Address Monitor',
    addWallet: 'Add Wallet',
    labelPlaceholder: 'Label (e.g. Market Maker)',
    addressPlaceholder: '0x...',
    walletAddress: 'Wallet Address',
    label: 'Label',
    assets: 'Assets on Chain',
    totalValue: 'Total Value',
    actions: 'Actions',
    noWallets: 'No wallets monitored. Add a wallet to start tracking.',
    remove: 'Remove',
    nativeToken: 'XOC (Gas)',
    b3Token: 'B3',
    usdxToken: 'USDX',
    usdtToken: 'USDT',
    add: 'Add',
    exportConfig: 'Export Config',
    importConfig: 'Import Config',
    configSaved: 'Configuration exported!',
    configLoaded: 'Configuration loaded successfully!',
    invalidConfig: 'Invalid configuration file.',
    volume24h: '24h Volume',
    estFees: 'Est. Fees (0.3%)',
    poolLiquidity: 'Pool Liquidity (TVL)',
    walletDetails: 'Wallet Analysis',
    recentActivity: 'Recent On-Chain Activity',
    viewExplorer: 'View on Explorer',
    type: 'Type',
    token: 'Token',
    amount: 'Amount',
    time: 'Time',
    close: 'Close',
    contractAddress: 'LP Contract'
  },
  zh: {
    dashboard: '操盘手看板',
    settings: '系统设置',
    status: '节点状态',
    connected: 'XONE: 已同步',
    copyAddress: '已复制',
    totalBalance: '预估净值 (USD)',
    remainingUsdx: 'USDX 储备金',
    remainingUsdt: 'USDT 储备金',
    remainingB3: 'B3 持仓量',
    traderPair: 'B3 / USDX 交易对',
    stablePair: 'USDX / USDT 稳定池',
    pegRate: '锚定汇率',
    price: '实时价格',
    poolReserves: '实时池底储备',
    keyAccounts: '自定义地址监控',
    addWallet: '添加监控地址',
    labelPlaceholder: '备注 (例如: 做市商A)',
    addressPlaceholder: '0x地址...',
    walletAddress: '钱包地址',
    label: '备注名',
    assets: '链上资产明细',
    totalValue: '总价值 (估)',
    actions: '操作',
    noWallets: '暂无监控地址，请添加钱包地址开始追踪。',
    remove: '移除',
    nativeToken: 'XOC (Gas)',
    b3Token: 'B3',
    usdxToken: 'USDX',
    usdtToken: 'USDT',
    add: '添加',
    exportConfig: '导出配置',
    importConfig: '导入配置',
    configSaved: '配置已导出！',
    configLoaded: '配置加载成功！',
    invalidConfig: '无效的配置文件。',
    volume24h: '24h 交易量',
    estFees: '预估手续费 (0.3%)',
    poolLiquidity: '池底总流动性 (TVL)',
    walletDetails: '钱包深度分析',
    recentActivity: '近期链上交互记录',
    viewExplorer: '跳转浏览器',
    type: '方向',
    token: '币种',
    amount: '数量',
    time: '时间',
    close: '关闭',
    contractAddress: 'LP合约地址'
  }
};

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

export const LanguageProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [lang, setLang] = useState<Language>('zh'); 

  const toggleLanguage = () => {
    setLang(prev => prev === 'en' ? 'zh' : 'en');
  };

  const t = (key: string) => {
    return translations[lang][key] || key;
  };

  return (
    <LanguageContext.Provider value={{ lang, toggleLanguage, t }}>
      {children}
    </LanguageContext.Provider>
  );
};

export const useTranslation = () => {
  const context = useContext(LanguageContext);
  if (!context) {
    throw new Error('useTranslation must be used within a LanguageProvider');
  }
  return context;
};