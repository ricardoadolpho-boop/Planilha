import React, { useState } from 'react';
import { Transaction, TransactionType, Country, AnnouncedDividend, Position } from '../types';

interface Props {
  transactions: Transaction[];
  usdRate: number;
  announcedDividends: AnnouncedDividend[];
  positions: Position[];
  onAddAnnouncedDividend: (div: AnnouncedDividend) => void;
  onDeleteAnnouncedDividend: (id: string) => void;
}

interface DividendEntry {
  date: string;
  amount: number;
}

const DividendReportView: React.FC<Props> = ({ transactions, usdRate, announcedDividends, positions, onAddAnnouncedDividend, onDeleteAnnouncedDividend }) => {
  const [showForm, setShowForm] = useState(false);
  const initialFormState = {
    ticker: '',
    country: Country.BR,
    exDate: new Date().toISOString().split('T')[0],
    paymentDate: new Date().toISOString().split('T')[0],
    amountPerShare: 0,
    dividendType: 'DIVIDEND' as 'DIVIDEND' | 'JCP',
  };
  const [formData, setFormData] = useState<Omit<AnnouncedDividend, 'id'>>(initialFormState);

  const dividendTransactions = transactions.filter(tx => tx.type === TransactionType.DIVIDEND);

  const formatBRL = (val: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val);

  // --- CÁLCULO PROVENTOS RECEBIDOS ---
  const { totalBRL, totalUSD, byMonth } = React.useMemo(() => {
    const groupedByMonth: Record<string, number> = {};
    let totalBRL = 0;
    let totalUSD = 0;

    dividendTransactions.forEach(tx => {
      const amount = tx.quantity * tx.unitPrice - tx.fees;
      if (tx.country === Country.BR) totalBRL += amount; else totalUSD += amount;
      const monthKey = tx.date.substring(0, 7);
      const amountInBRL = tx.country === Country.BR ? amount : amount * usdRate;
      groupedByMonth[monthKey] = (groupedByMonth[monthKey] || 0) + amountInBRL;
    });

    const byMonthArray = Object.entries(groupedByMonth).map(([m,a]) => ({ month: m, amount: a })).sort((a,b) => b.month.localeCompare(a.month));
    return { totalBRL, totalUSD, byMonth: byMonthArray };
  }, [dividendTransactions, usdRate]);
  
  // --- CÁLCULO PROVENTOS A RECEBER (PREVISÃO LÍQUIDA) ---
  const { forecast, totalForecastBRL } = React.useMemo(() => {
    let totalForecastNetBRL = 0;
    
    const forecastWithDetails = announcedDividends.map(div => {
      const position = positions.find(p => p.ticker === div.ticker);
      const quantityOnExDate = position?.totalQuantity || 0; 
      
      const grossAmount = quantityOnExDate * div.amountPerShare;
      let taxAmount = 0;
      let taxRate = 0;

      if (div.country === Country.BR) {
        if (div.dividendType === 'JCP') {
          taxRate = 0.15; // 15% IR na fonte para JCP
          taxAmount = grossAmount * taxRate;
        }
      } else if (div.country === Country.USA) {
        taxRate = 0.30; // 30% US withholding tax para residentes fiscais no Brasil
        taxAmount = grossAmount * taxRate;
      }

      const netAmount = grossAmount - taxAmount;
      const netAmountInBRL = div.country === Country.USA ? netAmount * usdRate : netAmount;
      totalForecastNetBRL += netAmountInBRL;

      return { ...div, quantityOnExDate, grossAmount, taxAmount, taxRate, netAmount };
    }).sort((a,b) => new Date(a.paymentDate).getTime() - new Date(b.paymentDate).getTime());

    return { forecast: forecastWithDetails, totalForecastBRL: totalForecastNetBRL };
  }, [announcedDividends, positions, usdRate]);

  const totalDividendsInBRL = totalBRL + (totalUSD * usdRate);
  const maxMonthlyDividend = Math.max(...byMonth.map(m => m.amount), 0);

  const formatCurrency = (val: number, country: Country) => val.toLocaleString(country === Country.BR ? 'pt-BR' : 'en-US', { style: 'currency', currency: country === Country.BR ? 'BRL' : 'USD' });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onAddAnnouncedDividend({ ...formData, id: crypto.randomUUID() });
    setFormData(initialFormState);
    setShowForm(false);
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
                <p className="text-[10px] font-bold uppercase tracking-widest text-amber-200">A Receber (LÍQUIDO)</p>
                <p className="text-xl font-black">{formatBRL(totalForecastBRL)}</p>
            </div>
            <div className="bg-amber-400/30 px-4 py-2 rounded-xl border border-amber-300/30">
                <p className="text-[10px] font-bold uppercase tracking-widest text-amber-200">Recebido (R$)</p>
                <p className="text-xl font-black">{formatBRL(totalDividendsInBRL)}</p>
            </div>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm">
        <div className="p-6 border-b border-slate-100 flex justify-between items-center">
          <div>
            <h3 className="text-lg font-bold text-slate-800">Fluxo de Caixa Futuro (Líquido de Impostos)</h3>
            <p className="text-xs text-slate-400 uppercase tracking-wider">Previsão com base nos anúncios e na sua posição atual.</p>
          </div>
          <button onClick={() => setShowForm(!showForm)} className="bg-indigo-600 text-white px-4 py-2 rounded-xl hover:bg-indigo-700 font-bold text-xs flex items-center gap-2 shadow-lg shadow-indigo-500/20">{showForm ? 'Fechar' : '+ Lançar Previsão'}</button>
        </div>
        
        {showForm && (
          <form onSubmit={handleSubmit} className="p-6 bg-slate-50 border-b border-slate-100">
             <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-4">
               <input type="text" placeholder="Ticker" required value={formData.ticker} onChange={e => setFormData({...formData, ticker: e.target.value.toUpperCase()})} className="w-full p-2 bg-white border border-slate-300 rounded-lg text-slate-800 font-bold outline-none focus:ring-1 focus:ring-indigo-500" />
               <select value={formData.country} onChange={e => setFormData({...formData, country: e.target.value as Country})} className="w-full p-2 bg-white border border-slate-300 rounded-lg text-sm outline-none focus:ring-1 focus:ring-indigo-500">
                  <option value={Country.BR}>🇧🇷 Brasil</option>
                  <option value={Country.USA}>🇺🇸 EUA</option>
               </select>
               {formData.country === Country.BR ? (
                 <select value={formData.dividendType} onChange={e => setFormData({...formData, dividendType: e.target.value as 'DIVIDEND' | 'JCP'})} className="w-full p-2 bg-white border border-slate-300 rounded-lg text-sm outline-none focus:ring-1 focus:ring-indigo-500">
                    <option value='DIVIDEND'>Dividendo (Isento)</option>
                    <option value='JCP'>JCP (15% IR)</option>
                 </select>
               ) : (
                <div className="flex items-center justify-center bg-slate-100 rounded-lg text-xs text-slate-400 font-bold border border-slate-200 h-full">Padrão EUA (30%)</div>
               )}
               <input type="date" title="Data Com" required value={formData.exDate} onChange={e => setFormData({...formData, exDate: e.target.value})} className="w-full p-2 bg-white border border-slate-300 rounded-lg outline-none focus:ring-1 focus:ring-indigo-500" />
               <input type="date" title="Data de Pagamento" required value={formData.paymentDate} onChange={e => setFormData({...formData, paymentDate: e.target.value})} className="w-full p-2 bg-white border border-slate-300 rounded-lg outline-none focus:ring-1 focus:ring-indigo-500" />
               <input type="number" step="any" placeholder="Valor Bruto/Cota" required value={formData.amountPerShare} onChange={e => setFormData({...formData, amountPerShare: parseFloat(e.target.value) || 0})} className="w-full p-2 bg-white border border-slate-300 rounded-lg outline-none focus:ring-1 focus:ring-indigo-500" />
             </div>
             <button type="submit" className="w-full mt-4 bg-emerald-600 text-white py-2 rounded-lg font-bold hover:bg-emerald-700">Adicionar Previsão</button>
          </form>
        )}

        <div className="p-4 md:p-6 space-y-3">
            {forecast.length > 0 ? forecast.map(f => (
                <div key={f.id} className="grid grid-cols-2 md:grid-cols-4 items-center gap-4 py-4 px-4 bg-slate-50/70 rounded-xl border border-slate-100 hover:bg-white hover:border-slate-200">
                    <div>
                        <p className="font-black text-slate-800 text-lg">{f.ticker}</p>
                        <p className="text-[10px] text-slate-400 uppercase font-bold">PGTO: {new Date(f.paymentDate + 'T00:00:00').toLocaleDateString()}</p>
                        <span className={`mt-1 text-[9px] px-1.5 py-0.5 rounded font-bold inline-block ${f.taxRate > 0 ? 'bg-rose-100 text-rose-700' : 'bg-emerald-100 text-emerald-700'}`}>
                           {f.country === Country.BR ? f.dividendType : 'DIVIDEND'} ({ (f.taxRate * 100).toFixed(0) }% IR)
                        </span>
                    </div>
                    <div className="text-xs text-slate-500 font-mono text-right md:text-left">
                        <p>{f.quantityOnExDate.toFixed(2)} cotas</p>
                        <p>x {formatCurrency(f.amountPerShare, f.country)}</p>
                        <p className="border-t border-slate-200 mt-1 pt-1 font-bold text-slate-600">
                           = {formatCurrency(f.grossAmount, f.country)} (Bruto)
                        </p>
                    </div>
                    <div className="text-left">
                        <p className="font-bold text-emerald-600 text-xl">{formatCurrency(f.netAmount, f.country)}</p>
                        <p className="text-[10px] text-rose-500 font-bold">Imposto: -{formatCurrency(f.taxAmount, f.country)}</p>
                        {f.country === Country.USA && <p className="text-xs text-slate-400 mt-1">~{formatBRL(f.netAmount * usdRate)}</p>}
                    </div>
                    <div className="text-right">
                        <button onClick={() => onDeleteAnnouncedDividend(f.id)} className="text-slate-300 hover:text-rose-500 p-2"><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg></button>
                    </div>
                </div>
            )) : <p className="text-center text-sm text-slate-400 italic py-8">Nenhum provento a receber lançado.</p>}
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
        <h3 className="text-lg font-bold text-slate-800 mb-1">Histórico de Proventos Recebidos</h3>
        <p className="text-xs text-slate-400 mb-6 uppercase tracking-wider">Consolidado por Mês (em R$)</p>
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
                    <div className="bg-gradient-to-r from-amber-400 to-amber-500 h-full rounded-full" style={{ width: `${barWidth}%` }}></div>
                  </div>
                  <span className="w-28 text-right font-bold text-slate-800 mono">{formatBRL(amount)}</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default DividendReportView;
