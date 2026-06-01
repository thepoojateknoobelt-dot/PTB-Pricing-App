import React from 'react';

interface StatsCardProps {
  label: string;
  value: string | number;
  icon: React.ReactNode;
  color: string;
}

const StatsCard: React.FC<StatsCardProps> = ({ label, value, icon, color }) => (
  <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex items-center gap-4 animate-in fade-in slide-in-from-top-2">
    <div className={`p-3 rounded-lg ${color} text-white`}>
      {icon}
    </div>
    <div>
      <p className="text-sm text-slate-500 font-medium">{label}</p>
      <h3 className="text-xl font-bold text-slate-800">{value}</h3>
    </div>
  </div>
);

export default StatsCard;
