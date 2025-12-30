import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { Transaction, AnnouncedDividend } from './types';
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

// Componente de Navegação Mobile Extraído
const MobileNav = ({ activeTab, setActiveTab }: { activeTab: string, setActiveTab: (t: any) => void }) => {
  const tabs = [
    { id: 'dash', label: 'Início', icon: 'M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6' },
    { id: 'brokers', label: 'Custódia', icon: 'M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4' },
    { id: 'tx', label: 'Lançar', icon: 'M9 5H7a2 2 0 00-2-2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 00-2-2M9 5a2 2 0 012-2h2a2 2 0 012 2' },
    { id: 'dividends', label: 'Proventos', icon: 'M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z' },
    { id: 'tax', label: 'Imposto', icon: 'M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z' }
  ];

  return (
    <div className="fixed bottom-0 left-0 w-full bg-white border-t border-slate-200 flex justify-around items-center py-3 px-2 z-50 md:hidden shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.1)] safe-area-bottom">
      {tabs.map(tab => (
        <button 
          key={tab.id}
          onClick={() => setActiveTab(tab.id)} 
          className={`flex flex-col items-center gap-1 ${activeTab === tab.id ? 'text-indigo-600' : 'text-slate-400'}`}
        >
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d={tab.icon} /></svg>
          <span className="text-[10px] font-bold">{tab.label}</span>
        </button>
      ))}
    </div>
  );
};

