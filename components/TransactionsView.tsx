import React, { useState, useMemo, useRef } from 'react';
import { Transaction, TransactionType, Country, AssetCategory } from '../types';
import { parseTransactionsFromCSV, ParsedImportResult } from '../services/geminiService';

interface Props {
  transactions: Transaction[];
  onAdd: (tx: Transaction) => void;
  onBulkAdd?: (txs: Transaction[]) => void;
  onUpdate: (tx: Transaction) => void;
  onDelete: (id: string) => void;
}

const TransactionsView: React.FC<Props> = ({ transactions, onAdd, onBulkAdd, onUpdate, onDelete }) => {
  // UI States
  const [showForm, setShowForm] = useState(false);
  const [deleteConfirmationId, setDeleteConfirmationId] = useState<string | null>(null);
  
  // Filter States
  const [tickerSearch, setTickerSearch] = useState('');
  const [countryFilter, setCountryFilter] = useState<'Todos' | Country>('Todos');
  const [typeFilter, setTypeFilter] = useState<'Todos' | TransactionType>('Todos');
  const [dateFilter, setDateFilter] = useState(''); // YYYY-MM

  // Pagination States
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

  // Import States
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isParsing, setIsParsing] = useState(false);
  const [parsedData, setParsedData] = useState<ParsedImportResult | null>(null);
  const [modalTab, setModalTab] = useState<'valid' | 'errors'>('valid');

  // Helper para pegar a data local no formato YYYY-MM-DD
  const getLocalDateString = () => {
    const d = new Date();
    const offset = d.getTimezoneOffset() * 60000;
    return new Date(d.getTime() - offset).toISOString().split('T')[0];
  };

  const initialFormState = {
    date: getLocalDateString(),
    ticker: '',
    broker: '',
    country: Country.BR,
    category: AssetCategory.VARIABLE,
    type: TransactionType.BUY,
    quantity: 0,
    unitPrice: 0,
    fees: 0,
    splitFrom: 1,
    splitTo: 2,
    maturityDate: '',
    interestRate: 0,
  };

  const [formData, setFormData] = useState<Omit<Transaction, 'id'>>(initialFormState);

  // --- INTELIGÊNCIA DE DADOS (HISTORY & AUTOCOMPLETE) ---
  const historyData = useMemo(() => {
    const assetsMap = new Map<string, { broker: string, country: Country, category: AssetCategory }>();
    const brokersSet = new Set<string>();
    const tickersSet = new Set<string>();

    // Ordenamos cronologicamente para que os dados mais recentes prevaleçam no autopreenchimento
    const sortedTx = [...transactions].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    sortedTx.forEach(tx => {
      assetsMap.set(tx.ticker, { 
        broker: tx.broker, 
        country: tx.country, 
        category: tx.category 
      });
      brokersSet.add(tx.broker);
      tickersSet.add(tx.ticker);
    });

    return { 
      assets: assetsMap, 
      brokers: Array.from(brokersSet).sort(),
      tickers: Array.from(tickersSet).sort()
    };
  }, [transactions]);

  // --- FILTROS E PAGINAÇÃO ---
  const filteredTransactions = useMemo(() => {
    return transactions.filter(tx => {
      const matchTicker = tx.ticker.toLowerCase().includes(tickerSearch.toLowerCase()) || 
                          tx.broker.toLowerCase().includes(tickerSearch.toLowerCase());
      const matchCountry = countryFilter === 'Todos' || tx.country === countryFilter;
      const matchType = typeFilter === 'Todos' || tx.type === typeFilter;
      const matchDate = dateFilter === '' || tx.date.startsWith(dateFilter);
      
      return matchTicker && matchCountry && matchType && matchDate;
    }).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [transactions, tickerSearch, countryFilter, typeFilter, dateFilter]);

  const totalPages = Math.ceil(filteredTransactions.length / itemsPerPage);
  const paginatedTransactions = filteredTransactions.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  const handlePageChange = (newPage: number) => {
    if (newPage >= 1 && newPage <= totalPages) {
      setCurrentPage(newPage);
    }
  };

  // --- HANDLERS ---
  
  // Handler Inteligente para Ticker (Autopreenchimento)
  const handleTickerChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value.toUpperCase();
    
    // Verifica se já temos dados históricos desse ativo
    const history = historyData.assets.get(val);
    
    // Só preenche automaticamente se o usuário ainda não tiver mexido nos campos dependentes
    // ou se o formulário estiver "limpo" nesses campos.
    if (history) {
      setFormData(prev => ({
        ...prev,
        ticker: val,
        // Só substitui se estiver vazio ou se o ticker mudou completamente o contexto
        broker: prev.broker ? prev.broker : history.broker, 
        country: history.country,
        category: history.category
      }));
    } else {
      setFormData(prev => ({ ...prev, ticker: val }));
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const newTx: Transaction = { 
      ...formData, 
      id: crypto.randomUUID(),
      quantity: formData.type === TransactionType.SPLIT ? 0 : formData.quantity,
      unitPrice: formData.type === TransactionType.SPLIT ? 0 : formData.unitPrice,
      fees: formData.type === TransactionType.SPLIT ? 0 : formData.fees,
    };
    onAdd(newTx);
    setShowForm(false);
    setFormData({ ...initialFormState, date: getLocalDateString() });
    
    // Resetar filtros para ver o novo item
    setDateFilter('');
    setTickerSearch('');
    setCurrentPage(1);
  };

  const handleDeleteClick = (id: string) => {
    setDeleteConfirmationId(id);
  };

  const confirmDelete = () => {
    if (deleteConfirmationId) {
      onDelete(deleteConfirmationId);
      setDeleteConfirmationId(null);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !onBulkAdd) return;

    setIsParsing(true);
    setParsedData(null);

    const text = await file.text();
    const result = await parseTransactionsFromCSV(text);
    
    setParsedData(result);
    setModalTab(result && result.transactions.length > 0 ? 'valid' : 'errors');
    setIsParsing(false);
    
    if (fileInputRef.current) fileInputRef.current.value = "";
  };
  
  const handleConfirmImport = () => {
    if (parsedData && parsedData.transactions.length > 0 && onBulkAdd) {
      const transactionsWithIds = parsedData.transactions.map(tx => ({
        ...tx,
        id: crypto.randomUUID(),
      } as Transaction));
      onBulkAdd(transactionsWithIds);
    }
    setParsedData(null);
  };

  const handleInlineChange = (id: string, field: keyof Transaction, value: any) => {
    const tx = transactions.find(t => t.id === id);
    if (tx) {
      onUpdate({ ...tx, [field]: value });
    }
  };

  // --- UI HELPERS ---
  const getTagStyle = (type: TransactionType) => {
    switch(type) {
      case TransactionType.BUY: return 'bg-indigo-100 text-indigo-700 border-indigo-200';
      case TransactionType.SELL: return 'bg-rose-100 text-rose-700 border-rose-200';
      case TransactionType.DIVIDEND: return 'bg-amber-100 text-amber-700 border-amber-200';
      case TransactionType.BONUS: return 'bg-purple-100 text-purple-700 border-purple-200';
      case TransactionType.SPLIT: return 'bg-cyan-100 text-cyan-700 border-cyan-200';
      case TransactionType.REDEMPTION: return 'bg-lime-100 text-lime-700 border-lime-200';
      default: return 'bg-slate-100 text-slate-700';
    }
  };

  const getCurrencySymbol = (country: Country) => country === Country.USA ? 'US$' : 'R$';
  const isSplit = formData.type === TransactionType.SPLIT;

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      
      {/* --- DATALISTS PARA AUTOCOMPLETE --- */}
      <datalist id="ticker-suggestions">
        {historyData.tickers.map(t => <option key={t} value={t} />)}
      </datalist>
      <datalist id="broker-suggestions">
        {historyData.brokers.map(b => <option key={b} value={b} />)}
      </datalist>

      {/* --- MODAIS (Loading, Import, Delete) --- */}
      
      {isParsing && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex flex-col items-center justify-center z-[999]">
          <div className="bg-white p-6 rounded-2xl shadow-2xl flex items-center gap-4">
            <div className="w-8 h-8 border-4 border-slate-200 border-t-indigo-600 rounded-full animate-spin"></div>
            <div>
              <h3 className="font-bold text-slate-800">Processando com Gemini AI</h3>
              <p className="text-xs text-slate-500">Interpretando seu extrato...</p>
            </div>
          </div>
        </div>
      )}

      {deleteConfirmationId && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white w-full max-w-sm rounded-2xl shadow-2xl p-6 animate-in zoom-in-95">
             <div className="w-12 h-12 bg-rose-100 rounded-full flex items-center justify-center mb-4 mx-auto text-rose-600">
               <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
             </div>
             <h3 className="text-lg font-bold text-center text-slate-800 mb-2">Excluir Lançamento?</h3>
             <p className="text-sm text-center text-slate-500 mb-6">Esta ação não pode ser desfeita. O histórico financeiro será recalculado.</p>
             <div className="flex gap-3">
               <button onClick={() => setDeleteConfirmationId(null)} className="flex-1 py-2 border border-slate-200 rounded-lg font-bold text-slate-600 hover:bg-slate-50">Cancelar</button>
               <button onClick={confirmDelete} className="flex-1 py-2 bg-rose-600 text-white rounded-lg font-bold hover:bg-rose-700 shadow-lg shadow-rose-500/30">Excluir</button>
             </div>
          </div>
        </div>
      )}

      {parsedData && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white w-full max-w-4xl h-[85vh] rounded-2xl shadow-2xl flex flex-col animate-in fade-in zoom-in-95 duration-300">
            <div className="p-6 border-b border-slate-200 flex justify-between items-start">
              <div>
                <h2 className="text-lg font-bold text-slate-800">Resultado da Importação</h2>
                <p className="text-sm text-slate-500">Revise os dados extraídos pela Inteligência Artificial.</p>
              </div>
              <div className="flex gap-2 bg-slate-100 p-1 rounded-lg">
                <button onClick={() => setModalTab('valid')} className={`px-3 py-1.5 rounded-md text-xs font-bold transition-all ${modalTab === 'valid' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500'}`}>
                  Válidos ({parsedData.transactions.length})
                </button>
                <button onClick={() => setModalTab('errors')} className={`px-3 py-1.5 rounded-md text-xs font-bold transition-all ${modalTab === 'errors' ? 'bg-white text-rose-600 shadow-sm' : 'text-slate-500'}`}>
                  Erros ({parsedData.errors.length})
                </button>
              </div>
            </div>
            <div className="flex-1 p-0 overflow-hidden relative">
               <div className="absolute inset-0 overflow-y-auto p-6">
                {modalTab === 'valid' ? (
                  <table className="w-full text-left text-xs border-collapse">
                    <thead className="bg-slate-50 sticky top-0 z-10"><tr className="border-b border-slate-200">
                      <th className="py-3 px-2 font-bold text-slate-500 uppercase">Data</th>
                      <th className="py-3 px-2 font-bold text-slate-500 uppercase">Ticker</th>
                      <th className="py-3 px-2 font-bold text-slate-500 uppercase">Tipo</th>
                      <th className="py-3 px-2 font-bold text-slate-500 uppercase text-right">Qtd</th>
                      <th className="py-3 px-2 font-bold text-slate-500 uppercase text-right">Preço</th>
                    </tr></thead>
                    <tbody className="divide-y divide-slate-100">
                      {parsedData.transactions.map((tx, idx) => (
                        <tr key={idx} className="hover:bg-slate-50">
                          <td className="py-2 px-2 font-mono text-slate-600">{tx.date}</td>
                          <td className="py-2 px-2 font-bold text-slate-800">{tx.ticker}</td>
                          <td className="py-2 px-2"><span className={`text-[9px] uppercase px-1.5 py-0.5 rounded border ${getTagStyle(tx.type)}`}>{tx.type}</span></td>
                          <td className="py-2 px-2 text-right font-mono">{tx.quantity}</td>
                          <td className="py-2 px-2 text-right font-mono">{tx.unitPrice}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <div className="space-y-2">
                    {parsedData.errors.length === 0 ? <p className="text-center text-slate-400 italic py-10">Nenhum erro encontrado.</p> : 
                    parsedData.errors.map((err, idx) => (
                      <div key={idx} className="bg-rose-50 border border-rose-100 p-3 rounded-lg font-mono text-xs text-rose-700 flex items-start gap-2">
                        <span className="text-rose-400 select-none">•</span> {err}
                      </div>
                    ))}
                  </div>
                )}
               </div>
            </div>
            <div className="p-4 border-t border-slate-200 flex justify-end gap-3 bg-slate-50 rounded-b-2xl">
              <button onClick={() => setParsedData(null)} className="px-4 py-2 text-sm font-bold text-slate-600 hover:text-slate-800">Cancelar</button>
              <button onClick={handleConfirmImport} disabled={parsedData.transactions.length === 0} className="bg-indigo-600 text-white px-6 py-2 rounded-lg font-bold text-sm hover:bg-indigo-700 shadow-lg shadow-indigo-500/20 disabled:opacity-50 disabled:shadow-none">
                Confirmar Importação
              </button>
            </div>
          </div>
        </div>
      )}

      {/* --- HEADER DA VIEW --- */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4 border-b border-slate-200 pb-6">
        <div>
          <h2 className="text-xl font-black text-slate-800">Livro de Ordens</h2>
          <p className="text-sm text-slate-500 mt-1">Gerencie manualmente ou importe notas de corretagem.</p>
        </div>
        <div className="flex gap-2 w-full md:w-auto">
           {onBulkAdd && (
             <>
              <input type="file" accept=".csv,.txt" ref={fileInputRef} onChange={handleFileUpload} className="hidden" />
              <button 
                 onClick={() => fileInputRef.current?.click()}
                 disabled={isParsing}
                 className="flex-1 md:flex-none bg-white text-slate-700 border border-slate-200 px-4 py-2.5 rounded-xl hover:bg-slate-50 transition-colors font-bold text-xs flex items-center justify-center gap-2 shadow-sm"
               >
                 <svg className="w-4 h-4 text-indigo-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" /></svg>
                 Importar (IA)
               </button>
             </>
           )}
           <button 
            onClick={() => setShowForm(!showForm)}
            className={`flex-1 md:flex-none px-5 py-2.5 rounded-xl font-bold text-xs flex items-center justify-center gap-2 shadow-lg transition-all ${showForm ? 'bg-slate-200 text-slate-600' : 'bg-indigo-600 text-white hover:bg-indigo-700 shadow-indigo-500/20'}`}
          >
            {showForm ? 'Cancelar' : '+ Nova Ordem'}
          </button>
        </div>
      </div>

      {/* --- FORMULÁRIO DE CADASTRO --- */}
      {showForm && (
        <form onSubmit={handleSubmit} className="bg-white rounded-2xl border border-indigo-100 shadow-xl overflow-hidden animate-in slide-in-from-top-4 duration-300">
          <div className="bg-indigo-50/50 px-6 py-3 border-b border-indigo-100 flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-indigo-500"></div>
            <h3 className="font-bold text-indigo-900 text-sm">Detalhes da Transação</h3>
          </div>
          <div className="p-6 grid grid-cols-1 md:grid-cols-12 gap-6">
            
            {/* Seção 1: Básico */}
            <div className="md:col-span-12 lg:col-span-4 space-y-4">
               <div className="space-y-1">
                 <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Operação</label>
                 <div className="grid grid-cols-2 gap-2">
                   <select value={formData.type} onChange={e => setFormData({...formData, type: e.target.value as TransactionType})} className="col-span-2 w-full p-2.5 bg-slate-50 border border-slate-300 rounded-lg text-slate-800 text-sm font-semibold outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500">
                      <option value={TransactionType.BUY}>Compra</option>
                      <option value={TransactionType.SELL}>Venda</option>
                      <option value={TransactionType.DIVIDEND}>Proventos</option>
                      <option value={TransactionType.BONUS}>Bonificação</option>
                      <option value={TransactionType.SPLIT}>Desdobramento</option>
                      <option value={TransactionType.REDEMPTION}>Resgate</option>
                   </select>
                 </div>
               </div>
               <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Data</label>
                    <input type="date" required value={formData.date} onChange={e => setFormData({...formData, date: e.target.value})} className="w-full p-2.5 bg-white border border-slate-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-indigo-500/50" />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">País</label>
                    <select value={formData.country} onChange={e => setFormData({...formData, country: e.target.value as Country})} className="w-full p-2.5 bg-white border border-slate-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-indigo-500/50">
                      <option value={Country.BR}>🇧🇷 Brasil</option>
                      <option value={Country.USA}>🇺🇸 EUA</option>
                    </select>
                  </div>
               </div>
            </div>

            {/* Seção 2: Ativo */}
            <div className="md:col-span-12 lg:col-span-4 space-y-4">
              <div className="space-y-1">
                 <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Ativo (Ticker)</label>
                 <input 
                   type="text" 
                   list="ticker-suggestions" 
                   required 
                   placeholder="Ex: PETR4, AAPL" 
                   value={formData.ticker} 
                   onChange={handleTickerChange} 
                   className="w-full p-2.5 bg-white border border-slate-300 rounded-lg font-bold text-slate-800 outline-none focus:ring-2 focus:ring-indigo-500/50" 
                 />
                 <p className="text-[9px] text-slate-400 text-right mt-1">Preenche corretora e país automaticamente</p>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                   <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Corretora</label>
                   <input 
                      type="text" 
                      list="broker-suggestions"
                      required 
                      placeholder="Ex: XP, Avenue" 
                      value={formData.broker} 
                      onChange={e => setFormData({...formData, broker: e.target.value})} 
                      className="w-full p-2.5 bg-white border border-slate-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-indigo-500/50" 
                   />
                </div>
                <div className="space-y-1">
                   <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Categoria</label>
                   <select value={formData.category} onChange={e => setFormData({...formData, category: e.target.value as AssetCategory})} className="w-full p-2.5 bg-white border border-slate-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-indigo-500/50">
                      <option value={AssetCategory.VARIABLE}>Renda Variável</option>
                      <option value={AssetCategory.FII}>FII</option>
                      <option value={AssetCategory.FIXED}>Renda Fixa</option>
                   </select>
                </div>
              </div>
            </div>

            {/* Seção 3: Valores */}
            <div className="md:col-span-12 lg:col-span-4 bg-slate-50 p-4 rounded-xl border border-slate-200">
               {isSplit ? (
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1"><label className="text-[10px] font-bold text-slate-500 uppercase">De (Qtd)</label><input type="number" step="any" required value={formData.splitFrom} onChange={e => setFormData({...formData, splitFrom: parseFloat(e.target.value) || 0})} className="w-full p-2 bg-white border border-slate-300 rounded-lg font-mono" /></div>
                    <div className="space-y-1"><label className="text-[10px] font-bold text-slate-500 uppercase">Para (Qtd)</label><input type="number" step="any" required value={formData.splitTo} onChange={e => setFormData({...formData, splitTo: parseFloat(e.target.value) || 0})} className="w-full p-2 bg-white border border-slate-300 rounded-lg font-mono" /></div>
                  </div>
               ) : (
                  <div className="space-y-3">
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1"><label className="text-[10px] font-bold text-slate-500 uppercase">Quantidade</label><input type="number" step="any" required value={formData.quantity} onChange={e => setFormData({...formData, quantity: parseFloat(e.target.value) || 0})} className="w-full p-2 bg-white border border-slate-300 rounded-lg font-mono" /></div>
                      <div className="space-y-1"><label className="text-[10px] font-bold text-slate-500 uppercase">Preço ({getCurrencySymbol(formData.country)})</label><input type="number" step="any" required value={formData.unitPrice} onChange={e => setFormData({...formData, unitPrice: parseFloat(e.target.value) || 0})} className="w-full p-2 bg-white border border-slate-300 rounded-lg font-mono" /></div>
                    </div>
                    <div className="space-y-1"><label className="text-[10px] font-bold text-slate-500 uppercase">Taxas Totais ({getCurrencySymbol(formData.country)})</label><input type="number" step="any" value={formData.fees} onChange={e => setFormData({...formData, fees: parseFloat(e.target.value) || 0})} className="w-full p-2 bg-white border border-slate-300 rounded-lg font-mono" /></div>
                  </div>
               )}
            </div>

            {/* Campos Extras (Renda Fixa) */}
            {formData.category === AssetCategory.FIXED && formData.type === TransactionType.BUY && (
               <div className="md:col-span-12 grid grid-cols-2 gap-4 pt-4 border-t border-slate-100">
                  <div className="space-y-1"><label className="text-[10px] font-bold text-slate-500 uppercase">Vencimento</label><input type="date" value={formData.maturityDate} onChange={e => setFormData({...formData, maturityDate: e.target.value})} className="w-full p-2 bg-white border border-slate-300 rounded-lg text-sm" /></div>
                  <div className="space-y-1"><label className="text-[10px] font-bold text-slate-500 uppercase">Taxa (%)</label><input type="number" step="any" placeholder="12.5" value={formData.interestRate} onChange={e => setFormData({...formData, interestRate: parseFloat(e.target.value) || 0})} className="w-full p-2 bg-white border border-slate-300 rounded-lg text-sm" /></div>
               </div>
            )}
            
            <div className="md:col-span-12 pt-2">
              <button type="submit" className="w-full bg-emerald-600 text-white py-3 rounded-xl font-bold hover:bg-emerald-700 shadow-lg shadow-emerald-500/20 active:scale-[0.99] transition-all">
                Salvar Lançamento
              </button>
            </div>
          </div>
        </form>
      )}

      {/* --- BARRA DE FERRAMENTAS (Filtros) --- */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-col md:flex-row gap-4">
        <div className="relative w-full md:flex-1">
          <div className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none text-slate-400">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path></svg>
          </div>
          <input type="text" placeholder="Buscar Ticker ou Corretora..." value={tickerSearch} onChange={e => {setTickerSearch(e.target.value); setCurrentPage(1);}} className="w-full p-2.5 pl-10 bg-slate-50 border border-slate-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-indigo-500/50 transition-all placeholder-slate-400"/>
        </div>
        
        <div className="flex gap-2 overflow-x-auto pb-1 md:pb-0 no-scrollbar">
          <input type="month" value={dateFilter} onChange={e => {setDateFilter(e.target.value); setCurrentPage(1);}} className="p-2.5 border border-slate-200 rounded-lg text-sm bg-white text-slate-600 outline-none focus:border-indigo-500" />
          
          <select value={countryFilter} onChange={e => {setCountryFilter(e.target.value as any); setCurrentPage(1);}} className="p-2.5 border border-slate-200 rounded-lg text-sm bg-white text-slate-600 outline-none focus:border-indigo-500 cursor-pointer">
            <option value="Todos">País: Todos</option>
            <option value={Country.BR}>Brasil</option>
            <option value={Country.USA}>EUA</option>
          </select>
          
          <select value={typeFilter} onChange={e => {setTypeFilter(e.target.value as any); setCurrentPage(1);}} className="p-2.5 border border-slate-200 rounded-lg text-sm bg-white text-slate-600 outline-none focus:border-indigo-500 cursor-pointer">
            <option value="Todos">Tipo: Todos</option>
            <option value={TransactionType.BUY}>Compra</option>
            <option value={TransactionType.SELL}>Venda</option>
            <option value={TransactionType.DIVIDEND}>Proventos</option>
          </select>
        </div>
      </div>

      {/* --- LISTAGEM DE TRANSAÇÕES --- */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden flex flex-col min-h-[400px]">
        {/* MOBILE VIEW */}
        <div className="block md:hidden divide-y divide-slate-100">
          {paginatedTransactions.map((tx) => (
            <div key={tx.id} className="p-4 flex flex-col gap-3">
              <div className="flex justify-between items-start">
                <div>
                   <div className="flex items-center gap-2 mb-1">
                     <span className="font-black text-lg text-slate-800">{tx.ticker}</span>
                     <span className={`text-[9px] px-1.5 py-0.5 rounded border font-bold uppercase ${getTagStyle(tx.type)}`}>{tx.type}</span>
                   </div>
                   <div className="flex items-center gap-2 text-xs text-slate-500 font-mono">
                     <span>{new Date(tx.date).toLocaleDateString()}</span>
                     <span>•</span>
                     <span>{tx.broker}</span>
                   </div>
                </div>
                <button onClick={() => handleDeleteClick(tx.id)} className="text-slate-300 p-2 hover:text-rose-500 transition-colors"><svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg></button>
              </div>
              <div className="bg-slate-50 p-3 rounded-lg grid grid-cols-2 gap-4 border border-slate-100">
                 { tx.type === TransactionType.SPLIT ? (
                   <div className="col-span-2 text-center"><p className="text-[10px] font-bold text-slate-400 uppercase">Proporção</p><p className="text-sm font-bold text-slate-700">{tx.splitFrom} para {tx.splitTo}</p></div>
                 ) : ( 
                   <>
                     <div><p className="text-[10px] font-bold text-slate-400 uppercase">Quantidade</p><p className="text-sm font-bold text-slate-700">{tx.quantity}</p></div>
                     <div className="text-right"><p className="text-[10px] font-bold text-slate-400 uppercase">Total</p><p className="text-sm font-bold text-slate-700">{getCurrencySymbol(tx.country)} {(tx.quantity * tx.unitPrice).toLocaleString(undefined, {minimumFractionDigits: 2})}</p></div>
                   </>
                 )}
              </div>
            </div>
          ))}
        </div>

        {/* DESKTOP TABLE VIEW */}
        <div className="hidden md:block flex-1 overflow-x-auto">
          <table className="w-full text-left text-sm border-collapse">
            <thead className="bg-slate-50 text-slate-500 uppercase text-[10px] font-bold tracking-widest border-b border-slate-200">
              <tr>
                <th className="px-6 py-4 w-32">Data</th>
                <th className="px-6 py-4 w-24">Ativo</th>
                <th className="px-6 py-4">Corretora</th>
                <th className="px-6 py-4 w-40">Tipo</th>
                <th className="px-6 py-4 text-right">Qtd</th>
                <th className="px-6 py-4 text-right">Preço Un.</th>
                <th className="px-6 py-4 text-right">Taxas</th>
                <th className="px-6 py-4 text-center w-16">Ação</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {paginatedTransactions.map((tx) => (
                <tr key={tx.id} className="group hover:bg-slate-50/80 transition-colors">
                  <td className="px-6 py-3">
                    <input 
                      type="date" 
                      value={tx.date} 
                      onChange={e => handleInlineChange(tx.id, 'date', e.target.value)} 
                      className="bg-transparent text-xs font-mono text-slate-600 focus:bg-white focus:ring-1 focus:ring-indigo-200 rounded p-1 w-full" 
                    />
                  </td>
                  <td className="px-6 py-3 font-bold text-slate-800">{tx.ticker}</td>
                  <td className="px-6 py-3 text-xs font-medium text-slate-500">{tx.broker}</td>
                  <td className="px-6 py-3">
                    <span className={`text-[10px] px-2 py-0.5 rounded border font-bold uppercase tracking-wide ${getTagStyle(tx.type)}`}>
                      {tx.type === TransactionType.SPLIT ? `SPLIT ${tx.splitFrom}:${tx.splitTo}` : tx.type}
                    </span>
                  </td>
                  <td className="px-6 py-3 text-right font-mono text-slate-700">
                    {tx.type !== TransactionType.SPLIT ? tx.quantity : '-'}
                  </td>
                  <td className="px-6 py-3 text-right font-mono text-slate-700">
                    {tx.type !== TransactionType.SPLIT ? tx.unitPrice.toFixed(2) : '-'}
                  </td>
                  <td className="px-6 py-3 text-right font-mono text-slate-400 text-xs">
                    {tx.type !== TransactionType.SPLIT ? tx.fees.toFixed(2) : '-'}
                  </td>
                  <td className="px-6 py-3 text-center">
                    <button onClick={() => handleDeleteClick(tx.id)} className="text-slate-300 hover:text-rose-600 transition-colors p-1 rounded-full hover:bg-rose-50">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                    </button>
                  </td>
                </tr>
              ))}
              {paginatedTransactions.length === 0 && (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-slate-400 italic">
                    Nenhuma transação encontrada com os filtros atuais.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* --- PAGINAÇÃO --- */}
        {totalPages > 1 && (
          <div className="bg-white border-t border-slate-200 p-4 flex justify-between items-center sticky bottom-0">
             <div className="text-xs text-slate-500 font-medium">
               Mostrando {((currentPage - 1) * itemsPerPage) + 1} a {Math.min(currentPage * itemsPerPage, filteredTransactions.length)} de {filteredTransactions.length}
             </div>
             <div className="flex gap-2">
                <button 
                  onClick={() => handlePageChange(currentPage - 1)} 
                  disabled={currentPage === 1}
                  className="p-2 border border-slate-200 rounded-lg hover:bg-slate-50 disabled:opacity-50 disabled:hover:bg-white text-slate-600"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 19l-7-7 7-7" /></svg>
                </button>
                <div className="flex items-center px-4 font-bold text-sm text-slate-700 bg-slate-50 rounded-lg border border-slate-100">
                   {currentPage} / {totalPages}
                </div>
                <button 
                  onClick={() => handlePageChange(currentPage + 1)} 
                  disabled={currentPage === totalPages}
                  className="p-2 border border-slate-200 rounded-lg hover:bg-slate-50 disabled:opacity-50 disabled:hover:bg-white text-slate-600"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7" /></svg>
                </button>
             </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default TransactionsView;
