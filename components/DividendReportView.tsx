import React from 'react';
import { Transaction, TransactionType, Country } from '../types';

interface Props {
  transactions: Transaction[];
  usdRate: number;
}

interface DividendEntry {
  date: string;
  amount: number;
}

const DividendReportView: React.FC<Props> = ({ transactions, usdRate }) => {
  const dividendTransactions = transactions.filter(tx => tx.type === TransactionType.DIVIDEND);

  const formatBRL = (val: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val);

  const { byTicker, totalBRL, totalUSD, byMonth } = React.useMemo(() => {
    const groupedByTicker: Record<string, { total: number; country: Country; entries: DividendEntry[] }> = {};
    const groupedByMonth: Record<string, number> = {};
    let totalBRL = 0;
    let totalUSD = 0;

    dividendTransactions.forEach(tx => {
      const amount = tx.quantity * tx.unitPrice - tx.fees;
      
      // Agrupamento por Ticker (existente)
      if (!groupedByTicker[tx.ticker]) {
        groupedByTicker[tx.ticker] = { total: 0, country: tx.country, entries: [] };
      }
      groupedByTicker[tx.ticker].total += amount;
      groupedByTicker[tx.ticker].entries.push({ date: tx.date, amount });

      if (tx.country === Country.BR) {
        totalBRL += amount;
      } else {
        totalUSD += amount;
      }

      // Novo Agrupamento por Mês
      const monthKey = tx.date.substring(0, 7); // "YYYY-MM"
      const amountInBRL = tx.country === Country.BR ? amount : amount * usdRate;
      groupedByMonth[monthKey] = (groupedByMonth[monthKey] || 0) + amountInBRL;
    });

    // Ordenar entradas por data
    Object.values(groupedByTicker).forEach(group => {
      group.entries.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    });

    // Converter dados mensais em array ordenado
    const byMonthArray = Object.entries(groupedByMonth)
      .map(([month, amount]) => ({ month, amount }))
      .sort((a, b) => b.month.localeCompare(a.month));

    return { 
      byTicker: Object.entries(groupedByTicker).sort((a,b) => b[1].total - a[1].total), 
      totalBRL, 
      totalUSD,
      byMonth: byMonthArray
    };
  }, [dividendTransactions, usdRate]);
  
  const totalDividendsInBRL = totalBRL + (totalUSD * usdRate);
  const maxMonthlyDividend = Math.max(...byMonth.map(m => m.amount), 0);

  const formatCurrency = (val: number, country: Country) => {
    return country === Country.BR 
      ? new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val)
      : new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(val);
  };

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="bg-amber-500 p-6 rounded-2xl text-white shadow-lg flex flex-col md:flex-row justify-between items-start gap-4">
        <div>
          <h2 className="text-2xl font-black">Relatório de Proventos</h2>
          <p className="text-amber-100 text-sm mt-1">Consolidado de dividendos, JCP e rendimentos recebidos.</p>
        </div>
        <div className="grid grid-cols-2 gap-4 w-full md:w-auto text-center md:text-right">
            <div className="bg-amber-400/30 px-4 py-2 rounded-xl border border-amber-300/30">
                <p className="text-[10px] font-bold uppercase tracking-widest text-amber-200">Total Global (R$)</p>
                <p className="text-xl font-black">{formatBRL(totalDividendsInBRL)}</p>
            </div>
            <div className="bg-amber-400/30 px-4 py-2 rounded-xl border border-amber-300/30">
                <p className="text-[10px] font-bold uppercase tracking-widest text-amber-200">Total EUA (US$)</p>
                <p className="text-xl font-black">{formatCurrency(totalUSD, Country.USA)}</p>
            </div>
        </div>
      </div>

      {/* NOVO CARD: Fluxo de Caixa Mensal */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
        <h3 className="text-lg font-bold text-slate-800 mb-1">Fluxo de Caixa Mensal</h3>
        <p className="text-xs text-slate-400 mb-6 uppercase tracking-wider">Proventos Recebidos por Mês (Consolidado em R$)</p>
        <div className="space-y-4">
          {byMonth.map(({ month, amount }) => {
            const monthDate = new Date(`${month}-02T00:00:00`);
            const monthName = monthDate.toLocaleString('pt-BR', { month: 'long' });
            const year = monthDate.getFullYear();
            const barWidth = maxMonthlyDividend > 0 ? (amount / maxMonthlyDividend) * 100 : 0;

            return (
              <div key={month} className="grid grid-cols-1 md:grid-cols-3 items-center gap-2 md:gap-4 text-sm">
                <span className="font-medium text-slate-600 capitalize">{monthName} <span className="text-slate-400 text-xs">{year}</span></span>
                <div className="md:col-span-2 flex items-center gap-3">
                  <div className="flex-1 bg-slate-100 rounded-full h-4 overflow-hidden shadow-inner">
                    <div 
                      className="bg-gradient-to-r from-amber-400 to-amber-500 h-full rounded-full transition-all duration-500" 
                      style={{ width: `${barWidth}%` }}
                      title={`${barWidth.toFixed(1)}% do mês de maior recebimento`}
                    ></div>
                  </div>
                  <span className="w-28 text-right font-bold text-slate-800 mono">{formatBRL(amount)}</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6">
        {dividendTransactions.length === 0 ? (
          <div className="bg-white p-12 rounded-2xl border border-slate-200 text-center space-y-4">
             <div className="bg-slate-50 w-16 h-16 rounded-full flex items-center justify-center mx-auto text-slate-300">
                <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v.01" /></svg>
             </div>
             <p className="text-slate-500 font-medium italic">Nenhum provento lançado na carteira.</p>
          </div>
        ) : byTicker.map(([ticker, data]) => (
          <div key={ticker} className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden transition-all hover:border-amber-300">
            <div className="px-6 py-4 bg-slate-50 border-b border-slate-100 flex justify-between items-center">
              <h3 className="font-black text-slate-800 uppercase tracking-tight">{ticker}</h3>
              <div className="text-right">
                <p className="text-[9px] font-bold uppercase text-slate-400">Total Recebido</p>
                <p className="font-bold text-amber-600">{formatCurrency(data.total, data.country)}</p>
              </div>
            </div>

            <div className="p-4 md:p-6">
               <div className="space-y-2">
                 {data.entries.map((entry, idx) => (
                   <div key={idx} className="flex justify-between items-center py-2 px-4 bg-slate-50/70 rounded-lg group hover:bg-amber-50/50 border border-transparent hover:border-amber-100 transition-all">
                     <div className="flex items-center gap-4">
                        <span className="font-mono text-xs text-slate-400">{entry.date}</span>
                     </div>
                     <div className="flex items-center gap-6">
                        <p className={`text-sm font-black text-emerald-600`}>
                            + {formatCurrency(entry.amount, data.country)}
                        </p>
                     </div>
                   </div>
                 ))}
               </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default DividendReportView;
