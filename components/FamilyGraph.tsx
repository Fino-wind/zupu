import React, { useEffect, useRef, useState, useCallback, memo, useMemo } from 'react';
import * as d3 from 'd3';
import { FamilyMember } from '../types';
import { Network, User, Crown, Plus, X } from 'lucide-react';

interface FamilyGraphProps {
  data: FamilyMember[];
  onSelectMember: (member: FamilyMember) => void;
  selectedId: string | null;
  familySurname?: string;
  onDeselect: () => void;
  isAdmin?: boolean;
  onAddChild?: (parentId: string) => void;
  onAddParent?: (childId: string) => void;
  onDelete?: (id: string) => void;
}

interface GraphNode {
  id: string;
  x: number;
  y: number;
  data: FamilyMember;
  depth?: number;
}

// eslint-disable-next-line
export const toChineseNum = (num: number) => {
  const chars = ['零','一','二','三','四','五','六','七','八','九'];
  if (num === 1) return '大'; 
  if (num <= 9) return chars[num];
  return num.toString();
};

// eslint-disable-next-line
export const getSiblingRank = (person: FamilyMember, allMembers: FamilyMember[]) => {
  if (!person.parentId) return 1;
  const siblings = allMembers.filter(m => m.parentId === person.parentId && m.gender === person.gender);
  siblings.sort((a, b) => new Date(a.birthDate).getTime() - new Date(b.birthDate).getTime());
  return siblings.findIndex(m => m.id === person.id) + 1;
};

// --- 重构版亲缘关系计算：路径溯源法 (Path Tracing) ---
// eslint-disable-next-line
export const calculateRelationshipLabel = (target: FamilyMember, center: FamilyMember, allMembers: FamilyMember[]): string | null => {
  if (target.id === center.id) return '本尊';

  const memberMap = new Map(allMembers.map(m => [m.id, m]));

  const getAncestryPath = (m: FamilyMember): string[] => {
    const path = [m.id];
    let curr = m;
    while (curr.parentId && memberMap.has(curr.parentId)) {
      curr = memberMap.get(curr.parentId)!;
      path.push(curr.id);
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

  // 1: 直系长辈 (up > 0, down = 0)
  if (down === 0) {
    if (up === 1) return '父亲'; 
    if (up === 2) return '祖父';
    if (up === 3) return '曾祖';
    if (up === 4) return '高祖';
    return `${up}世祖`;
  }

  // 2: 直系晚辈 (up = 0, down > 0)
  if (up === 0) {
    if (down === 1) {
      const rank = getSiblingRank(target, allMembers);
      const rankStr = rank === 1 ? '长' : toChineseNum(rank);
      return target.gender === 'female' ? `${rankStr}女` : `${rankStr}子`;
    }
    if (down === 2) return target.gender === 'female' ? '孙女' : '孙子';
    return `${down}世孙`;
  }

  // 3: 亲兄弟姐妹 (up = 1, down = 1) 
  if (up === 1 && down === 1) {
    const rank = getSiblingRank(target, allMembers);
    const rankStr = toChineseNum(rank);
    const isOlder = new Date(target.birthDate) < new Date(center.birthDate);
    if (target.gender === 'male') return isOlder ? `${rankStr}兄` : `${rankStr}弟`;
    return isOlder ? `${rankStr}姐` : `${rankStr}妹`;
  }

  // 4: 叔伯/姑 (up = 2, down = 1)
  if (up === 2 && down === 1) {
    const rank = getSiblingRank(target, allMembers);
    const rankStr = toChineseNum(rank);
    const fatherId = center.parentId!;
    const father = memberMap.get(fatherId);
    if (target.gender === 'male') {
      if (father && new Date(target.birthDate) < new Date(father.birthDate)) {
        return `${rankStr}伯`;
      }
      return `${rankStr}叔`;
    }
    return `${rankStr}姑`;
  }

  // 5: 侄子/侄女 (up = 1, down = 2)
  if (up === 1 && down === 2) {
    return target.gender === 'male' ? '侄子' : '侄女';
  }

  // 6: 堂/表兄弟姐妹 (up = 2, down = 2)
  if (up === 2 && down === 2) {
    const isOlder = new Date(target.birthDate) < new Date(center.birthDate);
    const suffix = target.gender === 'male' 
      ? (isOlder ? '兄' : '弟') 
      : (isOlder ? '姐' : '妹');
    return `堂${suffix}`;
  }

  return '族亲';
};

// eslint-disable-next-line
export const calculateAge = (birthDate: string): number | string => {
  if (!birthDate) return '';
  const birth = new Date(birthDate);
  const now = new Date();
  let age = now.getFullYear() - birth.getFullYear();
  const m = now.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < birth.getDate())) age--;
  return age;
};

