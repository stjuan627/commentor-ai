import { useMemo, useState } from 'react';
import type { Product, ProductTaskRecord, PageStatus, WebPageBooleanField } from '../../../src/types';

interface ProductTaskPanelProps {
  products: Product[];
  tasksByProduct: Record<string, ProductTaskRecord[]>;
  activeProductId: string | null;
  loading: boolean;
  error: string | null;
  unconfigured: boolean;
  onRefresh: () => Promise<void>;
  onOpenTask: (task: ProductTaskRecord) => Promise<void>;
  onStatusChange: (task: ProductTaskRecord, status: PageStatus) => Promise<void>;
  onPageFieldChange: (task: ProductTaskRecord, field: WebPageBooleanField, value: boolean) => Promise<void>;
}

const STATUS_LABELS: Record<'all' | PageStatus, string> = {
  all: '全部',
  pending: '未完成',
  done: '已完成',
  invalid: '无效',
};

const META_BADGE_CLASS = 'badge badge-sm badge-outline border-base-content/30 text-base-content/75';

const TYPE_LABELS: Record<ProductTaskRecord['type'], string> = {
  profile: 'Profile',
  comment: 'Comment',
  post: 'Post',
};

const FORMAT_LABELS: Record<ProductTaskRecord['format'], string> = {
  html: 'HTML',
  markdown: 'Markdown',
  bbcode: 'BBCode',
  others: 'Others',
};

type PendingTaskAction = PageStatus | 'open' | WebPageBooleanField;

export function ProductTaskPanel({
  products,
  tasksByProduct,
  activeProductId,
  loading,
  error,
  unconfigured,
  onRefresh,
  onOpenTask,
  onStatusChange,
  onPageFieldChange,
}: ProductTaskPanelProps) {
  const [selectedStatus, setSelectedStatus] = useState<'all' | PageStatus>('all');
  const [pendingActions, setPendingActions] = useState<Record<string, PendingTaskAction>>({});

  const activeProduct = useMemo(
    () => products.find((product) => product.id === activeProductId) ?? products[0] ?? null,
    [activeProductId, products],
  );

  const tasks = activeProduct ? tasksByProduct[activeProduct.id] ?? [] : [];
  const filteredTasks = tasks.filter((task) => {
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
          <span>请先在设置页配置数据源</span>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center justify-between gap-3">
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
        <button type="button" className="btn btn-sm btn-primary" onClick={() => void onRefresh()} disabled={loading}>
          {loading ? '刷新中...' : '刷新'}
        </button>
      </div>

      {error && (
        <div className="alert alert-error">
          <span>{error}</span>
        </div>
      )}

      {activeProduct && (
        <div className="space-y-2">
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

          {filteredTasks.map((task) => {
            const taskKey = `${task.productId}::${task.pageKey}`;
            const pendingAction = pendingActions[taskKey];
            const isBusy = Boolean(pendingAction);

            return (
              <div
                key={taskKey}
                className={`relative overflow-hidden rounded-xl border ${task.status === 'done' ? 'border-success bg-success/10' : 'border-base-300 bg-base-200'} px-3 py-2.5`}
              >
                {task.status === 'done' && (
                  <span className="absolute right-0 top-0 flex h-6 w-6 items-start justify-end rounded-bl-xl bg-success text-success-content">
                    <span className="pr-1 pt-0.5 text-xs font-bold">✓</span>
                  </span>
                )}
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0 flex flex-wrap items-center gap-2">
                    <span className="text-sm font-medium text-base-content/85">{task.siteKey}</span>
                    {task.status !== 'done' && (
                      <span className={`badge badge-sm ${task.status === 'invalid' ? 'badge-error' : 'badge-warning'}`}>
                        {STATUS_LABELS[task.status]}
                      </span>
                    )}
                    <span className={META_BADGE_CLASS}>{TYPE_LABELS[task.type]}</span>
                    <span className={META_BADGE_CLASS}>{FORMAT_LABELS[task.format]}</span>
                    {task.category && <span className={META_BADGE_CLASS}>{task.category}</span>}
                    {task.country && <span className={META_BADGE_CLASS}>{task.country}</span>}
                    {task.dofollow && <span className={META_BADGE_CLASS}>Dofollow</span>}
                    {task.loginRequired && <span className="badge badge-sm badge-warning">需登录</span>}
                    {task.approvalRequired && <span className="badge badge-sm badge-warning">需审核</span>}
                    {task.loginRequired === null && (
                      <button
                        type="button"
                        className="btn btn-xs btn-outline btn-warning"
                        disabled={isBusy}
                        onClick={async () => {
                          setPendingActions((prev) => ({ ...prev, [taskKey]: 'loginRequired' }));
                          try {
                            await onPageFieldChange(task, 'loginRequired', true);
                          } finally {
                            setPendingActions((prev) => {
                              const next = { ...prev };
                              delete next[taskKey];
                              return next;
                            });
                          }
                        }}
                      >
                        {pendingAction === 'loginRequired' ? '同步中...' : '要登录'}
                      </button>
                    )}
                    {task.approvalRequired === null && (
                      <button
                        type="button"
                        className="btn btn-xs btn-outline btn-warning"
                        disabled={isBusy}
                        onClick={async () => {
                          setPendingActions((prev) => ({ ...prev, [taskKey]: 'approvalRequired' }));
                          try {
                            await onPageFieldChange(task, 'approvalRequired', true);
                          } finally {
                            setPendingActions((prev) => {
                              const next = { ...prev };
                              delete next[taskKey];
                              return next;
                            });
                          }
                        }}
                      >
                        {pendingAction === 'approvalRequired' ? '同步中...' : '要审核'}
                      </button>
                    )}
                    {task.disabled && <span className={META_BADGE_CLASS}>已禁用</span>}
                    {task.syncState && task.syncState !== 'synced' && (
                      <span
                        className="inline-flex h-4 w-4 items-center justify-center rounded-full bg-warning text-[10px] font-bold text-warning-content"
                        title={task.syncState === 'error' ? '同步失败' : '待同步'}
                      >
                        !
                      </span>
                    )}
                  </div>

                  <div className="flex flex-wrap justify-end gap-2">
                    <button
                      type="button"
                      className="btn btn-xs btn-primary"
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
                      {pendingAction === 'open' ? '打开中...' : '打开'}
                    </button>

                    {task.status !== 'done' && (
                      <button
                        type="button"
                        className="btn btn-xs btn-success"
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
                        {pendingAction === 'done' ? '同步中...' : '完成'}
                      </button>
                    )}

                    {task.status !== 'invalid' && (
                      <button
                        type="button"
                        className="btn btn-xs btn-error"
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
                        {pendingAction === 'invalid' ? '同步中...' : '无效'}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {!activeProduct && !loading && products.length === 0 && (
        <div className="alert alert-info">
          <span>暂无项目，请先在项目页创建</span>
        </div>
      )}
    </div>
  );
}
