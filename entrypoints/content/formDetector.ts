import type { FormField } from '../../src/types';

const ALLOWED_INPUT_TYPES = new Set([
  'text', 'email', 'password', 'search', 'url', 'tel', 'number', '',
]);

const EXCLUDED_INPUT_TYPES = new Set([
  'hidden', 'submit', 'button', 'checkbox', 'radio', 'file',
  'range', 'color', 'date', 'datetime-local', 'month', 'week', 'time', 'image', 'reset',
]);

const TEXTBOX_ROLES = new Set(['textbox', 'searchbox', 'combobox']);

const TYPE_LABELS: Record<string, string> = {
  email: '邮箱输入框',
  password: '密码输入框',
  search: '搜索框',
  url: '网址输入框',
  tel: '电话输入框',
  number: '数字输入框',
  text: '文本输入框',
  '': '文本输入框',
};

let scanCounter = 0;

function isVisible(el: HTMLElement): boolean {
  if (el.getAttribute('aria-hidden') === 'true') return false;
  if ((el as HTMLInputElement).disabled) return false;
  if ((el as HTMLInputElement).readOnly && !el.isContentEditable) return false;

  // body/html 始终视为可见
  if (el === document.body || el === document.documentElement) return true;

  // offsetParent === null means hidden, except for fixed/sticky elements
  if (el.offsetParent === null) {
    const style = getComputedStyle(el);
    if (style.position !== 'fixed' && style.position !== 'sticky') {
      return false;
    }
  }
  return true;
}

function resolveLabel(el: HTMLElement): string {
  // 1. <label for="id">
  const id = el.id;
  if (id) {
    const label = document.querySelector<HTMLLabelElement>(`label[for="${CSS.escape(id)}"]`);
    if (label?.textContent?.trim()) return label.textContent.trim();
  }

  // 2. 父级 <label>
  const parentLabel = el.closest('label');
  if (parentLabel?.textContent?.trim()) {
    // Exclude the element's own text from the label
    const clone = parentLabel.cloneNode(true) as HTMLElement;
    const inputs = clone.querySelectorAll('input, textarea, select');
    inputs.forEach(input => input.remove());
    const text = clone.textContent?.trim();
    if (text) return text;
  }

  // 3. aria-label
  const ariaLabel = el.getAttribute('aria-label');
  if (ariaLabel?.trim()) return ariaLabel.trim();

  // 4. aria-labelledby
  const labelledBy = el.getAttribute('aria-labelledby');
  if (labelledBy) {
    const parts = labelledBy.split(/\s+/).map(refId => {
      return document.getElementById(refId)?.textContent?.trim() || '';
    }).filter(Boolean);
    if (parts.length > 0) return parts.join(' ');
  }

  // 5. placeholder
  const placeholder = (el as HTMLInputElement).placeholder;
  if (placeholder?.trim()) return placeholder.trim();

  // 6. title
  const title = el.title;
  if (title?.trim()) return title.trim();

  // 7. name attribute
  const name = (el as HTMLInputElement).name;
  if (name?.trim()) return name.trim();

  // 8. Infer from type
  const inputType = (el as HTMLInputElement).type?.toLowerCase() || '';
  if (TYPE_LABELS[inputType]) return TYPE_LABELS[inputType];

  // Fallback based on tag
  const tag = el.tagName.toLowerCase();
  if (tag === 'textarea') return '文本区域';
  if (el.isContentEditable) return '富文本编辑器';

  return '输入框';
}

function generateSelector(el: HTMLElement): string {
  // 1. Prefer id
  if (el.id) {
    return `#${CSS.escape(el.id)}`;
  }

  // 2. name + type for inputs
  const tag = el.tagName.toLowerCase();
  const name = (el as HTMLInputElement).name;
  const type = (el as HTMLInputElement).type;

  if (name && (tag === 'input' || tag === 'textarea')) {
    const selector = type
      ? `${tag}[name="${CSS.escape(name)}"][type="${CSS.escape(type)}"]`
      : `${tag}[name="${CSS.escape(name)}"]`;
    if (document.querySelectorAll(selector).length === 1) {
      return selector;
    }
  }

  // 3. Build nth-of-type path
  const parts: string[] = [];
  let current: Element | null = el;

  while (current && current !== document.body && current !== document.documentElement) {
    let segment = current.tagName.toLowerCase();
    const parent: Element | null = current.parentElement;

    if (parent) {
      const siblings = Array.from(parent.children).filter(
        (c: Element) => c.tagName === current!.tagName
      );
      if (siblings.length > 1) {
        const index = siblings.indexOf(current) + 1;
        segment += `:nth-of-type(${index})`;
      }
    }

    parts.unshift(segment);
    current = parent;
  }

  return parts.join(' > ');
}

