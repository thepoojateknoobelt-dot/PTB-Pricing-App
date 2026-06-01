export type UserRole = 'admin' | 'sales';

export interface User {
  id: string;
  username: string;
  name: string;
  role: UserRole;
  password?: string;
  permission?: 'read' | 'write';
}

export interface Rates {
  mesh: number;
  fep: number;
  thread: number;
  pin: number;
  packing: number;
}


export interface Constants {
  purchaseGst: number;
  fixCost: number;
  defaultProfit: number;
  saleGst: number;
}

export interface JointType {
  name: string;
  rate: number;
  multiplier: number; // For distance (e.g. 2 * width)
}

export interface TapeType {
  name: string;
  rate: number;
}

export interface BOMItem {
  id: string;
  name: string;
  rate: number;
  unit: string;
  formula: string;
  isLocked?: boolean;
  options?: { name: string, rate: number, unit?: string }[];
}

export interface BeltStyle {
  id: string;
  name: string;
  bom: BOMItem[];
}

export interface BeltType {
  id: string;
  name: string;
  styles: BeltStyle[];
  fixCost?: number;
}

export interface Config {
  rates: Rates;
  constants: Constants;
  beltTypes: BeltType[];
  jointTypes: JointType[];
  tapeTypes: TapeType[];
  units: { id: string; label: string; value: string }[];
  awsServerUrl?: string;
  beltCutProUrl?: string;
}


export interface ProfitRange {
  minLength: number;
  maxLength: number | null;
  margin: number;
}

export interface Client {
  id: string;
  name: string;
  company: string;
  city: string;
  profitMargins: Record<string, ProfitRange[]>; // beltType -> ranges
}

export interface Quotation {
  id: string;
  clientId: string;
  clientName: string;
  beltType: string;
  dimensions: {
    length: number;
    width: number;
    unit?: 'mm' | 'ft' | 'mtr' | 'in';
    lengthUnit?: string;
    widthUnit?: string;
  };
  jointType: string;
  tapeType: string;
  totalCost: number;
  status: 'draft' | 'pending_approval' | 'approved' | 'rejected' | 'order';
  discountRequested?: number;
  discountReason?: string;
  rejectionReason?: string;
  createdBy: string;
  createdAt: any;
  updatedAt: any;
  auditLogs: AuditLog[];
}

export interface AuditLog {
  timestamp: any;
  userId: string;
  userName: string;
  action: string;
  details: string;
}
