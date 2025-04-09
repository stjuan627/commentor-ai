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

export interface ExtractedContent {
  title: string;
  content: string;
  excerpt: string;
  byline: string;
  siteName: string;
  url: string;
}

export interface ExtractResponse {
  success: boolean;
  data?: ExtractedContent;
  error?: string;
}
