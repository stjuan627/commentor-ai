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
