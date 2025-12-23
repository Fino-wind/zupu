import { useState, useEffect, useCallback, useMemo } from 'react';
import { FamilyMember } from '../types';
import { api } from '../services/api';

const DEFAULT_MEMBERS: FamilyMember[] = [
  { id: '1', name: '袁鸿儒', birthDate: '1940-01-01', isMarried: true, address: '北京祖籍地', gender: 'male', parentId: null, biography: '袁氏先祖，博学弘志，开创家族之基。', spouseName: '李婉清', isDeleted: false, isHighlight: true },
  { id: '2', name: '袁希贤', birthDate: '1965-05-20', isMarried: true, address: '上海寓所', gender: 'male', parentId: '1', spouseName: '陈淑慧', isDeleted: false },
  { id: '3', name: '袁静茹', birthDate: '1968-08-12', isMarried: false, address: '杭州西湖', gender: 'female', parentId: '1', isDeleted: false },
  { id: '4', name: '袁思齐', birthDate: '1990-10-10', isMarried: false, address: '广东鹏城', gender: 'male', parentId: '2', isDeleted: false, isHighlight: true, biography: '家族核心人物，承前启后，功绩卓著。' },
  { id: '5', name: '袁嘉懿', birthDate: '1995-02-14', isMarried: false, address: '海外海外', gender: 'female', parentId: '2', isDeleted: false },
];

export const getDescendants = (parentId: string, all: FamilyMember[]): string[] => {
  const children = all.filter(m => m.parentId === parentId && !m.isDeleted);
  let ids = children.map(c => c.id);
  children.forEach(c => {
    ids = [...ids, ...getDescendants(c.id, all)];
  });
  return ids;
};

export const useGenealogy = () => {
  const [members, setMembers] = useState<FamilyMember[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const activeMembers = useMemo(() => members.filter(m => !m.isDeleted), [members]);
  const deletedMembers = useMemo(() => members.filter(m => m.isDeleted), [members]);

  const loadMembers = useCallback(async () => {
    setIsLoading(true);
    try {
      // Try fetching from API
      const data = await api.fetchMembers();
      if (Array.isArray(data) && data.length > 0) {
        setMembers(data);
        localStorage.setItem('familyMembers_backup', JSON.stringify(data));
      } else {
        // Fallback to default if API returns empty array (new DB)
        console.log("Database empty, loading defaults...");
        setMembers(DEFAULT_MEMBERS);
      }
    } catch (e) {
      // Fallback to LocalStorage if API fails
      const local = localStorage.getItem('familyMembers_backup');
      if (local) {
        setMembers(JSON.parse(local));
      } else {
        setMembers(DEFAULT_MEMBERS);
      }
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadMembers();
  }, [loadMembers]);

  // Optimistic Create / Update
  const saveMember = useCallback(async (member: FamilyMember) => {
    // 1. Update UI immediately
    setMembers(prev => {
      const index = prev.findIndex(m => m.id === member.id);
      if (index >= 0) {
        const newMembers = [...prev];
        newMembers[index] = member;
        return newMembers;
      }
      return [...prev, member];
    });

    // 2. Persist to API (Background)
    try {
      await api.saveMember(member);
      // Update backup
      const current = localStorage.getItem('familyMembers_backup');
      if (current) {
        const list = JSON.parse(current) as FamilyMember[];
        const idx = list.findIndex(m => m.id === member.id);
        if (idx >= 0) list[idx] = member;
        else list.push(member);
        localStorage.setItem('familyMembers_backup', JSON.stringify(list));
      }
    } catch (e) {
      console.error("Save failed (persisted to local state only):", e);
    }
  }, []);

  // Soft Delete
  const deleteMemberNodes = useCallback(async (targetId: string) => {
    const descendantIds = getDescendants(targetId, members);
    const idsToRemove = new Set([targetId, ...descendantIds]);
    
    // Optimistic Update
    const updatedMembers = members.map(m => 
      idsToRemove.has(m.id) ? { ...m, isDeleted: true } : m
    ) as FamilyMember[];

    setMembers(updatedMembers);
    localStorage.setItem('familyMembers_backup', JSON.stringify(updatedMembers));

    // API Sync
    const updates = updatedMembers.filter(m => idsToRemove.has(m.id));
    await Promise.all(updates.map(m => api.saveMember(m)));
  }, [members]);

  // Restore
  const restoreMemberNode = useCallback(async (id: string) => {
    const member = members.find(m => m.id === id);
    if (member) {
      const restored = { ...member, isDeleted: false };
      await saveMember(restored);
    }
  }, [members, saveMember]);

  return {
    members,
    activeMembers,
    deletedMembers,
    isLoading,
    saveMember,
    deleteMemberNodes,
    restoreMemberNode,
    refresh: loadMembers
  };
};