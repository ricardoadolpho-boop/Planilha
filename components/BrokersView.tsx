import React from 'react';
import { Position, Country } from '../types';
import { MarketPrice } from '../services/geminiService';

interface Props {
  positions: Position[];
  usdRate: number;
  marketPrices: Record<string, MarketPrice>;
}

const BrokersView: React.FC<Props> = ({ positions, usdRate, marketPrices }) => {
  const brokersMap = positions.reduce((acc, pos) => {
    if (!acc[pos.broker]) acc[pos.broker] = [];
    acc[pos.broker].push(pos);
    return acc;
  }, {} as Record<string, Position[]>);

  const formatCurrency = (val: number, country: Country) => {
    return country === Country.BR 
      ? new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val)
      : new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(val);
  };

  const formatBRL = (val: number) => {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val);
  };

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      {Object.entries(brokersMap).map(([broker, brokerPositions]) => {
        const castedPositions = brokerPositions as Position[];
        
        // Calcular totais de patrimônio e dividendos por moeda e consolidado
        let brokerTotalEquityBRL = 0;
        let brokerTotalEquityUSD = 0;
        let brokerTotalDividendsBRL_consolidated = 0;
        let brokerTotalDividendsUSD = 0;

        castedPositions.forEach(pos => {
            const marketData = marketPrices[pos.ticker];
            const currentPrice = marketData?.price || pos.averagePrice;
            const equity = pos.totalQuantity * currentPrice;
            const dividends = pos.totalDividends;

            if (pos.country === Country.USA) {
                brokerTotalEquityUSD += equity;
                brokerTotalDividendsUSD += dividends;
                brokerTotalEquityBRL += equity * usdRate;
                brokerTotalDividendsBRL_consolidated += dividends * usdRate;
            } else {
                brokerTotalEquityBRL += equity;
                brokerTotalDividendsBRL_consolidated += dividends;
            }
        });


        return (
          <div key={broker} className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            {/* Header Corretora */}
            <div className="px-4 md:px-6 py-5 bg-slate-900 flex flex-col md:flex-row justify-between items-start md:items-center gap-4 md:gap-6">
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 md:w-12 md:h-12 bg-indigo-600 rounded-xl flex items-center justify-center text-white font-black text-lg md:text-xl shadow-lg shadow-indigo-500/20">
                  {broker.substring(0, 1).toUpperCase()}
                </div>
                <div>
                  <h3 className="text-white font-bold text-lg leading-tight">{broker}</h3>
                  <p className="text-slate-400 text-[10px] font-bold uppercase tracking-widest mt-0.5">Custódia</p>
                </div>
              </div>
              
              <div className="grid grid-cols-2 md:flex gap-4 md:gap-8 w-full md:w-auto border-t md:border-t-0 border-slate-800 pt-4 md:pt-0">
                <div className="min-w-[100px]">
                  <p className="text-slate-400 text-[9px] font-bold uppercase mb-1">Total (R$)</p>
                  <p className="text-white font-black text-base md:text-lg">{formatBRL(brokerTotalEquityBRL)}</p>
                </div>
                {brokerTotalEquityUSD > 0 && (
                  <div className="min-w-[100px]">
                    <p className="text-slate-400 text-[9px] font-bold uppercase mb-1">Total (US$)</p>
                    <p className="text-white font-black text-base md:text-lg">{formatCurrency(brokerTotalEquityUSD, Country.USA)}</p>
                  </div>
                )}
                <div className="min-w-[100px]">
                  <p className="text-slate-400 text-[9px] font-bold uppercase mb-1">Divs (R$)</p>
                  <p className="text-amber-500 font-black text-base md:text-lg">{formatBRL(brokerTotalDividendsBRL_consolidated)}</p>
                </div>
              </div>
            </div>

            {/* MOBILE CARD VIEW */}
            <div className="block md:hidden divide-y divide-slate-100">
               {castedPositions.sort((a, b) => a.ticker.localeCompare(b.ticker)).map((pos, idx) => {
                  const marketData = marketPrices[pos.ticker];
                  const currentPrice = marketData?.price || pos.averagePrice;
                  const profitPct = pos.averagePrice > 0 ? ((currentPrice - pos.averagePrice) / pos.averagePrice) * 100 : 0;
                  const equity = pos.totalQuantity * currentPrice;
                  const equityInBRL = pos.country === Country.USA ? equity * usdRate : equity;
                  const weightInBroker = brokerTotalEquityBRL > 0 ? (equityInBRL / brokerTotalEquityBRL) * 100 : 0;

                  return (
                    <div key={idx} className="p-4 flex flex-col gap-3">
                       <div className="flex justify-between items-start">
                          <div>
                            <div className="flex items-center gap-2">
                               <span className="font-bold text-slate-900 text-lg">{pos.ticker}</span>
                               <span className={`text-[9px] px-1.5 py-0.5 rounded font-bold ${pos.country === Country.BR ? 'bg-green-100 text-green-700' : 'bg-blue-100 text-blue-700'}`}>{pos.country}</span>
                            </div>
                            <span className="text-xs text-slate-500">{pos.totalQuantity.toFixed(2)} cotas</span>
                          </div>
                          <div className="text-right">
                             <span className="block font-bold text-slate-900">{formatCurrency(equity, pos.country)}</span>
                             {pos.country === Country.USA && (
                               <span className="block text-xs text-slate-500">{formatBRL(equity * usdRate)}</span>
                             )}
                             <span className={`text-xs font-bold ${profitPct >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                               {profitPct >= 0 ? '+' : ''}{profitPct.toFixed(2)}%
                             </span>
                          </div>
                       </div>
                       <div className="flex justify-between items-center text-xs bg-slate-50 p-2 rounded-lg">
                          <span className="text-slate-500">PM: <span className="font-medium text-slate-700">{formatCurrency(pos.averagePrice, pos.country)}</span></span>
                          <span className="text-slate-500">Atual: <span className="font-medium text-slate-700">{formatCurrency(currentPrice, pos.country)}</span></span>
                       </div>
                       <div className="flex items-center gap-2">
                         <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                           <div className="h-full bg-indigo-500 rounded-full" style={{ width: `${weightInBroker}%` }}></div>
                         </div>
                         <span className="text-[10px] font-bold text-slate-400">{weightInBroker.toFixed(1)}%</span>
                       </div>
                    </div>
                  )
               })}
            </div>

            {/* DESKTOP TABLE VIEW */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-50 text-slate-500 uppercase text-[10px] font-bold tracking-widest border-b border-slate-100">
                  <tr>
                    <th className="px-6 py-4">Ativo</th>
                    <th className="px-6 py-4">Saldo</th>
                    <th className="px-6 py-4">Preço Médio</th>
                    <th className="px-6 py-4">Preço Atual</th>
                    <th className="px-6 py-4">Performance</th>
                    <th className="px-6 py-4">Peso</th>
                    <th className="px-6 py-4 text-right">Patrimônio</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {castedPositions.sort((a, b) => a.ticker.localeCompare(b.ticker)).map((pos, idx) => {
                    const marketData = marketPrices[pos.ticker];
                    const currentPrice = marketData?.price || pos.averagePrice;
                    const profitPct = pos.averagePrice > 0 ? ((currentPrice - pos.averagePrice) / pos.averagePrice) * 100 : 0;
                    const equityInOriginalCurrency = pos.totalQuantity * currentPrice;
                    const equityInBRL = pos.country === Country.USA ? equityInOriginalCurrency * usdRate : equityInOriginalCurrency;
                    const weightInBroker = brokerTotalEquityBRL > 0 ? (equityInBRL / brokerTotalEquityBRL) * 100 : 0;

                    return (
                      <tr key={idx} className="hover:bg-slate-50/50 transition-colors">
                        <td className="px-6 py-4">
                          <span className="font-bold text-slate-900">{pos.ticker}</span>
                        </td>
                        <td className="px-6 py-4 font-medium text-slate-600">
                          {pos.totalQuantity.toFixed(2)}
                        </td>
                        <td className="px-6 py-4 text-slate-500">
                          {formatCurrency(pos.averagePrice, pos.country)}
                        </td>
                        <td className="px-6 py-4 text-slate-900 font-bold">
                          {formatCurrency(currentPrice, pos.country)}
                        </td>
                        <td className="px-6 py-4">
                          <span className={`font-black flex items-center gap-1 ${profitPct >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                            {profitPct >= 0 ? '+' : ''}{profitPct.toFixed(2)}%
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-2">
                            <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden min-w-[60px]">
                              <div className="h-full bg-indigo-500 rounded-full" style={{ width: `${weightInBroker}%` }}></div>
                            </div>
                            <span className="text-[10px] font-bold text-slate-400">{weightInBroker.toFixed(1)}%</span>
                          </div>
                        </td>
                        <td className="px-6 py-4 text-right">
                           <div className="font-bold text-slate-900">{formatCurrency(equityInOriginalCurrency, pos.country)}</div>
                           {pos.country === Country.USA && (
                            <div className="text-xs text-slate-500 font-medium">{formatBRL(equityInOriginalCurrency * usdRate)}</div>
                           )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        );
      })}
    </div>
  );
};

export default BrokersView;
