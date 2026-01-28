import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { FamilyMember } from './types';
import FamilyGraph from './components/FamilyGraph';
import { 
  Trash2, Edit2, Save, Upload, Sparkles, 
  Lock, Unlock, ShieldCheck, Send, 
  X, Layout, Key, Loader2, AlertTriangle, ArchiveRestore, 
  Settings, MapPin, BookOpen, Crown,
  Fingerprint, Bell, Scroll
} from 'lucide-react';
import { analyzeRelationship, generateBiography, askAiAboutMember, AISettings } from './services/geminiService';

// 提取递归查找后代的逻辑
const getDescendants = (parentId: string, all: FamilyMember[]): string[] => {
  const children = all.filter(m => m.parentId === parentId && !m.isDeleted);
  let ids = children.map(c => c.id);
  children.forEach(c => {
    ids = [...ids, ...getDescendants(c.id, all)];
  });
  return ids;
};

// 计算年龄
// const calculateAge = (birthDate: string): number | string => {
//   if (!birthDate) return '未知';
//   const birth = new Date(birthDate);
//   const now = new Date();
//   let age = now.getFullYear() - birth.getFullYear();
//   const m = now.getMonth() - birth.getMonth();
//   if (m < 0 || (m === 0 && now.getDate() < birth.getDate())) {
//     age--;
//   }
//   return age;
// };

