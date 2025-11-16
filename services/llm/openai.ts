import { generatePrompt, LLMService, PromptArgs, getSystemPrompt } from './index';

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

  async generateComment(content: string, promptTemplate?: string, promptArgs?: PromptArgs): Promise<string> {
    const prompt = generatePrompt(promptArgs || { content }, promptTemplate);
    
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
            { role: 'system', content: getSystemPrompt() },
            { role: 'user', content: prompt }
          ],
          temperature: 0.7,
          // max_tokens: 500
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
}
