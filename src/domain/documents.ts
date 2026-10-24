import type { DocumentKind, DocumentRecord } from './types';

export const DOC_KIND_LABEL: Record<DocumentKind, { zh: string; en: string; prefix: string }> = {
  working_paper: { zh: '工作文件', en: 'Working Paper', prefix: 'WP' },
  draft_resolution: { zh: '决议草案', en: 'Draft Resolution', prefix: 'DR' },
  amendment: { zh: '修正案', en: 'Amendment', prefix: 'AMD' },
};

export const DOC_STATUS_LABEL: Record<DocumentRecord['status'], string> = {
  drafting: '起草中',
  introduced: '已提交',
  voting: '表决中',
  passed: '通过',
  failed: '未通过',
};

/** 编号自动生成：同类文件按登记顺序递增，如 WP 1 / DR 2 / AMD 1 */
export function nextDocCode(docs: DocumentRecord[], kind: DocumentKind): string {
  const prefix = DOC_KIND_LABEL[kind].prefix;
  const n = docs.filter((d) => d.kind === kind).length + 1;
  return `${prefix} ${n}`;
}

/**
 * 投票顺序自动生成。
 *
 * 议事规则通例：修正案先于它所修正的决议草案表决，且修正案之间按登记先后；
 * 工作文件不进入表决。这里只排出「还没表决完」的文件。
 */
export function votingOrder(docs: DocumentRecord[]): DocumentRecord[] {
  const pending = docs.filter((d) => d.status !== 'passed' && d.status !== 'failed');
  const amendments = pending
    .filter((d) => d.kind === 'amendment')
    .sort((a, b) => a.registeredAt - b.registeredAt);
  const drafts = pending
    .filter((d) => d.kind === 'draft_resolution')
    .sort((a, b) => a.registeredAt - b.registeredAt);
  return [...amendments, ...drafts];
}

export function docsOfKind(docs: DocumentRecord[], kind: DocumentKind): DocumentRecord[] {
  return docs.filter((d) => d.kind === kind).sort((a, b) => a.registeredAt - b.registeredAt);
}
