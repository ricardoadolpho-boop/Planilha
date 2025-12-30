import React, { useState, useMemo } from 'react';
import { Transaction, Position, TransactionType, Country, MatchedLot, AssetCategory } from '../types';
import { MarketPrice } from '../services/geminiService';

interface Props {
  ticker: string;
  transactions: Transaction[];
  position: Position | undefined;
  onBack: () => void;
  sellMatches: Record<string, MatchedLot[]>;
  marketPrice: MarketPrice | undefined;
  usdRate: number;
  onManualUpdate: (ticker: string, price: number) => void;
}

const AssetDetailView: React.FC<Props> = ({ ticker, transactions, position, onBack, sellMatches, marketPrice, usdRate, onManualUpdate }) => {
  const [expandedRow, setExpandedRow] = useState<string | null>(null);
  
  // Memoize transaction list to prevent re-sorting on every render
  const assetTx = useMemo(() => {
    return transactions
      .filter(t => t.ticker === ticker)
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  }, [transactions, ticker]);

  const country = position?.country || Country.BR;
  const isUS = country === Country.USA;
  const isFixedIncome = position?.category === AssetCategory.FIXED;

  const currentVal = marketPrice?.price || position?.averagePrice || 0;
  const unrealizedReturn = position?.averagePrice ? ((currentVal - position.averagePrice) / position.averagePrice) * 100 : 0;
  
  const totalInvested = position?.totalInvested || 0;
  const totalDividends = position?.totalDividends || 0;
  const yieldOnCost = totalInvested > 0 ? (totalDividends / totalInvested) * 100 : 0;

  // --- Formatters ---
  const formatCurrency = (val: number) => 
    new Intl.NumberFormat(isUS ? 'en-US' : 'pt-BR', { style: 'currency', currency: isUS ? 'USD' : 'BRL' }).format(val);
  
  const formatBRL = (val: number) => 
    new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val);

  const getTagStyle = (type: TransactionType) => {
    const styles = {
      [TransactionType.BUY]: 'bg-indigo-100 text-indigo-700',
      [TransactionType.SELL]: 'bg-rose-100 text-rose-700',
      [TransactionType.DIVIDEND]: 'bg-amber-100 text-amber-700',
      [TransactionType.BONUS]: 'bg-purple-100 text-purple-700',
      [TransactionType.SPLIT]: 'bg-cyan-100 text-cyan-700',
      [TransactionType.REDEMPTION]: 'bg-lime-100 text-lime-700'
    };
    return styles[type] || 'bg-slate-100 text-slate-700';
  };

  const handleEditPrice = () => {
    const newPriceStr = window.prompt(`Digite o preço atual para ${ticker}:`, currentVal.toString());
    if (newPriceStr) {
      const newPrice = parseFloat(newPriceStr.replace(',', '.'));
      if (!isNaN(newPrice)) {
        onManualUpdate(ticker, newPrice);
      }
    }
  };

  // --- Render Helpers ---
  const renderCard = (label: string, value: React.ReactNode, subtext?: string, accentColor?: string) => (
    <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex flex-col justify-between">
      <div>
        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">{label}</p>
        <div className={`text-xl font-bold ${accentColor || 'text-slate-900'}`}>{value}</div>
      </div>
      {subtext && <p className="text-xs text-slate-500 mt-2">{subtext}</p>}
    </div>
  );

  let runningQty = 0;

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
      {/* Header */}
      <div className="flex items-center gap-4 mb-2">
        <button onClick={onBack} className="p-2 hover:bg-slate-200 rounded-full transition-colors text-slate-600">
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 19l-7-7m0 0l7-7m-7 7h18" /></svg>
        </button>
        <div>
          <h2 className="text-2xl font-black text-slate-900 flex items-center gap-3">
            {ticker} 
            <span className="text-[10px] px-2 py-1 rounded bg-slate-900 text-white font-bold uppercase tracking-widest">
              {isFixedIncome ? 'RENDA FIXA' : (isUS ? 'EUA (USD)' : 'BRASIL (BRL)')}
            </span>
            {marketPrice && !isFixedIncome && (
              <span className={`text-sm px-2 py-0.5 rounded font-bold ${marketPrice.changePercent >= 0 ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'}`}>
                {marketPrice.changePercent >= 0 ? '▲' : '▼'} {Math.abs(marketPrice.changePercent).toFixed(2)}%
              </span>
            )}
          </h2>
          <p className="text-slate-500 text-sm">Auditoria completa com rastreamento de lotes FIFO/Custo Médio.</p>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {isFixedIncome ? (
          <>
            {renderCard("Valor Investido", formatCurrency(totalInvested), `${position?.totalQuantity.toFixed(2)} títulos`, "text-indigo-600")}
            {renderCard("Juros Recebidos", formatCurrency(totalDividends), "Total acumulado", "text-amber-600")}
            {renderCard("Taxa Contratada", `${position?.interestRate?.toFixed(2) || '- '}%`, "Ao ano")}
            {renderCard("Vencimento", position?.maturityDate ? new Date(position.maturityDate + 'T00:00:00').toLocaleDateString() : '-')}
          </>
        ) : (
          <>
            <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm relative group">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Preço Atual / Médio</p>
              <div className="flex items-baseline gap-2">
                <h3 className="text-xl font-bold text-slate-900">{formatCurrency(currentVal)}</h3>
                {isUS && <span className="text-sm font-medium text-slate-400">({formatBRL(currentVal * usdRate)})</span>}
                <button onClick={handleEditPrice} className="opacity-0 group-hover:opacity-100 transition-opacity p-1 text-slate-400 hover:text-indigo-600" title="Editar preço manualmente">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
                </button>
              </div>
              <p className="text-xs text-slate-500 mt-1">PM: {formatCurrency(position?.averagePrice || 0)}</p>
            </div>

            {renderCard("Retorno de Capital", 
              <span className={unrealizedReturn >= 0 ? 'text-emerald-600' : 'text-rose-600'}>
                {unrealizedReturn >= 0 ? '+' : ''}{unrealizedReturn.toFixed(2)}%
              </span>, 
              "Variação da Cota"
            )}

            {renderCard("Yield on Cost (YoC)", `${yieldOnCost.toFixed(2)}%`, "Div. / Investido", "text-amber-500")}
            
            <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
               <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Posição Total</p>
               <h3 className="text-xl font-bold text-indigo-600">{formatCurrency((position?.totalQuantity || 0) * currentVal)}</h3>
               {isUS && <p className="text-xs text-slate-500 mt-1">{formatBRL(((position?.totalQuantity || 0) * currentVal) * usdRate)}</p>}
            </div>
          </>
        )}
      </div>

      {/* Transaction Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-4 border-b border-slate-100 bg-slate-50 flex justify-between items-center">
           <h4 className="font-bold text-slate-800">Timeline de Transações</h4>
           <div className="flex items-center gap-2 text-[10px] text-slate-500 italic">
             <span className="w-2 h-2 rounded-full bg-indigo-500"></span>
             Auditoria FIFO ativa nas vendas
           </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm border-separate border-spacing-0">
            <thead className="bg-slate-50 text-slate-400 uppercase text-[10px] font-bold tracking-widest sticky top-0">
              <tr>
                <th className="px-6 py-4 border-b border-slate-100">Data</th>
                <th className="px-6 py-4 border-b border-slate-100">Corretora</th>
                <th className="px-6 py-4 border-b border-slate-100">Operação</th>
                <th className="px-6 py-4 border-b border-slate-100">Qtd</th>
                <th className="px-6 py-4 border-b border-slate-100">Saldo</th>
                <th className="px-6 py-4 border-b border-slate-100 text-right">Preço</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {assetTx.map((tx) => {
                // Calculate Running Balance on the fly
                if (tx.type === TransactionType.BUY || tx.type === TransactionType.BONUS) runningQty += tx.quantity;
                if (tx.type === TransactionType.SELL || tx.type === TransactionType.REDEMPTION) runningQty -= tx.quantity;
                if (tx.type === TransactionType.SPLIT && tx.splitFrom && tx.splitTo) runningQty = runningQty * (tx.splitTo / tx.splitFrom);
                
                const isSell = tx.type === TransactionType.SELL || tx.type === TransactionType.REDEMPTION;
                const matches = sellMatches[tx.id] || [];
                const isExpanded = expandedRow === tx.id;

                return (
                  <React.Fragment key={tx.id}>
                    <tr 
                      onClick={() => isSell ? setExpandedRow(isExpanded ? null : tx.id) : null}
                      className={`transition-colors ${isSell ? 'cursor-pointer hover:bg-indigo-50/50' : 'hover:bg-slate-50/30'} ${isExpanded ? 'bg-indigo-50/80' : ''}`}
                    >
                      <td className="px-6 py-4 flex items-center gap-2">
                        {isSell && <svg className={`w-3 h-3 text-indigo-500 transition-transform ${isExpanded ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M19 9l-7 7-7-7" /></svg>}
                        <span className="font-mono text-slate-500">{tx.date}</span>
                      </td>
                      <td className="px-6 py-4 text-slate-500 font-medium">{tx.broker}</td>
                      <td className="px-6 py-4">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${getTagStyle(tx.type)}`}>{tx.type}</span>
                      </td>
                      <td className="px-6 py-4 font-mono text-slate-700">
                        {tx.type === TransactionType.SPLIT ? `${tx.splitFrom}:${tx.splitTo}` : (tx.type !== TransactionType.DIVIDEND ? tx.quantity.toFixed(4) : '-')}
                      </td>
                      <td className="px-6 py-4 text-slate-400 italic font-mono">{tx.type !== TransactionType.DIVIDEND ? runningQty.toFixed(4) : '-'}</td>
                      <td className="px-6 py-4 text-right font-bold text-slate-900">
                        {tx.type === TransactionType.SPLIT || tx.type === TransactionType.BONUS ? '-' : formatCurrency(tx.unitPrice)}
                      </td>
                    </tr>
                    
                    {isExpanded && isSell && (
                      <tr className="bg-indigo-50/20">
                        <td colSpan={6} className="px-6 py-4">
                          <div className="ml-4 border-l-4 border-indigo-400 pl-6 py-2">
                            <h5 className="text-[11px] font-black text-indigo-700 uppercase tracking-widest mb-3">Auditoria de Lucro (FIFO)</h5>
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                              {matches.map((match, idx) => {
                                const profit = (tx.unitPrice - match.buyPrice) * match.quantity;
                                return (
                                  <div key={idx} className="bg-white border border-slate-200 rounded-lg p-3 shadow-sm relative overflow-hidden">
                                    <div className={`absolute left-0 top-0 bottom-0 w-1 ${profit >= 0 ? 'bg-emerald-500' : 'bg-rose-500'}`}></div>
                                    <div className="flex justify-between text-[10px] uppercase font-bold text-slate-400 mb-1">
                                      <span>Lote {match.buyDate}</span>
                                      <span>Qtd: {match.quantity}</span>
                                    </div>
                                    <div className="flex justify-between items-end">
                                      <div className="text-xs">
                                        <div className="text-slate-500">Compra: {formatCurrency(match.buyPrice)}</div>
                                        <div className="text-slate-500">Venda: {formatCurrency(tx.unitPrice)}</div>
                                      </div>
                                      <div className={`font-black ${profit >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                                        {profit >= 0 ? '+' : ''}{formatCurrency(profit)}
                                      </div>
                                    </div>
                                  </div>
                                )
                              })}
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default AssetDetailView;
