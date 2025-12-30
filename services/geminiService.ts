import { GoogleGenAI, Type } from "@google/genai";
import { Transaction, TransactionType, Country, AssetCategory, TaxMonthlySummary } from '../types';

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
  const msg = error?.toString()?.toLowerCase() || '';
  return msg.includes('429') || msg.includes('resource_exhausted') || msg.includes('quota');
};

export const fetchRealTimePrices = async (tickers: string[]): Promise<PriceUpdateResponse> => {
  if (tickers.length === 0) {
    return { prices: [], sources: [] };
  }

  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: `Forneça o preço de mercado atual e a variação percentual do dia para os seguintes ativos de bolsa de valores: ${tickers.join(", ")}. 
      Considere ativos brasileiros (B3/BVMF) e americanos (NYSE/NASDAQ). 
      Retorne os valores na moeda original de cada ativo.
      IMPORTANTE: No objeto JSON de resposta, a propriedade 'ticker' DEVE corresponder EXATAMENTE ao ticker fornecido na lista de entrada. Não adicione sufixos como ".SA" ou altere a capitalização.
      A resposta deve ser APENAS um objeto JSON válido, sem markdown ou texto adicional, no seguinte formato: {"prices": [{"ticker": "TICKER", "price": 123.45, "changePercent": 1.23}]}`,
      config: {
        tools: [{ googleSearch: {} }],
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
        prices: jsonData.prices || [],
        sources: sources
      };
    } catch (parseError) {
      console.error("Erro ao parsear JSON do Gemini:", parseError, "Texto recebido:", cleanText);
      throw new Error("A API retornou uma resposta em formato inválido.");
    }

  } catch (error) {
    if (isQuotaError(error)) {
      console.warn("Gemini: Cota excedida ao buscar preços.");
      throw new Error("Cota da API Gemini excedida. Por favor, tente novamente mais tarde.");
    } else {
      console.error("Erro ao buscar preços reais:", error);
      throw new Error("Falha ao buscar cotações. Verifique a conexão ou a API.");
    }
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

export interface ParsedImportResult {
  transactions: Omit<Transaction, 'id'>[];
  errors: string[];
}

export const parseTransactionsFromCSV = async (csvContent: string): Promise<ParsedImportResult | null> => {
  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-pro-preview", // Usando Pro para raciocínio complexo e extração de dados
      contents: `Você é um assistente de engenharia financeira especialista em processar extratos de corretoras. Analise o seguinte conteúdo de um arquivo CSV. Sua tarefa é extrair e estruturar cada linha em um objeto JSON.
      
      **Instruções Cruciais:**
      1.  **Identifique as Colunas**: Os cabeçalhos podem variar (ex: "Ativo", "Papel", "Ticker"; "Data Operação", "Data"; "C/V", "Tipo"). Identifique inteligentemente as colunas para: data, ticker, corretora, país, tipo de transação, quantidade, preço unitário e taxas.
      2.  **Classifique o Tipo**: O campo 'tipo' DEVE ser classificado como um dos seguintes valores exatos: "${TransactionType.BUY}", "${TransactionType.SELL}", "${TransactionType.DIVIDEND}", "${TransactionType.BONUS}", "${TransactionType.SPLIT}".
      3.  **Determine o País**: O campo 'país' DEVE ser "${Country.BR}" ou "${Country.USA}". Assuma "BR" por padrão. Se encontrar tickers como AAPL, GOOGL, ou valores em dólares, use "EUA".
      4.  **Estruture a Saída**: Retorne um único objeto JSON com duas chaves: "transactions" (uma lista de transações válidas) e "errors" (uma lista de strings descrevendo problemas em linhas que não puderam ser processadas).
      5.  **Robustez Numérica**: Converta números para o formato americano (ponto como decimal) antes de processar. Ignore símbolos de moeda.
      6.  **Datas**: Normalize as datas para o formato AAAA-MM-DD.
      7.  **Ignore o Cabeçalho**: Não inclua a linha de cabeçalho na saída de transações.
      8.  **Corretora**: Se a coluna da corretora não existir, use "Não informado".

      **Conteúdo CSV para Análise:**
      ---
      ${csvContent}
      ---
      `,
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
                  date: { type: Type.STRING, description: "Data no formato AAAA-MM-DD" },
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

    const rawText = response.text || '{"transactions": [], "errors": ["Resposta da IA vazia."]}';
    const cleanText = rawText.replace(/```json/g, '').replace(/```/g, '').trim();

    try {
      const jsonData: ParsedImportResult = JSON.parse(cleanText);
      jsonData.transactions.forEach(tx => {
        if (tx.splitFrom === null) delete tx.splitFrom;
        if (tx.splitTo === null) delete tx.splitTo;
      });
      return jsonData;
    } catch (parseError) {
      console.error("Erro ao parsear JSON do Gemini (Importação):", parseError, "Texto recebido:", cleanText);
      return { transactions: [], errors: ["A IA retornou uma resposta em formato inválido."] };
    }

  } catch (error) {
    console.error("Erro na API Gemini durante importação:", error);
    if (isQuotaError(error)) {
      return { transactions: [], errors: ["Cota da API Gemini excedida. Tente novamente mais tarde."] };
    }
    return { transactions: [], errors: ["Ocorreu um erro ao comunicar com a IA."] };
  }
};


export const generateDarfExplanation = async (summary: TaxMonthlySummary): Promise<string> => {
  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: `Baseado no seguinte resumo fiscal de um investidor no Brasil para o mês de ${summary.month}:
- **Vendas totais**: ${summary.totalSalesBRL.toLocaleString('pt-BR', {style: 'currency', currency: 'BRL'})}
- **Lucro tributável**: ${summary.taxableGainBRL.toLocaleString('pt-BR', {style: 'currency', currency: 'BRL'})}
- **Imposto devido**: ${summary.taxDueBRL.toLocaleString('pt-BR', {style: 'currency', currency: 'BRL'})}

Explique de forma clara e concisa como o imposto foi calculado, mencionando a alíquota aplicável e a regra de isenção de R$20.000 (se relevante para o caso).
Além disso, forneça as informações para preenchimento do DARF, usando "XXX.XXX.XXX-XX" para o CPF.
Formate a resposta usando markdown, com títulos e listas para melhor legibilidade.`,
    });
    return response.text || "Não foi possível gerar a explicação.";
  } catch (error) {
    console.error("Erro na API Gemini (DARF):", error);
    return "Ocorreu um erro ao gerar a explicação do imposto.";
  }
};
