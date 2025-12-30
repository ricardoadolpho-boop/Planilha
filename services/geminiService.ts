import { GoogleGenAI, Type } from "@google/genai";
import { TransactionType, Country, AssetCategory, TaxMonthlySummary } from '../types';

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

// URL padrão do Oráculo (Google Apps Script) para cotações gratuitas e confiáveis
export const DEFAULT_ORACLE_URL = "https://script.google.com/macros/s/AKfycbxhvrC6eNUFqaG7W53rfPI0df4rQ42dxLxxQYuBSJlTWH8WHD6SefICwTxWLdkkeu-z/exec";

const CACHE_KEYS = {
  SUMMARY: 'gemini_market_summary_v1',
  PRICES: 'gemini_prices_cache_v1'
};

const CACHE_TTL = {
  SUMMARY: 1000 * 60 * 60, // 1 hora
  PRICES: 1000 * 60 * 15   // 15 minutos
};

export interface MarketPrice {
  ticker: string;
  price: number;
  changePercent: number;
}

export interface PriceUpdateResponse {
  prices: MarketPrice[];
  sources: { title: string; uri: string }[];
}

export interface ParsedImportResult {
  transactions: {
    date: string;
    ticker: string;
    broker: string;
    country: Country;
    category: AssetCategory;
    type: TransactionType;
    quantity: number;
    unitPrice: number;
    fees: number;
    splitFrom?: number;
    splitTo?: number;
  }[];
  errors: string[];
}

// --- HELPERS ---

const isQuotaError = (error: unknown): boolean => {
  const msg = String(error);
  return msg.includes('429') || msg.includes('RESOURCE_EXHAUSTED') || msg.includes('quota');
};

const getFromCache = <T>(key: string, ttl: number, ignoreTTL: boolean = false): T | null => {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    
    const { timestamp, data } = JSON.parse(raw);
    const now = Date.now();
    
    if (ignoreTTL || (now - timestamp < ttl)) {
      return data as T;
    }
    return null;
  } catch {
    return null;
  }
};

const setCache = (key: string, data: any, contextKey?: string) => {
  try {
    localStorage.setItem(key, JSON.stringify({
      timestamp: Date.now(),
      data,
      contextKey
    }));
  } catch (e) {
    console.warn('Falha ao salvar cache', e);
  }
};

// --- API FUNCTIONS ---

// Novo método para buscar do Google Apps Script (Oráculo)
const fetchFromCustomOracle = async (url: string, tickers: string[]): Promise<PriceUpdateResponse | null> => {
  try {
    // O GAS geralmente espera ?tickers=PETR4,AAPL
    // Se o ticker for BR e não tiver sufixo, adicionamos .SA para garantir compatibilidade com Google Finance
    const formattedTickers = tickers.map(t => {
      // Lógica simples: Se parece ticker BR (letras + numero) e não tem ponto, assume SA. 
      // EUA geralmente são só letras.
      const isBR = /[A-Z]{4}[0-9]{1,2}$/.test(t); 
      return (isBR && !t.includes('.')) ? `${t}.SA` : t;
    });

    const targetUrl = `${url}${url.includes('?') ? '&' : '?'}tickers=${formattedTickers.join(',')}`;
    
    const response = await fetch(targetUrl);
    if (!response.ok) throw new Error(`Erro no Oráculo: ${response.status}`);
    
    const text = await response.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch (e) {
      console.warn("Oráculo retornou conteúdo não-JSON:", text.substring(0, 100));
      return null;
    }
    
    // Normalização dos dados vindos do GAS
    // Espera formato: { prices: [{ ticker: 'PETR4', price: 35.5, change: 1.2 }] }
    if (data && Array.isArray(data.prices)) {
      return {
        prices: data.prices.map((p: any) => ({
          ticker: p.ticker.replace('.SA', ''), // Remove sufixo para bater com o app
          price: Number(p.price) || 0,
          changePercent: Number(p.change) || 0 // GAS deve retornar 'change'
        })),
        sources: [{ title: "Google Finance (via GAS)", uri: "https://finance.google.com" }]
      };
    }
    return null;
  } catch (e) {
    console.warn("Oráculo falhou:", e);
    return null;
  }
};

