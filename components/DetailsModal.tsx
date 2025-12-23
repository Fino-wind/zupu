import React, { useState, useEffect } from 'react';
import { FamilyMember } from '../types';
import { AISettings, analyzeRelationship, generateBiography, askAiAboutMember } from '../services/geminiService';
import { 
  X, Edit2, Crown, Sparkles, Send, Loader2, 
  UserPlus, Trash2, Save 
} from 'lucide-react';

interface DetailsModalProps {
  member: FamilyMember | null;
  isOpen: boolean;
  onClose: () => void;
  allMembers: FamilyMember[];
  isAdmin: boolean;
  aiConfig: AISettings;
  onSave: (member: FamilyMember) => Promise<void>;
  onAddChild: (parentId: string) => void;
  onDelete: (id: string) => void;
  initialIsEditing?: boolean;
}

// --- Internal Helper Components ---

const parseBold = (text: string) => {
  if (!text) return null;
  const parts = text.split(/(\*\*.*?\*\*|\*.*?\*|`.*?`)/g);
  return parts.map((part, index) => {
    if (part.startsWith('**') && part.endsWith('**')) return <strong key={index} className="font-bold text-ink">{part.slice(2, -2)}</strong>;
    if (part.startsWith('*') && part.endsWith('*')) return <em key={index} className="italic text-bronze">{part.slice(1, -1)}</em>;
    if (part.startsWith('`') && part.endsWith('`')) return <code key={index} className="bg-bronze/10 px-1 rounded text-xs">{part.slice(1, -1)}</code>;
    return <span key={index}>{part}</span>;
  });
};

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

