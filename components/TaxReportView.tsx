import React, { useState, useEffect } from 'react';
import { TaxMonthlySummary } from '../types';
import { generateDarfExplanation } from '../services/geminiService';

interface Props {
  taxReport: TaxMonthlySummary[];
}

const TaxReportView: React.FC<Props> = ({ taxReport }) => {
  const [modalState, setModalState] = useState<{ open: boolean; content: string; loading: boolean; summary: TaxMonthlySummary | null }>({
    open: false,
    content: '',
    loading: false,
    summary: null
  });

  // Effect para carregar explicação quando um summary é selecionado
  useEffect(() => {
    let mounted = true;
    if (modalState.open && modalState.summary && !modalState.content) {
      setModalState(prev => ({ ...prev, loading: true }));
      
      generateDarfExplanation(modalState.summary).then(text => {
        if (mounted) {
          setModalState(prev => ({ ...prev, content: text, loading: false }));
        }
      });
    }
    return () => { mounted = false; };
  }, [modalState.summary, modalState.open]);

  const openModal = (summary: TaxMonthlySummary) => {
    setModalState({ open: true, summary, content: '', loading: true });
  };

  const closeModal = () => {
    setModalState({ open: false, summary: null, content: '', loading: false });
  };

  const formatBRL = (val: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val);
  const renderMarkdown = (text: string) => ({ __html: text.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>').replace(/\n/g, '<br />') });

  return (
    <>
      {/* Modal */}
      {modalState.open && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white w-full max-w-2xl rounded-2xl shadow-2xl flex flex-col animate-in fade-in zoom-in-95 duration-300">
            <div className="p-6 border-b border-slate-200 flex justify-between items-center">
              <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                <svg className="w-6 h-6 text-indigo-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" /></svg>
                IA Fiscal ({modalState.summary?.month})
              </h2>
              <button onClick={closeModal} className="text-slate-400 hover:text-slate-600 text-2xl leading-none">&times;</button>
            </div>
            <div className="p-6 overflow-y-auto max-h-[60vh]">
              {modalState.loading ? (
                <div className="flex flex-col items-center justify-center py-10 gap-3">
                   <div className="w-8 h-8 border-4 border-indigo-100 border-t-indigo-500 rounded-full animate-spin"></div>
                   <p className="text-sm text-slate-500 animate-pulse">Gerando análise tributária...</p>
                </div>
              ) : (
                <div className="prose prose-sm prose-slate max-w-none" dangerouslySetInnerHTML={renderMarkdown(modalState.content)} />
              )}
            </div>
            <div className="p-4 bg-slate-50 border-t border-slate-200 text-[10px] text-slate-400 text-center">
               IA generativa pode cometer erros. Consulte um contador.
            </div>
          </div>
        </div>
      )}

      {/* Main Content */}
      <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
        <div className="bg-gradient-to-r from-indigo-700 to-indigo-600 p-6 rounded-2xl text-white shadow-lg flex justify-between items-center">
          <div>
            <h2 className="text-2xl font-black">Fiscal BR</h2>
            <p className="text-indigo-200 text-sm mt-1">Apuração automática de Ganho de Capital.</p>
          </div>
          <div className="text-right hidden md:block">
            <p className="text-[10px] uppercase tracking-widest text-indigo-300 font-bold">Código Receita</p>
            <p className="text-2xl font-mono font-bold">6015</p>
          </div>
        </div>

        {taxReport.length === 0 ? (
           <div className="p-10 text-center border-2 border-dashed border-slate-200 rounded-2xl text-slate-400">
             Sem eventos tributáveis registrados.
           </div>
        ) : (
          <div className="grid gap-6">
            {taxReport.map(summary => (
              <div key={summary.month} className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden hover:shadow-md transition-shadow">
                {/* Card Header */}
                <div className="flex justify-between items-center p-4 bg-slate-50 border-b border-slate-100">
                   <h3 className="font-black text-slate-700 text-lg">{summary.month}</h3>
                   <span className={`text-[10px] font-bold px-2 py-1 rounded uppercase tracking-wider border ${summary.isExempt ? 'bg-emerald-50 text-emerald-700 border-emerald-100' : 'bg-rose-50 text-rose-700 border-rose-100'}`}>
                     {summary.isExempt ? 'Isento' : 'Tributável'}
                   </span>
                </div>

                {/* Card Body */}
                <div className="p-6 grid grid-cols-1 md:grid-cols-3 gap-6">
                   <div>
                     <p className="text-[10px] font-bold text-slate-400 uppercase">Total Vendas</p>
                     <p className="text-xl font-bold text-slate-800">{formatBRL(summary.totalSalesBRL)}</p>
                     <div className="w-full bg-slate-100 h-1 mt-2 rounded-full overflow-hidden">
                       <div className={`h-full ${summary.totalSalesBRL > 20000 ? 'bg-rose-500' : 'bg-emerald-500'}`} style={{width: `${Math.min(100, (summary.totalSalesBRL/20000)*100)}%`}}></div>
                     </div>
                     <p className="text-[9px] text-slate-400 mt-1 text-right">Limite 20k</p>
                   </div>
                   
                   <div>
                     <p className="text-[10px] font-bold text-slate-400 uppercase">Lucro Tributável</p>
                     <p className="text-xl font-bold text-slate-800">{formatBRL(summary.taxableGainBRL)}</p>
                   </div>

                   <div className="bg-indigo-50 rounded-lg p-4 flex flex-col items-center justify-center border border-indigo-100">
                     <p className="text-[10px] font-bold text-indigo-400 uppercase">Imposto a Pagar</p>
                     <p className={`text-2xl font-black ${summary.taxDueBRL > 0 ? 'text-indigo-600' : 'text-slate-300'}`}>{formatBRL(summary.taxDueBRL)}</p>
                     {summary.taxDueBRL > 0 && (
                       <button onClick={() => openModal(summary)} className="mt-2 text-[10px] font-bold text-indigo-500 hover:text-indigo-700 underline">
                         Ver Detalhes (IA)
                       </button>
                     )}
                   </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
};

export default TaxReportView;
