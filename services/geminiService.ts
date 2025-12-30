import { GoogleGenAI, Type } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

// Configuração de Cache para evitar erro 429 (Quota Exceeded)
const SUMMARY_CACHE_KEY = 'gemini_market_summary_v1';
const SUMMARY_CACHE_TTL = 1000 * 60 * 60; // 1 hora de cache

export interface MarketPrice {
  ticker: string;
  price: number;
  changePercent: number;
}

export interface PriceUpdateResponse {
  prices: MarketPrice[];
  sources: { title: string; uri: string }[];
}

// Helper para identificar erros de cota
const isQuotaError = (error: any) => {
  const msg = error?.toString() || '';
  return msg.includes('429') || msg.includes('RESOURCE_EXHAUSTED');
};

export const fetchRealTimePrices = async (tickers: string[]): Promise<PriceUpdateResponse | null> => {
  if (tickers.length === 0) return null;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: `Forneça o preço de mercado atual e a variação percentual do dia para os seguintes ativos: ${tickers.join(", ")}. 
      Considere ativos brasileiros (BVMF) e americanos (NYSE/NASDAQ). 
      Retorne os valores na moeda original de cada ativo.`,
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

    const rawText = response.text || '{"prices": []}';
    const cleanText = rawText.replace(/```json/g, '').replace(/```/g, '').trim();
    
    try {
      const jsonData = JSON.parse(cleanText);
      
      const sources = response.candidates?.[0]?.groundingMetadata?.groundingChunks
        ?.filter(chunk => chunk.web)
        .map(chunk => ({
          title: chunk.web?.title || "Fonte de Mercado",
          uri: chunk.web?.uri || ""
        })) || [];

      return {
        prices: jsonData.prices,
        sources: sources
      };
    } catch (parseError) {
      console.error("Erro ao parsear JSON do Gemini:", parseError, "Texto recebido:", cleanText);
      return null;
    }

  } catch (error) {
    if (isQuotaError(error)) {
      console.warn("Gemini: Cota excedida ao buscar preços. Mantendo valores anteriores.");
    } else {
      console.error("Erro ao buscar preços reais:", error);
    }
    return null;
  }
};

export const getMarketSummary = async (tickers: string[]) => {
  if (tickers.length === 0) return "Adicione ativos para ver o resumo do mercado.";

  // 1. Verificar Cache Local antes de chamar a API
  const cacheRaw = localStorage.getItem(SUMMARY_CACHE_KEY);
  if (cacheRaw) {
    try {
      const cache = JSON.parse(cacheRaw);
      const now = Date.now();
      const tickersKey = tickers.sort().join(',');
      
      // Se o cache é recente (< 1 hora) e os tickers são os mesmos, usa o cache
      if (now - cache.timestamp < SUMMARY_CACHE_TTL && cache.tickers === tickersKey) {
        return cache.data;
      }
    } catch (e) {
      localStorage.removeItem(SUMMARY_CACHE_KEY);
    }
  }

  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: `Analise brevemente esta carteira de investimentos (tickers: ${tickers.join(", ")}). 
      Dê uma perspectiva macroeconômica rápida para 2024 focando em Brasil e EUA. Máximo 3 parágrafos.`,
    });
    
    const text = response.text || "Insights indisponíveis no momento.";

    // 2. Salvar no Cache
    localStorage.setItem(SUMMARY_CACHE_KEY, JSON.stringify({
      timestamp: Date.now(),
      tickers: tickers.sort().join(','),
      data: text
    }));

    return text;

  } catch (error) {
    if (isQuotaError(error)) {
      console.warn("Gemini: Cota excedida para resumo de mercado.");
      return "Análise de mercado indisponível temporariamente (Limite de requisições atingido).";
    }
    console.error("Gemini Error:", error);
    return "Erro ao carregar insights de mercado.";
  }
};

export const getMockPrice = (ticker: string) => {
  const base = ticker.length * 10 + 50;
  return base + (Math.random() * 10 - 5);
};
