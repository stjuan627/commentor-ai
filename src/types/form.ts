export interface FormField {
  id: string;              // 扫描会话内唯一标识
  tagName: string;         // INPUT / TEXTAREA / DIV 等
  inputType?: string;      // input type 属性: text, email, search...
  label: string;           // 人类可读标签（合并多来源）
  placeholder?: string;
  role?: string;           // ARIA role
  isContentEditable: boolean;
  selector: string;        // CSS selector，用于跨消息重新定位元素
  frameId?: number;        // 所属 frame ID，用于定位 iframe 内的字段
  a11yName?: string;       // CDP 无障碍树补充的名称
  a11yRole?: string;       // CDP 无障碍树补充的角色
}