export const fetchRealTimePrices = async (tickers: string[], forceRefresh: boolean = false): Promise<PriceUpdateResponse | null> => {
  if (tickers.length === 0) return null;

  // 1. Verifica Cache (apenas se não forçado)
  if (!forceRefresh) {
    const cached = getFromCache<PriceUpdateResponse>(CACHE_KEYS.PRICES, CACHE_TTL.PRICES);
    if (cached) {
      console.log("Usando cache de preços.");
      return cached;
    }
  }

  // 2. Tenta ORÁCULO CUSTOMIZADO (Prioridade Máxima)
  // Usa URL do LocalStorage ou o Default hardcoded
  const customApiUrl = localStorage.getItem('custom_api_url') || DEFAULT_ORACLE_URL;
  
  if (customApiUrl) {
    console.log(`Usando Oráculo Customizado (Force: ${forceRefresh})...`);
    const oracleResult = await fetchFromCustomOracle(customApiUrl, tickers);
    if (oracleResult) {
      setCache(CACHE_KEYS.PRICES, oracleResult);
      return oracleResult;
    }
  }

  // 3. Fallback: Gemini API
  try {
    console.log("Usando Gemini fallback...");
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: `Get current stock price and daily % change for: ${tickers.join(", ")}.`,
      config: {
        tools: [{ googleSearch: {} }],
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            prices: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  ticker: { type: Type.STRING },
                  price: { type: Type.NUMBER },
                  changePercent: { type: Type.NUMBER }
                },
                required: ["ticker", "price", "changePercent"]
              }
            }
          },
          required: ["prices"]
        }
      },
    });

    const jsonStr = response.text || '{"prices": []}';
    const result: PriceUpdateResponse = JSON.parse(jsonStr);
    
    const sources = response.candidates?.[0]?.groundingMetadata?.groundingChunks
      ?.filter(chunk => chunk.web)
      .map(chunk => ({
        title: chunk.web?.title || "Google Search",
        uri: chunk.web?.uri || ""
      })) || [];

    result.sources = sources;
    setCache(CACHE_KEYS.PRICES, result);
    return result;

  } catch (error) {
    if (isQuotaError(error)) {
      console.warn("Gemini Cota Excedida (429).");
      const staleCache = getFromCache<PriceUpdateResponse>(CACHE_KEYS.PRICES, 0, true);
      return staleCache || { prices: tickers.map(t => ({ ticker: t, price: 0, changePercent: 0 })), sources: [] };
    }
    const staleCache = getFromCache<PriceUpdateResponse>(CACHE_KEYS.PRICES, 0, true);
    return staleCache || null;
  }
};

export const getMarketSummary = async (tickers: string[]): Promise<string> => {
  if (tickers.length === 0) return "Adicione ativos.";
  const tickersKey = tickers.sort().join(',');
  
  try {
    const raw = localStorage.getItem(CACHE_KEYS.SUMMARY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Date.now() - parsed.timestamp < CACHE_TTL.SUMMARY && parsed.contextKey === tickersKey) return parsed.data;
    }
  } catch {}

  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: `Analise brevemente esta carteira: ${tickers.join(", ")}. Perspectiva 2024 (BR/USA). Max 3 parágrafos.`,
    });
    const text = response.text || "Análise indisponível.";
    setCache(CACHE_KEYS.SUMMARY, text, tickersKey);
    return text;
  } catch (error) {
    return isQuotaError(error) ? "Análise temporariamente indisponível (Cota)." : "Erro ao gerar análise.";
  }
};

export const parseTransactionsFromCSV = async (csvContent: string): Promise<ParsedImportResult | null> => {
  // Mantém implementação original
  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-pro-preview", 
      contents: `Atue como um engenheiro de dados financeiros. Converta este CSV para JSON.
      Regras: Detecte colunas (Data, Ticker, Tipo, Qtd, Preço, Taxas). Normalize tipo (Compra, Venda, Dividendo, Bonificação, Desdobramento). Normalize país (BR, EUA). Formato Data AAAA-MM-DD.
      CSV: ${csvContent}`,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            transactions: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  date: { type: Type.STRING },
                  ticker: { type: Type.STRING },
                  broker: { type: Type.STRING },
                  country: { type: Type.STRING, enum: [Country.BR, Country.USA] },
                  category: { type: Type.STRING, default: AssetCategory.VARIABLE },
                  type: { type: Type.STRING, enum: [TransactionType.BUY, TransactionType.SELL, TransactionType.DIVIDEND, TransactionType.BONUS, TransactionType.SPLIT] },
                  quantity: { type: Type.NUMBER },
                  unitPrice: { type: Type.NUMBER },
                  fees: { type: Type.NUMBER },
                  splitFrom: { type: Type.NUMBER },
                  splitTo: { type: Type.NUMBER },
                },
                required: ["date", "ticker", "broker", "country", "category", "type", "quantity", "unitPrice", "fees"]
              }
            },
            errors: { type: Type.ARRAY, items: { type: Type.STRING } }
          },
          required: ["transactions", "errors"]
        }
      },
    });
    const jsonStr = response.text || '{"transactions": [], "errors": ["Vazio"]}';
    return JSON.parse(jsonStr);
  } catch (error) {
    if (isQuotaError(error)) return { transactions: [], errors: ["Cota excedida."] };
    return { transactions: [], errors: ["Erro proc."] };
  }
};

export const generateDarfExplanation = async (summary: TaxMonthlySummary): Promise<string> => {
  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: `Explique cálculo DARF mês ${summary.month}. Vendas R$${summary.totalSalesBRL}, Lucro R$${summary.taxableGainBRL}, Imposto R$${summary.taxDueBRL}. Regra isenção 20k ações. Markdown.`,
    });
    return response.text || "N/A";
  } catch { return "Erro API."; }
};
