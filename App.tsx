import React, { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { Transaction, AnnouncedDividend } from './types';
import { calculateConsolidatedData } from './services/investmentEngine';
import { fetchRealTimePrices, MarketPrice, DEFAULT_ORACLE_URL } from './services/geminiService';
import DashboardView from './components/DashboardView';
import TransactionsView from './components/TransactionsView';
import AssetDetailView from './components/AssetDetailView';
import BrokersView from './components/BrokersView';
import TaxReportView from './components/TaxReportView';
import DividendReportView from './components/DividendReportView';

// Firebase Imports
import { db } from './firebaseConfig';
import { collection, onSnapshot, setDoc, doc, updateDoc, deleteDoc, query, writeBatch } from 'firebase/firestore';

// Componente de Navegação Mobile
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
  const [showSettings, setShowSettings] = useState(false);
  const [customApiUrl, setCustomApiUrl] = useState(() => localStorage.getItem('custom_api_url') || DEFAULT_ORACLE_URL);
  
  const autoRefreshRef = useRef(false);
  
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
    } catch(e) { console.error("Erro cache", e); }
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

  // Load Transactions
  useEffect(() => {
    setDbStatus('connecting');
    const unsubscribeTx = onSnapshot(query(collection(db, "transactions")), 
      (snapshot) => {
        setTransactions(snapshot.docs.map(d => ({ ...d.data(), id: d.id } as Transaction)));
        setIsLoading(false);
        setDbStatus('connected');
      }, 
      (error) => { console.error("Erro TX:", error); setIsLoading(false); setDbStatus('error'); }
    );
    const unsubscribeDiv = onSnapshot(query(collection(db, "announced_dividends")),
      (snapshot) => setAnnouncedDividends(snapshot.docs.map(d => ({ ...d.data(), id: d.id } as AnnouncedDividend))),
      (error) => console.error("Erro Div:", error)
    );
    return () => { unsubscribeTx(); unsubscribeDiv(); };
  }, []);

  const engineData = useMemo(() => calculateConsolidatedData(transactions, usdRate), [transactions, usdRate]);

  const tickersToUpdate = useMemo(() => {
    const set = new Set<string>();
    engineData.activePositions.forEach(p => {
      if (p.category !== 'Renda Fixa' && p.totalQuantity > 0) set.add(p.ticker);
    });
    return Array.from(set);
  }, [engineData.activePositions]);

  const handleManualPriceUpdate = (ticker: string, newPrice: number) => {
    setMarketPrices(prev => {
      const updated = { ...prev, [ticker]: { ticker, price: newPrice, changePercent: prev[ticker]?.changePercent || 0 } };
      localStorage.setItem('gemini_prices_cache_v1', JSON.stringify({ timestamp: Date.now(), data: { prices: Object.values(updated), sources: [] } }));
      return updated;
    });
  };

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
    } catch(e) { console.error("Erro atualizar preços", e); } 
    finally { setIsUpdatingPrices(false); }
  }, [tickersToUpdate, isUpdatingPrices]);

  useEffect(() => {
    if (!isLoading && tickersToUpdate.length > 0 && !autoRefreshRef.current) {
      const doRefresh = async () => {
         autoRefreshRef.current = true;
         if (Object.keys(marketPrices).length === 0) await refreshPrices();
      };
      const timer = setTimeout(doRefresh, 2000); 
      return () => clearTimeout(timer);
    }
  }, [isLoading, tickersToUpdate.length, marketPrices, refreshPrices]); 

  const handleInspectTicker = (ticker: string | null) => {
    setInspectedTicker(ticker);
    if(ticker) setActiveTab('dash');
  };

  const saveSettings = () => {
    localStorage.setItem('custom_api_url', customApiUrl);
    setShowSettings(false);
    // Tenta atualizar imediatamente se tiver URL
    if (customApiUrl && tickersToUpdate.length > 0) refreshPrices();
  };

  if (isLoading) return <div className="min-h-screen bg-slate-50 flex items-center justify-center"><div className="w-16 h-16 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin"></div></div>;
  if (dbStatus === 'error') return <div className="min-h-screen bg-slate-50 flex items-center justify-center">Erro de Conexão.</div>;

  const handleTabChange = (tab: any) => { setActiveTab(tab); setInspectedTicker(null); };

  return (
    <div className="min-h-screen flex flex-col md:flex-row bg-slate-50">
      
      {/* Settings Modal */}
      {showSettings && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-lg rounded-2xl shadow-2xl p-6 animate-in zoom-in-95">
             <h3 className="text-lg font-bold text-slate-800 mb-4">Configuração do Oráculo de Preços</h3>
             <div className="space-y-4">
               <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase mb-1">URL do Google Apps Script (Web App)</label>
                  <input 
                    type="url" 
                    placeholder="https://script.google.com/macros/s/..." 
                    value={customApiUrl}
                    onChange={(e) => setCustomApiUrl(e.target.value)}
                    className="w-full p-3 bg-slate-50 border border-slate-200 rounded-lg text-sm font-mono focus:ring-2 focus:ring-indigo-500 outline-none"
                  />
                  <p className="text-[10px] text-slate-400 mt-2">
                    Crie um script no Google Drive com a função <code>doGet</code> usando <code>GOOGLEFINANCE</code> e publique como Web App (Executar como 'Eu', Acesso 'Qualquer um').
                  </p>
               </div>
               <div className="bg-indigo-50 p-3 rounded-lg border border-indigo-100 text-xs text-indigo-700">
                  <strong>Dica de Engenharia:</strong> Isso remove limites de cota e usa dados oficiais do Google Finance gratuitamente.
               </div>
               <div className="flex justify-end gap-3 pt-2">
                 <button onClick={() => setShowSettings(false)} className="px-4 py-2 text-slate-600 font-bold text-sm">Cancelar</button>
                 <button onClick={saveSettings} className="bg-indigo-600 text-white px-4 py-2 rounded-lg font-bold text-sm hover:bg-indigo-700">Salvar & Conectar</button>
               </div>
             </div>
          </div>
        </div>
      )}

      {/* Sidebar Desktop */}
      <aside className="hidden md:flex w-64 bg-slate-900 text-white flex-col sticky top-0 h-screen p-6 shadow-2xl z-10">
        <div className="flex items-center gap-3 mb-10">
          <div className="bg-indigo-600 p-2 rounded-lg shadow-lg shadow-indigo-500/20">
            <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" /></svg>
          </div>
          <h1 className="text-xl font-bold tracking-tight">Finance<span className="text-indigo-400">Engine</span></h1>
        </div>

        <nav className="flex-1 space-y-2">
          {/* Navigation Items */}
          {[
            { id: 'dash', label: 'Dashboard', icon: 'M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z' },
            { id: 'brokers', label: 'Custódia', icon: 'M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4' },
            { id: 'tx', label: 'Lançamentos', icon: 'M9 5H7a2 2 0 00-2-2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 00-2-2M9 5a2 2 0 012-2h2a2 2 0 012 2' },
            { id: 'dividends', label: 'Proventos', icon: 'M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z' },
            { id: 'tax', label: 'Fiscal / DARF', icon: 'M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z' }
          ].map(item => (
            <button key={item.id} onClick={() => handleTabChange(item.id)} className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all font-medium ${activeTab === item.id ? 'bg-indigo-600 text-white shadow-lg' : 'text-slate-400 hover:bg-slate-800'}`}>
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d={item.icon} /></svg>
              {item.label}
            </button>
          ))}
        </nav>
      </aside>

      <main className="flex-1 p-4 md:p-10 overflow-y-auto pb-24 md:pb-10">
        <header className="mb-6 flex flex-col gap-4">
          <div className="flex justify-between items-center">
            <div>
               <h2 className="text-2xl md:text-3xl font-extrabold text-slate-900 tracking-tight">
                 {inspectedTicker || (activeTab === 'dash' ? 'Visão Geral' : activeTab === 'tx' ? 'Lançamentos' : activeTab === 'brokers' ? 'Custódia' : activeTab === 'tax' ? 'Fiscal' : 'Proventos')}
               </h2>
               <p className="text-slate-500 font-medium text-xs md:text-base">
                {customApiUrl ? 'Conectado ao Oráculo GAS (Alta Confiabilidade)' : 'Modo IA Gemini (Fallback)'}
                {lastUpdated && <span className="block text-[10px] text-slate-400 font-normal">Última atualização: {lastUpdated.toLocaleTimeString()}</span>}
               </p>
            </div>
            
            <div className="flex items-center gap-2">
              <button 
                onClick={() => setShowSettings(true)}
                className="p-2.5 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 text-slate-600 transition-colors"
                title="Configurar Oráculo de Preços"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
              </button>
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
          {/* Conteúdo Dinâmico Baseado na Tab Ativa */}
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
                onManualUpdate={handleManualPriceUpdate}
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
