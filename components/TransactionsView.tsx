import React, { useState, useMemo, useRef } from 'react';
import { Transaction, TransactionType, Country, AssetCategory } from '../types';

interface Props {
  transactions: Transaction[];
  onAdd: (tx: Transaction) => void;
  onBulkAdd?: (txs: Transaction[]) => void;
  onUpdate: (tx: Transaction) => void;
  onDelete: (id: string) => void;
}

const TransactionsView: React.FC<Props> = ({ transactions, onAdd, onBulkAdd, onUpdate, onDelete }) => {
  const [showForm, setShowForm] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [importErrors, setImportErrors] = useState<string[]>([]);
  const [tickerSearch, setTickerSearch] = useState('');
  const [countryFilter, setCountryFilter] = useState<'Todos' | Country>('Todos');
  const [typeFilter, setTypeFilter] = useState<'Todos' | TransactionType>('Todos');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const initialFormState = {
    date: new Date().toISOString().split('T')[0],
    ticker: '',
    broker: '',
    country: Country.BR,
    category: AssetCategory.VARIABLE,
    type: TransactionType.BUY,
    quantity: 0,
    unitPrice: 0,
    fees: 0,
    splitFrom: 1,
    splitTo: 2
  };

  const [formData, setFormData] = useState<Omit<Transaction, 'id'>>(initialFormState);

  const filteredTransactions = useMemo(() => {
    return transactions.filter(tx => {
      const matchTicker = tx.ticker.toLowerCase().includes(tickerSearch.toLowerCase());
      const matchCountry = countryFilter === 'Todos' || tx.country === countryFilter;
      const matchType = typeFilter === 'Todos' || tx.type === typeFilter;
      return matchTicker && matchCountry && matchType;
    }).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [transactions, tickerSearch, countryFilter, typeFilter]);

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
    setFormData(initialFormState);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !onBulkAdd) return;

    setImportErrors([]);
    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      const lines = text.split('\n').filter(line => line.trim() !== '');
      if (lines.length <= 1) {
        setImportErrors(["Arquivo CSV vazio ou sem linhas de dados."]);
        return;
      }

      const newTransactions: Transaction[] = [];
      const errors: string[] = [];
      const header = lines[0].trim().toLowerCase();
      const delimiter = header.includes(';') ? ';' : ',';
      
      const parseRobustNumber = (numStr: string | undefined) => {
        if (!numStr || !numStr.trim()) return 0;
        const cleaned = numStr.trim();
        const lastComma = cleaned.lastIndexOf(',');
        const lastDot = cleaned.lastIndexOf('.');
        if (lastComma > lastDot) {
          return parseFloat(cleaned.replace(/\./g, '').replace(',', '.'));
        }
        return parseFloat(cleaned.replace(/,/g, ''));
      };
      
      const parseRobustDate = (dateStr: string | undefined) => {
        if (!dateStr || !dateStr.trim()) return new Date().toISOString().split('T')[0];
        const cleaned = dateStr.trim();
        if (/^\d{2}\/\d{2}\/\d{4}$/.test(cleaned)) {
          const [day, month, year] = cleaned.split('/');
          return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
        }
        return cleaned;
      };

      for (let i = 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;
        const cols = line.split(delimiter).map(c => c.trim());
        
        const expectedColsMin = 7;
        const expectedColsMax = 8;
        if (cols.length < expectedColsMin) {
          errors.push(`Linha ${i + 1}: Colunas insuficientes (esperado ${expectedColsMin} ou ${expectedColsMax}, encontrado ${cols.length}).`);
          continue;
        }

        try {
          const typeStr = cols[4].toLowerCase().trim();
          let type: TransactionType | null = null;
          if (typeStr.includes('compra')) type = TransactionType.BUY;
          else if (typeStr.includes('venda')) type = TransactionType.SELL;
          else if (typeStr.includes('dividendo')) type = TransactionType.DIVIDEND;
          else if (typeStr.includes('bonifica')) type = TransactionType.BONUS;
          else if (typeStr.includes('desdobramento') || typeStr.includes('grupamento')) type = TransactionType.SPLIT;
          
          if (!type) {
            errors.push(`Linha ${i + 1}: Tipo de operação inválido: "${cols[4]}". Use Compra, Venda, etc.`);
            continue;
          }

          const countryStr = cols[3].toUpperCase().trim();
          const country = countryStr === 'EUA' || countryStr === 'USA' ? Country.USA : Country.BR;

          const quantity = parseRobustNumber(cols[5]);
          const unitPrice = parseRobustNumber(cols[6]);
          const fees = cols.length >= expectedColsMax ? parseRobustNumber(cols[7]) : 0;

          if (type !== TransactionType.SPLIT && (isNaN(quantity) || isNaN(unitPrice) || isNaN(fees))) {
              errors.push(`Linha ${i+1}: Valor numérico inválido para Qtd, Preço ou Taxas.`);
              continue;
          }

          newTransactions.push({
            id: crypto.randomUUID(),
            date: parseRobustDate(cols[0]),
            ticker: cols[1].toUpperCase(),
            broker: cols[2],
            country,
            category: AssetCategory.VARIABLE,
            type,
            quantity,
            unitPrice,
            fees,
          });
        } catch (err) {
          errors.push(`Linha ${i + 1}: Erro inesperado. Detalhes: ${(err as Error).message}`);
        }
      }

      setImportErrors(errors);

      if (newTransactions.length > 0) {
        if (confirm(`Encontradas ${newTransactions.length} transações válidas.\n\n${errors.length > 0 ? `${errors.length} linhas com erro foram ignoradas.` : ''}\n\nDeseja importar as transações válidas?`)) {
          onBulkAdd(newTransactions);
          setShowImport(false);
        }
      } else {
        alert(`Nenhuma transação válida foi encontrada. ${errors.length > 0 ? `${errors.length} linhas continham erros.` : ''} Por favor, verifique o arquivo e tente novamente.`);
      }

      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    };
    reader.readAsText(file);
  };

  const handleInlineChange = (id: string, field: keyof Transaction, value: any) => {
    const tx = transactions.find(t => t.id === id);
    if (tx) {
      onUpdate({ ...tx, [field]: value });
    }
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

  const getCurrencySymbol = (country: Country) => country === Country.USA ? 'US$' : 'R$';

  const isSplit = formData.type === TransactionType.SPLIT;

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-800">Histórico</h2>
          <p className="text-xs text-slate-400">Gerenciamento completo de ordens e eventos corporativos.</p>
        </div>
        <div className="flex gap-2 w-full md:w-auto">
           {onBulkAdd && (
             <div className="relative">
               <button 
                 onClick={() => { setShowImport(!showImport); setImportErrors([]); }}
                 className="bg-white text-slate-700 border border-slate-200 px-4 py-3 md:py-2 rounded-xl hover:bg-slate-50 transition-colors font-bold text-xs flex items-center justify-center gap-2 shadow-sm w-full md:w-auto"
               >
                 <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" /></svg>
                 <span className="md:inline">Importar</span>
               </button>
               {showImport && (
                 <div className="absolute top-full right-0 mt-2 w-80 bg-white rounded-xl shadow-2xl border border-slate-200 p-4 z-50 animate-in fade-in slide-in-from-top-2 duration-200">
                    <label className="block w-full text-xs text-slate-500 mb-3 p-3 bg-slate-50 rounded-lg border border-slate-200">
                      <span className="font-bold text-slate-700">Formato CSV (8 colunas):</span><br/>
                      <code className="text-[10px]">Data,Ticker,Corretora,País,Tipo,Qtd,Preço,Taxas</code>
                    </label>
                    <input 
                      type="file" 
                      accept=".csv"
                      ref={fileInputRef}
                      onChange={handleFileUpload}
                      className="block w-full text-xs text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-xs file:font-semibold file:bg-indigo-50 file:text-indigo-700 hover:file:bg-indigo-100"
                    />
                    {importErrors.length > 0 && (
                        <div className="mt-4 max-h-32 overflow-y-auto bg-rose-50 border border-rose-200 rounded-lg p-2 space-y-1">
                          <p className="text-rose-700 font-bold text-xs mb-1">Erros encontrados:</p>
                          {importErrors.map((error, index) => (
                            <p key={index} className="text-rose-600 text-[10px] font-mono">{error}</p>
                          ))}
                        </div>
                    )}
                 </div>
               )}
             </div>
           )}
           <button 
            onClick={() => setShowForm(!showForm)}
            className="flex-1 md:flex-none bg-indigo-600 text-white px-4 py-3 md:py-2 rounded-xl hover:bg-indigo-700 transition-colors font-bold text-xs flex items-center justify-center gap-2 shadow-lg shadow-indigo-500/20"
          >
            {showForm ? 'Fechar' : '+ Lançar'}
          </button>
        </div>
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} className="bg-white p-6 rounded-xl border border-indigo-100 shadow-md animate-in slide-in-from-top-4 duration-200">
          <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-4">
            <div className="space-y-1">
              <label className="text-[10px] font-bold text-slate-500 uppercase">Data</label>
              <input type="date" required value={formData.date} onChange={e => setFormData({...formData, date: e.target.value})} className="w-full p-2 bg-white border border-slate-300 rounded-lg text-slate-800 outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500" />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-bold text-slate-500 uppercase">País</label>
              <select value={formData.country} onChange={e => setFormData({...formData, country: e.target.value as Country})} className="w-full p-2 bg-slate-50 border border-slate-300 rounded-lg text-slate-800 text-sm font-bold outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500">
                <option value={Country.BR}>🇧🇷 Brasil</option>
                <option value={Country.USA}>🇺🇸 EUA</option>
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-bold text-slate-500 uppercase">Ativo</label>
              <input type="text" required placeholder="Ex: VALE3" value={formData.ticker} onChange={e => setFormData({...formData, ticker: e.target.value.toUpperCase()})} className="w-full p-2 bg-white border border-slate-300 rounded-lg text-slate-800 font-bold outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500" />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-bold text-slate-500 uppercase">Corretora</label>
              <input type="text" required value={formData.broker} onChange={e => setFormData({...formData, broker: e.target.value})} className="w-full p-2 bg-white border border-slate-300 rounded-lg text-slate-800 outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500" />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-bold text-slate-500 uppercase">Tipo</label>
              <select value={formData.type} onChange={e => setFormData({...formData, type: e.target.value as TransactionType})} className="w-full p-2 bg-slate-50 border border-slate-300 rounded-lg text-slate-800 text-sm outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500">
                <option value={TransactionType.BUY}>Compra</option>
                <option value={TransactionType.SELL}>Venda</option>
                <option value={TransactionType.DIVIDEND}>Dividendo</option>
                <option value={TransactionType.BONUS}>Bonificação</option>
                <option value={TransactionType.SPLIT}>Desdobramento/Grupamento</option>
              </select>
            </div>
            
            {isSplit ? (
              <>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-500 uppercase">Proporção (DE)</label>
                  <input type="number" step="any" required value={formData.splitFrom} onChange={e => setFormData({...formData, splitFrom: parseFloat(e.target.value) || 0})} className="w-full p-2 bg-white border border-slate-300 rounded-lg text-slate-800 font-mono outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500" />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-500 uppercase">Proporção (PARA)</label>
                  <input type="number" step="any" required value={formData.splitTo} onChange={e => setFormData({...formData, splitTo: parseFloat(e.target.value) || 0})} className="w-full p-2 bg-white border border-slate-300 rounded-lg text-slate-800 font-mono outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500" />
                </div>
                <div className="md:col-span-1 lg:col-span-1 p-4 bg-slate-50 rounded-lg text-xs text-slate-500 italic flex items-center">
                  Ex: Desdobramento 1 para 2. Grupamento 10 para 1.
                </div>
              </>
            ) : (
              <>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-500 uppercase">Qtd</label>
                  <input type="number" step="any" required value={formData.quantity} onChange={e => setFormData({...formData, quantity: parseFloat(e.target.value) || 0})} className="w-full p-2 bg-white border border-slate-300 rounded-lg text-slate-800 outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500" />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-500 uppercase">Preço ({getCurrencySymbol(formData.country)})</label>
                  <input type="number" step="any" required value={formData.unitPrice} onChange={e => setFormData({...formData, unitPrice: parseFloat(e.target.value) || 0})} className="w-full p-2 bg-white border border-slate-300 rounded-lg text-slate-800 outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500" />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-500 uppercase">Taxas ({getCurrencySymbol(formData.country)})</label>
                  <input type="number" step="any" value={formData.fees} onChange={e => setFormData({...formData, fees: parseFloat(e.target.value) || 0})} className="w-full p-2 bg-white border border-slate-300 rounded-lg text-slate-800 outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500" />
                </div>
              </>
            )}

          </div>
          <button type="submit" className="w-full mt-6 bg-emerald-600 text-white py-3 rounded-xl font-bold hover:bg-emerald-700 shadow-lg shadow-emerald-500/20">Salvar Lançamento</button>
        </form>
      )}

      {/* Busca Mobile & Desktop */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-col md:flex-row gap-4">
        <div className="relative w-full md:flex-1">
          <div className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none">
            <svg className="w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path></svg>
          </div>
          <input 
            type="text" 
            placeholder="Filtrar por Ticker..." 
            value={tickerSearch}
            onChange={e => setTickerSearch(e.target.value)}
            className="w-full p-2 pl-10 bg-slate-50 border border-slate-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 placeholder-slate-400"
          />
        </div>
        <div className="flex gap-2 overflow-x-auto pb-1 md:pb-0">
          <select value={countryFilter} onChange={e => setCountryFilter(e.target.value as any)} className="p-2 border border-slate-200 rounded-lg text-sm bg-white min-w-[100px]">
            <option value="Todos">País: Todos</option>
            <option value={Country.BR}>Brasil</option>
            <option value={Country.USA}>EUA</option>
          </select>
          <select value={typeFilter} onChange={e => setTypeFilter(e.target.value as any)} className="p-2 border border-slate-200 rounded-lg text-sm bg-white min-w-[100px]">
            <option value="Todos">Tipo: Todos</option>
            <option value={TransactionType.BUY}>Compra</option>
            <option value={TransactionType.SELL}>Venda</option>
            <option value={TransactionType.DIVIDEND}>Proventos</option>
          </select>
        </div>
      </div>

      {/* MOBILE LIST VIEW (CARDS) */}
      <div className="block md:hidden space-y-3">
        {filteredTransactions.map((tx) => (
          <div key={tx.id} className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-col gap-3">
            <div className="flex justify-between items-start">
              <div>
                 <div className="flex items-center gap-2">
                   <span className="font-black text-lg text-slate-800">{tx.ticker}</span>
                   <span className={`text-[9px] px-1.5 py-0.5 rounded font-bold uppercase ${getTagStyle(tx.type)}`}>{tx.type}</span>
                 </div>
                 <span className="text-xs text-slate-500 font-mono">{tx.date} • {tx.broker}</span>
              </div>
              <button onClick={() => onDelete(tx.id)} className="text-slate-300 p-2">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
              </button>
            </div>
            
            <div className="grid grid-cols-2 gap-2 border-t border-slate-100 pt-3">
               { tx.type === TransactionType.SPLIT ? (
                  <div className="col-span-2 text-center">
                    <p className="text-[10px] font-bold text-slate-400 uppercase">Proporção</p>
                    <p className="text-sm font-bold text-slate-700">{tx.splitFrom} para {tx.splitTo}</p>
                  </div>
               ) : (
                <>
                  <div>
                      <p className="text-[10px] font-bold text-slate-400 uppercase">Quantidade</p>
                      <p className="text-sm font-bold text-slate-700">{tx.quantity}</p>
                  </div>
                  <div className="text-right">
                      <p className="text-[10px] font-bold text-slate-400 uppercase">Valor Un.</p>
                      <p className="text-sm font-bold text-slate-700">{getCurrencySymbol(tx.country)} {tx.unitPrice.toFixed(2)}</p>
                  </div>
                </>
               )}
            </div>
          </div>
        ))}
      </div>

      {/* DESKTOP TABLE VIEW */}
      <div className="hidden md:block bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <table className="w-full text-left text-sm border-collapse">
          <thead className="bg-slate-50 text-slate-500 uppercase text-[10px] font-bold tracking-widest border-b border-slate-200">
            <tr>
              <th className="px-4 py-4">Data</th>
              <th className="px-4 py-4">Ativo</th>
              <th className="px-4 py-4">País</th>
              <th className="px-4 py-4">Tipo</th>
              <th className="px-4 py-4">Qtd</th>
              <th className="px-4 py-4">Preço</th>
              <th className="px-4 py-4">Taxas</th>
              <th className="px-4 py-4 text-right">Ação</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filteredTransactions.map((tx) => (
              <tr key={tx.id} className="group hover:bg-slate-50 transition-colors">
                <td className="px-4 py-2">
                  <input type="date" value={tx.date} onChange={e => handleInlineChange(tx.id, 'date', e.target.value)} className="bg-transparent text-xs text-slate-600" />
                </td>
                <td className="px-4 py-2 font-bold text-slate-800">{tx.ticker}</td>
                <td className="px-4 py-2 text-xs text-slate-600">{tx.country}</td>
                <td className="px-4 py-2">
                  <span className={`text-[10px] px-2 py-0.5 rounded font-bold uppercase ${getTagStyle(tx.type)}`}>
                    {tx.type === TransactionType.SPLIT ? `${tx.type} ${tx.splitFrom}:${tx.splitTo}` : tx.type}
                  </span>
                </td>
                <td className="px-4 py-2 text-slate-700">{tx.type !== TransactionType.SPLIT ? tx.quantity : '-'}</td>
                <td className="px-4 py-2 font-medium text-slate-700">{tx.type !== TransactionType.SPLIT ? tx.unitPrice.toFixed(2) : '-'}</td>
                <td className="px-4 py-2 text-slate-500">{tx.type !== TransactionType.SPLIT ? tx.fees.toFixed(2) : '-'}</td>
                <td className="px-4 py-2 text-right">
                  <button onClick={() => onDelete(tx.id)} className="text-slate-300 hover:text-rose-600 transition-colors">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default TransactionsView;