function isTargetElement(el: HTMLElement): boolean {
  const tag = el.tagName.toLowerCase();

  if (tag === 'textarea') return true;

  if (tag === 'input') {
    const type = (el as HTMLInputElement).type?.toLowerCase() || 'text';
    return ALLOWED_INPUT_TYPES.has(type) && !EXCLUDED_INPUT_TYPES.has(type);
  }

  if (
    el.getAttribute('contenteditable') === 'true' ||
    el.getAttribute('contenteditable') === ''
  ) {
    return true;
  }

  const role = el.getAttribute('role')?.toLowerCase();
  if (role && TEXTBOX_ROLES.has(role)) return true;

  return false;
}

export function scanFormFields(): FormField[] {
  scanCounter++;
  const prefix = `scan-${scanCounter}`;
  const fields: FormField[] = [];
  let fieldIndex = 0;

  function pushField(el: HTMLElement) {
    const tag = el.tagName.toUpperCase();
    const inputType = (el as HTMLInputElement).type?.toLowerCase();
    const role = el.getAttribute('role') || undefined;

    fields.push({
      id: `${prefix}-${fieldIndex++}`,
      tagName: tag,
      inputType: tag === 'INPUT' ? (inputType || 'text') : undefined,
      label: resolveLabel(el),
      placeholder: (el as HTMLInputElement).placeholder || undefined,
      role,
      isContentEditable: el.isContentEditable && tag !== 'INPUT' && tag !== 'TEXTAREA',
      selector: generateSelector(el),
    });
  }

  // TreeWalker 不遍历根节点本身，需单独检查 document.body
  // 覆盖 TinyMCE 等编辑器：iframe 内 body[contenteditable="true"] 就是输入区
  if (isTargetElement(document.body) && isVisible(document.body)) {
    pushField(document.body);
  }

  const walker = document.createTreeWalker(
    document.body,
    NodeFilter.SHOW_ELEMENT,
    {
      acceptNode(node) {
        const el = node as HTMLElement;
        if (isTargetElement(el) && isVisible(el)) {
          return NodeFilter.FILTER_ACCEPT;
        }
        return NodeFilter.FILTER_SKIP;
      },
    }
  );

  let node: Node | null;
  while ((node = walker.nextNode())) {
    pushField(node as HTMLElement);
  }

  return fields;
}

export function focusAndFillField(selector: string, text: string): boolean {
  const el = document.querySelector<HTMLElement>(selector);
  if (!el) return false;

  el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  el.focus();

  const tag = el.tagName.toLowerCase();

  if (tag === 'input' || tag === 'textarea') {
    // Use native setter to trigger React/Vue reactivity
    const proto = tag === 'input' ? HTMLInputElement.prototype : HTMLTextAreaElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
    if (setter) {
      setter.call(el, text);
    } else {
      (el as HTMLInputElement).value = text;
    }
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  }

  if (el.isContentEditable) {
    el.focus();
    // Select all existing content and replace
    const selection = window.getSelection();
    const range = document.createRange();
    range.selectNodeContents(el);
    selection?.removeAllRanges();
    selection?.addRange(range);
    document.execCommand('insertText', false, text);
    return true;
  }

  return false;
}

export function focusField(selector: string): boolean {
  const el = document.querySelector<HTMLElement>(selector);
  if (!el) return false;

  el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  el.focus();

  // 短暂高亮提示
  const prev = el.style.outline;
  el.style.outline = '2px solid #f59e0b';
  setTimeout(() => { el.style.outline = prev; }, 1500);

  return true;
}
