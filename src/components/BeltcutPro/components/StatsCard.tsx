import React from 'react';

interface StatsCardProps {
  label: string;
  value: string | number;
  icon: React.ReactNode;
  color: string;
  unit?: string;
}

const StatsCard: React.FC<StatsCardProps> = ({ label, value, icon, color, unit }) => {
  const valueStr = String(value);
  
  // Decide responsive font size based on value length to prevent layout wrapping
  let fontSizeClass = 'text-xl';
  if (valueStr.length > 18) {
    fontSizeClass = 'text-xs';
  } else if (valueStr.length > 14) {
    fontSizeClass = 'text-sm';
  } else if (valueStr.length > 10) {
    fontSizeClass = 'text-base';
  } else if (valueStr.length > 7) {
    fontSizeClass = 'text-lg';
  }

  return (
    <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex items-center gap-3.5 min-w-0 w-full animate-in fade-in slide-in-from-top-2 overflow-hidden">
      <div className={`p-3 rounded-lg ${color} text-white shrink-0`}>
        {icon}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-[9px] text-slate-500 font-black uppercase tracking-wider truncate mb-0.5">{label}</p>
        <div className="flex flex-col justify-end">
          <h3 className={`${fontSizeClass} font-black text-slate-900 leading-tight truncate`} title={`${valueStr}${unit ? ' ' + unit : ''}`}>
            {valueStr}
          </h3>
          {unit && (
            <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest mt-0.5 block leading-none">
              {unit}
            </span>
          )}
        </div>
      </div>
    </div>
  );
};

export default StatsCard;
