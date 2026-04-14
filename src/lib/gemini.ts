import { GoogleGenAI, Type } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });

export interface Story {
  id?: string;
  title: string;
  content: string;
  type: "寓言" | "成语故事" | "童话" | "民间传说" | "神话";
  originCountry: string;
  createdAt: number;
}

export async function generateStories(unlikedThemes: string[] = [], readTitles: string[] = []): Promise<Story[]> {
  const prompt = `为5岁半的小男孩生成10个睡前故事。
  要求：
  1. 数量：正好10个。
  2. 字数：每个故事200-400字。
  3. 类型：包含 寓言、成语故事、童话、民间传说、神话。
  4. 来源：参考格林童话、安徒生、伊索寓言、一千零一夜及中国古代经典。成语典故来源必须准确，不要虚构历史背景。
  5. 避重：绝对不要生成包含以下主题或内容的故事：${unlikedThemes.join(', ')}。
  6. 唯一性：绝对不要生成以下已经读过或不喜欢的故事标题：${readTitles.join(', ')}。
  7. 语言：中文。
  8. 结构：每个故事包含标题、内容、类型和起源国家。`;

  const response = await ai.models.generateContent({
    model: "gemini-flash-latest",
    contents: prompt,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            title: { type: Type.STRING },
            content: { type: Type.STRING },
            type: { 
              type: Type.STRING,
              enum: ["寓言", "成语故事", "童话", "民间传说", "神话"]
            },
            originCountry: { type: Type.STRING, description: "故事起源的国家名称，例如：中国, 德国, 希腊等" }
          },
          required: ["title", "content", "type", "originCountry"]
        }
      }
    }
  });

  const stories = JSON.parse(response.text || "[]") as Story[];
  return stories.map(s => ({ ...s, createdAt: Date.now() }));
}
