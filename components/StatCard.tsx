import React from 'react';

interface StatCardProps {
  label: string;
  value: string | number;
  subValue?: string;
  trend?: 'up' | 'down' | 'neutral';
  trendValue?: string;
  icon?: React.ReactNode;
}

export const StatCard: React.FC<StatCardProps> = ({ label, value, subValue, trend, trendValue, icon }) => {
  return (
    <div className="bg-xone-800 border border-xone-700 rounded-xl p-6 relative overflow-hidden group hover:border-xone-500 transition-colors duration-300">
      <div className="flex justify-between items-start mb-4">
        <div>
          <p className="text-gray-400 text-sm font-medium uppercase tracking-wider">{label}</p>
          <h3 className="text-2xl font-bold text-white mt-1">{value}</h3>
          {subValue && <p className="text-gray-500 text-xs mt-1">{subValue}</p>}
        </div>
        {icon && (
          <div className="p-3 bg-xone-700 rounded-lg text-xone-accent group-hover:bg-xone-600 transition-colors">
            {icon}
          </div>
        )}
      </div>
      
      {trendValue && (
        <div className={`flex items-center text-sm ${trend === 'up' ? 'text-xone-success' : trend === 'down' ? 'text-xone-danger' : 'text-gray-400'}`}>
           <span className="font-semibold">{trend === 'up' ? '+' : trend === 'down' ? '-' : ''}{trendValue}</span>
           <span className="ml-1 text-gray-500">vs yesterday</span>
        </div>
      )}
    </div>
  );
};