const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'dash' | 'tx' | 'brokers' | 'tax' | 'dividends'>('dash');
  const [inspectedTicker, setInspectedTicker] = useState<string | null>(null);
  const [usdRate] = useState(5.45); 
  const [isUpdatingPrices, setIsUpdatingPrices] = useState(false);
  const [hasAttemptedAutoRefresh, setHasAttemptedAutoRefresh] = useState(false);
  
  // State inicializa lendo do LocalStorage
  const [marketPrices, setMarketPrices] = useState<Record<string, MarketPrice>>(() => {
    try {
      const cached = localStorage.getItem('gemini_prices_cache_v1');
      if (cached) {
        const parsed = JSON.parse(cached);
        const priceMap: Record<string, MarketPrice> = {};
        if (parsed.data && Array.isArray(parsed.data.prices)) {
           parsed.data.prices.forEach((p: MarketPrice) => {
             priceMap[p.ticker] = p;
           });
           return priceMap;
        }
      }
    } catch(e) { console.error("Erro ao ler cache inicial", e); }
    return {};
  });

  const [lastUpdated, setLastUpdated] = useState<Date | null>(() => {
    try {
      const cached = localStorage.getItem('gemini_prices_cache_v1');
      if (cached) return new Date(JSON.parse(cached).timestamp);
    } catch(e) {}
    return null;
  });
  
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [announcedDividends, setAnnouncedDividends] = useState<AnnouncedDividend[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [dbStatus, setDbStatus] = useState<'connecting' | 'connected' | 'error'>('connecting');

  // Efeito de Inicialização (Firebase)
  useEffect(() => {
    setDbStatus('connecting');
    
    const unsubscribeTx = onSnapshot(query(collection(db, "transactions")), 
      (snapshot) => {
        setTransactions(snapshot.docs.map(d => ({ ...d.data(), id: d.id } as Transaction)));
        setIsLoading(false);
        setDbStatus('connected');
      }, 
      (error) => {
        console.error("Erro TX:", error);
        setIsLoading(false);
        setDbStatus('error');
      }
    );

    const unsubscribeDiv = onSnapshot(query(collection(db, "announced_dividends")),
      (snapshot) => {
        setAnnouncedDividends(snapshot.docs.map(d => ({ ...d.data(), id: d.id } as AnnouncedDividend)));
      },
      (error) => console.error("Erro Div:", error)
    );

    return () => { unsubscribeTx(); unsubscribeDiv(); };
  }, []);

  // Lista de tickers únicos para atualização
  const tickersToUpdate = useMemo(() => {
    const set = new Set<string>();
    transactions.forEach(t => set.add(t.ticker));
    return Array.from(set);
  }, [transactions]);

  // Função de atualização de preços
  const refreshPrices = useCallback(async () => {
    if (isUpdatingPrices || tickersToUpdate.length === 0) return;
    setIsUpdatingPrices(true);
    
    try {
      const result = await fetchRealTimePrices(tickersToUpdate);
      if (result) {
        const priceMap: Record<string, MarketPrice> = {};
        result.prices.forEach(p => { priceMap[p.ticker] = p; });
        setMarketPrices(prev => ({...prev, ...priceMap}));
        setLastUpdated(new Date());
      }
    } catch(e) {
      console.error("Erro ao atualizar preços", e);
    } finally {
      setIsUpdatingPrices(false);
    }
  }, [tickersToUpdate, isUpdatingPrices]);

  // Autoload inicial de preços - Lógica Protegida contra Loops
  useEffect(() => {
    // Só tenta atualizar automaticamente se:
    // 1. Dados carregaram (isLoading false)
    // 2. Temos tickers na carteira
    // 3. Ainda NÃO tentamos atualizar nesta sessão (hasAttemptedAutoRefresh false)
    if (!isLoading && tickersToUpdate.length > 0 && !hasAttemptedAutoRefresh) {
      
      const doRefresh = async () => {
         // Marca como tentado imediatamente para evitar múltiplas chamadas
         setHasAttemptedAutoRefresh(true);
         
         // Se não temos preços em cache ou na memória, chama atualização
         if (Object.keys(marketPrices).length === 0) {
            await refreshPrices();
         }
      };

      // Pequeno delay para garantir que UI já montou
      const timer = setTimeout(doRefresh, 1000);
      return () => clearTimeout(timer);
    }
  }, [isLoading, tickersToUpdate.length, hasAttemptedAutoRefresh, marketPrices, refreshPrices]); 

  // Engine Calculation
  const engineData = useMemo(() => 
    calculateConsolidatedData(transactions, usdRate), 
    [transactions, usdRate]
  );

  // CRUD wrappers
  const handleInspectTicker = (ticker: string | null) => {
    setInspectedTicker(ticker);
    if(ticker) setActiveTab('dash');
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="text-center space-y-4">
          <div className="w-16 h-16 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin mx-auto"></div>
          <p className="text-slate-500 font-medium text-sm">Sincronizando carteira...</p>
        </div>
      </div>
    );
  }
  
  if (dbStatus === 'error') {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="text-center space-y-4 bg-white p-8 rounded-2xl shadow-lg border border-rose-200 max-w-md">
          <div className="mx-auto w-16 h-16 rounded-full bg-rose-100 flex items-center justify-center">
            <svg className="w-8 h-8 text-rose-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
          </div>
          <h2 className="text-xl font-bold text-slate-800">Sem Conexão</h2>
          <p className="text-slate-500 text-sm">Não foi possível carregar seus dados (Permissão Negada ou Erro de Rede).</p>
          <button onClick={() => window.location.reload()} className="bg-indigo-600 text-white px-4 py-2 rounded-lg font-bold text-sm hover:bg-indigo-700">Tentar Novamente</button>
        </div>
      </div>
    );
  }

  const handleTabChange = (tab: any) => {
    setActiveTab(tab);
    setInspectedTicker(null);
  };

  return (
    <div className="min-h-screen flex flex-col md:flex-row bg-slate-50">
      {/* Sidebar Desktop */}
      <aside className="hidden md:flex w-64 bg-slate-900 text-white flex-col sticky top-0 h-screen p-6 shadow-2xl z-10">
        <div className="flex items-center gap-3 mb-10">
          <div className="bg-indigo-600 p-2 rounded-lg shadow-lg shadow-indigo-500/20">
            <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" /></svg>
          </div>
          <h1 className="text-xl font-bold tracking-tight">Finance<span className="text-indigo-400">Engine</span></h1>
        </div>

        <nav className="flex-1 space-y-2">
          {[
            { id: 'dash', label: 'Dashboard', icon: 'M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z' },
            { id: 'brokers', label: 'Custódia', icon: 'M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4' },
            { id: 'tx', label: 'Lançamentos', icon: 'M9 5H7a2 2 0 00-2-2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 00-2-2M9 5a2 2 0 012-2h2a2 2 0 012 2' },
            { id: 'dividends', label: 'Proventos', icon: 'M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z' },
            { id: 'tax', label: 'Fiscal / DARF', icon: 'M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z' }
          ].map(item => (
            <button 
              key={item.id}
              onClick={() => handleTabChange(item.id)} 
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all font-medium ${activeTab === item.id ? 'bg-indigo-600 text-white shadow-lg' : 'text-slate-400 hover:bg-slate-800'}`}
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d={item.icon} /></svg>
              {item.label}
            </button>
          ))}
        </nav>

        <div className="mt-6 pt-6 border-t border-slate-800">
           <div className="flex items-center gap-3 px-2">
              <div className="relative">
                 <div className={`w-3 h-3 rounded-full ${dbStatus === 'connected' ? 'bg-emerald-500' : 'bg-amber-500'}`}></div>
                 {dbStatus === 'connected' && <div className="absolute top-0 left-0 w-3 h-3 rounded-full bg-emerald-500 animate-ping"></div>}
              </div>
              <div className="flex flex-col">
                 <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Status</span>
                 <span className={`text-xs font-bold ${dbStatus === 'connected' ? 'text-emerald-400' : 'text-slate-300'}`}>
                    {dbStatus === 'connected' ? 'Online' : 'Reconectando'}
                 </span>
              </div>
           </div>
        </div>
      </aside>

      <main className="flex-1 p-4 md:p-10 overflow-y-auto pb-24 md:pb-10">
        <header className="mb-6 flex flex-col gap-4">
          <div className="flex justify-between items-center">
            <div>
              <div className="flex items-center gap-2 mb-1">
                 <h2 className="text-2xl md:text-3xl font-extrabold text-slate-900 tracking-tight">
                   {inspectedTicker || (activeTab === 'dash' ? 'Visão Geral' : activeTab === 'tx' ? 'Lançamentos' : activeTab === 'brokers' ? 'Custódia' : activeTab === 'tax' ? 'Fiscal' : 'Proventos')}
                 </h2>
                 {transactions.length > 0 && <span className="bg-indigo-100 text-indigo-700 text-[9px] font-black px-2 py-0.5 rounded border border-indigo-200 uppercase tracking-widest hidden md:inline-block">{transactions.length} Ops</span>}
              </div>
              <p className="text-slate-500 font-medium text-xs md:text-base truncate max-w-[200px] md:max-w-none">
                Sincronização em tempo real.
              </p>
            </div>
            
            <div className="flex items-center gap-3">
              {lastUpdated && (
                <div className="text-right hidden sm:block">
                  <p className="text-[10px] text-slate-400 uppercase font-bold tracking-wider">Cotação</p>
                  <p className="text-xs font-bold text-slate-600">{lastUpdated.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p>
                </div>
              )}
              <button 
                onClick={refreshPrices}
                disabled={isUpdatingPrices}
                className={`flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 rounded-xl shadow-sm hover:bg-slate-50 transition-all ${isUpdatingPrices ? 'opacity-50 cursor-not-allowed' : 'hover:border-indigo-300'}`}
              >
                <svg className={`w-5 h-5 ${isUpdatingPrices ? 'animate-spin text-indigo-500' : 'text-slate-600'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
                <span className="text-sm font-bold text-slate-700 hidden md:inline">Atualizar</span>
              </button>
            </div>
          </div>
        </header>

        <div className="max-w-7xl mx-auto">
          {activeTab === 'dash' && (
            inspectedTicker ? (
              <AssetDetailView 
                ticker={inspectedTicker} 
                transactions={transactions} 
                position={engineData.activePositions.find(p => p.ticker === inspectedTicker)}
                onBack={() => setInspectedTicker(null)}
                sellMatches={engineData.sellMatches}
                marketPrice={marketPrices[inspectedTicker]}
                usdRate={usdRate}
              />
            ) : (
              <DashboardView 
                positions={engineData.activePositions} 
                realizedGains={engineData.realizedGains} 
                historicalEquity={engineData.historicalEquity}
                usdRate={usdRate} 
                onInspectTicker={(t) => handleInspectTicker(t)}
                marketPrices={marketPrices}
              />
            )
          )}
          
          {activeTab === 'tax' && <TaxReportView taxReport={engineData.taxReport} />}
          
          {activeTab === 'dividends' && (
            <DividendReportView 
              transactions={transactions} 
              usdRate={usdRate}
              announcedDividends={announcedDividends}
              positions={engineData.activePositions}
              onAddAnnouncedDividend={(div) => setDoc(doc(db, "announced_dividends", div.id), div)}
              onDeleteAnnouncedDividend={(id) => deleteDoc(doc(db, "announced_dividends", id))}
            />
          )}
          
          {activeTab === 'brokers' && (
            <BrokersView positions={engineData.activePositions} usdRate={usdRate} marketPrices={marketPrices} />
          )}
          
          {activeTab === 'tx' && (
            <TransactionsView 
              transactions={transactions} 
              onAdd={(tx) => setDoc(doc(db, "transactions", tx.id), tx)} 
              onBulkAdd={async (txs) => {
                const batch = writeBatch(db);
                txs.forEach(tx => batch.set(doc(db, "transactions", tx.id), tx));
                await batch.commit();
              }}
              onUpdate={async (tx) => {
                const { id, ...data } = tx;
                await updateDoc(doc(db, "transactions", id), data);
              }}
              onDelete={(id) => deleteDoc(doc(db, "transactions", id))} 
            />
          )}
        </div>
      </main>
      
      <MobileNav activeTab={activeTab} setActiveTab={handleTabChange} />
    </div>
  );
};

export default App;
