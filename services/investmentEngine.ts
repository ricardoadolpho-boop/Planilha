
import { Transaction, TransactionType, Position, Country, MonthlyRealizedGain, Lot, AssetCategory, MatchedLot, RealizedGainDetail, HistoricalPoint, TaxMonthlySummary } from '../types';

export const calculateConsolidatedData = (
  transactions: Transaction[], 
  usdRate: number = 5.0,
  marketPrices: Record<string, { price: number }> = {}
) => {
  const sortedTx = [...transactions].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  
  const positions: Record<string, Position> = {};
  const gainsByMonth: Record<string, number> = {};
  const sellMatches: Record<string, MatchedLot[]> = {};
  const realizedGainDetails: RealizedGainDetail[] = [];
  
  const historicalEquity: HistoricalPoint[] = [];
  const currentQuantities: Record<string, number> = {};
  const lastKnownPrices: Record<string, number> = {};
  let totalInvestedBRL = 0;
  let realizedCashBRL = 0;

  sortedTx.forEach(tx => {
    const key = `${tx.country}:${tx.ticker}:${tx.broker}`;
    const tickerKey = `${tx.country}:${tx.ticker}`;
    
    if (!positions[key]) {
      positions[key] = {
        ticker: tx.ticker,
        broker: tx.broker,
        country: tx.country,
        category: tx.category,
        totalQuantity: 0,
        averagePrice: 0,
        totalInvested: 0,
        totalDividends: 0,
        lots: []
      };
    }

    const pos = positions[key];
    const monthKey = tx.date.substring(0, 7);
    
    lastKnownPrices[tickerKey] = tx.unitPrice;

    if (tx.type === TransactionType.BUY) {
      const totalCost = (pos.totalQuantity * pos.averagePrice) + (tx.quantity * tx.unitPrice) + tx.fees;
      pos.totalQuantity += tx.quantity;
      pos.averagePrice = totalCost / pos.totalQuantity;
      pos.totalInvested = pos.totalQuantity * pos.averagePrice;
      totalInvestedBRL += (tx.quantity * tx.unitPrice + tx.fees) * (tx.country === Country.USA ? usdRate : 1);

      pos.lots.push({
        date: tx.date,
        quantity: tx.quantity,
        originalQuantity: tx.quantity,
        unitPrice: tx.unitPrice,
        fees: tx.fees
      });
    } else if (tx.type === TransactionType.BONUS) {
      pos.totalQuantity += tx.quantity;
      if (pos.totalQuantity > 0) {
        pos.averagePrice = pos.totalInvested / pos.totalQuantity;
      }
      pos.lots.push({ date: tx.date, quantity: tx.quantity, originalQuantity: tx.quantity, unitPrice: 0, fees: 0 });
    } else if (tx.type === TransactionType.SPLIT && tx.splitFrom && tx.splitTo && tx.splitFrom > 0) {
        const ratio = tx.splitTo / tx.splitFrom;
        
        // Ajusta cada lote individualmente
        pos.lots.forEach(lot => {
            lot.unitPrice = lot.unitPrice / ratio;
            lot.quantity = lot.quantity * ratio;
            lot.originalQuantity = lot.originalQuantity * ratio;
        });

        // Recalcula o total da posição. O Custo Total (totalInvested) NÃO MUDA.
        pos.totalQuantity = pos.lots.reduce((sum, lot) => sum + lot.quantity, 0);
        if (pos.totalQuantity > 0) {
          pos.averagePrice = pos.totalInvested / pos.totalQuantity;
        } else {
          pos.averagePrice = 0;
        }

    } else if (tx.type === TransactionType.SELL) {
      let remainingToSell = tx.quantity;
      let totalCostBasisOfSoldUnits = 0;
      const currentMatches: MatchedLot[] = [];
      const lotsCopy = [...pos.lots];
      
      while (remainingToSell > 0 && lotsCopy.length > 0) {
        const currentLot = lotsCopy[0];
        const qtyToConsume = Math.min(remainingToSell, currentLot.quantity);
        const buyFeesPerUnit = currentLot.originalQuantity > 0 ? currentLot.fees / currentLot.originalQuantity : 0;
        const lotCostBasis = qtyToConsume * (currentLot.unitPrice + buyFeesPerUnit);
        
        currentMatches.push({ buyDate: currentLot.date, quantity: qtyToConsume, buyPrice: currentLot.unitPrice, costBasis: lotCostBasis });
        totalCostBasisOfSoldUnits += lotCostBasis;
        currentLot.quantity -= qtyToConsume;
        remainingToSell -= qtyToConsume;
        if (currentLot.quantity <= 0) lotsCopy.shift();
      }
      
      pos.lots = lotsCopy;
      sellMatches[tx.id] = currentMatches;
      const totalProceeds = (tx.quantity * tx.unitPrice) - tx.fees;
      const realizedGain = totalProceeds - totalCostBasisOfSoldUnits;
      
      realizedGainDetails.push({
        id: tx.id, 
        date: tx.date, 
        ticker: tx.ticker, 
        broker: tx.broker, 
        country: tx.country,
        category: tx.category,
        quantity: tx.quantity, 
        sellPrice: tx.unitPrice, 
        costBasis: totalCostBasisOfSoldUnits, 
        gain: realizedGain, 
        month: monthKey
      });

      realizedCashBRL += realizedGain * (tx.country === Country.USA ? usdRate : 1);
      totalInvestedBRL -= totalCostBasisOfSoldUnits * (tx.country === Country.USA ? usdRate : 1);
      pos.totalQuantity -= tx.quantity;
      pos.totalInvested = pos.totalQuantity * pos.averagePrice;
      gainsByMonth[monthKey] = (gainsByMonth[monthKey] || 0) + realizedGain;
    } else if (tx.type === TransactionType.DIVIDEND) {
      const dividendAmount = (tx.quantity * tx.unitPrice) - tx.fees;
      pos.totalDividends += dividendAmount;
      realizedCashBRL += dividendAmount * (tx.country === Country.USA ? usdRate : 1);
    }

    currentQuantities[tickerKey] = (currentQuantities[tickerKey] || 0) + (tx.type === TransactionType.BUY || tx.type === TransactionType.BONUS ? tx.quantity : tx.type === TransactionType.SELL ? -tx.quantity : 0);
    
    let currentEquityValueBRL = realizedCashBRL;
    Object.keys(currentQuantities).forEach(tk => {
      const qty = currentQuantities[tk];
      const price = lastKnownPrices[tk] || 0;
      currentEquityValueBRL += qty * price * (tk.startsWith(Country.USA) ? usdRate : 1);
    });

    historicalEquity.push({ date: tx.date, equity: currentEquityValueBRL, invested: totalInvestedBRL });
  });

  // Cálculo de Impostos (BR)
  const taxSummary: Record<string, TaxMonthlySummary> = {};
  realizedGainDetails.filter(d => d.country === Country.BR).forEach(detail => {
    if (!taxSummary[detail.month]) {
      taxSummary[detail.month] = {
        month: detail.month,
        totalSalesBRL: 0,
        taxableGainBRL: 0,
        taxDueBRL: 0,
        isExempt: false,
        details: []
      };
    }
    const summary = taxSummary[detail.month];
    summary.totalSalesBRL += detail.quantity * detail.sellPrice;
    summary.details.push(detail);
  });

  // Aplicar regras de alíquotas e isenção (Stocks BR)
  Object.values(taxSummary).forEach(summary => {
    let stockGain = 0;
    let fiiGain = 0;

    summary.details.forEach(d => {
      if (d.category === AssetCategory.FII) {
        fiiGain += d.gain;
      } else {
        stockGain += d.gain;
      }
    });

    // Isenção 20k para Ações (Swing Trade)
    const isExempt = summary.totalSalesBRL <= 20000;
    summary.isExempt = isExempt;

    const stockTax = (!isExempt && stockGain > 0) ? stockGain * 0.15 : 0;
    const fiiTax = fiiGain > 0 ? fiiGain * 0.20 : 0;

    summary.taxableGainBRL = (isExempt ? 0 : Math.max(0, stockGain)) + Math.max(0, fiiGain);
    summary.taxDueBRL = stockTax + fiiTax;
  });

  const activePositions = Object.values(positions).filter(p => p.totalQuantity > 0 || p.totalDividends > 0);
  const realizedGainsArray = Object.entries(gainsByMonth).map(([month, gain]) => ({ month, gain })).sort((a, b) => b.month.localeCompare(a.month));

  return { 
    activePositions, 
    realizedGains: realizedGainsArray, 
    sellMatches, 
    realizedGainDetails, 
    historicalEquity,
    taxReport: Object.values(taxSummary).sort((a,b) => b.month.localeCompare(a.month))
  };
};