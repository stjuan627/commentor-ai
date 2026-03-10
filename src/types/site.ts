import type { KeywordItem } from './keyword';

export interface SiteItem {
  id: string;
  name: string;
  keywords: KeywordItem[];
}
