import { GoogleGenAI, Type } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

export interface MarketPrice {
  ticker: string;
  price: number;
  changePercent: number;
}

export interface PriceUpdateResponse {
  prices: MarketPrice[];
  sources: { title: string; uri: string }[];
}

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

    const rawText = response.text;
    const jsonData = JSON.parse(rawText || '{"prices": []}');
    
    // Extrair fontes para conformidade com Search Grounding
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
  } catch (error) {
    console.error("Erro ao buscar preços reais:", error);
    return null;
  }
};

export const getMarketSummary = async (tickers: string[]) => {
  if (tickers.length === 0) return "Adicione ativos para ver o resumo do mercado.";

  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: `Analise brevemente esta carteira de investimentos (tickers: ${tickers.join(", ")}). 
      Dê uma perspectiva macroeconômica rápida para 2024 focando em Brasil e EUA. Máximo 3 parágrafos.`,
    });
    return response.text || "Insights indisponíveis no momento.";
  } catch (error) {
    console.error("Gemini Error:", error);
    return "Erro ao carregar insights de mercado.";
  }
};

export const getMockPrice = (ticker: string) => {
  const base = ticker.length * 10 + 50;
  return base + (Math.random() * 10 - 5);
};
