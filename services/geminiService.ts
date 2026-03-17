import { FamilyMember, Locale } from '../types';

// Configuration interface
export interface AISettings {
  baseUrl?: string;
  modelName: string;
  apiKey?: string; // Kept for interface compatibility, but ignored by backend-proxy logic usually
}

const AI_REQUEST_TIMEOUT = 15000;

/**
 * Content generation wrapper that proxies to local backend
 */
const generateContent = async (prompt: string, settings?: AISettings) => {
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), AI_REQUEST_TIMEOUT);

  try {
    const response = await fetch('/api/ai/generate', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        prompt,
        modelName: settings?.modelName,
        baseUrl: settings?.baseUrl,
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`Backend API Request failed with status ${response.status}`);
    }

    const data = await response.json();
    return data.content;
  } catch (err) {
    console.error('AI Request Error:', err);
    throw err;
  } finally {
    window.clearTimeout(timeoutId);
  }
};

export const analyzeRelationship = async (
  personA: FamilyMember,
  personB: FamilyMember,
  allMembers: FamilyMember[],
  style: 'traditional' | 'modern' = 'traditional',
  settings?: AISettings,
  locale: Locale = 'zh'
): Promise<string> => {
  try {
    const contextList = allMembers
      .map((m) => {
        const parent = allMembers.find((p) => p.id === m.parentId);
        if (locale === 'en') {
          const genderLabel =
            m.gender === 'male' ? 'male' : m.gender === 'female' ? 'female' : 'other';
          return `- ${m.name} (gender: ${genderLabel}), parent: ${parent ? parent.name : 'unknown'}`;
        }
        return `- ${m.name} (性别: ${m.gender === 'male' ? '男' : '女'}), 父为 ${parent ? parent.name : '祖先'}`;
      })
      .join('\n');

    if (locale === 'en') {
      const styleInstruction =
        style === 'traditional'
          ? 'Use formal, traditional genealogy terms.'
          : 'Use clear, modern English.';
      const prompt = `You are a professional genealogist.
Based on the following family data:
${contextList}

Analyze the relationship between:
1. ${personA.name}
2. ${personB.name}

Requirements:
1. Provide the formal kinship term (e.g., first cousin, great-grandfather).
2. Explain their lineage relationship.
3. ${styleInstruction}
4. If no relation exists, say so politely.
Please answer in English.`;
      return (await generateContent(prompt, settings)) || 'No recorded relation can be determined.';
    }

    const styleInstruction =
      style === 'traditional'
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

    return (await generateContent(prompt, settings)) || '谱序未载，难以辨析。';
  } catch (error) {
    console.error('AI Error:', error);
    return locale === 'en' ? 'The system is temporarily unavailable.' : '宗法司暂歇，请稍后再询。';
  }
};

export const generateBiography = async (
  member: FamilyMember,
  settings?: AISettings,
  locale: Locale = 'zh'
): Promise<string> => {
  try {
    if (locale === 'en') {
      const prompt = `Write a concise biographical note for a family tree member.
Name: ${member.name}
Birth Date: ${member.birthDate}
Location: ${member.address}
Style: formal, respectful, and historically toned. Keep it concise.
Please answer in English.`;
      return (await generateContent(prompt, settings)) || 'No biography is available yet.';
    }

    const prompt = `请为家谱中的成员撰写一段富有中国传统文学色彩的简短人物小传。
姓名: ${member.name}
出生日期: ${member.birthDate}
籍贯/住址: ${member.address}
风格要求：仿古文或典雅的白话文，类似于《史记》或地方志的风格。
请用中文回复。`;

    return (await generateContent(prompt, settings)) || '生平详情，尚待考证。';
  } catch (error) {
    console.error('AI Error:', error);
    return locale === 'en' ? 'Unable to generate a biography right now.' : '笔墨干涸，无法撰写。';
  }
};

export const askAiAboutMember = async (
  member: FamilyMember,
  question: string,
  style: 'classical' | 'vernacular' = 'classical',
  settings?: AISettings,
  locale: Locale = 'zh'
): Promise<string> => {
  try {
    if (locale === 'en') {
      const styleInstruction =
        style === 'classical'
          ? 'Use a formal, historically toned voice.'
          : 'Use clear, modern English.';

      const prompt = `You are the family historian. A question is asked about ${member.name}:
"${question}"
Background: born ${member.birthDate}, lives in ${member.address}.
${styleInstruction}
Please answer in English.`;

      return (
        (await generateContent(prompt, settings)) || 'The records are insufficient to answer this.'
      );
    }

    const styleInstruction =
      style === 'classical'
        ? '请使用古风、儒雅的文言或半文言风格回答，语气如同家族史官。'
        : '请使用通俗易懂的现代白话文回答，解释清楚背景。';

    const prompt = `你是家族史官。关于家族成员 ${member.name}，有人问了这样一个问题：
"${question}"
成员背景：生于 ${member.birthDate}, 居住在 ${member.address}。
${styleInstruction}
请结合你的文学底蕴和对宗族文化的了解进行回答。请用中文回复。`;

    return (await generateContent(prompt, settings)) || '史书残缺，此问难答。';
  } catch (error) {
    console.error('AI Inquiry Error:', error);
    return locale === 'en' ? 'Unable to answer at the moment.' : '笔墨断绝，无法回应。';
  }
};
