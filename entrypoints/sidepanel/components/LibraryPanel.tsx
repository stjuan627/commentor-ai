import { useState, useEffect } from 'react';
import type { PageRecord, LibrarySnapshot, PageStatus } from '../../../src/types';

interface LibraryPanelProps {
  onOpenPage: (record: PageRecord) => void;
  onStatusChange: (record: PageRecord, newStatus: PageStatus) => Promise<void>;
}

export function LibraryPanel({ onOpenPage, onStatusChange }: LibraryPanelProps) {
  const [snapshot, setSnapshot] = useState<LibrarySnapshot | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedSite, setSelectedSite] = useState<string | null>(null);
  const [unconfigured, setUnconfigured] = useState(false);

  const loadLibrary = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await browser.runtime.sendMessage({ action: 'libraryBootstrap' });
      if (response.success) {
        if (response.status === 'unconfigured') {
          setUnconfigured(true);
          setSnapshot(null);
        } else {
          setUnconfigured(false);
          setSnapshot(response.snapshot);
        }
      } else {
        setError(response.error || '加载库失败');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载库失败');
    } finally {
      setLoading(false);
    }
  };

  const refreshLibrary = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await browser.runtime.sendMessage({ action: 'libraryRefresh' });
      if (response.success) {
        setSnapshot(response.snapshot);
        setUnconfigured(false);
      } else {
        if (response.status === 'unconfigured') {
          setUnconfigured(true);
        } else {
          setError(response.error || '刷新库失败');
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '刷新库失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const init = async () => {
      setLoading(true);
      setError(null);
      try {
        const response = await browser.runtime.sendMessage({ action: 'libraryBootstrap' });
        if (response.success) {
          if (response.status === 'unconfigured') {
            setUnconfigured(true);
            setSnapshot(null);
          } else {
            setUnconfigured(false);
            setSnapshot(response.snapshot);
          }
        } else {
          setError(response.error || '加载库失败');
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : '加载库失败');
      } finally {
        setLoading(false);
      }
    };
    init();
  }, []);

  const records = snapshot?.records || [];
  const sites = Array.from(new Set(records.map(r => r.siteKey)));
  const filteredRecords = selectedSite
    ? records.filter(r => r.siteKey === selectedSite)
    : records;

  const handleStatusChange = async (record: PageRecord, newStatus: PageStatus) => {
    if (snapshot) {
      const updatedRecords = snapshot.records.map(r =>
        r.pageKey === record.pageKey && r.siteKey === record.siteKey
          ? { ...r, status: newStatus, syncState: 'pending' as const }
          : r
      );
      setSnapshot({ ...snapshot, records: updatedRecords });
    }

    try {
      await onStatusChange(record, newStatus);
    } catch (err) {
      if (snapshot) {
        const revertedRecords = snapshot.records.map(r =>
          r.pageKey === record.pageKey && r.siteKey === record.siteKey
            ? { ...r, status: record.status, syncState: 'error' as const }
            : r
        );
        setSnapshot({ ...snapshot, records: revertedRecords });
      }
      setError(err instanceof Error ? err.message : '更新状态失败');
    }
  };

  if (unconfigured) {
    return (
      <div className="p-4" data-testid="library-unconfigured">
        <div className="alert alert-info">
          <span>请先在设置页配置数据源</span>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-xl font-bold">网页库</h2>
        <button
          type="button"
          className="btn btn-sm btn-primary"
          onClick={refreshLibrary}
          disabled={loading}
          data-testid="library-refresh"
        >
          {loading ? '刷新中...' : '刷新'}
        </button>
      </div>

      {error && (
        <div className="alert alert-error mb-4">
          <span>{error}</span>
        </div>
      )}

      {sites.length > 0 && (
        <div className="flex gap-2 mb-4 flex-wrap">
          <button
            type="button"
            className={`badge ${!selectedSite ? 'badge-primary' : 'badge-outline'} cursor-pointer`}
            onClick={() => setSelectedSite(null)}
          >
            全部 ({records.length})
          </button>
          {sites.map(site => (
            <button
              key={site}
              type="button"
              className={`badge ${selectedSite === site ? 'badge-primary' : 'badge-outline'} cursor-pointer`}
              onClick={() => setSelectedSite(site)}
              data-testid={`site-filter-${site}`}
            >
              {site} ({records.filter(r => r.siteKey === site).length})
            </button>
          ))}
        </div>
      )}

      {loading && !snapshot && (
        <div className="flex justify-center p-8">
          <span className="loading loading-spinner loading-lg"></span>
        </div>
      )}

      {!loading && filteredRecords.length === 0 && (
        <div className="alert alert-info">
          <span>暂无页面记录</span>
        </div>
      )}

      <div className="space-y-2" data-testid="library-list">
        {filteredRecords.map(record => (
          <div key={`${record.siteKey}-${record.pageKey}`} className="card bg-base-200">
            <div className="card-body p-4">
              <div className="flex justify-between items-start">
                <div className="flex-1">
                  <h3 className="font-semibold">{record.title || record.canonicalUrl}</h3>
                  <p className="text-sm text-base-content/70">{record.siteKey}</p>
                </div>
                <div className="flex gap-2 items-center">
                  <span className={`badge ${
                    record.status === 'done' ? 'badge-success' :
                    record.status === 'invalid' ? 'badge-error' :
                    'badge-warning'
                  }`}>
                    {record.status === 'done' ? '已完成' :
                     record.status === 'invalid' ? '无效' :
                     '待处理'}
                  </span>
                  {record.syncState && (
                    <span className={`badge badge-sm ${
                      record.syncState === 'synced' ? 'badge-success' :
                      record.syncState === 'pending' ? 'badge-warning' :
                      record.syncState === 'retrying' ? 'badge-warning' :
                      'badge-error'
                    }`} data-testid="sync-state">
                      {record.syncState === 'synced' ? '已同步' :
                       record.syncState === 'pending' ? '待同步' :
                       record.syncState === 'retrying' ? '重试中' :
                       '同步失败'}
                    </span>
                  )}
                </div>
              </div>
              <div className="flex gap-2 mt-2">
                <button
                  type="button"
                  className="btn btn-sm btn-primary"
                  onClick={() => onOpenPage(record)}
                  data-testid={`library-open-row-${record.pageKey}-${record.siteKey}`}
                >
                  打开
                </button>
                {record.status !== 'done' && (
                  <button
                    type="button"
                    className="btn btn-sm btn-success"
                    onClick={() => handleStatusChange(record, 'done')}
                    data-testid="status-done"
                  >
                    标记完成
                  </button>
                )}
                {record.status !== 'invalid' && (
                  <button
                    type="button"
                    className="btn btn-sm btn-error"
                    onClick={() => handleStatusChange(record, 'invalid')}
                    data-testid="status-invalid"
                  >
                    标记无效
                  </button>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
