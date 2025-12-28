
import React from 'react';
import { TaxMonthlySummary } from '../types';

interface Props {
  taxReport: TaxMonthlySummary[];
}

const TaxReportView: React.FC<Props> = ({ taxReport }) => {
  const formatBRL = (val: number) => {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val);
  };

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="bg-indigo-600 p-6 rounded-2xl text-white shadow-lg flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-black">Central de Impostos (Brasil)</h2>
          <p className="text-indigo-100 text-sm mt-1">Apuração mensal automatizada seguindo as regras da Receita Federal.</p>
        </div>
        <div className="bg-indigo-500/30 px-4 py-2 rounded-xl border border-indigo-400/30">
          <p className="text-[10px] font-bold uppercase tracking-widest text-indigo-200">Código de Receita</p>
          <p className="text-xl font-black">6015 (IRPF Bolsa)</p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6">
        {taxReport.length === 0 ? (
          <div className="bg-white p-12 rounded-2xl border border-slate-200 text-center space-y-4">
             <div className="bg-slate-50 w-16 h-16 rounded-full flex items-center justify-center mx-auto text-slate-300">
                <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
             </div>
             <p className="text-slate-500 font-medium italic">Nenhuma venda de ativo brasileiro detectada para apuração fiscal.</p>
          </div>
        ) : taxReport.map((summary) => (
          <div key={summary.month} className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden transition-all hover:border-indigo-300">
            <div className="px-6 py-4 bg-slate-50 border-b border-slate-100 flex justify-between items-center">
              <h3 className="font-black text-slate-800 uppercase tracking-tight">{summary.month}</h3>
              {summary.isExempt ? (
                <span className="bg-emerald-100 text-emerald-700 px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest border border-emerald-200">
                  {/* Fixed JSX error: Use &lt; to prevent '< R$' from being parsed as a component tag */}
                  Isento (Vendas &lt; R$ 20k)
                </span>
              ) : (
                <span className="bg-rose-100 text-rose-700 px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest border border-rose-200">
                  Tributável
                </span>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 p-6 border-b border-slate-50">
               <div className="space-y-1">
                 <p className="text-[10px] font-bold text-slate-400 uppercase">Volume de Vendas</p>
                 <p className="text-xl font-bold text-slate-700">{formatBRL(summary.totalSalesBRL)}</p>
                 <div className="w-full bg-slate-100 h-1.5 rounded-full overflow-hidden mt-2">
                    <div 
                      className={`h-full transition-all duration-1000 ${summary.totalSalesBRL > 20000 ? 'bg-rose-500' : 'bg-indigo-500'}`} 
                      style={{ width: `${Math.min(100, (summary.totalSalesBRL / 20000) * 100)}%` }}
                    ></div>
                 </div>
               </div>
               
               <div className="space-y-1">
                 <p className="text-[10px] font-bold text-slate-400 uppercase">Base de Cálculo</p>
                 <p className="text-xl font-bold text-slate-700">{formatBRL(summary.taxableGainBRL)}</p>
                 <p className="text-[9px] text-slate-400 font-medium italic">Lucro líquido após taxas</p>
               </div>

               <div className="bg-indigo-50/50 p-4 rounded-xl border border-indigo-100 flex flex-col items-center justify-center">
                 <p className="text-[10px] font-black text-indigo-400 uppercase mb-1">DARF Estimado</p>
                 <p className={`text-2xl font-black ${summary.taxDueBRL > 0 ? 'text-indigo-600' : 'text-slate-300'}`}>
                   {formatBRL(summary.taxDueBRL)}
                 </p>
                 {summary.taxDueBRL > 0 && summary.taxDueBRL < 10 && (
                   <p className="text-[9px] text-amber-600 font-bold mt-1 text-center leading-tight">
                     Valor inferior a R$ 10,00. Acumule para o próximo mês.
                   </p>
                 )}
               </div>
            </div>

            <div className="p-6">
               <h4 className="text-[10px] font-black text-slate-400 uppercase mb-4 tracking-widest">Memória de Cálculo (Lotes Vendidos)</h4>
               <div className="space-y-2">
                 {summary.details.map((detail, idx) => (
                   <div key={idx} className="flex justify-between items-center py-2 px-4 bg-slate-50 rounded-lg group hover:bg-white border border-transparent hover:border-slate-100 transition-all">
                     <div className="flex items-center gap-4">
                        <span className="font-mono text-xs text-slate-400">{detail.date}</span>
                        <span className="font-bold text-slate-700 w-20">{detail.ticker}</span>
                        <span className="text-[10px] bg-white px-2 py-0.5 rounded border border-slate-100 text-slate-500 font-medium">
                          {detail.quantity} un.
                        </span>
                     </div>
                     <div className="flex items-center gap-6">
                        <div className="text-right">
                           <p className="text-[9px] font-bold text-slate-400">Preço de Venda</p>
                           <p className="text-xs font-bold text-slate-600">{formatBRL(detail.sellPrice)}</p>
                        </div>
                        <div className="text-right">
                           <p className="text-[9px] font-bold text-slate-400">Lucro Lote</p>
                           <p className={`text-xs font-black ${detail.gain >= 0 ? 'text-emerald-500' : 'text-rose-500'}`}>
                              {formatBRL(detail.gain)}
                           </p>
                        </div>
                     </div>
                   </div>
                 ))}
               </div>
            </div>
            
            {summary.taxDueBRL > 0 && (
              <div className="p-4 bg-slate-900 flex justify-center">
                <button className="flex items-center gap-2 text-white font-bold text-xs uppercase tracking-widest hover:text-indigo-400 transition-colors">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" /></svg>
                  Simular Guia de Pagamento (DARF)
                </button>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};

export default TaxReportView;