// 子组件
const DraggableNode = memo(({ 
  node, 
  isSelected, 
  onDrag, 
  onSelect,
  relationLabel,
  isAdmin,
  onAddChild,
  onAddParent,
  onDelete
}: { 
  node: GraphNode; 
  isSelected: boolean; 
  onDrag: (id: string, x: number, y: number) => void;
  onSelect: (member: FamilyMember) => void;
  relationLabel: string | null;
  isAdmin?: boolean;
  onAddChild?: (id: string) => void;
  onAddParent?: (id: string) => void;
  onDelete?: (id: string) => void;
}) => {
  const nodeRef = useRef<HTMLDivElement>(null);
  const dragInitialized = useRef(false);
  const propsRef = useRef({ node, onDrag, onSelect });
  propsRef.current = { node, onDrag, onSelect };
  const [isDragging, setIsDragging] = useState(false);

  useEffect(() => {
    if (!nodeRef.current || dragInitialized.current) return;
    const element = d3.select(nodeRef.current);
    
    let startX = 0;
    let startY = 0;
    let hasMoved = false;

    const dragBehavior = d3.drag<HTMLDivElement, unknown>()
      .subject(() => ({ x: propsRef.current.node.x, y: propsRef.current.node.y })) 
      .on("start", (event) => {
        // 重要：阻止事件冒泡，防止D3的mousedown传到背景层触发onDeselect
        event.sourceEvent.stopPropagation();
        
        startX = event.x;
        startY = event.y;
        hasMoved = false;

        element.raise(); 
        element.classed("cursor-grabbing", true);
        setIsDragging(true);
      })
      .on("drag", (event) => {
        if (Math.abs(event.x - startX) > 3 || Math.abs(event.y - startY) > 3) {
           hasMoved = true;
           propsRef.current.onDrag(propsRef.current.node.id, event.x, event.y);
        }
      })
      .on("end", (event) => {
        // 同样在end阶段阻止冒泡
        event.sourceEvent.stopPropagation();
        
        element.classed("cursor-grabbing", false);
        setIsDragging(false);

        if (!hasMoved) {
           propsRef.current.onSelect(propsRef.current.node.data);
        }
      });

    element.call(dragBehavior);
    dragInitialized.current = true;
    return () => { element.on(".drag", null); dragInitialized.current = false; };
  }, []);

  const isFemale = node.data.gender === 'female';
  const hasSpouse = !!node.data.spouseName;
  const age = calculateAge(node.data.birthDate);
  const generation = (node.depth || 0) + 1;
  const isHighlight = node.data.isHighlight;

  return (
    <div
      ref={nodeRef}
      // 显式阻止 React 的 onClick 冒泡，确保 React 事件系统也不会穿透到背景
      onClick={(e) => e.stopPropagation()}
      className={`absolute flex flex-col items-center justify-center p-4 scroll-node transition-all duration-300 cursor-grab group
        ${isSelected ? 'z-50 scale-110' : 'z-20 opacity-95 hover:opacity-100 hover:shadow-xl'}
        ${isHighlight 
            ? 'border-[#daa520] shadow-[0_0_30px_rgba(218,165,32,0.6)] bg-gradient-to-br from-[#fffdf5] to-[#fceeb5]' 
            : isSelected ? 'border-vermilion shadow-[0_0_35px_rgba(178,34,34,0.5)]' : 'border-[#a67c52]'}
        ${relationLabel && !isSelected ? 'border-vermilion/40 shadow-[0_0_15px_rgba(178,34,34,0.1)]' : ''}
        ${isDragging ? 'scale-105 shadow-2xl' : ''}
      `}
      style={{
        transform: `translate(${node.x}px, ${node.y}px) translate(-50%, -50%)`,
        width: hasSpouse ? '200px' : '120px', 
        minHeight: '220px', 
        left: 0, top: 0,
        borderWidth: isHighlight ? '2px' : '1px',
      }}
    >
      {/* 皇冠图标 - 仅显赫人物显示 */}
      {isHighlight && (
        <div className="absolute -top-4 -right-4 z-50 animate-in zoom-in duration-500 delay-100">
           <div className="bg-[#daa520] text-white p-1.5 rounded-full shadow-lg border-2 border-white">
              <Crown size={16} fill="currentColor" />
           </div>
        </div>
      )}

      {/* --- n8n-style Editor Handles (Admin Only) --- */}
      {isAdmin && (
        <>
           {/* Top Handle: Trace Parent (Only if no parent or we want to allow re-parenting visually) */}
           {(!node.data.parentId || node.data.parentId === 'synthetic-root') && (
             <button 
               onMouseDown={(e) => e.stopPropagation()} // Prevent D3 Drag
               onPointerDown={(e) => e.stopPropagation()} // Prevent D3 Drag (Touch/Pointer)
               onClick={(e) => { e.stopPropagation(); onAddParent?.(node.data.id); }}
               className="absolute -top-3 left-1/2 -translate-x-1/2 w-6 h-6 rounded-full bg-bronze text-white flex items-center justify-center shadow-md hover:bg-vermilion hover:scale-125 transition-all z-[60] opacity-0 group-hover:opacity-100 border border-white"
               title="追溯先祖"
             >
                <Plus size={14} />
             </button>
           )}

           {/* Bottom Handle: Add Child */}
           <button 
             onMouseDown={(e) => e.stopPropagation()} // Prevent D3 Drag
             onPointerDown={(e) => e.stopPropagation()} // Prevent D3 Drag (Touch/Pointer)
             onClick={(e) => { e.stopPropagation(); onAddChild?.(node.data.id); }}
             className="absolute -bottom-3 left-1/2 -translate-x-1/2 w-6 h-6 rounded-full bg-bronze text-white flex items-center justify-center shadow-md hover:bg-vermilion hover:scale-125 transition-all z-[60] opacity-0 group-hover:opacity-100 border border-white"
             title="延续血脉"
           >
              <Plus size={14} />
           </button>

           {/* Corner Handle: Delete */}
           <button 
             onMouseDown={(e) => e.stopPropagation()} // Prevent D3 Drag
             onPointerDown={(e) => e.stopPropagation()} // Prevent D3 Drag (Touch/Pointer)
             onClick={(e) => { e.stopPropagation(); onDelete?.(node.data.id); }}
             className="absolute -top-2 -right-2 w-5 h-5 rounded-full bg-vermilion text-white flex items-center justify-center shadow-md hover:bg-red-700 hover:scale-110 transition-all z-[60] opacity-0 group-hover:opacity-100 border border-white"
             title="斩断此脉"
           >
              <X size={12} />
           </button>
        </>
      )}

      {relationLabel && !isSelected && (
        <div className="absolute -top-3 -right-3 z-50 animate-in zoom-in duration-300 pointer-events-none">
          <div className="bg-vermilion text-white text-[10px] font-bold px-2 py-1 rounded-full shadow-md border border-white flex items-center gap-1">
            <User size={8} fill="currentColor"/>
            {relationLabel}
          </div>
        </div>
      )}
      <div className={`absolute -top-1 left-0 right-0 h-1 rounded-full opacity-40 ${isHighlight ? 'bg-[#daa520]' : 'bg-[#4d3326]'}`}></div>
      <div className={`absolute -bottom-1 left-0 right-0 h-1 rounded-full opacity-40 ${isHighlight ? 'bg-[#daa520]' : 'bg-[#4d3326]'}`}></div>
      <div className="absolute top-2 left-2 text-[9px] text-bronze/60 border border-bronze/10 px-1 rounded bg-white/50 font-serif">
         {generation}世
      </div>
      <div className="flex justify-center items-center gap-4 flex-1 w-full pointer-events-none mt-2">
        {hasSpouse && (
          <div className="writing-v text-center h-32 flex items-center justify-center opacity-80 border-l border-bronze/20 pl-2">
             <div className="text-[9px] text-vermilion mb-1 font-serif">配偶</div>
             <h3 className="text-lg font-bold text-ink/80 leading-none tracking-[0.2em] font-serif">{node.data.spouseName}</h3>
          </div>
        )}
        {hasSpouse && <div className="h-24 w-px bg-bronze/30"></div>}
        <div className="writing-v text-center h-36 flex items-center justify-center">
          <h3 className={`text-2xl font-bold leading-none tracking-[0.4em] font-serif ${isHighlight ? 'text-[#8b5a00] scale-110 drop-shadow-sm' : 'text-ink'}`}>{node.data.name}</h3>
        </div>
      </div>
      <div className="border-t border-bronze/40 w-full mt-2 pt-2 text-center pointer-events-none">
         <p className="text-[10px] text-ink/70 mb-1 flex justify-center gap-2">
            <span>{node.data.birthDate.split('-')[0]}生</span>
            {age && <span>{age}岁</span>}
         </p>
         <div className={`text-[9px] px-2 py-0.5 inline-block rounded-sm ${isFemale ? 'bg-vermilion/5 text-vermilion border border-vermilion/20' : 'bg-ink/5 text-ink border border-ink/10'}`}>
            {node.data.gender === 'male' ? '乾 (男)' : node.data.gender === 'female' ? '坤 (女)' : '未知'}
         </div>
      </div>
      <div className={`absolute bottom-1 right-1 w-3 h-3 border-r border-b pointer-events-none ${isHighlight ? 'border-[#daa520]' : 'border-vermilion/40'}`}></div>
      <div className={`absolute top-1 left-1 w-3 h-3 border-l border-t pointer-events-none ${isHighlight ? 'border-[#daa520]' : 'border-vermilion/40'}`}></div>
    </div>
  );
});

