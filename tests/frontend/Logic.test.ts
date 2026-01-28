import { describe, it, expect } from 'vitest';
import { calculateRelationshipLabel } from '../../components/FamilyGraph';
import { FamilyMember } from '../../types';

describe('Family Logic Optimization', () => {
  const root: FamilyMember = { id: 'root', name: 'Root', birthDate: '1900-01-01', gender: 'male', isMarried: true, parentId: null, isDeleted: false, address: '' };
  const son1: FamilyMember = { id: 's1', name: 'Son1', birthDate: '1930-01-01', gender: 'male', isMarried: true, parentId: 'root', isDeleted: false, address: '' };
  const son2: FamilyMember = { id: 's2', name: 'Son2', birthDate: '1932-01-01', gender: 'male', isMarried: true, parentId: 'root', isDeleted: false, address: '' };
  const gson1: FamilyMember = { id: 'gs1', name: 'GrandSon1', birthDate: '1960-01-01', gender: 'male', isMarried: false, parentId: 's1', isDeleted: false, address: '' };
  const ggson1: FamilyMember = { id: 'ggs1', name: 'GreatGrandSon1', birthDate: '1990-01-01', gender: 'male', isMarried: false, parentId: 'gs1', isDeleted: false, address: '' };

  const members = [root, son1, son2, gson1, ggson1];

  it('calculates Father relationship correctly', () => {
    // Target is Root, Center is Son1 -> Root is Father of Son1
    expect(calculateRelationshipLabel(root, son1, members)).toBe('父亲');
  });

  it('calculates Son relationship correctly', () => {
    // Target is Son1, Center is Root -> Son1 is Son of Root
    // Since Son1 is the first born male (1930 vs 1932), he is "长子"
    expect(calculateRelationshipLabel(son1, root, members)).toBe('长子');
  });

  it('calculates Brother relationship correctly', () => {
    // Target is Son1, Center is Son2 -> Son1 is "大哥" (Elder Brother) of Son2
    // Sibling Rank: Son1 (1930) is 1, Son2 (1932) is 2.
    // Logic: if target is older, it's elder brother.
    // Rank 1 -> "大" (or "长" logic in code)
    // Code says: toChineseNum(rank) + "兄"/"弟"
    // Rank 1 -> "大"
    expect(calculateRelationshipLabel(son1, son2, members)).toBe('大兄'); 
  });

  it('calculates Grandfather correctly', () => {
    expect(calculateRelationshipLabel(root, gson1, members)).toBe('祖父');
  });

  it('calculates Grandson correctly', () => {
    // gs1 is only child of s1, so rank 1 -> "长孙"?
    // Logic: if down === 2, returns "孙子" (simplified logic in code currently)
    expect(calculateRelationshipLabel(gson1, root, members)).toBe('孙子');
  });
  
  it('calculates Great-Grandfather correctly', () => {
    // ggson1 -> gson1 -> s1 -> root (depth 3)
    // up=3, down=0
    expect(calculateRelationshipLabel(root, ggson1, members)).toBe('曾祖');
  });
});
