import { LLMService } from './index';

export class GeminiService implements LLMService {
  private apiKey: string;
  private model: string;
  private apiEndpoint: string;

  constructor(
    apiKey: string,
    model?: string
  ) {
    this.apiKey = apiKey;
    this.model = model || 'gemini-pro';
    this.apiEndpoint = `https://generativelanguage.googleapis.com/v1beta/models/${this.model}:generateContent`;
  }

  async generateComment(content: string, promptTemplate?: string): Promise<string> {
    const prompt = this.formatPrompt(content, promptTemplate);
    
    try {
      const url = `${this.apiEndpoint}?key=${this.apiKey}`;
      
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          contents: [
            {
              role: 'user',
              parts: [
                {
                  text: prompt
                }
              ]
            }
          ],
          generationConfig: {
            temperature: 0.7,
            maxOutputTokens: 500,
            topP: 0.95,
            topK: 40
          }
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(`Gemini API error: ${errorData.error?.message || response.statusText}`);
      }

      const data = await response.json();
      return data.candidates[0].content.parts[0].text.trim();
    } catch (error) {
      console.error('Error calling Gemini API:', error);
      throw error;
    }
  }

  private formatPrompt(content: string, template?: string): string {
    const defaultTemplate = '请对以下内容进行评论：\n\n{content}';
    const promptTemplate = template || defaultTemplate;
    return promptTemplate.replace('{content}', content);
  }
}
