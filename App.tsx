import React, { useState, useMemo, useEffect } from 'react';
import { FamilyMember } from './types';
import FamilyGraph from './components/FamilyGraph';
import DetailsModal from './components/DetailsModal';
import { useGenealogy } from './hooks/useGenealogy';
import { 
  Plus, Trash2, Edit2, Save, Upload, Sparkles, 
  Heart, Lock, Unlock, ShieldCheck, Send, MessageCircle, 
  X, Layout, Key, Loader2, AlertTriangle, ArchiveRestore, 
  Settings, MapPin, BookOpen, User, Crown, ArrowUpCircle,
  Fingerprint, Bell, Scroll, UserPlus
} from 'lucide-react';
import { AISettings, testConnection } from './services/geminiService';

const App: React.FC = () => {
  // Use Custom Hook for Data Logic
  const { 
    members, 
    activeMembers, 
    deletedMembers, 
    isLoading, 
    saveMember, 
    deleteMemberNodes, 
    restoreMemberNode,
    refresh 
  } = useGenealogy();

  // Local UI State
  const [selectedMemberId, setSelectedMemberId] = useState<string | null>(null);
  const [isDetailsOpen, setIsDetailsOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isRecycleBinOpen, setIsRecycleBinOpen] = useState(false);
  const [startEditing, setStartEditing] = useState(false);
  
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

  const [notification, setNotification] = useState<{message: string, type: 'info' | 'error'} | null>(null);
  const [deleteModal, setDeleteModal] = useState<{isOpen: boolean, memberId: string | null, memberName: string}>({
    isOpen: false, memberId: null, memberName: ''
  });

  // API测试状态
  const [testingConnection, setTestingConnection] = useState(false);
  const [testResult, setTestResult] = useState<{success: boolean; message: string} | null>(null);

  const selectedMember = useMemo(() => members.find(m => m.id === selectedMemberId) || null, [members, selectedMemberId]);

  const generateId = () => `M-${Date.now()}-${Math.floor(Math.random() * 10000)}`;

  // Save config changes
  useEffect(() => { localStorage.setItem('familySurname', familySurname); }, [familySurname]);
  useEffect(() => { localStorage.setItem('adminPassphrase', adminPassphrase); }, [adminPassphrase]);

  // Set default surname if loaded from data
  useEffect(() => {
    if (activeMembers.length > 0 && familySurname === "袁") {
      const root = activeMembers.find(m => !m.parentId);
      if (root && root.name) {
        // Only set if we are still on default
      }
    }
  }, [activeMembers, familySurname]);

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

  const handleTestConnection = async () => {
    setTestingConnection(true);
    setTestResult(null);

    try {
      const result = await testConnection(aiConfig);
      setTestResult(result);

      if (result.success) {
        showToast("连接测试成功！", "info");
      } else {
        showToast("连接测试失败：" + result.message, "error");
      }
    } catch (error) {
      setTestResult({ success: false, message: "测试连接时出错" });
      showToast("连接测试失败", "error");
    } finally {
      setTestingConnection(false);
    }
  };

  const onSelect = (m: FamilyMember) => {
    if (selectedMemberId === m.id) {
      setIsDetailsOpen(true);
    } else {
      setSelectedMemberId(m.id);
      setStartEditing(false);
      setIsDetailsOpen(false); 
    }
  };

  const onDeselect = () => {
    if (selectedMemberId === null) return;
    setSelectedMemberId(null);
    setStartEditing(false);
    setIsDetailsOpen(false);
  };

  const executeDelete = async () => {
    if (!deleteModal.memberId) return;
    await deleteMemberNodes(deleteModal.memberId);
    if (selectedMemberId === deleteModal.memberId) {
      setSelectedMemberId(null);
      setIsDetailsOpen(false);
    }
    setDeleteModal({ isOpen: false, memberId: null, memberName: '' });
    showToast("已斩断血脉，移至宗祠秘档");
  };

  const handleAddChildNode = (parentId: string) => {
    const newId = generateId();
    const parent = members.find(m => m.id === parentId);
    const newMember: FamilyMember = { 
      id: newId, name: "新成员", birthDate: "", isMarried: false, 
      address: parent ? parent.address : "", gender: "male", parentId: parentId, isDeleted: false 
    };
    
    // Do not await here to ensure UI updates immediately (Optimistic UI)
    // The hook handles the async API call in background
    saveMember(newMember);
    
    setSelectedMemberId(newId);
    setStartEditing(true); 
    setIsDetailsOpen(true);
  };

  const handleAddParentNode = (childId: string) => {
    const child = members.find(m => m.id === childId);
    if (!child) return;
    const newId = generateId();
    const newAncestor: FamilyMember = { 
      id: newId, name: "先祖讳名", birthDate: "", isMarried: false, 
      address: child.address, gender: "male", parentId: child.parentId, isDeleted: false 
    };
    const updatedChild = { ...child, parentId: newId };

    // Do not await
    saveMember(newAncestor);
    saveMember(updatedChild);

    setSelectedMemberId(newId);
    setStartEditing(true); 
    setIsDetailsOpen(true);
  };

  const handleDeleteNode = (id: string) => {
    const member = members.find(m => m.id === id);
    if (member) setDeleteModal({ isOpen: true, memberId: id, memberName: member.name });
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
                        // Batch save for robustness
                        for (const m of importedMembers) { await saveMember(m); }
                        refresh();
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

      <DetailsModal 
        key={selectedMemberId || 'details-modal'} // Use a default key to prevent errors when null
        member={selectedMember}
        isOpen={isDetailsOpen}
        onClose={() => {
          setIsDetailsOpen(false);
          setStartEditing(false); // Reset editing trigger on close
        }}
        allMembers={activeMembers}
        isAdmin={isAdmin}
        aiConfig={aiConfig}
        onSave={saveMember}
        onAddChild={handleAddChildNode}
        onDelete={handleDeleteNode}
        initialIsEditing={startEditing}
      />

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
                   {/* 测试连接按钮和结果 */}
                   <div className="pt-2 border-t border-bronze/10">
                     <button
                       onClick={handleTestConnection}
                       disabled={testingConnection || !aiConfig.apiKey}
                       className="w-full flex items-center justify-center gap-2 py-2 rounded-sm text-xs font-bold border-2 transition ${
                         testingConnection
                           ? 'border-bronze/30 text-bronze/50 cursor-not-allowed'
                           : 'border-bronze text-bronze hover:bg-bronze hover:text-white'
                       }"
                     >
                       {testingConnection ? (
                         <>
                           <Loader2 size={14} className="animate-spin" />
                           <span>测试中...</span>
                         </>
                       ) : (
                         <>
                           <Sparkles size={14} />
                           <span>测试API连接</span>
                         </>
                       )}
                     </button>
                     {testResult && (
                       <div className={`mt-2 p-2 rounded text-[10px] text-center ${
                         testResult.success
                           ? 'bg-green-50 border border-green-200 text-green-700'
                           : 'bg-red-50 border border-red-200 text-red-700'
                       }`}>
                         {testResult.success ? '✓ ' : '✗ '}
                         {testResult.message}
                       </div>
                     )}
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
                        <button onClick={() => restoreMemberNode(m.id)} className="bg-bronze text-white px-3 py-1 text-xs rounded hover:bg-vermilion transition-colors">恢复</button>
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