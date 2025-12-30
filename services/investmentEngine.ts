import { Transaction, TransactionType, Position, Country, AssetCategory, MatchedLot, RealizedGainDetail, HistoricalPoint, TaxMonthlySummary } from '../types';

const EPSILON = 0.00000001;

export const calculateConsolidatedData = (
  transactions: Transaction[], 
  usdRate: number = 5.0
) => {
  // Ordenação cronológica garantida
  const sortedTx = [...transactions].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  
  const positions: Record<string, Position> = {};
  const gainsByMonth: Record<string, number> = {};
  const sellMatches: Record<string, MatchedLot[]> = {};
  const realizedGainDetails: RealizedGainDetail[] = [];
  
  const historicalEquity: HistoricalPoint[] = [];
  const currentQuantities: Record<string, number> = {};
  const lastKnownPrices: Record<string, number> = {};
  
  // Variáveis de estado global da carteira
  let totalInvestedBRL = 0;
  let accumulatedRealizedGainBRL = 0; // Acumula apenas o LUCRO realizado, não o caixa total

  sortedTx.forEach(tx => {
    // Chave única para posição (País:Ticker:Corretora)
    const key = `${tx.country}:${tx.ticker}:${tx.broker}`;
    const tickerKey = `${tx.country}:${tx.ticker}`;
    
    // Inicializa posição se não existir
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
        lots: [],
        maturityDate: tx.maturityDate,
        interestRate: tx.interestRate
      };
    }

    const pos = positions[key];
    const monthKey = tx.date.substring(0, 7);
    
    // Rastreia preço para cálculo histórico de patrimônio
    lastKnownPrices[tickerKey] = tx.unitPrice;

    // --- LÓGICA DE COMPRA ---
    if (tx.type === TransactionType.BUY) {
      // Custo total da operação (inclui taxas)
      const operationCost = (tx.quantity * tx.unitPrice) + tx.fees;
      
      // Atualiza PM e Quantidade
      const previousCost = pos.totalQuantity * pos.averagePrice;
      pos.totalQuantity += tx.quantity;
      
      if (pos.totalQuantity > EPSILON) {
        pos.averagePrice = (previousCost + operationCost) / pos.totalQuantity;
      }
      
      pos.totalInvested = pos.totalQuantity * pos.averagePrice;
      
      // Atualiza global
      totalInvestedBRL += operationCost * (tx.country === Country.USA ? usdRate : 1);

      // Dados de Renda Fixa
      if (tx.category === AssetCategory.FIXED) {
        pos.maturityDate = tx.maturityDate;
        pos.interestRate = tx.interestRate;
      }

      // Adiciona Lote (FIFO)
      pos.lots.push({
        date: tx.date,
        quantity: tx.quantity,
        originalQuantity: tx.quantity,
        unitPrice: tx.unitPrice,
        fees: tx.fees
      });

    // --- LÓGICA DE BONIFICAÇÃO (Custo Zero) ---
    } else if (tx.type === TransactionType.BONUS) {
      pos.totalQuantity += tx.quantity;
      // Preço Médio cai pois aumentou qtd sem aumentar custo
      if (pos.totalQuantity > EPSILON) {
        pos.averagePrice = pos.totalInvested / pos.totalQuantity;
      }
      pos.lots.push({ date: tx.date, quantity: tx.quantity, originalQuantity: tx.quantity, unitPrice: 0, fees: 0 });

    // --- LÓGICA DE DESDOBRAMENTO (Split) ---
    } else if (tx.type === TransactionType.SPLIT && tx.splitFrom && tx.splitTo && tx.splitFrom > 0) {
        const ratio = tx.splitTo / tx.splitFrom;
        
        // Ajusta todos os lotes
        pos.lots.forEach(lot => {
            lot.unitPrice = lot.unitPrice / ratio;
            lot.quantity = lot.quantity * ratio;
            lot.originalQuantity = lot.originalQuantity * ratio;
        });

        // Recalcula totais
        pos.totalQuantity = pos.lots.reduce((sum, lot) => sum + lot.quantity, 0);
        if (pos.totalQuantity > EPSILON) {
          pos.averagePrice = pos.totalInvested / pos.totalQuantity;
        } else {
          pos.averagePrice = 0;
        }

    // --- LÓGICA DE VENDA (FIFO) ---
    } else if (tx.type === TransactionType.SELL || tx.type === TransactionType.REDEMPTION) {
      let remainingToSell = tx.quantity;
      let totalCostBasisOfSoldUnits = 0;
      const currentMatches: MatchedLot[] = [];
      
      // Deep copy dos lotes para evitar mutação direta antes da confirmação
      // (Embora aqui estejamos processando linearmente, é boa prática)
      const lotsCopy = [...pos.lots];
      
      while (remainingToSell > EPSILON && lotsCopy.length > 0) {
        const currentLot = lotsCopy[0];
        
        // Quanto consumir deste lote?
        const qtyToConsume = Math.min(remainingToSell, currentLot.quantity);
        
        // Custo proporcional (Preço + Taxas originais proporcionais)
        const buyFeesPerUnit = currentLot.originalQuantity > 0 ? currentLot.fees / currentLot.originalQuantity : 0;
        const lotCostBasis = qtyToConsume * (currentLot.unitPrice + buyFeesPerUnit);
        
        currentMatches.push({ 
          buyDate: currentLot.date, 
          quantity: qtyToConsume, 
          buyPrice: currentLot.unitPrice, 
          costBasis: lotCostBasis 
        });
        
        totalCostBasisOfSoldUnits += lotCostBasis;
        currentLot.quantity -= qtyToConsume;
        remainingToSell -= qtyToConsume;
        
        // Remove lote se esgotado
        if (currentLot.quantity <= EPSILON) lotsCopy.shift();
      }
      
      pos.lots = lotsCopy;
      sellMatches[tx.id] = currentMatches;

      // Cálculo do Lucro
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

      // Atualiza globais
      const currencyMultiplier = tx.country === Country.USA ? usdRate : 1;
      accumulatedRealizedGainBRL += realizedGain * currencyMultiplier;
      totalInvestedBRL -= totalCostBasisOfSoldUnits * currencyMultiplier;
      
      // Atualiza posição
      pos.totalQuantity -= tx.quantity;
      pos.totalInvested -= totalCostBasisOfSoldUnits;

      // Limpeza de resíduos de ponto flutuante
      if (Math.abs(pos.totalQuantity) < EPSILON) {
          pos.totalQuantity = 0;
          pos.totalInvested = 0;
          pos.averagePrice = 0;
      } else {
          pos.averagePrice = pos.totalInvested / pos.totalQuantity;
      }

      gainsByMonth[monthKey] = (gainsByMonth[monthKey] || 0) + realizedGain;

    // --- LÓGICA DE DIVIDENDOS ---
    } else if (tx.type === TransactionType.DIVIDEND) {
      const dividendAmount = (tx.quantity * tx.unitPrice) - tx.fees;
      pos.totalDividends += dividendAmount;
      // Dividendos entram como "Ganho Realizado" para fins de curva de patrimônio
      accumulatedRealizedGainBRL += dividendAmount * (tx.country === Country.USA ? usdRate : 1);
    }

    // --- CURVA DE PATRIMÔNIO (Mark-to-Market Histórico) ---
    // Rastreia a quantidade atual do ativo neste ponto do tempo
    const qChange = (tx.type === TransactionType.BUY || tx.type === TransactionType.BONUS) ? tx.quantity : 
                    (tx.type === TransactionType.SELL || tx.type === TransactionType.REDEMPTION) ? -tx.quantity : 0;
    
    currentQuantities[tickerKey] = (currentQuantities[tickerKey] || 0) + qChange;
    
    // Calcula Equity Total neste dia
    // Equity = (Caixa Gerado/Lucro Realizado) + (Valor de Mercado das Posições Atuais)
    
    // Ajuste Mark-to-Market: Recalcula valor das posições com preço conhecido no momento da tx
    let marketValueBRL = 0;
    Object.keys(currentQuantities).forEach(tk => {
      const qty = currentQuantities[tk];
      if (qty > EPSILON) {
        const price = lastKnownPrices[tk] || 0;
        marketValueBRL += qty * price * (tk.startsWith(Country.USA) ? usdRate : 1);
      }
    });

    // O patrimônio é: O que realizei de lucro (caixa) + O que tenho investido hoje (Investido Original) + (Valor Mercado - Investido Original = Lucro Não Realizado)
    // Simplificando para visualização
    const equityPoint = marketValueBRL + accumulatedRealizedGainBRL; 

    // Apenas adiciona ponto se for uma data nova ou última transação do dia
    const lastPoint = historicalEquity[historicalEquity.length - 1];
    if (!lastPoint || lastPoint.date !== tx.date) {
        historicalEquity.push({ date: tx.date, equity: equityPoint, invested: totalInvestedBRL });
    } else {
        // Atualiza o ponto existente do mesmo dia
        lastPoint.equity = equityPoint;
        lastPoint.invested = totalInvestedBRL;
    }
  });

  // --- CÁLCULO FISCAL (BRASIL) ---
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
    
    // Soma vendas para regra de isenção (exceto FII e Renda Fixa que não tem isenção de 20k)
    if (detail.category === AssetCategory.VARIABLE) {
      summary.totalSalesBRL += detail.quantity * detail.sellPrice;
    }
    summary.details.push(detail);
  });

  Object.values(taxSummary).forEach(summary => {
    let stockGain = 0;
    let fiiGain = 0;
    let fixedIncomeGain = 0;

    summary.details.forEach(d => {
      if (d.category === AssetCategory.FII) {
        fiiGain += d.gain;
      } else if (d.category === AssetCategory.FIXED) {
        fixedIncomeGain += d.gain;
      } else {
        stockGain += d.gain;
      }
    });

    // Regra de Isenção 20k (Apenas Ações/Swing Trade)
    const isExempt = summary.totalSalesBRL <= 20000;
    summary.isExempt = isExempt;

    // Cálculo Imposto
    const stockTax = (!isExempt && stockGain > 0) ? stockGain * 0.15 : 0;
    const fiiTax = fiiGain > 0 ? fiiGain * 0.20 : 0;
    
    // Renda Fixa geralmente é retido na fonte, mas calculamos para visualização
    // Tabela regressiva simplificada para 15% para fins de estimativa
    const fixedIncomeTax = fixedIncomeGain > 0 ? fixedIncomeGain * 0.15 : 0; 

    // Base de cálculo (Lucros tributáveis)
    // Se isento, stockGain é ignorado para base tributável, mas fiiGain e fixed sempre contam
    summary.taxableGainBRL = (isExempt ? 0 : Math.max(0, stockGain)) + Math.max(0, fiiGain) + Math.max(0, fixedIncomeGain);
    
    summary.taxDueBRL = stockTax + fiiTax + fixedIncomeTax;
  });

  // Filtragem final de posições ativas
  const activePositions = Object.values(positions)
    .filter(p => p.totalQuantity > EPSILON || p.totalDividends > EPSILON)
    .sort((a, b) => b.totalInvested - a.totalInvested);

  const realizedGainsArray = Object.entries(gainsByMonth)
    .map(([month, gain]) => ({ month, gain }))
    .sort((a, b) => b.month.localeCompare(a.month));

  return { 
    activePositions, 
    realizedGains: realizedGainsArray, 
    sellMatches, 
    realizedGainDetails, 
    historicalEquity,
    taxReport: Object.values(taxSummary).sort((a,b) => b.month.localeCompare(a.month))
  };
};
