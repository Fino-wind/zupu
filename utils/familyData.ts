import { FamilyMember } from '../types';

const validGenders = new Set<FamilyMember['gender']>(['male', 'female', 'other']);

const asText = (value: unknown, fallback = ''): string =>
  typeof value === 'string' ? value : fallback;

const asNullableText = (value: unknown): string | null => {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  return typeof value === 'string' ? value : null;
};

const asBoolean = (value: unknown, fallback = false): boolean =>
  typeof value === 'boolean' ? value : fallback;

export const generateId = () => `M-${Date.now()}-${Math.floor(Math.random() * 10000)}`;

export const buildSpouseId = (baseId: string, existingIds: Set<string>) => {
  const candidate = `spouse-${baseId}`;
  if (!existingIds.has(candidate)) {
    return candidate;
  }

  let index = 1;
  while (existingIds.has(`${candidate}-${index}`)) {
    index += 1;
  }

  return `${candidate}-${index}`;
};

export const getDescendants = (parentId: string, allMembers: FamilyMember[]): string[] => {
  const descendants: string[] = [];
  const queue = [parentId];

  while (queue.length > 0) {
    const currentId = queue.shift();
    if (!currentId) {
      continue;
    }

    allMembers.forEach((member) => {
      if (member.parentId === currentId && !member.isDeleted) {
        descendants.push(member.id);
        queue.push(member.id);
      }
    });
  }

  return descendants;
};

const ensureFamilyMember = (raw: unknown, index: number): FamilyMember => {
  if (!raw || typeof raw !== 'object') {
    throw new Error(`第 ${index + 1} 条记录不是有效对象`);
  }

  const candidate = raw as Record<string, unknown>;
  const id = asText(candidate.id).trim();
  const name = asText(candidate.name).trim();
  const gender = validGenders.has(candidate.gender as FamilyMember['gender'])
    ? (candidate.gender as FamilyMember['gender'])
    : 'other';

  if (!id) {
    throw new Error(`第 ${index + 1} 条记录缺少成员 ID`);
  }

  if (!name) {
    throw new Error(`第 ${index + 1} 条记录缺少成员姓名`);
  }

  return {
    id,
    name,
    birthDate: asText(candidate.birthDate),
    isMarried: asBoolean(candidate.isMarried),
    address: asText(candidate.address),
    gender,
    parentId: asNullableText(candidate.parentId),
    spouseId: asNullableText(candidate.spouseId),
    spouseName: asText(candidate.spouseName),
    biography: asText(candidate.biography),
    isDeleted: asBoolean(candidate.isDeleted),
    isHighlight: asBoolean(candidate.isHighlight),
  };
};

export const sanitizeImportedMembers = (raw: unknown): FamilyMember[] => {
  if (!Array.isArray(raw)) {
    throw new Error('导入文件必须是成员数组');
  }

  const seenIds = new Set<string>();
  return raw.map((item, index) => {
    const member = ensureFamilyMember(item, index);
    if (seenIds.has(member.id)) {
      throw new Error(`成员 ID 重复：${member.id}`);
    }

    seenIds.add(member.id);
    return member;
  });
};

export const exportMembersAsJson = (members: FamilyMember[]) => JSON.stringify(members, null, 2);

export const migrateLegacySpouseData = (input: FamilyMember[]) => {
  const existingIds = new Set(input.map((member) => member.id));
  const updates: FamilyMember[] = [];
  const additions: FamilyMember[] = [];

  input.forEach((member) => {
    if (member.spouseName && !member.spouseId) {
      const spouseId = buildSpouseId(member.id, existingIds);
      existingIds.add(spouseId);
      const spouseGender =
        member.gender === 'male' ? 'female' : member.gender === 'female' ? 'male' : 'other';

      const spouseMember: FamilyMember = {
        id: spouseId,
        name: member.spouseName,
        birthDate: '',
        isMarried: true,
        address: member.address || '',
        gender: spouseGender,
        parentId: null,
        isDeleted: false,
        spouseId: member.id,
      };

      const updatedMember: FamilyMember = {
        ...member,
        spouseId,
        isMarried: true,
      };

      delete updatedMember.spouseName;
      additions.push(spouseMember);
      updates.push(updatedMember);
    } else if (member.spouseName && member.spouseId) {
      const updatedMember: FamilyMember = { ...member };
      delete updatedMember.spouseName;
      updates.push(updatedMember);
    }
  });

  if (updates.length === 0 && additions.length === 0) {
    return { members: input, updates: [] as FamilyMember[] };
  }

  const memberMap = new Map(input.map((member) => [member.id, member]));
  updates.forEach((member) => memberMap.set(member.id, member));
  additions.forEach((member) => memberMap.set(member.id, member));

  return { members: Array.from(memberMap.values()), updates: [...updates, ...additions] };
};
