import React, { useRef, useState } from 'react';
import { Roll, Cut, Unit } from '../types';
import { isSpaceAvailable } from '../services/optimizationEngine';
import { Box } from 'lucide-react';

interface RollVisualizerProps {
  roll: Roll;
  unit?: Unit;
  onSelectCut?: (cut: Cut) => void;
  suggestedPlacement?: { x: number; y: number; width: number; length: number } | null;
  manualMode?: boolean;
  manualDimensions?: { width: number; length: number } | null;
  onManualPlacementChange?: (pos: { x: number; y: number } | null) => void;
}

const CONVERSIONS: Record<Unit, number> = {
  'm': 1,
  'cm': 100,
  'mm': 1000,
  'ft': 3.28084,
  'in': 39.3701
};

const RollVisualizer: React.FC<RollVisualizerProps> = ({ 
  roll, 
  unit = 'm',
  suggestedPlacement, 
  manualMode, 
  manualDimensions,
  onManualPlacementChange 
}) => {
  const [zoom, setZoom] = useState(0.8);
  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const [mousePos, setMousePos] = useState<{ x: number, y: number } | null>(null);

  const SCALE = 35; // 1m = 35px
  const viewWidth = roll.fullLength * SCALE;
  const viewHeight = roll.fullWidth * SCALE;
  const RULER_SIZE = 40;

  const conv = CONVERSIONS[unit];

  // Auto-scroll to suggested placement
  React.useEffect(() => {
    if (suggestedPlacement && containerRef.current) {
      const scrollX = (suggestedPlacement.x * SCALE + RULER_SIZE) * zoom - 100;
      const scrollY = (suggestedPlacement.y * SCALE + RULER_SIZE) * zoom - 100;
      containerRef.current.scrollTo({
        left: Math.max(0, scrollX),
        top: Math.max(0, scrollY),
        behavior: 'smooth'
      });
    }
  }, [suggestedPlacement, zoom]);

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!manualMode || !manualDimensions || !svgRef.current) return;

    const svg = svgRef.current;
    const pt = svg.createSVGPoint();
    pt.x = e.clientX;
    pt.y = e.clientY;
    const cursor = pt.matrixTransform(svg.getScreenCTM()?.inverse());
    
    let meterX = (cursor.x - RULER_SIZE) / SCALE;
    let meterY = (cursor.y - RULER_SIZE) / SCALE;

    meterX = Math.round(meterX * 10) / 10;
    meterY = Math.round(meterY * 10) / 10;

    meterX = Math.max(0, Math.min(roll.fullLength - manualDimensions.length, meterX));
    meterY = Math.max(0, Math.min(roll.fullWidth - manualDimensions.width, meterY));

    setMousePos({ x: meterX, y: meterY });
  };

  const handleClick = (e: React.MouseEvent) => {
    if (manualMode && mousePos && onManualPlacementChange) {
      if (manualDimensions && isSpaceAvailable(roll, mousePos.x, mousePos.y, manualDimensions.width, manualDimensions.length)) {
        onManualPlacementChange(mousePos);
      }
    }
  };

  const lengthMarkers = Array.from({ length: Math.floor(roll.fullLength / 5) + 1 }, (_, i) => i * 5);
  const widthMarkers = Array.from({ length: roll.fullWidth + 1 }, (_, i) => i);

  const formatVal = (m: number) => (m * conv).toFixed(unit === 'm' ? 1 : 0);

  return (
    <div id={`roll-visualizer-${roll.id}`} className={`flex flex-col gap-4 w-full p-6 rounded-3xl border transition-all duration-300 ${manualMode ? 'bg-blue-50/50 border-blue-400 shadow-xl' : 'bg-white border-slate-200 shadow-sm'}`}>
      <div className="flex justify-between items-center px-2">
        <div className="flex items-center gap-4">
          <div className="bg-slate-900 text-white p-3 rounded-2xl shadow-lg shadow-slate-200">
             <Box size={20} />
          </div>
          <div>
            <h3 className="text-xl font-black text-slate-800 flex items-center gap-2 italic uppercase tracking-tight">
              Roll {roll.id} 
              <span className={`text-[10px] px-3 py-1 rounded-full not-italic font-black tracking-widest ${roll.cuts.length > 0 ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700'}`}>
                {roll.cuts.length > 0 ? 'REMNANT' : 'FULL ROLL'}
              </span>
            </h3>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{roll.materialType}</p>
          </div>
        </div>
        <div className="flex bg-slate-100 border border-slate-200 rounded-2xl p-1.5">
          <button onClick={() => setZoom(prev => Math.max(0.2, prev - 0.2))} className="w-8 h-8 flex items-center justify-center text-xs hover:bg-white rounded-xl font-black transition-all">-</button>
          <div className="px-5 text-[10px] font-mono font-black flex items-center text-slate-600">{(zoom * 100).toFixed(0)}%</div>
          <button onClick={() => setZoom(prev => Math.min(2, prev + 0.2))} className="w-8 h-8 flex items-center justify-center text-xs hover:bg-white rounded-xl font-black transition-all">+</button>
        </div>
      </div>

      <div 
        ref={containerRef}
        className={`w-full h-[400px] rounded-3xl overflow-auto border-4 relative transition-all duration-700 ${manualMode ? 'bg-blue-50/30 border-blue-200 cursor-crosshair' : 'bg-slate-50 border-white shadow-inner'}`}
        onMouseMove={handleMouseMove}
        onClick={handleClick}
        onMouseLeave={() => setMousePos(null)}
      >
        <div style={{ width: (viewWidth + RULER_SIZE) * zoom, height: (viewHeight + RULER_SIZE + 40) * zoom, position: 'relative' }}>
          <svg 
            ref={svgRef}
            width={(viewWidth + RULER_SIZE) * zoom} 
            height={(viewHeight + RULER_SIZE + 40) * zoom} 
            viewBox={`0 0 ${viewWidth + RULER_SIZE} ${viewHeight + RULER_SIZE + 40}`}
            className="absolute top-0 left-0"
          >
            <g transform={`translate(${RULER_SIZE}, 0)`}>
              <rect width={viewWidth} height={RULER_SIZE} fill="#f8fafc" stroke="#e2e8f0" />
              {lengthMarkers.map(m => (
                <g key={`l-${m}`} transform={`translate(${m * SCALE}, 0)`}>
                  <line y1="28" y2="40" stroke="#cbd5e1" strokeWidth="2" />
                  <text x="4" y="20" fontSize="10" fill="#64748b" fontWeight="900">{formatVal(m)}{unit}</text>
                </g>
              ))}
            </g>

            <g transform={`translate(0, ${RULER_SIZE})`}>
              <rect width={RULER_SIZE} height={viewHeight} fill="#f8fafc" stroke="#e2e8f0" />
              {widthMarkers.map(m => (
                <g key={`w-${m}`} transform={`translate(0, ${m * SCALE})`}>
                  <line x1="28" x2="40" stroke="#cbd5e1" strokeWidth="2" />
                  <text x="8" y="16" fontSize="10" fill="#64748b" fontWeight="900" transform={`rotate(-90, 8, 16)`}>{formatVal(m)}{unit}</text>
                </g>
              ))}
            </g>

            <g transform={`translate(${RULER_SIZE}, ${RULER_SIZE})`}>
              <rect width={viewWidth} height={viewHeight} fill="#ffffff" stroke="#cbd5e1" strokeWidth="1" />
              {roll.cuts.map((cut) => (
                <g key={cut.id}>
                  <rect 
                    x={cut.x * SCALE} 
                    y={cut.y * SCALE} 
                    width={cut.length * SCALE} 
                    height={cut.width * SCALE} 
                    fill={cut.isInventoryCut ? '#1e293b' : (cut.color || '#334155')} 
                    fillOpacity="0.9" 
                    stroke="#0f172a" 
                    strokeWidth="2" 
                    rx="4" 
                  />
                  <text 
                    x={(cut.x + 0.1) * SCALE} 
                    y={(cut.y + 0.25) * SCALE} 
                    fontSize="10" 
                    fontWeight="black" 
                    fill="white"
                  >
                    {cut.isInventoryCut ? 'INV' : cut.customerName.substring(0, 10)}
                  </text>
                </g>
              ))}

              {suggestedPlacement && (
                <g className="animate-in fade-in zoom-in duration-300">
                  <rect 
                    x={suggestedPlacement.x * SCALE} 
                    y={suggestedPlacement.y * SCALE} 
                    width={suggestedPlacement.length * SCALE} 
                    height={suggestedPlacement.width * SCALE} 
                    fill="rgba(59, 130, 246, 0.15)" 
                    stroke={manualMode ? "#3b82f6" : "#10b981"} 
                    strokeWidth="5" 
                    strokeDasharray="10,5" 
                    className="animate-pulse" 
                    rx="6"
                  />
                </g>
              )}
            </g>
          </svg>
        </div>
      </div>
    </div>
  );
};

export default RollVisualizer;
