import React, { useState } from 'react';
import { Transaction, Position, TransactionType, Country, MatchedLot } from '../types';
import { MarketPrice } from '../services/geminiService';

interface Props {
  ticker: string;
  transactions: Transaction[];
  position: Position | undefined;
  onBack: () => void;
  sellMatches: Record<string, MatchedLot[]>;
  marketPrice: MarketPrice | undefined;
  usdRate: number;
}

const AssetDetailView: React.FC<Props> = ({ ticker, transactions, position, onBack, sellMatches, marketPrice, usdRate }) => {
  const [expandedRow, setExpandedRow] = useState<string | null>(null);
  
  const assetTx = transactions
    .filter(t => t.ticker === ticker)
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  const country = position?.country || Country.BR;
  const isUS = country === Country.USA;

  const currentVal = marketPrice?.price || position?.averagePrice || 0;
  const unrealizedReturn = position?.averagePrice ? ((currentVal - position.averagePrice) / position.averagePrice) * 100 : 0;

  // Engineering Metrics
  const totalInvested = position?.totalInvested || 0;
  const totalDividends = position?.totalDividends || 0;
  const yieldOnCost = totalInvested > 0 ? (totalDividends / totalInvested) * 100 : 0;

  const formatValue = (val: number) => {
    if (isUS) {
      return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(val);
    }
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val);
  };
  
  const formatBRL = (val: number) => {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val);
  };

  const getTagStyle = (type: TransactionType) => {
    switch(type) {
      case TransactionType.BUY: return 'bg-indigo-100 text-indigo-700';
      case TransactionType.SELL: return 'bg-rose-100 text-rose-700';
      case TransactionType.DIVIDEND: return 'bg-amber-100 text-amber-700';
      case TransactionType.BONUS: return 'bg-purple-100 text-purple-700';
      case TransactionType.SPLIT: return 'bg-cyan-100 text-cyan-700';
      default: return 'bg-slate-100 text-slate-700';
    }
  };

  let runningQty = 0;

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
      <div className="flex items-center gap-4 mb-2">
        <button 
          onClick={onBack}
          className="p-2 hover:bg-slate-200 rounded-full transition-colors text-slate-600"
          title="Voltar"
        >
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
          </svg>
        </button>
        <div>
          <h2 className="text-2xl font-black text-slate-900 flex items-center gap-3">
            {ticker} 
            <span className={`text-[10px] px-2 py-1 rounded bg-slate-900 text-white font-bold uppercase tracking-widest`}>
              {isUS ? 'ATIVO EUA (US$)' : 'ATIVO BRASIL (R$)'}
            </span>
            {marketPrice && (
              <span className={`text-sm px-2 py-0.5 rounded font-bold ${marketPrice.changePercent >= 0 ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'}`}>
                {marketPrice.changePercent >= 0 ? '▲' : '▼'} {Math.abs(marketPrice.changePercent).toFixed(2)}%
              </span>
            )}
          </h2>
          <p className="text-slate-500 text-sm">Auditoria completa com rastreamento de lotes FIFO/Custo Médio.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Preço Atual / Médio</p>
          <div className="flex items-baseline gap-2">
            <h3 className="text-xl font-bold text-slate-900">
              {formatValue(currentVal)}
              {isUS && <span className="text-sm font-medium text-slate-400">({formatBRL(currentVal * usdRate)})</span>}
            </h3>
            <span className="text-slate-400">/</span>
            <span className="text-base text-slate-500">
              {formatValue(position?.averagePrice || 0)}
            </span>
          </div>
          <p className="text-[10px] text-slate-400 mt-1">Cotação Atual vs PM</p>
        </div>
        
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Retorno de Capital</p>
          <div className="flex items-baseline gap-2">
            <h3 className={`text-xl font-black ${unrealizedReturn >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
              {unrealizedReturn >= 0 ? '+' : ''}{unrealizedReturn.toFixed(2)}%
            </h3>
          </div>
          <p className="text-[10px] text-slate-400 font-medium uppercase mt-1">Variação da Cota</p>
        </div>

        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm relative overflow-hidden group">
          <div className="absolute top-0 right-0 p-2 opacity-10 group-hover:opacity-20 transition-opacity">
            <svg className="w-12 h-12 text-amber-500" fill="currentColor" viewBox="0 0 20 20"><path d="M10 2a6 6 0 00-6 6v3.586l-.707.707A1 1 0 004 14h12a1 1 0 00.707-1.707L16 11.586V8a6 6 0 00-6-6zM10 18a3 3 0 01-3-3h6a3 3 0 01-3 3z"/></svg>
          </div>
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Yield on Cost (YoC)</p>
          <h3 className="text-xl font-black text-amber-500">
            {yieldOnCost.toFixed(2)}%
          </h3>
          <p className="text-xs text-slate-500 mt-1">
             Div. Recebidos / Total Investido
          </p>
        </div>

        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Posição Total</p>
          <h3 className="text-xl font-bold text-indigo-600">
            {formatValue( (position?.totalQuantity || 0) * currentVal )}
            {isUS && <span className="text-base font-medium text-slate-400 ml-2">({formatBRL( ((position?.totalQuantity || 0) * currentVal) * usdRate )})</span>}
          </h3>
          <p className="text-xs text-slate-500 mt-1">{position?.totalQuantity.toFixed(2)} unidades</p>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-4 border-b border-slate-100 bg-slate-50 flex justify-between items-center">
           <h4 className="font-bold text-slate-800">Timeline de Transações</h4>
           <div className="flex items-center gap-2">
             <span className="w-2 h-2 rounded-full bg-indigo-500"></span>
             <span className="text-[10px] font-medium text-slate-500 uppercase italic">Toque nas vendas para auditoria FIFO</span>
           </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm border-separate border-spacing-0">
            <thead className="bg-slate-50 text-slate-400 uppercase text-[10px] font-bold tracking-widest sticky top-0">
              <tr>
                <th className="px-6 py-4 border-b border-slate-100">Data</th>
                <th className="px-6 py-4 border-b border-slate-100">Corretora</th>
                <th className="px-6 py-4 border-b border-slate-100">Operação</th>
                <th className="px-6 py-4 border-b border-slate-100">Qtd/Proporção</th>
                <th className="px-6 py-4 border-b border-slate-100">Saldo</th>
                <th className="px-6 py-4 border-b border-slate-100 text-right">Preço</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {assetTx.map((tx) => {
                if (tx.type === TransactionType.BUY || tx.type === TransactionType.BONUS) runningQty += tx.quantity;
                if (tx.type === TransactionType.SELL) runningQty -= tx.quantity;
                if (tx.type === TransactionType.SPLIT && tx.splitFrom && tx.splitTo && tx.splitFrom > 0) {
                    runningQty = runningQty * (tx.splitTo / tx.splitFrom);
                }
                
                const isSell = tx.type === TransactionType.SELL;
                const matches = sellMatches[tx.id] || [];
                const isExpanded = expandedRow === tx.id;

                return (
                  <React.Fragment key={tx.id}>
                    <tr 
                      onClick={() => isSell ? setExpandedRow(isExpanded ? null : tx.id) : null}
                      className={`transition-all ${isSell ? 'cursor-pointer hover:bg-indigo-50/50' : 'hover:bg-slate-50/30'} ${isExpanded ? 'bg-indigo-50/80' : ''}`}
                    >
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                          {isSell && (
                            <svg className={`w-3 h-3 text-indigo-500 transition-transform ${isExpanded ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M19 9l-7 7-7-7" />
                            </svg>
                          )}
                          <span className={`font-mono ${isExpanded ? 'text-indigo-900 font-bold' : 'text-slate-500'}`}>{tx.date}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-slate-500 font-medium">{tx.broker}</td>
                      <td className="px-6 py-4">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${getTagStyle(tx.type)}`}>
                          {tx.type}
                        </span>
                      </td>
                      <td className="px-6 py-4 font-medium text-slate-700">
                        {tx.type === TransactionType.SPLIT ? `${tx.splitFrom} : ${tx.splitTo}` : (tx.type !== TransactionType.DIVIDEND ? tx.quantity.toFixed(2) : '-')}
                      </td>
                      <td className="px-6 py-4 text-slate-400 italic">
                        {tx.type !== TransactionType.DIVIDEND ? runningQty.toFixed(2) : '-'}
                      </td>
                      <td className="px-6 py-4 text-right font-bold text-slate-900">
                        {tx.type === TransactionType.SPLIT || tx.type === TransactionType.BONUS ? '-' : formatValue(tx.unitPrice)}
                      </td>
                    </tr>
                    
                    {isExpanded && isSell && (
                      <tr className="bg-indigo-50/20 animate-in slide-in-from-top-1 duration-200">
                        <td colSpan={6} className="px-6 py-4">
                          <div className="ml-4 border-l-4 border-indigo-400 pl-6 py-2">
                            <div className="flex justify-between items-center mb-4">
                              <h5 className="text-[11px] font-black text-indigo-700 uppercase tracking-widest flex items-center gap-2">
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 00-2-2M9 5a2 2 0 012-2h2a2 2 0 012 2" /></svg>
                                Composição do Lucro Realizado (FIFO)
                              </h5>
                              <div className="text-[10px] font-bold text-indigo-400 bg-indigo-50 px-2 py-1 rounded border border-indigo-100">
                                Preço de Venda: {formatValue(tx.unitPrice)}
                              </div>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                              {matches.map((match, mIdx) => {
                                const lotResult = (tx.unitPrice - match.buyPrice) * match.quantity;
                                return (
                                  <div key={mIdx} className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm hover:shadow-md transition-shadow relative overflow-hidden group">
                                    <div className={`absolute top-0 left-0 w-1 h-full ${lotResult >= 0 ? 'bg-emerald-500' : 'bg-rose-500'}`}></div>
                                    
                                    <div className="flex justify-between items-start mb-3">
                                      <div className="flex flex-col">
                                        <span className="text-[9px] font-black text-slate-400 uppercase tracking-tighter">Compra Original</span>
                                        <span className="text-xs font-bold text-slate-700 font-mono">{match.buyDate}</span>
                                      </div>
                                      <span className="text-[10px] font-black text-indigo-500 bg-indigo-50 px-2 py-0.5 rounded-full">LOTE #{mIdx + 1}</span>
                                    </div>

                                    <div className="grid grid-cols-2 gap-2 mb-3">
                                      <div>
                                        <p className="text-[9px] text-slate-400 uppercase font-bold">Qtd. Lote</p>
                                        <p className="text-sm font-black text-slate-800">{match.quantity.toFixed(2)}</p>
                                      </div>
                                      <div className="text-right">
                                        <p className="text-[9px] text-slate-400 uppercase font-bold">Preço Pago</p>
                                        <p className="text-sm font-black text-slate-800">{formatValue(match.buyPrice)}</p>
                                      </div>
                                    </div>

                                    <div className={`pt-3 border-t border-slate-100 flex justify-between items-center`}>
                                      <span className="text-[9px] font-black text-slate-400 uppercase">Resultado Lote</span>
                                      <span className={`text-sm font-black ${lotResult >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                                        {lotResult >= 0 ? '+' : ''}{formatValue(lotResult)}
                                      </span>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                            
                            {matches.length === 0 && (
                              <div className="p-4 bg-slate-50 border border-slate-200 rounded-lg text-center">
                                <p className="text-[11px] text-slate-400 font-medium italic">
                                  Nenhum registro de lote correspondente encontrado para esta transação. 
                                  Verifique se o saldo anterior era suficiente.
                                </p>
                              </div>
                            )}
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
