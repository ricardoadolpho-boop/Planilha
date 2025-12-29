import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { Transaction } from './types';
import { calculateConsolidatedData } from './services/investmentEngine';
import { fetchRealTimePrices, MarketPrice } from './services/geminiService';
import DashboardView from './components/DashboardView';
import TransactionsView from './components/TransactionsView';
import AssetDetailView from './components/AssetDetailView';
import BrokersView from './components/BrokersView';
import TaxReportView from './components/TaxReportView';
import DividendReportView from './components/DividendReportView';

// Firebase Imports
import { db } from './firebaseConfig';
import { collection, onSnapshot, setDoc, doc, updateDoc, deleteDoc, query, writeBatch } from 'firebase/firestore';

const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'dash' | 'tx' | 'brokers' | 'tax' | 'dividends'>('dash');
  const [inspectedTicker, setInspectedTicker] = useState<string | null>(null);
  const [usdRate] = useState(5.45); 
  const [isUpdatingPrices, setIsUpdatingPrices] = useState(false);
  const [marketPrices, setMarketPrices] = useState<Record<string, MarketPrice>>({});
  
  // State agora começa vazio e é preenchido pelo Firestore
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [dbStatus, setDbStatus] = useState<'connecting' | 'connected' | 'error'>('connecting');

  // Efeito para sincronização em Tempo Real (Listener)
  useEffect(() => {
    const q = query(collection(db, "transactions"));
    
    // Feedback imediato de conexão
    setDbStatus('connecting');

    const unsubscribe = onSnapshot(q, 
      (querySnapshot) => {
        const txs: Transaction[] = [];
        querySnapshot.forEach((doc) => {
          // Garantimos que o ID do documento seja o ID da transação
          txs.push({ ...doc.data(), id: doc.id } as Transaction);
        });
        setTransactions(txs);
        setIsLoading(false);
        setDbStatus('connected');
      }, 
      (error) => {
        console.error("Erro ao conectar com Firebase:", error);
        setIsLoading(false);
        setDbStatus('error');
      }
    );

    return () => unsubscribe();
  }, []);

  const tickersToUpdate = useMemo(() => {
    const set = new Set<string>();
    transactions.forEach(t => set.add(t.ticker));
    return Array.from(set);
  }, [transactions]);

  const refreshPrices = useCallback(async () => {
    if (isUpdatingPrices || tickersToUpdate.length === 0) return;
    setIsUpdatingPrices(true);
    
    const result = await fetchRealTimePrices(tickersToUpdate);
    if (result) {
      const priceMap: Record<string, MarketPrice> = {};
      result.prices.forEach(p => {
        priceMap[p.ticker] = p;
      });
      setMarketPrices(priceMap);
    }
    setIsUpdatingPrices(false);
  }, [tickersToUpdate, isUpdatingPrices]);

  useEffect(() => {
    if (tickersToUpdate.length > 0 && Object.keys(marketPrices).length === 0) {
      refreshPrices();
    }
    const interval = setInterval(refreshPrices, 120000); 
    return () => clearInterval(interval);
  }, [tickersToUpdate.length, marketPrices, refreshPrices]);

  const { activePositions, realizedGains, sellMatches, realizedGainDetails, historicalEquity, taxReport } = useMemo(() => 
    calculateConsolidatedData(transactions, usdRate), 
    [transactions, usdRate]
  );

  // CRUD via Firestore
  const addTransaction = async (tx: Transaction) => {
    try {
      await setDoc(doc(db, "transactions", tx.id), tx);
    } catch (e) {
      console.error("Erro ao adicionar transação: ", e);
      alert("Erro ao salvar no banco de dados.");
    }
  };

  const bulkAddTransactions = async (txs: Transaction[]) => {
    try {
      const batch = writeBatch(db);
      txs.forEach((tx) => {
        const docRef = doc(db, "transactions", tx.id);
        batch.set(docRef, tx);
      });
      await batch.commit();
      alert(`${txs.length} transações importadas com sucesso!`);
    } catch (e) {
      console.error("Erro na importação em massa: ", e);
      alert("Erro ao importar dados. Verifique o console.");
    }
  };

  const updateTransaction = async (tx: Transaction) => {
    try {
      const txRef = doc(db, "transactions", tx.id);
      const { id, ...data } = tx;
      await updateDoc(txRef, data);
    } catch (e) {
      console.error("Erro ao atualizar: ", e);
      alert("Erro ao atualizar transação.");
    }
  };

  const deleteTransaction = async (id: string) => {
    try {
      await deleteDoc(doc(db, "transactions", id));
    } catch (e) {
      console.error("Erro ao deletar: ", e);
      alert("Erro ao remover transação.");
    }
  };

  const handleInspectTicker = (ticker: string) => {
    setInspectedTicker(ticker);
    setActiveTab('dash');
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="text-center space-y-4">
          <div className="relative">
            <div className="w-16 h-16 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin mx-auto"></div>
          </div>
          <p className="text-slate-500 font-medium text-sm">Carregando carteira...</p>
        </div>
      </div>
    );
  }

  // Mobile Bottom Nav Component
  const MobileNav = () => (
    <div className="fixed bottom-0 left-0 w-full bg-white border-t border-slate-200 flex justify-around items-center py-3 px-2 z-50 md:hidden shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.1)]">
      <button 
        onClick={() => { setActiveTab('dash'); setInspectedTicker(null); }} 
        className={`flex flex-col items-center gap-1 ${activeTab === 'dash' ? 'text-indigo-600' : 'text-slate-400'}`}
      >
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" /></svg>
        <span className="text-[10px] font-bold">Início</span>
      </button>
      <button 
        onClick={() => { setActiveTab('tx'); setInspectedTicker(null); }} 
        className={`flex flex-col items-center gap-1 ${activeTab === 'tx' ? 'text-indigo-600' : 'text-slate-400'}`}
      >
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 00-2-2M9 5a2 2 0 012-2h2a2 2 0 012 2" /></svg>
        <span className="text-[10px] font-bold">Lançar</span>
      </button>
      <button 
        onClick={() => { setActiveTab('brokers'); setInspectedTicker(null); }} 
        className={`flex flex-col items-center gap-1 ${activeTab === 'brokers' ? 'text-indigo-600' : 'text-slate-400'}`}
      >
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" /></svg>
        <span className="text-[10px] font-bold">Custódia</span>
      </button>
      <button 
        onClick={() => { setActiveTab('tax'); setInspectedTicker(null); }} 
        className={`flex flex-col items-center gap-1 ${activeTab === 'tax' ? 'text-indigo-600' : 'text-slate-400'}`}
      >
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
        <span className="text-[10px] font-bold">Imposto</span>
      </button>
      <button 
        onClick={() => { setActiveTab('dividends'); setInspectedTicker(null); }} 
        className={`flex flex-col items-center gap-1 ${activeTab === 'dividends' ? 'text-indigo-600' : 'text-slate-400'}`}
      >
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" /></svg>
        <span className="text-[10px] font-bold">Proventos</span>
      </button>
    </div>
  );

  return (
    <div className="min-h-screen flex flex-col md:flex-row bg-slate-50">
      {/* Sidebar Desktop - Hidden on Mobile */}
      <aside className="hidden md:flex w-64 bg-slate-900 text-white flex-col sticky top-0 h-screen p-6 shadow-2xl z-10">
        <div className="flex items-center gap-3 mb-10">
          <div className="bg-indigo-600 p-2 rounded-lg shadow-lg shadow-indigo-500/20">
            <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" /></svg>
          </div>
          <h1 className="text-xl font-bold tracking-tight">Finance<span className="text-indigo-400">Engine</span></h1>
        </div>

        <nav className="flex-1 space-y-2">
          {/* Menu Items Desktop */}
          <button onClick={() => { setActiveTab('dash'); setInspectedTicker(null); }} className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all font-medium ${activeTab === 'dash' && !inspectedTicker ? 'bg-indigo-600 text-white shadow-lg' : 'text-slate-400 hover:bg-slate-800'}`}>
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></svg>
            Dashboard
          </button>
          <button onClick={() => { setActiveTab('tx'); setInspectedTicker(null); }} className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all font-medium ${activeTab === 'tx' ? 'bg-indigo-600 text-white shadow-lg' : 'text-slate-400 hover:bg-slate-800'}`}>
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 00-2-2M9 5a2 2 0 012-2h2a2 2 0 012 2" /></svg>
            Lançamentos
          </button>
          <button onClick={() => { setActiveTab('brokers'); setInspectedTicker(null); }} className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all font-medium ${activeTab === 'brokers' ? 'bg-indigo-600 text-white shadow-lg' : 'text-slate-400 hover:bg-slate-800'}`}>
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" /></svg>
            Corretoras
          </button>
          <button onClick={() => { setActiveTab('tax'); setInspectedTicker(null); }} className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all font-medium ${activeTab === 'tax' ? 'bg-indigo-600 text-white shadow-lg' : 'text-slate-400 hover:bg-slate-800'}`}>
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
            Fiscal / DARF
          </button>
          <button onClick={() => { setActiveTab('dividends'); setInspectedTicker(null); }} className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all font-medium ${activeTab === 'dividends' ? 'bg-indigo-600 text-white shadow-lg' : 'text-slate-400 hover:bg-slate-800'}`}>
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" /></svg>
            Proventos
          </button>
        </nav>

        {/* Status de Conexão DB */}
        <div className="mt-6 pt-6 border-t border-slate-800">
           <div className="flex items-center gap-3 px-2">
              <div className="relative">
                 <div className={`w-3 h-3 rounded-full ${dbStatus === 'connected' ? 'bg-emerald-500' : dbStatus === 'error' ? 'bg-rose-500' : 'bg-amber-500'}`}></div>
                 {dbStatus === 'connected' && <div className="absolute top-0 left-0 w-3 h-3 rounded-full bg-emerald-500 animate-ping"></div>}
              </div>
              <div className="flex flex-col">
                 <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Cloud Sync</span>
                 <span className={`text-xs font-bold ${dbStatus === 'connected' ? 'text-emerald-400' : 'text-slate-300'}`}>
                    {dbStatus === 'connected' ? 'Ativo' : dbStatus === 'error' ? 'Erro' : 'Conectando'}
                 </span>
              </div>
           </div>
        </div>
      </aside>

      {/* Main Content with Mobile Padding */}
      <main className="flex-1 p-4 md:p-10 overflow-y-auto pb-24 md:pb-10">
        <header className="mb-6 flex flex-col gap-4">
          <div className="flex justify-between items-center">
            <div className="animate-in fade-in slide-in-from-left-4 duration-500">
              <div className="flex items-center gap-2 mb-1">
                 <h2 className="text-2xl md:text-3xl font-extrabold text-slate-900 tracking-tight">
                   {inspectedTicker ? inspectedTicker : activeTab === 'dash' ? 'Visão Geral' : activeTab === 'tx' ? 'Lançamentos' : activeTab === 'brokers' ? 'Custódia' : activeTab === 'tax' ? 'Fiscal' : 'Proventos'}
                 </h2>
                 {transactions.length > 0 && (
                   <span className="bg-indigo-100 text-indigo-700 text-[9px] font-black px-2 py-0.5 rounded border border-indigo-200 uppercase tracking-widest hidden md:inline-block">
                      {transactions.length} Ops
                   </span>
                 )}
              </div>
              <p className="text-slate-500 font-medium text-xs md:text-base truncate max-w-[200px] md:max-w-none">
                Sincronização em tempo real entre dispositivos.
              </p>
            </div>
            
            <button 
              onClick={refreshPrices}
              disabled={isUpdatingPrices}
              className={`p-2 bg-white border border-slate-200 rounded-xl shadow-sm hover:bg-slate-50 transition-all ${isUpdatingPrices ? 'opacity-50' : ''}`}
            >
              <svg className={`w-5 h-5 ${isUpdatingPrices ? 'animate-spin text-indigo-500' : 'text-slate-600'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
            </button>
          </div>
        </header>

        <div className="max-w-7xl mx-auto">
          {activeTab === 'dash' && (
            inspectedTicker ? (
              <AssetDetailView 
                ticker={inspectedTicker} 
                transactions={transactions} 
                position={activePositions.find(p => p.ticker === inspectedTicker)}
                onBack={() => setInspectedTicker(null)}
                sellMatches={sellMatches}
                marketPrice={marketPrices[inspectedTicker]}
              />
            ) : (
              <DashboardView 
                positions={activePositions} 
                realizedGains={realizedGains} 
                historicalEquity={historicalEquity}
                usdRate={usdRate} 
                onInspectTicker={handleInspectTicker}
                marketPrices={marketPrices}
              />
            )
          )}
          {activeTab === 'tax' && <TaxReportView taxReport={taxReport} />}
          {activeTab === 'dividends' && <DividendReportView transactions={transactions} usdRate={usdRate} />}
          {activeTab === 'brokers' && (
            <BrokersView positions={activePositions} realizedGainDetails={realizedGainDetails} usdRate={usdRate} marketPrices={marketPrices} />
          )}
          {activeTab === 'tx' && (
            <TransactionsView 
              transactions={transactions} 
              onAdd={addTransaction} 
              onBulkAdd={bulkAddTransactions}
              onUpdate={updateTransaction}
              onDelete={deleteTransaction} 
            />
          )}
        </div>
      </main>
      
      {/* Mobile Navigation */}
      <MobileNav />
    </div>
  );
};

export default App;
