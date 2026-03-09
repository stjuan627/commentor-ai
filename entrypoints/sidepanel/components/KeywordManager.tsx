import { useState } from 'react';
import type { KeywordItem } from '../../../src/types';

interface KeywordManagerProps {
  keywords: KeywordItem[];
  onAdd: (keyword: Omit<KeywordItem, 'enabled'>) => void;
  onUpdate: (index: number, keyword: KeywordItem) => void;
  onDelete: (index: number) => void;
  onToggle: (index: number) => void;
  error?: string | null;
  onClearError?: () => void;
}

export function KeywordManager({
  keywords,
  onAdd,
  onUpdate,
  onDelete,
  onToggle,
  error,
  onClearError,
}: KeywordManagerProps) {
  const [newKeyword, setNewKeyword] = useState({ keyword: '', url: '' });
  const [editingIndex, setEditingIndex] = useState<number | null>(null);

  const handleAdd = () => {
    if (!newKeyword.keyword || !newKeyword.url) return;
    onAdd(newKeyword);
    setNewKeyword({ keyword: '', url: '' });
    onClearError?.();
  };

  const handleUpdate = () => {
    if (editingIndex === null) return;
    if (!newKeyword.keyword || !newKeyword.url) return;
    
    onUpdate(editingIndex, {
      ...keywords[editingIndex],
      keyword: newKeyword.keyword,
      url: newKeyword.url,
    });
    setNewKeyword({ keyword: '', url: '' });
    setEditingIndex(null);
    onClearError?.();
  };

  const handleEdit = (index: number) => {
    setNewKeyword({
      keyword: keywords[index].keyword,
      url: keywords[index].url,
    });
    setEditingIndex(index);
    onClearError?.();
  };

  const handleCancel = () => {
    setNewKeyword({ keyword: '', url: '' });
    setEditingIndex(null);
    onClearError?.();
  };

  return (
    <div className="mb-6 border rounded-lg p-3 bg-base-200">
      <h2 className="text-lg font-semibold mb-2">关键词管理</h2>
      
      {error && (
        <div className="alert alert-error mb-2 text-sm">
          <span>{error}</span>
        </div>
      )}
      
      <div className="flex gap-2 mb-3">
        <input
          type="text"
          placeholder="关键词"
          className="input input-bordered input-sm flex-1"
          value={newKeyword.keyword}
          onChange={(e) => setNewKeyword({ ...newKeyword, keyword: e.target.value })}
        />
        <input
          type="text"
          placeholder="URL"
          className="input input-bordered input-sm flex-1"
          value={newKeyword.url}
          onChange={(e) => setNewKeyword({ ...newKeyword, url: e.target.value })}
        />
        {editingIndex !== null ? (
          <>
            <button
              type="button"
              className="btn btn-sm btn-warning"
              onClick={handleUpdate}
            >
              更新
            </button>
            <button
              type="button"
              className="btn btn-sm btn-ghost"
              onClick={handleCancel}
            >
              取消
            </button>
          </>
        ) : (
          <button
            type="button"
            className="btn btn-sm btn-warning"
            onClick={handleAdd}
          >
            添加
          </button>
        )}
      </div>
      
      {keywords.length > 0 ? (
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
              {keywords.map((item, index) => (
                <tr key={index}>
                  <td valign="top">
                    <span className="text-sm">{item.keyword}</span>
                    <div className="truncate max-w-[150px]">
                      <a
                        href={item.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="link text-gray-400 tracking-tight"
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
                      onChange={() => onToggle(index)}
                    />
                  </td>
                  <td valign="top" className="flex gap-1">
                    <button
                      type="button"
                      className="btn btn-xs btn-circle btn-ghost"
                      onClick={() => handleEdit(index)}
                      title="编辑"
                    >
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        className="size-4"
                        viewBox="0 0 24 24"
                      >
                        <path
                          fill="none"
                          stroke="currentColor"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth="2"
                          d="M4 20h4L18.5 9.5a2.828 2.828 0 1 0-4-4L4 16zm9.5-13.5l4 4"
                        />
                      </svg>
                    </button>
                    <button
                      type="button"
                      className="btn btn-xs btn-circle btn-ghost"
                      onClick={() => onDelete(index)}
                      title="删除"
                    >
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        className="size-4"
                        viewBox="0 0 24 24"
                      >
                        <path
                          fill="none"
                          stroke="currentColor"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth="2"
                          d="M4 7h16m-10 4v6m4-6v6M5 7l1 12a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2l1-12M9 7V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v3"
                        />
                      </svg>
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="text-sm text-gray-500">暂无关键词</p>
      )}
    </div>
  );
}
