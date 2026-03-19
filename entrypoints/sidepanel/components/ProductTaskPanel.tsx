import { useMemo, useState } from 'react';
import type { Product, ProductTaskRecord, PageStatus } from '../../../src/types';

interface ProductTaskPanelProps {
  products: Product[];
  tasksByProduct: Record<string, ProductTaskRecord[]>;
  activeProductId: string | null;
  loading: boolean;
  error: string | null;
  unconfigured: boolean;
  onSelectProduct: (productId: string) => void;
  onRefresh: () => Promise<void>;
  onOpenTask: (task: ProductTaskRecord) => Promise<void>;
  onStatusChange: (task: ProductTaskRecord, status: PageStatus) => Promise<void>;
}

const STATUS_LABELS: Record<'all' | PageStatus, string> = {
  all: '全部',
  pending: '待处理',
  done: '已完成',
  invalid: '无效',
};

export function ProductTaskPanel({
  products,
  tasksByProduct,
  activeProductId,
  loading,
  error,
  unconfigured,
  onSelectProduct,
  onRefresh,
  onOpenTask,
  onStatusChange,
}: ProductTaskPanelProps) {
  const [selectedSite, setSelectedSite] = useState<string | null>(null);
  const [selectedStatus, setSelectedStatus] = useState<'all' | PageStatus>('all');
  const [pendingActions, setPendingActions] = useState<Record<string, PageStatus | 'open'>>({});

  const activeProduct = useMemo(
    () => products.find((product) => product.id === activeProductId) ?? products[0] ?? null,
    [activeProductId, products],
  );

  const tasks = activeProduct ? tasksByProduct[activeProduct.id] ?? [] : [];
  const sites = Array.from(new Set(tasks.map((task) => task.siteKey)));
  const filteredTasks = tasks.filter((task) => {
    if (selectedSite && task.siteKey !== selectedSite) {
      return false;
    }

    if (selectedStatus !== 'all' && task.status !== selectedStatus) {
      return false;
    }

    return true;
  });

  const countsByProduct = useMemo(() => {
    return Object.fromEntries(products.map((product) => {
      const productTasks = tasksByProduct[product.id] ?? [];
      return [product.id, {
        total: productTasks.length,
        done: productTasks.filter((task) => task.status === 'done').length,
        pending: productTasks.filter((task) => task.status === 'pending').length,
        invalid: productTasks.filter((task) => task.status === 'invalid').length,
      }];
    }));
  }, [products, tasksByProduct]);

  if (unconfigured) {
    return (
      <div className="p-4" data-testid="product-library-unconfigured">
        <div className="alert alert-info">
          <span>请先在设置页配置 Google Sheets 数据源</span>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold">产品任务</h2>
          <p className="text-sm text-base-content/60">按产品查看每个网页的评论提交进度</p>
        </div>
        <button type="button" className="btn btn-sm btn-primary" onClick={() => void onRefresh()} disabled={loading}>
          {loading ? '刷新中...' : '刷新网页库'}
        </button>
      </div>

      {error && (
        <div className="alert alert-error">
          <span>{error}</span>
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        {products.map((product) => {
          const counts = countsByProduct[product.id] ?? { total: 0, done: 0, pending: 0, invalid: 0 };
          const active = activeProduct?.id === product.id;
          return (
            <button
              key={product.id}
              type="button"
              className={`btn btn-sm ${active ? 'btn-warning' : 'btn-outline'}`}
              onClick={() => onSelectProduct(product.id)}
            >
              {product.name} {counts.done}/{counts.total}
            </button>
          );
        })}
      </div>

      {activeProduct && (
        <div className="card bg-base-200">
          <div className="card-body p-4 gap-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="card-title">当前产品：{activeProduct.name}</h3>
                <p className="text-sm text-base-content/60">
                  共 {tasks.length} 个网页，已完成 {countsByProduct[activeProduct.id]?.done ?? 0} 个
                </p>
              </div>

              <div className="flex flex-wrap gap-2">
                {(['all', 'pending', 'done', 'invalid'] as const).map((status) => (
                  <button
                    key={status}
                    type="button"
                    className={`badge cursor-pointer ${selectedStatus === status ? 'badge-warning' : 'badge-outline'}`}
                    onClick={() => setSelectedStatus(status)}
                  >
                    {STATUS_LABELS[status]}
                  </button>
                ))}
              </div>
            </div>

            {sites.length > 0 && (
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  className={`badge cursor-pointer ${selectedSite === null ? 'badge-primary' : 'badge-outline'}`}
                  onClick={() => setSelectedSite(null)}
                >
                  全部站点
                </button>
                {sites.map((site) => (
                  <button
                    key={site}
                    type="button"
                    className={`badge cursor-pointer ${selectedSite === site ? 'badge-primary' : 'badge-outline'}`}
                    onClick={() => setSelectedSite(site)}
                  >
                    {site}
                  </button>
                ))}
              </div>
            )}

            {loading && tasks.length === 0 && (
              <div className="flex justify-center py-8">
                <span className="loading loading-spinner loading-lg"></span>
              </div>
            )}

            {!loading && filteredTasks.length === 0 && (
              <div className="alert alert-info">
                <span>当前筛选条件下没有任务</span>
              </div>
            )}

            <div className="space-y-2">
              {filteredTasks.map((task) => {
                const taskKey = `${task.productId}::${task.pageKey}`;
                const pendingAction = pendingActions[taskKey];
                const isBusy = Boolean(pendingAction);

                return (
                  <div key={taskKey} className="card bg-base-100 border border-base-300">
                    <div className="card-body p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <h4 className="font-semibold leading-snug">{task.title || task.canonicalUrl}</h4>
                          <p className="text-sm text-base-content/60 break-all">{task.canonicalUrl}</p>
                          <p className="text-xs text-base-content/50 mt-1">{task.siteKey}</p>
                        </div>

                        <div className="flex flex-col items-end gap-2">
                          <span className={`badge ${task.status === 'done' ? 'badge-success' : task.status === 'invalid' ? 'badge-error' : 'badge-warning'}`}>
                            {STATUS_LABELS[task.status]}
                          </span>
                          {task.syncState && (
                            <span className={`badge badge-sm ${task.syncState === 'synced' ? 'badge-success' : task.syncState === 'error' ? 'badge-error' : 'badge-warning'}`}>
                              {task.syncState === 'synced' ? '已同步' : task.syncState === 'error' ? '同步失败' : '待同步'}
                            </span>
                          )}
                        </div>
                      </div>

                      {task.comment && (
                        <div className="rounded-md bg-base-200 px-3 py-2 text-sm text-base-content/80">
                          {task.comment}
                        </div>
                      )}

                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          className="btn btn-sm btn-primary"
                          disabled={isBusy}
                          onClick={async () => {
                            setPendingActions((prev) => ({ ...prev, [taskKey]: 'open' }));
                            try {
                              await onOpenTask(task);
                            } finally {
                              setPendingActions((prev) => {
                                const next = { ...prev };
                                delete next[taskKey];
                                return next;
                              });
                            }
                          }}
                        >
                          {pendingAction === 'open' ? '打开中...' : '打开并去评论'}
                        </button>

                        {task.status !== 'done' && (
                          <button
                            type="button"
                            className="btn btn-sm btn-success"
                            disabled={isBusy}
                            onClick={async () => {
                              setPendingActions((prev) => ({ ...prev, [taskKey]: 'done' }));
                              try {
                                await onStatusChange(task, 'done');
                              } finally {
                                setPendingActions((prev) => {
                                  const next = { ...prev };
                                  delete next[taskKey];
                                  return next;
                                });
                              }
                            }}
                          >
                            {pendingAction === 'done' ? '同步中...' : '标记完成'}
                          </button>
                        )}

                        {task.status !== 'invalid' && (
                          <button
                            type="button"
                            className="btn btn-sm btn-error"
                            disabled={isBusy}
                            onClick={async () => {
                              setPendingActions((prev) => ({ ...prev, [taskKey]: 'invalid' }));
                              try {
                                await onStatusChange(task, 'invalid');
                              } finally {
                                setPendingActions((prev) => {
                                  const next = { ...prev };
                                  delete next[taskKey];
                                  return next;
                                });
                              }
                            }}
                          >
                            {pendingAction === 'invalid' ? '同步中...' : '标记无效'}
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
