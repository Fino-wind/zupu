import { FamilyMember, Locale } from '../types';

export const toChineseNum = (num: number) => {
  const chars = ['零', '一', '二', '三', '四', '五', '六', '七', '八', '九'];
  if (num === 1) return '大';
  if (num <= 9) return chars[num];
  return num.toString();
};

const getDateValue = (date: string) => {
  const time = Date.parse(date);
  return Number.isNaN(time) ? null : time;
};

export const getSiblingRank = (person: FamilyMember, allMembers: FamilyMember[]) => {
  if (!person.parentId) return 1;
  const siblings = allMembers.filter(
    (member) => member.parentId === person.parentId && member.gender === person.gender
  );
  siblings.sort((a, b) => {
    const aTime = getDateValue(a.birthDate) ?? Number.MAX_SAFE_INTEGER;
    const bTime = getDateValue(b.birthDate) ?? Number.MAX_SAFE_INTEGER;
    return aTime - bTime;
  });
  return siblings.findIndex((member) => member.id === person.id) + 1;
};

export const calculateRelationshipLabel = (
  target: FamilyMember,
  center: FamilyMember,
  allMembers: FamilyMember[],
  locale: Locale = 'zh'
): string | null => {
  if (target.id === center.id) return locale === 'en' ? 'Self' : '本尊';

  const memberMap = new Map(allMembers.map((member) => [member.id, member]));

  const getSpouse = (member: FamilyMember) => {
    if (!member.spouseId) return null;
    return memberMap.get(member.spouseId) || null;
  };

  const isSpouse = (a: FamilyMember, b: FamilyMember) => a.spouseId === b.id || b.spouseId === a.id;

  const getEnglishOrdinal = (num: number) => {
    const mod10 = num % 10;
    const mod100 = num % 100;
    if (mod10 === 1 && mod100 !== 11) return `${num}st`;
    if (mod10 === 2 && mod100 !== 12) return `${num}nd`;
    if (mod10 === 3 && mod100 !== 13) return `${num}rd`;
    return `${num}th`;
  };

  const getSpouseLabel = (person: FamilyMember) => {
    if (locale === 'en') {
      if (person.gender === 'male') return 'Husband';
      if (person.gender === 'female') return 'Wife';
      return 'Spouse';
    }
    if (person.gender === 'male') return '丈夫';
    if (person.gender === 'female') return '妻子';
    return '配偶';
  };

  const getParentInLawLabel = (centerMember: FamilyMember, targetMember: FamilyMember) => {
    if (locale === 'en') {
      if (targetMember.gender === 'male') return 'Father-in-law';
      if (targetMember.gender === 'female') return 'Mother-in-law';
      return 'Parent-in-law';
    }
    if (centerMember.gender === 'female') {
      return targetMember.gender === 'male' ? '公公' : '婆婆';
    }
    if (centerMember.gender === 'male') {
      return targetMember.gender === 'male' ? '岳父' : '岳母';
    }
    return '姻亲长辈';
  };

  const getStepChildLabel = (targetMember: FamilyMember) => {
    if (locale === 'en') {
      if (targetMember.gender === 'male') return 'Step-son';
      if (targetMember.gender === 'female') return 'Step-daughter';
      return 'Step-child';
    }
    return targetMember.gender === 'female' ? '继女' : '继子';
  };

  const getSiblingInLawLabel = (targetMember: FamilyMember) => {
    if (locale === 'en') {
      if (targetMember.gender === 'male') return 'Brother-in-law';
      if (targetMember.gender === 'female') return 'Sister-in-law';
      return 'In-law';
    }
    return targetMember.gender === 'female' ? '姻亲姐妹' : '姻亲兄弟';
  };

  if (isSpouse(target, center)) {
    return getSpouseLabel(target);
  }

  const centerSpouse = getSpouse(center);
  if (centerSpouse) {
    if (target.id === centerSpouse.parentId) {
      return getParentInLawLabel(center, target);
    }
    if (target.parentId === centerSpouse.id) {
      return getStepChildLabel(target);
    }
    if (centerSpouse.parentId && target.parentId === centerSpouse.parentId) {
      return getSiblingInLawLabel(target);
    }
  }

  const getAncestryPath = (member: FamilyMember): string[] => {
    const path = [member.id];
    let current = member;
    while (current.parentId && memberMap.has(current.parentId)) {
      const next = memberMap.get(current.parentId);
      if (!next) break;
      current = next;
      path.push(current.id);
    }
    return path;
  };

  const centerPath = getAncestryPath(center);
  const targetPath = getAncestryPath(target);

  let lcaId: string | null = null;
  for (const id of centerPath) {
    if (targetPath.includes(id)) {
      lcaId = id;
      break;
    }
  }

  if (!lcaId) return null;

  const up = centerPath.indexOf(lcaId);
  const down = targetPath.indexOf(lcaId);

  const getChineseAncestorLabel = (level: number, gender: FamilyMember['gender']) => {
    if (level === 1) return gender === 'female' ? '母亲' : '父亲';
    if (level === 2) return gender === 'female' ? '祖母' : '祖父';
    if (level === 3) return gender === 'female' ? '曾祖母' : '曾祖父';
    if (level === 4) return gender === 'female' ? '高祖母' : '高祖父';
    return `${level}世祖`;
  };

  const getChineseDescendantLabel = (level: number, gender: FamilyMember['gender']) => {
    if (level === 1) {
      const rank = getSiblingRank(target, allMembers);
      const rankStr = rank === 1 ? '长' : toChineseNum(rank);
      return gender === 'female' ? `${rankStr}女` : `${rankStr}子`;
    }
    if (level === 2) return gender === 'female' ? '孙女' : '孙子';
    return `${level}世孙`;
  };

  const getEnglishAncestorLabel = (level: number, gender: FamilyMember['gender']) => {
    const base = gender === 'male' ? 'Father' : gender === 'female' ? 'Mother' : 'Parent';
    const grand =
      gender === 'male' ? 'Grandfather' : gender === 'female' ? 'Grandmother' : 'Grandparent';
    if (level === 1) return base;
    if (level === 2) return grand;
    const prefix = 'Great-'.repeat(level - 2);
    if (gender === 'male') return `${prefix}Grandfather`;
    if (gender === 'female') return `${prefix}Grandmother`;
    return `${prefix}Grandparent`;
  };

  const getEnglishDescendantLabel = (level: number, gender: FamilyMember['gender']) => {
    const base = gender === 'male' ? 'Son' : gender === 'female' ? 'Daughter' : 'Child';
    const grand =
      gender === 'male' ? 'Grandson' : gender === 'female' ? 'Granddaughter' : 'Grandchild';
    if (level === 1) return base;
    if (level === 2) return grand;
    const prefix = 'Great-'.repeat(level - 2);
    if (gender === 'male') return `${prefix}Grandson`;
    if (gender === 'female') return `${prefix}Granddaughter`;
    return `${prefix}Grandchild`;
  };

  const getEnglishCousinLabel = (levelUp: number, levelDown: number) => {
    const degree = Math.min(levelUp, levelDown) - 1;
    const removed = Math.abs(levelUp - levelDown);
    if (degree <= 0) return 'Cousin';
    let label = `${getEnglishOrdinal(degree)} cousin`;
    if (removed === 1) label += ' once removed';
    if (removed === 2) label += ' twice removed';
    if (removed > 2) label += ` ${removed} times removed`;
    return label;
  };

  if (down === 0) {
    return locale === 'en'
      ? getEnglishAncestorLabel(up, target.gender)
      : getChineseAncestorLabel(up, target.gender);
  }

  if (up === 0) {
    return locale === 'en'
      ? getEnglishDescendantLabel(down, target.gender)
      : getChineseDescendantLabel(down, target.gender);
  }

  if (up === 1 && down === 1) {
    if (locale === 'en') {
      if (target.gender === 'male') return 'Brother';
      if (target.gender === 'female') return 'Sister';
      return 'Sibling';
    }
    const rank = getSiblingRank(target, allMembers);
    const rankStr = toChineseNum(rank);
    const targetTime = getDateValue(target.birthDate);
    const centerTime = getDateValue(center.birthDate);
    const isOlder = targetTime !== null && centerTime !== null ? targetTime < centerTime : false;
    if (target.gender === 'male') return isOlder ? `${rankStr}兄` : `${rankStr}弟`;
    return isOlder ? `${rankStr}姐` : `${rankStr}妹`;
  }

  if (up === 2 && down === 1) {
    if (locale === 'en') {
      if (target.gender === 'male') return 'Uncle';
      if (target.gender === 'female') return 'Aunt';
      return 'Aunt/Uncle';
    }
    const rank = getSiblingRank(target, allMembers);
    const rankStr = toChineseNum(rank);
    const fatherId = center.parentId;
    const father = fatherId ? memberMap.get(fatherId) : null;
    if (target.gender === 'male') {
      if (father) {
        const targetTime = getDateValue(target.birthDate);
        const fatherTime = getDateValue(father.birthDate);
        if (targetTime !== null && fatherTime !== null && targetTime < fatherTime) {
          return `${rankStr}伯`;
        }
      }
      return `${rankStr}叔`;
    }
    return `${rankStr}姑`;
  }

  if (up === 1 && down === 2) {
    if (locale === 'en') {
      if (target.gender === 'male') return 'Nephew';
      if (target.gender === 'female') return 'Niece';
      return 'Niece/Nephew';
    }
    return target.gender === 'male' ? '侄子' : '侄女';
  }

  if (up === 2 && down === 2) {
    if (locale === 'en') return 'First cousin';
    const targetTime = getDateValue(target.birthDate);
    const centerTime = getDateValue(center.birthDate);
    const isOlder = targetTime !== null && centerTime !== null ? targetTime < centerTime : false;
    const suffix = target.gender === 'male' ? (isOlder ? '兄' : '弟') : isOlder ? '姐' : '妹';
    return `堂${suffix}`;
  }

  if (locale === 'en') {
    return getEnglishCousinLabel(up, down);
  }

  return '族亲';
};

export const calculateAge = (birthDate: string): number | string => {
  if (!birthDate) return '';
  const birth = new Date(birthDate);
  const now = new Date();
  let age = now.getFullYear() - birth.getFullYear();
  const monthDelta = now.getMonth() - birth.getMonth();
  if (monthDelta < 0 || (monthDelta === 0 && now.getDate() < birth.getDate())) age--;
  return age;
};
