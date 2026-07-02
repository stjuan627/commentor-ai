import { useMemo, useState } from 'react';
import type {
  Product,
  ProductTaskRecord,
  PageStatus,
  WebPageEditableField,
  WebPageFormat,
  WebPageType,
} from '../../../src/types';

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
  onPageFieldChange: (
    task: ProductTaskRecord,
    field: WebPageEditableField,
    value: boolean | null | WebPageType | WebPageFormat,
  ) => Promise<void>;
}

const STATUS_LABELS: Record<'all' | PageStatus, string> = {
  all: '全部',
  pending: '未完成',
  done: '已完成',
  invalid: '无效',
};

const META_BADGE_CLASS = 'badge badge-sm badge-outline border-base-content/30 text-base-content/75';

const TYPE_OPTIONS: Array<{ value: WebPageType; label: string }> = [
  { value: 'comment', label: 'Comment' },
  { value: 'post', label: 'Post' },
  { value: 'bbs', label: 'BBS' },
];

const FORMAT_OPTIONS: Array<{ value: WebPageFormat; label: string }> = [
  { value: 'html', label: 'HTML' },
  { value: 'markdown', label: 'Markdown' },
  { value: 'bbcode', label: 'BBCode' },
  { value: 'others', label: 'Others' },
];

const BOOLEAN_FIELD_OPTIONS: Array<{ value: string; label: string }> = [
  { value: '', label: '未确认' },
  { value: 'true', label: '需要' },
  { value: 'false', label: '不需要' },
];

function booleanFieldToSelectValue(value: boolean | null): string {
  if (value == null) {
    return '';
  }

  return value ? 'true' : 'false';
}

function selectValueToBooleanField(value: string): boolean | null {
  if (value === '') {
    return null;
  }

  return value === 'true';
}

type PendingTaskAction = PageStatus | 'open' | WebPageEditableField;

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
                    <select
                      className="select select-bordered select-xs w-auto max-w-28"
                      value={task.type}
                      disabled={isBusy}
                      onChange={async (event) => {
                        setPendingActions((prev) => ({ ...prev, [taskKey]: 'type' }));
                        try {
                          await onPageFieldChange(task, 'type', event.target.value as WebPageType);
                        } finally {
                          setPendingActions((prev) => {
                            const next = { ...prev };
                            delete next[taskKey];
                            return next;
                          });
                        }
                      }}
                      title="类型"
                    >
                      {task.type === 'profile' && <option value="profile">Profile</option>}
                      {TYPE_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                    <select
                      className="select select-bordered select-xs w-auto max-w-32"
                      value={task.format}
                      disabled={isBusy}
                      onChange={async (event) => {
                        setPendingActions((prev) => ({ ...prev, [taskKey]: 'format' }));
                        try {
                          await onPageFieldChange(task, 'format', event.target.value as WebPageFormat);
                        } finally {
                          setPendingActions((prev) => {
                            const next = { ...prev };
                            delete next[taskKey];
                            return next;
                          });
                        }
                      }}
                      title="格式"
                    >
                      {FORMAT_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                    {task.category && <span className={META_BADGE_CLASS}>{task.category}</span>}
                    {task.country && <span className={META_BADGE_CLASS}>{task.country}</span>}
                    {task.dofollow && <span className={META_BADGE_CLASS}>Dofollow</span>}
                    <label className="flex items-center gap-1 text-xs text-base-content/70">
                      登录
                      <select
                        className="select select-bordered select-xs w-auto max-w-24"
                        value={booleanFieldToSelectValue(task.loginRequired)}
                        disabled={isBusy}
                        onChange={async (event) => {
                          setPendingActions((prev) => ({ ...prev, [taskKey]: 'loginRequired' }));
                          try {
                            await onPageFieldChange(task, 'loginRequired', selectValueToBooleanField(event.target.value));
                          } finally {
                            setPendingActions((prev) => {
                              const next = { ...prev };
                              delete next[taskKey];
                              return next;
                            });
                          }
                        }}
                        title="登录要求"
                      >
                        {BOOLEAN_FIELD_OPTIONS.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="flex items-center gap-1 text-xs text-base-content/70">
                      审核
                      <select
                        className="select select-bordered select-xs w-auto max-w-24"
                        value={booleanFieldToSelectValue(task.approvalRequired)}
                        disabled={isBusy}
                        onChange={async (event) => {
                          setPendingActions((prev) => ({ ...prev, [taskKey]: 'approvalRequired' }));
                          try {
                            await onPageFieldChange(task, 'approvalRequired', selectValueToBooleanField(event.target.value));
                          } finally {
                            setPendingActions((prev) => {
                              const next = { ...prev };
                              delete next[taskKey];
                              return next;
                            });
                          }
                        }}
                        title="审核要求"
                      >
                        {BOOLEAN_FIELD_OPTIONS.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </label>
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
                        {pendingAction === 'done' && <span className="loading loading-spinner loading-xs"></span>}
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
                        {pendingAction === 'invalid' && <span className="loading loading-spinner loading-xs"></span>}
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
