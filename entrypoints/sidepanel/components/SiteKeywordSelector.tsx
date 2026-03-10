import type { SiteItem } from '../../../src/types';

interface SiteKeywordSelectorProps {
  sites: SiteItem[];
  onToggle: (siteId: string, keywordIndex: number) => void;
}

export function SiteKeywordSelector({ sites, onToggle }: SiteKeywordSelectorProps) {
  return (
    <div className="mb-6 border rounded-lg p-3 bg-base-200">
      <h2 className="text-lg font-semibold mb-2">关键词选择</h2>

      {sites.length > 0 ? (
        <div className="space-y-3">
          {sites.map((site) => (
            <div key={site.id} className="rounded-md border border-base-300 bg-base-100 p-3">
              <p className="text-sm font-semibold mb-2">{site.name}</p>

              {site.keywords.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {site.keywords.map((item, index) => (
                    <button
                      key={`${site.id}-${item.keyword}-${index}`}
                      type="button"
                      onClick={() => onToggle(site.id, index)}
                      className={`badge badge-lg cursor-pointer ${item.enabled ? 'badge-warning' : 'badge-outline'}`}
                      title={item.url}
                    >
                      {item.keyword}
                    </button>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-base-content/60">该站点暂无关键词</p>
              )}
            </div>
          ))}
        </div>
      ) : (
        <p className="text-sm text-base-content/60">暂无站点，请先到设置页添加站点与关键词</p>
      )}
    </div>
  );
}
