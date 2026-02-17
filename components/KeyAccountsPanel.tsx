import React, { useState, useRef } from 'react';
import { WalletPortfolio, MonitoredWallet, WalletInteraction } from '../types';
import { useTranslation } from '../contexts/LanguageContext';
import { EXPLORER_URL } from '../constants';
import { Shield, Copy, Plus, Trash2, Wallet, Download, Upload, X, ExternalLink, ArrowRightLeft, ArrowUpRight, ArrowDownLeft, ChevronDown, ChevronRight } from 'lucide-react';

interface KeyAccountsPanelProps {
  portfolios: WalletPortfolio[];
  onAddWallet: (address: string, label: string) => void;
  onRemoveWallet: (address: string) => void;
  onImportWallets: (wallets: MonitoredWallet[]) => void;
}

// Helper to generate mock activity for drill-down demo
const generateMockActivity = (address: string): WalletInteraction[] => {
  return [
    { hash: "0x123...abc", method: "Swap", type: "in", token: "USDT", amount: 50000, time: "10 mins ago", counterparty: "Uniswap V2" },
    { hash: "0x456...def", method: "Transfer", type: "out", token: "B3", amount: 2000, time: "2 hrs ago", counterparty: "0x999...111" },
    { hash: "0x789...ghi", method: "Approve", type: "out", token: "USDX", amount: 0, time: "5 hrs ago", counterparty: "Router" },
    { hash: "0xabc...jkl", method: "Mint", type: "in", token: "B3", amount: 15000, time: "1 day ago", counterparty: "Null Address" },
  ];
};

