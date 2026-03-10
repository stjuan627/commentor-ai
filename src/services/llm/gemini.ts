import { generatePrompt, PromptArgs, getSystemPrompt } from './index';
import type { LLMService } from './index';

export class GeminiService implements LLMService {
  private apiKey: string;
  private model: string;
  private apiEndpoint: string;
  private temperature?: number;
  private topP?: number;

  constructor(
    apiKey: string,
    model?: string,
    temperature?: number,
    topP?: number
  ) {
    this.apiKey = apiKey;
    this.model = model || 'gemini-flash-latest';
    this.apiEndpoint = `https://generativelanguage.googleapis.com/v1beta/models/${this.model}:generateContent`;
    this.temperature = temperature;
    this.topP = topP;
  }

  async generateComment(content: string, promptTemplate?: string, promptArgs?: PromptArgs): Promise<string> {
    const prompt = generatePrompt(promptArgs || { content }, promptTemplate);
    
    try {
      const url = `${this.apiEndpoint}?key=${this.apiKey}`;
      
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          system_instruction: {
            parts: [
              { text: getSystemPrompt() }
            ]
          },
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
            temperature: this.temperature ?? 0.7,
            topP: this.topP ?? 1,
            // maxOutputTokens: 500,
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
}
