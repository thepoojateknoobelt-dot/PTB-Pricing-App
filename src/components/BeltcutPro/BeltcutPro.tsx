import React, { useState, useEffect, useMemo } from 'react';
import {
  Package, Layers, Scissors, AlertTriangle, Plus, Trash2,
  ChevronRight, ChevronLeft, TrendingDown, Info,
  RotateCcw, Wand2, BarChart3, Loader2, Warehouse, User,
  ArrowLeft, X, Menu, Search, Printer, Download, Edit2, Check,
  ClipboardList, Send, Clock, ArrowDownCircle
} from 'lucide-react';
import {
  saveRoll, updateRoll, deleteRoll, saveCut, deleteCut, fetchRolls, OperationType
} from './services/firebase';
import { toast } from 'sonner';
import { Roll, Cut, Order, OptimizationCandidate, Unit, MaterialStock, MaterialIssue } from './types';
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

const isRollReuse = (roll: Roll) => {
  return !!(roll.isReuse || (roll.id && roll.id.startsWith('REUSE-')));
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

  const [activeTab, setActiveTab] = useState<'dashboard' | 'cutting' | 'rolls_map' | 'details' | 'stock' | 'scrub' | 'production'>('dashboard');
  const [detailsSubTab, setDetailsSubTab] = useState<'clients' | 'rolls'>('clients');
  const [selectedClientName, setSelectedClientName] = useState<string | null>(null);
  const [selectedRollId, setSelectedRollId] = useState<string | null>(null);
  const [rollDetailPanelId, setRollDetailPanelId] = useState<string | null>(null);
  const [cuttingMode, setCuttingMode] = useState<'auto' | 'manual'>('auto');
  const [isSyncing, setIsSyncing] = useState(true);
  const [showAddRollForm, setShowAddRollForm] = useState(false);
  const [currentDateTime, setCurrentDateTime] = useState(new Date());
  const [showPartySuggestions, setShowPartySuggestions] = useState(false);

  // Expanded/Accordion Roll ID for Remnant Matching Visualization
  const [expandedRollId, setExpandedRollId] = useState<string | null>(null);
  const [lastCutRollId, setLastCutRollId] = useState<string | null>(null);

  // Cut Purpose State & Active Orders
  const [cutPurpose, setCutPurpose] = useState<'manual' | 'order' | 'scrap' | 'inventory'>('order');
  const [orders, setOrders] = useState<any[]>([]);
  const [allOrdersMap, setAllOrdersMap] = useState<Record<string, string>>({});
  const [selectedOrderNumber, setSelectedOrderNumber] = useState<string>('');
  const [orderSearchQuery, setOrderSearchQuery] = useState<string>('');
  const [showOrderDropdown, setShowOrderDropdown] = useState<boolean>(false);
  const [tableSearchQuery, setTableSearchQuery] = useState<string>('');

  // Target Roll Selection for Scrap & Inventory
  const [cuttingSelectedRollId, setCuttingSelectedRollId] = useState<string>('');
  const [rollSearchQuery, setRollSearchQuery] = useState<string>('');
  const [showRollDropdown, setShowRollDropdown] = useState<boolean>(false);

  // Material Stocks States
  const [materialStocks, setMaterialStocks] = useState<MaterialStock[]>([]);
  const [newMaterialStock, setNewMaterialStock] = useState({ name: '', quantity: '', unit: 'pcs', reorderLevel: '' });
  const [config, setConfig] = useState<any>(null);

  const loadConfigData = async () => {
    try {
      const res = await fetch('/api/settings/config');
      if (res.ok) {
        const data = await res.json();
        setConfig(data);
      }
    } catch (err) {
      console.error("Failed to fetch system config in BeltcutPro:", err);
    }
  };
  const [editingMaterialStock, setEditingMaterialStock] = useState<MaterialStock | null>(null);
  const [showAddMaterialForm, setShowAddMaterialForm] = useState(false);
  const [activeInventoryCard, setActiveInventoryCard] = useState<'materials' | 'remnants' | 'fresh' | 'reorder' | null>(null);
  const [editingReorderLevel, setEditingReorderLevel] = useState<Record<string, string>>({}); // stockId -> input value
  const [savingReorderLevel, setSavingReorderLevel] = useState<string | null>(null); // stockId being saved

  // Search states for individual Inventory Tables
  const [materialSearchQuery, setMaterialSearchQuery] = useState('');
  const [remnantSearchQuery, setRemnantSearchQuery] = useState('');
  const [freshRollSearchQuery, setFreshRollSearchQuery] = useState('');
  const [reorderSearchQuery, setReorderSearchQuery] = useState('');

  // Production / Material Issues states
  const [materialIssues, setMaterialIssues] = useState<MaterialIssue[]>([]);
  const [showIssueModal, setShowIssueModal] = useState(false);
  const [issuingStock, setIssuingStock] = useState<MaterialStock | null>(null);
  const [issueForm, setIssueForm] = useState({ quantity: '', issuedTo: '', notes: '' });
  const [isSubmittingIssue, setIsSubmittingIssue] = useState(false);

  const loadMaterialStocksData = async () => {
    try {
      const res = await fetch('/api/material-stocks');
      if (res.ok) {
        const data = await res.json();
        setMaterialStocks(data);
      }
    } catch (err) {
      console.error("Failed to fetch material stocks:", err);
    }
  };

  const handleAddMaterialStock = async () => {
    if (!newMaterialStock.name.trim()) return;
    try {
      const res = await fetch('/api/material-stocks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newMaterialStock.name.trim(),
          quantity: parseFloat(newMaterialStock.quantity) || 0,
          unit: newMaterialStock.unit.trim() || 'pcs'
        })
      });
      if (res.ok) {
        toast.success("Material stock added successfully!");
        setNewMaterialStock({ name: '', quantity: '', unit: 'pcs', reorderLevel: '' });
        setShowAddMaterialForm(false);
        loadMaterialStocksData();
      } else {
        const errData = await res.json().catch(() => ({}));
        toast.error(errData.error || "Failed to add material stock");
      }
    } catch (err) {
      toast.error("Failed to add material stock");
    }
  };

  const handleUpdateMaterialStock = async () => {
    if (!editingMaterialStock || !editingMaterialStock.name.trim()) return;
    try {
      const res = await fetch(`/api/material-stocks/${editingMaterialStock.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: editingMaterialStock.name.trim(),
          quantity: editingMaterialStock.quantity,
          unit: editingMaterialStock.unit
        })
      });
      if (res.ok) {
        toast.success("Material stock updated successfully!");
        setEditingMaterialStock(null);
        loadMaterialStocksData();
      } else {
        const errData = await res.json().catch(() => ({}));
        toast.error(errData.error || "Failed to update material stock");
      }
    } catch (err) {
      toast.error("Failed to update material stock");
    }
  };

  const handleDeleteMaterialStock = async (id: string, name: string) => {
    if (!window.confirm(`Are you sure you want to delete "${name}"?`)) return;
    try {
      const res = await fetch(`/api/material-stocks/${id}`, {
        method: 'DELETE'
      });
      if (res.ok) {
        toast.success("Material stock deleted successfully!");
        loadMaterialStocksData();
      } else {
        const errData = await res.json().catch(() => ({}));
        toast.error(errData.error || "Failed to delete material stock");
      }
    } catch (err) {
      toast.error("Failed to delete material stock");
    }
  };


  const handleSaveReorderLevel = async (stockId: string) => {
    const val = editingReorderLevel[stockId];
    if (val === undefined || val === '') return;
    setSavingReorderLevel(stockId);
    try {
      const res = await fetch(`/api/material-stocks/${stockId}/reorder-level`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reorderLevel: parseFloat(val) || 0 })
      });
      if (res.ok) {
        toast.success('Reorder level saved!');
        setEditingReorderLevel(prev => { const next = { ...prev }; delete next[stockId]; return next; });
        loadMaterialStocksData();
      } else {
        const errData = await res.json().catch(() => ({}));
        toast.error(errData.error || 'Failed to save reorder level');
      }
    } catch (err) {
      toast.error('Failed to save reorder level');
    } finally {
      setSavingReorderLevel(null);
    }
  };


  // â”€â”€ Production / Material Issues functions â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const loadMaterialIssues = async () => {
    try {
      const res = await fetch('/api/material-issues');
      if (res.ok) {
        const data = await res.json();
        setMaterialIssues(data);
      }
    } catch (err) {
      console.error('Failed to fetch material issues:', err);
    }
  };

  const handleOpenIssueModal = (stock: MaterialStock) => {
    setIssuingStock(stock);
    setIssueForm({ quantity: '', issuedTo: '', notes: '' });
    setShowIssueModal(true);
  };

  const handleSubmitIssue = async () => {
    if (!issuingStock) return;
    if (!issueForm.issuedTo.trim()) { toast.error('Please enter who this is being issued to'); return; }
    const qty = parseFloat(issueForm.quantity);
    if (isNaN(qty) || qty <= 0) { toast.error('Please enter a valid quantity'); return; }
    if (qty > issuingStock.quantity) {
      toast.error(`Cannot issue more than available stock (${issuingStock.quantity} ${issuingStock.unit})`);
      return;
    }
    setIsSubmittingIssue(true);
    try {
      const res = await fetch('/api/material-issues', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          materialId: issuingStock.id,
          materialName: issuingStock.name,
          quantity: parseFloat(issueForm.quantity),
          unit: issuingStock.unit,
          issuedTo: issueForm.issuedTo.trim(),
          notes: issueForm.notes.trim()
        })
      });
      if (res.ok) {
        toast.success(`âœ… ${issueForm.quantity} ${issuingStock.unit} of ${issuingStock.name} issued to ${issueForm.issuedTo}`);
        setShowIssueModal(false);
        setIssuingStock(null);
        setIssueForm({ quantity: '', issuedTo: '', notes: '' });
        loadMaterialIssues();
        loadMaterialStocksData();
      } else {
        const err = await res.json();
        toast.error(err.error || 'Failed to issue material');
      }
    } catch (err) {
      toast.error('Failed to issue material');
    } finally {
      setIsSubmittingIssue(false);
    }
  };

  const handleDeleteIssue = async (id: string) => {
    if (!window.confirm('Remove this issue record?')) return;
    try {
      const res = await fetch(`/api/material-issues/${id}`, { method: 'DELETE' });
      if (res.ok) { toast.success('Record removed'); loadMaterialIssues(); }
    } catch (err) { toast.error('Failed to delete record'); }
  };

  const loadOrdersData = async () => {
    try {
      const res = await fetch('/api/quotations');
      if (res.ok) {
        const data = await res.json();
        // Sort chronologically ascending to assign permanent order numbers starting at 100
        const sortedChronologically = [...data].sort((a: any, b: any) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

        const withOrderNumbers = sortedChronologically.map((q: any, index: number) => ({
          ...q,
          orderNumber: 100 + index
        }));

        // Keep only active order statuses
        const onlyOrders = withOrderNumbers.filter((q: any) => q.status === 'order');
        setOrders(onlyOrders);

        // Populate allOrdersMap
        const mapping: Record<string, string> = {};
        withOrderNumbers.forEach((q: any) => {
          mapping[q.id.toString()] = `#${q.orderNumber}`;
        });
        setAllOrdersMap(mapping);
      }
    } catch (err) {
      console.error("Failed to fetch active orders for optimizer:", err);
    }
  };

  // Fetch all orders and material stocks on load
  useEffect(() => {
    loadOrdersData();
    loadMaterialStocksData();
    loadMaterialIssues();
    loadConfigData();
  }, []);

  const bomComponentNames = useMemo(() => {
    const names = new Set<string>();
    if (config && Array.isArray(config.beltTypes)) {
      config.beltTypes.forEach((cat: any) => {
        if (Array.isArray(cat.styles)) {
          cat.styles.forEach((style: any) => {
            if (Array.isArray(style.bom)) {
              style.bom.forEach((item: any) => {
                if (item.name) names.add(item.name);
                if (Array.isArray(item.options)) {
                  item.options.forEach((opt: any) => {
                    if (opt.name) names.add(`${item.name} (${opt.name})`);
                  });
                }
              });
            }
          });
        }
      });
    }
    return Array.from(names);
  }, [config]);

  // States for cut execution & leftover management popup
  const [showExecuteModal, setShowExecuteModal] = useState(false);
  const [executingRoll, setExecutingRoll] = useState<Roll | null>(null);
  const [executingResult, setExecutingResult] = useState<any>(null);
  const [leftoverAction, setLeftoverAction] = useState<'keep_roll' | 'scrub' | 'inventory'>('keep_roll');
  const [leftoverWidthInput, setLeftoverWidthInput] = useState<string>('0');
  const [leftoverLengthInput, setLeftoverLengthInput] = useState<string>('0');
  const [isSplitLeftover, setIsSplitLeftover] = useState<boolean>(false);
  const [leftoverWidthInput2, setLeftoverWidthInput2] = useState<string>('0');
  const [leftoverLengthInput2, setLeftoverLengthInput2] = useState<string>('0');
  const [productionSearchQuery, setProductionSearchQuery] = useState<string>('');

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
    requiredWidth: 0,
    requiredLength: 0,
    quantity: 1,
    materialType: MATERIAL_TYPES[0],
    date: new Date().toISOString(),
    isInventoryCut: false
  });

  useEffect(() => {
    setCuttingSelectedRollId('');
    setRollSearchQuery('');
  }, [selectedOrder.materialType]);

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
  // NOTE: Do NOT reset cuttingMode here —  that would break manual placement on every 4s poll
  useEffect(() => {
    const width = activeOrderDimensions.width;
    const length = activeOrderDimensions.length;

    if (width > 0 && length > 0) {
      setLastCutRollId(null);
      let activeRolls = rolls.filter(r => r.status !== 'refused');
      if ((cutPurpose === 'scrap' || cutPurpose === 'inventory') && cuttingSelectedRollId) {
        activeRolls = activeRolls.filter(r => r.id === cuttingSelectedRollId);
      }
      const results = findGlobalBestPlacement(activeRolls, {
        ...selectedOrder,
        requiredWidth: width,
        requiredLength: length
      });
      const top3 = results.slice(0, 3);
      setOptimizationResults(top3);
      // Preserve current user-selected option index if it is still within bounds of the new suggestions
      setCurrentOptionIndex(prev => prev < top3.length ? prev : 0);
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
    rolls,
    cutPurpose,
    cuttingSelectedRollId
  ]);

  const visibleRolls = useMemo(() => {
    let active = rolls.filter(r =>
      r.materialType === selectedOrder.materialType &&
      r.status !== 'refused' &&
      r.remainingSqm > 0.01
    );

    if ((cutPurpose === 'scrap' || cutPurpose === 'inventory') && cuttingSelectedRollId) {
      active = active.filter(r => r.id === cuttingSelectedRollId);
    }

    let list = [...active];
    list.sort((a, b) => {
      // 1. Prioritize last cut roll to be at the absolute top (index 0)
      if (lastCutRollId) {
        if (a.id === lastCutRollId) return -1;
        if (b.id === lastCutRollId) return 1;
      }

      // 2. Sort by optimization recommendations
      if (optimizationResults && optimizationResults.length > 0) {
        const recommendedIds = optimizationResults.map(res => res.rollId);
        const aIndex = recommendedIds.indexOf(a.id);
        const bIndex = recommendedIds.indexOf(b.id);

        if (aIndex !== -1 && bIndex !== -1) {
          return aIndex - bIndex; // keep recommendation order
        }
        if (aIndex !== -1) {
          return -1; // recommended first
        }
        if (bIndex !== -1) {
          return 1; // recommended first
        }
      }
      return 0;
    });

    // Show at most 4 rolls in the visualization accordion
    return list.slice(0, 4);
  }, [rolls, selectedOrder.materialType, optimizationResults, lastCutRollId, cutPurpose, cuttingSelectedRollId]);

  // Set the first visible roll as expanded by default or keep the current one expanded if still visible
  useEffect(() => {
    if (visibleRolls.length > 0) {
      const stillVisible = visibleRolls.some(r => r.id === expandedRollId);
      if (!stillVisible) {
        setExpandedRollId(visibleRolls[0].id);
      }
    } else {
      setExpandedRollId(null);
    }
  }, [visibleRolls, expandedRollId]);

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

    const freshRollsCut = rolls.filter(r => !isRollReuse(r) && r.cuts && r.cuts.length > 0).length;
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
      setExpandedRollId(candidate.rollId);
      setTimeout(() => {
        const element = document.getElementById(`roll-visualizer-${candidate.rollId}`);
        if (element) {
          element.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      }, 100);
    }
  };

  const getSmartLeftoverSuggestion = () => {
    if (!executingRoll) return { action: 'keep_roll', text: '' };
    const reqWidth = activeOrderDimensions.width || 0;
    const reqLength = activeOrderDimensions.length || 0;
    const remainingSqm = executingRoll.remainingSqm - (reqWidth * reqLength);
    const suggestedWidth = executingRoll.fullWidth || 0;
    const suggestedLength = suggestedWidth > 0 ? Math.max(0, remainingSqm / suggestedWidth) : 0;

    if (remainingSqm < 0.5 || suggestedLength < 0.3) {
      return {
        action: 'scrub',
        text: 'Since the remaining piece is extremely small or thin, we suggest sending it to Scrap.'
      };
    } else if (isRollReuse(executingRoll)) {
      return {
        action: 'inventory',
        text: 'The remaining piece is substantial and fits well as a standalone Remnant. We suggest putting it in Inventory.'
      };
    } else {
      return {
        action: 'keep_roll',
        text: 'The original roll is a fresh master roll. We suggest keeping the leftover in the active roll to maintain continuity.'
      };
    }
  };

  const toMeters = (val: number) => val / CONVERSIONS[currentUnit];
  const fromMeters = (val: number) => val * CONVERSIONS[currentUnit];

  const formatDisplayValue = (val: number): string => {
    if (val === 0) return '0';
    return val.toLocaleString(undefined, {
      maximumFractionDigits: 1,
      minimumFractionDigits: val % 1 === 0 ? 0 : 1
    });
  };

  const handleCalculateBestFit = () => {
    if (!selectedOrder.isInventoryCut && cutPurpose !== 'scrap' && !selectedOrder.customerName.trim()) {
      alert("Party Name is compulsory for client orders.");
      return;
    }
    setLastCutRollId(null);
    let activeRolls = rolls.filter(r => r.status !== 'refused');
    if ((cutPurpose === 'scrap' || cutPurpose === 'inventory') && cuttingSelectedRollId) {
      activeRolls = activeRolls.filter(r => r.id === cuttingSelectedRollId);
    }
    const results = findGlobalBestPlacement(activeRolls, {
      ...selectedOrder,
      requiredWidth: activeOrderDimensions.width,
      requiredLength: activeOrderDimensions.length
    });
    const top3 = results.slice(0, 3);
    setOptimizationResults(top3);
    setCurrentOptionIndex(0);
    setCuttingMode('auto');
    if (top3.length === 0) {
      alert("No suitable placement found in existing inventory remnants. Try adding a new roll.");
    } else {
      // Auto expand the top (best) candidate roll
      setExpandedRollId(top3[0].rollId);
      setTimeout(() => {
        const element = document.getElementById(`roll-visualizer-${top3[0].rollId}`);
        if (element) {
          element.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      }, 100);
    }
  };

  const handleExecuteCutWithPlacement = async (result: any, targetRoll: Roll) => {
    try {
      const isInventory = !!selectedOrder.isInventoryCut;
      const clientName = (selectedOrder.customerName || '').trim();

      if (!isInventory && cutPurpose !== 'scrap' && !clientName) {
        alert("Party Name is compulsory for Client Cuts. Please enter a Customer Name in the left panel.");
        return;
      }

      const reqWidth = activeOrderDimensions.width || 0;
      const reqLength = activeOrderDimensions.length || 0;
      if (reqWidth <= 0 || reqLength <= 0) {
        alert("Error: Dimensions must be greater than zero.");
        return;
      }

      if (!isSpaceAvailable(targetRoll, result.placement.x, result.placement.y, reqWidth, reqLength)) {
        alert("Selected placement is no longer valid. Please re-calculate.");
        return;
      }

      // Automatically determine the leftover action
      const remainingSqm = targetRoll.remainingSqm - (reqWidth * reqLength);
      const suggestedWidth = targetRoll.fullWidth || 0;
      const suggestedLength = suggestedWidth > 0 ? Math.max(0, remainingSqm / suggestedWidth) : 0;
      let autoAction: 'keep_roll' | 'scrub' | 'inventory' = 'keep_roll';

      if (remainingSqm < 0.5 || suggestedLength < 0.3) {
        autoAction = 'scrub';
      } else if (isRollReuse(targetRoll)) {
        autoAction = 'inventory';
      } else {
        autoAction = 'keep_roll';
      }

      await confirmExecuteCut(targetRoll, result, autoAction);
    } catch (err: any) {
      alert("Error executing cut: " + err?.message);
      console.error("Error in handleExecuteCutWithPlacement:", err);
    }
  };

  const handleExecuteCut = async () => {
    if (!currentResult) {
      alert("No placement has been selected. Please choose a placement first.");
      return;
    }
    const { rollId } = currentResult as any;
    const targetRoll = rolls.find(r => r.id === rollId);
    if (!targetRoll) return;

    const isInventory = !!selectedOrder.isInventoryCut;
    const clientName = (selectedOrder.customerName || '').trim();

    if (!isInventory && cutPurpose !== 'scrap' && !clientName) {
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

    if (!isSpaceAvailable(targetRoll, currentResult.placement.x, currentResult.placement.y, reqWidth, reqLength)) {
      alert("Selected placement is no longer valid for the current dimensions. Please re-calculate the fit.");
      return;
    }

    // Automatically determine the leftover action
    const remainingSqm = targetRoll.remainingSqm - (reqWidth * reqLength);
    const suggestedWidth = targetRoll.fullWidth || 0;
    const suggestedLength = suggestedWidth > 0 ? Math.max(0, remainingSqm / suggestedWidth) : 0;
    let autoAction: 'keep_roll' | 'scrub' | 'inventory' = 'keep_roll';

    if (remainingSqm < 0.5 || suggestedLength < 0.3) {
      autoAction = 'scrub';
    } else if (isRollReuse(targetRoll)) {
      autoAction = 'inventory';
    } else {
      autoAction = 'keep_roll';
    }

    await confirmExecuteCut(targetRoll, currentResult, autoAction);
  };

  const confirmExecuteCut = async (
    targetRollOverride?: Roll,
    resultOverride?: any,
    actionOverride?: 'keep_roll' | 'scrub' | 'inventory'
  ) => {
    const currentRoll = targetRollOverride || executingRoll;
    const currentResultObj = resultOverride || executingResult;
    if (!currentRoll || !currentResultObj) return;

    setIsSyncing(true);

    const { rollId, placement } = currentResultObj;
    const cutDate = new Date().toISOString();

    const newCut: Cut = {
      id: `C-${Date.now()}-${Math.floor(Math.random() * 100000)}`,
      orderId: selectedOrder.id,
      customerName: selectedOrder.isInventoryCut ? 'INTERNAL STOCK' : (cutPurpose === 'scrap' ? 'SCRAP WASTE' : (selectedOrder.customerName || '').trim()),
      width: activeOrderDimensions.width,
      length: activeOrderDimensions.length,
      x: placement.x,
      y: placement.y,
      status: 'completed',
      color: selectedOrder.isInventoryCut ? '#1e293b' : (cutPurpose === 'scrap' ? '#ef4444' : CUT_COLORS[Math.floor(Math.random() * CUT_COLORS.length)]),
      isInventoryCut: selectedOrder.isInventoryCut
    };

    const currentAction = actionOverride || leftoverAction;

    try {
      const remainingSqm = currentRoll.remainingSqm - (newCut.width * newCut.length);
      const shouldRefuse = currentAction === 'scrub';

      // 1. Update the remaining area and status in the main roll
      await updateRoll(rollId, {
        remainingSqm: Math.max(0, remainingSqm),
        status: shouldRefuse ? 'refused' : 'active'
      });

      // 2. Save the new cut in the database
      await saveCut(rollId, newCut);

      if (cutPurpose === 'order' && selectedOrderNumber) {
        await fetch(`/api/quotations/${selectedOrder.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: 'executed' })
        });
      }

      // 3. If action is inventory, create new remnant reusable roll in stock
      if (currentAction === 'inventory') {
        const remainingLength = Math.max(0, currentRoll.fullLength - (placement.x + newCut.length));
        const leftoverW = currentRoll.fullWidth;
        const leftoverL = remainingLength;
        if (leftoverW > 0 && leftoverL > 0) {
          const newReuseRollId = `REUSE-${rollId}-${Date.now().toString().slice(-4)}`;
          const newReuseRoll = {
            id: newReuseRollId,
            materialType: currentRoll.materialType,
            fullWidth: leftoverW,
            fullLength: leftoverL,
            totalSqm: leftoverW * leftoverL,
            remainingSqm: leftoverW * leftoverL,
            isArchived: false,
            isReuse: true,
            parentRollId: rollId,
            status: 'active'
          };
          await saveRoll(newReuseRoll);
        }
      }

      // 4. If it's an inventory cut, create a new roll in stock representing this cut
      if (selectedOrder.isInventoryCut && cutPurpose !== 'scrap') {
        const newInvRollId = `INV-${rollId}-${Date.now().toString().slice(-4)}`;
        const newInvRoll = {
          id: newInvRollId,
          materialType: currentRoll.materialType,
          fullWidth: newCut.width,
          fullLength: newCut.length,
          totalSqm: newCut.width * newCut.length,
          remainingSqm: newCut.width * newCut.length,
          isArchived: false,
          isReuse: false,
          parentRollId: rollId,
          status: 'active'
        };
        await saveRoll(newInvRoll);
      }

      // 5. If it's a scrap cut, create a new refused roll in stock representing this scrap piece
      if (cutPurpose === 'scrap') {
        const scrapRollId = `SCRAP-${rollId}-${Date.now().toString().slice(-5)}`;
        const scrapEntry = {
          id: scrapRollId,
          materialType: currentRoll.materialType,
          fullWidth: newCut.width,
          fullLength: newCut.length,
          totalSqm: newCut.width * newCut.length,
          remainingSqm: newCut.width * newCut.length,
          isArchived: false,
          isReuse: isRollReuse(currentRoll),
          parentRollId: rollId,
          status: 'refused'
        };
        await saveRoll(scrapEntry);
      }

      toast.success("Cut executed and saved successfully!");
      await loadRollsData();
      setLastCutRollId(rollId);
    } catch (err) {
      console.error("Error executing cut:", err);
      alert("Failed to execute cut. Please try again.");
    } finally {
      setIsSyncing(false);
      setShowExecuteModal(false);
      setExecutingRoll(null);
      setExecutingResult(null);
      setOptimizationResults([]);
      setCurrentOptionIndex(0);
      setManualPlacement(null);
      setIsSplitLeftover(false);
      setLeftoverWidthInput2('0');
      setLeftoverLengthInput2('0');
      setSelectedOrder({
        id: `O-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
        customerName: '',
        requiredWidth: 0,
        requiredLength: 0,
        quantity: 1,
        materialType: selectedOrder.materialType,
        date: new Date().toISOString(),
        isInventoryCut: false
      });
      setSelectedOrderNumber('');
      setOrderSearchQuery('');
      await loadOrdersData();
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

  const handlePrintRollAllocations = (rollId: string) => {
    const roll = rolls.find(r => r.id === rollId);
    if (!roll) return;
    const cuts = roll.cuts || [];

    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      alert("Pop-up blocker active. Please allow popups for printing.");
      return;
    }

    const cutsRows = cuts.map((cut, idx) => {
      let dateStr = 'N/A';
      const tsMatch = cut.id.match(/C-(\d+)/);
      if (tsMatch) {
        const d = new Date(parseInt(tsMatch[1], 10));
        if (!isNaN(d.getTime())) {
          dateStr = `${d.toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' })} ${d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true })}`;
        }
      }
      const lenVal = fromMeters(cut.length).toFixed(1);
      const widVal = fromMeters(cut.width).toFixed(1);
      return `
        <tr>
          <td>#${idx + 1}</td>
          <td>${cut.customerName || 'N/A'}</td>
          <td>${cut.id.substring(0, 12)}</td>
          <td>${lenVal}${currentUnit} x ${widVal}${currentUnit}</td>
          <td>${cut.isInventoryCut ? 'STOCK' : 'CLIENT'}</td>
          <td>${dateStr}</td>
        </tr>
      `;
    }).join('');

    printWindow.document.write(`
      <html>
        <head>
          <title>Client Allocations - Roll ${rollId}</title>
          <style>
            body { font-family: sans-serif; padding: 20px; color: #1e293b; }
            .print-header {
              display: flex;
              align-items: center;
              gap: 15px;
              border-bottom: 3px double #cbd5e1;
              padding-bottom: 15px;
              margin-bottom: 20px;
            }
            .logo {
              width: 45px;
              height: 45px;
              color: #1e293b;
              flex-shrink: 0;
            }
            .company-info {
              display: flex;
              flex-direction: column;
            }
            .company-name {
              font-size: 22px;
              font-weight: 900;
              color: #0f172a;
              letter-spacing: -0.5px;
              text-transform: uppercase;
            }
            .company-tagline {
              font-size: 10px;
              color: #64748b;
              font-weight: 700;
              text-transform: uppercase;
              letter-spacing: 0.5px;
              margin-top: 1px;
            }
            .document-title {
              display: flex;
              justify-content: space-between;
              align-items: baseline;
              margin-top: 10px;
              margin-bottom: 15px;
            }
            .document-title h2 {
              font-size: 14px;
              text-transform: uppercase;
              font-weight: 800;
              color: #1e293b;
              margin: 0;
            }
            .print-date {
              font-size: 10px;
              color: #64748b;
              font-weight: 700;
            }
            table { width: 100%; border-collapse: collapse; margin-top: 10px; }
            th, td { border: 1px solid #e2e8f0; padding: 10px; text-align: left; font-size: 11px; }
            th { background: #f8fafc; font-weight: bold; }
          </style>
        </head>
        <body>
          <div class="print-header">
            <svg class="logo" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67" />
            </svg>
            <div class="company-info">
              <div class="company-name">POOJA TEKNO BELT</div>
              <div class="company-tagline">Premium Belt Cutting & Optimization Nesting Portal</div>
            </div>
          </div>
          <div class="document-title">
            <h2>Client Allocations - Roll ${rollId}</h2>
            <span class="print-date">Printed on: ${new Date().toLocaleString()}</span>
          </div>
          <table>
            <thead>
              <tr>
                <th>S.No</th>
                <th>Client Name</th>
                <th>Cut ID</th>
                <th>Dimensions</th>
                <th>Type</th>
                <th>Date & Time</th>
              </tr>
            </thead>
            <tbody>
              ${cutsRows || '<tr><td colspan="6" style="text-align:center;">No cuts allocated yet.</td></tr>'}
            </tbody>
          </table>
          <script>
            window.onload = function() {
              window.print();
              window.close();
            }
          </script>
        </body>
      </html>
    `);
    printWindow.document.close();
  };

  const handleExportCSV = (rollId: string) => {
    const roll = rolls.find(r => r.id === rollId);
    if (!roll) return;
    const cuts = roll.cuts || [];

    const headers = ['S.No', 'Client Name', 'Cut ID', 'Length', 'Width', 'Unit', 'Type', 'Date & Time'];
    const rows = cuts.map((cut, idx) => {
      let dateStr = 'N/A';
      const tsMatch = cut.id.match(/C-(\d+)/);
      if (tsMatch) {
        const d = new Date(parseInt(tsMatch[1], 10));
        if (!isNaN(d.getTime())) {
          dateStr = d.toLocaleString('en-IN');
        }
      }
      return [
        idx + 1,
        `"${cut.customerName || ''}"`,
        cut.id,
        fromMeters(cut.length).toFixed(2),
        fromMeters(cut.width).toFixed(2),
        currentUnit,
        cut.isInventoryCut ? 'STOCK' : 'CLIENT',
        `"${dateStr}"`
      ];
    });

    const csvContent = "data:text/csv;charset=utf-8,"
      + [headers.join(','), ...rows.map(e => e.join(','))].join('\n');

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `Roll_${rollId}_Allocations.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleExportClientCSV = () => {
    if (!selectedClientName) return;
    const clientData = clientCutsList.find(c => c.customerName === selectedClientName);
    if (!clientData) return;
    const cuts = clientData.cuts || [];

    const headers = ['Order No.', 'Cut ID', 'Length', 'Width', 'Unit', 'Material', 'Source Roll', 'Date & Time'];
    const rows = cuts.map((item, idx) => {
      let dateStr = 'N/A';
      const tsMatch = item.cut.id.match(/C-(\d+)/);
      if (tsMatch) {
        const d = new Date(parseInt(tsMatch[1], 10));
        if (!isNaN(d.getTime())) {
          dateStr = d.toLocaleString('en-IN');
        }
      }
      return [
        allOrdersMap[item.cut.orderId] || 'Manual',
        item.cut.id,
        fromMeters(item.cut.length).toFixed(2),
        fromMeters(item.cut.width).toFixed(2),
        currentUnit,
        `"${item.rollMaterial || ''}"`,
        item.rollId,
        `"${dateStr}"`
      ];
    });

    const csvContent = "data:text/csv;charset=utf-8,"
      + [headers.join(','), ...rows.map(e => e.join(','))].join('\n');

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `${selectedClientName.replace(/\s+/g, '_')}_Cuts_History.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handlePrintClientCuts = () => {
    if (!selectedClientName) return;
    const clientData = clientCutsList.find(c => c.customerName === selectedClientName);
    if (!clientData) return;
    const cuts = clientData.cuts || [];

    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      alert("Pop-up blocker active. Please allow popups for printing.");
      return;
    }

    const cutsRows = cuts.map((item, idx) => {
      let dateStr = 'N/A';
      const tsMatch = item.cut.id.match(/C-(\d+)/);
      if (tsMatch) {
        const d = new Date(parseInt(tsMatch[1], 10));
        if (!isNaN(d.getTime())) {
          dateStr = `${d.toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' })} ${d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true })}`;
        }
      }
      const lenVal = fromMeters(item.cut.length).toFixed(1);
      const widVal = fromMeters(item.cut.width).toFixed(1);
      return `
        <tr>
          <td>${allOrdersMap[item.cut.orderId] || 'Manual'}</td>
          <td>${item.cut.id.substring(0, 12)}</td>
          <td>${lenVal}${currentUnit} x ${widVal}${currentUnit}</td>
          <td>${item.rollMaterial || 'N/A'}</td>
          <td>${item.rollId}</td>
          <td>${dateStr}</td>
        </tr>
      `;
    }).join('');

    printWindow.document.write(`
      <html>
        <head>
          <title>Cuts History - ${selectedClientName}</title>
          <style>
            body { font-family: sans-serif; padding: 20px; color: #1e293b; }
            .print-header {
              display: flex;
              align-items: center;
              gap: 15px;
              border-bottom: 3px double #cbd5e1;
              padding-bottom: 15px;
              margin-bottom: 20px;
            }
            .logo {
              width: 45px;
              height: 45px;
              color: #1e293b;
              flex-shrink: 0;
            }
            .company-info {
              display: flex;
              flex-direction: column;
            }
            .company-name {
              font-size: 22px;
              font-weight: 900;
              color: #0f172a;
              letter-spacing: -0.5px;
              text-transform: uppercase;
            }
            .company-tagline {
              font-size: 10px;
              color: #64748b;
              font-weight: 700;
              text-transform: uppercase;
              letter-spacing: 0.5px;
              margin-top: 1px;
            }
            .document-title {
              display: flex;
              justify-content: space-between;
              align-items: baseline;
              margin-top: 10px;
              margin-bottom: 15px;
            }
            .document-title h2 {
              font-size: 14px;
              text-transform: uppercase;
              font-weight: 800;
              color: #1e293b;
              margin: 0;
            }
            .print-date {
              font-size: 10px;
              color: #64748b;
              font-weight: 700;
            }
            table { width: 100%; border-collapse: collapse; margin-top: 10px; }
            th, td { border: 1px solid #e2e8f0; padding: 10px; text-align: left; font-size: 11px; }
            th { background: #f8fafc; font-weight: bold; }
          </style>
        </head>
        <body>
          <div class="print-header">
            <svg class="logo" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67" />
            </svg>
            <div class="company-info">
              <div class="company-name">POOJA TEKNO BELT</div>
              <div class="company-tagline">Premium Belt Cutting & Optimization Nesting Portal</div>
            </div>
          </div>
          <div class="document-title">
            <h2>Cuts History - ${selectedClientName}</h2>
            <span class="print-date">Printed on: ${new Date().toLocaleString()}</span>
          </div>
          <table>
            <thead>
              <tr>
                <th>Order No.</th>
                <th>Cut ID</th>
                <th>Dimensions</th>
                <th>Material</th>
                <th>Source Roll</th>
                <th>Date & Time</th>
              </tr>
            </thead>
            <tbody>
              ${cutsRows || '<tr><td colspan="6" style="text-align:center;">No cuts found.</td></tr>'}
            </tbody>
          </table>
          <script>
            window.onload = function() {
              window.print();
              window.close();
            }
          </script>
        </body>
      </html>
    `);
    printWindow.document.close();
  };

  // Group cuts by client for Details Registry
  const clientCutsList = useMemo(() => {
    const clientCutsMap: Record<string, { customerName: string; cuts: { cut: Cut; rollId: string; rollMaterial: string }[] }> = {};
    rolls.forEach(r => {
      r.cuts.forEach(c => {
        const trimmedName = (c.customerName || '').trim();
        if (!trimmedName || trimmedName === 'INTERNAL STOCK' || trimmedName === 'SCRAP WASTE') {
          return;
        }
        const clientKey = trimmedName;
        if (!clientCutsMap[clientKey]) {
          clientCutsMap[clientKey] = {
            customerName: clientKey,
            cuts: []
          };
        }
        clientCutsMap[clientKey].cuts.push({
          cut: { ...c, customerName: trimmedName },
          rollId: r.id,
          rollMaterial: r.materialType
        });
      });
    });
    return Object.values(clientCutsMap).sort((a, b) => a.customerName.localeCompare(b.customerName));
  }, [rolls]);

  const filteredClientCutsList = useMemo(() => {
    if (!tableSearchQuery) return clientCutsList;
    const query = tableSearchQuery.toLowerCase();
    return clientCutsList.filter(client => {
      const matchClient = client.customerName.toLowerCase().includes(query);
      const matchCuts = client.cuts.some(c =>
        c.rollId.toLowerCase().includes(query) ||
        c.rollMaterial.toLowerCase().includes(query)
      );
      return matchClient || matchCuts;
    });
  }, [clientCutsList, tableSearchQuery]);

  const filteredStockRolls = useMemo(() => {
    const activeRolls = rolls.filter(r => r.status !== 'refused');
    if (!tableSearchQuery) return activeRolls;
    const query = tableSearchQuery.toLowerCase();
    return activeRolls.filter(roll =>
      roll.id.toLowerCase().includes(query) ||
      roll.materialType.toLowerCase().includes(query) ||
      fromMeters(roll.fullLength).toFixed(1).includes(query) ||
      fromMeters(roll.fullWidth).toFixed(1).includes(query)
    );
  }, [rolls, tableSearchQuery, currentUnit]);

  const filteredMaterialStocks = useMemo(() => {
    if (!tableSearchQuery) return materialStocks;
    const query = tableSearchQuery.toLowerCase();
    return materialStocks.filter(stock =>
      stock.name.toLowerCase().includes(query) ||
      stock.unit.toLowerCase().includes(query)
    );
  }, [materialStocks, tableSearchQuery]);

  const filteredMaterialStocksList = useMemo(() => {
    if (!materialSearchQuery) return materialStocks;
    const query = materialSearchQuery.toLowerCase().trim();
    return materialStocks.filter(stock =>
      (stock.name || '').toLowerCase().includes(query) ||
      (stock.unit || '').toLowerCase().includes(query)
    );
  }, [materialStocks, materialSearchQuery]);

  const filteredRemnantRollsList = useMemo(() => {
    const activeRemnants = rolls.filter(r => r.status !== 'refused' && isRollReuse(r));
    if (!remnantSearchQuery) return activeRemnants;
    const query = remnantSearchQuery.toLowerCase().trim();
    return activeRemnants.filter(roll =>
      roll.id.toLowerCase().includes(query) ||
      roll.materialType.toLowerCase().includes(query) ||
      fromMeters(roll.fullLength).toFixed(1).includes(query) ||
      fromMeters(roll.fullWidth).toFixed(1).includes(query)
    );
  }, [rolls, remnantSearchQuery, currentUnit]);

  const filteredFreshRollsList = useMemo(() => {
    const activeFresh = rolls.filter(r => r.status !== 'refused' && !isRollReuse(r));
    if (!freshRollSearchQuery) return activeFresh;
    const query = freshRollSearchQuery.toLowerCase().trim();
    return activeFresh.filter(roll =>
      roll.id.toLowerCase().includes(query) ||
      roll.materialType.toLowerCase().includes(query) ||
      fromMeters(roll.fullLength).toFixed(1).includes(query) ||
      fromMeters(roll.fullWidth).toFixed(1).includes(query)
    );
  }, [rolls, freshRollSearchQuery, currentUnit]);

  const filteredReorderItemsList = useMemo(() => {
    if (!reorderSearchQuery) return materialStocks;
    const query = reorderSearchQuery.toLowerCase().trim();
    return materialStocks.filter(stock =>
      (stock.name || '').toLowerCase().includes(query) ||
      (stock.unit || '').toLowerCase().includes(query)
    );
  }, [materialStocks, reorderSearchQuery]);

  const filteredMaterialIssues = useMemo(() => {
    if (!productionSearchQuery) return materialIssues;
    const query = productionSearchQuery.toLowerCase().trim();
    return materialIssues.filter(issue =>
      (issue.materialName || '').toLowerCase().includes(query) ||
      (issue.issuedTo || '').toLowerCase().includes(query) ||
      (issue.notes || '').toLowerCase().includes(query)
    );
  }, [materialIssues, productionSearchQuery]);

  const filteredScrubRolls = useMemo(() => {
    const refusedRolls = rolls.filter(r => r.status === 'refused');
    if (!tableSearchQuery) return refusedRolls;
    const query = tableSearchQuery.toLowerCase();
    return refusedRolls.filter(roll =>
      roll.id.toLowerCase().includes(query) ||
      roll.materialType.toLowerCase().includes(query) ||
      fromMeters(roll.fullLength).toFixed(1).includes(query) ||
      fromMeters(roll.fullWidth).toFixed(1).includes(query)
    );
  }, [rolls, tableSearchQuery, currentUnit]);

  const filteredRollsMapList = useMemo(() => {
    if (!tableSearchQuery) return rolls;
    const query = tableSearchQuery.toLowerCase();
    return rolls.filter(roll => {
      const matchRoll =
        roll.id.toLowerCase().includes(query) ||
        roll.materialType.toLowerCase().includes(query) ||
        fromMeters(roll.fullLength).toFixed(1).includes(query) ||
        fromMeters(roll.fullWidth).toFixed(1).includes(query);

      const matchClients = roll.cuts.some(c =>
        (c.customerName || '').toLowerCase().includes(query)
      );

      return matchRoll || matchClients;
    });
  }, [rolls, tableSearchQuery, currentUnit]);

  const existingPartyNames = useMemo(() => {
    return clientCutsList.map(c => c.customerName).filter(Boolean);
  }, [clientCutsList]);

  const partySuggestions = useMemo(() => {
    const input = (selectedOrder.customerName || '').trim().toLowerCase();
    if (!input) return [];
    return existingPartyNames.filter(name =>
      name.toLowerCase().includes(input) &&
      name.toLowerCase() !== input
    );
  }, [existingPartyNames, selectedOrder.customerName]);

  const isExactPartyMatch = useMemo(() => {
    const input = (selectedOrder.customerName || '').trim().toLowerCase();
    if (!input) return false;
    return existingPartyNames.some(name => name.toLowerCase() === input);
  }, [existingPartyNames, selectedOrder.customerName]);

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
        <nav className="flex-1 px-4 space-y-1 mt-4">
          {[
            { id: 'dashboard', label: 'Overview', icon: BarChart3 },
            { id: 'cutting', label: 'Cutting System', icon: Scissors },
            { id: 'rolls_map', label: 'Roll Clients Map', icon: Layers },
            { id: 'details', label: 'Client Cuts History', icon: User },
            { id: 'stock', label: 'Inventory', icon: Package },
            { id: 'production', label: 'Production Log', icon: ClipboardList },
            { id: 'scrub', label: 'Scrap Registry', icon: Trash2 },
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
                  setTableSearchQuery('');
                  if (tab.id === 'cutting') {
                    setCutPurpose('order');
                    setSelectedOrder(prev => ({ ...prev, isInventoryCut: false, customerName: '' }));
                    setSelectedOrderNumber('');
                    setOrderSearchQuery('');
                  }
                }}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all duration-200 cursor-pointer ${isActive
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
                  className={`py-1.5 rounded-lg text-[9px] font-black transition-all cursor-pointer ${currentUnit === u
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
      <main className="flex-1 overflow-y-auto p-3 sm:p-5 bg-zinc-50/50">
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
          <div className="pb-1 border-b border-zinc-200 mb-2.5 flex flex-row items-center justify-between gap-2.5">
            <h2 className="text-xs sm:text-sm font-black text-zinc-950 uppercase tracking-wider flex items-center gap-1.5 shrink-0">
              {activeTab === 'dashboard' && <BarChart3 className="h-4 w-4 text-zinc-700" />}
              {activeTab === 'cutting' && <Scissors className="h-4 w-4 text-zinc-700" />}
              {activeTab === 'rolls_map' && <Layers className="h-4 w-4 text-zinc-700" />}
              {activeTab === 'details' && <User className="h-4 w-4 text-zinc-700" />}
              {activeTab === 'stock' && <Package className="h-4 w-4 text-zinc-700" />}
              {activeTab === 'scrub' && <Trash2 className="h-4 w-4 text-zinc-700" />}
              {activeTab === 'production' && <ClipboardList className="h-4 w-4 text-zinc-700" />}
              <span>
                {activeTab === 'dashboard' && 'Inventory Overview'}
                {activeTab === 'cutting' && 'Cutting & Optimization'}
                {activeTab === 'rolls_map' && 'Roll Clients Map'}
                {activeTab === 'details' && 'Client Cuts History'}
                {activeTab === 'stock' && 'Stock Registry'}
                {activeTab === 'scrub' && 'Scrap Registry'}
                {activeTab === 'production' && 'Production Log'}
              </span>
            </h2>
            {['scrub', 'details', 'rolls_map', 'production'].includes(activeTab) && (
              <div className={`relative flex items-center gap-2 shrink-0 ${
                activeTab === 'production'
                  ? 'flex-1 max-w-[180px] sm:max-w-[380px] md:max-w-[480px]'
                  : 'w-32 sm:w-60'
              }`}>
                <div className="relative flex-1">
                  <span className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none">
                    <Search className="h-3.5 w-3.5 text-zinc-400" />
                  </span>
                  <input
                    type="text"
                    value={activeTab === 'production' ? productionSearchQuery : tableSearchQuery}
                    onChange={(e) => activeTab === 'production' ? setProductionSearchQuery(e.target.value) : setTableSearchQuery(e.target.value)}
                    placeholder={activeTab === 'production' ? 'Search by material name, issued to, or notes...' : 'Search...'}
                    className="w-full pl-8 pr-3 py-1 bg-white border border-zinc-200 rounded-lg text-xs font-bold text-zinc-950 focus:outline-none focus:ring-2 focus:ring-zinc-950 placeholder-zinc-400 shadow-sm text-left"
                  />
                </div>
                {activeTab === 'production' && (
                  <div className="flex items-center gap-1.5 shrink-0">
                    <span className="text-[10px] font-black text-indigo-700 bg-indigo-50 border border-indigo-100 px-2 py-0.5 rounded-full leading-none">
                      {filteredMaterialIssues.length} records
                    </span>
                    <button
                      onClick={loadMaterialIssues}
                      className="p-1 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded transition cursor-pointer"
                      title="Refresh"
                    >
                      <RotateCcw size={13} />
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>

          {activeTab === 'dashboard' && (
            <div className="space-y-6">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-4">
                <StatsCard label="Available" value={formatDisplayValue(stats.totalAvailable)} unit={areaUnit} icon={<Package size={20} />} color="bg-zinc-900" />
                <StatsCard label="Efficiency" value={`${stats.efficiency}%`} icon={<TrendingDown size={20} />} color="bg-emerald-600" />
                <StatsCard label="Active Stock" value={stats.activeRolls} icon={<Layers size={20} />} color="bg-violet-600" />
                <StatsCard label="Fresh Cut" value={stats.freshRollsCut} icon={<Scissors size={20} />} color="bg-indigo-600" />
                <StatsCard label="Refused" value={stats.refusedRolls} icon={<AlertTriangle size={20} />} color="bg-rose-600" />
                <StatsCard label="Est. Waste" value={formatDisplayValue(stats.totalWastage)} unit={areaUnit} icon={<AlertTriangle size={20} />} color="bg-amber-600" />
              </div>
              <div className="grid grid-cols-1 gap-4 mt-4">
                {rolls.filter(r => r.status !== 'refused').map(roll => (
                  <RollVisualizer
                    key={roll.id}
                    roll={roll}
                    unit={currentUnit}
                  />
                ))}
              </div>
            </div>
          )}

          {activeTab === 'cutting' && (
            <div className="space-y-4">
              {/* Responsive 2-Column Layout */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 items-start animate-in fade-in duration-300">

                {/* Left Column (Span 1): Cut Purpose & Recommendations */}
                <div className="lg:col-span-1 space-y-2.5 flex flex-col">

                  {/* Card 1: Cut Purpose */}
                  <div className="bg-white p-2.5 rounded-xl border border-zinc-200 shadow-sm flex flex-col justify-between space-y-2">
                    <div className="space-y-2">
                      <div className="flex flex-col gap-1">
                        <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Cut Purpose</label>
                        <div className="grid grid-cols-4 gap-0.5 bg-slate-100 p-0.5 rounded-lg border border-slate-200">
                          {(['manual', 'order', 'scrap', 'inventory'] as const).map((purpose) => (
                            <button
                              key={purpose}
                              type="button"
                              onClick={() => {
                                setCutPurpose(purpose);
                                setOrderSearchQuery('');
                                setCuttingSelectedRollId('');
                                setRollSearchQuery('');
                                if (purpose === 'manual') {
                                  setSelectedOrder(prev => ({ ...prev, isInventoryCut: false, customerName: '' }));
                                  setSelectedOrderNumber('');
                                } else if (purpose === 'order') {
                                  setSelectedOrder(prev => ({ ...prev, isInventoryCut: false, customerName: '' }));
                                  setSelectedOrderNumber('');
                                } else if (purpose === 'scrap') {
                                  setSelectedOrder(prev => ({ ...prev, isInventoryCut: true, customerName: 'SCRAP' }));
                                  setSelectedOrderNumber('');
                                } else if (purpose === 'inventory') {
                                  setSelectedOrder(prev => ({ ...prev, isInventoryCut: true, customerName: 'INTERNAL STOCK' }));
                                  setSelectedOrderNumber('');
                                }
                              }}
                              className={`py-1 rounded-md text-[8.5px] font-black uppercase transition-all cursor-pointer ${cutPurpose === purpose
                                ? 'bg-zinc-950 text-white shadow-sm'
                                : 'text-slate-400 hover:text-slate-700 hover:bg-slate-50'
                                }`}
                            >
                              {purpose}
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* Display Order Selection if 'order' purpose active */}
                      {cutPurpose === 'order' && (
                        <div className="space-y-1 relative animate-in fade-in duration-200">
                          <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-1">
                            <Layers size={11} /> Select Active Order
                          </label>

                          {/* Master Search Input */}
                          <div className="relative">
                            <input
                              type="text"
                              value={orderSearchQuery}
                              onChange={(e) => {
                                setOrderSearchQuery(e.target.value);
                                setShowOrderDropdown(true);
                                // If cleared, reset selected order
                                if (!e.target.value) {
                                  setSelectedOrderNumber('');
                                }
                              }}
                              onFocus={() => setShowOrderDropdown(true)}
                              onBlur={() => setTimeout(() => setShowOrderDropdown(false), 200)}
                              placeholder="Type order # or client name..."
                              className="w-full px-2.5 py-1.5 border border-slate-200 rounded-lg focus:border-zinc-950 focus:outline-none font-bold text-xs bg-white"
                            />
                            {selectedOrderNumber && (
                              <div className="absolute right-3 top-1/2 -translate-y-1/2">
                                <span className="text-[8px] font-black text-emerald-700 bg-emerald-100 border border-emerald-200 px-1.5 py-0.5 rounded uppercase">✓ Loaded</span>
                              </div>
                            )}
                          </div>

                          {/* Filtered Dropdown */}
                          {showOrderDropdown && (
                            <div className="absolute left-0 right-0 top-[100%] mt-1 bg-white border border-slate-200 rounded-xl shadow-xl z-50 max-h-48 overflow-y-auto divide-y divide-slate-50 animate-in fade-in duration-100">
                              {orders
                                .filter(o => {
                                  const q = orderSearchQuery.toLowerCase();
                                  if (!q) return true;
                                  return (
                                    o.orderNumber.toString().includes(q) ||
                                    (o.clientName || '').toLowerCase().includes(q)
                                  );
                                })
                                .map((o) => {
                                  const isSelected = selectedOrderNumber === o.orderNumber.toString();
                                  return (
                                    <button
                                      key={o.id}
                                      type="button"
                                      onMouseDown={() => {
                                        // Load order data
                                        const convertToMeters = (val: number, unit?: string) => {
                                          const u = (unit || 'mm').toLowerCase();
                                          if (u === 'mm') return val / 1000;
                                          if (u === 'ft') return val * 0.3048;
                                          if (u === 'in') return val * 0.0254;
                                          if (u === 'mtr' || u === 'm') return val;
                                          return val / 1000;
                                        };
                                        const matchMaterialType = (bType: string) => {
                                          const bt = (bType || '').toLowerCase();
                                          if (bt.includes('pvc') && bt.includes('food')) return 'PVC - White Food Grade';
                                          if (bt.includes('pvc')) return 'PVC - Green Rough Top';
                                          if (bt.includes('rubber') || bt.includes('black')) return 'Rubber - Heavy Duty Black';
                                          if (bt.includes('pu') || bt.includes('heat')) return 'PU - Blue Heat Resistant';
                                          return MATERIAL_TYPES[0];
                                        };
                                        const wMtr = convertToMeters(o.dimensions.width, o.dimensions.widthUnit || o.dimensions.unit);
                                        const lMtr = convertToMeters(o.dimensions.length, o.dimensions.lengthUnit || o.dimensions.unit);

                                        setSelectedOrderNumber(o.orderNumber.toString());
                                        setOrderSearchQuery(`#${o.orderNumber} — ${(o.clientName || '').trim()}`);
                                        setShowOrderDropdown(false);
                                        setSelectedOrder(prev => ({
                                          ...prev,
                                          id: o.id,
                                          customerName: (o.clientName || '').trim(),
                                          requiredWidth: wMtr,
                                          requiredLength: lMtr,
                                          materialType: matchMaterialType(o.beltType)
                                        }));
                                        toast.success(`Order #${o.orderNumber} loaded: ${(o.clientName || '').trim()}`);
                                      }}
                                      className={`w-full text-left px-2.5 py-1.5 hover:bg-slate-50 transition-colors flex items-center justify-between gap-2 ${isSelected ? 'bg-zinc-50' : ''}`}
                                    >
                                      <div className="flex items-center gap-2 min-w-0">
                                        <span className="text-[10px] font-black text-white bg-zinc-900 px-1.5 py-0.5 rounded-md shrink-0">
                                          #{o.orderNumber}
                                        </span>
                                        <span className="font-bold text-xs text-slate-800 truncate">{o.clientName}</span>
                                      </div>
                                      <span className="text-[9px] font-bold text-slate-400 shrink-0">{o.beltType}</span>
                                    </button>
                                  );
                                })}
                              {orders.filter(o => {
                                const q = orderSearchQuery.toLowerCase();
                                if (!q) return true;
                                return o.orderNumber.toString().includes(q) || (o.clientName || '').toLowerCase().includes(q);
                              }).length === 0 && (
                                  <div className="px-4 py-6 text-center text-xs font-bold text-slate-400">
                                    No active orders found
                                  </div>
                                )}
                            </div>
                          )}
                        </div>
                      )}

                      {(cutPurpose !== 'order' || !!selectedOrderNumber) && (
                        <>
                          {/* Display Party Name for client purposes (manual & order) */}
                          {(cutPurpose === 'manual' || cutPurpose === 'order') && (
                            <div className="space-y-1 relative">
                              <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest flex items-center justify-between">
                                <span className="flex items-center gap-1"><User size={11} /> Party Name <span className="text-red-500">*</span></span>
                                {isExactPartyMatch && (
                                  <span className="text-[8px] font-black text-emerald-600 bg-emerald-50 border border-emerald-100 px-1.5 py-0.5 rounded uppercase animate-pulse">
                                    ✓ Registered
                                  </span>
                                )}
                              </label>
                              <input
                                type="text"
                                value={selectedOrder.customerName}
                                disabled={cutPurpose === 'order'} // read-only if order is loaded
                                onChange={(e) => {
                                  setSelectedOrder({ ...selectedOrder, customerName: e.target.value });
                                  setShowPartySuggestions(true);
                                }}
                                onFocus={() => { if (cutPurpose === 'manual') setShowPartySuggestions(true); }}
                                onBlur={() => {
                                  setTimeout(() => setShowPartySuggestions(false), 200);
                                }}
                                placeholder="Enter Customer Name"
                                className="w-full px-2.5 py-1.5 border border-slate-200 rounded-lg focus:border-zinc-900 focus:outline-none font-bold text-xs disabled:bg-slate-50 disabled:text-slate-600 disabled:cursor-not-allowed"
                              />

                              {/* Auto-complete Suggestions Dropdown */}
                              {showPartySuggestions && partySuggestions.length > 0 && (
                                <div className="absolute left-0 right-0 top-[100%] mt-1 bg-white border border-slate-200 rounded-lg shadow-lg z-50 max-h-36 overflow-y-auto divide-y divide-slate-100 animate-in fade-in duration-100">
                                  {partySuggestions.map((name) => (
                                    <button
                                      key={name}
                                      type="button"
                                      onClick={() => {
                                        setSelectedOrder({ ...selectedOrder, customerName: name });
                                        setShowPartySuggestions(false);
                                      }}
                                      className="w-full text-left px-2.5 py-1.5 hover:bg-slate-50 font-bold text-xs text-slate-800 transition-colors flex justify-between items-center"
                                    >
                                      <span>{name}</span>
                                      <span className="text-[8px] font-black text-indigo-600 bg-indigo-50 border border-indigo-100 px-1.5 py-0.5 rounded uppercase">
                                        Existing Party
                                      </span>
                                    </button>
                                  ))}
                                </div>
                              )}
                            </div>
                          )}

                          {/* Display for Scrub/Scrap Purpose */}
                          {cutPurpose === 'scrap' && (
                            <div className="p-2 bg-rose-50 border border-rose-150 rounded-lg flex items-center gap-2 text-rose-800">
                              <Trash2 size={14} className="text-rose-500" />
                              <div>
                                <p className="text-[8px] font-black uppercase tracking-widest text-rose-500">Scrap Remainder</p>
                                <p className="text-[9.5px] font-bold">Cutting to discard / mark as waste</p>
                              </div>
                            </div>
                          )}

                          {/* Display for Inventory Purpose */}
                          {cutPurpose === 'inventory' && (
                            <div className="p-2 bg-slate-900 rounded-lg flex items-center gap-2 text-white">
                              <Warehouse size={14} className="text-blue-400" />
                              <div>
                                <p className="text-[8px] font-black uppercase tracking-widest text-slate-400">Inventory Stocking</p>
                                <p className="text-[9.5px] font-bold">Cutting for common size stock</p>
                              </div>
                            </div>
                          )}

                          {/* Searchable Target Roll Selection for Scrap & Inventory */}
                          {(cutPurpose === 'scrap' || cutPurpose === 'inventory') && (
                            <div className="space-y-1 relative animate-in fade-in duration-200">
                              <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-1">
                                <Layers size={11} /> Select Target Roll
                              </label>

                              {/* Master Search Input */}
                              <div className="relative">
                                <input
                                  type="text"
                                  value={rollSearchQuery}
                                  onChange={(e) => {
                                    setRollSearchQuery(e.target.value);
                                    setShowRollDropdown(true);
                                    if (!e.target.value) {
                                      setCuttingSelectedRollId('');
                                    }
                                  }}
                                  onFocus={() => setShowRollDropdown(true)}
                                  onBlur={() => setTimeout(() => setShowRollDropdown(false), 200)}
                                  placeholder="Type roll ID or size..."
                                  className="w-full px-2.5 py-1.5 border border-slate-200 rounded-lg focus:border-zinc-950 focus:outline-none font-bold text-xs bg-white"
                                />
                                {cuttingSelectedRollId && (
                                  <div className="absolute right-3 top-1/2 -translate-y-1/2">
                                    <span className="text-[8px] font-black text-emerald-700 bg-emerald-100 border border-emerald-200 px-1.5 py-0.5 rounded uppercase">✓ Selected</span>
                                  </div>
                                )}
                              </div>

                              {/* Filtered Dropdown */}
                              {showRollDropdown && (
                                <div className="absolute left-0 right-0 top-[100%] mt-1 bg-white border border-slate-200 rounded-xl shadow-xl z-50 max-h-48 overflow-y-auto divide-y divide-slate-50 animate-in fade-in duration-100">
                                  {rolls
                                    .filter(r => {
                                      // Only show rolls matching current material type and not refused
                                      if (r.status === 'refused' || r.materialType !== selectedOrder.materialType) return false;
                                      
                                      const q = rollSearchQuery.toLowerCase();
                                      if (!q) return true;
                                      const rollSize = `${fromMeters(r.fullLength).toFixed(2)}${currentUnit} x ${fromMeters(r.fullWidth).toFixed(2)}${currentUnit}`.toLowerCase();
                                      return (
                                        r.id.toLowerCase().includes(q) ||
                                        rollSize.includes(q)
                                      );
                                    })
                                    .map((r) => {
                                      const isSelected = cuttingSelectedRollId === r.id;
                                      return (
                                        <button
                                          key={r.id}
                                          type="button"
                                          onMouseDown={() => {
                                            setCuttingSelectedRollId(r.id);
                                            setRollSearchQuery(`${r.id} (${fromMeters(r.fullLength).toFixed(1)}${currentUnit} × ${fromMeters(r.fullWidth).toFixed(1)}${currentUnit})`);
                                            setShowRollDropdown(false);
                                            toast.success(`Target roll selected: ${r.id}`);
                                          }}
                                          className={`w-full text-left px-2.5 py-1.5 hover:bg-slate-50 transition-colors flex items-center justify-between gap-2 ${isSelected ? 'bg-zinc-50' : ''}`}
                                        >
                                          <div className="flex items-center gap-2 min-w-0">
                                            <span className="text-[10px] font-black text-white bg-zinc-900 px-1.5 py-0.5 rounded-md shrink-0">
                                              {r.id}
                                            </span>
                                            <span className="font-bold text-xs text-slate-800 truncate">
                                              {fromMeters(r.fullLength).toFixed(2)}{currentUnit} × {fromMeters(r.fullWidth).toFixed(2)}{currentUnit}
                                            </span>
                                          </div>
                                          <span className="text-[9px] font-bold text-slate-400 shrink-0">
                                            Rem: {fromMeters(r.remainingSqm).toFixed(1)}{currentUnit}²
                                          </span>
                                        </button>
                                      );
                                    })}
                                  {rolls.filter(r => {
                                    if (r.status === 'refused' || r.materialType !== selectedOrder.materialType) return false;
                                    const q = rollSearchQuery.toLowerCase();
                                    if (!q) return true;
                                    const rollSize = `${fromMeters(r.fullLength).toFixed(2)}${currentUnit} x ${fromMeters(r.fullWidth).toFixed(2)}${currentUnit}`.toLowerCase();
                                    return r.id.toLowerCase().includes(q) || rollSize.includes(q);
                                  }).length === 0 && (
                                      <div className="px-4 py-6 text-center text-xs font-bold text-slate-400">
                                        No active rolls found for this material
                                      </div>
                                    )}
                                </div>
                              )}
                            </div>
                          )}

                          <div className="grid grid-cols-2 gap-1.5">
                            <div className="space-y-1">
                              <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-1">
                                Width ({currentUnit})
                                {cutPurpose === 'order' && selectedOrderNumber && (
                                  <span className="text-[7.5px] font-black text-orange-600 bg-orange-50 border border-orange-200 px-1 py-0.2 rounded uppercase flex items-center gap-0.5">🔒 Locked</span>
                                )}
                              </label>
                              <input
                                type="number"
                                step="0.01"
                                value={selectedOrder.requiredWidth === 0 ? '' : fromMeters(selectedOrder.requiredWidth)}
                                onChange={(e) => {
                                  if (cutPurpose === 'order' && selectedOrderNumber) return;
                                  const val = parseFloat(e.target.value);
                                  setSelectedOrder({ ...selectedOrder, requiredWidth: isNaN(val) ? 0 : toMeters(val) });
                                }}
                                readOnly={cutPurpose === 'order' && !!selectedOrderNumber}
                                className={`w-full px-2.5 py-1 border rounded-lg focus:outline-none font-bold text-xs ${cutPurpose === 'order' && selectedOrderNumber
                                  ? 'border-slate-100 bg-slate-50 text-slate-400 cursor-not-allowed'
                                  : 'border-slate-200 focus:border-zinc-950 bg-white'
                                  }`}
                              />
                            </div>
                            <div className="space-y-1">
                              <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-1">
                                Length ({currentUnit})
                                {cutPurpose === 'order' && selectedOrderNumber && (
                                  <span className="text-[7.5px] font-black text-orange-600 bg-orange-50 border border-orange-200 px-1 py-0.2 rounded uppercase flex items-center gap-0.5">🔒 Locked</span>
                                )}
                              </label>
                              <input
                                type="number"
                                step="0.01"
                                value={selectedOrder.requiredLength === 0 ? '' : fromMeters(selectedOrder.requiredLength)}
                                onChange={(e) => {
                                  if (cutPurpose === 'order' && selectedOrderNumber) return;
                                  const val = parseFloat(e.target.value);
                                  setSelectedOrder({ ...selectedOrder, requiredLength: isNaN(val) ? 0 : toMeters(val) });
                                }}
                                readOnly={cutPurpose === 'order' && !!selectedOrderNumber}
                                className={`w-full px-2.5 py-1 border rounded-lg focus:outline-none font-bold text-xs ${cutPurpose === 'order' && selectedOrderNumber
                                  ? 'border-slate-100 bg-slate-50 text-slate-400 cursor-not-allowed'
                                  : 'border-slate-200 focus:border-zinc-950 bg-white'
                                  }`}
                              />
                            </div>
                          </div>

                          <div className="space-y-1">
                            <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Belt Material Type</label>
                            <select
                              value={selectedOrder.materialType}
                              onChange={(e) => setSelectedOrder({ ...selectedOrder, materialType: e.target.value })}
                              className="w-full px-2.5 py-1 border border-slate-200 rounded-lg focus:border-zinc-950 focus:outline-none font-bold text-xs bg-white cursor-pointer"
                            >
                              {MATERIAL_TYPES.map(type => <option key={type} value={type}>{type}</option>)}
                            </select>
                          </div>
                        </>
                      )}
                    </div>

                    {(cutPurpose !== 'order' || !!selectedOrderNumber) && (
                      <div className="space-y-1 mt-2.5">
                        <button
                          onClick={handleCalculateBestFit}
                          className="w-full py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white font-black text-[9px] uppercase tracking-wider rounded-lg transition shadow-md active:scale-95 cursor-pointer flex items-center justify-center gap-1 animate-pulse"
                        >
                          <Wand2 size={11} /> FIND THE BEST FIT
                        </button>

                        <div className="flex gap-1.5">
                          <button
                            onClick={() => setCuttingMode('auto')}
                            className={`flex-1 py-1 rounded-lg text-[9px] font-black transition-all cursor-pointer ${cuttingMode === 'auto' ? 'bg-zinc-950 text-white shadow-sm' : 'bg-slate-100 text-slate-400 hover:bg-slate-200'
                              }`}
                          >
                            AUTO FIT
                          </button>
                          <button
                            onClick={() => setCuttingMode('manual')}
                            className={`flex-1 py-1 rounded-lg text-[9px] font-black transition-all cursor-pointer ${cuttingMode === 'manual' ? 'bg-zinc-950 text-white shadow-sm' : 'bg-slate-100 text-slate-400 hover:bg-slate-200'
                              }`}
                          >
                            MANUAL FIT
                          </button>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Card 2: Cutting Recommendations */}
                  {(cutPurpose !== 'order' || !!selectedOrderNumber) && (
                    <div className="bg-white p-2.5 rounded-xl border border-zinc-200 shadow-sm flex flex-col justify-between space-y-1.5">
                      <div className="space-y-2 flex-1 flex flex-col justify-between">
                        <div className="flex items-center justify-between">
                          <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-1">
                            Cutting Recommendations (Top 3)
                          </label>

                          {/* Compact Arrow pagination inside Recommendations Card Header */}
                          {cuttingMode === 'auto' && optimizationResults.length > 0 && (
                            <div className="flex items-center gap-1 bg-zinc-900 border border-zinc-800 px-1.5 py-0.5 rounded-md shrink-0">
                              <button
                                disabled={currentOptionIndex === 0}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  if (currentOptionIndex > 0) handleSelectRecommendation(currentOptionIndex - 1);
                                }}
                                className="p-0.5 hover:bg-zinc-800 rounded text-slate-300 disabled:opacity-30 cursor-pointer flex items-center justify-center"
                                title="Previous Option"
                              >
                                <ChevronLeft size={10} />
                              </button>
                              <span className="font-mono font-black text-white text-[8px]">
                                {currentOptionIndex + 1}/{Math.min(3, optimizationResults.length)}
                              </span>
                              <button
                                disabled={currentOptionIndex === Math.min(3, optimizationResults.length) - 1}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  if (currentOptionIndex < Math.min(3, optimizationResults.length) - 1) handleSelectRecommendation(currentOptionIndex + 1);
                                }}
                                className="p-0.5 hover:bg-zinc-800 rounded text-slate-300 disabled:opacity-30 cursor-pointer flex items-center justify-center"
                                title="Next Option"
                              >
                                <ChevronRight size={10} />
                              </button>
                            </div>
                          )}
                        </div>

                        <div className="space-y-1 max-h-[220px] overflow-y-auto pr-1 flex-1">
                          {cuttingMode === 'auto' && optimizationResults.length > 0 ? (
                            optimizationResults.slice(0, 3).map((candidate, idx) => {
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
                                  className={`p-1.5 rounded-lg border cursor-pointer transition-all text-left ${isSelected
                                    ? 'bg-zinc-950 border-zinc-950 text-white shadow-sm'
                                    : 'bg-slate-50 hover:bg-slate-100 border-slate-100 text-slate-800'
                                    }`}
                                >
                                  <div className="flex justify-between items-center">
                                    <span className="font-black text-[11px] uppercase tracking-tight flex items-center gap-1 flex-wrap">
                                      <span>{candidate.rollId}</span>
                                      {matchRoll && (
                                        <span className={`text-[8px] font-black uppercase tracking-wider px-1 py-0.2 rounded ${isSelected ? 'bg-slate-800 text-slate-300' : 'bg-slate-200 text-slate-600'}`}>
                                          {fromMeters(matchRoll.fullLength).toFixed(1)}{currentUnit}x{fromMeters(matchRoll.fullWidth).toFixed(1)}{currentUnit}
                                        </span>
                                      )}
                                      <span className={`text-[7.5px] font-black tracking-widest px-1 py-0.2 rounded-md leading-none ${badgeStyle}`}>
                                        {badgeText}
                                      </span>
                                    </span>
                                    <span className="text-[8px] font-bold text-slate-400">
                                      Pos: {candidate.placement.x.toFixed(1)}m
                                    </span>
                                  </div>

                                  <p className={`text-[8.5px] font-bold mt-0.5 leading-tight ${isSelected ? 'text-slate-300' : 'text-slate-500'}`}>
                                    {candidate.reason}
                                  </p>

                                  <div className="mt-0.5 flex items-center justify-between border-t border-slate-200/10 pt-0.5 text-[7.5px] font-black uppercase tracking-wider">
                                    <span className={isSelected ? 'text-emerald-400' : (hasScrapRisk ? 'text-rose-500' : 'text-slate-500')}>
                                      {rating}
                                    </span>
                                  </div>
                                </div>
                              );
                            })
                          ) : cuttingMode === 'manual' ? (
                            <div className="p-2 bg-blue-50 border border-blue-150 rounded-lg flex-1 flex flex-col justify-center space-y-1">
                              <p className="font-black uppercase tracking-wider text-[9px] text-blue-700 flex items-center gap-1">
                                <Info size={11} /> Manual Mode Active
                              </p>
                              <p className="text-[9.5px] font-semibold text-slate-500 leading-relaxed text-left">
                                Right side visualizer rolls me click karein cut place karne ke liye. Click karte hi popup open ho jaega.
                              </p>
                            </div>
                          ) : selectedOrder.requiredWidth > 0 && selectedOrder.requiredLength > 0 && optimizationResults.length === 0 ? (
                            <div className="p-2 bg-rose-50 border border-rose-150 text-rose-800 rounded-lg flex-1 flex flex-col justify-center">
                              <p className="font-black uppercase tracking-wider text-[9px] text-rose-700 flex items-center gap-1">
                                <AlertTriangle size={11} /> No Remnants Found
                              </p>
                              <p className="text-[9.5px] font-semibold text-slate-500 mt-1 leading-relaxed text-left">
                                No active master rolls or remnants match this grade and size.
                              </p>
                            </div>
                          ) : (
                            <div className="bg-white p-2 rounded-lg border border-zinc-150 shadow-sm flex-1 flex flex-col justify-center items-center text-center text-slate-400 text-[10px] font-semibold">
                              <Info size={16} className="mb-1 text-slate-300" />
                              Enter width and length to find placement
                            </div>
                          )}
                        </div>

                        {/* Execute Cut Button Integrated inside the Recommendations card */}
                        {currentResult && (
                          <div className="pt-2 border-t border-slate-100 space-y-1">
                            <div className="bg-slate-900 rounded-lg p-2 text-[10px] text-white space-y-0.5 text-left">
                              <div className="flex justify-between border-b border-slate-800 pb-0.5">
                                <span className="text-slate-500 font-bold uppercase text-[8px]">Selected Roll</span>
                                <span className="font-bold text-blue-400 font-mono">#{currentResult.rollId}</span>
                              </div>
                              <div className="flex justify-between">
                                <span className="text-slate-500 font-bold uppercase text-[8px]">Placement Strategy</span>
                                <span className="font-bold text-emerald-400 text-[10px]">{(currentResult as any).reason || 'Manual Coordinate Selection'}</span>
                              </div>
                            </div>
                            <button
                              onClick={handleExecuteCut}
                              className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-black py-1.5 rounded-lg transition shadow-md active:scale-95 text-[10.5px] uppercase tracking-wider cursor-pointer flex items-center justify-center gap-1.5"
                            >
                              <Scissors size={14} /> EXECUTE SELECTED CUT
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>

                {/* Right Column (Span 2): Remnant Matching Visualization Accordion */}
                <div className="lg:col-span-2 space-y-4">
                  <div className="bg-white p-3 rounded-xl border border-zinc-200 shadow-sm animate-in fade-in duration-300">
                    <h3 className="text-xs font-black mb-2 text-slate-800 flex items-center gap-1.5 italic uppercase">
                      <Layers className="text-zinc-800" size={16} /> Remnant Matching Visualization
                    </h3>

                    <div className="space-y-4">
                      {visibleRolls.map(roll => {
                        const isExpanded = expandedRollId === roll.id;
                        return (
                          <RollVisualizer
                            key={roll.id}
                            roll={roll}
                            unit={currentUnit}
                            isExpanded={isExpanded}
                            onToggleExpand={() => {
                              setExpandedRollId(isExpanded ? null : roll.id);
                            }}
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
                          />
                        );
                      })}

                      {visibleRolls.length === 0 && (
                        <div className="py-20 flex flex-col items-center justify-center border-2 border-dashed border-zinc-200 rounded-3xl text-zinc-400 text-sm font-medium">
                          No active rolls or remnants match selected material: {selectedOrder.materialType}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'stock' && (
            <div className="space-y-5">

              {/* ── TOP: Four summary selector tiles ── */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">

                {/* Tile 1 – Material Stocks */}
                <button
                  type="button"
                  onClick={() => setActiveInventoryCard(activeInventoryCard === 'materials' ? null : 'materials')}
                  className={`group w-full text-left p-4 rounded-2xl border-2 transition-all duration-200 cursor-pointer flex items-center gap-4 shadow-sm hover:shadow-md ${activeInventoryCard === 'materials'
                      ? 'bg-zinc-950 border-zinc-950 text-white shadow-lg'
                      : 'bg-white border-zinc-200 text-slate-800 hover:border-zinc-400'
                    }`}
                >
                  <div className={`p-2.5 rounded-xl shrink-0 ${activeInventoryCard === 'materials' ? 'bg-white/10' : 'bg-zinc-100'
                    }`}>
                    <Package size={20} className={activeInventoryCard === 'materials' ? 'text-white' : 'text-zinc-700'} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className={`text-[9px] font-black uppercase tracking-widest ${activeInventoryCard === 'materials' ? 'text-zinc-400' : 'text-slate-400'
                      }`}>Material Stocks</p>
                    <p className={`text-xl font-black leading-none mt-0.5 ${activeInventoryCard === 'materials' ? 'text-white' : 'text-zinc-950'
                      }`}>{materialStocks.length}</p>
                    <p className={`text-[9px] font-bold mt-1 ${activeInventoryCard === 'materials' ? 'text-zinc-400' : 'text-slate-400'
                      }`}>items tracked</p>
                  </div>
                  <ChevronRight size={16} className={`shrink-0 transition-transform duration-200 ${activeInventoryCard === 'materials' ? 'text-white rotate-90' : 'text-slate-300 group-hover:text-slate-500'
                    }`} />
                </button>

                {/* Tile 2 – Cutting Belt */}
                <button
                  type="button"
                  onClick={() => setActiveInventoryCard(activeInventoryCard === 'remnants' ? null : 'remnants')}
                  className={`group w-full text-left p-4 rounded-2xl border-2 transition-all duration-200 cursor-pointer flex items-center gap-4 shadow-sm hover:shadow-md ${activeInventoryCard === 'remnants'
                      ? 'bg-emerald-600 border-emerald-600 text-white shadow-lg'
                      : 'bg-white border-zinc-200 text-slate-800 hover:border-emerald-400'
                    }`}
                >
                  <div className={`p-2.5 rounded-xl shrink-0 ${activeInventoryCard === 'remnants' ? 'bg-white/15' : 'bg-emerald-50'
                    }`}>
                    <Scissors size={20} className={activeInventoryCard === 'remnants' ? 'text-white' : 'text-emerald-600'} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className={`text-[9px] font-black uppercase tracking-widest ${activeInventoryCard === 'remnants' ? 'text-emerald-100' : 'text-slate-400'
                      }`}>Cutting Belt</p>
                    <p className={`text-xl font-black leading-none mt-0.5 ${activeInventoryCard === 'remnants' ? 'text-white' : 'text-zinc-950'
                      }`}>{rolls.filter(r => r.status !== 'refused' && isRollReuse(r)).length}</p>
                    <p className={`text-[9px] font-bold mt-1 ${activeInventoryCard === 'remnants' ? 'text-emerald-100' : 'text-slate-400'
                      }`}>remnants in stock</p>
                  </div>
                  <ChevronRight size={16} className={`shrink-0 transition-transform duration-200 ${activeInventoryCard === 'remnants' ? 'text-white rotate-90' : 'text-slate-300 group-hover:text-emerald-400'
                    }`} />
                </button>

                {/* Tile 3 – Fresh Rolls */}
                <button
                  type="button"
                  onClick={() => setActiveInventoryCard(activeInventoryCard === 'fresh' ? null : 'fresh')}
                  className={`group w-full text-left p-4 rounded-2xl border-2 transition-all duration-200 cursor-pointer flex items-center gap-4 shadow-sm hover:shadow-md ${activeInventoryCard === 'fresh'
                      ? 'bg-indigo-600 border-indigo-600 text-white shadow-lg'
                      : 'bg-white border-zinc-200 text-slate-800 hover:border-indigo-400'
                    }`}
                >
                  <div className={`p-2.5 rounded-xl shrink-0 ${activeInventoryCard === 'fresh' ? 'bg-white/15' : 'bg-indigo-50'
                    }`}>
                    <Warehouse size={20} className={activeInventoryCard === 'fresh' ? 'text-white' : 'text-indigo-600'} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className={`text-[9px] font-black uppercase tracking-widest ${activeInventoryCard === 'fresh' ? 'text-indigo-100' : 'text-slate-400'
                      }`}>Fresh Rolls</p>
                    <p className={`text-xl font-black leading-none mt-0.5 ${activeInventoryCard === 'fresh' ? 'text-white' : 'text-zinc-950'
                      }`}>{rolls.filter(r => r.status !== 'refused' && !isRollReuse(r)).length}</p>
                    <p className={`text-[9px] font-bold mt-1 ${activeInventoryCard === 'fresh' ? 'text-indigo-100' : 'text-slate-400'
                      }`}>master rolls</p>
                  </div>
                  <ChevronRight size={16} className={`shrink-0 transition-transform duration-200 ${activeInventoryCard === 'fresh' ? 'text-white rotate-90' : 'text-slate-300 group-hover:text-indigo-400'
                    }`} />
                </button>

                {/* Tile 4 - Reorder Level */}
                {(() => {
                  const alertCount = materialStocks.filter(s => s.reorderLevel > 0 && s.quantity <= s.reorderLevel).length;
                  return (
                    <button
                      type="button"
                      onClick={() => setActiveInventoryCard(activeInventoryCard === 'reorder' ? null : 'reorder')}
                      className={`group w-full text-left p-4 rounded-2xl border-2 transition-all duration-200 cursor-pointer flex items-center gap-4 shadow-sm hover:shadow-md ${activeInventoryCard === 'reorder'
                          ? 'bg-amber-500 border-amber-500 text-white shadow-lg'
                          : alertCount > 0
                            ? 'bg-amber-50 border-amber-300 text-slate-800 hover:border-amber-500'
                            : 'bg-white border-zinc-200 text-slate-800 hover:border-amber-400'
                        }`}
                    >
                      <div className={`p-2.5 rounded-xl shrink-0 ${activeInventoryCard === 'reorder' ? 'bg-white/15' : alertCount > 0 ? 'bg-amber-100' : 'bg-amber-50'
                        }`}>
                        <AlertTriangle size={20} className={activeInventoryCard === 'reorder' ? 'text-white' : 'text-amber-500'} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className={`text-[9px] font-black uppercase tracking-widest ${activeInventoryCard === 'reorder' ? 'text-amber-100' : 'text-slate-400'
                          }`}>Reorder Level</p>
                        <p className={`text-xl font-black leading-none mt-0.5 ${activeInventoryCard === 'reorder' ? 'text-white' : alertCount > 0 ? 'text-amber-600' : 'text-zinc-950'
                          }`}>{alertCount}</p>
                        <p className={`text-[9px] font-bold mt-1 ${activeInventoryCard === 'reorder' ? 'text-amber-100' : alertCount > 0 ? 'text-amber-500 font-black' : 'text-slate-400'
                          }`}>{alertCount > 0 ? '⚠️ items need refill' : 'all levels OK'}</p>
                      </div>
                      <ChevronRight size={16} className={`shrink-0 transition-transform duration-200 ${activeInventoryCard === 'reorder' ? 'text-white rotate-90' : alertCount > 0 ? 'text-amber-400 group-hover:text-amber-600' : 'text-slate-300 group-hover:text-amber-400'
                        }`} />
                    </button>
                  );
                })()}

              </div>

              {/* ── BOTTOM: Expanded content panel (renders ONLY the active card in full width) ── */}
              <div className="w-full">

                {/* CARD 1: Material Stocks */}
                {activeInventoryCard === 'materials' && (
                  <div className="bg-white rounded-2xl border border-zinc-200 shadow-sm p-5 animate-in fade-in duration-300 flex flex-col w-full">
                    <div className="flex justify-between items-center mb-4">
                      <h3 className="text-sm font-black text-slate-800 uppercase tracking-wider flex items-center gap-2">
                        <div className="p-1.5 rounded-lg bg-zinc-100 shrink-0">
                          <Package size={16} className="text-zinc-700" />
                        </div>
                        Material Stocks
                        <span className="text-[10px] font-black text-zinc-500 bg-zinc-100 border border-zinc-200 px-2.5 py-0.5 rounded-full ml-1.5">
                          {filteredMaterialStocksList.length} items
                        </span>
                      </h3>
                      <button
                        onClick={() => setShowAddMaterialForm(!showAddMaterialForm)}
                        className="px-3 py-1.5 bg-zinc-950 text-white rounded-lg font-black text-[10px] hover:bg-zinc-800 transition flex items-center gap-1.5 cursor-pointer"
                      >
                        <Plus size={12} /> {showAddMaterialForm ? 'CANCEL' : 'ADD NEW'}
                      </button>
                    </div>

                    {showAddMaterialForm && (
                      <div className="mb-4 p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-3 animate-in fade-in slide-in-from-top-2">
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                          <div className="space-y-1">
                            <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest">Material Name</label>
                            <div className="flex flex-col gap-1.5">
                              <select
                                value={bomComponentNames.includes(newMaterialStock.name) ? newMaterialStock.name : 'custom'}
                                onChange={(e) => {
                                  const val = e.target.value;
                                  if (val === 'custom') {
                                    setNewMaterialStock({ ...newMaterialStock, name: '' });
                                  } else {
                                    let defaultUnit = 'pcs';
                                    if (config && Array.isArray(config.beltTypes)) {
                                      config.beltTypes.forEach((cat: any) => {
                                        if (Array.isArray(cat.styles)) {
                                          cat.styles.forEach((style: any) => {
                                            if (Array.isArray(style.bom)) {
                                              style.bom.forEach((item: any) => {
                                                if (item.name === val) {
                                                  defaultUnit = item.unit || 'pcs';
                                                }
                                                if (Array.isArray(item.options)) {
                                                  item.options.forEach((opt: any) => {
                                                    if (`${item.name} (${opt.name})` === val) {
                                                      defaultUnit = opt.unit || item.unit || 'pcs';
                                                    }
                                                  });
                                                }
                                              });
                                            }
                                          });
                                        }
                                      });
                                    }
                                    setNewMaterialStock({ ...newMaterialStock, name: val, unit: defaultUnit });
                                  }
                                }}
                                className="w-full px-3 py-2 border border-zinc-200 rounded-lg text-xs font-bold bg-white focus:outline-none focus:ring-2 focus:ring-zinc-950"
                              >
                                <option value="custom">-- Type Custom Name --</option>
                                {bomComponentNames.map(name => (
                                  <option key={name} value={name}>{name}</option>
                                ))}
                              </select>
                              {(!bomComponentNames.includes(newMaterialStock.name) || newMaterialStock.name === '') && (
                                <input
                                  type="text"
                                  placeholder="Custom name..."
                                  value={newMaterialStock.name}
                                  onChange={(e) => setNewMaterialStock({ ...newMaterialStock, name: e.target.value })}
                                  className="w-full px-3 py-2 border border-zinc-200 rounded-lg text-xs font-bold bg-white focus:outline-none focus:ring-2 focus:ring-zinc-950"
                                />
                              )}
                            </div>
                          </div>
                          <div className="space-y-1">
                            <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest">Quantity</label>
                            <input
                              type="number"
                              placeholder="0"
                              value={newMaterialStock.quantity}
                              onChange={(e) => setNewMaterialStock({ ...newMaterialStock, quantity: e.target.value })}
                              className="w-full px-3 py-2 border border-zinc-200 rounded-lg text-xs font-bold bg-white focus:outline-none focus:ring-2 focus:ring-zinc-950"
                            />
                          </div>
                          <div className="space-y-1">
                            <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest">Unit</label>
                            <input
                              type="text"
                              placeholder="pcs, bottles, m"
                              value={newMaterialStock.unit}
                              onChange={(e) => setNewMaterialStock({ ...newMaterialStock, unit: e.target.value })}
                              className="w-full px-3 py-2 border border-zinc-200 rounded-lg text-xs font-bold bg-white focus:outline-none focus:ring-2 focus:ring-zinc-950"
                            />
                          </div>
                        </div>
                        <button
                          onClick={handleAddMaterialStock}
                          className="w-full py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg font-black text-xs uppercase tracking-wider transition cursor-pointer"
                        >
                          SAVE MATERIAL
                        </button>
                      </div>
                    )}

                    {/* Searcher */}
                    <div className="relative mb-4">
                      <Search className="absolute left-3.5 top-3 h-4 w-4 text-zinc-400" />
                      <input
                        type="text"
                        placeholder="Search Material Stocks..."
                        value={materialSearchQuery}
                        onChange={(e) => setMaterialSearchQuery(e.target.value)}
                        className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-zinc-200 rounded-xl text-xs font-bold text-zinc-950 focus:outline-none focus:ring-2 focus:ring-zinc-950 placeholder-zinc-400 shadow-sm text-left"
                      />
                    </div>

                    {/* Table */}
                    <div className="overflow-x-auto border border-zinc-200 rounded-2xl shadow-sm">
                      <table className="w-full text-left text-xs border-collapse">
                        <thead className="bg-slate-50 border-b border-zinc-200">
                          <tr>
                            <th className="px-4 py-3 text-[9px] font-black text-slate-400 uppercase tracking-widest">Material Name</th>
                            <th className="px-4 py-3 text-[9px] font-black text-slate-400 uppercase tracking-widest">Available Stock</th>
                            <th className="px-4 py-3 text-[9px] font-black text-slate-400 uppercase tracking-widest w-32">Refill</th>
                            <th className="px-4 py-3 text-[9px] font-black text-slate-400 uppercase tracking-widest text-right w-32">Actions</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-zinc-150">
                          {filteredMaterialStocksList.map((item) => {
                            const isEditing = editingMaterialStock?.id === item.id;
                            return (
                              <tr key={item.id} className="hover:bg-slate-50/50 transition-colors">
                                {isEditing ? (
                                  <>
                                    <td className="px-4 py-3">
                                      <input
                                        type="text"
                                        value={editingMaterialStock.name}
                                        onChange={(e) => setEditingMaterialStock({ ...editingMaterialStock, name: e.target.value })}
                                        className="w-full px-3 py-2 border border-zinc-300 rounded-lg text-xs font-bold bg-white"
                                      />
                                    </td>
                                    <td className="px-4 py-3" colSpan={2}>
                                      <div className="flex gap-2">
                                        <input
                                          type="number"
                                          value={editingMaterialStock.quantity}
                                          onChange={(e) => setEditingMaterialStock({ ...editingMaterialStock, quantity: parseFloat(e.target.value) || 0 })}
                                          className="w-24 px-3 py-2 border border-zinc-300 rounded-lg text-xs font-bold text-center bg-white"
                                        />
                                        <input
                                          type="text"
                                          value={editingMaterialStock.unit}
                                          onChange={(e) => setEditingMaterialStock({ ...editingMaterialStock, unit: e.target.value })}
                                          className="w-24 px-3 py-2 border border-zinc-300 rounded-lg text-xs font-bold text-center bg-white"
                                        />
                                      </div>
                                    </td>
                                    <td className="px-4 py-3 text-right">
                                      <div className="flex gap-1.5 justify-end">
                                        <button
                                          onClick={handleUpdateMaterialStock}
                                          className="px-2.5 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-[10px] font-black uppercase flex items-center justify-center gap-1 cursor-pointer"
                                          title="Save"
                                        >
                                          <Check size={13} /> Save
                                        </button>
                                        <button
                                          onClick={() => setEditingMaterialStock(null)}
                                          className="px-2.5 py-1.5 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-lg text-[10px] font-black uppercase cursor-pointer"
                                          title="Cancel"
                                        >
                                          Cancel
                                        </button>
                                      </div>
                                    </td>
                                  </>
                                ) : (
                                  <>
                                    <td className="px-4 py-3 font-black text-sm text-slate-800">{item.name}</td>
                                    <td className="px-4 py-3">
                                      <span className="text-[11px] font-black text-indigo-700 bg-indigo-50 border border-indigo-100 px-2.5 py-1 rounded-lg">
                                        {item.quantity} {item.unit}
                                      </span>
                                    </td>
                                    <td className="px-4 py-3">
                                      <div className="flex items-center gap-1.5">
                                        <input
                                          type="number"
                                          placeholder="+ Qty"
                                          id={`refill-qty-${item.id}`}
                                          className="w-16 px-2.5 py-1.5 border border-zinc-200 rounded-lg text-xs font-bold bg-white text-center focus:outline-none focus:ring-2 focus:ring-zinc-950"
                                          onKeyDown={async (e) => {
                                            if (e.key === 'Enter') {
                                              const inputEl = document.getElementById(`refill-qty-${item.id}`) as HTMLInputElement;
                                              const val = parseFloat(inputEl?.value || '');
                                              if (val > 0) {
                                                try {
                                                  const res = await fetch(`/api/material-stocks/${item.id}/refill`, {
                                                    method: 'PATCH',
                                                    headers: { 'Content-Type': 'application/json' },
                                                    body: JSON.stringify({ addQuantity: val })
                                                  });
                                                  if (res.ok) {
                                                    toast.success(`Refilled ${val} ${item.unit} to ${item.name}!`);
                                                    inputEl.value = '';
                                                    loadMaterialStocksData();
                                                  } else {
                                                    toast.error("Failed to refill stock");
                                                  }
                                                } catch (err) {
                                                  toast.error("Failed to refill stock");
                                                }
                                              }
                                            }
                                          }}
                                        />
                                        <button
                                          onClick={async () => {
                                            const inputEl = document.getElementById(`refill-qty-${item.id}`) as HTMLInputElement;
                                            const val = parseFloat(inputEl?.value || '');
                                            if (val > 0) {
                                              try {
                                                const res = await fetch(`/api/material-stocks/${item.id}/refill`, {
                                                  method: 'PATCH',
                                                  headers: { 'Content-Type': 'application/json' },
                                                  body: JSON.stringify({ addQuantity: val })
                                                });
                                                if (res.ok) {
                                                  toast.success(`Refilled ${val} ${item.unit} to ${item.name}!`);
                                                  inputEl.value = '';
                                                  loadMaterialStocksData();
                                                } else {
                                                  toast.error("Failed to refill stock");
                                                }
                                              } catch (err) {
                                                toast.error("Failed to refill stock");
                                              }
                                            } else {
                                              toast.error("Enter a valid quantity to refill");
                                            }
                                          }}
                                          className="px-2.5 py-1.5 bg-slate-200 hover:bg-slate-300 text-slate-800 rounded-lg text-[10px] font-bold uppercase transition"
                                        >
                                          Refill
                                        </button>
                                      </div>
                                    </td>
                                    <td className="px-4 py-3 text-right">
                                      <div className="flex gap-2 justify-end items-center">
                                        <button
                                          onClick={() => handleOpenIssueModal(item)}
                                          className="px-3 py-1.5 text-emerald-700 bg-emerald-50 border border-emerald-100 hover:bg-emerald-100 rounded-lg transition-all font-black uppercase text-[10px] flex items-center gap-1 cursor-pointer"
                                          title="Issue to Production"
                                        >
                                          <Send size={11} /> Issue
                                        </button>
                                        <button
                                          onClick={() => setEditingMaterialStock(item)}
                                          className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition cursor-pointer"
                                          title="Edit"
                                        >
                                          <Edit2 size={14} />
                                        </button>
                                        <button
                                          onClick={() => handleDeleteMaterialStock(item.id, item.name)}
                                          className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition cursor-pointer"
                                          title="Delete"
                                        >
                                          <Trash2 size={14} />
                                        </button>
                                      </div>
                                    </td>
                                  </>
                                )}
                              </tr>
                            );
                          })}

                          {filteredMaterialStocksList.length === 0 && (
                            <tr>
                              <td colSpan={4} className="py-16 text-center text-zinc-400 font-semibold text-xs italic">
                                No materials found.
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {/* CARD 2: Cutting Belt (Remnants) */}
                {activeInventoryCard === 'remnants' && (
                  <div className="bg-white rounded-2xl border border-zinc-200 shadow-sm p-5 animate-in fade-in duration-300 flex flex-col w-full">
                    <div className="flex justify-between items-center mb-4">
                      <h3 className="text-sm font-black text-slate-800 uppercase tracking-wider flex items-center gap-2">
                        <div className="p-1.5 rounded-lg bg-emerald-50 shrink-0">
                          <Scissors size={16} className="text-emerald-600" />
                        </div>
                        Cutting Belt (Remnants)
                        <span className="text-[10px] font-black text-emerald-700 bg-emerald-50 border border-emerald-100 px-2.5 py-0.5 rounded-full ml-1.5">
                          {filteredRemnantRollsList.length} remnants
                        </span>
                      </h3>
                    </div>

                    {/* Searcher */}
                    <div className="relative mb-4">
                      <Search className="absolute left-3.5 top-3 h-4 w-4 text-zinc-400" />
                      <input
                        type="text"
                        placeholder="Search Remnants..."
                        value={remnantSearchQuery}
                        onChange={(e) => setRemnantSearchQuery(e.target.value)}
                        className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-zinc-200 rounded-xl text-xs font-bold text-zinc-950 focus:outline-none focus:ring-2 focus:ring-zinc-950 placeholder-zinc-400 shadow-sm text-left"
                      />
                    </div>

                    {/* Table */}
                    <div className="overflow-x-auto border border-zinc-200 rounded-2xl shadow-sm">
                      <table className="w-full text-left text-xs border-collapse">
                        <thead className="bg-slate-50 border-b border-zinc-200">
                          <tr>
                            <th className="px-4 py-3 text-[9px] font-black text-slate-400 uppercase tracking-widest">Roll ID</th>
                            <th className="px-4 py-3 text-[9px] font-black text-slate-400 uppercase tracking-widest">Material Type</th>
                            <th className="px-4 py-3 text-[9px] font-black text-slate-400 uppercase tracking-widest">Size ({currentUnit})</th>
                            <th className="px-4 py-3 text-[9px] font-black text-slate-400 uppercase tracking-widest">Remaining Stock</th>
                            <th className="px-4 py-3 text-[9px] font-black text-slate-400 uppercase tracking-widest text-right w-24">Actions</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-zinc-150">
                          {filteredRemnantRollsList.map((roll) => {
                            const percentageRemaining = roll.totalSqm > 0 ? (roll.remainingSqm / roll.totalSqm) * 100 : 0;
                            const percentageUsed = 100 - percentageRemaining;
                            const barColor = percentageRemaining > 50 ? 'bg-emerald-500' : percentageRemaining > 20 ? 'bg-amber-500' : 'bg-rose-500';
                            const textColor = percentageRemaining > 50 ? 'text-emerald-700' : percentageRemaining > 20 ? 'text-amber-700' : 'text-rose-700';
                            return (
                              <tr key={roll.id} className="hover:bg-slate-50/50 transition-colors">
                                <td className="px-4 py-3">
                                  <div className="flex items-center gap-1.5">
                                    <span className="font-black text-sm text-slate-800">{roll.id}</span>
                                    <span className="text-[7.5px] px-1.5 py-0.5 bg-emerald-50 border border-emerald-100 text-emerald-700 rounded-full font-black tracking-widest">REUSE</span>
                                  </div>
                                </td>
                                <td className="px-4 py-3 font-bold text-slate-500 text-xs">{roll.materialType}</td>
                                <td className="px-4 py-3 font-extrabold text-slate-800 text-xs">
                                  {fromMeters(roll.fullLength).toFixed(1)} × {fromMeters(roll.fullWidth).toFixed(1)}
                                </td>
                                <td className="px-4 py-3">
                                  <div className="space-y-1.5 max-w-[200px]">
                                    <div className="flex justify-between text-[9px] font-black uppercase tracking-wider">
                                      <span className={textColor}>{percentageRemaining.toFixed(0)}% Left</span>
                                      <span className="text-slate-400">{(roll.remainingSqm * (currentUnit === 'm' ? 1 : CONVERSIONS[currentUnit] * CONVERSIONS[currentUnit])).toFixed(1)}{areaUnit}</span>
                                    </div>
                                    <div className="w-full h-2 bg-slate-200 rounded-full overflow-hidden">
                                      <div className={`h-full ${barColor} rounded-full transition-all duration-500`} style={{ width: `${percentageRemaining}%` }} />
                                    </div>
                                  </div>
                                </td>
                                <td className="px-4 py-3 text-right">
                                  <div className="flex gap-1.5 justify-end">
                                    {roll.status !== 'refused' && (
                                      <button
                                        onClick={() => handleRefuseRoll(roll.id)}
                                        className="p-2 text-slate-400 hover:text-amber-600 hover:bg-amber-50 rounded-lg transition cursor-pointer"
                                        title="Mark as Waste"
                                      >
                                        <AlertTriangle size={15} />
                                      </button>
                                    )}
                                    <button
                                      onClick={() => handleDeleteRoll(roll.id)}
                                      className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition cursor-pointer"
                                      title="Delete Roll"
                                    >
                                      <Trash2 size={15} />
                                    </button>
                                  </div>
                                </td>
                              </tr>
                            );
                          })}

                          {filteredRemnantRollsList.length === 0 && (
                            <tr>
                              <td colSpan={5} className="py-16 text-center text-zinc-400 font-semibold text-xs italic">
                                No remnants in stock.
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {/* CARD 3: Fresh Rolls */}
                {activeInventoryCard === 'fresh' && (
                  <div className="bg-white rounded-2xl border border-zinc-200 shadow-sm p-5 animate-in fade-in duration-300 flex flex-col w-full">
                    <div className="flex justify-between items-center mb-4">
                      <h3 className="text-sm font-black text-slate-800 uppercase tracking-wider flex items-center gap-2">
                        <div className="p-1.5 rounded-lg bg-indigo-50 shrink-0">
                          <Warehouse size={16} className="text-indigo-600" />
                        </div>
                        Fresh Rolls
                        <span className="text-[10px] font-black text-indigo-700 bg-indigo-50 border border-indigo-100 px-2.5 py-0.5 rounded-full ml-1.5">
                          {filteredFreshRollsList.length} rolls
                        </span>
                      </h3>
                      <button
                        onClick={handleToggleAddRollForm}
                        className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg font-black text-[10px] transition flex items-center gap-1.5 cursor-pointer"
                      >
                        <Plus size={12} /> {showAddRollForm ? 'CANCEL' : 'ADD MASTER ROLL'}
                      </button>
                    </div>

                    {showAddRollForm && (
                      <div className="mb-4 p-4 bg-slate-50 rounded-xl border border-slate-200 animate-in fade-in slide-in-from-top-2">
                        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 items-end">
                          <div className="space-y-1">
                            <label className="text-[9px] font-black text-slate-500 uppercase tracking-wider">Roll ID</label>
                            <input
                              type="text"
                              value={newRoll.id}
                              onChange={(e) => setNewRoll({ ...newRoll, id: e.target.value })}
                              placeholder="e.g. R-105"
                              className="w-full px-3 py-2 border border-zinc-200 rounded-lg text-xs font-bold bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                            />
                          </div>
                          <div className="space-y-1">
                            <label className="text-[9px] font-black text-slate-500 uppercase tracking-wider">Material Type</label>
                            <select
                              value={newRoll.materialType}
                              onChange={(e) => setNewRoll({ ...newRoll, materialType: e.target.value })}
                              className="w-full px-3 py-2 border border-zinc-200 rounded-lg text-xs font-bold bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                            >
                              {MATERIAL_TYPES.map(type => <option key={type} value={type}>{type}</option>)}
                            </select>
                          </div>
                          <div className="grid grid-cols-2 gap-2">
                            <div className="space-y-1">
                              <label className="text-[9px] font-black text-slate-500 uppercase tracking-wider">Width ({currentUnit})</label>
                              <input
                                type="number"
                                value={fromMeters(newRoll.fullWidth) || ''}
                                onChange={(e) => setNewRoll({ ...newRoll, fullWidth: toMeters(parseFloat(e.target.value) || 0) })}
                                className="w-full px-3 py-2 border border-zinc-200 rounded-lg text-xs font-bold bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                              />
                            </div>
                            <div className="space-y-1">
                              <label className="text-[9px] font-black text-slate-500 uppercase tracking-wider">Length ({currentUnit})</label>
                              <input
                                type="number"
                                value={fromMeters(newRoll.fullLength) || ''}
                                onChange={(e) => setNewRoll({ ...newRoll, fullLength: toMeters(parseFloat(e.target.value) || 0) })}
                                className="w-full px-3 py-2 border border-zinc-200 rounded-lg text-xs font-bold bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                              />
                            </div>
                          </div>
                          <button
                            onClick={handleAddRoll}
                            disabled={isSyncing}
                            className={`font-black py-2 rounded-lg transition text-xs cursor-pointer flex items-center justify-center gap-1.5 ${isSyncing ? 'bg-emerald-800 text-emerald-300 cursor-not-allowed' : 'bg-emerald-600 text-white hover:bg-emerald-500'
                              }`}
                          >
                            {isSyncing ? <Loader2 className="animate-spin" size={13} /> : 'SAVE'}
                          </button>
                        </div>
                      </div>
                    )}

                    {/* Searcher */}
                    <div className="relative mb-4">
                      <Search className="absolute left-3.5 top-3 h-4 w-4 text-zinc-400" />
                      <input
                        type="text"
                        placeholder="Search Fresh Rolls..."
                        value={freshRollSearchQuery}
                        onChange={(e) => setFreshRollSearchQuery(e.target.value)}
                        className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-zinc-200 rounded-xl text-xs font-bold text-zinc-950 focus:outline-none focus:ring-2 focus:ring-zinc-950 placeholder-zinc-400 shadow-sm text-left"
                      />
                    </div>

                    {/* Table */}
                    <div className="overflow-x-auto border border-zinc-200 rounded-2xl shadow-sm">
                      <table className="w-full text-left text-xs border-collapse">
                        <thead className="bg-slate-50 border-b border-zinc-200">
                          <tr>
                            <th className="px-4 py-3 text-[9px] font-black text-slate-400 uppercase tracking-widest">Roll ID</th>
                            <th className="px-4 py-3 text-[9px] font-black text-slate-400 uppercase tracking-widest">Material Type</th>
                            <th className="px-4 py-3 text-[9px] font-black text-slate-400 uppercase tracking-widest">Size ({currentUnit})</th>
                            <th className="px-4 py-3 text-[9px] font-black text-slate-400 uppercase tracking-widest">Remaining Stock</th>
                            <th className="px-4 py-3 text-[9px] font-black text-slate-400 uppercase tracking-widest text-right w-24">Actions</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-zinc-150">
                          {filteredFreshRollsList.map((roll) => {
                            const percentageRemaining = roll.totalSqm > 0 ? (roll.remainingSqm / roll.totalSqm) * 100 : 0;
                            const percentageUsed = 100 - percentageRemaining;
                            const barColor = percentageRemaining > 50 ? 'bg-indigo-500' : percentageRemaining > 20 ? 'bg-amber-500' : 'bg-rose-500';
                            const textColor = percentageRemaining > 50 ? 'text-indigo-700' : percentageRemaining > 20 ? 'text-amber-700' : 'text-rose-700';
                            return (
                              <tr key={roll.id} className="hover:bg-slate-50/50 transition-colors">
                                <td className="px-4 py-3">
                                  <div className="flex items-center gap-1.5">
                                    <span className="font-black text-sm text-slate-800">{roll.id}</span>
                                    <span className="text-[7.5px] px-1.5 py-0.5 bg-indigo-50 border border-indigo-100 text-indigo-700 rounded-full font-black tracking-widest">MASTER</span>
                                  </div>
                                </td>
                                <td className="px-4 py-3 font-bold text-slate-500 text-xs">{roll.materialType}</td>
                                <td className="px-4 py-3 font-extrabold text-slate-800 text-xs">
                                  {fromMeters(roll.fullLength).toFixed(1)} × {fromMeters(roll.fullWidth).toFixed(1)}
                                </td>
                                <td className="px-4 py-3">
                                  <div className="space-y-1.5 max-w-[200px]">
                                    <div className="flex justify-between text-[9px] font-black uppercase tracking-wider">
                                      <span className={textColor}>{percentageRemaining.toFixed(0)}% Left</span>
                                      <span className="text-slate-400">{(roll.remainingSqm * (currentUnit === 'm' ? 1 : CONVERSIONS[currentUnit] * CONVERSIONS[currentUnit])).toFixed(1)}{areaUnit}</span>
                                    </div>
                                    <div className="w-full h-2 bg-slate-200 rounded-full overflow-hidden">
                                      <div className={`h-full ${barColor} rounded-full transition-all duration-500`} style={{ width: `${percentageRemaining}%` }} />
                                    </div>
                                  </div>
                                </td>
                                <td className="px-4 py-3 text-right">
                                  <div className="flex gap-1.5 justify-end">
                                    {roll.status !== 'refused' && (
                                      <button
                                        onClick={() => handleRefuseRoll(roll.id)}
                                        className="p-2 text-slate-400 hover:text-amber-600 hover:bg-amber-50 rounded-lg transition cursor-pointer"
                                        title="Mark as Waste"
                                      >
                                        <AlertTriangle size={15} />
                                      </button>
                                    )}
                                    <button
                                      onClick={() => handleDeleteRoll(roll.id)}
                                      className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition cursor-pointer"
                                      title="Delete Roll"
                                    >
                                      <Trash2 size={15} />
                                    </button>
                                  </div>
                                </td>
                              </tr>
                            );
                          })}

                          {filteredFreshRollsList.length === 0 && (
                            <tr>
                              <td colSpan={5} className="py-16 text-center text-zinc-400 font-semibold text-xs italic">
                                No fresh rolls in stock.
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {/* CARD 4: Reorder Level Monitor */}
                {activeInventoryCard === 'reorder' && (() => {
                  const lowItems = materialStocks.filter(s => s.reorderLevel > 0 && s.quantity <= s.reorderLevel);
                  return (
                    <div className="bg-white rounded-2xl border border-zinc-200 shadow-sm p-4 animate-in fade-in duration-300 flex flex-col w-full">
                      <div className="flex justify-between items-center mb-3">
                        <h3 className="text-xs font-black text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                          <div className="p-1.5 rounded-lg bg-amber-50 shrink-0">
                            <AlertTriangle size={14} className="text-amber-500" />
                          </div>
                          Reorder Level Monitor
                          {lowItems.length > 0 ? (
                            <span className="text-[10px] font-black text-rose-700 bg-rose-50 border border-rose-100 px-2 py-0.5 rounded-full ml-1.5">
                              {lowItems.length} low stock
                            </span>
                          ) : (
                            <span className="text-[10px] font-black text-emerald-700 bg-emerald-50 border border-emerald-100 px-2 py-0.5 rounded-full ml-1.5">
                              Stock levels OK
                            </span>
                          )}
                        </h3>
                      </div>

                      {/* Alert Banner if any item is low */}
                      {lowItems.length > 0 && (
                        <div className="bg-amber-50/70 border border-amber-200 rounded-xl p-2.5 flex items-start gap-2 mb-3">
                          <AlertTriangle size={14} className="text-amber-500 shrink-0 mt-0.5 animate-bounce" />
                          <div className="min-w-0 flex-1">
                            <p className="text-[10px] font-bold text-amber-800 leading-tight">
                              {lowItems.length} {lowItems.length === 1 ? 'item requires' : 'items require'} immediate refill.
                            </p>
                          </div>
                        </div>
                      )}

                      {/* Searcher */}
                      <div className="relative mb-3">
                        <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-zinc-400" />
                        <input
                          type="text"
                          placeholder="Search Reorder Levels..."
                          value={reorderSearchQuery}
                          onChange={(e) => setReorderSearchQuery(e.target.value)}
                          className="w-full pl-8 pr-3 py-1.5 bg-slate-50 border border-zinc-200 rounded-lg text-[11px] font-bold text-zinc-950 focus:outline-none focus:ring-1 focus:ring-zinc-950 placeholder-zinc-400 shadow-sm text-left"
                        />
                      </div>

                      {/* Table */}
                      <div className="overflow-x-auto border border-zinc-150 rounded-xl">
                        <table className="w-full text-left text-xs border-collapse">
                          <thead className="bg-slate-50 border-b border-zinc-150">
                            <tr>
                              <th className="px-3 py-2 text-[9px] font-black text-slate-400 uppercase tracking-widest">Material Name</th>
                              <th className="px-3 py-2 text-[9px] font-black text-slate-400 uppercase tracking-widest">Current Stock</th>
                              <th className="px-3 py-2 text-[9px] font-black text-slate-400 uppercase tracking-widest w-24">Reorder Trigger</th>
                              <th className="px-3 py-2 text-[9px] font-black text-slate-400 uppercase tracking-widest">Status</th>
                            </tr>
                          </thead>
                          <tbody>
                            {filteredReorderItemsList.map((item) => {
                              const isLow = item.reorderLevel > 0 && item.quantity <= item.reorderLevel;
                              const isOut = item.quantity <= 0;
                              const currentEdit = editingReorderLevel[item.id];
                              return (
                                <tr
                                  key={item.id}
                                  className={`border-b border-zinc-100 hover:bg-slate-50/50 transition-colors ${
                                    isOut
                                      ? 'bg-rose-50/30 border-l-2 border-l-rose-500'
                                      : isLow
                                        ? 'bg-amber-50/30 border-l-2 border-l-amber-500'
                                        : ''
                                  }`}
                                >
                                  <td className="px-3 py-2 font-black text-slate-800">{item.name}</td>
                                  <td className="px-3 py-2 font-bold">
                                    <span className={isLow ? (isOut ? 'text-rose-600 font-extrabold' : 'text-amber-600') : 'text-slate-700'}>
                                      {item.quantity} {item.unit}
                                    </span>
                                  </td>
                                  <td className="px-3 py-2">
                                    <div className="flex items-center gap-1">
                                      <input
                                        type="number"
                                        min="0"
                                        placeholder={item.reorderLevel > 0 ? item.reorderLevel.toString() : '0'}
                                        value={currentEdit !== undefined ? currentEdit : (item.reorderLevel > 0 ? item.reorderLevel.toString() : '')}
                                        onChange={(e) => setEditingReorderLevel(prev => ({ ...prev, [item.id]: e.target.value }))}
                                        className="w-12 px-1 py-0.5 border border-zinc-200 rounded text-xs font-bold text-center focus:outline-none focus:ring-1 focus:ring-amber-400"
                                      />
                                      <button
                                        onClick={() => handleSaveReorderLevel(item.id)}
                                        disabled={savingReorderLevel === item.id || currentEdit === undefined}
                                        className={`p-0.5 rounded text-[10px] font-black transition cursor-pointer ${
                                          savingReorderLevel === item.id
                                            ? 'bg-slate-100 text-slate-300'
                                            : currentEdit !== undefined
                                              ? 'bg-amber-500 hover:bg-amber-400 text-white shadow-sm'
                                              : 'bg-slate-100 text-slate-300 cursor-not-allowed'
                                        }`}
                                        title="Save reorder level"
                                      >
                                        {savingReorderLevel === item.id ? <Loader2 size={10} className="animate-spin" /> : <Check size={10} />}
                                      </button>
                                    </div>
                                  </td>
                                  <td className="px-3 py-2">
                                    {isOut ? (
                                      <span className="text-[7.5px] font-black px-1.5 py-0.5 rounded bg-rose-100 text-rose-700 border border-rose-200">OUT OF STOCK</span>
                                    ) : isLow ? (
                                      <span className="text-[7.5px] font-black px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 border border-amber-200">LOW STOCK</span>
                                    ) : (
                                      <span className="text-[7.5px] font-black px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-100">OK</span>
                                    )}
                                  </td>
                                </tr>
                              );
                            })}

                            {filteredReorderItemsList.length === 0 && (
                              <tr>
                                <td colSpan={4} className="py-10 text-center text-zinc-400 font-semibold text-xs italic">
                                  No materials found.
                                </td>
                              </tr>
                            )}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  );
                })()}

              </div>

            </div>
          )}

          {/* ═══ PRODUCTION LOG TAB ═══ */}
          {activeTab === 'production' && (
            <div className="space-y-4 animate-in fade-in slide-in-from-top-3 duration-200">
              {/* Records */}
              {filteredMaterialIssues.length === 0 ? (
                <div className="bg-white rounded-2xl border border-zinc-200 py-16 text-center shadow-sm">
                  <ClipboardList size={32} className="mx-auto text-zinc-200 mb-3" />
                  <p className="font-black text-zinc-400 text-xs uppercase tracking-wider">
                    {productionSearchQuery ? "No matching records found" : "No production records yet"}
                  </p>
                  {!productionSearchQuery && (
                    <p className="text-[10px] text-zinc-300 font-semibold mt-1 uppercase tracking-wider">
                      Go to Inventory → Material Stocks → Issue to Production
                    </p>
                  )}
                </div>
              ) : (
                <div className="bg-white rounded-2xl border border-zinc-200 shadow-sm overflow-hidden animate-in fade-in duration-200">
                  <table className="w-full text-left">
                    <thead className="bg-slate-50">
                      <tr>
                        <th className="px-4 py-2 text-[9px] font-black text-slate-400 uppercase tracking-widest w-12">Index</th>
                        <th className="px-4 py-2 text-[9px] font-black text-slate-400 uppercase tracking-widest">Material</th>
                        <th className="px-4 py-2 text-[9px] font-black text-slate-400 uppercase tracking-widest">Quantity</th>
                        <th className="px-4 py-2 text-[9px] font-black text-slate-400 uppercase tracking-widest">Issued To</th>
                        <th className="px-4 py-2 text-[9px] font-black text-slate-400 uppercase tracking-widest">Notes</th>
                        <th className="px-4 py-2 text-[9px] font-black text-slate-400 uppercase tracking-widest">Date &amp; Time</th>
                        <th className="px-4 py-2 text-[9px] font-black text-slate-400 uppercase tracking-widest text-right w-16">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-100 font-semibold text-slate-700">
                      {filteredMaterialIssues.map((issue, idx) => {
                        const dt = new Date(issue.issuedAt);
                        const dateStr = dt.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
                        const timeStr = dt.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });
                        return (
                          <tr key={issue.id} className="hover:bg-slate-50/50 transition-colors">
                            <td className="px-4 py-2 text-xs font-black text-slate-400">
                              #{materialIssues.length - idx}
                            </td>
                            <td className="px-4 py-2 text-xs font-black text-slate-900">
                              {issue.materialName}
                            </td>
                            <td className="px-4 py-2 text-xs">
                              <span className="text-[10px] font-black text-emerald-700 bg-emerald-50 border border-emerald-100 px-2 py-0.5 rounded-md leading-none">
                                {issue.quantity} {issue.unit}
                              </span>
                            </td>
                            <td className="px-4 py-2 text-xs">
                              <span className="text-[10px] font-black text-zinc-800 bg-zinc-100 px-2 py-0.5 rounded-md leading-none">
                                {issue.issuedTo}
                              </span>
                            </td>
                            <td className="px-4 py-2 text-xs text-slate-500 italic max-w-xs truncate" title={issue.notes || undefined}>
                              {issue.notes ? `"${issue.notes}"` : <span className="text-slate-300 font-normal">No notes</span>}
                            </td>
                            <td className="px-4 py-2 text-xs text-slate-500">
                              <span className="font-bold">{timeStr}</span> <span className="text-[10px] text-slate-400 ml-1.5">{dateStr}</span>
                            </td>
                            <td className="px-4 py-2 text-right">
                              <button
                                onClick={() => handleDeleteIssue(issue.id)}
                                className="p-1.5 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition cursor-pointer"
                                title="Remove record"
                              >
                                <Trash2 size={13} />
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {activeTab === 'scrub' && (
            <div className="space-y-4 animate-in fade-in slide-in-from-top-3">

              <div className="bg-white rounded-2xl border border-zinc-200 shadow-sm overflow-hidden">
                <table className="w-full text-left">
                  <thead className="bg-slate-50">
                    <tr>
                      <th className="px-4 py-2.5 text-[9px] font-black text-slate-400 uppercase tracking-widest">ID / Specification</th>
                      <th className="px-4 py-2.5 text-[9px] font-black text-slate-400 uppercase tracking-widest">Original Size</th>
                      <th className="px-4 py-2.5 text-[9px] font-black text-slate-400 uppercase tracking-widest">Remaining Area</th>
                      <th className="px-4 py-2.5 text-[9px] font-black text-slate-400 uppercase tracking-widest text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-100">
                    {filteredScrubRolls.map(roll => (
                      <tr key={roll.id} className="hover:bg-slate-50 transition-colors">
                        <td className="px-4 py-2.5">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-black text-zinc-950 text-sm">{roll.id}</span>
                            <span className={`text-[9px] px-2 py-0.5 rounded-full font-black tracking-widest leading-none ${isRollReuse(roll) ? 'bg-emerald-50 text-emerald-700 border border-emerald-100' : 'bg-indigo-50 text-indigo-700 border border-indigo-100'}`}>
                              {isRollReuse(roll) ? 'REUSE' : 'FRESH'}
                            </span>
                          </div>
                          <span className="text-[9px] text-slate-400 font-bold block mt-0.5">{roll.materialType}</span>
                        </td>
                        <td className="px-4 py-2.5 font-bold text-xs">{fromMeters(roll.fullLength).toFixed(1)}{currentUnit} x {fromMeters(roll.fullWidth).toFixed(1)}{currentUnit}</td>
                        <td className="px-4 py-2.5 font-bold text-xs">{fromMeters(roll.remainingSqm).toFixed(1)}{currentUnit}²</td>
                        <td className="px-4 py-2.5">
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
                    {filteredScrubRolls.length === 0 && (
                      <tr>
                        <td colSpan={4} className="py-20 text-center text-zinc-400 font-medium text-sm">
                          {rolls.filter(r => r.status === 'refused').length === 0
                            ? "No refused remnants in scrap registry."
                            : "No matching remnants found."}
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {activeTab === 'details' && (
            <div className="space-y-4 animate-in fade-in slide-in-from-top-3">
              <div className="bg-white rounded-2xl border border-zinc-200 shadow-sm overflow-hidden animate-in fade-in duration-200">
                <table className="w-full text-left">
                  <thead className="bg-slate-50">
                    <tr>
                      <th className="px-4 py-2.5 text-[9px] font-black text-slate-400 uppercase tracking-widest">Order No.</th>
                      <th className="px-4 py-2.5 text-[9px] font-black text-slate-400 uppercase tracking-widest">Client Name</th>
                      <th className="px-4 py-2.5 text-[9px] font-black text-slate-400 uppercase tracking-widest">Total Cuts Taken</th>
                      <th className="px-4 py-2.5 text-[9px] font-black text-slate-400 uppercase tracking-widest">Consumed Materials</th>
                      <th className="px-4 py-2.5 text-[9px] font-black text-slate-400 uppercase tracking-widest text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-100 font-semibold text-slate-700">
                    {filteredClientCutsList.map((client, idx) => {
                      const uniqueMaterials = Array.from(new Set(client.cuts.map(c => c.rollMaterial)));
                      const clientOrderNumbers = Array.from(new Set(client.cuts.map(c => allOrdersMap[c.cut.orderId]).filter(Boolean)));
                      return (
                        <tr key={client.customerName} className="hover:bg-slate-50/50 transition-colors">
                          <td className="px-4 py-2.5 text-zinc-950 font-bold text-xs">
                            {clientOrderNumbers.length > 0 ? clientOrderNumbers.join(', ') : 'Manual'}
                          </td>
                          <td className="px-4 py-2.5 font-black text-slate-900">{client.customerName}</td>
                          <td className="px-4 py-2.5">
                            <span className="bg-zinc-55 text-zinc-950 border border-zinc-200 px-2.5 py-0.5 rounded-lg font-bold text-xs">
                              {client.cuts.length} cuts
                            </span>
                          </td>
                          <td className="px-4 py-2.5">
                            <div className="flex gap-1.5 flex-wrap">
                              {uniqueMaterials.map(mat => (
                                <span key={mat} className="bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded-lg border border-indigo-100 font-bold text-[10px]">
                                  {mat}
                                </span>
                              ))}
                            </div>
                          </td>
                          <td className="px-4 py-2.5 text-right">
                            <button
                              onClick={() => setSelectedClientName(client.customerName)}
                              className="px-3 py-1.5 bg-zinc-950 hover:bg-zinc-800 text-white rounded-lg font-black text-xs transition shadow-sm cursor-pointer inline-flex items-center gap-1.5"
                            >
                              <Info size={13} /> Check Details
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                    {filteredClientCutsList.length === 0 && (
                      <tr>
                        <td colSpan={5} className="py-20 text-center text-zinc-400 font-bold">
                          {clientCutsList.length === 0
                            ? "No client cuts recorded in history."
                            : "No matching client cuts found."}
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {activeTab === 'rolls_map' && (
            <div className="space-y-4 animate-in fade-in slide-in-from-top-3">
              <div className="bg-white rounded-2xl border border-zinc-200 shadow-sm overflow-hidden animate-in fade-in duration-200">
                <table className="w-full text-left">
                  <thead className="bg-slate-50">
                    <tr>
                      <th className="px-4 py-2.5 text-[9px] font-black text-slate-400 uppercase tracking-widest">S.No</th>
                      <th className="px-4 py-2.5 text-[9px] font-black text-slate-400 uppercase tracking-widest">Roll ID / Spec</th>
                      <th className="px-4 py-2.5 text-[9px] font-black text-slate-400 uppercase tracking-widest">Dimensions</th>
                      <th className="px-4 py-2.5 text-[9px] font-black text-slate-400 uppercase tracking-widest">Stock Level</th>
                      <th className="px-4 py-2.5 text-[9px] font-black text-slate-400 uppercase tracking-widest">Total Cuts</th>
                      <th className="px-4 py-2.5 text-[9px] font-black text-slate-400 uppercase tracking-widest text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-100 font-semibold text-slate-700">
                    {filteredRollsMapList.map((roll, idx) => {
                      const usedSqm = roll.cuts.reduce((s, c) => s + c.width * c.length, 0);
                      const usedPct = roll.totalSqm > 0 ? (usedSqm / roll.totalSqm) * 100 : 0;

                      return (
                        <tr key={roll.id} className="hover:bg-slate-50/50 transition-colors">
                          <td className="px-4 py-2.5 text-slate-400">#{idx + 1}</td>
                          <td className="px-4 py-2.5">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-black text-slate-900">{roll.id}</span>
                              <span className={`text-[9px] px-2 py-0.5 rounded-full font-black tracking-widest leading-none ${isRollReuse(roll) ? 'bg-emerald-50 text-emerald-700 border border-emerald-100' : 'bg-indigo-50 text-indigo-700 border border-indigo-100'
                                }`}>
                                {isRollReuse(roll) ? 'REUSE' : 'FRESH'}
                              </span>
                              {roll.status === 'refused' && (
                                <span className="text-[9px] px-2 py-0.5 rounded-full font-black bg-rose-50 text-rose-700 border border-rose-100">
                                  SCRAP
                                </span>
                              )}
                            </div>
                            <span className="text-[10px] text-slate-400 font-bold block mt-0.5">{roll.materialType}</span>
                          </td>
                          <td className="px-4 py-2.5 font-bold text-slate-800">
                            {fromMeters(roll.fullLength).toFixed(1)}{currentUnit} × {fromMeters(roll.fullWidth).toFixed(1)}{currentUnit}
                          </td>
                          <td className="px-4 py-2.5">
                            <div className="space-y-1">
                              <div className="w-28 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                                <div className={`h-full rounded-full transition-all ${usedPct > 80 ? 'bg-rose-500' : usedPct > 50 ? 'bg-amber-500' : 'bg-emerald-500'
                                  }`} style={{ width: `${Math.min(100, usedPct)}%` }} />
                              </div>
                              <span className="text-[9px] font-black text-slate-400">
                                {usedPct.toFixed(0)}% used ({(usedSqm * (currentUnit === 'm' ? 1 : CONVERSIONS[currentUnit] * CONVERSIONS[currentUnit])).toFixed(1)}{areaUnit})
                              </span>
                            </div>
                          </td>
                          <td className="px-4 py-2.5">
                            <span className="bg-zinc-50 text-zinc-950 border border-zinc-200 px-3 py-1 rounded-xl font-bold text-xs">
                              {roll.cuts.length} cuts
                            </span>
                          </td>
                          <td className="px-4 py-2.5 text-right">
                            <button
                              onClick={() => setSelectedRollId(roll.id)}
                              className="px-2 py-1 bg-zinc-950 hover:bg-zinc-800 text-white rounded-lg font-black text-[10px] transition shadow-sm cursor-pointer inline-flex items-center gap-1.5"
                            >
                              <Info size={11} /> Check Details
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                    {filteredRollsMapList.length === 0 && (
                      <tr>
                        <td colSpan={6} className="py-20 text-center text-zinc-400 font-bold">
                          {rolls.length === 0
                            ? "No rolls in stock registry."
                            : "No matching rolls found."}
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
              <div className="bg-white rounded-2xl w-full max-w-4xl shadow-2xl max-h-[85vh] overflow-hidden flex flex-col animate-in zoom-in-95 duration-200 text-left">
                <div className="p-3 border-b border-zinc-150 flex justify-between items-center bg-white text-zinc-950">
                  <div>
                    <h3 className="text-xs font-black uppercase tracking-wider">Cuts Details for {selectedClientName}</h3>
                  </div>
                  <button
                    onClick={() => setSelectedClientName(null)}
                    className="p-2 text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100 rounded-xl transition cursor-pointer"
                  >
                    <X className="h-5 w-5" />
                  </button>
                </div>
                <div className="p-6 overflow-y-auto flex-1">
                  <div className="border border-zinc-200 rounded-2xl overflow-hidden">
                    <table className="w-full text-left">
                      <thead className="bg-slate-50">
                        <tr>
                          <th className="px-5 py-3 text-[9px] font-black text-slate-400 uppercase tracking-widest">Order No.</th>
                          <th className="px-5 py-3 text-[9px] font-black text-slate-400 uppercase tracking-widest">Cut ID</th>
                          <th className="px-5 py-3 text-[9px] font-black text-slate-400 uppercase tracking-widest">Dimensions</th>
                          <th className="px-5 py-3 text-[9px] font-black text-slate-400 uppercase tracking-widest">Material</th>
                          <th className="px-5 py-3 text-[9px] font-black text-slate-400 uppercase tracking-widest">Source Roll</th>
                          <th className="px-5 py-3 text-[9px] font-black text-slate-400 uppercase tracking-widest">Entry Date &amp; Time</th>
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
                              <td className="px-5 py-3 text-zinc-950 font-bold">{allOrdersMap[item.cut.orderId] || 'Manual'}</td>
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
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
                <div className="p-4 border-t bg-zinc-50 flex justify-between items-center">
                  <div className="flex gap-2">
                    <button
                      onClick={handleExportClientCSV}
                      className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-black transition cursor-pointer flex items-center gap-1.5 shadow-sm active:scale-95 animate-in fade-in"
                    >
                      <Download size={13} /> EXPORT CSV
                    </button>
                    <button
                      onClick={handlePrintClientCuts}
                      className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-black transition cursor-pointer flex items-center gap-1.5 shadow-sm active:scale-95 animate-in fade-in"
                    >
                      <Printer size={13} /> PRINT
                    </button>
                  </div>
                  <button
                    onClick={() => setSelectedClientName(null)}
                    className="px-5 py-2.5 bg-zinc-950 hover:bg-zinc-800 text-white rounded-xl text-xs font-black transition cursor-pointer active:scale-95"
                  >
                    CLOSE
                  </button>
                </div>
              </div>
            </div>
          )}



          {/* Roll Client Allocations Popup/Modal */}
          {selectedRollId && (
            <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
              <div className="bg-white rounded-xl w-full max-w-4xl shadow-2xl max-h-[85vh] overflow-hidden flex flex-col animate-in zoom-in-95 duration-200 text-left">
                <div className="p-3 border-b border-zinc-150 flex justify-between items-center bg-white text-zinc-950">
                  <div>
                    <h3 className="text-xs font-black uppercase tracking-wider">Client Allocations for Roll {selectedRollId}</h3>
                  </div>
                  <button
                    onClick={() => setSelectedRollId(null)}
                    className="p-2 text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100 rounded-xl transition cursor-pointer"
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
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
                <div className="p-4 border-t bg-zinc-50 flex justify-between items-center flex-wrap gap-2">
                  <div className="flex gap-2">
                    <button
                      onClick={() => handlePrintRollAllocations(selectedRollId)}
                      className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-black transition flex items-center gap-1.5 cursor-pointer shadow-sm"
                    >
                      Print
                    </button>
                    <button
                      onClick={() => handleExportCSV(selectedRollId)}
                      className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-black transition flex items-center gap-1.5 cursor-pointer shadow-sm"
                    >
                      Export CSV
                    </button>
                  </div>
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

      {/* â•â•â• ISSUE MATERIAL MODAL â•â•â• */}
      {showIssueModal && issuingStock && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-zinc-950/60 backdrop-blur-sm"
            onClick={() => setShowIssueModal(false)}
          />

          {/* Modal */}
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md animate-in fade-in zoom-in-95 duration-200">
            {/* Header */}
            <div className="p-5 border-b border-zinc-100 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-emerald-100 rounded-xl flex items-center justify-center">
                  <ArrowDownCircle size={20} className="text-emerald-600" />
                </div>
                <div>
                  <h3 className="font-black text-zinc-950 text-sm">Issue Material</h3>
                  <p className="text-[10px] font-bold text-slate-400 mt-0.5">From Inventory â†’ Production</p>
                </div>
              </div>
              <button
                onClick={() => setShowIssueModal(false)}
                className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-xl transition cursor-pointer"
              >
                <X size={16} />
              </button>
            </div>

            {/* Material Info */}
            <div className="px-5 pt-4">
              <div className="bg-slate-50 rounded-xl p-3 border border-slate-100 flex items-center justify-between">
                <div>
                  <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Material</span>
                  <p className="font-black text-zinc-950 text-sm mt-0.5">{issuingStock.name}</p>
                </div>
                <span className="text-xs font-black text-indigo-700 bg-indigo-50 border border-indigo-100 px-2.5 py-1 rounded-lg">
                  Available: {issuingStock.quantity} {issuingStock.unit}
                </span>
              </div>
            </div>

            {/* Form */}
            {(() => {
              const parsedQty = parseFloat(issueForm.quantity);
              const isOverStock = !isNaN(parsedQty) && parsedQty > issuingStock.quantity;
              return (
                <div className="p-5 space-y-4">
                  <div className="space-y-1.5">
                    <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest">
                      Quantity to Issue ({issuingStock.unit})
                    </label>
                    <input
                      type="number"
                      min="0.01"
                      step="0.01"
                      placeholder={`e.g. 5 ${issuingStock.unit}`}
                      value={issueForm.quantity}
                      onChange={(e) => setIssueForm({ ...issueForm, quantity: e.target.value })}
                      className={`w-full px-3 py-2.5 border rounded-xl text-sm font-bold bg-white focus:outline-none focus:ring-2 focus:border-transparent ${
                        isOverStock
                          ? 'border-rose-350 text-rose-700 focus:ring-rose-500'
                          : 'border-zinc-200 focus:ring-emerald-500'
                      }`}
                      autoFocus
                    />
                    {isOverStock && (
                      <p className="text-[10px] font-bold text-rose-600 mt-1 animate-in fade-in slide-in-from-top-1 duration-150">
                        ⚠️ Quantity cannot exceed available stock ({issuingStock.quantity} {issuingStock.unit})
                      </p>
                    )}
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest">
                      Issued To (Person / Department)
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. Ramesh - Production Floor"
                      value={issueForm.issuedTo}
                      onChange={(e) => setIssueForm({ ...issueForm, issuedTo: e.target.value })}
                      className="w-full px-3 py-2.5 border border-zinc-200 rounded-xl text-sm font-bold bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest">
                      Notes (Optional)
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. For Belt Assembly Line A"
                      value={issueForm.notes}
                      onChange={(e) => setIssueForm({ ...issueForm, notes: e.target.value })}
                      className="w-full px-3 py-2.5 border border-zinc-200 rounded-xl text-sm font-bold bg-white focus:outline-none focus:ring-2 focus:ring-zinc-950 focus:border-transparent"
                    />
                  </div>

                  <button
                    onClick={handleSubmitIssue}
                    disabled={isSubmittingIssue || isOverStock}
                    className={`w-full py-3 rounded-xl font-black text-sm flex items-center justify-center gap-2 transition cursor-pointer ${
                      isSubmittingIssue
                        ? 'bg-emerald-350 text-white cursor-not-allowed'
                        : isOverStock
                          ? 'bg-rose-50 text-rose-400 border border-rose-100 cursor-not-allowed shadow-none'
                          : 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-sm'
                    }`}
                  >
                    {isSubmittingIssue ? (
                      <><Loader2 size={16} className="animate-spin" /> Processing...</>
                    ) : isOverStock ? (
                      <>Exceeds Available Stock</>
                    ) : (
                      <><Send size={15} /> Confirm Issue & Save Record</>
                    )}
                  </button>
                </div>
              );
            })()}
          </div>
        </div>
      )}

    </div>
  );
};
