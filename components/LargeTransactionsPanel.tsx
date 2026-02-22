import React from 'react';
import { LargeTransaction } from '../types';
import { useTranslation } from '../contexts/LanguageContext';
import { EXPLORER_URL } from '../constants';
import { ExternalLink, Clock, AlertTriangle } from 'lucide-react';

interface LargeTransactionsPanelProps {
  transactions: LargeTransaction[];
  fullHeight?: boolean;
}

export const LargeTransactionsPanel: React.FC<LargeTransactionsPanelProps> = ({ transactions, fullHeight = false }) => {
  const { t } = useTranslation();

  const formatAddress = (addr: string) => `${addr.substring(0, 6)}...${addr.substring(38)}`;
  const formatTime = (ts: number) => new Date(ts).toLocaleString();

  return (
    <div className={`bg-xone-800 border border-xone-700 rounded-xl overflow-hidden shadow-lg flex flex-col ${fullHeight ? 'h-full' : 'h-full'}`}>
      <div className="p-4 border-b border-xone-700 bg-gradient-to-r from-xone-800 to-amber-900/20 flex items-center gap-3">
        <div className="p-2 bg-amber-500/20 rounded-lg text-amber-400">
          <AlertTriangle size={20} />
        </div>
        <div>
          <h3 className="text-base font-bold text-white tracking-wide">{t('largeTransactions')}</h3>
          <p className="text-xs text-gray-400">Swap {'>'} 1000 (USDT / USDX)</p>
        </div>
      </div>

      <div className={`overflow-auto flex-1 ${fullHeight ? '' : 'max-h-[400px]'}`}>
        <table className="w-full text-left border-collapse">
          <thead className="sticky top-0 bg-xone-900/95 backdrop-blur-sm z-10">
            <tr className="text-gray-500 text-xs uppercase tracking-wider font-mono border-b border-xone-700/50">
              <th className="p-3">{t('time')}</th>
              <th className="p-3">{t('from')}</th>
              <th className="p-3 text-right">{t('amount')}</th>
              <th className="p-3 text-center">{t('tx')}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-xone-700/30 text-sm">
            {transactions.map((tx) => (
              <tr key={tx.hash} className="hover:bg-xone-700/20 transition-colors">
                <td className="p-3 text-gray-400 text-xs whitespace-nowrap">
                  <div className="flex items-center gap-1">
                    <Clock size={12} />
                    {formatTime(tx.timestamp)}
                  </div>
                </td>
                <td className="p-3 font-mono text-indigo-300 text-xs">
                  <a 
                    href={`${EXPLORER_URL}/address/${tx.from}`}
                    target="_blank"
                    rel="noreferrer"
                    className="hover:text-white hover:underline"
                  >
                    {formatAddress(tx.from)}
                  </a>
                </td>
                <td className={`p-3 text-right font-mono font-bold ${tx.symbol === 'USDX' ? 'text-cyan-300' : 'text-green-300'}`}>
                  {tx.value.toLocaleString(undefined, { maximumFractionDigits: 2 })} <span className="text-xs opacity-70">{tx.symbol}</span>
                </td>
                <td className="p-3 text-center">
                  <a 
                    href={`${EXPLORER_URL}/tx/${tx.hash}`}
                    target="_blank"
                    rel="noreferrer"
                    className="text-gray-500 hover:text-xone-accent transition-colors inline-block"
                  >
                    <ExternalLink size={14} />
                  </a>
                </td>
              </tr>
            ))}
            {transactions.length === 0 && (
              <tr>
                <td colSpan={4} className="p-8 text-center text-gray-500 italic text-xs">
                  {t('noLargeTransactions')}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};
