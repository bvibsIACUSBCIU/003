import React, { useState, useRef } from 'react';
import { WalletPortfolio, MonitoredWallet } from '../types';
import { useTranslation } from '../contexts/LanguageContext';
import { EXPLORER_URL } from '../constants';
import { Shield, Copy, Plus, Trash2, Wallet, Download, Upload, X, ExternalLink, ChevronRight, DollarSign, Coins, Vault } from 'lucide-react';

interface MultiSigVaultPanelProps {
  portfolios: WalletPortfolio[];
  onAddWallet: (address: string, label: string) => void;
  onRemoveWallet: (address: string) => void;
  onImportWallets: (wallets: MonitoredWallet[]) => void;
}

export const MultiSigVaultPanel: React.FC<MultiSigVaultPanelProps> = ({ portfolios, onAddWallet, onRemoveWallet, onImportWallets }) => {
  const { t } = useTranslation();
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  // Local state for inputs
  const [newAddress, setNewAddress] = useState('');
  const [newLabel, setNewLabel] = useState('');

  // Modal State
  const [selectedWallet, setSelectedWallet] = useState<WalletPortfolio | null>(null);

  const handleAdd = () => {
    if (!newAddress) return;
    onAddWallet(newAddress, newLabel || 'Vault');
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
    downloadAnchorNode.setAttribute("download", "xone_vault_config.json");
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
    <div className="bg-xone-800 border border-xone-700 rounded-xl overflow-hidden shadow-lg flex flex-col relative h-full">
      
      {/* Header & Add Form */}
      <div className="p-4 md:p-6 border-b border-xone-700 bg-gradient-to-r from-xone-800 to-amber-900/20">
        <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-amber-500/20 rounded-lg text-amber-400">
              <Vault size={20} />
            </div>
            <div>
              <h3 className="text-base md:text-lg font-bold text-white tracking-wide">{t('multiSigVault')}</h3>
              <p className="text-xs text-gray-400 hidden sm:block">Monitor Multi-Sig Vaults on XONE Chain</p>
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
              <button onClick={handleAdd} disabled={!newAddress} className="bg-amber-500 hover:bg-amber-400 text-xone-900 p-2 rounded text-xs font-bold flex items-center gap-1 transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
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
                      <Vault size={14} />
                   </div>
                   <div className="font-bold text-white text-sm">{item.label}</div>
                </div>
                <div className="text-right">
                   <div className="text-sm font-bold text-white">${item.totalValueUsd.toLocaleString(undefined, {maximumFractionDigits: 0})}</div>
                   <div className="text-[10px] text-gray-500">Est. Value</div>
                </div>
             </div>
             
             <div className="bg-black/20 p-2 rounded mb-3 flex justify-between items-center" onClick={(e) => { e.stopPropagation(); copyToClipboard(item.address); }}>
                <span className="font-mono text-xs text-gray-400">{item.address.substring(0, 10)}...{item.address.substring(34)}</span>
                <Copy size={12} className="text-gray-500" />
             </div>

             <div className="grid grid-cols-2 gap-2 text-xs mb-3">
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
                <div className="bg-xone-900/50 p-2 rounded border border-xone-700/30">
                   <div className="text-gray-400 mb-1">XOC</div>
                   <div className="text-gray-200 font-mono">{item.balanceXoc.toLocaleString(undefined, {maximumFractionDigits: 2})}</div>
                </div>
             </div>

             <div className="flex justify-between items-center">
                <button 
                  onClick={(e) => { e.stopPropagation(); onRemoveWallet(item.address); }} 
                  className="text-red-400 text-xs flex items-center gap-1 py-1 px-2 hover:bg-red-900/20 rounded"
                >
                   <Trash2 size={12} /> {t('remove')}
                </button>
                <div className="text-amber-500 text-xs flex items-center gap-1">
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
      <div className="hidden md:block overflow-x-auto flex-1">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-xone-900/30 text-gray-500 text-xs uppercase tracking-wider font-mono border-b border-xone-700/50">
              <th className="p-4">{t('label')} / {t('walletAddress')}</th>
              <th className="p-4 text-right">{t('usdtToken')}</th>
              <th className="p-4 text-right">{t('usdxToken')}</th>
              <th className="p-4 text-right">{t('b3Token')}</th>
              <th className="p-4 text-right">{t('nativeToken')}</th>
              <th className="p-4 text-right text-amber-300">{t('totalValue')}</th>
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
                      <Vault size={16} />
                    </div>
                    <div>
                      <div className="font-bold text-white group-hover:text-amber-400 transition-colors">{item.label}</div>
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
           <div className="bg-xone-900 border border-xone-700 rounded-xl w-full max-w-2xl shadow-2xl flex flex-col max-h-[90vh] overflow-hidden relative" onClick={(e) => e.stopPropagation()}>
              
              {/* Modal Header */}
              <div className="p-6 border-b border-xone-800 flex justify-between items-start bg-gradient-to-r from-xone-900 to-amber-950">
                 <div>
                    <h2 className="text-xl md:text-2xl font-bold text-white flex items-center gap-2">
                       {selectedWallet.label}
                    </h2>
                    <div className="flex items-center gap-2 mt-2 bg-black/20 px-3 py-1 rounded-full w-fit border border-white/5">
                       <span className="font-mono text-sm text-gray-300">{selectedWallet.address}</span>
                       <Copy size={14} className="text-gray-500 cursor-pointer hover:text-white" onClick={() => copyToClipboard(selectedWallet.address)} />
                    </div>
                 </div>
                 <button onClick={() => setSelectedWallet(null)} className="text-gray-500 hover:text-white p-2 rounded-full hover:bg-white/10 transition-colors">
                    <X size={24} />
                 </button>
              </div>

              {/* Modal Body */}
              <div className="p-6 overflow-y-auto flex-1 bg-[#0b1121]">
                 
                 {/* Total Value Hero */}
                 <div className="text-center mb-8">
                    <div className="text-sm text-gray-400 uppercase tracking-widest mb-1">{t('totalValue')}</div>
                    <div className="text-4xl md:text-5xl font-bold text-white tracking-tight">
                       ${selectedWallet.totalValueUsd.toLocaleString(undefined, {maximumFractionDigits: 0})}
                    </div>
                 </div>

                 {/* Big Asset Cards - Focusing on the requested data */}
                 <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
                    
                    {/* USDT Card */}
                    <div className="bg-xone-800 rounded-xl p-5 border border-xone-700 relative overflow-hidden group">
                       <div className="absolute right-0 top-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                          <DollarSign size={80} />
                       </div>
                       <div className="flex items-center gap-2 mb-2">
                          <div className="w-8 h-8 rounded-full bg-green-900/30 flex items-center justify-center text-green-400 border border-green-800">
                             <DollarSign size={16} />
                          </div>
                          <span className="text-gray-400 font-bold">USDT</span>
                       </div>
                       <div className="text-2xl font-mono text-white font-bold">{selectedWallet.balanceUsdt.toLocaleString()}</div>
                    </div>

                    {/* USDX Card */}
                    <div className="bg-xone-800 rounded-xl p-5 border border-xone-700 relative overflow-hidden group">
                       <div className="absolute right-0 top-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                          <Coins size={80} />
                       </div>
                       <div className="flex items-center gap-2 mb-2">
                          <div className="w-8 h-8 rounded-full bg-cyan-900/30 flex items-center justify-center text-cyan-400 border border-cyan-800">
                             <Coins size={16} />
                          </div>
                          <span className="text-gray-400 font-bold">USDX</span>
                       </div>
                       <div className="text-2xl font-mono text-white font-bold">{selectedWallet.balanceUsdx.toLocaleString()}</div>
                    </div>

                    {/* B3 Card */}
                    <div className="bg-xone-800 rounded-xl p-5 border border-xone-700 relative overflow-hidden group">
                       <div className="absolute right-0 top-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                          <Coins size={80} />
                       </div>
                       <div className="flex items-center gap-2 mb-2">
                          <div className="w-8 h-8 rounded-full bg-indigo-900/30 flex items-center justify-center text-indigo-400 border border-indigo-800">
                             <Coins size={16} />
                          </div>
                          <span className="text-gray-400 font-bold">B3</span>
                       </div>
                       <div className="text-2xl font-mono text-white font-bold">{selectedWallet.balanceB3.toLocaleString()}</div>
                    </div>

                    {/* XOC Card */}
                    <div className="bg-xone-800 rounded-xl p-5 border border-xone-700 relative overflow-hidden group">
                       <div className="absolute right-0 top-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                          <Coins size={80} />
                       </div>
                       <div className="flex items-center gap-2 mb-2">
                          <div className="w-8 h-8 rounded-full bg-gray-700/30 flex items-center justify-center text-gray-400 border border-gray-600">
                             <Coins size={16} />
                          </div>
                          <span className="text-gray-400 font-bold">XOC</span>
                       </div>
                       <div className="text-2xl font-mono text-white font-bold">{selectedWallet.balanceXoc.toLocaleString()}</div>
                    </div>

                 </div>

                 {/* Call to Action for History */}
                 <div className="mt-8 pt-8 border-t border-xone-800 flex flex-col items-center">
                    <p className="text-gray-500 text-sm mb-4">View detailed transaction history on XONE Explorer</p>
                    <a 
                       href={`${EXPLORER_URL}/address/${selectedWallet.address}`} 
                       target="_blank" 
                       rel="noreferrer" 
                       className="flex items-center gap-2 px-8 py-4 bg-amber-500 hover:bg-amber-400 text-xone-900 rounded-lg font-bold transition-all shadow-lg shadow-amber-500/20 w-full md:w-auto justify-center"
                    >
                       {t('viewExplorer')} <ExternalLink size={18} />
                    </a>
                 </div>

              </div>
           </div>
        </div>
      )}

    </div>
  );
};
