import React, { useState, useMemo } from 'react';
import { Transaction, TransactionType, Country, AnnouncedDividend, Position } from '../types';

interface Props {
  transactions: Transaction[];
  usdRate: number;
  announcedDividends: AnnouncedDividend[];
  positions: Position[];
  onAddAnnouncedDividend: (div: AnnouncedDividend) => void;
  onDeleteAnnouncedDividend: (id: string) => void;
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

  // --- Calculations ---

  const history = useMemo(() => {
    const grouped: Record<string, number> = {};
    let totalReceivedBRL = 0;
    
    transactions
      .filter(tx => tx.type === TransactionType.DIVIDEND)
      .forEach(tx => {
        const netAmount = (tx.quantity * tx.unitPrice) - tx.fees;
        const netAmountBRL = tx.country === Country.BR ? netAmount : netAmount * usdRate;
        
        totalReceivedBRL += netAmountBRL;
        
        const monthKey = tx.date.substring(0, 7);
        grouped[monthKey] = (grouped[monthKey] || 0) + netAmountBRL;
      });

    const monthlyData = Object.entries(grouped)
      .map(([month, amount]) => ({ month, amount }))
      .sort((a,b) => b.month.localeCompare(a.month));

    const maxMonthly = Math.max(...monthlyData.map(m => m.amount), 0);

    return { totalReceivedBRL, monthlyData, maxMonthly };
  }, [transactions, usdRate]);

  const forecast = useMemo(() => {
    let totalForecastBRL = 0;
    
    const items = announcedDividends.map(div => {
      const pos = positions.find(p => p.ticker === div.ticker);
      const qty = pos?.totalQuantity || 0;
      
      const gross = qty * div.amountPerShare;
      let taxRate = 0;
      
      // Regras de Tributação Automática
      if (div.country === Country.BR && div.dividendType === 'JCP') taxRate = 0.15;
      if (div.country === Country.USA) taxRate = 0.30;

      const taxAmount = gross * taxRate;
      const netAmount = gross - taxAmount;
      const netAmountBRL = div.country === Country.USA ? netAmount * usdRate : netAmount;

      totalForecastBRL += netAmountBRL;

      return { ...div, qty, gross, taxRate, taxAmount, netAmount };
    }).sort((a,b) => new Date(a.paymentDate).getTime() - new Date(b.paymentDate).getTime());

    return { items, totalForecastBRL };
  }, [announcedDividends, positions, usdRate]);

