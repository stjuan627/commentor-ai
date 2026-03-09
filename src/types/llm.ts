export interface LLMSettings {
  provider: 'openai' | 'gemini' | null;
  promptTemplate?: string;
  openai?: {
    apiKey?: string;
    apiHost?: string;
    model?: string;
  };
  gemini?: {
    apiKey?: string;
    model?: string;
  };
}
