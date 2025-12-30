import { GoogleGenAI, Type } from "@google/genai";
import { Transaction, TransactionType, Country, AssetCategory, TaxMonthlySummary } from '../types';

// Inicialização estrita conforme guidelines: apiKey via process.env
const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

// Constantes de Cache
const CACHE_KEYS = {
  SUMMARY: 'gemini_market_summary_v1',
  PRICES: 'gemini_prices_cache_v1'
};

const CACHE_TTL = {
  SUMMARY: 1000 * 60 * 60, // 1 hora
  PRICES: 1000 * 60 * 15   // Aumentado para 15 minutos para economizar cota
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

// --- HELPERS ---

const isQuotaError = (error: unknown): boolean => {
  const msg = String(error);
  return msg.includes('429') || msg.includes('RESOURCE_EXHAUSTED') || msg.includes('quota');
};

// Modificado para permitir recuperar cache expirado (stale) em caso de erro
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
    console.warn('Falha ao salvar cache (localStorage cheio?)', e);
  }
};

// --- API FUNCTIONS ---

export const fetchRealTimePrices = async (tickers: string[]): Promise<PriceUpdateResponse | null> => {
  if (tickers.length === 0) return null;

  const cached = getFromCache<PriceUpdateResponse>(CACHE_KEYS.PRICES, CACHE_TTL.PRICES);

  // 1. Tenta Cache Válido
  if (cached) {
    console.log("Usando cache de preços (válido).");
    return cached;
  }

  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: `Get current market price and daily percentage change for: ${tickers.join(", ")}. 
      Assets can be from BVMF (Brazil) or NYSE/NASDAQ (USA). 
      Return values in their original currency.`,
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
    
    // Extração de fontes
    const sources = response.candidates?.[0]?.groundingMetadata?.groundingChunks
      ?.filter(chunk => chunk.web)
      .map(chunk => ({
        title: chunk.web?.title || "Fonte de Mercado",
        uri: chunk.web?.uri || ""
      })) || [];

    result.sources = sources;

    setCache(CACHE_KEYS.PRICES, result);
    return result;

  } catch (error) {
    console.error("Erro fetchRealTimePrices:", error);
    
    if (isQuotaError(error)) {
      console.warn("Cota excedida (429). Tentando recuperar cache antigo...");
      
      // 2. Fallback: Cache Expirado (Stale-while-error)
      const staleCache = getFromCache<PriceUpdateResponse>(CACHE_KEYS.PRICES, 0, true);
      if (staleCache) {
        return staleCache;
      }

      // 3. Fallback Drástico: Objeto zerado para evitar crash da UI e loop de retry
      return { 
        prices: tickers.map(t => ({ ticker: t, price: 0, changePercent: 0 })), 
        sources: [] 
      };
    }
    
    // Se não for erro de cota, mas outro erro (ex: rede), tenta stale também
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
      // Cache de summary dura 1h
      if (Date.now() - parsed.timestamp < CACHE_TTL.SUMMARY && parsed.contextKey === tickersKey) {
        return parsed.data;
      }
    }
  } catch {}

  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: `Analise brevemente esta carteira (tickers: ${tickers.join(", ")}). 
      Perspectiva macroeconômica rápida 2024 (Brasil/EUA). Máximo 3 parágrafos.`,
    });
    
    const text = response.text || "Análise indisponível.";
    setCache(CACHE_KEYS.SUMMARY, text, tickersKey);
    return text;

  } catch (error) {
    if (isQuotaError(error)) return "Análise temporariamente indisponível (Cota excedida).";
    return "Erro ao gerar análise.";
  }
};

export interface ParsedImportResult {
  transactions: Omit<Transaction, 'id'>[];
  errors: string[];
}

export const parseTransactionsFromCSV = async (csvContent: string): Promise<ParsedImportResult | null> => {
  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-pro-preview", 
      contents: `Atue como um engenheiro de dados financeiros. Converta este CSV de corretora para JSON.
      
      Regras:
      1. Detecte colunas automaticamente (Data, Ativo/Ticker, Tipo/C/V, Qtd, Preço, Taxas).
      2. Normalize 'tipo' para: "${TransactionType.BUY}", "${TransactionType.SELL}", "${TransactionType.DIVIDEND}", "${TransactionType.BONUS}", "${TransactionType.SPLIT}".
      3. Normalize 'país' para "${Country.BR}" ou "${Country.USA}".
      4. Normalize datas para AAAA-MM-DD.
      5. Converta valores numéricos (pt-BR ou en-US) para float padrão.
      
      CSV:
      ${csvContent}`,
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
            errors: {
              type: Type.ARRAY,
              items: { type: Type.STRING }
            }
          },
          required: ["transactions", "errors"]
        }
      },
    });

    const result: ParsedImportResult = JSON.parse(response.text);
    
    // Limpeza pós-processamento
    result.transactions.forEach(tx => {
      if (!tx.splitFrom) delete tx.splitFrom;
      if (!tx.splitTo) delete tx.splitTo;
    });

    return result;

  } catch (error) {
    console.error("Erro importação:", error);
    if (isQuotaError(error)) return { transactions: [], errors: ["Limite de IA excedido. Tente novamente mais tarde."] };
    return { transactions: [], errors: ["Erro ao processar arquivo."] };
  }
};

export const generateDarfExplanation = async (summary: TaxMonthlySummary): Promise<string> => {
  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: `Explique o cálculo de DARF para este mês (${summary.month}).
      Dados: Vendas R$ ${summary.totalSalesBRL}, Lucro Tributável R$ ${summary.taxableGainBRL}, Imposto R$ ${summary.taxDueBRL}.
      Regras: Isenção 20k para ações (exceto day-trade/FII). Formate em Markdown.`,
    });
    return response.text || "Explicação não gerada.";
  } catch (error) {
    if (isQuotaError(error)) return "Limite de cota excedido. Não foi possível gerar a explicação agora.";
    return "Erro ao gerar explicação fiscal.";
  }
};
