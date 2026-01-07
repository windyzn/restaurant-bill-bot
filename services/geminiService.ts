
import { GoogleGenAI, Type } from "@google/genai";
import { TaxCategory } from "../types";

export const scanBillWithGemini = async (base64Image: string) => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  
  const response = await ai.models.generateContent({
    model: 'gemini-3-flash-preview',
    contents: {
      parts: [
        {
          inlineData: {
            mimeType: 'image/jpeg',
            data: base64Image,
          },
        },
        {
          text: "Extract items from this restaurant bill. For each item, identify if it is 'FOOD' or 'CONTAINERS' (takeout items). Return names and subtotal prices (before tax). If unsure, assume 'FOOD'."
        }
      ]
    },
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            name: { type: Type.STRING },
            price: { type: Type.NUMBER },
            taxCategory: { 
              type: Type.STRING,
              enum: [TaxCategory.FOOD, TaxCategory.CONTAINERS]
            }
          },
          required: ["name", "price", "taxCategory"]
        }
      }
    }
  });

  try {
    return JSON.parse(response.text || '[]');
  } catch (e) {
    console.error("Failed to parse Gemini response", e);
    return [];
  }
};
