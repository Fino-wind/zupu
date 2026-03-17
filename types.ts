import * as d3 from 'd3';

export interface FamilyMember {
  id: string;
  name: string;
  birthDate: string; // YYYY-MM-DD
  isMarried: boolean;
  address: string;
  gender: 'male' | 'female' | 'other';
  parentId: string | null; // 主系父辈 ID
  spouseId?: string | null; // 配偶成员 ID
  spouseName?: string; // 旧版兼容字段：配偶姓名（迁移后不再持久化）
  biography?: string; // AI 生成或手动录入的志传
  isDeleted?: boolean; // 软删除标记：斩断血脉后保留存档
  isHighlight?: boolean; // 是否为显赫/核心人物（高亮显示）
}

export type Locale = 'zh' | 'en';

export interface TreeLink {
  source: FamilyMember;
  target: FamilyMember;
}

export type HierarchyNode = d3.HierarchyNode<FamilyMember>;

export interface SearchFilters {
  name: string;
  generation?: number;
  birthDateStart?: string;
  birthDateEnd?: string;
}
