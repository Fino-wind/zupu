import { ArchiveRestore, Crown, GitBranchPlus, Search, Users } from 'lucide-react';
import { FamilyMember } from '../types';

interface FamilyOverviewPanelProps {
  deletedCount: number;
  highlightCount: number;
  locale: 'zh' | 'en';
  /** 搜索结果，仅用于下方的候选列表；数量受关键词与上限影响，不代表族谱规模 */
  members: FamilyMember[];
  /** 在谱成员总数。必须独立于 members——后者是搜索结果，没搜索时为空 */
  totalCount: number;
  onQueryChange: (value: string) => void;
  onSelectMember: (member: FamilyMember) => void;
  query: string;
  rootCount: number;
  t: (zh: string, en: string) => string;
}

const FamilyOverviewPanel = ({
  deletedCount,
  highlightCount,
  locale,
  members,
  totalCount,
  onQueryChange,
  onSelectMember,
  query,
  rootCount,
  t,
}: FamilyOverviewPanelProps) => {
  const hasQuery = query.trim().length > 0;

  return (
    <aside className='glass-panel pointer-events-auto w-full max-w-xs rounded-2xl border-bronze/30 bg-parchment-light/95 px-4 py-4 shadow-2xl'>
      <div className='flex items-start justify-between gap-3'>
        <div>
          <div className='toolbar-chip w-fit'>{t('族谱概览', 'Family Overview')}</div>
          <h2 className='mt-3 text-lg font-bold tracking-[0.2em] text-ink'>
            {t('宗脉检索', 'Branch Search')}
          </h2>
        </div>
        <div className='rounded-full border border-bronze/20 bg-white/70 p-2 text-bronze shadow-sm'>
          <Search size={14} />
        </div>
      </div>

      <div className='mt-4 grid grid-cols-2 gap-2 text-[11px] text-ink/80'>
        <div className='rounded-2xl border border-bronze/10 bg-white/50 px-3 py-2'>
          <div className='flex items-center gap-2 text-bronze'>
            <Users size={12} /> {t('在谱宗亲', 'Members')}
          </div>
          <div className='mt-2 text-xl font-bold text-ink'>{totalCount}</div>
        </div>
        <div className='rounded-2xl border border-bronze/10 bg-white/50 px-3 py-2'>
          <div className='flex items-center gap-2 text-bronze'>
            <Crown size={12} /> {t('显赫宗亲', 'Highlights')}
          </div>
          <div className='mt-2 text-xl font-bold text-ink'>{highlightCount}</div>
        </div>
        <div className='rounded-2xl border border-bronze/10 bg-white/50 px-3 py-2'>
          <div className='flex items-center gap-2 text-bronze'>
            <GitBranchPlus size={12} /> {t('支脉根节点', 'Root Lines')}
          </div>
          <div className='mt-2 text-xl font-bold text-ink'>{rootCount}</div>
        </div>
        <div className='rounded-2xl border border-bronze/10 bg-white/50 px-3 py-2'>
          <div className='flex items-center gap-2 text-bronze'>
            <ArchiveRestore size={12} /> {t('封存宗亲', 'Archived')}
          </div>
          <div className='mt-2 text-xl font-bold text-ink'>{deletedCount}</div>
        </div>
      </div>

      <div className='mt-4 rounded-2xl border border-bronze/10 bg-white/55 p-3'>
        <label className='mb-2 block text-[10px] font-bold uppercase tracking-[0.25em] text-bronze'>
          {t('按姓名或籍贯检索', 'Find by name or address')}
        </label>
        <input
          className='field-shell bg-white/80'
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
          placeholder={t('如：袁氏始祖 / 祖籍地', 'e.g. Founder / Homeland')}
        />
      </div>

      <div className='mt-4 max-h-56 space-y-2 overflow-y-auto pr-1 scrollbar-thin'>
        {hasQuery ? (
          members.length > 0 ? (
            members.map((member) => (
              <button
                key={member.id}
                onClick={() => onSelectMember(member)}
                className='flex w-full items-center justify-between gap-3 rounded-2xl border border-bronze/10 bg-white/55 px-3 py-2 text-left transition hover:border-vermilion/30 hover:bg-white'
              >
                <div>
                  <div className='font-bold text-ink'>{member.name}</div>
                  <div className='mt-1 text-[11px] text-bronze/70'>
                    {member.address || t('籍贯未录', 'Location unavailable')}
                  </div>
                </div>
                <div className='text-[10px] text-bronze/70'>
                  {member.birthDate
                    ? locale === 'en'
                      ? member.birthDate.split('-')[0]
                      : `${member.birthDate.split('-')[0]}年`
                    : t('未详', 'Unknown')}
                </div>
              </button>
            ))
          ) : (
            <div className='rounded-2xl border border-dashed border-bronze/20 bg-white/40 px-3 py-6 text-center text-xs text-bronze/70'>
              {t('未检索到匹配宗亲', 'No matching members found')}
            </div>
          )
        ) : (
          <div className='rounded-2xl border border-dashed border-bronze/20 bg-white/40 px-3 py-6 text-center text-xs leading-6 text-bronze/70'>
            {t(
              '输入姓名、籍贯或显赫人物线索，可快速跳转至成员详情。',
              'Search by name, address, or notable members for quick navigation.'
            )}
          </div>
        )}
      </div>
    </aside>
  );
};

export default FamilyOverviewPanel;
