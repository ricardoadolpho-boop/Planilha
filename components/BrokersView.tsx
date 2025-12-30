import React, { useMemo } from 'react';
import { Position, Country } from '../types';
import { MarketPrice } from '../services/geminiService';

interface Props {
  positions: Position[];
  usdRate: number;
  marketPrices: Record<string, MarketPrice>;
}

const BrokersView: React.FC<Props> = ({ positions, usdRate, marketPrices }) => {
  
  // Agrupamento e cálculo de totais otimizados
  const brokersData = useMemo(() => {
    const grouped: Record<string, Position[]> = {};
    
    positions.forEach(pos => {
      if (!grouped[pos.broker]) grouped[pos.broker] = [];
      grouped[pos.broker].push(pos);
    });

    return Object.entries(grouped).map(([broker, posList]) => {
      let totalEquityBRL = 0;
      let totalEquityUSD = 0;
      let totalDividendsBRL = 0;

      const positionsWithCalculations = posList.map(pos => {
        const marketData = marketPrices[pos.ticker];
        const currentPrice = marketData?.price || pos.averagePrice;
        const equity = pos.totalQuantity * currentPrice;
        const profitPct = pos.averagePrice > 0 ? ((currentPrice - pos.averagePrice) / pos.averagePrice) * 100 : 0;

        // Acumulação de totais
        if (pos.country === Country.USA) {
          totalEquityUSD += equity;
          totalEquityBRL += equity * usdRate;
          totalDividendsBRL += pos.totalDividends * usdRate;
        } else {
          totalEquityBRL += equity;
          totalDividendsBRL += pos.totalDividends;
        }

        return { ...pos, currentPrice, equity, profitPct };
      });

      return {
        name: broker,
        totalEquityBRL,
        totalEquityUSD,
        totalDividendsBRL,
        positions: positionsWithCalculations
      };
    }).sort((a, b) => b.totalEquityBRL - a.totalEquityBRL);
  }, [positions, usdRate, marketPrices]);

  const formatCurrency = (val: number, country: Country) => 
    new Intl.NumberFormat(country === Country.BR ? 'pt-BR' : 'en-US', { style: 'currency', currency: country === Country.BR ? 'BRL' : 'USD' }).format(val);

  const formatBRL = (val: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val);

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      {brokersData.map((broker) => (
        <div key={broker.name} className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          {/* Broker Header */}
          <div className="px-4 md:px-6 py-5 bg-slate-900 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-indigo-600 rounded-xl flex items-center justify-center text-white font-black text-xl shadow-lg shadow-indigo-500/20">
                {broker.name.charAt(0).toUpperCase()}
              </div>
              <div>
                <h3 className="text-white font-bold text-lg leading-tight">{broker.name}</h3>
                <p className="text-slate-400 text-[10px] font-bold uppercase tracking-widest mt-0.5">Custódia Consolidada</p>
              </div>
            </div>
            
            <div className="grid grid-cols-2 md:flex gap-4 md:gap-8 w-full md:w-auto border-t md:border-t-0 border-slate-800 pt-4 md:pt-0">
              <div>
                <p className="text-slate-400 text-[9px] font-bold uppercase mb-1">Total (R$)</p>
                <p className="text-white font-black text-lg">{formatBRL(broker.totalEquityBRL)}</p>
              </div>
              {broker.totalEquityUSD > 0 && (
                <div>
                  <p className="text-slate-400 text-[9px] font-bold uppercase mb-1">Total (US$)</p>
                  <p className="text-white font-black text-lg">{formatCurrency(broker.totalEquityUSD, Country.USA)}</p>
                </div>
              )}
              <div>
                <p className="text-slate-400 text-[9px] font-bold uppercase mb-1">Divs (R$)</p>
                <p className="text-amber-500 font-black text-lg">{formatBRL(broker.totalDividendsBRL)}</p>
              </div>
            </div>
          </div>

          {/* Desktop Table */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 text-slate-500 uppercase text-[10px] font-bold tracking-widest border-b border-slate-100">
                <tr>
                  <th className="px-6 py-4">Ativo</th>
                  <th className="px-6 py-4">Saldo</th>
                  <th className="px-6 py-4">Preço Médio</th>
                  <th className="px-6 py-4">Preço Atual</th>
                  <th className="px-6 py-4">Performance</th>
                  <th className="px-6 py-4 text-right">Patrimônio</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {broker.positions.sort((a,b) => a.ticker.localeCompare(b.ticker)).map((pos, idx) => {
                  const equityInBRL = pos.country === Country.USA ? pos.equity * usdRate : pos.equity;
                  return (
                    <tr key={idx} className="hover:bg-slate-50/50">
                      <td className="px-6 py-4 font-bold text-slate-900">{pos.ticker}</td>
                      <td className="px-6 py-4 font-medium text-slate-600">{pos.totalQuantity.toFixed(2)}</td>
                      <td className="px-6 py-4 text-slate-500">{formatCurrency(pos.averagePrice, pos.country)}</td>
                      <td className="px-6 py-4 text-slate-900 font-bold">{formatCurrency(pos.currentPrice, pos.country)}</td>
                      <td className="px-6 py-4">
                        <span className={`font-black ${pos.profitPct >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                          {pos.profitPct >= 0 ? '+' : ''}{pos.profitPct.toFixed(2)}%
                        </span>
                      </td>
                      <td className="px-6 py-4 text-right">
                         <div className="font-bold text-slate-900">{formatCurrency(pos.equity, pos.country)}</div>
                         {pos.country === Country.USA && <div className="text-xs text-slate-500 font-medium">{formatBRL(equityInBRL)}</div>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Mobile List */}
          <div className="block md:hidden divide-y divide-slate-100">
             {broker.positions.sort((a,b) => a.ticker.localeCompare(b.ticker)).map((pos, idx) => (
                <div key={idx} className="p-4 flex flex-col gap-2">
                   <div className="flex justify-between items-center">
                      <span className="font-bold text-slate-900 text-lg">{pos.ticker}</span>
                      <div className="text-right">
                         <span className="block font-bold text-slate-900">{formatCurrency(pos.equity, pos.country)}</span>
                         <span className={`text-xs font-bold ${pos.profitPct >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                           {pos.profitPct >= 0 ? '+' : ''}{pos.profitPct.toFixed(2)}%
                         </span>
                      </div>
                   </div>
                   <div className="flex justify-between text-xs text-slate-500 bg-slate-50 p-2 rounded">
                      <span>Qtd: {pos.totalQuantity.toFixed(2)}</span>
                      <span>PM: {formatCurrency(pos.averagePrice, pos.country)}</span>
                      <span>Atual: {formatCurrency(pos.currentPrice, pos.country)}</span>
                   </div>
                </div>
             ))}
          </div>
        </div>
      ))}
    </div>
  );
};

export default BrokersView;
