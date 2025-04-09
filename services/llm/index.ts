import { OpenAIService } from './openai';
import { GeminiService } from './gemini';
import { LLMSettings } from '../../types';

export interface LLMService {
  generateComment(content: string, promptTemplate?: string, promptArgs?: PromptArgs): Promise<string>;
}

export interface PromptArgs {
  content: string;
  keywords?: string[];
  langcode?: string;
}

export function generatePrompt(args: PromptArgs, promptTemplate?: string): string {
  const lang = args.langcode || 'en';
  const keywords = args.keywords ? args.keywords.join(', ') : '';
  const defaultTemplate = `
Your task is to read the article/forum discussion and then help me write a comment with the following requirements:
- The comment should be natural to avoid spamming.
- The comment should incorporate these keywords: {keywords}. And do NOT quote or emphasize the keywords.
- The language should be {lang}. Do NOT translate the keywords.
- Output should be plain text without any explanation.

The article/forum discussion is as follows:
{content}
`;
  const template = promptTemplate || defaultTemplate;
  return template
    .replace('{content}', args.content)
    .replace('{keywords}', keywords)
    .replace('{lang}', lang);
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
