import { GoogleGenAI, Type } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });

export interface Story {
  id?: string;
  title: string;
  content: string;
  type: "寓言" | "成语故事" | "童话" | "民间传说" | "神话";
  originCountry: string;
  imageSearchTerm: string;
  createdAt: number;
}

export async function generateStories(unlikedThemes: string[] = [], readTitles: string[] = []): Promise<Story[]> {
  const prompt = `为5岁半的小男孩生成12个睡前故事。
  要求：
  1. 数量：正好12个。
  2. 字数：每个故事200-400字。
  3. 结构：每个故事的内容必须根据情节或起承转合拆分成2-3段文字，段落之间使用两个换行符（\n\n）分隔，以增加留白，提高阅读体验。
  4. 类型：包含 寓言、成语故事、童话、民间传说、神话。
  5. 来源：参考格林童话、安徒生、伊索寓言、一千零一夜及中国古代经典。成语典故来源必须准确，不要虚构历史背景。
  6. 标题：使用原著或典故中的原始题目，不要添加额外的形容词或修饰语（例如：直接使用“丑小鸭”、“后羿射日”）。
  7. 避重：绝对不要生成包含以下主题或内容的故事：${unlikedThemes.join(', ')}。
  8. 唯一性（极其重要）：绝对不要生成以下任何一个已经在历史记录中的故事标题，必须提供全新的、不重复的故事：${readTitles.join(', ')}。
  9. 语言：中文。
  10. 结构：每个故事包含标题、内容、类型、起源国家，以及一个用于搜索“极简简笔画”风格插图的英文关键词（imageSearchTerm）。关键词必须包含 "line art" 或 "doodle"，例如 "fox line art", "grapes doodle", "sun sketch"。`;

  const response = await ai.models.generateContent({
    model: "gemini-1.5-flash",
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
            originCountry: { type: Type.STRING, description: "故事起源的国家名称，例如：中国, 德国, 希腊等" },
            imageSearchTerm: { type: Type.STRING, description: "用于搜索插图的简洁英文关键词" }
          },
          required: ["title", "content", "type", "originCountry", "imageSearchTerm"]
        }
      }
    }
  });

  const stories = JSON.parse(response.text || "[]") as Story[];
  return stories.map(s => ({ ...s, createdAt: Date.now() }));
}