// --- 增强版 Markdown 渲染组件 ---
const MarkdownRenderer = ({ content }: { content: string }) => {
  if (!content) return null;
  const normalized = content.replace(/^(#{1,6}\s)/gm, '\n$1');
  const blocks = normalized.split('\n');
  return (
    <div className="space-y-3 text-ink/90 leading-relaxed text-justify">
      {blocks.map((line, idx) => {
        const trimmed = line.trim();
        if (!trimmed) return null;
        if (trimmed.startsWith('### ')) return <h3 key={idx} className="text-sm font-bold text-vermilion border-b border-vermilion/20 pb-1 mt-4">{parseBold(trimmed.replace(/^###\s+/, ''))}</h3>;
        if (trimmed.startsWith('## ')) return <h2 key={idx} className="text-base font-bold text-ink mt-4 mb-2">{parseBold(trimmed.replace(/^##\s+/, ''))}</h2>;
        if (trimmed.startsWith('# ')) return <h1 key={idx} className="text-lg font-bold text-ink mt-4 mb-2 text-center">{parseBold(trimmed.replace(/^#\s+/, ''))}</h1>;
        if (trimmed.match(/^[-*]\s/)) return <div key={idx} className="flex gap-2 ml-2"><span className="text-bronze font-bold">•</span><span>{parseBold(trimmed.replace(/^[-*]\s+/, ''))}</span></div>;
        if (trimmed.match(/^\d+\.\s/)) { const num = trimmed.match(/^\d+/)?.[0]; return <div key={idx} className="flex gap-2 ml-2"><span className="text-bronze font-bold">{num}.</span><span>{parseBold(trimmed.replace(/^\d+\.\s+/, ''))}</span></div>; }
        return <p key={idx} className="indent-4">{parseBold(trimmed)}</p>;
      })}
    </div>
  );
};

const parseBold = (text: string) => {
  const parts = text.split(/(\*\*.*?\*\*|\*.*?\*|`.*?`)/g);
  return parts.map((part, index) => {
    if (part.startsWith('**') && part.endsWith('**')) return <strong key={index} className="font-bold text-ink">{part.slice(2, -2)}</strong>;
    if (part.startsWith('*') && part.endsWith('*')) return <em key={index} className="italic text-bronze">{part.slice(1, -1)}</em>;
    if (part.startsWith('`') && part.endsWith('`')) return <code key={index} className="bg-bronze/10 px-1 rounded text-xs">{part.slice(1, -1)}</code>;
    return <span key={index}>{part}</span>;
  });
};

const App: React.FC = () => {
  const [members, setMembers] = useState<FamilyMember[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedMemberId, setSelectedMemberId] = useState<string | null>(null);
  const [isDetailsOpen, setIsDetailsOpen] = useState(false);

  const [compareMemberId, setCompareMemberId] = useState<string | null>(null); 
  const [isEditing, setIsEditing] = useState(false);
  const [aiAnalysis, setAiAnalysis] = useState<string>("");
  const [analysisStyle, setAnalysisStyle] = useState<'traditional' | 'modern'>('traditional');
  const [loadingAi, setLoadingAi] = useState(false);
  const [loadingDeduction, setLoadingDeduction] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isRecycleBinOpen, setIsRecycleBinOpen] = useState(false);
  const [formData, setFormData] = useState<Partial<FamilyMember>>({});
  
  // Creation States
  const [isCreatingRoot, setIsCreatingRoot] = useState(false);
  const [setupSurname, setSetupSurname] = useState("袁");
  const [setupPassphrase, setSetupPassphrase] = useState("miling");

  // Global Config
  const [familySurname, setFamilySurname] = useState(() => localStorage.getItem('familySurname') || "袁");
  const [adminPassphrase, setAdminPassphrase] = useState(() => localStorage.getItem('adminPassphrase') || "miling");
  const [aiConfig, setAiConfig] = useState<AISettings>({
    modelName: 'gemini-3-flash-preview',
    baseUrl: '',
    apiKey: ''
  });
  
  // Auth
  const [isAdmin, setIsAdmin] = useState(false);
  const [showLogin, setShowLogin] = useState(false);
  const [passphraseInput, setPassphraseInput] = useState("");

  const [inquiry, setInquiry] = useState("");
  const [inquiryStyle, setInquiryStyle] = useState<'classical' | 'vernacular'>('classical');
  const [aiResponse, setAiResponse] = useState("");

  const [notification, setNotification] = useState<{message: string, type: 'info' | 'error'} | null>(null);
  const [deleteModal, setDeleteModal] = useState<{isOpen: boolean, memberId: string | null, memberName: string}>({
    isOpen: false, memberId: null, memberName: ''
  });

  const selectedMember = useMemo(() => 
    Array.isArray(members) ? members.find(m => m.id === selectedMemberId) : null,
  [members, selectedMemberId]);
  const activeMembers = useMemo(() => Array.isArray(members) ? members.filter(m => !m.isDeleted) : [], [members]);
  const deletedMembers = useMemo(() => Array.isArray(members) ? members.filter(m => m.isDeleted) : [], [members]);

  const generateId = () => `M-${Date.now()}-${Math.floor(Math.random() * 10000)}`;

  // Save config changes
  useEffect(() => {
    localStorage.setItem('familySurname', familySurname);
  }, [familySurname]);

  useEffect(() => {
    localStorage.setItem('adminPassphrase', adminPassphrase);
  }, [adminPassphrase]);

  // OFFLINE SUPPORT: Persist members to localStorage
  useEffect(() => {
    if (members.length > 0) {
      localStorage.setItem('familyMembers_backup', JSON.stringify(members));
    }
  }, [members]);

  // --- API ---
  const fetchMembers = useCallback(async () => {
    setIsLoading(true);
    try {
      const controller = new AbortController();
      // Short timeout to fallback to local quickly if server is down
      const id = setTimeout(() => controller.abort(), 2000); 
      const res = await fetch('/api/members', { signal: controller.signal });
      clearTimeout(id);

      if (res.ok) {
        const data = await res.json();
        setMembers(data);
        // Backup fresh data
        localStorage.setItem('familyMembers_backup', JSON.stringify(data));
        
        if (data.length > 0) {
            // If data exists, sync surname if default
            const firstMember = data.find((m: FamilyMember) => !m.parentId);
            if (firstMember && firstMember.name) {
                if (familySurname === "袁") setFamilySurname(firstMember.name[0]);
            }
        }
      } else {
        throw new Error("Server error");
      }
    } catch (e) {
      console.warn("API unavailable, loading local backup", e);
      const local = localStorage.getItem('familyMembers_backup');
      if (local) {
        setMembers(JSON.parse(local));
        if (e instanceof Error && (e.name === 'AbortError' || e.message === 'Load failed')) {
            showToast("连接超时，已切换至离线模式", "info");
        }
      }
    } finally {
      setIsLoading(false);
    }
  }, [familySurname]); // Added dependency or useCallback
  
    // Save member helper...
    const saveMemberToDb = async (member: FamilyMember) => {
      try {
        const controller = new AbortController();
        const id = setTimeout(() => controller.abort(), 3000); // 3s timeout
  
        const res = await fetch('/api/members', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(member),
          signal: controller.signal
        });
        clearTimeout(id);
  
        if (!res.ok) throw new Error("Save failed");
        return true;
      } catch (e) {
        console.warn("Save failed, using offline fallback", e); // Used e
        showToast("网络不可用，已保存至本地", "info");
        // Swallow error to allow offline functionality
        // The state update in the caller + useEffect will handle persistence
        return false;
      }
  };

  useEffect(() => {
    fetchMembers();
  }, [fetchMembers]);

  useEffect(() => {
    if (notification) {
      const timer = setTimeout(() => setNotification(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [notification]);

  const showToast = (message: string, type: 'info' | 'error' = 'info') => {
    setNotification({ message, type });
  };

  const handleLogin = () => {
    if (passphraseInput === adminPassphrase) {
      setIsAdmin(true);
      setShowLogin(false);
      setPassphraseInput("");
    } else {
      showToast("印鉴不符", "error");
    }
  };

  const handleCreateRoot = async () => {
    if (isCreatingRoot) return;
    if (!setupSurname.trim()) {
        showToast("请填写家族姓氏", "error");
        return;
    }

    setIsCreatingRoot(true);
    try {
      // 1. Config
      const surname = setupSurname.trim();
      setFamilySurname(surname);
      if (setupPassphrase.trim()) setAdminPassphrase(setupPassphrase.trim());
      
      // 2. Member
      const newId = generateId();
      const root: FamilyMember = {
        id: newId,
        name: `${surname}氏始祖`,
        birthDate: '1000-01-01',
        isMarried: false,
        address: '祖籍地',
        gender: 'male',
        parentId: null,
        isDeleted: false,
        biography: `此乃${surname}氏开宗立派之始祖，功德无量，泽被后世。`,
        isHighlight: true
      };
      
      // Attempt save (will fallback to offline if needed)
      await saveMemberToDb(root);
      
      setMembers(prev => [...prev, root]);
      setIsAdmin(true);
      showToast("开宗立派成功", "info");
    } catch (e) {
      // Should not be reached due to saveMemberToDb swallowing errors
      console.error(e);
    } finally {
      setIsCreatingRoot(false);
    }
  };

  const handleAiInquiry = async () => {
    if (!selectedMember || !inquiry.trim()) return;
    setLoadingAi(true);
    try {
      const response = await askAiAboutMember(selectedMember, inquiry, inquiryStyle, aiConfig);
      setAiResponse(response);
    } catch {
      setAiResponse("灵犀不通，请检查 AI 配置。");
    } finally {
      setLoadingAi(false);
      setInquiry("");
    }
  };

  const onSelect = (m: FamilyMember) => {
    if (selectedMemberId === m.id) {
      setIsDetailsOpen(true);
    } else {
      setSelectedMemberId(m.id);
      setIsDetailsOpen(false); 
      setIsEditing(false);
      setAiAnalysis("");
      setAiResponse("");
      setCompareMemberId(null);
    }
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
    
    const newMembers = members.map(m => 
      idsToRemove.has(m.id) ? { ...m, isDeleted: true } : m
    ) as FamilyMember[];

    setMembers(newMembers);
    
    const updates = newMembers.filter(m => idsToRemove.has(m.id));
    // Optimistic
    updates.forEach(m => saveMemberToDb(m));

    if (selectedMemberId && idsToRemove.has(selectedMemberId)) {
      setSelectedMemberId(null);
      setIsDetailsOpen(false);
    }
    setDeleteModal({ isOpen: false, memberId: null, memberName: '' });
  };

  const handleRestore = async (id: string) => {
    const member = members.find(m => m.id === id);
    if (member) {
      const restored = { ...member, isDeleted: false };
      await saveMemberToDb(restored);
      setMembers(prev => prev.map(m => m.id === id ? restored : m));
    }
  };

  const handleAddChildNode = async (parentId: string) => {
    const newId = generateId();
    const parent = members.find(m => m.id === parentId);
    const newMember: FamilyMember = { 
      id: newId, name: "新成员", birthDate: "", isMarried: false, 
      address: parent ? parent.address : "", gender: "male", parentId: parentId, isDeleted: false 
    };
    await saveMemberToDb(newMember);
    setMembers(prev => [...prev, newMember]);
    setSelectedMemberId(newId);
    setFormData(newMember);
    setIsDetailsOpen(true);
    setIsEditing(true);
  };

  const handleAddParentNode = async (childId: string) => {
    const child = members.find(m => m.id === childId);
    if (!child) return;
    const newId = generateId();
    const newAncestor: FamilyMember = { 
      id: newId, name: "先祖讳名", birthDate: "", isMarried: false, 
      address: child.address, gender: "male", parentId: child.parentId, isDeleted: false 
    };
    const updatedChild = { ...child, parentId: newId };
    await saveMemberToDb(newAncestor);
    await saveMemberToDb(updatedChild);
    setMembers(prev => [...prev.map(m => m.id === childId ? updatedChild : m), newAncestor]);
    setSelectedMemberId(newId);
    setFormData(newAncestor);
    setIsDetailsOpen(true);
    setIsEditing(true);
  };

  const handleDeleteNode = (id: string) => {
    const member = members.find(m => m.id === id);
    if (member) setDeleteModal({ isOpen: true, memberId: id, memberName: member.name });
  };

  const renderDetailsModal = () => {
    if (!selectedMember || !isDetailsOpen) return null;

    return (
      <div className="absolute inset-0 z-40 flex items-center justify-center p-4 md:p-8 animate-in zoom-in-95 duration-500 pointer-events-none">
        <div className="absolute inset-0 bg-black/30 backdrop-blur-[2px] pointer-events-auto transition-opacity" onClick={() => setIsDetailsOpen(false)}></div>
        <div className="w-full max-w-xl max-h-[85vh] flex flex-col pointer-events-auto relative shadow-[0_25px_50px_-12px_rgba(166,124,82,0.5)] group rounded-[3rem] overflow-hidden">
           <div className="h-10 bg-gradient-to-b from-[#d4b483] to-[#f4ecd8] relative z-20 shadow-sm border-b border-[#c8aa7a]/30 flex items-center justify-center">
              <div className="w-1/3 h-[2px] bg-[#a67c52]/20 rounded-full"></div>
           </div>
           <div className="bg-[#fdf6e3] flex-1 flex flex-col overflow-hidden relative z-10">
              <div className="absolute inset-0 pointer-events-none opacity-40 bg-[url('https://www.transparenttextures.com/patterns/rice-paper-2.png')]"></div>
              <button onClick={() => setIsDetailsOpen(false)} className="absolute top-4 right-5 z-50 p-2 text-bronze/40 hover:text-vermilion transition hover:rotate-90 duration-300"><X size={26}/></button>
              <div className="flex-1 overflow-y-auto overflow-x-hidden scrollbar-thin px-8 py-6 relative">
                 {isEditing ? (
                   <div className="pb-8">
                      <h3 className="text-xl font-bold text-vermilion flex items-center gap-2 mb-6 border-b border-vermilion/20 pb-2"><Edit2 size={18}/> 润色谱牒</h3>
                      <div className="space-y-4">
                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <label className="text-xs text-bronze/60 block mb-1">姓名</label>
                            <input className="w-full bg-[#f8f1e0] border-b border-bronze/40 p-2 outline-none font-bold text-lg text-ink" value={formData.name || ''} onChange={e => setFormData({...formData, name: e.target.value})} />
                          </div>
                           <div>
                            <label className="text-xs text-bronze/60 block mb-1">礼位</label>
                            <select className="w-full bg-[#f8f1e0] border-b border-bronze/40 p-2 outline-none text-ink" value={formData.gender} onChange={e => setFormData({...formData, gender: e.target.value as FamilyMember['gender']})}>
                              <option value="male">乾 (男)</option>
                              <option value="female">坤 (女)</option>
                            </select>
                          </div>
                        </div>
                        <div>
                          <label className="text-xs text-bronze/60 block mb-1">连理配偶</label>
                          <input className="w-full bg-[#f8f1e0] border-b border-bronze/40 p-2 outline-none text-ink" value={formData.spouseName || ''} onChange={e => setFormData({...formData, spouseName: e.target.value})} />
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <label className="text-xs text-bronze/60 block mb-1">诞辰</label>
                            <input type="date" className="w-full bg-[#f8f1e0] border-b border-bronze/40 p-2 outline-none text-ink" value={formData.birthDate || ''} onChange={e => setFormData({...formData, birthDate: e.target.value})} />
                          </div>
                          <div>
                            <label className="text-xs text-bronze/60 block mb-1">籍贯</label>
                            <input className="w-full bg-[#f8f1e0] border-b border-bronze/40 p-2 outline-none text-ink" value={formData.address || ''} onChange={e => setFormData({...formData, address: e.target.value})} />
                          </div>
                        </div>
                        <div>
                           <label className="flex items-center gap-2 text-ink font-bold py-2 cursor-pointer">
                              <input type="checkbox" className="accent-vermilion w-4 h-4" checked={formData.isHighlight || false} onChange={e => setFormData({...formData, isHighlight: e.target.checked})} />
                              <span className="flex items-center gap-1"><Crown size={14} className="text-vermilion"/> 设为显赫宗亲 (立传)</span>
                           </label>
                        </div>
                        <div>
                          <label className="text-xs text-bronze/60 block mb-1">生平概述</label>
                          <textarea className="w-full bg-[#f8f1e0] border border-bronze/20 p-3 h-32 outline-none resize-none leading-relaxed text-ink" value={formData.biography || ''} onChange={e => setFormData({...formData, biography: e.target.value})} />
                        </div>
                        <div className="flex gap-4 pt-4">
                          <button onClick={async () => {
                            const updated = { ...selectedMember, ...formData } as FamilyMember;
                            await saveMemberToDb(updated);
                            setMembers(prev => prev.map(m => m.id === updated.id ? updated : m));
                            setIsEditing(false);
                          }} className="flex-1 bg-vermilion text-white py-2 rounded-full shadow hover:bg-vermilion/90">保存录入</button>
                          <button onClick={() => setIsEditing(false)} className="flex-1 border border-bronze text-bronze py-2 rounded-full hover:bg-white/50">取消</button>
                        </div>
                      </div>
                   </div>
                 ) : (
                   <div className="flex flex-col gap-8 pb-6">
                      <div className="flex flex-col items-center text-center gap-3 pt-2 relative">
                         <div className={`w-20 h-20 rounded-full flex items-center justify-center bg-[#fcf8ed] shadow-sm relative ${selectedMember.isHighlight ? 'border-2 border-[#daa520] shadow-[0_0_15px_rgba(218,165,32,0.4)]' : 'border border-bronze/30'}`}>
                            {selectedMember.isHighlight && <div className="absolute -top-3 -right-2 text-[#daa520] animate-bounce"><Crown size={20} fill="currentColor"/></div>}
                            <span className={`text-4xl font-bold font-serif ${selectedMember.isHighlight ? 'text-[#b8860b]' : 'text-ink'}`}>{selectedMember.name.slice(0,1)}</span>
                         </div>
                         <div>
                            <h2 className="text-3xl font-bold text-ink mb-2 tracking-[0.2em] font-serif flex items-center justify-center gap-2">{selectedMember.name}</h2>
                            <div className="flex justify-center gap-4 text-xs text-bronze uppercase tracking-widest opacity-80">
                               <span>{selectedMember.gender === 'male' ? '乾 (男)' : '坤 (女)'}</span>
                               <span>•</span>
                               <span>{selectedMember.birthDate.split('-')[0]} 年生</span>
                               {selectedMember.spouseName && <><span>•</span><span>配 {selectedMember.spouseName}</span></>}
                            </div>
                         </div>
                      </div>
                      <div className="flex items-center justify-center gap-2 opacity-30">
                         <div className="h-[1px] w-12 bg-bronze"></div>
                         <div className="w-1.5 h-1.5 rotate-45 border border-bronze bg-transparent"></div>
                         <div className="h-[1px] w-12 bg-bronze"></div>
                      </div>
                      <div className="space-y-8 px-2">
                         <div>
                            <div className="flex justify-between items-end mb-2">
                              <h3 className="text-base font-bold text-ink/80 font-serif">族志简传</h3>
                              {isAdmin && (
                                <button onClick={async () => {
                                  setLoadingAi(true);
                                  try {
                                    const bio = await generateBiography(selectedMember, aiConfig);
                                    const updated = { ...selectedMember, biography: bio };
                                    await saveMemberToDb(updated);
                                    setMembers(prev => prev.map(m => m.id === selectedMember.id ? updated : m));
                                  } catch { /* ignore */ }
                                  setLoadingAi(false);
                                }} disabled={loadingAi} className="text-[10px] text-bronze hover:text-vermilion flex items-center gap-1 transition-colors"><Sparkles size={12}/> {loadingAi ? '撰写中...' : 'AI 续写'}</button>
                              )}
                            </div>
                            <div className="text-sm leading-8 text-justify font-serif text-ink/80">
                               <MarkdownRenderer content={selectedMember.biography || "暂无详细记载。"} />
                            </div>
                         </div>
                         <div className="bg-[#f8f1e0] p-4 rounded-xl border border-bronze/10">
                            <div className="flex justify-between items-center mb-3">
                               <h4 className="text-xs font-bold text-bronze/70 uppercase">灵犀询问</h4>
                               <div className="flex gap-2 text-[10px]">
                                  <button onClick={() => setInquiryStyle('classical')} className={`transition ${inquiryStyle === 'classical' ? 'text-vermilion font-bold' : 'text-bronze/50'}`}>古风</button>
                                  <span className="text-bronze/20">|</span>
                                  <button onClick={() => setInquiryStyle('vernacular')} className={`transition ${inquiryStyle === 'vernacular' ? 'text-vermilion font-bold' : 'text-bronze/50'}`}>白话</button>
                                </div>
                            </div>
                            <div className="flex gap-2">
                               <input className="flex-1 bg-transparent border-b border-bronze/20 py-1 text-sm outline-none focus:border-bronze placeholder:text-bronze/30" placeholder={`欲知${selectedMember.name}何事...`} value={inquiry} onChange={e => setInquiry(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleAiInquiry()} />
                               <button onClick={handleAiInquiry} disabled={loadingAi} className="text-bronze hover:text-vermilion transition"><Send size={18}/></button>
                            </div>
                            {aiResponse && (
                              <div className="mt-3 pt-3 border-t border-bronze/10 text-sm text-ink/80 leading-7">
                                 <MarkdownRenderer content={aiResponse} />
                              </div>
                            )}
                         </div>
                         <div className="pt-2">
                            <div className="flex justify-between items-center mb-3">
                               <h3 className="text-base font-bold text-ink/80 font-serif">亲缘推演</h3>
                               <div className="flex gap-2 text-[10px]">
                                  <button onClick={() => setAnalysisStyle('traditional')} className={`transition ${analysisStyle === 'traditional' ? 'text-vermilion font-bold' : 'text-bronze/50'}`}>古风</button>
                                  <span className="text-bronze/20">|</span>
                                  <button onClick={() => setAnalysisStyle('modern')} className={`transition ${analysisStyle === 'modern' ? 'text-vermilion font-bold' : 'text-bronze/50'}`}>白话</button>
                               </div>
                            </div>
                            <div className="flex gap-2">
                              <select className="flex-1 bg-[#f8f1e0] border-none text-sm outline-none rounded-lg p-2 text-ink/80 cursor-pointer hover:bg-[#efe6d0] transition" value={compareMemberId || ''} onChange={e => setCompareMemberId(e.target.value)}>
                                 <option value="">选择对比宗亲...</option>
                                 {activeMembers.filter(m => m.id !== selectedMember.id).map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                              </select>
                              <button 
                                onClick={async () => {
                                  const target = activeMembers.find(m => m.id === compareMemberId);
                                  if (target) {
                                    setLoadingDeduction(true);
                                    setAiAnalysis("");
                                    try { setAiAnalysis(await analyzeRelationship(selectedMember, target, activeMembers, analysisStyle, aiConfig)); } catch { /* ignore */ }
                                    setLoadingDeduction(false);
                                  }
                                }}
                                disabled={loadingDeduction || !compareMemberId}
                                className="text-bronze hover:text-vermilion px-2 disabled:opacity-30"
                              >
                                 {loadingDeduction ? <Loader2 size={18} className="animate-spin"/> : '推演'}
                              </button>
                            </div>
                            {aiAnalysis && (
                              <div className="mt-3 p-3 bg-[#fffaf0] rounded-xl border border-bronze/5 text-sm leading-7 shadow-sm">
                                 <MarkdownRenderer content={aiAnalysis} />
                              </div>
                            )}
                         </div>
                      </div>
                      {isAdmin && (
                         <div className="grid grid-cols-2 gap-2 mt-4 pt-4 border-t border-bronze/10 opacity-80 hover:opacity-100 transition px-2">
                            <button onClick={() => { setFormData(selectedMember); setIsEditing(true); }} className="text-bronze hover:text-vermilion text-xs flex flex-col items-center gap-1 group"><div className="p-2 bg-[#f8f1e0] rounded-full group-hover:bg-white transition"><Edit2 size={14}/></div>润色谱牒</button>
                            <button onClick={() => handleDeleteNode(selectedMember.id)} className="text-bronze hover:text-vermilion text-xs flex flex-col items-center gap-1 group"><div className="p-2 bg-[#f8f1e0] rounded-full group-hover:bg-white transition"><Trash2 size={14}/></div>斩断此脉</button>
                         </div>
                      )}
                   </div>
                 )}
              </div>
           </div>
           <div className="h-10 bg-gradient-to-t from-[#d4b483] to-[#f4ecd8] relative z-20 shadow-[0_-2px_10px_rgba(0,0,0,0.05)] border-t border-[#c8aa7a]/30 flex items-center justify-center">
              <div className="w-1/3 h-[2px] bg-[#a67c52]/20 rounded-full"></div>
           </div>
        </div>
      </div>
    );
  };

  return (
    <div className="w-full h-full text-ink overflow-hidden relative font-serif flex flex-col bg-parchment">
      <div className="absolute inset-0 z-0">
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
        />
      </div>

      <div className="absolute top-2 left-2 md:top-4 md:left-4 z-20 pointer-events-none flex flex-col gap-2 md:gap-3 w-full max-w-[calc(100%-1rem)]">
        <div className="glass-panel px-4 md:px-8 py-2 md:py-4 rounded-sm flex flex-col pointer-events-auto border-l-[4px] md:border-l-[6px] border-l-vermilion shadow-xl w-fit">
             <span className="font-bold tracking-[0.2em] md:tracking-[0.4em] text-lg md:text-2xl text-ink leading-tight">华夏族谱录</span>
             <span className="text-[7px] md:text-[9px] text-bronze font-sans uppercase tracking-widest font-medium opacity-70">Ancestral Ledger</span>
        </div>
        <div className="pointer-events-auto w-fit flex gap-2">
          {isAdmin ? (
            <div className="bg-vermilion/90 text-white px-3 py-1.5 rounded-sm flex items-center gap-2 text-[10px] font-bold shadow-lg">
               <ShieldCheck size={12}/> 宗主亲临
               <button onClick={() => setIsAdmin(false)} className="ml-1 opacity-60 hover:opacity-100 transition"><X size={10}/></button>
            </div>
          ) : (
            <button onClick={() => setShowLogin(true)} className="glass-panel px-3 py-1.5 rounded-sm flex items-center gap-2 text-[10px] font-bold text-bronze border border-bronze/20 shadow-sm hover:bg-white transition-colors">
               <Lock size={12}/> 宗主认证
            </button>
          )}
        </div>
      </div>

      {activeMembers.length === 0 && !isLoading && (
        <div className="absolute inset-0 z-50 flex flex-col items-center justify-center pointer-events-none">
            <div className="glass-panel p-8 rounded-xl shadow-2xl flex flex-col items-center gap-4 pointer-events-auto animate-in fade-in zoom-in duration-500 border-2 border-bronze/30 max-w-sm w-full bg-[#fdf6e3]">
                <div className="w-16 h-16 bg-vermilion text-white rounded-full flex items-center justify-center mb-2 shadow-lg border-2 border-white">
                  <Scroll size={32} />
                </div>
                <h2 className="text-xl font-bold text-ink">开宗立派</h2>
                <p className="text-xs text-bronze/80 mb-2 text-center max-w-[200px]">当前暂无族人记录。请确立始祖，并设置宗主密令。</p>
                
                <div className="w-full space-y-4 my-2">
                   <div>
                      <label className="text-[10px] font-bold text-bronze block mb-1">家族姓氏</label>
                      <input 
                        type="text" 
                        value={setupSurname}
                        onChange={(e) => setSetupSurname(e.target.value)}
                        placeholder="如：袁"
                        className="w-full bg-white border border-bronze/20 p-2 text-center font-bold text-lg outline-none focus:border-vermilion rounded-sm transition-colors text-ink placeholder:text-bronze/30"
                        maxLength={2}
                        onKeyDown={e => e.key === 'Enter' && handleCreateRoot()}
                      />
                   </div>
                   <div>
                      <label className="text-[10px] font-bold text-bronze block mb-1">设置宗主密令 (管理员密码)</label>
                      <input 
                        type="text" 
                        value={setupPassphrase}
                        onChange={(e) => setSetupPassphrase(e.target.value)}
                        className="w-full bg-white border border-bronze/20 p-2 text-center outline-none focus:border-vermilion rounded-sm transition-colors text-ink font-serif"
                        onKeyDown={e => e.key === 'Enter' && handleCreateRoot()}
                      />
                   </div>
                </div>

                <button 
                  onClick={handleCreateRoot}
                  disabled={isCreatingRoot || !setupSurname}
                  className="w-full bg-vermilion text-white py-2.5 rounded-full font-bold shadow-lg hover:bg-vermilion/90 transition flex items-center justify-center gap-2 cursor-pointer disabled:opacity-70 disabled:cursor-not-allowed mt-2"
                >
                  {isCreatingRoot ? <Loader2 size={16} className="animate-spin" /> : null} 
                  {isCreatingRoot ? '正在立谱...' : `确立 ${setupSurname || '某'} 氏始祖`}
                </button>
            </div>
        </div>
      )}

      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-20 pointer-events-auto">
         <div className="glass-panel px-4 py-2 rounded-full flex items-center gap-3 md:gap-6 border-2 border-bronze/30 shadow-2xl bg-white/95 scale-90 md:scale-100">
            <button onClick={() => {
              const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(members));
              const link = document.createElement('a');
              link.setAttribute("href", dataStr);
              link.setAttribute("download", `${familySurname}氏族谱.json`);
              link.click();
            }} className="p-2 hover:text-vermilion transition" title="保存典籍"><Save size={20} /></button>
            <label className="p-2 hover:text-vermilion cursor-pointer transition" title="载入古籍">
               <Upload size={20} /><input type="file" className="hidden" accept=".json" onChange={e => {
                  const reader = new FileReader();
                  if (e.target.files?.[0]) {
                    reader.readAsText(e.target.files[0], "UTF-8");
                    reader.onload = async evt => {
                      try { 
                        const importedMembers = JSON.parse(evt.target?.result as string);
                        setMembers(importedMembers);
                        await Promise.all(importedMembers.map((m: FamilyMember) => saveMemberToDb(m)));
                        showToast("古籍载入成功", "info");
                      } catch { showToast("古籍破损，无法辨识。", "error"); }
                    };
                  }
               }} />
            </label>
            <div className="w-px h-6 bg-bronze/20"></div>
            {isAdmin && (
               <>
                <button onClick={() => setIsSettingsOpen(true)} className="p-2 hover:text-vermilion transition" title="置换乾坤"><Settings size={20} /></button>
                <button onClick={() => setIsRecycleBinOpen(true)} className="p-2 hover:text-vermilion transition relative" title="宗祠秘档 (回收站)">
                  <ArchiveRestore size={20} />
                  {deletedMembers.length > 0 && <span className="absolute top-1 right-1 w-2 h-2 bg-vermilion rounded-full"></span>}
                </button>
               </>
            )}
            <button 
              onClick={() => selectedMemberId ? setIsDetailsOpen(true) : showToast("请先在族谱中选择一位宗亲", "info")} 
              className={`p-2 transition ${isDetailsOpen ? 'text-vermilion' : 'text-bronze'}`} 
              title="查阅详请"
            >
              <BookOpen size={20} />
            </button>
         </div>
      </div>

      {renderDetailsModal()}

      {showLogin && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-in fade-in duration-300">
          <div className="glass-panel p-6 md:p-10 max-w-sm w-full bg-parchment text-center border-4 border-bronze/50 shadow-2xl">
            <Unlock className="mx-auto mb-4 text-vermilion" size={40} />
            <h2 className="text-2xl font-bold mb-2">宗主认证</h2>
            <p className="text-xs text-bronze mb-6">唯有宗主可修订族谱</p>
            <input type="password" 
              className="w-full bg-white/50 border-b-2 border-bronze p-3 outline-none text-center mb-6 tracking-widest font-bold" 
              placeholder="请输入宗族密令..." 
              value={passphraseInput} 
              onChange={e => setPassphraseInput(e.target.value)} 
              onKeyDown={e => e.key === 'Enter' && handleLogin()} 
            />
            <div className="flex gap-4">
              <button onClick={handleLogin} className="flex-1 bg-vermilion text-white py-3 rounded-sm font-bold text-sm shadow-md hover:bg-vermilion/90 transition-colors">验证印鉴</button>
              <button onClick={() => setShowLogin(false)} className="flex-1 border border-bronze text-bronze py-3 rounded-sm text-sm hover:bg-white transition-colors">暂且退下</button>
            </div>
          </div>
        </div>
      )}

      {isSettingsOpen && isAdmin && (
        <div className="absolute inset-0 z-40 flex items-center justify-center bg-black/30 backdrop-blur-sm p-4 animate-in fade-in">
          <div className="glass-panel p-6 md:p-8 max-w-md w-full bg-parchment-light border-2 border-bronze shadow-2xl relative max-h-[90vh] overflow-y-auto">
            <button onClick={() => setIsSettingsOpen(false)} className="absolute top-4 right-4 text-bronze hover:text-vermilion transition"><X size={24}/></button>
            <h2 className="text-xl font-bold mb-6 border-b border-bronze/20 pb-2 flex items-center gap-2"><Settings size={20}/> 置换乾坤 (设置)</h2>
            <div className="space-y-6">
              <div>
                <label className="text-xs font-bold text-bronze block mb-2">背景家族姓氏 (书法水印)</label>
                <div className="flex gap-3">
                   <input className="flex-1 bg-white border border-bronze/30 p-2 text-center text-xl font-bold outline-none focus:border-vermilion transition" maxLength={1} value={familySurname} onChange={e => setFamilySurname(e.target.value)} />
                   <div className="w-12 h-12 flex items-center justify-center bg-vermilion text-white font-bold rounded-sm text-2xl font-calligraphy shadow-inner">{familySurname}</div>
                </div>
              </div>
              <div className="border-t border-bronze/10 pt-4">
                 <label className="text-xs font-bold text-bronze block mb-2 flex items-center gap-2"><Fingerprint size={14}/> 宗主密令修订</label>
                 <div>
                    <span className="text-[10px] text-bronze/60 block mb-1">当前密令 (默认为 milin)</span>
                    <input className="w-full bg-white border border-bronze/30 p-2 text-xs outline-none focus:border-vermilion transition" value={adminPassphrase} onChange={e => setAdminPassphrase(e.target.value)} />
                 </div>
              </div>
              <div className="border-t border-bronze/10 pt-4">
                <label className="text-xs font-bold text-bronze block mb-2 flex items-center gap-2"><Sparkles size={14}/> AI 模型配置</label>
                <div className="space-y-4">
                   <div>
                     <span className="text-[10px] text-bronze/60 block mb-1">模型名称 (如: gemini-3-flash-preview)</span>
                     <div className="flex bg-white border border-bronze/30 items-center px-2 focus-within:border-vermilion transition">
                        <Layout size={14} className="text-bronze/40 mr-2" />
                        <input className="flex-1 p-2 text-xs outline-none bg-transparent" value={aiConfig.modelName} onChange={e => setAiConfig({...aiConfig, modelName: e.target.value})} />
                     </div>
                   </div>
                   <div>
                     <span className="text-[10px] text-bronze/60 block mb-1">自定义接口地址 (OpenAI 兼容 Base URL)</span>
                     <div className="flex bg-white border border-bronze/30 items-center px-2 focus-within:border-vermilion transition">
                        <MapPin size={14} className="text-bronze/40 mr-2" />
                        <input className="flex-1 p-2 text-xs outline-none bg-transparent" placeholder="如: https://api.openai.com/v1" value={aiConfig.baseUrl} onChange={e => setAiConfig({...aiConfig, baseUrl: e.target.value})} />
                     </div>
                   </div>
                   <div>
                     <span className="text-[10px] text-bronze/60 block mb-1">API 密钥 (Secret Key)</span>
                     <div className="flex bg-white border border-bronze/30 items-center px-2 focus-within:border-vermilion transition">
                        <Key size={14} className="text-bronze/40 mr-2" />
                        <input type="password" className="flex-1 p-2 text-xs outline-none bg-transparent" placeholder="输入您的 API Key" value={aiConfig.apiKey} onChange={e => setAiConfig({...aiConfig, apiKey: e.target.value})} />
                     </div>
                   </div>
                </div>
              </div>
              <div className="pt-2">
                 <button onClick={() => setIsSettingsOpen(false)} className="w-full bg-bronze text-white py-3 rounded-sm font-bold shadow-md text-sm hover:bg-bronze/90 transition">保存设置</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {isRecycleBinOpen && isAdmin && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4 animate-in fade-in">
           <div className="glass-panel p-6 max-w-lg w-full bg-parchment border-2 border-bronze shadow-2xl relative flex flex-col max-h-[80vh]">
              <button onClick={() => setIsRecycleBinOpen(false)} className="absolute top-4 right-4 text-bronze hover:text-vermilion transition"><X size={20}/></button>
              <h2 className="text-xl font-bold mb-4 flex items-center gap-2"><ArchiveRestore size={20}/> 宗祠秘档 (回收站)</h2>
              <div className="flex-1 overflow-y-auto space-y-2 pr-2">
                 {deletedMembers.length === 0 ? (
                   <p className="text-center text-bronze/50 py-8 italic">目前无被斩断之血脉。</p>
                 ) : (
                   deletedMembers.map(m => (
                     <div key={m.id} className="flex justify-between items-center bg-white/40 p-3 rounded border border-bronze/10">
                        <div>
                           <div className="font-bold text-sm">{m.name}</div>
                           <div className="text-[10px] text-bronze">{m.birthDate} · {m.gender === 'male' ? '乾' : '坤'}</div>
                        </div>
                        <button onClick={() => handleRestore(m.id)} className="bg-bronze text-white px-3 py-1 text-xs rounded hover:bg-vermilion transition-colors">恢复</button>
                     </div>
                   ))
                 )}
              </div>
           </div>
        </div>
      )}

      {deleteModal.isOpen && (
        <div className="absolute inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in">
           <div className="glass-panel p-6 max-w-sm w-full bg-parchment text-center border-4 border-vermilion/50 shadow-2xl relative">
              <AlertTriangle className="mx-auto mb-4 text-vermilion" size={40} />
              <h2 className="text-xl font-bold mb-2 text-ink">宗法警告</h2>
              <p className="text-sm text-ink/80 mb-6 leading-relaxed">
                您正欲【斩断此脉】（移除 <strong>{deleteModal.memberName}</strong>）。<br/>
                此举将暂时封存其所有子孙后代。<br/>
                <span className="text-xs text-bronze font-bold mt-2 block">日后可于宗祠秘档中恢复。</span>
              </p>
              <div className="flex gap-4">
                 <button onClick={executeDelete} className="flex-1 bg-vermilion text-white py-2 rounded-sm font-bold text-sm shadow hover:bg-vermilion/90 transition-colors">执行家法</button>
                 <button onClick={() => setDeleteModal({...deleteModal, isOpen: false})} className="flex-1 border border-bronze text-bronze py-2 rounded-sm text-sm hover:bg-white transition-colors">刀下留人</button>
              </div>
           </div>
        </div>
      )}

      {notification && (
         <div className="absolute top-10 left-1/2 -translate-x-1/2 z-[100] animate-in slide-in-from-top-4 fade-in duration-300 pointer-events-none">
            <div className={`glass-panel px-6 py-3 rounded-full border-2 shadow-2xl flex items-center gap-3 backdrop-blur-md ${notification.type === 'error' ? 'border-vermilion/50 bg-[#fff5f5]/95 text-vermilion' : 'border-bronze/50 bg-[#fcf8ed]/95 text-ink'}`}>
               {notification.type === 'error' ? <AlertTriangle size={18} /> : <Bell size={18} className="text-bronze"/>}
               <span className="font-bold text-sm tracking-wide font-serif">{notification.message}</span>
            </div>
         </div>
      )}
    </div>
  );
};

export default App;