const FamilyGraph: React.FC<FamilyGraphProps> = ({ 
  data, 
  onSelectMember, 
  selectedId, 
  familySurname = "袁", 
  onDeselect,
  isAdmin,
  onAddChild,
  onAddParent,
  onDelete
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  
  const [nodes, setNodes] = useState<GraphNode[]>([]);
  const [transform, setTransform] = useState({ x: 0, y: 0, k: 0.6 });
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });

  const selectedMember = useMemo(() => 
    data.find(m => m.id === selectedId) || null, 
  [data, selectedId]);

  useEffect(() => {
    const updateSize = () => {
      if (containerRef.current) {
        setDimensions({
          width: containerRef.current.clientWidth,
          height: containerRef.current.clientHeight
        });
      }
    };
    window.addEventListener('resize', updateSize);
    updateSize();
    return () => window.removeEventListener('resize', updateSize);
  }, []);

  const calculateLayout = useCallback((forceResetView = false) => {
    if (!data.length || !containerRef.current) return;

    const activeData = data; 
    const dataMap = new Map(activeData.map(d => [d.id, d]));
    const roots = activeData.filter(d => !d.parentId || !dataMap.has(d.parentId));
    
    let processedData = [...activeData];
    if (roots.length > 1) {
      processedData.push({
        id: 'synthetic-root',
        name: '万脉归宗',
        birthDate: '',
        isMarried: false,
        address: '',
        gender: 'other',
        parentId: null
      });
      processedData = processedData.map(d => {
        if (roots.some(r => r.id === d.id)) return { ...d, parentId: 'synthetic-root' };
        return d;
      });
    } else if (roots.length === 0 && activeData.length > 0) {
      return;
    }

    try {
      const stratify = d3.stratify<FamilyMember>().id(d => d.id).parentId(d => d.parentId);
      const root = stratify(processedData);

      root.each((node) => {
        if (node.children) {
          const males = node.children.filter(n => n.data.gender === 'male');
          const females = node.children.filter(n => n.data.gender !== 'male');
          males.sort((a, b) => new Date(a.data.birthDate).getTime() - new Date(b.data.birthDate).getTime());
          females.sort((a, b) => new Date(a.data.birthDate).getTime() - new Date(b.data.birthDate).getTime());
          const halfFemales = Math.floor(females.length / 2);
          node.children = [...females.slice(0, halfFemales), ...males, ...females.slice(halfFemales)];
        }
      });

      const treeLayout = d3.tree<FamilyMember>().nodeSize([280, 400]); 
      treeLayout(root);

      const newNodes: GraphNode[] = [];
      root.descendants().forEach(d => {
        if (d.id !== 'synthetic-root') {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const nodeWithPos = d as any;
          newNodes.push({ 
            id: d.data.id,
            x: nodeWithPos.x,  
            y: nodeWithPos.y, 
            data: d.data,
            depth: d.depth - (roots.length > 1 ? 1 : 0)
          });
        }
      });
      
      setNodes(newNodes);

      if (forceResetView && svgRef.current && newNodes.length > 0) {
        const svg = d3.select(svgRef.current);
        const zoom = d3.zoom().on("zoom", (e) => setTransform(e.transform));
        
        // --- 智能居中算法 ---
        const minX = d3.min(newNodes, n => n.x) || 0;
        const maxX = d3.max(newNodes, n => n.x) || 0;
        const minY = d3.min(newNodes, n => n.y) || 0;
        const maxY = d3.max(newNodes, n => n.y) || 0;

        const graphWidth = maxX - minX + 400; // 加上 padding
        const graphHeight = maxY - minY + 600;

        const { width: containerWidth, height: containerHeight } = dimensions;
        
        // 计算最适合的缩放比例 (限制最大 0.8, 最小 0.1)
        const scale = Math.min(0.8, Math.max(0.1, Math.min(containerWidth / graphWidth, containerHeight / graphHeight)));
        
        // 计算平移量，使图表中心与容器中心对齐
        const centerX = (minX + maxX) / 2;
        const centerY = (minY + maxY) / 2;
        
        const initialTransform = d3.zoomIdentity
          .translate(containerWidth / 2, containerHeight / 2)
          .scale(scale)
          .translate(-centerX, -centerY);

        // @ts-expect-error D3 types mismatch
        svg.transition().duration(750).call(zoom.transform, initialTransform);
      }

    } catch (e) {
      console.error("Layout Error:", e);
    }
  }, [data, dimensions]);

  // 初始化布局
  useEffect(() => {
    if (data.length > 0 && dimensions.width > 0) {
       // 首次加载或尺寸变化时，强制归位
       calculateLayout(true);
    }
  }, [data, dimensions, calculateLayout]);

  useEffect(() => {
    if (!svgRef.current || !dimensions.width) return;
    const svg = d3.select(svgRef.current);
    const zoom = d3.zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.1, 3])
      .on("zoom", (event) => setTransform(event.transform));

    svg.call(zoom);
    return () => { svg.on(".zoom", null); };
  }, [dimensions]);

  const handleNodeDrag = useCallback((id: string, x: number, y: number) => {
    setNodes(prev => prev.map(n => n.id === id ? { ...n, x, y } : n));
  }, []);

  const renderLinks = () => {
    const activeIds = new Set(nodes.map(n => n.id));
    const links: React.ReactElement[] = [];

    nodes.forEach(node => {
      if (node.data.parentId && activeIds.has(node.data.parentId)) {
        const parent = nodes.find(n => n.id === node.data.parentId);
        if (parent) {
          const sx = parent.x;
          const sy = parent.y + 110;
          const tx = node.x;
          const ty = node.y - 110;
          const dist = (ty - sy) * 0.5;
          const pathData = `M ${sx} ${sy} C ${sx} ${sy + dist}, ${tx} ${ty - dist}, ${tx} ${ty}`;
          
          links.push(
            <g key={`${parent.id}-${node.id}`}>
              <path d={pathData} fill="none" stroke="#a67c52" strokeWidth="6" strokeOpacity="0.15" />
              <path d={pathData} fill="none" stroke="#5c4033" strokeWidth="2" className="ink-path" />
              <circle cx={sx} cy={sy} r="3" fill="#5c4033" />
              <circle cx={tx} cy={ty} r="3" fill="#5c4033" />
            </g>
          );
        }
      }
    });
    return links;
  };

  return (
    <div ref={containerRef} className="w-full h-full relative overflow-hidden bg-parchment-texture select-none">
      {/* 
        独立背景层：专门用于接收点击并触发取消选中。
        由于它位于 z-0，而节点位于 z-20，且节点阻止了冒泡，因此点击节点不会触发这里。
      */}
      <div 
        className="absolute inset-0 pointer-events-auto cursor-default z-0" 
        style={{ backgroundImage: 'radial-gradient(#a67c52 1px, transparent 1px)', backgroundSize: '20px 20px', opacity: 0.15 }}
        onClick={onDeselect}
      ></div>
      
      <div className="absolute inset-0 bg-clouds pointer-events-none z-0"></div>
      
      <button 
        onClick={() => calculateLayout(true)}
        className="absolute bottom-28 right-4 z-20 bg-white/80 backdrop-blur border border-bronze/30 p-2 rounded-full shadow-lg text-bronze hover:text-vermilion hover:bg-white transition-all flex items-center gap-2 group pointer-events-auto"
        title="天道归位 (自动整理连线并居中)"
      >
        <Network size={20} className="group-hover:rotate-45 transition-transform"/>
      </button>

      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 opacity-[0.25] mix-blend-multiply pointer-events-none select-none flex flex-col items-center z-0" style={{ transform: `translate(-50%, -50%) scale(${transform.k})` }}>
         <span className="text-[650px] md:text-[850px] font-bold text-vermilion leading-none watermark-text filter blur-[1px] drop-shadow-[0_0_20px_rgba(178,34,34,0.2)]" style={{ fontFamily: '"Ma Shan Zheng", cursive' }}>{familySurname}</span>
      </div>

      <div className="absolute w-full h-full origin-top-left z-10 pointer-events-none" style={{ transform: `translate(${transform.x}px, ${transform.y}px) scale(${transform.k})` }}>
        <svg ref={svgRef} className="absolute -top-[5000px] -left-[5000px] w-[10000px] h-[10000px] overflow-visible pointer-events-none">
          <g transform={`translate(5000, 5000)`}>{renderLinks()}</g>
        </svg>

        {nodes.map((node) => {
          const relation = selectedMember ? calculateRelationshipLabel(node.data, selectedMember, data) : null;
          return (
            <div key={node.id} className="pointer-events-auto">
              <DraggableNode 
                node={node}
                isSelected={selectedId === node.data.id}
                relationLabel={relation}
                onDrag={handleNodeDrag}
                onSelect={onSelectMember}
                isAdmin={isAdmin}
                onAddChild={onAddChild}
                onAddParent={onAddParent}
                onDelete={onDelete}
              />
            </div>
          );
        })}
      </div>
      
      <div className="absolute top-4 left-4 w-20 h-20 border-t-4 border-l-4 border-bronze opacity-20 pointer-events-none z-0"></div>
      <div className="absolute bottom-4 right-4 w-20 h-20 border-b-4 border-r-4 border-bronze opacity-20 pointer-events-none z-0"></div>
    </div>
  );
};

export default FamilyGraph;