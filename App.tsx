import React, { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { FamilyMember, Locale } from './types';
import FamilyGraph from './components/FamilyGraph';
import MarkdownRenderer from './components/MarkdownRenderer';
import FamilyOverviewPanel from './components/FamilyOverviewPanel';
import {
  Trash2,
  Edit2,
  Save,
  Upload,
  Sparkles,
  Lock,
  Unlock,
  ShieldCheck,
  Send,
  X,
  Layout,
  Key,
  Loader2,
  AlertTriangle,
  ArchiveRestore,
  Settings,
  MapPin,
  BookOpen,
  Crown,
  Fingerprint,
  Bell,
  Scroll,
} from 'lucide-react';
import {
  analyzeRelationship,
  generateBiography,
  askAiAboutMember,
  AISettings,
} from './services/geminiService';
import { usePersistentState } from './hooks/usePersistentState';
import {
  exportMembersAsJson,
  generateId,
  getDescendants,
  migrateLegacySpouseData,
  sanitizeImportedMembers,
} from './utils/familyData';
import { readStorageValue, writeStorageValue } from './utils/storage';

const DEFAULT_AI_CONFIG: AISettings = {
  modelName: 'gemini-3-flash-preview',
  baseUrl: '',
  apiKey: '',
};

const persistRawString = (value: string) => value;
const parseLocaleValue = (raw: string): Locale => (raw === 'en' ? 'en' : 'zh');
const parseFamilySurname = (raw: string) => raw || '袁';
const parseAdminPassphrase = (raw: string) => raw || 'miling';

const fetchWithTimeout = async (input: RequestInfo | URL, init: RequestInit, timeout: number) => {
  const controller = new AbortController();
  const id = window.setTimeout(() => controller.abort(), timeout);

  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } finally {
    window.clearTimeout(id);
  }
};

