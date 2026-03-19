import type { Product } from '../../../src/types';

interface SiteKeywordSelectorProps {
  sites: Product[];
  onToggle: (siteId: string, keywordIndex: number) => void;
}

export function SiteKeywordSelector({ sites, onToggle }: SiteKeywordSelectorProps) {
  return (
    <div className="mb-4 rounded-xl bg-base-200 px-3 py-2.5">
      <h2 className="mb-2 text-sm font-semibold text-base-content/80">关键词</h2>

      {sites.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {sites.map((site) => (
            site.keywords.length > 0 ? site.keywords.map((item, index) => (
              <button
                key={`${site.id}-${item.keyword}-${index}`}
                type="button"
                onClick={() => onToggle(site.id, index)}
                className={`badge cursor-pointer ${item.enabled ? 'badge-warning' : 'badge-outline'}`}
                title={item.url}
              >
                {item.keyword}
              </button>
            )) : (
              <p key={site.id} className="text-xs text-base-content/60">该项目暂无关键词</p>
            )
          ))}
        </div>
      ) : (
        <p className="text-xs text-base-content/60">暂无项目，请先到项目页添加项目与关键词</p>
      )}
    </div>
  );
}
