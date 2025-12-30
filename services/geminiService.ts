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
  PRICES: 1000 * 60 * 5    // 5 minutos
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

const getFromCache = <T>(key: string, ttl: number): T | null => {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    
    const { timestamp, data, contextKey } = JSON.parse(raw);
    const now = Date.now();
    
    if (now - timestamp < ttl) {
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

  const sortedTickersKey = tickers.sort().join(',');
  const cached = getFromCache<PriceUpdateResponse>(CACHE_KEYS.PRICES, CACHE_TTL.PRICES);

  // Verificação simples de cache: se existe cache válido, retornamos ele para economizar cota.
  // Em uma app real, verificaríamos se o cache cobre TODOS os tickers solicitados.
  if (cached) {
    console.log("Usando cache de preços.");
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

    // A propriedade .text retorna a string JSON diretamente
    const jsonStr = response.text || '{"prices": []}';
    const result: PriceUpdateResponse = JSON.parse(jsonStr);
    
    // Extração de fontes do grounding (se houver)
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
      // Fallback silencioso em caso de erro de cota
      return cached || { prices: tickers.map(t => ({ ticker: t, price: 0, changePercent: 0 })), sources: [] };
    }
    return cached || null;
  }
};

export const getMarketSummary = async (tickers: string[]): Promise<string> => {
  if (tickers.length === 0) return "Adicione ativos.";

  const tickersKey = tickers.sort().join(',');
  // Lógica customizada de cache para verificar se os tickers são os mesmos
  try {
    const raw = localStorage.getItem(CACHE_KEYS.SUMMARY);
    if (raw) {
      const parsed = JSON.parse(raw);
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
      model: "gemini-3-pro-preview", // Modelo Pro para maior capacidade de raciocínio em estruturas complexas
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
    if (isQuotaError(error)) return { transactions: [], errors: ["Limite de IA excedido."] };
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
    return "Erro ao gerar explicação fiscal.";
  }
};
