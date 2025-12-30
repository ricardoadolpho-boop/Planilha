import React, { useState, useMemo } from 'react';
import { PieChart, Pie, Cell, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, Legend, CartesianGrid, AreaChart, Area } from 'recharts';
import { Position, MonthlyRealizedGain, Country, AssetCategory, HistoricalPoint } from '../types';
import { getMarketSummary, MarketPrice } from '../services/geminiService';

interface Props {
  positions: Position[];
  realizedGains: MonthlyRealizedGain[];
  historicalEquity: HistoricalPoint[];
  usdRate: number;
  onInspectTicker: (ticker: string) => void;
  marketPrices: Record<string, MarketPrice>;
}

const DashboardView: React.FC<Props> = ({ positions, realizedGains, historicalEquity, usdRate, marketPrices }) => {
  const [insight, setInsight] = useState<string | null>(null);
  const [isLoadingInsight, setIsLoadingInsight] = useState(false);
  
  // --- CÁLCULOS DE ENGENHARIA FINANCEIRA ---
  
  // Helper para preço atual (fallback para preço médio se API falhar)
  const getPrice = (ticker: string, avgPrice: number) => {
    const market = marketPrices[ticker];
    return (market?.price && market.price > 0) ? market.price : avgPrice;
  };

  // 1. Patrimônio Total Atual (Mark-to-Market)
  const totalEquityBRL = positions.reduce((acc, pos) => {
    const currentPrice = getPrice(pos.ticker, pos.averagePrice);
    const equity = pos.totalQuantity * currentPrice;
    return acc + (pos.country === Country.BR ? equity : equity * usdRate);
  }, 0);

  // 2. Capital Total Investido (Book Value)
  const totalInvestedBRL = positions.reduce((acc, pos) => {
    const val = pos.totalInvested;
    return acc + (pos.country === Country.BR ? val : val * usdRate);
  }, 0);

  // 3. Proventos Totais
  const totalDividendsBRL = positions.reduce((acc, pos) => {
    const val = pos.totalDividends;
    return acc + (pos.country === Country.BR ? val : val * usdRate);
  }, 0);

  // 4. Métricas de Retorno
  const unRealizedGainBRL = totalEquityBRL - totalInvestedBRL;
  const totalGainPct = totalInvestedBRL > 0 ? (unRealizedGainBRL / totalInvestedBRL) * 100 : 0;
  const yieldOnCost = totalInvestedBRL > 0 ? (totalDividendsBRL / totalInvestedBRL) * 100 : 0;
  
  // --- DADOS PARA GRÁFICOS ---

  // Alocação por Ativo
  const topAssetsData = useMemo(() => {
    const data = positions
      .filter(p => p.totalQuantity > 0.0001) // Filtrar posições zeradas
      .map(p => {
        const currentPrice = getPrice(p.ticker, p.averagePrice);
        const value = p.totalQuantity * currentPrice * (p.country === Country.USA ? usdRate : 1);
        return { name: p.ticker, value, type: 'asset' };
      })
      .sort((a, b) => b.value - a.value);

    if (data.length <= 6) return data;
    const top5 = data.slice(0, 5);
    const others = data.slice(5).reduce((acc, curr) => acc + curr.value, 0);
    return [...top5, { name: 'Outros', value: others, type: 'asset' }];
  }, [positions, marketPrices, usdRate]);

  // Alocação por Categoria
  const categoryData = useMemo(() => {
    const groups: Record<string, number> = {};
    positions.filter(p => p.totalQuantity > 0.0001).forEach(p => {
      const currentPrice = getPrice(p.ticker, p.averagePrice);
      const value = p.totalQuantity * currentPrice * (p.country === Country.USA ? usdRate : 1);
      const cat = p.category || 'Outros';
      groups[cat] = (groups[cat] || 0) + value;
    });
    return Object.entries(groups)
        .map(([name, value]) => ({ name, value }))
        .sort((a,b) => b.value - a.value);
  }, [positions, marketPrices, usdRate]);

  const COLORS = ['#4f46e5', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#ec4899', '#64748b'];

  const handleGenerateInsight = async () => {
    const tickers = positions
      .filter(p => p.totalQuantity > 0 && p.category === AssetCategory.VARIABLE)
      .map(p => p.ticker);
      
    if (tickers.length === 0) {
        setInsight("Adicione ativos de renda variável para gerar análise.");
        return;
    }

    setIsLoadingInsight(true);
    const res = await getMarketSummary(tickers);
    setInsight(res);
    setIsLoadingInsight(false);
  };

  const hasData = positions.length > 0 && totalEquityBRL > 0;

  return (
    <div className="space-y-6 animate-in fade-in duration-700">
      {/* KPI Cards Principal */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm hover:shadow-md transition-shadow relative overflow-hidden">
          <div className="absolute top-0 right-0 w-16 h-16 bg-gradient-to-br from-indigo-50 to-transparent rounded-bl-full -mr-4 -mt-4"></div>
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Patrimônio Líquido</p>
          <h3 className="text-xl font-black text-slate-900 tracking-tight">
            {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(totalEquityBRL)}
          </h3>
          <div className="mt-2 text-[10px] flex items-center gap-1.5">
             <span className={`px-1.5 py-0.5 rounded font-bold ${unRealizedGainBRL >= 0 ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'}`}>
               {unRealizedGainBRL >= 0 ? '+' : ''}{totalGainPct.toFixed(2)}%
             </span> 
             <span className="text-slate-400">vs Investido</span>
          </div>
        </div>
        
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm hover:shadow-md transition-shadow">
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Yield on Cost (Global)</p>
          <div className="flex items-baseline gap-1">
             <h3 className="text-xl font-black text-indigo-600">{yieldOnCost.toFixed(2)}%</h3>
             <span className="text-[10px] text-slate-400">a.a. (aprox)</span>
          </div>
          <div className="mt-2 text-[10px] text-slate-400">Retorno cash-on-cash histórico</div>
        </div>

        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm hover:shadow-md transition-shadow">
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Proventos Recebidos</p>
          <h3 className="text-xl font-black text-amber-600">
            {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(totalDividendsBRL)}
          </h3>
          <div className="mt-2 text-[10px] text-slate-400">Dividendos + JCP Acumulados</div>
        </div>

        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm hover:shadow-md transition-shadow">
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Exposição Dólar</p>
          <div className="flex items-center gap-2 mt-2">
            <span className="text-lg font-black text-blue-600">
              {hasData ? ((positions.filter(p => p.country === Country.USA).reduce((a, b) => {
                 const currentPrice = getPrice(b.ticker, b.averagePrice);
                 return a + (b.totalQuantity * currentPrice * usdRate);
              }, 0) / (totalEquityBRL || 1)) * 100).toFixed(1) : 0}%
            </span>
            <span className="text-[10px] bg-blue-50 text-blue-600 px-2 py-0.5 rounded font-bold uppercase">USD</span>
          </div>
          <div className="mt-1 text-[10px] text-slate-400">Proteção cambial</div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
          <div className="flex justify-between items-start mb-6">
            <div><h4 className="font-bold text-slate-800">Curva de Patrimônio</h4><p className="text-[10px] text-slate-400 uppercase tracking-wider">Crescimento Patrimonial vs Aportes</p></div>
            <div className="flex items-center gap-4 text-[9px] font-bold uppercase tracking-widest"><div className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-indigo-500"></span><span className="text-slate-600">Patrimônio</span></div><div className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-slate-300"></span><span className="text-slate-400">Aportes</span></div></div>
          </div>
          <div className="h-72 w-full">
            {historicalEquity.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={historicalEquity}>
                  <defs><linearGradient id="colorEquity" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#4f46e5" stopOpacity={0.2}/><stop offset="95%" stopColor="#4f46e5" stopOpacity={0}/></linearGradient></defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{fontSize: 9, fill: '#94a3b8'}} minTickGap={40} tickFormatter={(val) => new Date(val).toLocaleDateString('pt-BR', {month: 'short', year: '2-digit'})} />
                  <YAxis axisLine={false} tickLine={false} tick={{fontSize: 9, fill: '#94a3b8'}} tickFormatter={(val) => `R$${val/1000}k`} width={40} />
                  <Tooltip contentStyle={{backgroundColor: '#0f172a', border: 'none', borderRadius: '8px', color: '#fff'}} itemStyle={{color: '#fff'}} labelStyle={{color: '#94a3b8'}} />
                  <Area type="monotone" dataKey="equity" stroke="#4f46e5" strokeWidth={2.5} fillOpacity={1} fill="url(#colorEquity)" animationDuration={1500} />
                  <Area type="monotone" dataKey="invested" stroke="#cbd5e1" strokeWidth={2} strokeDasharray="4 4" fill="transparent" animationDuration={2000} />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex items-center justify-center h-full text-slate-400 text-sm">Sem dados históricos suficientes.</div>
            )}
          </div>
        </div>

        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm flex flex-col">
          <h4 className="font-bold text-slate-800 mb-1">Alocação por Categoria</h4>
          <p className="text-[10px] text-slate-400 mb-4 uppercase tracking-wider">Diversificação de Risco</p>
          <div className="flex-1 min-h-[200px]">
            {categoryData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={categoryData} cx="50%" cy="50%" innerRadius={60} outerRadius={80} paddingAngle={5} dataKey="value" stroke="none">
                    {categoryData.map((_entry, index) => <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />)}
                  </Pie>
                  <Tooltip />
                  <Legend iconType="circle" layout="horizontal" verticalAlign="bottom" align="center" wrapperStyle={{ fontSize: '10px', paddingTop: '20px' }} />
                </PieChart>
              </ResponsiveContainer>
            ) : <div className="flex items-center justify-center h-full text-slate-400 text-sm">Sem posições ativas.</div>}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
          <h4 className="font-bold text-slate-800 mb-1">Concentração da Carteira</h4>
          <p className="text-[10px] text-slate-400 mb-6 uppercase tracking-wider">Maiores Posições (Pareto)</p>
          <div className="h-64">
            {topAssetsData.length > 0 ? (
               <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={topAssetsData} layout="vertical" margin={{ left: 10, right: 30 }}>
                    <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} stroke="#f1f5f9" />
                    <XAxis type="number" hide />
                    <YAxis dataKey="name" type="category" axisLine={false} tickLine={false} width={50} tick={{fontSize: 10, fontWeight: 600, fill: '#475569'}} />
                    <Tooltip cursor={{fill: '#f8fafc'}} />
                    <Bar dataKey="value" fill="#4f46e5" radius={[0, 4, 4, 0]} barSize={20}>
                      {topAssetsData.map((_entry, index) => <Cell key={`cell-${index}`} fill={index === 0 ? '#4f46e5' : '#818cf8'} />)}
                    </Bar>
                  </BarChart>
               </ResponsiveContainer>
            ) : <div className="flex items-center justify-center h-full text-slate-400 text-sm">Sem dados.</div>}
          </div>
        </div>

        <div className="flex flex-col gap-4">
          <div className="bg-gradient-to-br from-slate-900 to-slate-800 p-6 rounded-xl shadow-lg border border-slate-700 flex-1 flex flex-col">
            <div className="flex items-center gap-3 mb-4 border-b border-slate-700/50 pb-3">
              <div className="w-8 h-8 rounded-lg bg-indigo-500/20 flex items-center justify-center">
                 <svg className="w-5 h-5 text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
              </div>
              <div><h4 className="font-bold text-white text-sm">Gemini Market Intel</h4><p className="text-[10px] text-slate-400 uppercase tracking-widest">Análise Contextual</p></div>
            </div>
            <div className="space-y-3 flex-1">
               {insight ? (
                  <p className="text-slate-300 text-sm leading-relaxed font-light italic opacity-90">"{insight}"</p>
               ) : (
                  <div className="flex flex-col items-center justify-center h-full gap-3 text-slate-500">
                     <p className="text-xs text-center">Gere uma análise macroeconômica baseada na sua carteira.</p>
                     <button onClick={handleGenerateInsight} disabled={isLoadingInsight} className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold py-2 px-4 rounded-lg transition-colors flex items-center gap-2 disabled:opacity-50">
                       {isLoadingInsight ? 'Analisando...' : 'Gerar Análise (Gasta Cota)'}
                     </button>
                  </div>
               )}
               {insight && <div className="flex justify-end mt-2"><span className="text-[9px] bg-slate-800 text-slate-500 px-2 py-1 rounded border border-slate-700/50">Atualizado via Gemini</span></div>}
            </div>
          </div>

          <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
             <div className="flex justify-between items-center mb-2">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Eficiência Fiscal (BR)</p>
                <svg className="w-4 h-4 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
             </div>
             <div className="flex items-end justify-between">
                <div>
                  <p className="text-2xl font-black text-slate-800">{realizedGains.filter(g => g.gain > 0).length} <span className="text-sm text-slate-400 font-medium">meses</span></p>
                  <p className="text-[10px] text-slate-500">com ganho de capital</p>
                </div>
                <div className="text-right">
                   <p className="text-xs font-bold text-slate-600">Isenção &lt; R$ 20k Utilizada</p>
                   <div className="w-24 h-1.5 bg-slate-100 rounded-full mt-1"><div className="h-full bg-emerald-500 rounded-full" style={{width: '35%'}}></div></div>
                </div>
             </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default DashboardView;
