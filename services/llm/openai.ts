import { LLMService } from './index';

export class OpenAIService implements LLMService {
  private apiKey: string;
  private apiHost: string;
  private model: string;

  constructor(
    apiKey: string,
    apiHost?: string,
    model?: string
  ) {
    this.apiKey = apiKey;
    this.apiHost = apiHost || 'https://api.openai.com/v1';
    this.model = model || 'gpt-4o';
  }

  async generateComment(content: string, promptTemplate?: string): Promise<string> {
    const prompt = this.formatPrompt(content, promptTemplate);
    
    try {
      const response = await fetch(`${this.apiHost}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`
        },
        body: JSON.stringify({
          model: this.model,
          messages: [
            { role: 'system', content: '你是一个专业的内容评论助手，擅长对文章进行简短而有见地的评论。' },
            { role: 'user', content: prompt }
          ],
          temperature: 0.7,
          max_tokens: 500
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(`OpenAI API error: ${errorData.error?.message || response.statusText}`);
      }

      const data = await response.json();
      return data.choices[0].message.content.trim();
    } catch (error) {
      console.error('Error calling OpenAI API:', error);
      throw error;
    }
  }

  private formatPrompt(content: string, template?: string): string {
    const defaultTemplate = '请对以下内容进行评论：\n\n{content}';
    const promptTemplate = template || defaultTemplate;
    return promptTemplate.replace('{content}', content);
  }
}
