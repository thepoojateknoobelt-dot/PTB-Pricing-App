export type Unit = 'm' | 'cm' | 'mm' | 'ft' | 'in';

export interface Cut {
  id: string;
  orderId: string;
  customerName: string;
  width: number; // in meters (internal base)
  length: number; // in meters (internal base)
  x: number; // position on roll
  y: number; // position on roll
  status: 'planned' | 'completed' | 'scrap';
  color?: string;
  isInventoryCut?: boolean;
}

export interface Roll {
  id: string;
  materialType: string;
  fullWidth: number; // in meters
  fullLength: number; // in meters
  cuts: Cut[];
  totalSqm: number;
  remainingSqm: number;
  isArchived: boolean;
}

export interface Order {
  id: string;
  customerName: string;
  requiredWidth: number;
  requiredLength: number;
  quantity: number;
  materialType: string;
  date: string;
  isInventoryCut?: boolean;
}

export interface OptimizationCandidate {
  rollId: string;
  placement: { x: number; y: number };
  score: number;
  reason: string;
  wastageImpact: number;
}

export interface StockStats {
  totalAvailableSqm: number;
  totalWastageSqm: number;
  efficiency: number;
  activeRolls: number;
}
