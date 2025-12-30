export enum Country {
  BR = 'BR',
  USA = 'EUA'
}

export enum AssetCategory {
  VARIABLE = 'Renda Variável',
  FIXED = 'Renda Fixa',
  FII = 'Fundo Imobiliário'
}

export enum TransactionType {
  BUY = 'Compra',
  SELL = 'Venda',
  DIVIDEND = 'Dividendo',
  BONUS = 'Bonificação',
  SPLIT = 'Desdobramento/Grupamento',
  REDEMPTION = 'Resgate'
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
  maturityDate?: string;
  interestRate?: number;
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
  maturityDate?: string;
  interestRate?: number;
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

// Proventos Anunciados com tipo para cálculo de imposto
export interface AnnouncedDividend {
  id: string;
  ticker: string;
  country: Country;
  exDate: string; // Data "Com"
  paymentDate: string; // Data de Pagamento
  amountPerShare: number; // Valor BRUTO por cota/ação
  dividendType: 'DIVIDEND' | 'JCP'; // Tipo para regras fiscais
}
