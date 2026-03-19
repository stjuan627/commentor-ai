import { useState } from 'react';
import type { KeywordItem, Product } from '../../../src/types';

interface SiteManagerProps {
  sites: Product[];
  onAddSite: (name: string) => void;
  onUpdateSite: (siteId: string, name: string) => void;
  onDeleteSite: (siteId: string) => void;
  onAddKeyword: (siteId: string, keyword: Omit<KeywordItem, 'enabled'>) => void;
  onUpdateKeyword: (siteId: string, keywordIndex: number, keyword: Omit<KeywordItem, 'enabled'>) => void;
  onDeleteKeyword: (siteId: string, keywordIndex: number) => void;
  onToggleKeyword: (siteId: string, keywordIndex: number) => void;
}

type KeywordDraft = {
  keyword: string;
  url: string;
};

const EMPTY_DRAFT: KeywordDraft = { keyword: '', url: '' };

export function SiteManager({
  sites,
  onAddSite,
  onUpdateSite,
  onDeleteSite,
  onAddKeyword,
  onUpdateKeyword,
  onDeleteKeyword,
  onToggleKeyword,
}: SiteManagerProps) {
  const [newSiteName, setNewSiteName] = useState('');
  const [editingSiteId, setEditingSiteId] = useState<string | null>(null);
  const [siteNameDraft, setSiteNameDraft] = useState('');

  const [keywordDrafts, setKeywordDrafts] = useState<Record<string, KeywordDraft>>({});
  const [editingKeyword, setEditingKeyword] = useState<{ siteId: string; index: number } | null>(null);

  const getDraft = (siteId: string): KeywordDraft => keywordDrafts[siteId] ?? EMPTY_DRAFT;

  const setDraft = (siteId: string, draft: KeywordDraft) => {
    setKeywordDrafts((prev) => ({
      ...prev,
      [siteId]: draft,
    }));
  };

  const resetDraft = (siteId: string) => {
    setDraft(siteId, EMPTY_DRAFT);
  };

  const handleAddSite = () => {
    const trimmed = newSiteName.trim();
    if (!trimmed) return;
    onAddSite(trimmed);
    setNewSiteName('');
  };

  const handleStartEditSite = (site: Product) => {
    setEditingSiteId(site.id);
    setSiteNameDraft(site.name);
  };

  const handleSaveEditSite = () => {
    if (!editingSiteId) return;
    const trimmed = siteNameDraft.trim();
    if (!trimmed) return;
    onUpdateSite(editingSiteId, trimmed);
    setEditingSiteId(null);
    setSiteNameDraft('');
  };

  const handleCancelEditSite = () => {
    setEditingSiteId(null);
    setSiteNameDraft('');
  };

  const handleAddKeyword = (siteId: string) => {
    const draft = getDraft(siteId);
    const keyword = draft.keyword.trim();
    const url = draft.url.trim();
    if (!keyword || !url) return;

    onAddKeyword(siteId, { keyword, url });
    resetDraft(siteId);
  };

  const handleStartEditKeyword = (siteId: string, index: number, item: KeywordItem) => {
    setEditingKeyword({ siteId, index });
    setDraft(siteId, {
      keyword: item.keyword,
      url: item.url,
    });
  };

  const handleUpdateKeyword = (siteId: string) => {
    if (!editingKeyword || editingKeyword.siteId !== siteId) return;
    const draft = getDraft(siteId);
    const keyword = draft.keyword.trim();
    const url = draft.url.trim();
    if (!keyword || !url) return;

    onUpdateKeyword(siteId, editingKeyword.index, { keyword, url });
    setEditingKeyword(null);
    resetDraft(siteId);
  };

  const handleCancelEditKeyword = (siteId: string) => {
    setEditingKeyword(null);
    resetDraft(siteId);
  };

  return (
    <div className="card bg-base-200 mb-4">
      <div className="card-body p-4">
        <h2 className="card-title text-lg mb-3">项目管理</h2>

        <div className="flex flex-wrap gap-2 mb-4">
          <input
            type="text"
            className="input input-bordered input-sm flex-1 min-w-[180px]"
            placeholder="新增项目名称"
            value={newSiteName}
            onChange={(event) => setNewSiteName(event.target.value)}
          />
          <button type="button" className="btn btn-sm btn-warning" onClick={handleAddSite}>
            添加项目
          </button>
        </div>

        <div className="space-y-3">
          {sites.map((site) => {
            const draft = getDraft(site.id);
            const isEditingKeyword = editingKeyword?.siteId === site.id;

            return (
              <div key={site.id} className="rounded-md border border-base-300 bg-base-100 p-3">
                <div className="flex flex-wrap items-center gap-2 mb-3">
                  {editingSiteId === site.id ? (
                    <>
                      <input
                        type="text"
                        className="input input-bordered input-sm"
                        value={siteNameDraft}
                        onChange={(event) => setSiteNameDraft(event.target.value)}
                      />
                      <button type="button" className="btn btn-xs btn-warning" onClick={handleSaveEditSite}>
                        保存
                      </button>
                      <button type="button" className="btn btn-xs btn-ghost" onClick={handleCancelEditSite}>
                        取消
                      </button>
                    </>
                  ) : (
                    <>
                      <h3 className="font-semibold">{site.name}</h3>
                      <button
                        type="button"
                        className="btn btn-xs btn-circle btn-ghost"
                        onClick={() => handleStartEditSite(site)}
                         title="编辑项目"
                      >
                        ✎
                      </button>
                      <button
                        type="button"
                        className="btn btn-xs btn-circle btn-ghost"
                        onClick={() => onDeleteSite(site.id)}
                         title="删除项目"
                      >
                        ×
                      </button>
                    </>
                  )}
                </div>

                <div className="flex flex-wrap gap-2 mb-3">
                  <input
                    type="text"
                    className="input input-bordered input-sm flex-1 min-w-[120px]"
                    placeholder="关键词"
                    value={draft.keyword}
                    onChange={(event) => setDraft(site.id, { ...draft, keyword: event.target.value })}
                  />
                  <input
                    type="text"
                    className="input input-bordered input-sm flex-1 min-w-[160px]"
                    placeholder="URL"
                    value={draft.url}
                    onChange={(event) => setDraft(site.id, { ...draft, url: event.target.value })}
                  />

                  {isEditingKeyword ? (
                    <>
                      <button
                        type="button"
                        className="btn btn-sm btn-warning"
                        onClick={() => handleUpdateKeyword(site.id)}
                      >
                        更新
                      </button>
                      <button
                        type="button"
                        className="btn btn-sm btn-ghost"
                        onClick={() => handleCancelEditKeyword(site.id)}
                      >
                        取消
                      </button>
                    </>
                  ) : (
                    <button
                      type="button"
                      className="btn btn-sm btn-warning"
                      onClick={() => handleAddKeyword(site.id)}
                    >
                      添加关键词
                    </button>
                  )}
                </div>

                {site.keywords.length > 0 ? (
                  <div className="overflow-x-auto">
                    <table className="table table-xs">
                      <thead>
                        <tr>
                          <th>关键词/URL</th>
                          <th>启用</th>
                          <th>操作</th>
                        </tr>
                      </thead>
                      <tbody>
                        {site.keywords.map((item, index) => (
                          <tr key={`${site.id}-${item.keyword}-${index}`}>
                            <td valign="top">
                              <span className="text-sm">{item.keyword}</span>
                              <div className="truncate max-w-[180px]">
                                <a
                                  href={item.url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="link text-base-content/60 tracking-tight"
                                >
                                  {item.url}
                                </a>
                              </div>
                            </td>
                            <td valign="top">
                              <input
                                type="checkbox"
                                className="checkbox checkbox-sm"
                                checked={item.enabled}
                                onChange={() => onToggleKeyword(site.id, index)}
                              />
                            </td>
                            <td valign="top" className="flex gap-1">
                              <button
                                type="button"
                                className="btn btn-xs btn-circle btn-ghost"
                                onClick={() => handleStartEditKeyword(site.id, index, item)}
                                title="编辑"
                              >
                                ✎
                              </button>
                              <button
                                type="button"
                                className="btn btn-xs btn-circle btn-ghost"
                                onClick={() => onDeleteKeyword(site.id, index)}
                                title="删除"
                              >
                                ×
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                   <p className="text-sm text-base-content/60">该项目暂无关键词</p>
                )}
              </div>
            );
          })}
        </div>

         {sites.length === 0 && <p className="text-sm text-base-content/60">暂无项目，请先添加</p>}
      </div>
    </div>
  );
}
