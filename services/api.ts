import { FamilyMember } from '../types';

export const api = {
  fetchMembers: async (): Promise<FamilyMember[]> => {
    try {
      const res = await fetch('/api/members');
      if (!res.ok) throw new Error('Failed to fetch members');
      return await res.json();
    } catch (error) {
      console.warn("API Fetch Error (using offline mode):", error);
      throw error;
    }
  },

  saveMember: async (member: FamilyMember): Promise<void> => {
    const res = await fetch('/api/members', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(member),
    });
    if (!res.ok) throw new Error('Failed to save member');
  },

  deleteMember: async (id: string): Promise<void> => {
    const res = await fetch(`/api/members/${id}`, { method: 'DELETE' });
    if (!res.ok) throw new Error('Failed to delete member');
  }
};