  const formatBRL = (v: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);
  const formatCur = (v: number, c: Country) => v.toLocaleString(c === Country.BR ? 'pt-BR' : 'en-US', { style: 'currency', currency: c === Country.BR ? 'BRL' : 'USD' });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onAddAnnouncedDividend({ ...formData, id: crypto.randomUUID() });
    setFormData(initialFormState);
    setShowForm(false);
  };

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      {/* Header Summary */}
      <div className="bg-amber-500 p-6 rounded-2xl text-white shadow-lg flex flex-col md:flex-row justify-between items-start gap-4">
        <div>
          <h2 className="text-2xl font-black">Proventos</h2>
          <p className="text-amber-100 text-sm mt-1">Dividendos, JCP e Rendimentos.</p>
        </div>
        <div className="grid grid-cols-2 gap-4 w-full md:w-auto text-center md:text-right">
            <div className="bg-amber-400/30 px-4 py-2 rounded-xl border border-amber-300/30">
                <p className="text-[10px] font-bold uppercase tracking-widest text-amber-200">A Receber (Líq)</p>
                <p className="text-xl font-black">{formatBRL(forecast.totalForecastBRL)}</p>
            </div>
            <div className="bg-amber-400/30 px-4 py-2 rounded-xl border border-amber-300/30">
                <p className="text-[10px] font-bold uppercase tracking-widest text-amber-200">Recebido (Total)</p>
                <p className="text-xl font-black">{formatBRL(history.totalReceivedBRL)}</p>
            </div>
        </div>
      </div>

      {/* Forecast Section */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm">
        <div className="p-6 border-b border-slate-100 flex justify-between items-center">
          <div>
            <h3 className="text-lg font-bold text-slate-800">Fluxo Futuro</h3>
            <p className="text-xs text-slate-400 uppercase tracking-wider">Baseado na posição atual.</p>
          </div>
          <button onClick={() => setShowForm(!showForm)} className="bg-indigo-600 text-white px-4 py-2 rounded-xl hover:bg-indigo-700 font-bold text-xs shadow-lg shadow-indigo-500/20 transition-all">
            {showForm ? 'Cancelar' : '+ Lançar'}
          </button>
        </div>
        
        {showForm && (
          <form onSubmit={handleSubmit} className="p-6 bg-slate-50 border-b border-slate-100 grid grid-cols-1 md:grid-cols-2 gap-4">
             <input type="text" placeholder="Ticker" required value={formData.ticker} onChange={e => setFormData({...formData, ticker: e.target.value.toUpperCase()})} className="p-3 rounded-lg border border-slate-200" />
             <select value={formData.country} onChange={e => setFormData({...formData, country: e.target.value as Country})} className="p-3 rounded-lg border border-slate-200">
                <option value={Country.BR}>Brasil</option>
                <option value={Country.USA}>EUA</option>
             </select>
             {formData.country === Country.BR && (
               <select value={formData.dividendType} onChange={e => setFormData({...formData, dividendType: e.target.value as any})} className="p-3 rounded-lg border border-slate-200">
                  <option value='DIVIDEND'>Dividendo (0% IR)</option>
                  <option value='JCP'>JCP (15% IR)</option>
               </select>
             )}
             <input type="date" required value={formData.paymentDate} onChange={e => setFormData({...formData, paymentDate: e.target.value})} className="p-3 rounded-lg border border-slate-200" />
             <input type="number" step="any" placeholder="Valor Bruto Unitário" required value={formData.amountPerShare} onChange={e => setFormData({...formData, amountPerShare: parseFloat(e.target.value) || 0})} className="p-3 rounded-lg border border-slate-200" />
             <button type="submit" className="md:col-span-2 bg-emerald-600 text-white py-3 rounded-lg font-bold hover:bg-emerald-700">Salvar</button>
          </form>
        )}

        <div className="p-4 space-y-3">
          {forecast.items.length === 0 && <p className="text-center text-slate-400 italic py-6">Nenhum provento futuro cadastrado.</p>}
          {forecast.items.map(f => (
            <div key={f.id} className="flex justify-between items-center p-4 bg-slate-50 rounded-xl hover:bg-white hover:shadow-sm border border-transparent hover:border-slate-200 transition-all">
              <div>
                <p className="font-black text-slate-800">{f.ticker}</p>
                <p className="text-xs text-slate-500">{new Date(f.paymentDate + 'T00:00:00').toLocaleDateString()}</p>
              </div>
              <div className="text-right">
                <p className="font-bold text-emerald-600">{formatCur(f.netAmount, f.country)}</p>
                {f.taxRate > 0 && <p className="text-[10px] text-rose-500 font-bold">IR: -{formatCur(f.taxAmount, f.country)}</p>}
              </div>
              <button onClick={() => onDeleteAnnouncedDividend(f.id)} className="text-slate-300 hover:text-rose-500"><svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg></button>
            </div>
          ))}
        </div>
      </div>

      {/* History Chart */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
        <h3 className="text-lg font-bold text-slate-800 mb-6">Histórico Mensal</h3>
        <div className="space-y-4">
          {history.monthlyData.map(({ month, amount }) => {
            const width = history.maxMonthly > 0 ? (amount / history.maxMonthly) * 100 : 0;
            return (
              <div key={month} className="flex items-center gap-4 text-sm">
                <span className="w-20 font-mono text-slate-500">{month}</span>
                <div className="flex-1 bg-slate-100 rounded-full h-3 overflow-hidden">
                  <div className="bg-amber-500 h-full rounded-full" style={{ width: `${width}%` }}></div>
                </div>
                <span className="w-24 text-right font-bold text-slate-800">{formatBRL(amount)}</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default DividendReportView;
