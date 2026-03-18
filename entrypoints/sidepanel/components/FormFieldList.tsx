import type { FormField } from '../../../src/types';

interface FormFieldListProps {
  fields: FormField[];
  isScanning: boolean;
  hasComment: boolean;
  onScan: () => void;
  onLocate: (field: FormField) => void;
  onFill: (field: FormField) => void;
  onFillAll: () => void;
}

function getTypeBadge(field: FormField): { text: string; className: string } {
  if (field.isContentEditable) {
    return { text: '富文本', className: 'badge-secondary' };
  }

  if (field.tagName === 'TEXTAREA') {
    return { text: '评论', className: 'badge-accent' };
  }

  switch (field.inputType) {
    case 'email':
      return { text: '邮箱', className: 'badge-info' };
    case 'search':
      return { text: '搜索', className: 'badge-warning' };
    case 'password':
      return { text: '密码', className: 'badge-error' };
    case 'url':
      return { text: '网址', className: 'badge-primary' };
    case 'tel':
      return { text: '电话', className: 'badge-primary' };
    case 'number':
      return { text: '数字', className: 'badge-primary' };
    default:
      return { text: '文本', className: 'badge-neutral' };
  }
}

export function FormFieldList({ fields, isScanning, hasComment, onScan, onLocate, onFill, onFillAll }: FormFieldListProps) {
  return (
    <div className="mt-4">
      <div className="flex gap-2 mb-3">
        <button
          type="button"
          className="btn btn-outline btn-sm flex-1"
          onClick={onScan}
          disabled={isScanning}
        >
          {isScanning ? (
            <>
              <span className="loading loading-spinner loading-xs"></span>
              扫描中...
            </>
          ) : (
            '扫描输入框'
          )}
        </button>
        {fields.length > 0 && hasComment && (
          <button
            type="button"
            className="btn btn-warning btn-sm"
            onClick={onFillAll}
          >
            一键填写
          </button>
        )}
      </div>

      {!isScanning && fields.length === 0 && (
        <div className="text-sm text-base-content/50 text-center py-2">
          未检测到可输入的表单字段
        </div>
      )}

      {fields.length > 0 && (
        <div className="space-y-2">
          {fields.map((field) => {
            const badge = getTypeBadge(field);
            return (
              <div
                key={field.id}
                className="flex items-center gap-2 p-2 rounded-lg bg-base-200 hover:bg-base-300 transition-colors"
              >
                <span className={`badge badge-sm ${badge.className} shrink-0`}>
                  {badge.text}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="text-sm truncate">{field.label}</div>
                  {field.placeholder && (
                    <div className="text-xs text-base-content/40 truncate">
                      {field.placeholder}
                    </div>
                  )}
                </div>
                <button
                  type="button"
                  className="btn btn-xs btn-ghost shrink-0"
                  onClick={() => onLocate(field)}
                  title="定位到此字段"
                >
                  定位
                </button>
                {hasComment && (
                  <button
                    type="button"
                    className="btn btn-xs btn-warning shrink-0"
                    onClick={() => onFill(field)}
                  >
                    填入
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
