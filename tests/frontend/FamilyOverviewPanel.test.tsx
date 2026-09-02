import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import FamilyOverviewPanel from '../../components/FamilyOverviewPanel';
import { FamilyMember } from '../../types';

const t = (zh: string) => zh;

const member = (id: string, name: string): FamilyMember => ({
  id,
  name,
  birthDate: '',
  isMarried: false,
  address: '',
  gender: 'male',
  parentId: null,
  spouseId: null,
  biography: '',
  isDeleted: false,
  isHighlight: false,
});

const renderPanel = (props: Partial<React.ComponentProps<typeof FamilyOverviewPanel>> = {}) =>
  render(
    <FamilyOverviewPanel
      deletedCount={0}
      highlightCount={3}
      locale='zh'
      members={[]}
      onQueryChange={vi.fn()}
      onSelectMember={vi.fn()}
      query=''
      rootCount={1}
      t={t}
      totalCount={5}
      {...props}
    />
  );

describe('FamilyOverviewPanel 的「在谱宗亲」', () => {
  it('没有搜索时也应显示真实总数，而不是 0', () => {
    // 回归测试：曾经这里显示的是 members.length，而 members 是搜索结果，
    // 没搜索时为空数组 —— 于是 5 个人的族谱在面板上显示「在谱宗亲 0」。
    renderPanel({ members: [], query: '', totalCount: 5 });
    const label = screen.getByText('在谱宗亲');
    expect(label.closest('div')?.parentElement?.textContent).toContain('5');
  });

  it('搜索时显示的仍是总数，不是命中条数', () => {
    // 搜索结果只有 1 条，但族谱仍有 5 人；显示 1 会让人以为族谱只剩一个人
    renderPanel({ members: [member('m1', '袁公')], query: '爷爷', totalCount: 5 });
    const label = screen.getByText('在谱宗亲');
    const card = label.closest('div')?.parentElement;
    expect(card?.textContent).toContain('5');
    expect(card?.textContent).not.toContain('1');
  });
});
