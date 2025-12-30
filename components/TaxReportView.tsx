import React, { useState, useEffect } from 'react';
import { TaxMonthlySummary } from '../types';
import { generateDarfExplanation } from '../services/geminiService';

interface Props {
  taxReport: TaxMonthlySummary[];
}

const TaxReportView: React.FC<Props> = ({ taxReport }) => {
  const [modalOpen, setModalOpen] = useState(false);
  const [modalContent, setModalContent] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [selectedSummary, setSelectedSummary] = useState<TaxMonthlySummary | null>(null);

  useEffect(() => {
    if (selectedSummary) {
      setIsLoading(true);
      generateDarfExplanation(selectedSummary).then(content => {
        setModalContent(content);
        setIsLoading(false);
      });
    }
  }, [selectedSummary]);

  const handleOpenModal = (summary: TaxMonthlySummary) => {
    setSelectedSummary(summary);
    setModalOpen(true);
  };

  const handleCloseModal = () => {
    setModalOpen(false);
    setSelectedSummary(null);
    setModalContent('');
  };

  const formatBRL = (val: number) => {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val);
  };
  
  // Função simples para converter Markdown básico em HTML
  const renderMarkdown = (text: string) => {
    const html = text
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>') // Negrito
      .replace(/\n/g, '<br />'); // Quebras de linha
    return { __html: html };
  };

  return (
    <>
      {/* Modal do Assistente Fiscal */}
      {modalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white w-full max-w-2xl rounded-2xl shadow-2xl flex flex-col animate-in fade-in zoom-in-95 duration-300">
            <div className="p-6 border-b border-slate-200 flex justify-between items-start">
              <div>
                <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                  <svg className="w-6 h-6 text-indigo-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
                  Assistente Fiscal Gemini
                </h2>
                <p className="text-sm text-slate-500">Análise e informações para o DARF de {selectedSummary?.month}.</p>
              </div>
              <button onClick={handleCloseModal} className="p-2 text-slate-400 hover:bg-slate-100 rounded-full">&times;</button>
            </div>
            <div className="p-6 flex-1 overflow-y-auto min-h-[200px]">
              {isLoading ? (
                 <div className="flex items-center justify-center h-full">
                    <div className="w-8 h-8 border-2 border-slate-200 border-t-indigo-600 rounded-full animate-spin"></div>
                 </div>
              ) : (
                <div className="prose prose-sm max-w-none text-slate-600 leading-relaxed" dangerouslySetInnerHTML={renderMarkdown(modalContent)} />
              )}
            </div>
            <div className="p-4 bg-slate-50 border-t border-slate-200 text-xs text-slate-400 italic">
              Atenção: Esta é uma simulação gerada por IA. Sempre valide as informações com um profissional de contabilidade.
            </div>
          </div>
        </div>
      )}

      <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
        <div className="bg-indigo-600 p-6 rounded-2xl text-white shadow-lg flex justify-between items-center">
          <div>
            <h2 className="text-2xl font-black">Central de Impostos (Brasil)</h2>
            <p className="text-indigo-100 text-sm mt-1">Apuração mensal automatizada seguindo as regras da Receita Federal.</p>
          </div>
          <div className="bg-indigo-500/30 px-4 py-2 rounded-xl border border-indigo-400/30 hidden md:block">
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
                  <button onClick={() => handleOpenModal(summary)} className="flex items-center gap-2 text-white font-bold text-xs uppercase tracking-widest hover:text-indigo-400 transition-colors">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
                    Simular Guia de Pagamento (DARF) com IA
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </>
  );
};

export default TaxReportView;
