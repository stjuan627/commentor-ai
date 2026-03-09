import { CopyButton } from '../../../src/components/CopyButton';

interface CommentOutputProps {
  comments: string[];
  keywords: { keyword: string; url: string; enabled: boolean }[];
  onCopy: (comment: string, format: 'txt' | 'html' | 'markdown' | 'bbcode') => void;
}

function addLinksToComment(
  comment: string,
  keywords: { keyword: string; url: string; enabled: boolean }[],
  format: 'html' | 'markdown' | 'bbcode'
) {
  let result = comment;

  const sortedKeywords = [...keywords]
    .filter((k) => k.enabled)
    .sort((a, b) => b.keyword.length - a.keyword.length);

  for (const { keyword, url } of sortedKeywords) {
    const regex = new RegExp(`\\b${keyword}\\b`, 'gi');

    if (format === 'html') {
      result = result.replace(regex, `<a href="${url}">${keyword}</a>`);
    } else if (format === 'markdown') {
      result = result.replace(regex, `[${keyword}](${url})`);
    } else if (format === 'bbcode') {
      result = result.replace(regex, `[url=${url}]${keyword}[/url]`);
    }
  }

  return result;
}

function highlightKeywords(
  comment: string,
  keywords: { keyword: string; enabled: boolean }[]
) {
  let result = comment;

  const sortedKeywords = [...keywords]
    .filter((k) => k.enabled)
    .sort((a, b) => b.keyword.length - a.keyword.length);

  for (const { keyword } of sortedKeywords) {
    const regex = new RegExp(`\\b${keyword}\\b`, 'gi');
    result = result.replace(
      regex,
      `<span class="text-error font-bold">${keyword}</span>`
    );
  }

  return result;
}

export function CommentOutput({ comments, keywords, onCopy }: CommentOutputProps) {
  if (!comments || comments.length === 0) return null;

  return (
    <div className="mt-4">
      <h2 className="text-lg font-semibold mb-2">生成的评论</h2>
      {comments.map((comment, index) => (
        <div key={index} className="card bg-base-200 mb-2 p-4">
          <div className="flex justify-between items-center mb-2 border-b border-base-300 pb-3">
            <div className="flex gap-2 items-center flex-wrap">
              <span className="uppercase font-bold">Copy As</span>
              <CopyButton
                onClick={() => onCopy(comment, 'txt')}
                className="btn btn-xs btn-outline btn-neutral"
              >
                TXT
              </CopyButton>
              <CopyButton
                onClick={() => onCopy(comment, 'html')}
                className="btn btn-xs btn-info"
              >
                HTML
              </CopyButton>
              <CopyButton
                onClick={() => onCopy(comment, 'markdown')}
                className="btn btn-xs btn-success"
              >
                MD
              </CopyButton>
              <CopyButton
                onClick={() => onCopy(comment, 'bbcode')}
                className="btn btn-xs btn-primary"
              >
                BBCode
              </CopyButton>
            </div>
          </div>
          <div className="card-body p-0 text-start">
            <div
              className="whitespace-pre-wrap"
              dangerouslySetInnerHTML={{
                __html: highlightKeywords(comment, keywords),
              }}
            />
            {index > 0 && (
              <span className="badge badge-outline badge-info inline-block mt-2">
                本地化
              </span>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