const DetailsModal: React.FC<DetailsModalProps> = ({
  member,
  isOpen,
  onClose,
  allMembers,
  isAdmin,
  aiConfig,
  onSave,
  onAddChild,
  onDelete,
  initialIsEditing = false
}) => {
  // Local State for the modal
  const [isEditing, setIsEditing] = useState(false);
  const [formData, setFormData] = useState<Partial<FamilyMember>>({});
  
  // AI Interaction State
  const [loadingAi, setLoadingAi] = useState(false);
  const [inquiry, setInquiry] = useState("");
  const [inquiryStyle, setInquiryStyle] = useState<'classical' | 'vernacular'>('classical');
  const [aiResponse, setAiResponse] = useState("");
  
  // Relationship Deduction State
  const [compareMemberId, setCompareMemberId] = useState<string | null>(null);
  const [analysisStyle, setAnalysisStyle] = useState<'traditional' | 'modern'>('traditional');
  const [loadingDeduction, setLoadingDeduction] = useState(false);
  const [aiAnalysis, setAiAnalysis] = useState<string>("");

  // Initialize state when member changes or modal opens
  useEffect(() => {
    if (member) {
      if (initialIsEditing) {
        setIsEditing(true);
        setFormData({ ...member });
      } else {
        setIsEditing(false);
        setFormData({});
      }
      
      // Reset AI states
      setInquiry("");
      setAiResponse("");
      setCompareMemberId(null);
      setAiAnalysis("");
    }
  }, [member?.id, initialIsEditing]);

  if (!member || !isOpen) return null;

  const handleAiInquiry = async () => {
    if (!member || !inquiry.trim()) return;
    setLoadingAi(true);
    try {
      const response = await askAiAboutMember(member, inquiry, inquiryStyle, aiConfig);
      setAiResponse(response);
    } catch (e) {
      setAiResponse("灵犀不通，请检查 AI 配置。");
    } finally {
      setLoadingAi(false);
      setInquiry("");
    }
  };

  const handleSave = async () => {
    try {
      const updated = { ...member, ...formData } as FamilyMember;
      
      // Optimistic UI update: Switch to read mode immediately
      setIsEditing(false);
      
      // Perform actual save
      await onSave(updated);
    } catch (error) {
      console.error("Failed to save:", error);
      // Revert to edit mode if save critically failed
      setIsEditing(true);
      alert("保存失败，请检查网络后重试。");
    }
  };

  return (
    <div className="absolute inset-0 z-40 flex items-center justify-center p-4 md:p-8 animate-in zoom-in-95 duration-500 pointer-events-none">
      <div className="absolute inset-0 bg-black/30 backdrop-blur-[2px] pointer-events-auto transition-opacity" onClick={onClose}></div>
      <div className="w-full max-w-xl max-h-[85vh] flex flex-col pointer-events-auto relative shadow-[0_25px_50px_-12px_rgba(166,124,82,0.5)] group rounded-[3rem] overflow-hidden">
         
         {/* Header Decoration */}
         <div className="h-10 bg-gradient-to-b from-[#d4b483] to-[#f4ecd8] relative z-20 shadow-sm border-b border-[#c8aa7a]/30 flex items-center justify-center">
            <div className="w-1/3 h-[2px] bg-[#a67c52]/20 rounded-full"></div>
         </div>

         {/* Content Area */}
         <div className="bg-[#fdf6e3] flex-1 flex flex-col overflow-hidden relative z-10">
            <div className="absolute inset-0 pointer-events-none opacity-40 bg-[url('https://www.transparenttextures.com/patterns/rice-paper-2.png')]"></div>
            <button onClick={onClose} className="absolute top-4 right-5 z-50 p-2 text-bronze/40 hover:text-vermilion transition hover:rotate-90 duration-300"><X size={26}/></button>
            
            <div className="flex-1 overflow-y-auto overflow-x-hidden scrollbar-thin px-8 py-6 relative">
               {isEditing ? (
                 <div className="pb-8">
                    <h3 className="text-xl font-bold text-vermilion flex items-center gap-2 mb-6 border-b border-vermilion/20 pb-2"><Edit2 size={18}/> 润色谱牒</h3>
                    <div className="space-y-4">
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="text-xs text-bronze/60 block mb-1">姓名</label>
                          <input className="w-full bg-[#f8f1e0] border-b border-bronze/40 p-2 outline-none font-bold text-lg text-ink" value={formData.name !== undefined ? formData.name : member.name} onChange={e => setFormData({...formData, name: e.target.value})} />
                        </div>
                         <div>
                          <label className="text-xs text-bronze/60 block mb-1">礼位</label>
                          <select className="w-full bg-[#f8f1e0] border-b border-bronze/40 p-2 outline-none text-ink" value={formData.gender || member.gender} onChange={e => setFormData({...formData, gender: e.target.value as any})}>
                            <option value="male">乾 (男)</option>
                            <option value="female">坤 (女)</option>
                          </select>
                        </div>
                      </div>
                      <div>
                        <label className="text-xs text-bronze/60 block mb-1">连理配偶</label>
                        <input className="w-full bg-[#f8f1e0] border-b border-bronze/40 p-2 outline-none text-ink" value={formData.spouseName !== undefined ? formData.spouseName : (member.spouseName || '')} onChange={e => setFormData({...formData, spouseName: e.target.value})} />
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="text-xs text-bronze/60 block mb-1">诞辰</label>
                          <input type="date" className="w-full bg-[#f8f1e0] border-b border-bronze/40 p-2 outline-none text-ink" value={formData.birthDate !== undefined ? formData.birthDate : member.birthDate} onChange={e => setFormData({...formData, birthDate: e.target.value})} />
                        </div>
                        <div>
                          <label className="text-xs text-bronze/60 block mb-1">籍贯</label>
                          <input className="w-full bg-[#f8f1e0] border-b border-bronze/40 p-2 outline-none text-ink" value={formData.address !== undefined ? formData.address : member.address} onChange={e => setFormData({...formData, address: e.target.value})} />
                        </div>
                      </div>
                      <div>
                         <label className="flex items-center gap-2 text-ink font-bold py-2 cursor-pointer">
                            <input type="checkbox" className="accent-vermilion w-4 h-4" checked={formData.isHighlight !== undefined ? formData.isHighlight : member.isHighlight} onChange={e => setFormData({...formData, isHighlight: e.target.checked})} />
                            <span className="flex items-center gap-1"><Crown size={14} className="text-vermilion"/> 设为显赫宗亲 (立传)</span>
                         </label>
                      </div>
                      <div>
                        <label className="text-xs text-bronze/60 block mb-1">生平概述</label>
                        <textarea className="w-full bg-[#f8f1e0] border border-bronze/20 p-3 h-32 outline-none resize-none leading-relaxed text-ink" value={formData.biography !== undefined ? formData.biography : (member.biography || '')} onChange={e => setFormData({...formData, biography: e.target.value})} />
                      </div>
                      <div className="flex gap-4 pt-4">
                        <button onClick={handleSave} className="flex-1 bg-vermilion text-white py-2 rounded-full shadow hover:bg-vermilion/90 flex items-center justify-center gap-2"><Save size={16}/> 保存录入</button>
                        <button onClick={() => setIsEditing(false)} className="flex-1 border border-bronze text-bronze py-2 rounded-full hover:bg-white/50">取消</button>
                      </div>
                    </div>
                 </div>
               ) : (
                 <div className="flex flex-col gap-8 pb-6">
                    <div className="flex flex-col items-center text-center gap-3 pt-2 relative">
                       <div className={`w-20 h-20 rounded-full flex items-center justify-center bg-[#fcf8ed] shadow-sm relative ${member.isHighlight ? 'border-2 border-[#daa520] shadow-[0_0_15px_rgba(218,165,32,0.4)]' : 'border border-bronze/30'}`}>
                          {member.isHighlight && <div className="absolute -top-3 -right-2 text-[#daa520] animate-bounce"><Crown size={20} fill="currentColor"/></div>}
                          <span className={`text-4xl font-bold font-serif ${member.isHighlight ? 'text-[#b8860b]' : 'text-ink'}`}>{member.name.slice(0,1)}</span>
                       </div>
                       <div>
                          <h2 className="text-3xl font-bold text-ink mb-2 tracking-[0.2em] font-serif flex items-center justify-center gap-2">{member.name}</h2>
                          <div className="flex justify-center gap-4 text-xs text-bronze uppercase tracking-widest opacity-80">
                             <span>{member.gender === 'male' ? '乾 (男)' : '坤 (女)'}</span>
                             <span>•</span>
                             <span>{member.birthDate.split('-')[0]} 年生</span>
                             {member.spouseName && <><span>•</span><span>配 {member.spouseName}</span></>}
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
                                  const bio = await generateBiography(member, aiConfig);
                                  await onSave({ ...member, biography: bio });
                                } catch (e) {}
                                setLoadingAi(false);
                              }} disabled={loadingAi} className="text-[10px] text-bronze hover:text-vermilion flex items-center gap-1 transition-colors"><Sparkles size={12}/> {loadingAi ? '撰写中...' : 'AI 续写'}</button>
                            )}
                          </div>
                          <div className="text-sm leading-8 text-justify font-serif text-ink/80">
                             <MarkdownRenderer content={member.biography || "暂无详细记载。"} />
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
                             <input className="flex-1 bg-transparent border-b border-bronze/20 py-1 text-sm outline-none focus:border-bronze placeholder:text-bronze/30" placeholder={`欲知${member.name}何事...`} value={inquiry} onChange={e => setInquiry(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleAiInquiry()} />
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
                               {allMembers.filter(m => m.id !== member.id).map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                            </select>
                            <button 
                              onClick={async () => {
                                const target = allMembers.find(m => m.id === compareMemberId);
                                if (target) {
                                  setLoadingDeduction(true);
                                  setAiAnalysis("");
                                  try { setAiAnalysis(await analyzeRelationship(member, target, allMembers, analysisStyle, aiConfig)); } catch (e) {}
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
                       <div className="grid grid-cols-3 gap-2 mt-4 pt-4 border-t border-bronze/10 opacity-80 hover:opacity-100 transition px-2">
                          <button onClick={() => onAddChild(member.id)} className="text-bronze hover:text-vermilion text-xs flex flex-col items-center gap-1 group"><div className="p-2 bg-[#f8f1e0] rounded-full group-hover:bg-white transition"><UserPlus size={14}/></div>添子进孙</button>
                          <button onClick={() => { setFormData(member); setIsEditing(true); }} className="text-bronze hover:text-vermilion text-xs flex flex-col items-center gap-1 group"><div className="p-2 bg-[#f8f1e0] rounded-full group-hover:bg-white transition"><Edit2 size={14}/></div>润色谱牒</button>
                          <button onClick={() => onDelete(member.id)} className="text-bronze hover:text-vermilion text-xs flex flex-col items-center gap-1 group"><div className="p-2 bg-[#f8f1e0] rounded-full group-hover:bg-white transition"><Trash2 size={14}/></div>斩断此脉</button>
                       </div>
                    )}
                 </div>
               )}
            </div>
         </div>
         {/* Footer Decoration */}
         <div className="h-10 bg-gradient-to-t from-[#d4b483] to-[#f4ecd8] relative z-20 shadow-[0_-2px_10px_rgba(0,0,0,0.05)] border-t border-[#c8aa7a]/30 flex items-center justify-center">
            <div className="w-1/3 h-[2px] bg-[#a67c52]/20 rounded-full"></div>
         </div>
      </div>
    </div>
  );
};

export default DetailsModal;