export const KeyAccountsPanel: React.FC<KeyAccountsPanelProps> = ({ portfolios, onAddWallet, onRemoveWallet, onImportWallets }) => {
  const { t } = useTranslation();
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  // Local state for inputs
  const [newAddress, setNewAddress] = useState('');
  const [newLabel, setNewLabel] = useState('');

  // Modal State
  const [selectedWallet, setSelectedWallet] = useState<WalletPortfolio | null>(null);

  const handleAdd = () => {
    if (!newAddress) return;
    onAddWallet(newAddress, newLabel || 'Wallet');
    setNewAddress('');
    setNewLabel('');
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
  };

  const handleExport = () => {
    const dataToExport = portfolios.map(p => ({ address: p.address, label: p.label }));
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(dataToExport, null, 2));
    const downloadAnchorNode = document.createElement('a');
    downloadAnchorNode.setAttribute("href", dataStr);
    downloadAnchorNode.setAttribute("download", "xone_monitor_config.json");
    document.body.appendChild(downloadAnchorNode); 
    downloadAnchorNode.click();
    downloadAnchorNode.remove();
  };

  const triggerImport = () => {
    if (fileInputRef.current) fileInputRef.current.click();
  };

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const content = e.target?.result as string;
        const parsedData = JSON.parse(content);
        if (Array.isArray(parsedData) && parsedData.every(item => item.address)) {
          onImportWallets(parsedData);
          alert(t('configLoaded'));
        } else {
          alert(t('invalidConfig'));
        }
      } catch (error) {
        alert(t('invalidConfig'));
      }
    };
    reader.readAsText(file);
    event.target.value = '';
  };

  return (
    <div className="bg-xone-800 border border-xone-700 rounded-xl overflow-hidden shadow-lg flex flex-col relative">
      
      {/* Header & Add Form */}
      <div className="p-4 md:p-6 border-b border-xone-700 bg-gradient-to-r from-xone-800 to-indigo-900/20">
        <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-indigo-500/20 rounded-lg text-indigo-400">
              <Shield size={20} />
            </div>
            <div>
              <h3 className="text-base md:text-lg font-bold text-white tracking-wide">{t('keyAccounts')}</h3>
              <p className="text-xs text-gray-400 hidden sm:block">Monitor specific wallets on XONE Chain</p>
            </div>
          </div>
          
          <div className="flex flex-col md:flex-row gap-3">
             <div className="flex gap-2">
                <input type="file" ref={fileInputRef} onChange={handleFileChange} className="hidden" accept=".json" />
                <button onClick={triggerImport} className="flex-1 flex justify-center items-center gap-1 px-3 py-2 bg-xone-700 border border-xone-600 rounded text-xs text-gray-300 hover:text-white hover:bg-xone-600 transition-all">
                  <Upload size={14} />
                  <span>{t('importConfig')}</span>
                </button>
                <button onClick={handleExport} className="flex-1 flex justify-center items-center gap-1 px-3 py-2 bg-xone-700 border border-xone-600 rounded text-xs text-gray-300 hover:text-white hover:bg-xone-600 transition-all">
                  <Download size={14} />
                  <span>{t('exportConfig')}</span>
                </button>
             </div>

             <div className="flex items-center gap-2 bg-xone-900/50 p-1.5 rounded-lg border border-xone-700/50 w-full md:w-auto">
              <input type="text" placeholder={t('label')} className="bg-transparent border-none outline-none text-sm text-white px-2 w-20 md:w-32 placeholder-gray-600" value={newLabel} onChange={(e) => setNewLabel(e.target.value)} />
              <div className="w-px h-4 bg-gray-700"></div>
              <input type="text" placeholder={t('addressPlaceholder')} className="bg-transparent border-none outline-none text-sm text-white px-2 w-full md:w-48 font-mono placeholder-gray-600" value={newAddress} onChange={(e) => setNewAddress(e.target.value)} />
              <button onClick={handleAdd} disabled={!newAddress} className="bg-xone-accent hover:bg-cyan-400 text-xone-900 p-2 rounded text-xs font-bold flex items-center gap-1 transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
                <Plus size={16} />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Mobile List View (Visible on Small Screens) */}
      <div className="block md:hidden">
        {portfolios.map((item) => (
          <div 
            key={item.address} 
            className="p-4 border-b border-xone-700 hover:bg-xone-700/20 active:bg-xone-700/40 transition-colors"
            onClick={() => setSelectedWallet(item)}
          >
             <div className="flex justify-between items-start mb-2">
                <div className="flex items-center gap-2">
                   <div className="bg-xone-700 p-1.5 rounded-full text-gray-300">
                      <Wallet size={14} />
                   </div>
                   <div className="font-bold text-white text-sm">{item.label}</div>
                </div>
                <div className="text-right">
                   <div className="text-sm font-bold text-white">${item.totalValueUsd.toLocaleString(undefined, {maximumFractionDigits: 0})}</div>
                   <div className="text-[10px] text-gray-500">Est. Net Worth</div>
                </div>
             </div>
             
             <div className="bg-black/20 p-2 rounded mb-3 flex justify-between items-center" onClick={(e) => { e.stopPropagation(); copyToClipboard(item.address); }}>
                <span className="font-mono text-xs text-gray-400">{item.address.substring(0, 10)}...{item.address.substring(34)}</span>
                <Copy size={12} className="text-gray-500" />
             </div>

             <div className="grid grid-cols-3 gap-2 text-xs mb-3">
                <div className="bg-xone-900/50 p-2 rounded border border-xone-700/30">
                   <div className="text-gray-500 mb-1">USDT</div>
                   <div className="text-gray-200 font-mono">{item.balanceUsdt.toLocaleString(undefined, {maximumFractionDigits: 0})}</div>
                </div>
                 <div className="bg-xone-900/50 p-2 rounded border border-xone-700/30">
                   <div className="text-cyan-600 mb-1">USDX</div>
                   <div className="text-cyan-200 font-mono">{item.balanceUsdx.toLocaleString(undefined, {maximumFractionDigits: 0})}</div>
                </div>
                 <div className="bg-xone-900/50 p-2 rounded border border-xone-700/30">
                   <div className="text-indigo-600 mb-1">B3</div>
                   <div className="text-indigo-200 font-mono">{item.balanceB3.toLocaleString(undefined, {maximumFractionDigits: 0})}</div>
                </div>
             </div>

             <div className="flex justify-between items-center">
                <button 
                  onClick={(e) => { e.stopPropagation(); onRemoveWallet(item.address); }} 
                  className="text-red-400 text-xs flex items-center gap-1 py-1 px-2 hover:bg-red-900/20 rounded"
                >
                   <Trash2 size={12} /> {t('remove')}
                </button>
                <div className="text-xone-accent text-xs flex items-center gap-1">
                   Details <ChevronRight size={14} />
                </div>
             </div>
          </div>
        ))}
        {portfolios.length === 0 && (
          <div className="p-8 text-center text-gray-500 italic text-sm">{t('noWallets')}</div>
        )}
      </div>

      {/* Desktop Table View (Hidden on Small Screens) */}
      <div className="hidden md:block overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-xone-900/30 text-gray-500 text-xs uppercase tracking-wider font-mono border-b border-xone-700/50">
              <th className="p-4">{t('label')} / {t('walletAddress')}</th>
              <th className="p-4 text-right">{t('usdtToken')}</th>
              <th className="p-4 text-right">{t('usdxToken')}</th>
              <th className="p-4 text-right">{t('b3Token')}</th>
              <th className="p-4 text-right">{t('nativeToken')}</th>
              <th className="p-4 text-right text-indigo-300">{t('totalValue')}</th>
              <th className="p-4 text-center">{t('actions')}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-xone-700/30 text-sm">
            {portfolios.map((item) => (
              <tr 
                key={item.address} 
                className="hover:bg-xone-700/20 transition-colors group cursor-pointer"
                onClick={() => setSelectedWallet(item)}
              >
                <td className="p-4">
                  <div className="flex items-center gap-3">
                    <div className="bg-xone-700 p-2 rounded-full text-gray-300 group-hover:bg-xone-600 transition-colors">
                      <Wallet size={16} />
                    </div>
                    <div>
                      <div className="font-bold text-white group-hover:text-xone-accent transition-colors">{item.label}</div>
                      <div className="flex items-center gap-1 text-xs text-gray-500 font-mono mt-0.5" onClick={(e) => { e.stopPropagation(); copyToClipboard(item.address); }}>
                        {item.address.substring(0, 6)}...{item.address.substring(36)}
                        <Copy size={10} className="hover:text-white" />
                      </div>
                    </div>
                  </div>
                </td>
                
                <td className="p-4 text-right font-mono text-gray-300">{item.balanceUsdt.toLocaleString(undefined, {maximumFractionDigits: 2})}</td>
                <td className="p-4 text-right font-mono text-cyan-300">{item.balanceUsdx.toLocaleString(undefined, {maximumFractionDigits: 2})}</td>
                <td className="p-4 text-right font-mono text-indigo-300">{item.balanceB3.toLocaleString(undefined, {maximumFractionDigits: 0})}</td>
                <td className="p-4 text-right font-mono text-gray-400">{item.balanceXoc.toLocaleString(undefined, {maximumFractionDigits: 4})}</td>
                <td className="p-4 text-right font-mono font-bold text-white">${item.totalValueUsd.toLocaleString(undefined, {maximumFractionDigits: 0})}</td>
                <td className="p-4 text-center">
                  <button onClick={(e) => { e.stopPropagation(); onRemoveWallet(item.address); }} className="text-gray-600 hover:text-red-400 transition-colors p-1.5 rounded hover:bg-red-900/20" title={t('remove')}>
                    <Trash2 size={16} />
                  </button>
                </td>
              </tr>
            ))}
            {portfolios.length === 0 && (
              <tr><td colSpan={7} className="p-8 text-center text-gray-500 italic">{t('noWallets')}</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Wallet Detail Modal */}
      {selectedWallet && (
        <div className="absolute inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200 fixed top-0 left-0 right-0 bottom-0 h-screen">
           <div className="bg-xone-900 border border-xone-700 rounded-xl w-full max-w-2xl shadow-2xl flex flex-col max-h-[90vh] overflow-hidden" onClick={(e) => e.stopPropagation()}>
              
              {/* Modal Header */}
              <div className="p-4 md:p-6 border-b border-xone-800 flex justify-between items-start bg-gradient-to-r from-xone-900 to-indigo-950 sticky top-0">
                 <div>
                    <h2 className="text-lg md:text-xl font-bold text-white flex items-center gap-2">
                       {selectedWallet.label}
                       <span className="text-xs bg-xone-800 text-gray-400 px-2 py-0.5 rounded border border-xone-700 hidden sm:inline">WATCHLIST</span>
                    </h2>
                    <div className="flex items-center gap-2 mt-2">
                       <span className="font-mono text-xs md:text-sm text-gray-400 truncate max-w-[150px] md:max-w-none">{selectedWallet.address}</span>
                       <Copy size={14} className="text-gray-500 cursor-pointer hover:text-white" onClick={() => copyToClipboard(selectedWallet.address)} />
                       <a href={`${EXPLORER_URL}/address/${selectedWallet.address}`} target="_blank" rel="noreferrer" className="ml-2 flex items-center gap-1 text-xs text-xone-accent hover:underline">
                          <span className="hidden sm:inline">{t('viewExplorer')}</span> <ExternalLink size={10} />
                       </a>
                    </div>
                 </div>
                 <button onClick={() => setSelectedWallet(null)} className="text-gray-500 hover:text-white p-2">
                    <X size={24} />
                 </button>
              </div>

              {/* Modal Body */}
              <div className="p-4 md:p-6 overflow-y-auto">
                 {/* Asset Summary */}
                 <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4 mb-6 md:mb-8">
                    <div className="bg-xone-800/50 p-3 rounded border border-xone-700/50">
                       <div className="text-[10px] md:text-xs text-gray-500 mb-1">TOTAL VALUE</div>
                       <div className="text-base md:text-lg font-bold text-white">${selectedWallet.totalValueUsd.toLocaleString(undefined, {maximumFractionDigits: 0})}</div>
                    </div>
                    <div className="bg-xone-800/50 p-3 rounded border border-xone-700/50">
                       <div className="text-[10px] md:text-xs text-gray-500 mb-1">B3 BALANCE</div>
                       <div className="text-base md:text-lg font-mono text-indigo-300">{selectedWallet.balanceB3.toLocaleString()}</div>
                    </div>
                    <div className="bg-xone-800/50 p-3 rounded border border-xone-700/50">
                       <div className="text-[10px] md:text-xs text-gray-500 mb-1">USDT BALANCE</div>
                       <div className="text-base md:text-lg font-mono text-green-300">{selectedWallet.balanceUsdt.toLocaleString()}</div>
                    </div>
                     <div className="bg-xone-800/50 p-3 rounded border border-xone-700/50">
                       <div className="text-[10px] md:text-xs text-gray-500 mb-1">USDX BALANCE</div>
                       <div className="text-base md:text-lg font-mono text-cyan-300">{selectedWallet.balanceUsdx.toLocaleString()}</div>
                    </div>
                 </div>

                 {/* Recent Activity (Mock) */}
                 <div>
                    <h3 className="text-sm font-bold text-gray-300 uppercase tracking-wider mb-4 border-l-4 border-xone-accent pl-3">
                       {t('recentActivity')}
                    </h3>
                    <div className="bg-xone-800/30 rounded-lg overflow-hidden border border-xone-700/30">
                       <table className="w-full text-sm text-left">
                          <thead className="bg-xone-900/50 text-gray-500 font-mono text-xs uppercase hidden md:table-header-group">
                             <tr>
                                <th className="p-3">{t('type')}</th>
                                <th className="p-3">{t('token')}</th>
                                <th className="p-3">{t('amount')}</th>
                                <th className="p-3">{t('time')}</th>
                                <th className="p-3">Method</th>
                             </tr>
                          </thead>
                          <tbody className="divide-y divide-xone-700/30 block md:table-row-group">
                             {generateMockActivity(selectedWallet.address).map((tx, idx) => (
                                <tr key={idx} className="hover:bg-xone-700/20 block md:table-row">
                                   <td className="p-3 block md:table-cell flex justify-between md:block">
                                      <span className="md:hidden text-gray-500 text-xs">Type</span>
                                      <span className={`flex items-center gap-1 font-bold text-xs px-2 py-0.5 rounded-full w-fit ${tx.type === 'in' ? 'bg-green-900/30 text-green-400 border border-green-800' : 'bg-red-900/30 text-red-400 border border-red-800'}`}>
                                         {tx.type === 'in' ? <ArrowDownLeft size={12} /> : <ArrowUpRight size={12} />}
                                         {tx.type === 'in' ? 'IN' : 'OUT'}
                                      </span>
                                   </td>
                                   <td className="p-3 font-medium text-white block md:table-cell flex justify-between md:block">
                                      <span className="md:hidden text-gray-500 text-xs">Token</span>
                                      {tx.token}
                                   </td>
                                   <td className="p-3 font-mono text-gray-300 block md:table-cell flex justify-between md:block">
                                      <span className="md:hidden text-gray-500 text-xs">Amount</span>
                                      {tx.amount.toLocaleString()}
                                   </td>
                                   <td className="p-3 text-gray-500 text-xs block md:table-cell flex justify-between md:block">
                                      <span className="md:hidden text-gray-500 text-xs">Time</span>
                                      {tx.time}
                                   </td>
                                   <td className="p-3 text-gray-400 text-xs font-mono md:bg-transparent block md:table-cell text-right md:text-left">
                                      <span className="bg-black/20 rounded px-2 py-1">{tx.method}</span>
                                   </td>
                                </tr>
                             ))}
                          </tbody>
                       </table>
                       <div className="p-2 text-center text-xs text-gray-600 italic bg-xone-900/30">
                          * Simulated data. Connect Indexer API for real history.
                       </div>
                    </div>
                 </div>
              </div>
           </div>
        </div>
      )}

    </div>
  );
};