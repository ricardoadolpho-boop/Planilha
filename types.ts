
export enum Country {
  BR = 'BR',
  USA = 'EUA'
}

export enum AssetCategory {
  VARIABLE = 'Renda Variável',
  FIXED = 'Renda Fria',
  FII = 'Fundo Imobiliário'
}

export enum TransactionType {
  BUY = 'Compra',
  SELL = 'Venda',
  DIVIDEND = 'Dividendo',
  BONUS = 'Bonificação',
  SPLIT = 'Desdobramento/Grupamento'
}

export interface Transaction {
  id: string;
  date: string;
  ticker: string;
  broker: string;
  country: Country;
  category: AssetCategory;
  type: TransactionType;
  quantity: number;
  unitPrice: number;
  fees: number;
  splitFrom?: number;
  splitTo?: number;
}

export interface Lot {
  date: string;
  quantity: number;
  unitPrice: number;
  fees: number;
  originalQuantity: number;
}

export interface MatchedLot {
  buyDate: string;
  quantity: number;
  buyPrice: number;
  costBasis: number;
}

export interface Position {
  ticker: string;
  broker: string;
  country: Country;
  category: AssetCategory;
  totalQuantity: number;
  averagePrice: number;
  totalInvested: number;
  totalDividends: number;
  lots: Lot[];
  currentPrice?: number;
}

export interface MonthlyRealizedGain {
  month: string;
  gain: number;
}

export interface RealizedGainDetail {
  id: string;
  date: string;
  ticker: string;
  broker: string;
  country: Country;
  category: AssetCategory;
  quantity: number;
  sellPrice: number;
  costBasis: number;
  gain: number;
  month: string;
}

export interface TaxMonthlySummary {
  month: string;
  totalSalesBRL: number;
  taxableGainBRL: number;
  taxDueBRL: number;
  isExempt: boolean;
  details: RealizedGainDetail[];
}

export interface HistoricalPoint {
  date: string;
  equity: number;
  invested: number;
}