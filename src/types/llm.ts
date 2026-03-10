export interface LLMSettings {
  provider: 'openai' | 'gemini' | null;
  promptTemplate?: string;
  openai?: {
    apiKey?: string;
    apiHost?: string;
    model?: string;
    temperature?: number;
    topP?: number;
  };
  gemini?: {
    apiKey?: string;
    model?: string;
    temperature?: number;
    topP?: number;
  };
}
