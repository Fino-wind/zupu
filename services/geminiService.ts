import { GoogleGenAI } from "@google/genai";
import { FamilyMember } from "../types";

// Configuration interface
export interface AISettings {
  baseUrl?: string;
  modelName: string;
  apiKey?: string;
}

/**
 * Content generation wrapper that handles both Gemini SDK and OpenAI-compatible endpoints.
 */
const generateContent = async (prompt: string, settings?: AISettings) => {
  const apiKey = settings?.apiKey || process.env.API_KEY;
  const baseUrl = settings?.baseUrl;
  const model = settings?.modelName || 'gemini-3-flash-preview';

  if (baseUrl && baseUrl.trim() !== "") {
    // OpenAI compatible fetch for custom endpoints
    try {
      const response = await fetch(`${baseUrl.replace(/\/$/, '')}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model: model,
          messages: [{ role: 'user', content: prompt }],
          temperature: 0.7
        })
      });
      
      if (!response.ok) {
        throw new Error(`API Request failed with status ${response.status}`);
      }
      
      const data = await response.json();
      return data.choices?.[0]?.message?.content;
    } catch (err) {
      console.error("Custom API Fetch Error:", err);
      throw err;
    }
  } else {
    // Standard Gemini SDK usage
    const ai = new GoogleGenAI({ apiKey: apiKey as string });
    const response = await ai.models.generateContent({
      model: model,
      contents: prompt,
    });
    return response.text;
  }
};

export const analyzeRelationship = async (
  personA: FamilyMember,
  personB: FamilyMember,
  allMembers: FamilyMember[],
  style: 'traditional' | 'modern' = 'traditional',
  settings?: AISettings
): Promise<string> => {
  try {
    const contextList = allMembers.map(m => {
      const parent = allMembers.find(p => p.id === m.parentId);
      return `- ${m.name} (性别: ${m.gender === 'male' ? '男' : '女'}), 父为 ${parent ? parent.name : '祖先'}`;
    }).join('\n');

    const styleInstruction = style === 'traditional' 
      ? '请使用庄重典雅的古典文言或半文言风格，引用宗法礼教称谓。' 
      : '请使用亲切易懂的现代白话文，清晰解释两人的亲戚关系。';

    const prompt = `你是一位精通中国家族礼法和宗法制度的族谱编纂者。
基于以下家谱数据:
${contextList}

请分析以下两人的亲缘关系:
1. ${personA.name}
2. ${personB.name}

要求：
1. 给出正式的称谓（如：堂叔、从堂妹、祖父等）。
2. 描述他们的血脉联系。
3. ${styleInstruction}
4. 如果没有亲缘关系，请礼貌地指出。
请用中文书写。`;

    return await generateContent(prompt, settings) || "谱序未载，难以辨析。";
  } catch (error) {
    console.error("AI Error:", error);
    return "宗法司暂歇，请稍后再询。";
  }
};

export const generateBiography = async (member: FamilyMember, settings?: AISettings): Promise<string> => {
  try {
    const prompt = `请为家谱中的成员撰写一段富有中国传统文学色彩的简短人物小传。
姓名: ${member.name}
出生日期: ${member.birthDate}
籍贯/住址: ${member.address}
风格要求：仿古文或典雅的白话文，类似于《史记》或地方志的风格。
请用中文回复。`;

    return await generateContent(prompt, settings) || "生平详情，尚待考证。";
  } catch (error) {
    console.error("AI Error:", error);
    return "笔墨干涸，无法撰写。";
  }
};

export const askAiAboutMember = async (member: FamilyMember, question: string, style: 'classical' | 'vernacular' = 'classical', settings?: AISettings): Promise<string> => {
  try {
    const styleInstruction = style === 'classical'
      ? '请使用古风、儒雅的文言或半文言风格回答，语气如同家族史官。'
      : '请使用通俗易懂的现代白话文回答，解释清楚背景。';

    const prompt = `你是家族史官。关于家族成员 ${member.name}，有人问了这样一个问题：
"${question}"
成员背景：生于 ${member.birthDate}, 居住在 ${member.address}。
${styleInstruction}
请结合你的文学底蕴和对宗族文化的了解进行回答。请用中文回复。`;

    return await generateContent(prompt, settings) || "史书残缺，此问难答。";
  } catch (error) {
    console.error("AI Inquiry Error:", error);
    return "笔墨断绝，无法回应。";
  }
};

/**
 * 测试API连接是否正常
 * @returns { success: boolean, message: string, error?: string }
 */
export const testConnection = async (settings?: AISettings): Promise<{ success: boolean; message: string; error?: string }> => {
  const apiKey = settings?.apiKey || process.env.API_KEY;
  const baseUrl = settings?.baseUrl;
  const model = settings?.modelName || 'gemini-3-flash-preview';

  // 验证必填项
  if (!apiKey || apiKey.trim() === '') {
    return { success: false, message: '请填写API密钥', error: 'API_KEY_EMPTY' };
  }

  if (!model || model.trim() === '') {
    return { success: false, message: '请填写模型名称', error: 'MODEL_NAME_EMPTY' };
  }

  try {
    if (baseUrl && baseUrl.trim() !== "") {
      // 测试OpenAI兼容API
      const cleanUrl = baseUrl.replace(/\/$/, '');

      // 先尝试获取模型列表（如果API支持）
      try {
        const modelsResponse = await fetch(`${cleanUrl}/models`, {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${apiKey}`
          }
        });

        if (modelsResponse.ok) {
          const modelsData = await modelsResponse.json();
          const modelExists = modelsData.data?.some((m: any) => m.id === model);

          if (!modelExists) {
            return {
              success: false,
              message: `模型 "${model}" 不存在`,
              error: 'MODEL_NOT_FOUND',
              availableModels: modelsData.data?.map((m: any) => m.id) || []
            };
          }
        }
      } catch (e) {
        // 模型列表接口失败，继续测试实际调用
        console.log("Models endpoint not available, testing with actual call...");
      }

      // 发送测试请求
      const response = await fetch(`${cleanUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model: model,
          messages: [{ role: 'user', content: '测试连接，请回复"连接成功"' }],
          max_tokens: 10
        })
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        return {
          success: false,
          message: `API请求失败 (${response.status})`,
          error: errorData.error?.message || response.statusText
        };
      }

      const data = await response.json();
      if (data.choices?.[0]?.message?.content) {
        return { success: true, message: '连接成功！' };
      } else {
        return { success: false, message: 'API响应格式异常', error: 'INVALID_RESPONSE_FORMAT' };
      }
    } else {
      // 测试Gemini SDK
      const ai = new GoogleGenAI({ apiKey: apiKey as string });
      const response = await ai.models.generateContent({
        model: model,
        contents: '测试连接',
      });

      if (response.text) {
        return { success: true, message: '连接成功！' };
      } else {
        return { success: false, message: 'Gemini响应异常', error: 'GEMINI_RESPONSE_ERROR' };
      }
    }
  } catch (error: any) {
    console.error("Connection test error:", error);
    return {
      success: false,
      message: '网络连接失败',
      error: error.message || 'NETWORK_ERROR'
    };
  }
};