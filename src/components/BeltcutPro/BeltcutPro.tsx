import React, { useState, useEffect, useMemo } from 'react';
import { 
  Package, Layers, Scissors, AlertTriangle, Plus, Trash2, 
  ChevronRight, ChevronLeft, TrendingDown, Info, 
  RotateCcw, Wand2, BarChart3, Loader2, Warehouse, User,
  ArrowLeft, X, Menu
} from 'lucide-react';
import { 
  saveRoll, updateRoll, deleteRoll, saveCut, fetchRolls, OperationType 
} from './services/firebase';
import { Roll, Cut, Order, OptimizationCandidate, Unit } from './types';
import { 
  MATERIAL_TYPES, 
  CUT_COLORS 
} from './constants';
import { findGlobalBestPlacement } from './services/optimizationEngine';
import RollVisualizer from './components/RollVisualizer';
import StatsCard from './components/StatsCard';

const CONVERSIONS: Record<Unit, number> = {
  'm': 1,
  'cm': 100,
  'mm': 1000,
  'ft': 3.28084,
  'in': 39.3701
};

interface BeltcutProProps {
  onBackToMaster?: () => void;
}

export const BeltcutPro: React.FC<BeltcutProProps> = ({ onBackToMaster }) => {
  const [currentUnit, setCurrentUnit] = useState<Unit>('m');
  const [rolls, setRolls] = useState<Roll[]>([]);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  const [activeTab, setActiveTab] = useState<'dashboard' | 'cutting' | 'stock'>('dashboard');
  const [cuttingMode, setCuttingMode] = useState<'auto' | 'manual'>('auto');
  const [isSyncing, setIsSyncing] = useState(true);
  const [showAddRollForm, setShowAddRollForm] = useState(false);

  // Sync with local database REST API
  const loadRollsData = async () => {
    try {
      const rollsData = await fetchRolls();
      if (rollsData) {
        setRolls(rollsData);
      }
    } catch (err) {
      console.error("Failed to load rolls:", err);
    } finally {
      setIsSyncing(false);
    }
  };

  useEffect(() => {
    setIsSyncing(true);
    loadRollsData();
    // Set up a polling interval for visual updates every 4 seconds
    const interval = setInterval(loadRollsData, 4000);
    return () => clearInterval(interval);
  }, []);
  
  const [selectedOrder, setSelectedOrder] = useState<Order>({
    id: `O-${Math.floor(Math.random() * 1000)}`,
    customerName: '',
    requiredWidth: 1.5,
    requiredLength: 20,
    quantity: 1,
    materialType: MATERIAL_TYPES[0],
    date: new Date().toISOString(),
    isInventoryCut: false
  });

  const [newRoll, setNewRoll] = useState({
    id: `R-${rolls.length + 101}`,
    materialType: MATERIAL_TYPES[0],
    fullWidth: 4,
    fullLength: 115
  });

  const [optimizationResults, setOptimizationResults] = useState<OptimizationCandidate[]>([]);
  const [currentOptionIndex, setCurrentOptionIndex] = useState(0);
  const [manualPlacement, setManualPlacement] = useState<{ rollId: string; placement: { x: number; y: number } } | null>(null);

  const stats = useMemo(() => {
    const total = rolls.reduce((acc, r) => acc + r.totalSqm, 0);
    const used = rolls.reduce((acc, r) => acc + r.cuts.reduce((sum, c) => sum + (c.width * c.length), 0), 0);
    
    let calculatedWaste = 0;
    rolls.forEach(r => {
      if (r.remainingSqm < r.totalSqm * 0.1) calculatedWaste += r.remainingSqm;
      else calculatedWaste += used * 0.02; 
    });

    const factor = currentUnit === 'm' ? 1 : (CONVERSIONS[currentUnit] * CONVERSIONS[currentUnit]);

    return {
      totalAvailable: (total - used) * factor,
      efficiency: total > 0 ? (((used - calculatedWaste) / total) * 100).toFixed(1) : 0,
      activeRolls: rolls.length,
      totalWastage: calculatedWaste * factor
    };
  }, [rolls, currentUnit]);

  const currentResult = cuttingMode === 'auto' ? (optimizationResults[currentOptionIndex] || null) : manualPlacement;

  useEffect(() => {
    if (currentResult && (currentResult as any).rollId) {
      const element = document.getElementById(`roll-visualizer-${(currentResult as any).rollId}`);
      if (element) {
        element.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }
  }, [currentResult]);

  const toMeters = (val: number) => val / CONVERSIONS[currentUnit];
  const fromMeters = (val: number) => val * CONVERSIONS[currentUnit];

  const handleCalculateBestFit = () => {
    if (!selectedOrder.isInventoryCut && !selectedOrder.customerName.trim()) {
      alert("Party Name is compulsory for client orders.");
      return;
    }
    const results = findGlobalBestPlacement(rolls, selectedOrder);
    setOptimizationResults(results);
    setCurrentOptionIndex(0);
    setCuttingMode('auto');
    if (results.length === 0) {
      alert("No suitable placement found in existing inventory remnants. Try adding a new roll.");
    }
  };

  const handleExecuteCut = async () => {
    if (!currentResult) return;
    if (!selectedOrder.isInventoryCut && !selectedOrder.customerName.trim()) {
      alert("Party Name is compulsory.");
      return;
    }

    setIsSyncing(true);
    const { rollId, placement } = currentResult as any;
    const newCut: Cut = {
      id: `C-${Date.now()}`,
      orderId: selectedOrder.id,
      customerName: selectedOrder.isInventoryCut ? 'INTERNAL STOCK' : selectedOrder.customerName,
      width: selectedOrder.requiredWidth,
      length: selectedOrder.requiredLength,
      x: placement.x,
      y: placement.y,
      status: 'completed',
      color: selectedOrder.isInventoryCut ? '#1e293b' : CUT_COLORS[Math.floor(Math.random() * CUT_COLORS.length)],
      isInventoryCut: selectedOrder.isInventoryCut
    };

    const targetRoll = rolls.find(r => r.id === rollId);
    if (targetRoll) {
      try {
        // 1. Update the remaining area in the main roll
        await updateRoll(rollId, {
          remainingSqm: targetRoll.remainingSqm - (newCut.width * newCut.length)
        });
        // 2. Save the new cut in the database
        await saveCut(rollId, newCut);
        // 3. Reload rolls data
        await loadRollsData();
      } catch (err) {
        console.error("Error executing cut:", err);
        alert("Failed to execute cut. Please try again.");
      }
    }

    setOptimizationResults([]);
    setCurrentOptionIndex(0);
    setManualPlacement(null);
    setSelectedOrder({
      ...selectedOrder,
      id: `O-${Math.floor(Math.random() * 1000)}`,
      customerName: '',
      isInventoryCut: false
    });
    setIsSyncing(false);
  };

  const handleAddRoll = async () => {
    setIsSyncing(true);
    const newRollEntry: Roll = {
      id: newRoll.id,
      materialType: newRoll.materialType,
      fullWidth: newRoll.fullWidth,
      fullLength: newRoll.fullLength,
      totalSqm: newRoll.fullWidth * newRoll.fullLength,
      remainingSqm: newRoll.fullWidth * newRoll.fullLength,
      isArchived: false,
      cuts: []
    };
    
    try {
      await saveRoll(newRollEntry);
      await loadRollsData();
    } catch (err) {
      console.error("Error adding roll:", err);
      alert("Failed to add roll. Please try again.");
    }
    
    setShowAddRollForm(false);
    setNewRoll({
      id: `R-${rolls.length + 102}`,
      materialType: MATERIAL_TYPES[0],
      fullWidth: 4,
      fullLength: 115
    });
    setIsSyncing(false);
  };

  const handleDeleteRoll = async (rollId: string) => {
    if (window.confirm("Are you sure you want to delete this roll?")) {
      setIsSyncing(true);
      try {
        await deleteRoll(rollId);
        await loadRollsData();
      } catch (err) {
        console.error("Error deleting roll:", err);
        alert("Failed to delete roll. Please try again.");
      }
      setIsSyncing(false);
    }
  };

  const areaUnit = currentUnit === 'm' ? 'm²' : `${currentUnit}²`;
  return (
    <div className="flex h-screen bg-zinc-50 overflow-hidden relative w-full text-slate-900">
      {isSyncing && (
        <div className="absolute inset-0 bg-white/50 backdrop-blur-[2px] z-50 flex items-center justify-center">
          <div className="bg-slate-900 text-white px-6 py-4 rounded-2xl shadow-2xl flex items-center gap-3">
            <Loader2 className="animate-spin text-blue-400" />
            <span className="font-black text-xs uppercase tracking-widest">Syncing with Database...</span>
          </div>
        </div>
      )}

      {/* Beltcut Pro Sidebar */}
      <aside className={`w-64 bg-zinc-950 text-zinc-400 flex flex-col border-r border-zinc-800 shrink-0 transition-transform duration-300 ease-in-out fixed inset-y-0 left-0 z-50 lg:static lg:translate-x-0 ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        {/* Sidebar Header */}
        <div className="p-6 flex items-center justify-between gap-3 border-b border-white/5">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-white rounded-xl shadow-md">
              <RotateCcw className="h-6 w-6 text-zinc-950 animate-spin-slow" />
            </div>
            <div className="flex flex-col">
              <span className="text-white font-black text-lg tracking-tight leading-none uppercase">BELTCUT <span className="text-[10px] bg-zinc-800 text-white px-1.5 py-0.5 rounded not-italic font-bold">PRO</span></span>
              <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider mt-1">Nesting Portal</span>
            </div>
          </div>
          <button
            onClick={() => setIsSidebarOpen(false)}
            className="lg:hidden p-1.5 text-zinc-500 hover:text-white hover:bg-zinc-800 rounded-xl transition-colors cursor-pointer"
            aria-label="Close Sidebar"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Master Dashboard Link */}
        {onBackToMaster && (
          <div className="px-4 mt-4">
            <button
              type="button"
              onClick={onBackToMaster}
              className="w-full flex items-center gap-3 px-4 py-2.5 bg-zinc-900 hover:bg-zinc-850 text-zinc-200 hover:text-white rounded-xl text-xs font-bold transition-all cursor-pointer border border-white/5"
            >
              <ArrowLeft className="h-4 w-4 text-zinc-400" />
              Master Dashboard
            </button>
          </div>
        )}

        {/* Navigation Tabs */}
        <nav className="flex-1 px-4 space-y-1 mt-6">
          {[
            { id: 'dashboard', label: 'Overview', icon: BarChart3 },
            { id: 'cutting', label: 'Cutting System', icon: Scissors },
            { id: 'stock', label: 'Inventory', icon: Package },
          ].map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                type="button"
                key={tab.id}
                onClick={() => {
                  setActiveTab(tab.id as any);
                  setIsSidebarOpen(false);
                }}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all duration-200 cursor-pointer ${
                  isActive
                    ? 'bg-white text-zinc-950 shadow-lg shadow-black/20 font-bold'
                    : 'hover:bg-zinc-900 hover:text-zinc-200'
                }`}
              >
                <Icon className={`h-5 w-5 ${isActive ? 'text-zinc-950' : 'text-zinc-500'}`} />
                {tab.label}
              </button>
            );
          })}
        </nav>

        {/* Sidebar Footer with Unit Selector */}
        <div className="p-4 border-t border-white/5 space-y-3">
          <div className="px-4">
            <span className="text-[9px] font-black uppercase tracking-widest text-zinc-500 block mb-2">Display Unit</span>
            <div className="grid grid-cols-5 gap-1 bg-zinc-900 p-1 rounded-xl border border-white/5">
              {(['m', 'cm', 'mm', 'ft', 'in'] as Unit[]).map((u) => (
                <button
                  key={u}
                  type="button"
                  onClick={() => setCurrentUnit(u)}
                  className={`py-1.5 rounded-lg text-[9px] font-black transition-all cursor-pointer ${
                    currentUnit === u
                      ? 'bg-white text-zinc-950'
                      : 'text-zinc-500 hover:text-zinc-200'
                  }`}
                >
                  {u.toUpperCase()}
                </button>
              ))}
            </div>
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 overflow-y-auto p-4 sm:p-8 bg-zinc-50/50">
        <div className="max-w-7xl mx-auto">
          {/* Mobile Header Bar */}
          <div className="flex lg:hidden items-center justify-between p-3.5 mb-6 bg-zinc-950 text-white rounded-2xl border border-zinc-850 shadow-md">
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setIsSidebarOpen(true)}
                className="p-2 text-zinc-400 hover:text-white hover:bg-zinc-900 rounded-xl transition-all cursor-pointer animate-pulse"
                aria-label="Open Menu"
              >
                <Menu className="h-5 w-5" />
              </button>
              <span className="font-black text-sm uppercase tracking-tight">BELTCUT <span className="text-[9px] bg-zinc-850 text-white px-1.5 py-0.5 rounded not-italic font-bold">PRO</span></span>
            </div>
            <span className="text-[9px] font-black text-emerald-400 uppercase tracking-widest bg-zinc-900 border border-emerald-500/20 px-2.5 py-1 rounded-lg">
              Nesting
            </span>
          </div>

          {/* Header section in content */}
          <div className="pb-6 border-b border-zinc-200 mb-8">
            <h2 className="text-3xl font-black text-zinc-950 uppercase tracking-tight">
              {activeTab === 'dashboard' && 'Inventory Overview'}
              {activeTab === 'cutting' && 'Cutting & Optimization'}
              {activeTab === 'stock' && 'Stock Registry'}
            </h2>
            <p className="text-xs text-zinc-500 mt-1">
              {activeTab === 'dashboard' && 'Visual breakdown of active inventory remnants and efficiency.'}
              {activeTab === 'cutting' && 'Select order dimensions to find the optimal cut with minimum waste.'}
              {activeTab === 'stock' && 'Manage master rolls and register raw inventory materials.'}
            </p>
          </div>

          {activeTab === 'dashboard' && (
            <div className="space-y-10">
              <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                <StatsCard label="Available" value={`${stats.totalAvailable.toFixed(1)} ${areaUnit}`} icon={<Package size={24} />} color="bg-zinc-900" />
                <StatsCard label="Efficiency" value={`${stats.efficiency}%`} icon={<TrendingDown size={24} />} color="bg-emerald-600" />
                <StatsCard label="Active Stock" value={stats.activeRolls} icon={<Layers size={24} />} color="bg-violet-600" />
                <StatsCard label="Est. Waste" value={`${stats.totalWastage.toFixed(1)} ${areaUnit}`} icon={<AlertTriangle size={24} />} color="bg-amber-600" />
              </div>
              <div className="grid grid-cols-1 gap-6 mt-6">
                {rolls.map(roll => <RollVisualizer key={roll.id} roll={roll} unit={currentUnit} />)}
              </div>
            </div>
          )}

          {activeTab === 'cutting' && (
            <div className="grid grid-cols-1 xl:grid-cols-12 gap-8">
              <div className="xl:col-span-4 space-y-6">
                <div className="bg-white p-6 rounded-3xl border border-zinc-200 shadow-sm">
                  <div className="space-y-6">
                    <div className="flex items-center justify-between">
                       <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Cut Purpose</label>
                       <div className="flex items-center gap-2">
                          <button onClick={() => setSelectedOrder({...selectedOrder, isInventoryCut: false})} className={`px-3 py-1 rounded-lg text-[10px] font-black transition-all cursor-pointer ${!selectedOrder.isInventoryCut ? 'bg-zinc-950 text-white' : 'bg-slate-100 text-slate-400'}`}>CLIENT</button>
                          <button onClick={() => setSelectedOrder({...selectedOrder, isInventoryCut: true})} className={`px-3 py-1 rounded-lg text-[10px] font-black transition-all cursor-pointer ${selectedOrder.isInventoryCut ? 'bg-zinc-950 text-white' : 'bg-slate-100 text-slate-400'}`}>INVENTORY</button>
                       </div>
                    </div>

                    {!selectedOrder.isInventoryCut && (
                      <div className="space-y-1.5">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-1">
                          <User size={12}/> Party Name <span className="text-red-500">*</span>
                        </label>
                        <input type="text" value={selectedOrder.customerName} onChange={(e) => setSelectedOrder({...selectedOrder, customerName: e.target.value})} placeholder="Enter Customer Name" className="w-full px-4 py-3 border-2 border-slate-100 rounded-xl focus:border-zinc-900 focus:outline-none font-bold text-sm" />
                      </div>
                    )}

                    {selectedOrder.isInventoryCut && (
                      <div className="p-4 bg-slate-900 rounded-2xl flex items-center gap-3 text-white">
                        <Warehouse size={20} className="text-blue-400"/>
                        <div>
                          <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Inventory Stocking</p>
                          <p className="text-xs font-bold">Cutting for common size stock</p>
                        </div>
                      </div>
                    )}

                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-1.5">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Width ({currentUnit})</label>
                        <input type="number" step="0.01" value={fromMeters(selectedOrder.requiredWidth)} onChange={(e) => setSelectedOrder({...selectedOrder, requiredWidth: toMeters(parseFloat(e.target.value))})} className="w-full px-4 py-3 border-2 border-slate-100 rounded-xl focus:border-zinc-950 focus:outline-none font-bold text-lg" />
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Length ({currentUnit})</label>
                        <input type="number" step="0.01" value={fromMeters(selectedOrder.requiredLength)} onChange={(e) => setSelectedOrder({...selectedOrder, requiredLength: toMeters(parseFloat(e.target.value))})} className="w-full px-4 py-3 border-2 border-slate-100 rounded-xl focus:border-zinc-950 focus:outline-none font-bold text-lg" />
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Belt Material Type</label>
                      <select 
                        value={selectedOrder.materialType} 
                        onChange={(e) => setSelectedOrder({...selectedOrder, materialType: e.target.value})} 
                        className="w-full px-4 py-3 border-2 border-slate-100 rounded-xl focus:border-zinc-950 focus:outline-none font-bold text-sm bg-white"
                      >
                        {MATERIAL_TYPES.map(type => <option key={type} value={type}>{type}</option>)}
                      </select>
                    </div>

                    <button onClick={handleCalculateBestFit} className="w-full bg-zinc-900 text-white font-black py-3.5 rounded-xl hover:bg-zinc-800 transition shadow-sm flex items-center justify-center gap-2 text-sm cursor-pointer">
                      <Wand2 size={16}/> FIND BEST PIECE
                    </button>
                    <button onClick={() => { setCuttingMode(prev => prev === 'manual' ? 'auto' : 'manual'); }} className="w-full bg-zinc-100 text-zinc-700 font-black py-3 rounded-xl hover:bg-zinc-200 transition text-xs cursor-pointer">
                      {cuttingMode === 'manual' ? 'EXIT MANUAL' : 'MANUAL PLACEMENT'}
                    </button>
                  </div>
                </div>

                {currentResult && (
                  <div className="bg-slate-900 text-white p-6 rounded-3xl shadow-xl animate-in slide-in-from-bottom-5">
                     <div className="mb-4 flex justify-between items-center">
                       <h4 className="font-black text-lg text-blue-400 italic uppercase">Placement Found</h4>
                       {optimizationResults.length > 1 && cuttingMode === 'auto' && (
                         <div className="flex gap-2">
                           <button onClick={() => setCurrentOptionIndex(prev => (prev - 1 + optimizationResults.length) % optimizationResults.length)} className="p-2 bg-slate-800 rounded-lg cursor-pointer"><ChevronLeft size={14}/></button>
                           <button onClick={() => setCurrentOptionIndex(prev => (prev + 1) % optimizationResults.length)} className="p-2 bg-slate-800 rounded-lg cursor-pointer"><ChevronRight size={14}/></button>
                         </div>
                       )}
                     </div>
                     <div className="space-y-3 mb-6">
                       <div className="flex justify-between border-b border-slate-800 pb-2"><span className="text-slate-500 text-[10px] font-bold uppercase">Roll ID</span><span className="font-bold text-white text-xs">{currentResult.rollId}</span></div>
                       <div className="flex justify-between"><span className="text-slate-500 text-[10px] font-bold uppercase">Match Type</span><span className="font-bold text-emerald-400 text-xs">{(currentResult as any).reason}</span></div>
                     </div>
                     <button onClick={handleExecuteCut} className="w-full bg-emerald-600 text-white font-black py-3.5 rounded-xl hover:bg-emerald-500 transition shadow-lg active:scale-95 text-xs uppercase tracking-wider cursor-pointer">
                       EXECUTE CUT
                     </button>
                  </div>
                )}
              </div>

              <div className="xl:col-span-8 space-y-8">
                <div className="bg-white p-6 rounded-3xl border border-zinc-200 shadow-sm min-h-[600px]">
                  <h3 className="text-lg font-black mb-6 text-slate-800 flex items-center gap-2 italic uppercase">
                    <Info size={20} className="text-zinc-800" /> Remnant Matching Visualization
                  </h3>
                  <div className="space-y-8">
                    {rolls.filter(r => r.materialType === selectedOrder.materialType).map(roll => (
                      <RollVisualizer 
                        key={roll.id} 
                        roll={roll} 
                        unit={currentUnit}
                        manualMode={cuttingMode === 'manual'}
                        manualDimensions={{ width: selectedOrder.requiredWidth, length: selectedOrder.requiredLength }}
                        onManualPlacementChange={(pos) => setManualPlacement(pos ? { rollId: roll.id, placement: pos } : null)}
                        suggestedPlacement={(cuttingMode === 'auto' && currentResult?.rollId === roll.id) ? { ...(currentResult as any).placement, width: selectedOrder.requiredWidth, length: selectedOrder.requiredLength } : null}
                      />
                    ))}
                    {rolls.filter(r => r.materialType === selectedOrder.materialType).length === 0 && (
                      <div className="py-20 flex flex-col items-center justify-center border-2 border-dashed border-zinc-200 rounded-2xl text-zinc-400 text-sm font-medium">
                        No master rolls active for material grade: {selectedOrder.materialType}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'stock' && (
            <div className="space-y-8">
              <div className="bg-white p-6 rounded-3xl border border-zinc-200 shadow-sm flex justify-between items-center">
                 <h3 className="text-xl font-black text-slate-800 uppercase italic">Stock Registry</h3>
                 <button onClick={() => setShowAddRollForm(!showAddRollForm)} className="px-5 py-3 bg-zinc-950 text-white rounded-xl font-black text-xs hover:bg-zinc-800 transition flex items-center gap-2 cursor-pointer">
                   <Plus size={14}/> ADD MASTER ROLL
                 </button>
              </div>
              {showAddRollForm && (
                 <div className="bg-white p-6 rounded-3xl border-2 border-zinc-950 shadow-sm animate-in fade-in slide-in-from-top-3">
                    <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
                      <input type="text" value={newRoll.id} onChange={(e) => setNewRoll({...newRoll, id: e.target.value})} placeholder="Roll ID" className="px-4 py-3 border rounded-xl font-bold text-sm bg-white" />
                      <select value={newRoll.materialType} onChange={(e) => setNewRoll({...newRoll, materialType: e.target.value})} className="px-4 py-3 border rounded-xl font-bold text-sm bg-white">
                        {MATERIAL_TYPES.map(type => <option key={type} value={type}>{type}</option>)}
                      </select>
                      <input type="number" value={fromMeters(newRoll.fullWidth)} onChange={(e) => setNewRoll({...newRoll, fullWidth: toMeters(parseFloat(e.target.value))})} placeholder={`Width (${currentUnit})`} className="px-4 py-3 border rounded-xl font-bold text-sm bg-white" />
                      <input type="number" value={fromMeters(newRoll.fullLength)} onChange={(e) => setNewRoll({...newRoll, fullLength: toMeters(parseFloat(e.target.value))})} placeholder={`Length (${currentUnit})`} className="px-4 py-3 border rounded-xl font-bold text-sm bg-white" />
                      <button onClick={handleAddRoll} className="bg-emerald-600 text-white font-black py-3 rounded-xl hover:bg-emerald-500 transition text-xs cursor-pointer">SAVE</button>
                    </div>
                 </div>
              )}
              <div className="bg-white rounded-3xl border border-zinc-200 shadow-sm overflow-hidden">
                 <table className="w-full text-left">
                   <thead className="bg-slate-50">
                     <tr>
                       <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">ID / Specification</th>
                       <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Master Size</th>
                       <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Stock Level</th>
                       <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right">Actions</th>
                     </tr>
                   </thead>
                   <tbody className="divide-y divide-zinc-100">
                     {rolls.map(roll => (
                       <tr key={roll.id} className="hover:bg-slate-50 transition-colors">
                         <td className="px-6 py-4">
                            <span className="font-black text-zinc-950 text-sm">{roll.id}</span>
                            <span className="text-[10px] text-slate-400 font-bold block">{roll.materialType}</span>
                         </td>
                         <td className="px-6 py-4 font-bold text-sm">{fromMeters(roll.fullLength).toFixed(1)}{currentUnit} x {fromMeters(roll.fullWidth).toFixed(1)}{currentUnit}</td>
                         <td className="px-6 py-4">
                            <div className="w-48 h-2 bg-slate-100 rounded-full overflow-hidden">
                              <div className="h-full bg-emerald-500 transition-all" style={{ width: `${(roll.remainingSqm / roll.totalSqm) * 100}%` }} />
                            </div>
                         </td>
                         <td className="px-6 py-4 text-right">
                           <button 
                             onClick={() => handleDeleteRoll(roll.id)}
                             className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all cursor-pointer"
                             title="Delete Roll"
                           >
                             <Trash2 size={16} />
                           </button>
                         </td>
                       </tr>
                     ))}
                     {rolls.length === 0 && (
                       <tr>
                         <td colSpan={4} className="py-20 text-center text-zinc-400 font-medium text-sm">
                           No rolls present in stock registry.
                         </td>
                       </tr>
                     )}
                   </tbody>
                 </table>
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
};