const App: React.FC = () => {
  const [members, setMembers] = useState<FamilyMember[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedMemberId, setSelectedMemberId] = useState<string | null>(null);
  const [isDetailsOpen, setIsDetailsOpen] = useState(false);
  const [locale, setLocale] = usePersistentState<Locale>('familyLocale', 'zh', {
    serialize: persistRawString,
    deserialize: parseLocaleValue,
  });

  const [compareMemberId, setCompareMemberId] = useState<string | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [aiAnalysis, setAiAnalysis] = useState<string>('');
  const [analysisStyle, setAnalysisStyle] = useState<'traditional' | 'modern'>('traditional');
  const [loadingAi, setLoadingAi] = useState(false);
  const [loadingDeduction, setLoadingDeduction] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isRecycleBinOpen, setIsRecycleBinOpen] = useState(false);
  const [formData, setFormData] = useState<Partial<FamilyMember>>({});
  const [memberSearchQuery, setMemberSearchQuery] = useState('');
  const aiCacheRef = useRef(new Map<string, string>());

  // Creation States
  const [isCreatingRoot, setIsCreatingRoot] = useState(false);
  const [setupSurname, setSetupSurname] = useState('袁');
  const [setupPassphrase, setSetupPassphrase] = useState('miling');

  // Global Config
  const [familySurname, setFamilySurname] = usePersistentState('familySurname', '袁', {
    serialize: persistRawString,
    deserialize: parseFamilySurname,
  });
  const [adminPassphrase, setAdminPassphrase] = usePersistentState('adminPassphrase', 'miling', {
    serialize: persistRawString,
    deserialize: parseAdminPassphrase,
  });
  const [aiConfig, setAiConfig] = usePersistentState<AISettings>(
    'familyAiConfig',
    DEFAULT_AI_CONFIG
  );

  // Auth
  const [isAdmin, setIsAdmin] = useState(false);
  const [showLogin, setShowLogin] = useState(false);
  const [passphraseInput, setPassphraseInput] = useState('');

  const [inquiry, setInquiry] = useState('');
  const [inquiryStyle, setInquiryStyle] = useState<'classical' | 'vernacular'>('classical');
  const [aiResponse, setAiResponse] = useState('');

  const [notification, setNotification] = useState<{
    message: string;
    type: 'info' | 'error';
  } | null>(null);
  const [deleteModal, setDeleteModal] = useState<{
    isOpen: boolean;
    memberId: string | null;
    memberName: string;
  }>({
    isOpen: false,
    memberId: null,
    memberName: '',
  });

  const selectedMember = useMemo(
    () => (Array.isArray(members) ? members.find((m) => m.id === selectedMemberId) : null),
    [members, selectedMemberId]
  );
  const selectedSpouse = useMemo(() => {
    if (!selectedMember?.spouseId) return null;
    return members.find((m) => m.id === selectedMember.spouseId) || null;
  }, [members, selectedMember]);
  const activeMembers = useMemo(
    () => (Array.isArray(members) ? members.filter((m) => !m.isDeleted) : []),
    [members]
  );
  const deletedMembers = useMemo(
    () => (Array.isArray(members) ? members.filter((m) => m.isDeleted) : []),
    [members]
  );
  const highlightCount = useMemo(
    () => activeMembers.filter((member) => member.isHighlight).length,
    [activeMembers]
  );
  const rootCount = useMemo(
    () => activeMembers.filter((member) => !member.parentId).length,
    [activeMembers]
  );
  const overviewMembers = useMemo(() => {
    const query = memberSearchQuery.trim().toLowerCase();
    if (!query) {
      return [];
    }

    return activeMembers
      .filter((member) => {
        const haystack = [member.name, member.address, member.biography]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();
        return haystack.includes(query);
      })
      .slice(0, 6);
  }, [activeMembers, memberSearchQuery]);

  useEffect(() => {
    document.documentElement.lang = locale === 'en' ? 'en' : 'zh-CN';
    document.title =
      locale === 'en' ? 'Chrono Genealogy | Ancient Genealogy' : '华夏族谱录 | Ancient Genealogy';
  }, [locale]);

  const t = useCallback((zh: string, en: string) => (locale === 'en' ? en : zh), [locale]);

  const showToast = useCallback((message: string, type: 'info' | 'error' = 'info') => {
    setNotification({ message, type });
  }, []);

  // OFFLINE SUPPORT: Persist members to localStorage
  useEffect(() => {
    if (members.length > 0) {
      writeStorageValue('familyMembers_backup', members);
    }
  }, [members]);

  // Save member helper...
  const saveMemberToDb = useCallback(
    async (member: FamilyMember) => {
      try {
        const payload = { ...member };
        delete payload.spouseName;
        const res = await fetchWithTimeout(
          '/api/members',
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          },
          3000
        );

        if (!res.ok) {
          throw new Error('Save failed');
        }

        return true;
      } catch (error) {
        console.warn('Save failed, using offline fallback', error);
        showToast(t('网络不可用，已保存至本地', 'Network unavailable. Saved locally.'), 'info');
        return false;
      }
    },
    [showToast, t]
  );

  // --- API ---
  const fetchMembers = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await fetchWithTimeout('/api/members', { method: 'GET' }, 2000);
      if (!res.ok) {
        throw new Error('Server error');
      }

      const payload = sanitizeImportedMembers(await res.json());
      const { members: migratedMembers, updates } = migrateLegacySpouseData(payload);
      setMembers(migratedMembers);
      writeStorageValue('familyMembers_backup', migratedMembers);

      if (updates.length > 0) {
        await Promise.allSettled(updates.map((member) => saveMemberToDb(member)));
      }

      const firstMember = migratedMembers.find((member) => !member.parentId);
      if (firstMember?.name && familySurname === '袁') {
        setFamilySurname(firstMember.name[0]);
      }
    } catch (error) {
      console.warn('API unavailable, loading local backup', error);
      const offlineMembers = readStorageValue<FamilyMember[]>('familyMembers_backup', []);
      const { members: migratedMembers } = migrateLegacySpouseData(offlineMembers);

      if (migratedMembers.length > 0) {
        setMembers(migratedMembers);
        showToast(
          t('连接异常，已切换至离线备份', 'Connection failed. Switched to offline backup.'),
          'info'
        );
      } else {
        showToast(t('当前未找到可用族谱数据', 'No available genealogy data was found.'), 'error');
      }
    } finally {
      setIsLoading(false);
    }
  }, [familySurname, saveMemberToDb, setFamilySurname, showToast, t]);

  useEffect(() => {
    fetchMembers();
  }, [fetchMembers]);

  useEffect(() => {
    if (notification) {
      const timer = setTimeout(() => setNotification(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [notification]);

  const handleLogin = () => {
    if (passphraseInput === adminPassphrase) {
      setIsAdmin(true);
      setShowLogin(false);
      setPassphraseInput('');
    } else {
      showToast(t('印鉴不符', 'Passphrase incorrect'), 'error');
    }
  };

  const handleCreateRoot = async () => {
    if (isCreatingRoot) return;
    if (!setupSurname.trim()) {
      showToast(t('请填写家族姓氏', 'Please enter a family surname'), 'error');
      return;
    }

    setIsCreatingRoot(true);
    try {
      // 1. Config
      const surname = setupSurname.trim();
      setFamilySurname(surname);
      if (setupPassphrase.trim()) setAdminPassphrase(setupPassphrase.trim());

      const rootName = t(`${surname}氏始祖`, `${surname} Family Founder`);
      const rootBiography = t(
        `此乃${surname}氏开宗立派之始祖，功德无量，泽被后世。`,
        `${surname} is the founding ancestor of the family, respected and remembered by later generations.`
      );
      const rootAddress = t('祖籍地', 'Homeland');

      // 2. Member
      const newId = generateId();
      const root: FamilyMember = {
        id: newId,
        name: rootName,
        birthDate: '1000-01-01',
        isMarried: false,
        address: rootAddress,
        gender: 'male',
        parentId: null,
        isDeleted: false,
        biography: rootBiography,
        isHighlight: true,
      };

      // Attempt save (will fallback to offline if needed)
      await saveMemberToDb(root);

      setMembers((prev) => [...prev, root]);
      setIsAdmin(true);
      showToast(t('开宗立派成功', 'Family founding completed'), 'info');
    } catch (error) {
      console.error(error);
      showToast(t('开宗立派失败，请稍后再试', 'Unable to create the family root.'), 'error');
    } finally {
      setIsCreatingRoot(false);
    }
  };

  const handleAiInquiry = async () => {
    const normalizedInquiry = inquiry.trim();
    if (!selectedMember || !normalizedInquiry) return;

    const cacheKey = ['inquiry', locale, selectedMember.id, inquiryStyle, normalizedInquiry].join(
      '::'
    );
    const cachedResponse = aiCacheRef.current.get(cacheKey);
    if (cachedResponse) {
      setAiResponse(cachedResponse);
      setInquiry('');
      return;
    }

    setLoadingAi(true);
    try {
      const response = await askAiAboutMember(
        selectedMember,
        normalizedInquiry,
        inquiryStyle,
        aiConfig,
        locale
      );
      aiCacheRef.current.set(cacheKey, response);
      setAiResponse(response);
    } catch {
      showToast(
        t('灵犀不通，请检查 AI 配置。', 'AI request failed. Please check your settings.'),
        'error'
      );
      setAiResponse(
        t('灵犀不通，请检查 AI 配置。', 'AI request failed. Please check your settings.')
      );
    } finally {
      setLoadingAi(false);
      setInquiry('');
    }
  };

  const onSelect = (m: FamilyMember) => {
    if (selectedMemberId === m.id) {
      setIsDetailsOpen(true);
    } else {
      setSelectedMemberId(m.id);
      setIsDetailsOpen(false);
      setIsEditing(false);
      setAiAnalysis('');
      setAiResponse('');
      setCompareMemberId(null);
    }
    setMemberSearchQuery('');
  };

  const handleOverviewSelect = (member: FamilyMember) => {
    setSelectedMemberId(member.id);
    setIsDetailsOpen(true);
    setIsEditing(false);
    setAiAnalysis('');
    setAiResponse('');
    setCompareMemberId(null);
    setMemberSearchQuery('');
  };

  const onDeselect = () => {
    if (selectedMemberId === null) return;
    setSelectedMemberId(null);
    setIsDetailsOpen(false);
  };

  const executeDelete = async () => {
    if (!deleteModal.memberId) return;
    const targetId = deleteModal.memberId;
    const descendantIds = getDescendants(targetId, members);
    const idsToRemove = new Set([targetId, ...descendantIds]);

    const newMembers = members.map((m) =>
      idsToRemove.has(m.id) ? { ...m, isDeleted: true } : m
    ) as FamilyMember[];

    setMembers(newMembers);

    const updates = newMembers.filter((m) => idsToRemove.has(m.id));
    await Promise.allSettled(updates.map((member) => saveMemberToDb(member)));
    aiCacheRef.current.clear();

    if (selectedMemberId && idsToRemove.has(selectedMemberId)) {
      setSelectedMemberId(null);
      setIsDetailsOpen(false);
    }
    setDeleteModal({ isOpen: false, memberId: null, memberName: '' });
  };

  const handleRestore = async (id: string) => {
    const member = members.find((m) => m.id === id);
    if (member) {
      const restored = { ...member, isDeleted: false };
      await saveMemberToDb(restored);
      setMembers((prev) => prev.map((m) => (m.id === id ? restored : m)));
      aiCacheRef.current.clear();
    }
  };

  const handleAddChildNode = async (parentId: string) => {
    const newId = generateId();
    const parent = members.find((m) => m.id === parentId);
    const newMember: FamilyMember = {
      id: newId,
      name: t('新成员', 'New Member'),
      birthDate: '',
      isMarried: false,
      address: parent ? parent.address : '',
      gender: 'male',
      parentId: parentId,
      isDeleted: false,
    };
    await saveMemberToDb(newMember);
    setMembers((prev) => [...prev, newMember]);
    aiCacheRef.current.clear();
    setSelectedMemberId(newId);
    setFormData(newMember);
    setIsDetailsOpen(true);
    setIsEditing(true);
  };

  const handleAddParentNode = async (childId: string) => {
    const child = members.find((m) => m.id === childId);
    if (!child) return;
    const newId = generateId();
    const newAncestor: FamilyMember = {
      id: newId,
      name: t('先祖讳名', 'Ancestor'),
      birthDate: '',
      isMarried: false,
      address: child.address,
      gender: 'male',
      parentId: child.parentId,
      isDeleted: false,
    };
    const updatedChild = { ...child, parentId: newId };
    await saveMemberToDb(newAncestor);
    await saveMemberToDb(updatedChild);
    setMembers((prev) => [...prev.map((m) => (m.id === childId ? updatedChild : m)), newAncestor]);
    aiCacheRef.current.clear();
    setSelectedMemberId(newId);
    setFormData(newAncestor);
    setIsDetailsOpen(true);
    setIsEditing(true);
  };

  const handleDeleteNode = (id: string) => {
    const member = members.find((m) => m.id === id);
    if (member) setDeleteModal({ isOpen: true, memberId: id, memberName: member.name });
  };

  const renderDetailsModal = () => {
    if (!selectedMember || !isDetailsOpen) return null;

    const spouseCandidates = activeMembers.filter((m) => m.id !== selectedMember.id);
    const currentSpouseId = formData.spouseId ?? selectedMember.spouseId ?? '';
    const currentSpouseName = formData.spouseName || '';

    return (
      <div className='absolute inset-0 z-40 flex items-center justify-center p-4 md:p-8 animate-in zoom-in-95 duration-500 pointer-events-none'>
        <div
          className='absolute inset-0 bg-black/30 backdrop-blur-[2px] pointer-events-auto transition-opacity'
          onClick={() => setIsDetailsOpen(false)}
        ></div>
        <div className='w-full max-w-xl max-h-[85vh] flex flex-col pointer-events-auto relative shadow-[0_25px_50px_-12px_rgba(166,124,82,0.5)] group rounded-[3rem] overflow-hidden'>
          <div className='h-10 bg-gradient-to-b from-[#d4b483] to-[#f4ecd8] relative z-20 shadow-sm border-b border-[#c8aa7a]/30 flex items-center justify-center'>
            <div className='w-1/3 h-[2px] bg-[#a67c52]/20 rounded-full'></div>
          </div>
          <div className='bg-[#fdf6e3] flex-1 flex flex-col overflow-hidden relative z-10'>
            <div className="absolute inset-0 pointer-events-none opacity-40 bg-[url('https://www.transparenttextures.com/patterns/rice-paper-2.png')]"></div>
            <button
              onClick={() => setIsDetailsOpen(false)}
              className='absolute top-4 right-5 z-50 p-2 text-bronze/40 hover:text-vermilion transition hover:rotate-90 duration-300'
            >
              <X size={26} />
            </button>
            <div className='flex-1 overflow-y-auto overflow-x-hidden scrollbar-thin px-8 py-6 relative'>
              {isEditing ? (
                <div className='pb-8'>
                  <h3 className='text-xl font-bold text-vermilion flex items-center gap-2 mb-6 border-b border-vermilion/20 pb-2'>
                    <Edit2 size={18} /> {t('润色谱牒', 'Edit Record')}
                  </h3>
                  <div className='space-y-4'>
                    <div className='grid grid-cols-2 gap-4'>
                      <div>
                        <label className='text-xs text-bronze/60 block mb-1'>
                          {t('姓名', 'Name')}
                        </label>
                        <input
                          className='w-full bg-[#f8f1e0] border-b border-bronze/40 p-2 outline-none font-bold text-lg text-ink'
                          value={formData.name || ''}
                          onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                        />
                      </div>
                      <div>
                        <label className='text-xs text-bronze/60 block mb-1'>
                          {t('礼位', 'Gender')}
                        </label>
                        <select
                          className='w-full bg-[#f8f1e0] border-b border-bronze/40 p-2 outline-none text-ink'
                          value={formData.gender}
                          onChange={(e) =>
                            setFormData({
                              ...formData,
                              gender: e.target.value as FamilyMember['gender'],
                            })
                          }
                        >
                          <option value='male'>{t('乾 (男)', 'Male')}</option>
                          <option value='female'>{t('坤 (女)', 'Female')}</option>
                        </select>
                      </div>
                    </div>
                    <div className='space-y-2'>
                      <label className='text-xs text-bronze/60 block'>
                        {t('配偶关联', 'Spouse')}
                      </label>
                      <select
                        className='w-full bg-[#f8f1e0] border-b border-bronze/40 p-2 outline-none text-ink'
                        value={currentSpouseId}
                        onChange={(e) =>
                          setFormData({
                            ...formData,
                            spouseId: e.target.value || null,
                            spouseName: '',
                          })
                        }
                      >
                        <option value=''>{t('无', 'None')}</option>
                        {spouseCandidates.map((m) => (
                          <option key={m.id} value={m.id}>
                            {m.name}
                          </option>
                        ))}
                      </select>
                      <input
                        className='w-full bg-[#f8f1e0] border-b border-bronze/40 p-2 outline-none text-ink'
                        placeholder={t('或录入新配偶姓名', 'Or enter a new spouse name')}
                        value={currentSpouseName}
                        onChange={(e) =>
                          setFormData({
                            ...formData,
                            spouseName: e.target.value,
                            spouseId: e.target.value ? null : formData.spouseId,
                          })
                        }
                      />
                    </div>
                    <div className='grid grid-cols-2 gap-4'>
                      <div>
                        <label className='text-xs text-bronze/60 block mb-1'>
                          {t('诞辰', 'Birth Date')}
                        </label>
                        <input
                          type='date'
                          className='w-full bg-[#f8f1e0] border-b border-bronze/40 p-2 outline-none text-ink'
                          value={formData.birthDate || ''}
                          onChange={(e) => setFormData({ ...formData, birthDate: e.target.value })}
                        />
                      </div>
                      <div>
                        <label className='text-xs text-bronze/60 block mb-1'>
                          {t('籍贯', 'Location')}
                        </label>
                        <input
                          className='w-full bg-[#f8f1e0] border-b border-bronze/40 p-2 outline-none text-ink'
                          value={formData.address || ''}
                          onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                        />
                      </div>
                    </div>
                    <div>
                      <label className='flex items-center gap-2 text-ink font-bold py-2 cursor-pointer'>
                        <input
                          type='checkbox'
                          className='accent-vermilion w-4 h-4'
                          checked={formData.isHighlight || false}
                          onChange={(e) =>
                            setFormData({ ...formData, isHighlight: e.target.checked })
                          }
                        />
                        <span className='flex items-center gap-1'>
                          <Crown size={14} className='text-vermilion' />{' '}
                          {t('设为显赫宗亲 (立传)', 'Mark as distinguished')}
                        </span>
                      </label>
                    </div>
                    <div>
                      <label className='text-xs text-bronze/60 block mb-1'>
                        {t('生平概述', 'Biography')}
                      </label>
                      <textarea
                        className='w-full bg-[#f8f1e0] border border-bronze/20 p-3 h-32 outline-none resize-none leading-relaxed text-ink'
                        value={formData.biography || ''}
                        onChange={(e) => setFormData({ ...formData, biography: e.target.value })}
                      />
                    </div>
                    <div className='flex gap-4 pt-4'>
                      <button
                        onClick={async () => {
                          const spouseNameInput = formData.spouseName?.trim() || '';
                          const nextSpouseId = (formData.spouseId ?? selectedMember.spouseId) || '';
                          const currentSpouseId = selectedMember.spouseId || '';
                          const selectedSpouse = nextSpouseId
                            ? members.find((m) => m.id === nextSpouseId)
                            : null;

                          if (
                            selectedSpouse &&
                            selectedSpouse.spouseId &&
                            selectedSpouse.spouseId !== selectedMember.id
                          ) {
                            showToast(
                              t(
                                '该成员已有配偶关联，请先解除后再绑定。',
                                'Selected member already has a spouse. Remove it first.'
                              ),
                              'error'
                            );
                            return;
                          }

                          const updates: FamilyMember[] = [];
                          let resolvedSpouseId: string | null = nextSpouseId || null;

                          if (!resolvedSpouseId && spouseNameInput) {
                            const newSpouseId = generateId();
                            const spouseGender =
                              selectedMember.gender === 'male'
                                ? 'female'
                                : selectedMember.gender === 'female'
                                  ? 'male'
                                  : 'other';
                            const newSpouse: FamilyMember = {
                              id: newSpouseId,
                              name: spouseNameInput,
                              birthDate: '',
                              isMarried: true,
                              address: selectedMember.address || '',
                              gender: spouseGender,
                              parentId: null,
                              isDeleted: false,
                              spouseId: selectedMember.id,
                            };
                            resolvedSpouseId = newSpouseId;
                            updates.push(newSpouse);
                          }

                          if (currentSpouseId && currentSpouseId !== resolvedSpouseId) {
                            const oldSpouse = members.find((m) => m.id === currentSpouseId);
                            if (oldSpouse) {
                              updates.push({ ...oldSpouse, spouseId: null, isMarried: false });
                            }
                          }

                          if (resolvedSpouseId) {
                            const spouseMember =
                              updates.find((m) => m.id === resolvedSpouseId) ||
                              members.find((m) => m.id === resolvedSpouseId);
                            if (spouseMember) {
                              updates.push({
                                ...spouseMember,
                                spouseId: selectedMember.id,
                                isMarried: true,
                              });
                            }
                          }

                          const cleanedUpdated: FamilyMember = {
                            ...selectedMember,
                            ...formData,
                            spouseId: resolvedSpouseId,
                            isMarried: Boolean(resolvedSpouseId),
                          };
                          delete cleanedUpdated.spouseName;
                          updates.push(cleanedUpdated);

                          await Promise.all(updates.map((member) => saveMemberToDb(member)));
                          setMembers((prev) => {
                            const updatedMap = new Map(prev.map((m) => [m.id, m]));
                            updates.forEach((member) => updatedMap.set(member.id, member));
                            const existing = prev.map((m) => updatedMap.get(m.id) || m);
                            updates.forEach((member) => {
                              if (!prev.find((m) => m.id === member.id)) existing.push(member);
                            });
                            return existing;
                          });
                          aiCacheRef.current.clear();
                          setIsEditing(false);
                        }}
                        className='flex-1 bg-vermilion text-white py-2 rounded-full shadow hover:bg-vermilion/90'
                      >
                        {t('保存录入', 'Save')}
                      </button>
                      <button
                        onClick={() => setIsEditing(false)}
                        className='flex-1 border border-bronze text-bronze py-2 rounded-full hover:bg-white/50'
                      >
                        {t('取消', 'Cancel')}
                      </button>
                    </div>
                  </div>
                </div>
              ) : (
                <div className='flex flex-col gap-8 pb-6'>
                  <div className='flex flex-col items-center text-center gap-3 pt-2 relative'>
                    <div
                      className={`w-20 h-20 rounded-full flex items-center justify-center bg-[#fcf8ed] shadow-sm relative ${selectedMember.isHighlight ? 'border-2 border-[#daa520] shadow-[0_0_15px_rgba(218,165,32,0.4)]' : 'border border-bronze/30'}`}
                    >
                      {selectedMember.isHighlight && (
                        <div className='absolute -top-3 -right-2 text-[#daa520] animate-bounce'>
                          <Crown size={20} fill='currentColor' />
                        </div>
                      )}
                      <span
                        className={`text-4xl font-bold font-serif ${selectedMember.isHighlight ? 'text-[#b8860b]' : 'text-ink'}`}
                      >
                        {selectedMember.name.slice(0, 1)}
                      </span>
                    </div>
                    <div>
                      <h2 className='text-3xl font-bold text-ink mb-2 tracking-[0.2em] font-serif flex items-center justify-center gap-2'>
                        {selectedMember.name}
                      </h2>
                      <div className='flex justify-center gap-4 text-xs text-bronze uppercase tracking-widest opacity-80'>
                        <span>
                          {selectedMember.gender === 'male'
                            ? t('乾 (男)', 'Male')
                            : selectedMember.gender === 'female'
                              ? t('坤 (女)', 'Female')
                              : t('未知', 'Unknown')}
                        </span>
                        <span>•</span>
                        <span>
                          {selectedMember.birthDate
                            ? locale === 'en'
                              ? `Born ${selectedMember.birthDate.split('-')[0]}`
                              : `${selectedMember.birthDate.split('-')[0]} 年生`
                            : t('生年不详', 'Birth year unknown')}
                        </span>
                        {selectedSpouse && (
                          <>
                            <span>•</span>
                            <span>
                              {locale === 'en'
                                ? `Spouse: ${selectedSpouse.name}`
                                : `配 ${selectedSpouse.name}`}
                            </span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className='flex items-center justify-center gap-2 opacity-30'>
                    <div className='h-[1px] w-12 bg-bronze'></div>
                    <div className='w-1.5 h-1.5 rotate-45 border border-bronze bg-transparent'></div>
                    <div className='h-[1px] w-12 bg-bronze'></div>
                  </div>
                  <div className='space-y-8 px-2'>
                    <div>
                      <div className='flex justify-between items-end mb-2'>
                        <h3 className='text-base font-bold text-ink/80 font-serif'>
                          {t('族志简传', 'Biography')}
                        </h3>
                        {isAdmin && (
                          <button
                            onClick={async () => {
                              setLoadingAi(true);
                              try {
                                const bioCacheKey = ['biography', locale, selectedMember.id].join(
                                  '::'
                                );
                                const cachedBiography = aiCacheRef.current.get(bioCacheKey);
                                const bio =
                                  cachedBiography ||
                                  (await generateBiography(selectedMember, aiConfig, locale));
                                aiCacheRef.current.set(bioCacheKey, bio);
                                const updated = { ...selectedMember, biography: bio };
                                await saveMemberToDb(updated);
                                setMembers((prev) =>
                                  prev.map((m) => (m.id === selectedMember.id ? updated : m))
                                );
                              } catch {
                                showToast(
                                  t(
                                    '志传撰写失败，请检查 AI 设置。',
                                    'Failed to generate biography.'
                                  ),
                                  'error'
                                );
                              }
                              setLoadingAi(false);
                            }}
                            disabled={loadingAi}
                            className='text-[10px] text-bronze hover:text-vermilion flex items-center gap-1 transition-colors'
                          >
                            <Sparkles size={12} />{' '}
                            {loadingAi ? t('撰写中...', 'Writing...') : t('AI 续写', 'AI Continue')}
                          </button>
                        )}
                      </div>
                      <div className='text-sm leading-8 text-justify font-serif text-ink/80'>
                        <MarkdownRenderer
                          content={
                            selectedMember.biography ||
                            t('暂无详细记载。', 'No biography available.')
                          }
                        />
                      </div>
                    </div>
                    <div className='bg-[#f8f1e0] p-4 rounded-xl border border-bronze/10'>
                      <div className='flex justify-between items-center mb-3'>
                        <h4 className='text-xs font-bold text-bronze/70 uppercase'>
                          {t('灵犀询问', 'AI Inquiry')}
                        </h4>
                        <div className='flex gap-2 text-[10px]'>
                          <button
                            onClick={() => setInquiryStyle('classical')}
                            className={`transition ${inquiryStyle === 'classical' ? 'text-vermilion font-bold' : 'text-bronze/50'}`}
                          >
                            {t('古风', 'Classical')}
                          </button>
                          <span className='text-bronze/20'>|</span>
                          <button
                            onClick={() => setInquiryStyle('vernacular')}
                            className={`transition ${inquiryStyle === 'vernacular' ? 'text-vermilion font-bold' : 'text-bronze/50'}`}
                          >
                            {t('白话', 'Modern')}
                          </button>
                        </div>
                      </div>
                      <div className='flex gap-2'>
                        <input
                          className='flex-1 bg-transparent border-b border-bronze/20 py-1 text-sm outline-none focus:border-bronze placeholder:text-bronze/30'
                          placeholder={
                            locale === 'en'
                              ? `Ask about ${selectedMember.name}...`
                              : `欲知${selectedMember.name}何事...`
                          }
                          value={inquiry}
                          onChange={(e) => setInquiry(e.target.value)}
                          onKeyDown={(e) => e.key === 'Enter' && handleAiInquiry()}
                        />
                        <button
                          onClick={handleAiInquiry}
                          disabled={loadingAi}
                          className='text-bronze hover:text-vermilion transition'
                        >
                          <Send size={18} />
                        </button>
                      </div>
                      {aiResponse && (
                        <div className='mt-3 pt-3 border-t border-bronze/10 text-sm text-ink/80 leading-7'>
                          <MarkdownRenderer content={aiResponse} />
                        </div>
                      )}
                    </div>
                    <div className='pt-2'>
                      <div className='flex justify-between items-center mb-3'>
                        <h3 className='text-base font-bold text-ink/80 font-serif'>
                          {t('亲缘推演', 'Kinship Analysis')}
                        </h3>
                        <div className='flex gap-2 text-[10px]'>
                          <button
                            onClick={() => setAnalysisStyle('traditional')}
                            className={`transition ${analysisStyle === 'traditional' ? 'text-vermilion font-bold' : 'text-bronze/50'}`}
                          >
                            {t('古风', 'Traditional')}
                          </button>
                          <span className='text-bronze/20'>|</span>
                          <button
                            onClick={() => setAnalysisStyle('modern')}
                            className={`transition ${analysisStyle === 'modern' ? 'text-vermilion font-bold' : 'text-bronze/50'}`}
                          >
                            {t('白话', 'Modern')}
                          </button>
                        </div>
                      </div>
                      <div className='flex gap-2'>
                        <select
                          className='flex-1 bg-[#f8f1e0] border-none text-sm outline-none rounded-lg p-2 text-ink/80 cursor-pointer hover:bg-[#efe6d0] transition'
                          value={compareMemberId || ''}
                          onChange={(e) => setCompareMemberId(e.target.value)}
                        >
                          <option value=''>{t('选择对比宗亲...', 'Select a member...')}</option>
                          {activeMembers
                            .filter((m) => m.id !== selectedMember.id)
                            .map((m) => (
                              <option key={m.id} value={m.id}>
                                {m.name}
                              </option>
                            ))}
                        </select>
                        <button
                          onClick={async () => {
                            const target = activeMembers.find((m) => m.id === compareMemberId);
                            if (target) {
                              setLoadingDeduction(true);
                              setAiAnalysis('');
                              try {
                                const analysisCacheKey = [
                                  'relationship',
                                  locale,
                                  selectedMember.id,
                                  target.id,
                                  analysisStyle,
                                ].join('::');
                                const cachedAnalysis = aiCacheRef.current.get(analysisCacheKey);
                                const nextAnalysis =
                                  cachedAnalysis ||
                                  (await analyzeRelationship(
                                    selectedMember,
                                    target,
                                    activeMembers,
                                    analysisStyle,
                                    aiConfig,
                                    locale
                                  ));
                                aiCacheRef.current.set(analysisCacheKey, nextAnalysis);
                                setAiAnalysis(nextAnalysis);
                              } catch {
                                showToast(
                                  t('亲缘推演失败，请检查 AI 设置。', 'Failed to analyze kinship.'),
                                  'error'
                                );
                              }
                              setLoadingDeduction(false);
                            }
                          }}
                          disabled={loadingDeduction || !compareMemberId}
                          className='text-bronze hover:text-vermilion px-2 disabled:opacity-30'
                        >
                          {loadingDeduction ? (
                            <Loader2 size={18} className='animate-spin' />
                          ) : (
                            t('推演', 'Analyze')
                          )}
                        </button>
                      </div>
                      {aiAnalysis && (
                        <div className='mt-3 p-3 bg-[#fffaf0] rounded-xl border border-bronze/5 text-sm leading-7 shadow-sm'>
                          <MarkdownRenderer content={aiAnalysis} />
                        </div>
                      )}
                    </div>
                  </div>
                  {isAdmin && (
                    <div className='grid grid-cols-2 gap-2 mt-4 pt-4 border-t border-bronze/10 opacity-80 hover:opacity-100 transition px-2'>
                      <button
                        onClick={() => {
                          setFormData(selectedMember);
                          setIsEditing(true);
                        }}
                        className='text-bronze hover:text-vermilion text-xs flex flex-col items-center gap-1 group'
                      >
                        <div className='p-2 bg-[#f8f1e0] rounded-full group-hover:bg-white transition'>
                          <Edit2 size={14} />
                        </div>
                        {t('润色谱牒', 'Edit Record')}
                      </button>
                      <button
                        onClick={() => handleDeleteNode(selectedMember.id)}
                        className='text-bronze hover:text-vermilion text-xs flex flex-col items-center gap-1 group'
                      >
                        <div className='p-2 bg-[#f8f1e0] rounded-full group-hover:bg-white transition'>
                          <Trash2 size={14} />
                        </div>
                        {t('斩断此脉', 'Delete Branch')}
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
          <div className='h-10 bg-gradient-to-t from-[#d4b483] to-[#f4ecd8] relative z-20 shadow-[0_-2px_10px_rgba(0,0,0,0.05)] border-t border-[#c8aa7a]/30 flex items-center justify-center'>
            <div className='w-1/3 h-[2px] bg-[#a67c52]/20 rounded-full'></div>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className='w-full h-full text-ink overflow-hidden relative font-serif flex flex-col bg-parchment'>
      <div className='absolute inset-0 z-0'>
        <FamilyGraph
          familySurname={familySurname}
          data={activeMembers}
          selectedId={selectedMemberId}
          onSelectMember={onSelect}
          onDeselect={onDeselect}
          isAdmin={isAdmin}
          onAddChild={handleAddChildNode}
          onAddParent={handleAddParentNode}
          onDelete={handleDeleteNode}
          locale={locale}
        />
      </div>

      <div className='absolute top-2 left-2 md:top-4 md:left-4 z-20 pointer-events-none flex flex-col gap-2 md:gap-3 w-full max-w-[calc(100%-1rem)]'>
        <div className='glass-panel px-4 md:px-8 py-2 md:py-4 rounded-sm flex flex-col pointer-events-auto border-l-[4px] md:border-l-[6px] border-l-vermilion shadow-xl w-fit'>
          <span className='font-bold tracking-[0.2em] md:tracking-[0.4em] text-lg md:text-2xl text-ink leading-tight'>
            {t('华夏族谱录', 'Chrono Genealogy')}
          </span>
          <span className='text-[7px] md:text-[9px] text-bronze font-sans uppercase tracking-widest font-medium opacity-70'>
            {t('族谱账录', 'Ancestral Ledger')}
          </span>
        </div>
        <div className='pointer-events-auto w-fit flex gap-2'>
          {isAdmin ? (
            <div className='bg-vermilion/90 text-white px-3 py-1.5 rounded-sm flex items-center gap-2 text-[10px] font-bold shadow-lg'>
              <ShieldCheck size={12} /> {t('宗主亲临', 'Admin Mode')}
              <button
                onClick={() => setIsAdmin(false)}
                className='ml-1 opacity-60 hover:opacity-100 transition'
              >
                <X size={10} />
              </button>
            </div>
          ) : (
            <button
              onClick={() => setShowLogin(true)}
              className='glass-panel px-3 py-1.5 rounded-sm flex items-center gap-2 text-[10px] font-bold text-bronze border border-bronze/20 shadow-sm hover:bg-white transition-colors'
            >
              <Lock size={12} /> {t('宗主认证', 'Admin Login')}
            </button>
          )}
        </div>
      </div>

      {activeMembers.length > 0 && (
        <div className='absolute top-2 right-2 md:top-4 md:right-4 z-20 pointer-events-none max-w-[calc(100%-1rem)]'>
          <FamilyOverviewPanel
            deletedCount={deletedMembers.length}
            highlightCount={highlightCount}
            locale={locale}
            members={overviewMembers}
            onQueryChange={setMemberSearchQuery}
            onSelectMember={handleOverviewSelect}
            query={memberSearchQuery}
            rootCount={rootCount}
            totalCount={activeMembers.length}
            t={t}
          />
        </div>
      )}

      {activeMembers.length === 0 && !isLoading && (
        <div className='absolute inset-0 z-50 flex flex-col items-center justify-center pointer-events-none'>
          <div className='glass-panel p-8 rounded-xl shadow-2xl flex flex-col items-center gap-4 pointer-events-auto animate-in fade-in zoom-in duration-500 border-2 border-bronze/30 max-w-sm w-full bg-[#fdf6e3]'>
            <div className='w-16 h-16 bg-vermilion text-white rounded-full flex items-center justify-center mb-2 shadow-lg border-2 border-white'>
              <Scroll size={32} />
            </div>
            <h2 className='text-xl font-bold text-ink'>{t('开宗立派', 'Found Family')}</h2>
            <p className='text-xs text-bronze/80 mb-2 text-center max-w-[200px]'>
              {t(
                '当前暂无族人记录。请确立始祖，并设置宗主密令。',
                'No members yet. Create a founding ancestor and set an admin passphrase.'
              )}
            </p>

            <div className='w-full space-y-4 my-2'>
              <div>
                <label className='text-[10px] font-bold text-bronze block mb-1'>
                  {t('家族姓氏', 'Family Surname')}
                </label>
                <input
                  type='text'
                  value={setupSurname}
                  onChange={(e) => setSetupSurname(e.target.value)}
                  placeholder={t('如：袁', 'e.g. Smith')}
                  className='w-full bg-white border border-bronze/20 p-2 text-center font-bold text-lg outline-none focus:border-vermilion rounded-sm transition-colors text-ink placeholder:text-bronze/30'
                  maxLength={2}
                  onKeyDown={(e) => e.key === 'Enter' && handleCreateRoot()}
                />
              </div>
              <div>
                <label className='text-[10px] font-bold text-bronze block mb-1'>
                  {t('设置宗主密令 (管理员密码)', 'Set admin passphrase')}
                </label>
                <input
                  type='text'
                  value={setupPassphrase}
                  onChange={(e) => setSetupPassphrase(e.target.value)}
                  className='w-full bg-white border border-bronze/20 p-2 text-center outline-none focus:border-vermilion rounded-sm transition-colors text-ink font-serif'
                  onKeyDown={(e) => e.key === 'Enter' && handleCreateRoot()}
                />
              </div>
            </div>

            <button
              onClick={handleCreateRoot}
              disabled={isCreatingRoot || !setupSurname}
              className='w-full bg-vermilion text-white py-2.5 rounded-full font-bold shadow-lg hover:bg-vermilion/90 transition flex items-center justify-center gap-2 cursor-pointer disabled:opacity-70 disabled:cursor-not-allowed mt-2'
            >
              {isCreatingRoot ? <Loader2 size={16} className='animate-spin' /> : null}
              {isCreatingRoot
                ? t('正在立谱...', 'Creating...')
                : locale === 'en'
                  ? `Create ${setupSurname || 'a'} Family Founder`
                  : `确立 ${setupSurname || '某'} 氏始祖`}
            </button>
          </div>
        </div>
      )}

      <div className='absolute bottom-4 left-1/2 -translate-x-1/2 z-20 pointer-events-auto'>
        <div className='glass-panel px-4 py-2 rounded-full flex items-center gap-3 md:gap-6 border-2 border-bronze/30 shadow-2xl bg-white/95 scale-90 md:scale-100'>
          <button
            onClick={() => {
              const dataStr =
                'data:text/json;charset=utf-8,' + encodeURIComponent(exportMembersAsJson(members));
              const link = document.createElement('a');
              link.setAttribute('href', dataStr);
              link.setAttribute(
                'download',
                locale === 'en'
                  ? `${familySurname}-family-tree.json`
                  : `${familySurname}氏族谱.json`
              );
              link.click();
            }}
            className='p-2 hover:text-vermilion transition'
            title={t('保存典籍', 'Export JSON')}
          >
            <Save size={20} />
          </button>
          <label
            className='p-2 hover:text-vermilion cursor-pointer transition'
            title={t('载入古籍', 'Import JSON')}
          >
            <Upload size={20} />
            <input
              type='file'
              className='hidden'
              accept='.json'
              onChange={(e) => {
                const reader = new FileReader();
                if (e.target.files?.[0]) {
                  reader.readAsText(e.target.files[0], 'UTF-8');
                  reader.onload = async (evt) => {
                    try {
                      const rawText =
                        typeof evt.target?.result === 'string' ? evt.target.result : '[]';
                      const importedMembers = sanitizeImportedMembers(
                        JSON.parse(rawText) as unknown
                      );
                      const { members: migratedMembers } = migrateLegacySpouseData(importedMembers);
                      setMembers(migratedMembers);
                      writeStorageValue('familyMembers_backup', migratedMembers);
                      await Promise.all(
                        migratedMembers.map((member: FamilyMember) => saveMemberToDb(member))
                      );
                      aiCacheRef.current.clear();
                      showToast(t('古籍载入成功', 'Import successful'), 'info');
                    } catch {
                      showToast(t('古籍破损，无法辨识。', 'Import failed. Invalid file.'), 'error');
                    }
                  };
                }
              }}
            />
          </label>
          <div className='w-px h-6 bg-bronze/20'></div>
          {isAdmin && (
            <>
              <button
                onClick={() => setIsSettingsOpen(true)}
                className='p-2 hover:text-vermilion transition'
                title={t('置换乾坤', 'Settings')}
              >
                <Settings size={20} />
              </button>
              <button
                onClick={() => setIsRecycleBinOpen(true)}
                className='p-2 hover:text-vermilion transition relative'
                title={t('宗祠秘档 (回收站)', 'Recycle Bin')}
              >
                <ArchiveRestore size={20} />
                {deletedMembers.length > 0 && (
                  <span className='absolute top-1 right-1 w-2 h-2 bg-vermilion rounded-full'></span>
                )}
              </button>
            </>
          )}
          <button
            onClick={() =>
              selectedMemberId
                ? setIsDetailsOpen(true)
                : showToast(t('请先在族谱中选择一位宗亲', 'Please select a member first'), 'info')
            }
            className={`p-2 transition ${isDetailsOpen ? 'text-vermilion' : 'text-bronze'}`}
            title={t('查阅详请', 'View Details')}
          >
            <BookOpen size={20} />
          </button>
        </div>
      </div>

      {renderDetailsModal()}

      {showLogin && (
        <div className='absolute inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-in fade-in duration-300'>
          <div className='glass-panel p-6 md:p-10 max-w-sm w-full bg-parchment text-center border-4 border-bronze/50 shadow-2xl'>
            <Unlock className='mx-auto mb-4 text-vermilion' size={40} />
            <h2 className='text-2xl font-bold mb-2'>{t('宗主认证', 'Admin Login')}</h2>
            <p className='text-xs text-bronze mb-6'>
              {t('唯有宗主可修订族谱', 'Only admins can edit the family tree')}
            </p>
            <input
              type='password'
              className='w-full bg-white/50 border-b-2 border-bronze p-3 outline-none text-center mb-6 tracking-widest font-bold'
              placeholder={t('请输入宗族密令...', 'Enter passphrase...')}
              value={passphraseInput}
              onChange={(e) => setPassphraseInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
            />
            <div className='flex gap-4'>
              <button
                onClick={handleLogin}
                className='flex-1 bg-vermilion text-white py-3 rounded-sm font-bold text-sm shadow-md hover:bg-vermilion/90 transition-colors'
              >
                {t('验证印鉴', 'Verify')}
              </button>
              <button
                onClick={() => setShowLogin(false)}
                className='flex-1 border border-bronze text-bronze py-3 rounded-sm text-sm hover:bg-white transition-colors'
              >
                {t('暂且退下', 'Cancel')}
              </button>
            </div>
          </div>
        </div>
      )}

      {isSettingsOpen && isAdmin && (
        <div className='absolute inset-0 z-40 flex items-center justify-center bg-black/30 backdrop-blur-sm p-4 animate-in fade-in'>
          <div className='glass-panel p-6 md:p-8 max-w-md w-full bg-parchment-light border-2 border-bronze shadow-2xl relative max-h-[90vh] overflow-y-auto'>
            <button
              onClick={() => setIsSettingsOpen(false)}
              className='absolute top-4 right-4 text-bronze hover:text-vermilion transition'
            >
              <X size={24} />
            </button>
            <h2 className='text-xl font-bold mb-6 border-b border-bronze/20 pb-2 flex items-center gap-2'>
              <Settings size={20} /> {t('置换乾坤 (设置)', 'Settings')}
            </h2>
            <div className='space-y-6'>
              <div>
                <label className='text-xs font-bold text-bronze block mb-2'>
                  {t('背景家族姓氏 (书法水印)', 'Watermark Surname')}
                </label>
                <div className='flex gap-3'>
                  <input
                    className='flex-1 bg-white border border-bronze/30 p-2 text-center text-xl font-bold outline-none focus:border-vermilion transition'
                    maxLength={1}
                    value={familySurname}
                    onChange={(e) => setFamilySurname(e.target.value)}
                  />
                  <div className='w-12 h-12 flex items-center justify-center bg-vermilion text-white font-bold rounded-sm text-2xl font-calligraphy shadow-inner'>
                    {familySurname}
                  </div>
                </div>
              </div>
              <div className='border-t border-bronze/10 pt-4'>
                <label className='text-xs font-bold text-bronze block mb-2 flex items-center gap-2'>
                  <Scroll size={14} /> {t('语言', 'Language')}
                </label>
                <select
                  className='w-full bg-white border border-bronze/30 p-2 text-xs outline-none focus:border-vermilion transition'
                  value={locale}
                  onChange={(e) => setLocale(e.target.value as Locale)}
                >
                  <option value='zh'>中文</option>
                  <option value='en'>English</option>
                </select>
              </div>
              <div className='border-t border-bronze/10 pt-4'>
                <label className='text-xs font-bold text-bronze block mb-2 flex items-center gap-2'>
                  <Fingerprint size={14} /> {t('宗主密令修订', 'Admin Passphrase')}
                </label>
                <div>
                  <span className='text-[10px] text-bronze/60 block mb-1'>
                    {t('当前密令 (默认为 miling)', 'Current passphrase (default: miling)')}
                  </span>
                  <input
                    className='w-full bg-white border border-bronze/30 p-2 text-xs outline-none focus:border-vermilion transition'
                    value={adminPassphrase}
                    onChange={(e) => setAdminPassphrase(e.target.value)}
                  />
                </div>
              </div>
              <div className='border-t border-bronze/10 pt-4'>
                <label className='text-xs font-bold text-bronze block mb-2 flex items-center gap-2'>
                  <Sparkles size={14} /> {t('AI 模型配置', 'AI Settings')}
                </label>
                <div className='space-y-4'>
                  <div>
                    <span className='text-[10px] text-bronze/60 block mb-1'>
                      {t(
                        '模型名称 (如: gemini-3-flash-preview)',
                        'Model name (e.g. gemini-3-flash-preview)'
                      )}
                    </span>
                    <div className='flex bg-white border border-bronze/30 items-center px-2 focus-within:border-vermilion transition'>
                      <Layout size={14} className='text-bronze/40 mr-2' />
                      <input
                        className='flex-1 p-2 text-xs outline-none bg-transparent'
                        value={aiConfig.modelName}
                        onChange={(e) => setAiConfig({ ...aiConfig, modelName: e.target.value })}
                      />
                    </div>
                  </div>
                  <div>
                    <span className='text-[10px] text-bronze/60 block mb-1'>
                      {t('自定义接口地址 (OpenAI 兼容 Base URL)', 'Base URL (OpenAI compatible)')}
                    </span>
                    <div className='flex bg-white border border-bronze/30 items-center px-2 focus-within:border-vermilion transition'>
                      <MapPin size={14} className='text-bronze/40 mr-2' />
                      <input
                        className='flex-1 p-2 text-xs outline-none bg-transparent'
                        placeholder={t(
                          '如: https://api.openai.com/v1',
                          'e.g. https://api.openai.com/v1'
                        )}
                        value={aiConfig.baseUrl}
                        onChange={(e) => setAiConfig({ ...aiConfig, baseUrl: e.target.value })}
                      />
                    </div>
                  </div>
                  <div>
                    <span className='text-[10px] text-bronze/60 block mb-1'>
                      {t('API 密钥 (Secret Key)', 'API Key')}
                    </span>
                    <div className='flex bg-white border border-bronze/30 items-center px-2 focus-within:border-vermilion transition'>
                      <Key size={14} className='text-bronze/40 mr-2' />
                      <input
                        type='password'
                        className='flex-1 p-2 text-xs outline-none bg-transparent'
                        placeholder={t('输入您的 API Key', 'Enter your API key')}
                        value={aiConfig.apiKey}
                        onChange={(e) => setAiConfig({ ...aiConfig, apiKey: e.target.value })}
                      />
                    </div>
                  </div>
                </div>
              </div>
              <div className='pt-2'>
                <button
                  onClick={() => setIsSettingsOpen(false)}
                  className='w-full bg-bronze text-white py-3 rounded-sm font-bold shadow-md text-sm hover:bg-bronze/90 transition'
                >
                  {t('保存设置', 'Save Settings')}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {isRecycleBinOpen && isAdmin && (
        <div className='absolute inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4 animate-in fade-in'>
          <div className='glass-panel p-6 max-w-lg w-full bg-parchment border-2 border-bronze shadow-2xl relative flex flex-col max-h-[80vh]'>
            <button
              onClick={() => setIsRecycleBinOpen(false)}
              className='absolute top-4 right-4 text-bronze hover:text-vermilion transition'
            >
              <X size={20} />
            </button>
            <h2 className='text-xl font-bold mb-4 flex items-center gap-2'>
              <ArchiveRestore size={20} /> {t('宗祠秘档 (回收站)', 'Recycle Bin')}
            </h2>
            <div className='flex-1 overflow-y-auto space-y-2 pr-2'>
              {deletedMembers.length === 0 ? (
                <p className='text-center text-bronze/50 py-8 italic'>
                  {t('目前无被斩断之血脉。', 'No deleted members.')}
                </p>
              ) : (
                deletedMembers.map((m) => (
                  <div
                    key={m.id}
                    className='flex justify-between items-center bg-white/40 p-3 rounded border border-bronze/10'
                  >
                    <div>
                      <div className='font-bold text-sm'>{m.name}</div>
                      <div className='text-[10px] text-bronze'>
                        {m.birthDate} · {m.gender === 'male' ? t('乾', 'M') : t('坤', 'F')}
                      </div>
                    </div>
                    <button
                      onClick={() => handleRestore(m.id)}
                      className='bg-bronze text-white px-3 py-1 text-xs rounded hover:bg-vermilion transition-colors'
                    >
                      {t('恢复', 'Restore')}
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {deleteModal.isOpen && (
        <div className='absolute inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in'>
          <div className='glass-panel p-6 max-w-sm w-full bg-parchment text-center border-4 border-vermilion/50 shadow-2xl relative'>
            <AlertTriangle className='mx-auto mb-4 text-vermilion' size={40} />
            <h2 className='text-xl font-bold mb-2 text-ink'>{t('宗法警告', 'Delete Warning')}</h2>
            <p className='text-sm text-ink/80 mb-6 leading-relaxed'>
              {locale === 'en' ? (
                <>
                  You are about to delete <strong>{deleteModal.memberName}</strong>.
                  <br />
                  This will temporarily hide all descendants.
                  <br />
                  <span className='text-xs text-bronze font-bold mt-2 block'>
                    You can restore them from the recycle bin later.
                  </span>
                </>
              ) : (
                <>
                  您正欲【斩断此脉】（移除 <strong>{deleteModal.memberName}</strong>）。
                  <br />
                  此举将暂时封存其所有子孙后代。
                  <br />
                  <span className='text-xs text-bronze font-bold mt-2 block'>
                    日后可于宗祠秘档中恢复。
                  </span>
                </>
              )}
            </p>
            <div className='flex gap-4'>
              <button
                onClick={executeDelete}
                className='flex-1 bg-vermilion text-white py-2 rounded-sm font-bold text-sm shadow hover:bg-vermilion/90 transition-colors'
              >
                {t('执行家法', 'Confirm')}
              </button>
              <button
                onClick={() => setDeleteModal({ ...deleteModal, isOpen: false })}
                className='flex-1 border border-bronze text-bronze py-2 rounded-sm text-sm hover:bg-white transition-colors'
              >
                {t('刀下留人', 'Cancel')}
              </button>
            </div>
          </div>
        </div>
      )}

      {notification && (
        <div className='absolute top-10 left-1/2 -translate-x-1/2 z-[100] animate-in slide-in-from-top-4 fade-in duration-300 pointer-events-none'>
          <div
            className={`glass-panel px-6 py-3 rounded-full border-2 shadow-2xl flex items-center gap-3 backdrop-blur-md ${notification.type === 'error' ? 'border-vermilion/50 bg-[#fff5f5]/95 text-vermilion' : 'border-bronze/50 bg-[#fcf8ed]/95 text-ink'}`}
          >
            {notification.type === 'error' ? (
              <AlertTriangle size={18} />
            ) : (
              <Bell size={18} className='text-bronze' />
            )}
            <span className='font-bold text-sm tracking-wide font-serif'>
              {notification.message}
            </span>
          </div>
        </div>
      )}
    </div>
  );
};

export default App;
