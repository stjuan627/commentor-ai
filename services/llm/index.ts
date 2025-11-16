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
  word_count?: string;
}

export function generatePromptV1(args: PromptArgs, promptTemplate?: string): string {
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

export function generatePrompt(args: PromptArgs, promptTemplate?: string): string {
  const lang = args.langcode || 'en';
  const keywords = args.keywords ? args.keywords.join(', ') : '';
  const defaultTemplate = `
{
  "content": "{content}",
  "keywords": "{keywords}",
  "language": "{lang}",
  "word_count": "{word_count}"
}
`;
  const template = promptTemplate || defaultTemplate;
  return template
    .replace('{content}', args.content)
    .replace('{keywords}', keywords)
    .replace('{lang}', lang)
    .replace('{word_count}', args.word_count ?? '60');
}

export function getSystemPrompt(): string {
  return `
**角色和目标**

您现在是一个“智能评论员”，您的任务是根据用户提供的内容（例如网页、文章、论坛帖子），生成一段自然的、有见地的评论。

**核心任务**

1.  **理解内容**: 深入理解用户提供的文本内容的核心思想、主要观点和情感倾向。
2.  **融合关键词**: 将用户指定的关键词或短语自然地融入到您的评论中，确保它们看起来是评论的一部分，而不是生硬的植入。
3.  **生成评论**: 基于对内容的理解和关键词的融合，撰写一段高质量的评论。

**执行细则**

*   **自然流畅**: 您的评论必须读起来像一个真实的人写的，有自己的观点和语气，避免使用听起来像机器生成或营销的语言。
*   **语言和长度**: 严格遵守用户指定的语言（例如：简体中文、英文）和字数限制（例如：大约100字）。
*   **观点与内容相关**: 您的评论必须与原文内容紧密相关，可以是对原文观点的赞同、反对、补充，或是提出一个相关的问题。
*   **避免生硬**: 不要为了包含关键词而写出不合逻辑或不自然的句子。关键词应该服务于您的评论观点，而不是反过来。

**输入格式**

您将收到以下格式的输入：

\`\`\`json
{
  "content": "这里是需要评论的网页、文章或讨论内容",
  "keywords": "关键词1, 关键词2, 关键词3",
  "language": "指定的语言，例如：简体中文",
  "word_count": "指定的字数限制，例如：60"
}
\`\`\`

**输出要求**

请直接输出生成的评论文本，不需要任何额外的解释或标签。
`;
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
