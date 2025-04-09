import { OpenAIService } from './openai';
import { GeminiService } from './gemini';
import { LLMSettings } from '../../types';

export interface LLMService {
  generateComment(content: string, promptTemplate?: string): Promise<string>;
}

export function createLLMService(settings: LLMSettings): LLMService | null {
  if (!settings.provider) {
    return null;
  }

  switch (settings.provider) {
    case 'openai':
      if (!settings.openai?.apiKey) {
        throw new Error('OpenAI API Key is required');
      }
      return new OpenAIService(
        settings.openai.apiKey,
        settings.openai.apiHost,
        settings.openai.model
      );
    case 'gemini':
      if (!settings.gemini?.apiKey) {
        throw new Error('Gemini API Key is required');
      }
      return new GeminiService(
        settings.gemini.apiKey,
        settings.gemini.model
      );
    default:
      return null;
  }
}
