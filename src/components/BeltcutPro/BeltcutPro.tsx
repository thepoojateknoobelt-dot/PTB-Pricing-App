import React, { useState, useEffect, useMemo } from 'react';
import { 
  Package, Layers, Scissors, AlertTriangle, Plus, Trash2, 
  ChevronRight, ChevronLeft, TrendingDown, Info, 
  RotateCcw, Wand2, BarChart3, Loader2, Warehouse, User,
  ArrowLeft, X, Menu
} from 'lucide-react';
import { 
  saveRoll, updateRoll, deleteRoll, saveCut, deleteCut, fetchRolls, OperationType 
} from './services/firebase';
import { Roll, Cut, Order, OptimizationCandidate, Unit } from './types';
import { 
  MATERIAL_TYPES, 
  CUT_COLORS 
} from './constants';
import { findGlobalBestPlacement, isSpaceAvailable } from './services/optimizationEngine';
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
  const [newRoll, setNewRoll] = useState({
    id: 'R-101',
    materialType: MATERIAL_TYPES[0],
    fullWidth: 4,
    fullLength: 115
  });
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  const [activeTab, setActiveTab] = useState<'dashboard' | 'cutting' | 'rolls_map' | 'details' | 'stock' | 'scrub'>('dashboard');
  const [detailsSubTab, setDetailsSubTab] = useState<'clients' | 'rolls'>('clients');
  const [selectedClientName, setSelectedClientName] = useState<string | null>(null);
  const [selectedRollId, setSelectedRollId] = useState<string | null>(null);
  const [rollDetailPanelId, setRollDetailPanelId] = useState<string | null>(null);
  const [cuttingMode, setCuttingMode] = useState<'auto' | 'manual'>('auto');
  const [isSyncing, setIsSyncing] = useState(true);
  const [showAddRollForm, setShowAddRollForm] = useState(false);
  const [currentDateTime, setCurrentDateTime] = useState(new Date());

  // States for cut execution & leftover management popup
  const [showExecuteModal, setShowExecuteModal] = useState(false);
  const [executingRoll, setExecutingRoll] = useState<Roll | null>(null);
  const [executingResult, setExecutingResult] = useState<any>(null);
  const [leftoverAction, setLeftoverAction] = useState<'keep_roll' | 'scrub' | 'inventory'>('keep_roll');
  const [leftoverWidthInput, setLeftoverWidthInput] = useState<string>('0');
  const [leftoverLengthInput, setLeftoverLengthInput] = useState<string>('0');

  // Tick every minute so Entry Date stays fresh
  useEffect(() => {
    const timer = setInterval(() => setCurrentDateTime(new Date()), 60000);
    return () => clearInterval(timer);
  }, []);

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

  const handleToggleAddRollForm = () => {
    if (!showAddRollForm) {
      let maxNum = 100;
      rolls.forEach((r: any) => {
        const match = r.id.match(/^R-(\d+)$/);
        if (match) {
          const num = parseInt(match[1], 10);
          if (num > maxNum) {
            maxNum = num;
          }
        }
      });
      setNewRoll({
        id: `R-${maxNum + 1}`,
        materialType: MATERIAL_TYPES[0],
        fullWidth: 4,
        fullLength: 115
      });
    }
    setShowAddRollForm(!showAddRollForm);
  };

  useEffect(() => {
    setIsSyncing(true);
    loadRollsData();
    // Set up a polling interval for visual updates every 4 seconds
    const interval = setInterval(loadRollsData, 4000);
    return () => clearInterval(interval);
  }, []);
  
  const [selectedOrder, setSelectedOrder] = useState<Order>({
    id: `O-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
    customerName: '',
    requiredWidth: 1.5,
    requiredLength: 20,
    quantity: 1,
    materialType: MATERIAL_TYPES[0],
    date: new Date().toISOString(),
    isInventoryCut: false
  });

  // Cut rotation & orientation state
  const [cutOrientation, setCutOrientation] = useState<'horizontal' | 'vertical'>('horizontal');

  // Compute active dimensions respecting orientation swap
  const activeOrderDimensions = useMemo(() => {
    if (cutOrientation === 'vertical') {
      return {
        width: selectedOrder.requiredLength,
        length: selectedOrder.requiredWidth
      };
    }
    return {
      width: selectedOrder.requiredWidth,
      length: selectedOrder.requiredLength
    };
  }, [selectedOrder.requiredWidth, selectedOrder.requiredLength, cutOrientation]);

  const [optimizationResults, setOptimizationResults] = useState<OptimizationCandidate[]>([]);
  const [currentOptionIndex, setCurrentOptionIndex] = useState(0);
  const [manualPlacement, setManualPlacement] = useState<{ rollId: string; placement: { x: number; y: number } } | null>(null);

  // Automatically calculate suggestions when order details or dimensions change
  // NOTE: Do NOT reset cuttingMode here — that would break manual placement on every 4s poll
  useEffect(() => {
    const width = activeOrderDimensions.width;
    const length = activeOrderDimensions.length;

    if (width > 0 && length > 0) {
      const activeRolls = rolls.filter(r => r.status !== 'refused');
      const results = findGlobalBestPlacement(activeRolls, {
        ...selectedOrder,
        requiredWidth: width,
        requiredLength: length
      });
      setOptimizationResults(results);
      // Preserve current user-selected option index if it is still within bounds of the new suggestions
      setCurrentOptionIndex(prev => prev < results.length ? prev : 0);
      // Only switch to auto if not currently in manual mode
      setCuttingMode(prev => prev === 'manual' ? 'manual' : 'auto');
    } else {
      setOptimizationResults([]);
      setCurrentOptionIndex(0);
      setManualPlacement(null);
    }
  }, [
    activeOrderDimensions.width,
    activeOrderDimensions.length,
    selectedOrder.materialType,
    selectedOrder.isInventoryCut,
    rolls
  ]);

  const stats = useMemo(() => {
    const activeRollsList = rolls.filter(r => r.status !== 'refused');
    const total = activeRollsList.reduce((acc, r) => acc + r.totalSqm, 0);
    const used = activeRollsList.reduce((acc, r) => acc + r.cuts.reduce((sum, c) => sum + (c.width * c.length), 0), 0);
    
    let calculatedWaste = 0;
    activeRollsList.forEach(r => {
      if (r.remainingSqm < r.totalSqm * 0.1) calculatedWaste += r.remainingSqm;
      else calculatedWaste += used * 0.02; 
    });

    const factor = currentUnit === 'm' ? 1 : (CONVERSIONS[currentUnit] * CONVERSIONS[currentUnit]);

    const freshRollsCut = rolls.filter(r => !r.isReuse && r.cuts && r.cuts.length > 0).length;
    const refusedRolls = rolls.filter(r => r.status === 'refused').length;

    return {
      totalAvailable: (total - used) * factor,
      efficiency: total > 0 ? (((used - calculatedWaste) / total) * 100).toFixed(1) : 0,
      activeRolls: activeRollsList.length,
      totalWastage: calculatedWaste * factor,
      freshRollsCut,
      refusedRolls
    };
  }, [rolls, currentUnit]);

  const currentResult = cuttingMode === 'auto' ? (optimizationResults[currentOptionIndex] || null) : manualPlacement;

  const handleSelectRecommendation = (idx: number) => {
    setCurrentOptionIndex(idx);
    setCuttingMode('auto');
    const candidate = optimizationResults[idx];
    if (candidate) {
      setTimeout(() => {
        const element = document.getElementById(`roll-visualizer-${candidate.rollId}`);
        if (element) {
          element.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      }, 50);
    }
  };

  const toMeters = (val: number) => val / CONVERSIONS[currentUnit];
  const fromMeters = (val: number) => val * CONVERSIONS[currentUnit];

  const handleCalculateBestFit = () => {
    if (!selectedOrder.isInventoryCut && !selectedOrder.customerName.trim()) {
      alert("Party Name is compulsory for client orders.");
      return;
    }
    const activeRolls = rolls.filter(r => r.status !== 'refused');
    const results = findGlobalBestPlacement(activeRolls, {
      ...selectedOrder,
      requiredWidth: activeOrderDimensions.width,
      requiredLength: activeOrderDimensions.length
    });
    setOptimizationResults(results);
    setCurrentOptionIndex(0);
    setCuttingMode('auto');
    if (results.length === 0) {
      alert("No suitable placement found in existing inventory remnants. Try adding a new roll.");
    }
  };

  const handleExecuteCutWithPlacement = (result: any, targetRoll: Roll) => {
    try {
      const isInventory = !!selectedOrder.isInventoryCut;
      const clientName = (selectedOrder.customerName || '').trim();

      if (!isInventory && !clientName) {
        alert("Party Name is compulsory for Client Cuts. Please enter a Customer Name in the left panel.");
        return;
      }

      // Double check space availability using final execution dimensions
      const reqWidth = activeOrderDimensions.width || 0;
      const reqLength = activeOrderDimensions.length || 0;
      if (reqWidth <= 0 || reqLength <= 0) {
        alert("Error: Dimensions must be greater than zero.");
        return;
      }

      if (!isSpaceAvailable(targetRoll, result.placement.x, result.placement.y, reqWidth, reqLength)) {
        alert("Selected placement is no longer valid for the current dimensions. Please re-calculate the fit.");
        return;
      }

      // Set up data for the execution & leftover popup modal
      setExecutingResult(result);
      setExecutingRoll(targetRoll);

      // Auto-calculate suggested leftover dimensions.
      const remainingSqm = (targetRoll.remainingSqm || 0) - (reqWidth * reqLength);
      const suggestedWidth = targetRoll.fullWidth || 0;
      const suggestedLength = suggestedWidth > 0 ? Math.max(0, remainingSqm / suggestedWidth) : 0;

      // Pre-fill inputs in the currently selected Unit
      setLeftoverWidthInput(fromMeters(suggestedWidth).toFixed(2));
      setLeftoverLengthInput(fromMeters(suggestedLength).toFixed(2));

      // Choose default action based on remaining area
      if (targetRoll.isReuse || remainingSqm < 0.05) {
        setLeftoverAction('scrub');
      } else {
        setLeftoverAction('keep_roll');
      }

      setShowExecuteModal(true);
    } catch (err: any) {
      alert("Error starting cut execution: " + err?.message);
      console.error("Error in handleExecuteCutWithPlacement:", err);
    }
  };

  const handleExecuteCut = () => {
    if (!currentResult) {
      alert("No placement has been selected. Please choose a placement first.");
      return;
    }
    const { rollId } = currentResult as any;
    const targetRoll = rolls.find(r => r.id === rollId);
    if (!targetRoll) return;
    handleExecuteCutWithPlacement(currentResult, targetRoll);
  };

  const confirmExecuteCut = async () => {
    if (!executingResult || !executingRoll) return;

    setIsSyncing(true);
    setShowExecuteModal(false);

    const { rollId, placement } = executingResult as any;
    // Stamp exact cut time before saving
    const cutDate = new Date().toISOString();
    const finalOrder = { ...selectedOrder, date: cutDate };
    
    const newCut: Cut = {
      id: `C-${Date.now()}-${Math.floor(Math.random() * 100000)}`,
      orderId: finalOrder.id,
      customerName: finalOrder.isInventoryCut ? 'INTERNAL STOCK' : finalOrder.customerName,
      width: activeOrderDimensions.width,
      length: activeOrderDimensions.length,
      x: placement.x,
      y: placement.y,
      status: 'completed',
      color: finalOrder.isInventoryCut ? '#1e293b' : CUT_COLORS[Math.floor(Math.random() * CUT_COLORS.length)],
      isInventoryCut: finalOrder.isInventoryCut
    };

    try {
      const remainingSqm = executingRoll.remainingSqm - (newCut.width * newCut.length);
      
      let shouldRefuse = false;
      if (leftoverAction === 'scrub') {
        shouldRefuse = true;
      } else if (leftoverAction === 'keep_roll') {
        shouldRefuse = false;
      } else if (leftoverAction === 'inventory') {
        shouldRefuse = true; // original roll becomes completed/refused because remainder is saved as a new roll
      }

      // 1. Update the remaining area and status in the main roll
      await updateRoll(rollId, {
        remainingSqm: Math.max(0, remainingSqm),
        status: shouldRefuse ? 'refused' : 'active'
      });

      // 2. Save the new cut in the database
      await saveCut(rollId, newCut);

      // 3. If it's an inventory cut, create a new reusable roll in stock representing this cut
      if (finalOrder.isInventoryCut) {
        const newReuseRollId = `REUSE-${rollId}-${Date.now().toString().slice(-4)}`;
        const newReuseRoll = {
          id: newReuseRollId,
          materialType: executingRoll.materialType,
          fullWidth: newCut.width,
          fullLength: newCut.length,
          totalSqm: newCut.width * newCut.length,
          remainingSqm: newCut.width * newCut.length,
          isArchived: false,
          isReuse: true,
          parentRollId: rollId,
          status: 'active'
        };
        await saveRoll(newReuseRoll);
      }

      // 4. If leftoverAction is 'inventory', create a new reusable roll from the leftover!
      if (leftoverAction === 'inventory') {
        const customWidth = toMeters(parseFloat(leftoverWidthInput) || 0);
        const customLength = toMeters(parseFloat(leftoverLengthInput) || 0);
        if (customWidth > 0 && customLength > 0) {
          const leftoverRollId = `REUSE-LEFT-${rollId}-${Date.now().toString().slice(-4)}`;
          const leftoverRoll = {
            id: leftoverRollId,
            materialType: executingRoll.materialType,
            fullWidth: customWidth,
            fullLength: customLength,
            totalSqm: customWidth * customLength,
            remainingSqm: customWidth * customLength,
            isArchived: false,
            isReuse: true,
            parentRollId: rollId,
            status: 'active'
          };
          await saveRoll(leftoverRoll);
        }
      }

      // Reload rolls data
      await loadRollsData();
    } catch (err) {
      console.error("Error executing cut:", err);
      alert("Failed to execute cut. Please try again.");
    } finally {
      setIsSyncing(false);
      setOptimizationResults([]);
      setCurrentOptionIndex(0);
      setManualPlacement(null);
      setSelectedOrder({
        ...selectedOrder,
        id: `O-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
        customerName: '',
        isInventoryCut: false
      });
      setExecutingRoll(null);
      setExecutingResult(null);
    }
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
      setShowAddRollForm(false);
      setNewRoll({
        id: '',
        materialType: MATERIAL_TYPES[0],
        fullWidth: 4,
        fullLength: 115
      });
    } catch (err) {
      console.error("Error adding roll:", err);
      alert("Failed to add roll. Please try again.");
    } finally {
      setIsSyncing(false);
    }
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

  const handleRefuseRoll = async (rollId: string) => {
    if (window.confirm("Are you sure you want to mark this roll as refused/waste? It will be removed from cutting operations but preserved in history.")) {
      setIsSyncing(true);
      try {
        await updateRoll(rollId, { status: 'refused' });
        await loadRollsData();
      } catch (err) {
        console.error("Error refusing roll:", err);
        alert("Failed to refuse roll. Please try again.");
      }
      setIsSyncing(false);
    }
  };

  const handleDeleteCut = async (rollId: string, cut: Cut) => {
    const sizeStr = `${fromMeters(cut.length).toFixed(1)}${currentUnit} x ${fromMeters(cut.width).toFixed(1)}${currentUnit}`;
    const confirmMsg = `Are you sure you want to delete the cut for client "${cut.customerName}" (${sizeStr}) on roll "${rollId}"?\nThis will restore the roll area.`;
    if (window.confirm(confirmMsg)) {
      setIsSyncing(true);
      try {
        await deleteCut(rollId, cut.id);
        await loadRollsData();
      } catch (err) {
        console.error("Error deleting cut:", err);
        alert("Failed to delete cut. Please try again.");
      }
      setIsSyncing(false);
    }
  };

  const handleRestoreRoll = async (rollId: string) => {
    if (window.confirm("Are you sure you want to restore this roll to active stock?")) {
      setIsSyncing(true);
      try {
        await updateRoll(rollId, { status: 'active' });
        await loadRollsData();
      } catch (err) {
        console.error("Error restoring roll:", err);
        alert("Failed to restore roll. Please try again.");
      }
      setIsSyncing(false);
    }
  };

  // Group cuts by client for Details Registry
  const clientCutsList = useMemo(() => {
    const clientCutsMap: Record<string, { customerName: string; cuts: { cut: Cut; rollId: string; rollMaterial: string }[] }> = {};
    rolls.forEach(r => {
      r.cuts.forEach(c => {
        const clientKey = c.customerName || 'Unknown';
        if (!clientCutsMap[clientKey]) {
          clientCutsMap[clientKey] = {
            customerName: clientKey,
            cuts: []
          };
        }
        clientCutsMap[clientKey].cuts.push({
          cut: c,
          rollId: r.id,
          rollMaterial: r.materialType
        });
      });
    });
    return Object.values(clientCutsMap).sort((a, b) => a.customerName.localeCompare(b.customerName));
  }, [rolls]);

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
            { id: 'rolls_map', label: 'Roll Clients Map', icon: Layers },
            { id: 'details', label: 'Client Cuts History', icon: User },
            { id: 'stock', label: 'Inventory', icon: Package },
            { id: 'scrub', label: 'Scrub Registry', icon: Trash2 },
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
          <div className="pb-2 border-b border-zinc-200 mb-5">
            <h2 className="text-2xl font-black text-zinc-950 uppercase tracking-tight">
              {activeTab === 'dashboard' && 'Inventory Overview'}
              {activeTab === 'cutting' && 'Cutting & Optimization'}
              {activeTab === 'rolls_map' && 'Roll Clients Map'}
              {activeTab === 'details' && 'Client Cuts History'}
              {activeTab === 'stock' && 'Stock Registry'}
              {activeTab === 'scrub' && 'Scrub Registry'}
            </h2>
            <p className="text-[10px] text-zinc-500 mt-0.5 leading-none">
              {activeTab === 'dashboard' && 'Visual breakdown of active inventory remnants and efficiency.'}
              {activeTab === 'cutting' && 'Select order dimensions to find the optimal cut with minimum waste.'}
              {activeTab === 'rolls_map' && 'Track client allocations and cut mapping per roll.'}
              {activeTab === 'details' && 'View client cut histories and consumed material remnants.'}
              {activeTab === 'stock' && 'Manage master rolls and register raw inventory materials.'}
              {activeTab === 'scrub' && 'Manage refused remnants and scrap materials.'}
            </p>
          </div>

          {activeTab === 'dashboard' && (
            <div className="space-y-10">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-4">
                <StatsCard label="Available" value={`${stats.totalAvailable.toFixed(1)} ${areaUnit}`} icon={<Package size={20} />} color="bg-zinc-900" />
                <StatsCard label="Efficiency" value={`${stats.efficiency}%`} icon={<TrendingDown size={20} />} color="bg-emerald-600" />
                <StatsCard label="Active Stock" value={stats.activeRolls} icon={<Layers size={20} />} color="bg-violet-600" />
                <StatsCard label="Fresh Cut" value={stats.freshRollsCut} icon={<Scissors size={20} />} color="bg-indigo-600" />
                <StatsCard label="Refused" value={stats.refusedRolls} icon={<AlertTriangle size={20} />} color="bg-rose-600" />
                <StatsCard label="Est. Waste" value={`${stats.totalWastage.toFixed(1)} ${areaUnit}`} icon={<AlertTriangle size={20} />} color="bg-amber-600" />
              </div>
              <div className="grid grid-cols-1 gap-6 mt-6">
                {rolls.filter(r => r.status !== 'refused').map(roll => (
                  <RollVisualizer 
                    key={roll.id} 
                    roll={roll} 
                    unit={currentUnit} 
                    onSelectCut={(cut) => handleDeleteCut(roll.id, cut)}
                  />
                ))}
              </div>
            </div>
          )}

          {activeTab === 'cutting' && (
            <div className="space-y-6">
              {/* Top Row: 3 Compact Columns Side-by-Side */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-stretch">
                
                {/* Column 1: Cut Purpose (Compact Form) */}
                <div className="bg-white p-5 rounded-3xl border border-zinc-200 shadow-sm flex flex-col justify-between h-full">
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                       <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Cut Purpose</label>
                       <div className="flex items-center gap-1.5">
                          <button onClick={() => setSelectedOrder({...selectedOrder, isInventoryCut: false})} className={`px-2.5 py-1 rounded-lg text-[9px] font-black transition-all cursor-pointer ${!selectedOrder.isInventoryCut ? 'bg-zinc-950 text-white' : 'bg-slate-100 text-slate-400'}`}>CLIENT</button>
                          <button onClick={() => setSelectedOrder({...selectedOrder, isInventoryCut: true})} className={`px-2.5 py-1 rounded-lg text-[9px] font-black transition-all cursor-pointer ${selectedOrder.isInventoryCut ? 'bg-zinc-950 text-white' : 'bg-slate-100 text-slate-400'}`}>INVENTORY</button>
                       </div>
                    </div>

                    {!selectedOrder.isInventoryCut && (
                      <div className="space-y-1">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-1">
                          <User size={11}/> Party Name <span className="text-red-500">*</span>
                        </label>
                        <input type="text" value={selectedOrder.customerName} onChange={(e) => setSelectedOrder({...selectedOrder, customerName: e.target.value})} placeholder="Enter Customer Name" className="w-full px-3 py-2 border-2 border-slate-100 rounded-xl focus:border-zinc-900 focus:outline-none font-bold text-xs" />
                      </div>
                    )}

                    {selectedOrder.isInventoryCut && (
                      <div className="p-3 bg-slate-900 rounded-2xl flex items-center gap-2.5 text-white">
                        <Warehouse size={16} className="text-blue-400"/>
                        <div>
                          <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">Inventory Stocking</p>
                          <p className="text-[10px] font-bold">Cutting for common size stock</p>
                        </div>
                      </div>
                    )}

                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Width ({currentUnit})</label>
                        <input type="number" step="0.01" value={fromMeters(selectedOrder.requiredWidth)} onChange={(e) => setSelectedOrder({...selectedOrder, requiredWidth: toMeters(parseFloat(e.target.value))})} className="w-full px-3 py-2 border-2 border-slate-100 rounded-xl focus:border-zinc-950 focus:outline-none font-bold text-xs" />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Length ({currentUnit})</label>
                        <input type="number" step="0.01" value={fromMeters(selectedOrder.requiredLength)} onChange={(e) => setSelectedOrder({...selectedOrder, requiredLength: toMeters(parseFloat(e.target.value))})} className="w-full px-3 py-2 border-2 border-slate-100 rounded-xl focus:border-zinc-950 focus:outline-none font-bold text-xs" />
                      </div>
                    </div>

                    <div className="space-y-1">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Belt Material Type</label>
                      <select 
                        value={selectedOrder.materialType} 
                        onChange={(e) => setSelectedOrder({...selectedOrder, materialType: e.target.value})} 
                        className="w-full px-3 py-2 border-2 border-slate-100 rounded-xl focus:border-zinc-950 focus:outline-none font-bold text-xs bg-white"
                      >
                        {MATERIAL_TYPES.map(type => <option key={type} value={type}>{type}</option>)}
                      </select>
                    </div>

                    <div className="space-y-1">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Cut Orientation</label>
                      <div className="grid grid-cols-2 gap-2 bg-slate-100 p-1 rounded-xl border border-slate-200">
                        <button 
                          type="button"
                          onClick={() => setCutOrientation('horizontal')} 
                          className={`py-1.5 rounded-lg text-[10px] font-black transition-all cursor-pointer ${
                            cutOrientation === 'horizontal' ? 'bg-white text-zinc-950 shadow-sm' : 'text-slate-500 hover:text-slate-800'
                          }`}
                        >
                          HORIZONTAL
                        </button>
                        <button 
                          type="button"
                          onClick={() => setCutOrientation('vertical')} 
                          className={`py-1.5 rounded-lg text-[10px] font-black transition-all cursor-pointer ${
                            cutOrientation === 'vertical' ? 'bg-white text-zinc-950 shadow-sm' : 'text-slate-500 hover:text-slate-800'
                          }`}
                        >
                          VERTICAL (ROTATED)
                        </button>
                      </div>
                    </div>

                    {/* Auto-filled Entry Date */}
                    <div className="space-y-1">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-1">
                        Entry Date &amp; Time
                      </label>
                      <div className="w-full px-3 py-2 border-2 border-slate-100 rounded-xl bg-slate-50 flex items-center justify-between">
                        <span className="font-bold text-xs text-slate-700">
                          {currentDateTime.toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' })}
                        </span>
                        <span className="text-[9px] font-black text-slate-400 bg-white border border-slate-200 px-2 py-0.5 rounded-md">
                          {currentDateTime.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true })}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-2 mt-4">
                    <button 
                      onClick={handleCalculateBestFit}
                      className="w-full py-2 bg-indigo-600 hover:bg-indigo-500 text-white font-black text-[10px] uppercase tracking-wider rounded-xl transition shadow-lg active:scale-95 cursor-pointer flex items-center justify-center gap-1.5"
                    >
                      <Wand2 size={12} /> FIND THE BEST FIT
                    </button>

                    <div className="flex gap-2">
                      <button 
                        onClick={() => setCuttingMode('auto')} 
                        className={`flex-1 py-2 rounded-xl text-[10px] font-black transition-all cursor-pointer ${
                          cuttingMode === 'auto' ? 'bg-zinc-950 text-white shadow-sm' : 'bg-slate-100 text-slate-400 hover:bg-slate-200'
                        }`}
                      >
                        AUTO RECOMMEND
                      </button>
                      <button 
                        onClick={() => setCuttingMode('manual')} 
                        className={`flex-1 py-2 rounded-xl text-[10px] font-black transition-all cursor-pointer ${
                          cuttingMode === 'manual' ? 'bg-zinc-950 text-white shadow-sm' : 'bg-slate-100 text-slate-400 hover:bg-slate-200'
                        }`}
                      >
                        MANUAL PLACEMENT
                      </button>
                    </div>
                  </div>
                </div>

                {/* Column 2: Cutting Recommendations */}
                <div className="flex flex-col h-full">
                  {cuttingMode === 'auto' && optimizationResults.length > 0 ? (
                    <div className="bg-white p-5 rounded-3xl border border-zinc-200 shadow-sm space-y-4 flex-1 flex flex-col justify-between h-full">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center justify-between">
                        <span>Cutting Recommendations</span>
                        <span className="text-[9px] bg-emerald-50 text-emerald-700 px-2.5 py-0.5 rounded-lg border border-emerald-100 font-black">
                          Scrub Minimized
                        </span>
                      </label>
                      <div className="space-y-2 max-h-[280px] overflow-y-auto pr-1 flex-1">
                        {optimizationResults.map((candidate, idx) => {
                          const isSelected = currentOptionIndex === idx;
                          const isBest = idx === 0;
                          const hasScrapRisk = candidate.reason.includes("Scrap Risk");
                          const matchRoll = rolls.find(r => r.id === candidate.rollId);
                          
                          let badgeText = "VALID FIT";
                          let badgeStyle = isSelected ? 'bg-zinc-800 text-white' : 'bg-slate-100 text-slate-600';
                          
                          if (isBest) {
                            badgeText = "BEST MATCH";
                            badgeStyle = isSelected ? 'bg-emerald-500 text-white' : 'bg-emerald-100 text-emerald-700';
                          } else if (hasScrapRisk) {
                            badgeText = "SCRAP RISK";
                            badgeStyle = isSelected ? 'bg-rose-500 text-white' : 'bg-rose-100 text-rose-700';
                          }

                          const rating = isBest 
                            ? "Fayda: Minimum Waste & Scrub" 
                            : (hasScrapRisk ? "Warning: High scrap/scrub risk" : "Alternative Remnant Fit");

                          return (
                            <div 
                              key={idx}
                              onClick={() => handleSelectRecommendation(idx)}
                              className={`p-3 rounded-2xl border-2 cursor-pointer transition-all text-left ${
                                isSelected 
                                  ? 'bg-zinc-950 border-zinc-950 text-white shadow-sm' 
                                  : 'bg-slate-50 hover:bg-slate-100 border-slate-100 text-slate-800'
                              }`}
                            >
                              <div className="flex justify-between items-center">
                                <span className="font-black text-xs uppercase tracking-tight flex items-center gap-1.5 flex-wrap">
                                  <span>{candidate.rollId}</span>
                                  {matchRoll && (
                                    <span className={`text-[8.5px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded ${isSelected ? 'bg-slate-800 text-slate-300' : 'bg-slate-200 text-slate-600'}`}>
                                      {fromMeters(matchRoll.fullLength).toFixed(1)}{currentUnit}x{fromMeters(matchRoll.fullWidth).toFixed(1)}{currentUnit}
                                    </span>
                                  )}
                                  <span className={`text-[8px] font-black tracking-widest px-1.5 py-0.5 rounded-md leading-none ${badgeStyle}`}>
                                    {badgeText}
                                  </span>
                                </span>
                                <span className="text-[9px] font-bold text-slate-400">
                                  Pos: {candidate.placement.x.toFixed(1)}m
                                </span>
                              </div>
                              
                              <p className={`text-[10px] font-bold mt-1 leading-normal ${isSelected ? 'text-slate-300' : 'text-slate-500'}`}>
                                {candidate.reason}
                              </p>
                              
                              <div className="mt-1.5 flex items-center justify-between border-t border-slate-200/10 pt-1.5 text-[8px] font-black uppercase tracking-wider">
                                <span className={isSelected ? 'text-emerald-400' : (hasScrapRisk ? 'text-rose-500' : 'text-slate-500')}>
                                  {rating}
                                </span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ) : cuttingMode === 'manual' ? (
                    <div className="p-5 bg-blue-50 border-2 border-blue-200 rounded-3xl flex-1 flex flex-col justify-center space-y-3 h-full">
                      <p className="font-black uppercase tracking-wider text-[10px] text-blue-700 flex items-center gap-1.5">
                        <Info size={13}/> Manual Placement Mode Active
                      </p>
                      <p className="text-[11px] font-semibold text-slate-500 leading-relaxed text-left">
                        Right side par jo roll dikhe, uske upar click karo jahan cut karna hai. Click karte hi execution popup open ho jayega.
                      </p>
                      
                      {/* Quick Orientation Toggle inside Info Card */}
                      <div className="bg-white p-2.5 rounded-xl border border-blue-150 space-y-2">
                        <span className="text-[9px] font-black text-blue-500 uppercase tracking-widest block text-left">Choose Cut Orientation</span>
                        <div className="grid grid-cols-2 gap-1.5 bg-blue-50/50 p-1 rounded-lg border border-blue-100">
                          <button 
                            type="button"
                            onClick={() => setCutOrientation('horizontal')} 
                            className={`py-1 rounded-md text-[9px] font-black transition-all cursor-pointer ${
                              cutOrientation === 'horizontal' ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-500 hover:text-slate-800'
                            }`}
                          >
                            HORIZONTAL
                          </button>
                          <button 
                            type="button"
                            onClick={() => setCutOrientation('vertical')} 
                            className={`py-1 rounded-md text-[9px] font-black transition-all cursor-pointer ${
                              cutOrientation === 'vertical' ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-500 hover:text-slate-800'
                            }`}
                          >
                            VERTICAL
                          </button>
                        </div>
                      </div>

                      {manualPlacement ? (
                        <div className="bg-blue-100 rounded-xl p-3 text-[10px] font-black text-blue-800 space-y-1 text-left">
                          <div className="flex justify-between">
                            <span className="text-blue-500">Roll Selected</span>
                            <span>{manualPlacement.rollId}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-blue-500">Position</span>
                            <span>X: {manualPlacement.placement.x.toFixed(2)}m, Y: {manualPlacement.placement.y.toFixed(2)}m</span>
                          </div>
                        </div>
                      ) : (
                        <div className="bg-blue-100 rounded-xl p-3 text-[10px] font-bold text-blue-700 text-left">
                          ⬇ Roll visualizer mein kisi bhi empty jagah par click karo
                        </div>
                      )}
                    </div>
                  ) : selectedOrder.requiredWidth > 0 && selectedOrder.requiredLength > 0 && optimizationResults.length === 0 && cuttingMode === 'auto' ? (
                    <div className="p-5 bg-rose-50 border-2 border-rose-100 text-rose-800 rounded-3xl flex-1 flex flex-col justify-center h-full">
                       <p className="font-black uppercase tracking-wider text-[10px] text-rose-700 flex items-center gap-1.5">
                         <AlertTriangle size={14}/> No Remnants Found
                       </p>
                       <p className="text-[11px] font-semibold text-slate-500 mt-2 leading-relaxed text-left">
                         No active master rolls or remnants match this grade and size. Please add a new master roll under the Stock Registry tab first.
                       </p>
                    </div>
                  ) : (
                    <div className="bg-white p-5 rounded-3xl border border-zinc-200 shadow-sm flex-1 flex flex-col justify-center items-center text-center text-slate-400 text-xs font-semibold h-full">
                      <Info size={24} className="mb-2 text-slate-300" />
                      Enter width and length to search recommendations
                    </div>
                  )}
                </div>

                {/* Column 3: Placement Selected */}
                <div className="flex flex-col h-full">
                  {currentResult ? (
                    <div className="bg-slate-900 text-white p-5 rounded-3xl shadow-xl flex-1 flex flex-col justify-between h-full">
                       <div className="mb-4 flex justify-between items-center">
                         <div>
                           <h4 className="font-black text-sm text-blue-400 uppercase tracking-wider italic">Placement Selected</h4>
                           <p className="text-[10px] text-slate-400 mt-0.5">Verify and execute the cut below</p>
                         </div>
                         
                         {cuttingMode === 'auto' && optimizationResults.length > 0 && (
                           <div className="flex items-center gap-1.5 bg-slate-800 px-2 py-0.5 rounded-lg border border-slate-700">
                             <button 
                               disabled={currentOptionIndex === 0}
                               onClick={(e) => {
                                 e.stopPropagation();
                                 if (currentOptionIndex > 0) handleSelectRecommendation(currentOptionIndex - 1);
                               }}
                               className="p-0.5 hover:bg-slate-700 rounded text-slate-300 disabled:opacity-30 cursor-pointer flex items-center justify-center"
                               title="Previous Option"
                             >
                               <ChevronLeft size={12} />
                             </button>
                             <span className="font-mono font-black text-white text-[9px]">
                               {currentOptionIndex + 1}/{optimizationResults.length}
                             </span>
                             <button 
                               disabled={currentOptionIndex === optimizationResults.length - 1}
                               onClick={(e) => {
                                 e.stopPropagation();
                                 if (currentOptionIndex < optimizationResults.length - 1) handleSelectRecommendation(currentOptionIndex + 1);
                               }}
                               className="p-0.5 hover:bg-slate-700 rounded text-slate-300 disabled:opacity-30 cursor-pointer flex items-center justify-center"
                               title="Next Option"
                             >
                               <ChevronRight size={12} />
                             </button>
                           </div>
                         )}
                       </div>
                       <div className="space-y-2.5 mb-5 flex-1 flex flex-col justify-center">
                         <div className="flex justify-between border-b border-slate-800 pb-1.5">
                           <span className="text-slate-500 text-[9px] font-black uppercase">Roll ID</span>
                           <span className="font-black text-white text-xs">{currentResult.rollId}</span>
                         </div>
                         <div className="flex justify-between">
                           <span className="text-slate-500 text-[9px] font-black uppercase">Fit Strategy</span>
                           <span className="font-black text-emerald-400 text-xs">{(currentResult as any).reason || 'Manual Placement'}</span>
                         </div>
                       </div>
                       <button onClick={handleExecuteCut} className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-black py-3 rounded-xl transition shadow-lg active:scale-95 text-xs uppercase tracking-wider cursor-pointer flex items-center justify-center gap-1.5 mt-auto">
                         <Scissors size={14} /> EXECUTE CUT
                       </button>
                    </div>
                  ) : (
                    <div className="bg-white p-5 rounded-3xl border border-zinc-200 shadow-sm flex-1 flex flex-col justify-center items-center text-center text-slate-400 text-xs font-semibold h-full">
                      <Scissors size={24} className="mb-2 text-slate-300" />
                      Select placement to execute cut
                    </div>
                  )}
                </div>
              </div>

              {/* Row 2: Remnant Matching Visualization (Full Width) */}
              <div className="bg-white p-5 rounded-3xl border border-zinc-200 shadow-sm min-h-[450px]">
                <h3 className="text-sm font-black mb-4 text-slate-800 flex items-center gap-2 italic uppercase">
                  <Info size={16} className="text-zinc-800" /> Remnant Matching Visualization
                </h3>
                <div className="space-y-6">
                  {rolls.filter(r =>
                    r.materialType === selectedOrder.materialType &&
                    r.status !== 'refused' &&
                    r.remainingSqm > 0.01  // hide fully-used rolls
                  ).map(roll => (
                    <RollVisualizer 
                      key={roll.id} 
                      roll={roll} 
                      unit={currentUnit}
                      manualMode={cuttingMode === 'manual'}
                      manualDimensions={{ width: activeOrderDimensions.width, length: activeOrderDimensions.length }}
                      onManualPlacementChange={(pos) => {
                        if (pos) {
                          const result = { rollId: roll.id, placement: pos };
                          setManualPlacement(result);
                          handleExecuteCutWithPlacement(result, roll);
                        } else {
                          setManualPlacement(null);
                        }
                      }}
                      suggestedPlacement={(cuttingMode === 'auto' && currentResult?.rollId === roll.id) ? { ...(currentResult as any).placement, width: activeOrderDimensions.width, length: activeOrderDimensions.length } : null}
                      onSelectCut={(cut) => handleDeleteCut(roll.id, cut)}
                    />
                  ))}
                  {rolls.filter(r =>
                    r.materialType === selectedOrder.materialType &&
                    r.status !== 'refused' &&
                    r.remainingSqm > 0.01
                  ).length === 0 && (
                    <div className="py-20 flex flex-col items-center justify-center border-2 border-dashed border-zinc-200 rounded-2xl text-zinc-400 text-sm font-medium">
                      No active rolls with remaining space for material grade: {selectedOrder.materialType}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {activeTab === 'stock' && (
            <div className="space-y-8">
              <div className="bg-white p-6 rounded-3xl border border-zinc-200 shadow-sm flex justify-between items-center">
                 <h3 className="text-xl font-black text-slate-800 uppercase italic">Stock Registry</h3>
                 <button onClick={handleToggleAddRollForm} className="px-5 py-3 bg-zinc-950 text-white rounded-xl font-black text-xs hover:bg-zinc-800 transition flex items-center gap-2 cursor-pointer">
                   <Plus size={14}/> {showAddRollForm ? 'CANCEL' : 'ADD MASTER ROLL'}
                 </button>
              </div>
              {showAddRollForm && (
                 <div className="bg-white p-6 rounded-3xl border-2 border-zinc-950 shadow-sm animate-in fade-in slide-in-from-top-3">
                    <div className="grid grid-cols-1 md:grid-cols-5 gap-4 items-end">
                       <div className="flex flex-col gap-1.5">
                         <label className="text-[10px] font-black text-slate-500 uppercase tracking-wider">Roll ID</label>
                         <input type="text" value={newRoll.id} onChange={(e) => setNewRoll({...newRoll, id: e.target.value})} placeholder="Roll ID" className="px-4 py-3 border rounded-xl font-bold text-sm bg-white w-full" />
                       </div>
                       <div className="flex flex-col gap-1.5">
                         <label className="text-[10px] font-black text-slate-500 uppercase tracking-wider">Material Type</label>
                         <select value={newRoll.materialType} onChange={(e) => setNewRoll({...newRoll, materialType: e.target.value})} className="px-4 py-3 border rounded-xl font-bold text-sm bg-white w-full">
                           {MATERIAL_TYPES.map(type => <option key={type} value={type}>{type}</option>)}
                         </select>
                       </div>
                       <div className="flex flex-col gap-1.5">
                         <label className="text-[10px] font-black text-slate-500 uppercase tracking-wider">Width ({currentUnit})</label>
                         <input type="number" value={fromMeters(newRoll.fullWidth)} onChange={(e) => setNewRoll({...newRoll, fullWidth: toMeters(parseFloat(e.target.value))})} placeholder={`Width (${currentUnit})`} className="px-4 py-3 border rounded-xl font-bold text-sm bg-white w-full" />
                       </div>
                       <div className="flex flex-col gap-1.5">
                         <label className="text-[10px] font-black text-slate-500 uppercase tracking-wider">Length ({currentUnit})</label>
                         <input type="number" value={fromMeters(newRoll.fullLength)} onChange={(e) => setNewRoll({...newRoll, fullLength: toMeters(parseFloat(e.target.value))})} placeholder={`Length (${currentUnit})`} className="px-4 py-3 border rounded-xl font-bold text-sm bg-white w-full" />
                       </div>
                       <button 
                         onClick={handleAddRoll} 
                         disabled={isSyncing}
                         className={`font-black py-3 rounded-xl transition text-xs cursor-pointer flex items-center justify-center gap-2 h-[46px] ${
                           isSyncing ? 'bg-emerald-800 text-emerald-300 cursor-not-allowed' : 'bg-emerald-600 text-white hover:bg-emerald-500'
                         }`}
                       >
                         {isSyncing ? (
                           <>
                             <Loader2 className="animate-spin" size={14} /> SAVING...
                           </>
                         ) : 'SAVE'}
                       </button>
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
                     {rolls.filter(r => r.status !== 'refused').map(roll => (
                        <tr key={roll.id} className="hover:bg-slate-50 transition-colors">
                          <td className="px-6 py-4">
                             <div className="flex items-center gap-2 flex-wrap">
                               <span className="font-black text-zinc-950 text-sm">{roll.id}</span>
                               <span className={`text-[9px] px-2 py-0.5 rounded-full font-black tracking-widest leading-none ${roll.isReuse ? 'bg-emerald-50 text-emerald-700 border border-emerald-100' : 'bg-indigo-50 text-indigo-700 border border-indigo-100'}`}>
                                 {roll.isReuse ? 'REUSE' : 'FRESH'}
                               </span>
                               {roll.status === 'refused' && (
                                 <span className="text-[9px] px-2 py-0.5 rounded-full font-black tracking-widest leading-none bg-rose-50 text-rose-700 border border-rose-100">
                                   REFUSED
                                 </span>
                               )}
                             </div>
                             <span className="text-[10px] text-slate-400 font-bold block mt-0.5">{roll.materialType}</span>
                          </td>
                          <td className="px-6 py-4 font-bold text-sm">{fromMeters(roll.fullLength).toFixed(1)}{currentUnit} x {fromMeters(roll.fullWidth).toFixed(1)}{currentUnit}</td>
                          <td className="px-6 py-4">
                             <div className="w-48 h-2 bg-slate-100 rounded-full overflow-hidden">
                               <div className="h-full bg-emerald-500 transition-all" style={{ width: `${(roll.remainingSqm / roll.totalSqm) * 100}%` }} />
                             </div>
                          </td>
                          <td className="px-6 py-4">
                             <div className="flex items-center justify-end gap-1.5">
                               {roll.status !== 'refused' && (
                                 <button 
                                   onClick={() => handleRefuseRoll(roll.id)}
                                   className="p-2 text-slate-400 hover:text-amber-600 hover:bg-amber-50 rounded-lg transition-all cursor-pointer"
                                   title="Refuse / Mark as Waste"
                                 >
                                   <AlertTriangle size={15} />
                                 </button>
                               )}
                               <button 
                                 onClick={() => handleDeleteRoll(roll.id)}
                                 className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all cursor-pointer"
                                 title="Delete Roll"
                                >
                                 <Trash2 size={16} />
                               </button>
                             </div>
                          </td>
                        </tr>
                      ))}
                     {rolls.filter(r => r.status !== 'refused').length === 0 && (
                       <tr>
                         <td colSpan={4} className="py-20 text-center text-zinc-400 font-medium text-sm">
                           No active rolls present in stock registry.
                         </td>
                       </tr>
                     )}
                   </tbody>
                 </table>
              </div>
            </div>
          )}

          {activeTab === 'scrub' && (
            <div className="space-y-8 animate-in fade-in slide-in-from-top-3">
              <div className="bg-white p-6 rounded-3xl border border-zinc-200 shadow-sm flex justify-between items-center">
                 <h3 className="text-xl font-black text-slate-800 uppercase italic">Scrub Registry (Scrap / Unusable)</h3>
              </div>
              <div className="bg-white rounded-3xl border border-zinc-200 shadow-sm overflow-hidden">
                 <table className="w-full text-left">
                   <thead className="bg-slate-50">
                     <tr>
                       <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">ID / Specification</th>
                       <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Original Size</th>
                       <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Remaining Area</th>
                       <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right">Actions</th>
                     </tr>
                   </thead>
                   <tbody className="divide-y divide-zinc-100">
                     {rolls.filter(r => r.status === 'refused').map(roll => (
                        <tr key={roll.id} className="hover:bg-slate-50 transition-colors">
                          <td className="px-6 py-4">
                             <div className="flex items-center gap-2 flex-wrap">
                               <span className="font-black text-zinc-950 text-sm">{roll.id}</span>
                               <span className={`text-[9px] px-2 py-0.5 rounded-full font-black tracking-widest leading-none ${roll.isReuse ? 'bg-emerald-50 text-emerald-700 border border-emerald-100' : 'bg-indigo-50 text-indigo-700 border border-indigo-100'}`}>
                                 {roll.isReuse ? 'REUSE' : 'FRESH'}
                               </span>
                             </div>
                             <span className="text-[10px] text-slate-400 font-bold block mt-0.5">{roll.materialType}</span>
                          </td>
                          <td className="px-6 py-4 font-bold text-sm">{fromMeters(roll.fullLength).toFixed(1)}{currentUnit} x {fromMeters(roll.fullWidth).toFixed(1)}{currentUnit}</td>
                          <td className="px-6 py-4 font-bold text-sm">{fromMeters(roll.remainingSqm).toFixed(1)}{currentUnit}²</td>
                          <td className="px-6 py-4">
                             <div className="flex items-center justify-end gap-1.5">
                               <button 
                                 onClick={() => handleRestoreRoll(roll.id)}
                                 className="px-3 py-1.5 bg-zinc-900 text-white rounded-lg font-bold text-[10px] hover:bg-zinc-800 transition-all cursor-pointer flex items-center gap-1"
                                 title="Restore to Active Stock"
                               >
                                 <RotateCcw size={12} /> RESTORE
                               </button>
                               <button 
                                 onClick={() => handleDeleteRoll(roll.id)}
                                 className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all cursor-pointer"
                                 title="Delete Permanently"
                               >
                                 <Trash2 size={16} />
                               </button>
                             </div>
                          </td>
                        </tr>
                      ))}
                     {rolls.filter(r => r.status === 'refused').length === 0 && (
                       <tr>
                         <td colSpan={4} className="py-20 text-center text-zinc-400 font-medium text-sm">
                           No refused remnants in scrub registry.
                         </td>
                       </tr>
                     )}
                   </tbody>
                 </table>
              </div>
            </div>
          )}

          {activeTab === 'details' && (
            <div className="space-y-8 animate-in fade-in slide-in-from-top-3">
              <div className="bg-white rounded-3xl border border-zinc-200 shadow-sm overflow-hidden animate-in fade-in duration-200">
                <table className="w-full text-left">
                  <thead className="bg-slate-50">
                    <tr>
                      <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">S.No</th>
                      <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Client Name</th>
                      <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Total Cuts Taken</th>
                      <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Consumed Materials</th>
                      <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-100 text-sm font-semibold text-slate-700">
                    {clientCutsList.map((client, idx) => {
                      const uniqueMaterials = Array.from(new Set(client.cuts.map(c => c.rollMaterial)));
                      return (
                        <tr key={client.customerName} className="hover:bg-slate-50/50 transition-colors">
                          <td className="px-6 py-4 text-slate-400">#{idx + 1}</td>
                          <td className="px-6 py-4 font-black text-slate-900">{client.customerName}</td>
                          <td className="px-6 py-4">
                            <span className="bg-zinc-55 text-zinc-950 border border-zinc-200 px-3 py-1 rounded-xl font-bold text-xs">
                              {client.cuts.length} cuts
                            </span>
                          </td>
                          <td className="px-6 py-4">
                            <div className="flex gap-1.5 flex-wrap">
                              {uniqueMaterials.map(mat => (
                                <span key={mat} className="bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded-lg border border-indigo-100 font-bold text-[10px]">
                                  {mat}
                                </span>
                              ))}
                            </div>
                          </td>
                          <td className="px-6 py-4 text-right">
                            <button
                              onClick={() => setSelectedClientName(client.customerName)}
                              className="px-4 py-2 bg-zinc-950 hover:bg-zinc-800 text-white rounded-xl font-black text-xs transition shadow-sm cursor-pointer inline-flex items-center gap-1.5"
                            >
                              <Info size={13} /> Check Details
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                    {clientCutsList.length === 0 && (
                      <tr>
                        <td colSpan={5} className="py-20 text-center text-zinc-400 font-bold">
                          No client cuts recorded in history.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {activeTab === 'rolls_map' && (
            <div className="space-y-8 animate-in fade-in slide-in-from-top-3">
              <div className="bg-white rounded-3xl border border-zinc-200 shadow-sm overflow-hidden animate-in fade-in duration-200">
                <table className="w-full text-left">
                  <thead className="bg-slate-50">
                    <tr>
                      <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">S.No</th>
                      <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Roll ID / Spec</th>
                      <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Dimensions</th>
                      <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Stock Level</th>
                      <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Mapped Clients / Parties</th>
                      <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Total Cuts</th>
                      <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-100 text-sm font-semibold text-slate-700">
                    {rolls.map((roll, idx) => {
                      const usedSqm = roll.cuts.reduce((s, c) => s + c.width * c.length, 0);
                      const usedPct = roll.totalSqm > 0 ? (usedSqm / roll.totalSqm) * 100 : 0;
                      
                      // Get distinct client names mapped to this roll
                      const mappedClients = Array.from(
                        new Set(roll.cuts.map(c => c.customerName || 'INTERNAL STOCK'))
                      ).filter(Boolean);

                      return (
                        <tr key={roll.id} className="hover:bg-slate-50/50 transition-colors">
                          <td className="px-6 py-4 text-slate-400">#{idx + 1}</td>
                          <td className="px-6 py-4">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-black text-slate-900">{roll.id}</span>
                              <span className={`text-[9px] px-2 py-0.5 rounded-full font-black tracking-widest leading-none ${
                                roll.isReuse ? 'bg-emerald-50 text-emerald-700 border border-emerald-100' : 'bg-indigo-50 text-indigo-700 border border-indigo-100'
                              }`}>
                                {roll.isReuse ? 'REUSE' : 'FRESH'}
                              </span>
                              {roll.status === 'refused' && (
                                <span className="text-[9px] px-2 py-0.5 rounded-full font-black bg-rose-50 text-rose-700 border border-rose-100">
                                  SCRUB
                                </span>
                              )}
                            </div>
                            <span className="text-[10px] text-slate-400 font-bold block mt-0.5">{roll.materialType}</span>
                          </td>
                          <td className="px-6 py-4 font-bold text-slate-800">
                            {fromMeters(roll.fullLength).toFixed(1)}{currentUnit} × {fromMeters(roll.fullWidth).toFixed(1)}{currentUnit}
                          </td>
                          <td className="px-6 py-4">
                            <div className="space-y-1">
                              <div className="w-28 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                                <div className={`h-full rounded-full transition-all ${
                                  usedPct > 80 ? 'bg-rose-500' : usedPct > 50 ? 'bg-amber-500' : 'bg-emerald-500'
                                }`} style={{ width: `${Math.min(100, usedPct)}%` }} />
                              </div>
                              <span className="text-[9px] font-black text-slate-400">{usedPct.toFixed(0)}% used</span>
                            </div>
                          </td>
                          <td className="px-6 py-4">
                            <div className="flex gap-1.5 flex-wrap max-w-xs">
                              {mappedClients.map(client => (
                                <span key={client} className={`px-2 py-0.5 rounded border font-bold text-[10px] ${
                                  client === 'INTERNAL STOCK' 
                                    ? 'bg-slate-100 text-slate-600 border-slate-200' 
                                    : 'bg-indigo-50 text-indigo-700 border-indigo-100'
                                }`}>
                                  {client}
                                </span>
                              ))}
                              {mappedClients.length === 0 && (
                                <span className="text-slate-400 text-xs italic">No allocations yet</span>
                              )}
                            </div>
                          </td>
                          <td className="px-6 py-4">
                            <span className="bg-zinc-50 text-zinc-950 border border-zinc-200 px-3 py-1 rounded-xl font-bold text-xs">
                              {roll.cuts.length} cuts
                            </span>
                          </td>
                          <td className="px-6 py-4 text-right">
                            <button
                              onClick={() => setSelectedRollId(roll.id)}
                              className="px-4 py-2 bg-zinc-950 hover:bg-zinc-800 text-white rounded-xl font-black text-xs transition shadow-sm cursor-pointer inline-flex items-center gap-1.5"
                            >
                              <Info size={13} /> Check Details
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                    {rolls.length === 0 && (
                      <tr>
                        <td colSpan={7} className="py-20 text-center text-zinc-400 font-bold">
                          No rolls in stock registry.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

              {/* Client Cuts Popup/Modal */}
              {selectedClientName && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
                  <div className="bg-white rounded-3xl w-full max-w-4xl shadow-2xl max-h-[85vh] overflow-hidden flex flex-col animate-in zoom-in-95 duration-200 text-left">
                    <div className="p-6 border-b border-zinc-150 flex justify-between items-center bg-zinc-950 text-white">
                      <div>
                        <h3 className="text-xl font-black uppercase italic tracking-tight">Cuts Details for {selectedClientName}</h3>
                        <p className="text-xs text-zinc-400 mt-1">Complete log of cuts taken by this client</p>
                      </div>
                      <button 
                        onClick={() => setSelectedClientName(null)} 
                        className="p-2 text-zinc-400 hover:text-white bg-zinc-900 hover:bg-zinc-800 rounded-xl transition cursor-pointer"
                      >
                        <X className="h-5 w-5" />
                      </button>
                    </div>
                    <div className="p-6 overflow-y-auto flex-1">
                      <div className="border border-zinc-200 rounded-2xl overflow-hidden">
                        <table className="w-full text-left">
                          <thead className="bg-slate-50">
                            <tr>
                              <th className="px-5 py-3 text-[9px] font-black text-slate-400 uppercase tracking-widest">S.No</th>
                              <th className="px-5 py-3 text-[9px] font-black text-slate-400 uppercase tracking-widest">Cut ID</th>
                              <th className="px-5 py-3 text-[9px] font-black text-slate-400 uppercase tracking-widest">Dimensions</th>
                              <th className="px-5 py-3 text-[9px] font-black text-slate-400 uppercase tracking-widest">Material</th>
                              <th className="px-5 py-3 text-[9px] font-black text-slate-400 uppercase tracking-widest">Source Roll</th>
                              <th className="px-5 py-3 text-[9px] font-black text-slate-400 uppercase tracking-widest">Entry Date &amp; Time</th>
                              <th className="px-5 py-3 text-[9px] font-black text-slate-400 uppercase tracking-widest text-right">Actions</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-zinc-100 text-xs font-semibold text-slate-700">
                            {(clientCutsList.find(c => c.customerName === selectedClientName)?.cuts || []).map((item, idx) => {
                              let dateStr = 'N/A';
                              const tsMatch = item.cut.id.match(/C-(\d+)/);
                              if (tsMatch) {
                                const d = new Date(parseInt(tsMatch[1], 10));
                                if (!isNaN(d.getTime())) {
                                  dateStr = `${d.toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' })} ${d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true })}`;
                                }
                              }
                              return (
                                <tr key={item.cut.id} className="hover:bg-slate-50/50">
                                  <td className="px-5 py-3 text-slate-400">#{idx + 1}</td>
                                  <td className="px-5 py-3 font-mono text-[10px] text-zinc-500">{item.cut.id.substring(0, 12)}</td>
                                  <td className="px-5 py-3 text-zinc-950 font-bold">
                                    {fromMeters(item.cut.length).toFixed(1)}{currentUnit} x {fromMeters(item.cut.width).toFixed(1)}{currentUnit}
                                  </td>
                                  <td className="px-5 py-3 text-slate-500">{item.rollMaterial}</td>
                                  <td className="px-5 py-3">
                                    <span className="inline-flex items-center gap-1 bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded-lg border border-indigo-100 font-bold">
                                      {item.rollId}
                                    </span>
                                  </td>
                                  <td className="px-5 py-3 font-bold text-slate-450">{dateStr}</td>
                                  <td className="px-5 py-3 text-right">
                                    <button 
                                      onClick={() => {
                                        handleDeleteCut(item.rollId, item.cut);
                                        const clientObj = clientCutsList.find(c => c.customerName === selectedClientName);
                                        if (clientObj && clientObj.cuts.length <= 1) {
                                          setSelectedClientName(null);
                                        }
                                      }}
                                      className="p-1 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all cursor-pointer inline-flex items-center"
                                      title="Delete Cut"
                                    >
                                      <Trash2 size={14} />
                                    </button>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>
                    <div className="p-4 border-t bg-zinc-50 flex justify-end">
                      <button 
                        onClick={() => setSelectedClientName(null)} 
                        className="px-5 py-2.5 bg-zinc-950 hover:bg-zinc-800 text-white rounded-xl text-xs font-black transition cursor-pointer"
                      >
                        CLOSE
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* Execute Cut & Leftover Management Modal */}
              {showExecuteModal && executingRoll && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
                  <div className="bg-white rounded-3xl w-full max-w-xl shadow-2xl overflow-hidden flex flex-col animate-in zoom-in-95 duration-200 text-left">
                    {/* Header */}
                    <div className="p-6 border-b border-zinc-150 flex justify-between items-center bg-zinc-950 text-white">
                      <div>
                        <h3 className="text-lg font-black uppercase italic tracking-tight flex items-center gap-2">
                          <Scissors className="h-5 w-5 rotate-90 text-emerald-400" /> Execute Cut & Leftover Plan
                        </h3>
                        <p className="text-[10px] text-zinc-400 mt-1 uppercase font-bold tracking-wider">Review cut & choose leftover action</p>
                      </div>
                      <button 
                        onClick={() => setShowExecuteModal(false)} 
                        className="p-2 text-zinc-400 hover:text-white bg-zinc-900 hover:bg-zinc-800 rounded-xl transition cursor-pointer"
                      >
                        <X className="h-5 w-5" />
                      </button>
                    </div>

                    <div className="p-6 overflow-y-auto max-h-[60vh] space-y-6">
                      {/* Section 1: Cut Details */}
                      <div className="bg-slate-50 border border-slate-100 p-4 rounded-2xl space-y-3">
                        <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest">1. Execution Summary</h4>
                        <div className="grid grid-cols-2 gap-4">
                          <div className="bg-white p-3 rounded-xl border border-slate-150">
                            <span className="text-[9px] font-black text-slate-400 uppercase block mb-1">Source Roll</span>
                            <div className="font-black text-slate-800 text-xs">{executingRoll.id}</div>
                            <div className="text-[10px] font-bold text-slate-500 mt-0.5">
                              {fromMeters(executingRoll.fullLength).toFixed(1)}{currentUnit} x {fromMeters(executingRoll.fullWidth).toFixed(1)}{currentUnit} ({executingRoll.totalSqm.toFixed(1)} m²)
                            </div>
                          </div>
                          
                          <div className="bg-white p-3 rounded-xl border border-slate-150">
                            <span className="text-[9px] font-black text-slate-400 uppercase block mb-1">Cut Dimensions</span>
                            <div className="font-black text-emerald-600 text-xs">
                              {fromMeters(selectedOrder.requiredLength).toFixed(1)}{currentUnit} x {fromMeters(selectedOrder.requiredWidth).toFixed(1)}{currentUnit}
                            </div>
                            <div className="text-[10px] font-bold text-slate-500 mt-0.5">
                              Area: {(selectedOrder.requiredWidth * selectedOrder.requiredLength).toFixed(1)} m²
                            </div>
                          </div>
                        </div>

                        <div className="flex justify-between items-center text-[11px] font-bold px-1 pt-1">
                          <span className="text-slate-400 uppercase tracking-wider">Party/Customer:</span>
                          <span className="text-slate-800 font-black">{selectedOrder.isInventoryCut ? 'INTERNAL STOCK' : selectedOrder.customerName}</span>
                        </div>

                        <div className="flex justify-between items-center text-[11px] font-bold px-1 border-t border-slate-100 pt-2">
                          <span className="text-slate-400 uppercase tracking-wider">Leftover Area:</span>
                          <span className="text-amber-600 font-black">
                            {(executingRoll.remainingSqm - (selectedOrder.requiredWidth * selectedOrder.requiredLength)).toFixed(2)} m²
                          </span>
                        </div>
                      </div>

                      {/* Section 2: Leftover Action Choice */}
                      <div className="space-y-3">
                        <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest">2. Leftover Destination (Baki wale ka kya karein?)</h4>
                        
                        <div className="grid grid-cols-1 gap-3">
                          {/* Option 1: Keep in Roll */}
                          <div 
                            onClick={() => setLeftoverAction('keep_roll')}
                            className={`p-3.5 rounded-2xl border-2 transition cursor-pointer flex items-start gap-4 ${
                              leftoverAction === 'keep_roll' 
                                ? 'border-emerald-600 bg-emerald-50/10' 
                                : 'border-zinc-200 hover:border-zinc-300 bg-white'
                            }`}
                          >
                            <div className={`p-2 rounded-xl mt-0.5 ${leftoverAction === 'keep_roll' ? 'bg-emerald-600 text-white' : 'bg-slate-100 text-slate-500'}`}>
                              <RotateCcw className="h-4 w-4" />
                            </div>
                            <div className="flex-1 text-left">
                              <div className="font-black text-slate-900 text-xs uppercase tracking-wider">Keep in Active Roll</div>
                              <p className="text-[10px] font-bold text-slate-500 mt-0.5">Let the leftover stay on master roll {executingRoll.id} for future planned cuts.</p>
                            </div>
                          </div>

                          {/* Option 2: Inventory */}
                          <div 
                            onClick={() => setLeftoverAction('inventory')}
                            className={`p-3.5 rounded-2xl border-2 transition cursor-pointer flex flex-col gap-3 ${
                              leftoverAction === 'inventory' 
                                ? 'border-indigo-600 bg-indigo-50/10' 
                                : 'border-zinc-200 hover:border-zinc-300 bg-white'
                            }`}
                          >
                            <div className="flex items-start gap-4">
                              <div className={`p-2 rounded-xl mt-0.5 ${leftoverAction === 'inventory' ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-500'}`}>
                                <Warehouse className="h-4 w-4" />
                              </div>
                              <div className="flex-1 text-left">
                                <div className="font-black text-slate-900 text-xs uppercase tracking-wider">Inventory (Save as Remnant)</div>
                                <p className="text-[10px] font-bold text-slate-500 mt-0.5">Save the physical leftover as a brand-new reusable roll in the Stock Registry.</p>
                              </div>
                            </div>

                            {/* Conditional Inputs */}
                            {leftoverAction === 'inventory' && (
                              <div className="mt-1 bg-white p-3 rounded-xl border border-indigo-150 grid grid-cols-2 gap-3 animate-in fade-in-50 slide-in-from-top-1 duration-150">
                                <div>
                                  <label className="text-[9px] font-black text-slate-400 uppercase block mb-1">Leftover Width ({currentUnit})</label>
                                  <input 
                                    type="number" 
                                    step="any"
                                    value={leftoverWidthInput}
                                    onChange={(e) => setLeftoverWidthInput(e.target.value)}
                                    onClick={(e) => e.stopPropagation()}
                                    className="w-full px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-bold text-slate-800 focus:outline-indigo-500 text-left"
                                  />
                                </div>
                                <div>
                                  <label className="text-[9px] font-black text-slate-400 uppercase block mb-1">Leftover Length ({currentUnit})</label>
                                  <input 
                                    type="number" 
                                    step="any"
                                    value={leftoverLengthInput}
                                    onChange={(e) => setLeftoverLengthInput(e.target.value)}
                                    onClick={(e) => e.stopPropagation()}
                                    className="w-full px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-bold text-slate-800 focus:outline-indigo-500 text-left"
                                  />
                                </div>
                                <div className="col-span-2 text-[10px] text-indigo-600 font-bold bg-indigo-50/50 p-2 rounded-lg text-center uppercase tracking-wider">
                                  Resulting Remnant Area: {((parseFloat(leftoverWidthInput) || 0) * (parseFloat(leftoverLengthInput) || 0) / (currentUnit === 'm' ? 1 : (CONVERSIONS[currentUnit] * CONVERSIONS[currentUnit]))).toFixed(2)} m²
                                </div>
                              </div>
                            )}
                          </div>

                          {/* Option 3: Scrub */}
                          <div 
                            onClick={() => setLeftoverAction('scrub')}
                            className={`p-3.5 rounded-2xl border-2 transition cursor-pointer flex items-start gap-4 ${
                              leftoverAction === 'scrub' 
                                ? 'border-rose-600 bg-rose-50/10' 
                                : 'border-zinc-200 hover:border-zinc-300 bg-white'
                            }`}
                          >
                            <div className={`p-2 rounded-xl mt-0.5 ${leftoverAction === 'scrub' ? 'bg-rose-600 text-white' : 'bg-slate-100 text-slate-500'}`}>
                              <Trash2 className="h-4 w-4" />
                            </div>
                            <div className="flex-1 text-left">
                              <div className="font-black text-slate-900 text-xs uppercase tracking-wider">Send to Scrub (Waste)</div>
                              <p className="text-[10px] font-bold text-slate-500 mt-0.5">Mark the remaining space as waste. Original roll will be marked as refused.</p>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Footer Actions */}
                    <div className="p-4 border-t bg-zinc-50 flex justify-end gap-3">
                      <button 
                        onClick={() => setShowExecuteModal(false)}
                        className="px-5 py-2.5 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-xl text-[10px] font-black transition cursor-pointer uppercase tracking-widest"
                      >
                        Cancel
                      </button>
                      <button 
                        onClick={confirmExecuteCut}
                        className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-[10px] font-black transition cursor-pointer flex items-center gap-1.5 uppercase tracking-widest shadow-lg active:scale-95"
                      >
                        <Scissors size={12} /> Confirm & Save
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* Roll Client Allocations Popup/Modal */}
              {selectedRollId && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
                  <div className="bg-white rounded-3xl w-full max-w-4xl shadow-2xl max-h-[85vh] overflow-hidden flex flex-col animate-in zoom-in-95 duration-200 text-left">
                    <div className="p-6 border-b border-zinc-150 flex justify-between items-center bg-zinc-950 text-white">
                      <div>
                        <h3 className="text-xl font-black uppercase italic tracking-tight">Client Allocations for Roll {selectedRollId}</h3>
                        <p className="text-xs text-zinc-400 mt-1">List of cuts and clients that consumed stock from this roll</p>
                      </div>
                      <button 
                        onClick={() => setSelectedRollId(null)} 
                        className="p-2 text-zinc-400 hover:text-white bg-zinc-900 hover:bg-zinc-800 rounded-xl transition cursor-pointer"
                      >
                        <X className="h-5 w-5" />
                      </button>
                    </div>
                    <div className="p-6 overflow-y-auto flex-1">
                      <div className="border border-zinc-200 rounded-2xl overflow-hidden">
                        <table className="w-full text-left">
                          <thead className="bg-slate-50">
                            <tr>
                              <th className="px-5 py-3 text-[9px] font-black text-slate-400 uppercase tracking-widest">Client Name</th>
                              <th className="px-5 py-3 text-[9px] font-black text-slate-400 uppercase tracking-widest">Cut ID</th>
                              <th className="px-5 py-3 text-[9px] font-black text-slate-400 uppercase tracking-widest">Dimensions</th>
                              <th className="px-5 py-3 text-[9px] font-black text-slate-400 uppercase tracking-widest">Type</th>
                              <th className="px-5 py-3 text-[9px] font-black text-slate-400 uppercase tracking-widest">Entry Date &amp; Time</th>
                              <th className="px-5 py-3 text-[9px] font-black text-slate-400 uppercase tracking-widest text-right">Actions</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-zinc-100 text-xs font-semibold text-slate-700">
                            {(rolls.find(r => r.id === selectedRollId)?.cuts || []).map((cut) => {
                              let dateStr = 'N/A';
                              const tsMatch = cut.id.match(/C-(\d+)/);
                              if (tsMatch) {
                                const d = new Date(parseInt(tsMatch[1], 10));
                                if (!isNaN(d.getTime())) {
                                  dateStr = `${d.toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' })} ${d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true })}`;
                                }
                              }
                              return (
                                <tr key={cut.id} className="hover:bg-slate-50/50">
                                  <td className="px-5 py-3 font-bold text-slate-900">{cut.customerName}</td>
                                  <td className="px-5 py-3 font-mono text-[10px] text-zinc-500">{cut.id.substring(0, 12)}</td>
                                  <td className="px-5 py-3 text-zinc-950 font-bold">
                                    {fromMeters(cut.length).toFixed(1)}{currentUnit} x {fromMeters(cut.width).toFixed(1)}{currentUnit}
                                  </td>
                                  <td className="px-5 py-3">
                                    {cut.isInventoryCut ? (
                                      <span className="bg-slate-100 text-slate-600 px-2 py-0.5 rounded-lg border font-bold text-[9px]">STOCK</span>
                                    ) : (
                                      <span className="bg-blue-50 text-blue-700 px-2 py-0.5 rounded-lg border border-blue-100 font-bold text-[9px]">CLIENT</span>
                                    )}
                                  </td>
                                  <td className="px-5 py-3 font-bold text-slate-450">{dateStr}</td>
                                  <td className="px-5 py-3 text-right">
                                    <button 
                                      onClick={() => {
                                        handleDeleteCut(selectedRollId, cut);
                                        const rollObj = rolls.find(r => r.id === selectedRollId);
                                        if (rollObj && rollObj.cuts.length <= 1) {
                                          setSelectedRollId(null);
                                        }
                                      }}
                                      className="p-1 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all cursor-pointer inline-flex items-center"
                                      title="Delete Cut"
                                    >
                                      <Trash2 size={14} />
                                    </button>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>
                    <div className="p-4 border-t bg-zinc-50 flex justify-end">
                      <button 
                        onClick={() => setSelectedRollId(null)} 
                        className="px-5 py-2.5 bg-zinc-950 hover:bg-zinc-800 text-white rounded-xl text-xs font-black transition cursor-pointer"
                      >
                        CLOSE
                      </button>
                    </div>
                  </div>
                </div>
              )}
        </div>
      </main>
    </div>
  );
};
