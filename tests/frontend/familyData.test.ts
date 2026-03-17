import { describe, expect, it } from 'vitest';
import {
  exportMembersAsJson,
  migrateLegacySpouseData,
  sanitizeImportedMembers,
} from '../../utils/familyData';

describe('familyData utilities', () => {
  it('sanitizes imported members and preserves optional fields', () => {
    const members = sanitizeImportedMembers([
      {
        id: 'root',
        name: '始祖',
        gender: 'male',
        birthDate: '1900-01-01',
        parentId: null,
        address: '祖籍地',
        isMarried: false,
        isDeleted: false,
        isHighlight: true,
      },
    ]);

    expect(members[0].name).toBe('始祖');
    expect(members[0].isHighlight).toBe(true);
  });

  it('rejects invalid imported members', () => {
    expect(() =>
      sanitizeImportedMembers([
        {
          id: '',
          name: '无效成员',
        },
      ])
    ).toThrow();
  });

  it('migrates legacy spouseName into spouse member nodes', () => {
    const result = migrateLegacySpouseData([
      {
        id: 'ancestor',
        name: '始祖',
        birthDate: '1900-01-01',
        isMarried: false,
        address: '祖籍地',
        gender: 'male',
        parentId: null,
        isDeleted: false,
        spouseName: '始祖配偶',
      },
    ]);

    expect(result.members).toHaveLength(2);
    expect(result.members.some((member) => member.name === '始祖配偶')).toBe(true);
  });

  it('exports valid JSON text', () => {
    const serialized = exportMembersAsJson([
      {
        id: 'root',
        name: '始祖',
        birthDate: '1900-01-01',
        isMarried: false,
        address: '祖籍地',
        gender: 'male',
        parentId: null,
        isDeleted: false,
      },
    ]);

    expect(JSON.parse(serialized)[0].id).toBe('root');
  });
});
