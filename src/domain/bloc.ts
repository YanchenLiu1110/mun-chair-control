import type { SessionState } from './types';

/**
 * F1 · 阵营图谱（Bloc Map）
 *
 * 亲疏度由三类信号加权：
 *   ① 共同起草/附议同一份文件
 *   ② 同一次表决（决议草案/修正案）立场一致
 *   ③ 同一次动议表决中立场一致，且与提出国相互支持
 *
 * 每类信号先按本场最大值归一化到 0..1，再加权求和 ——
 * 否则"共同起草了 8 次"会直接压死"投票一致 2 次"。
 */

export interface BlocWeights {
  cosponsor: number;
  vote: number;
  motion: number;
}

export const DEFAULT_BLOC_WEIGHTS: BlocWeights = { cosponsor: 1, vote: 1.2, motion: 0.8 };

export interface BlocEdge {
  a: string;
  b: string;
  /** 综合亲疏度 0..1 */
  w: number;
  doc: number;
  vote: number;
  motion: number;
}

export interface BlocNode {
  id: string;
  x: number;
  y: number;
  /** 连接强度合计，决定节点大小 */
  strength: number;
}

export interface BlocGraph {
  nodes: BlocNode[];
  edges: BlocEdge[];
  /** 每个节点的盟友排序（按亲疏度降序） */
  allies: Map<string, Array<{ id: string; w: number }>>;
}

const CANVAS_W = 1000;
const CANVAS_H = 620;

function pairKey(a: string, b: string): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

export function buildBlocGraph(state: SessionState, weights: BlocWeights): BlocGraph {
  const pairs = new Map<string, { doc: number; vote: number; motion: number }>();

  const bump = (a: string, b: string, kind: 'doc' | 'vote' | 'motion') => {
    if (!a || !b || a === b) return;
    const k = pairKey(a, b);
    const e = pairs.get(k) ?? { doc: 0, vote: 0, motion: 0 };
    e[kind] += 1;
    pairs.set(k, e);
  };

  /* ① 共同起草 / 附议 */
  for (const d of state.documents) {
    const ids = [...new Set([...d.sponsors, ...d.signatories])];
    for (let i = 0; i < ids.length; i += 1) {
      for (let j = i + 1; j < ids.length; j += 1) bump(ids[i], ids[j], 'doc');
    }
  }

  /* ② ③ 表决立场一致 */
  const proposerOf = new Map(state.motions.map((m) => [m.id, m.proposerId]));
  for (const v of state.votes) {
    if (!v.result) continue; // 未公布结果的不计入
    const yes: string[] = [];
    const no: string[] = [];
    for (const [id, c] of Object.entries(v.ballots)) {
      if (c === 'yes') yes.push(id);
      else if (c === 'no') no.push(id);
    }
    const kind = v.subjectKind === 'motion' ? 'motion' : 'vote';
    for (const group of [yes, no]) {
      for (let i = 0; i < group.length; i += 1) {
        for (let j = i + 1; j < group.length; j += 1) bump(group[i], group[j], kind);
      }
    }
    // 动议：提出国与赞成方也算互相支持
    if (v.subjectKind === 'motion') {
      const proposer = proposerOf.get(v.subjectId);
      if (proposer) for (const id of yes) bump(proposer, id, 'motion');
    }
  }

  const raw = [...pairs.entries()].map(([k, v]) => {
    const [a, b] = k.split('|');
    return { a, b, ...v };
  });

  const maxDoc = Math.max(1, ...raw.map((e) => e.doc));
  const maxVote = Math.max(1, ...raw.map((e) => e.vote));
  const maxMotion = Math.max(1, ...raw.map((e) => e.motion));

  const edges: BlocEdge[] = raw
    .map((e) => ({
      ...e,
      w:
        weights.cosponsor * (e.doc / maxDoc) +
        weights.vote * (e.vote / maxVote) +
        weights.motion * (e.motion / maxMotion),
    }))
    .filter((e) => e.w > 0.02)
    .sort((x, y) => y.w - x.w);

  const allies = new Map<string, Array<{ id: string; w: number }>>();
  const strength = new Map<string, number>();
  for (const e of edges) {
    if (!allies.has(e.a)) allies.set(e.a, []);
    if (!allies.has(e.b)) allies.set(e.b, []);
    allies.get(e.a)!.push({ id: e.b, w: e.w });
    allies.get(e.b)!.push({ id: e.a, w: e.w });
    strength.set(e.a, (strength.get(e.a) ?? 0) + e.w);
    strength.set(e.b, (strength.get(e.b) ?? 0) + e.w);
  }
  for (const list of allies.values()) list.sort((x, y) => y.w - x.w);

  return { nodes: [], edges, allies };
}

/* ------------------------------------------------------------------ *
 * 布局
 *
 * 一个真实会场的图谱往往是"少数几个国家有边、其余全是孤点"。
 * 把两类节点丢进同一套力学里，孤点会被斥力顶到画布边缘挤成一圈，
 * 有关系的那一小簇反而被压成角落一坨——无论怎么调参数都难看。
 *
 * 所以分两区：
 *   · 有边的节点 → Fruchterman-Reingold 力导向，占中间
 *   · 孤点     → 沿椭圆外圈按弧长均匀排布，视觉上明确"尚未入网"
 * ------------------------------------------------------------------ */

interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** 椭圆周长（Ramanujan 近似，误差 < 1e-5，够用） */
function ellipsePerimeter(a: number, b: number): number {
  return Math.PI * (3 * (a + b) - Math.sqrt((3 * a + b) * (a + 3 * b)));
}

/**
 * 把孤点铺到椭圆环上。按弧长等距而不是按角度等距——
 * 按角度排会在长短轴方向明显疏密不均。
 */
function placeOnRings(
  ids: string[],
  cx: number,
  cy: number,
  a0: number,
  b0: number,
  gap: number,
): { pos: Map<string, { x: number; y: number }>; rings: number } {
  const pos = new Map<string, { x: number; y: number }>();
  if (ids.length === 0) return { pos, rings: 0 };

  const SPACING = 40;
  const buckets: string[][] = [];
  let rest = [...ids];
  for (let r = 0; r < 6 && rest.length > 0; r += 1) {
    const a = a0 - r * gap;
    const b = b0 - r * gap;
    const cap = Math.max(6, Math.floor(ellipsePerimeter(a, b) / SPACING));
    buckets.push(rest.slice(0, cap));
    rest = rest.slice(cap);
  }
  if (rest.length > 0 && buckets.length > 0) buckets[buckets.length - 1].push(...rest);

  buckets.forEach((list, r) => {
    const a = a0 - r * gap;
    const b = b0 - r * gap;
    const m = list.length;
    if (m === 0) return;

    // 累积弧长表，用于把 m 个点等距撒在椭圆上
    const N = 720;
    const cum = new Float64Array(N + 1);
    let px = a;
    let py = 0;
    for (let i = 1; i <= N; i += 1) {
      const t = (i / N) * Math.PI * 2;
      const x = a * Math.cos(t);
      const y = b * Math.sin(t);
      cum[i] = cum[i - 1] + Math.hypot(x - px, y - py);
      px = x;
      py = y;
    }
    const total = cum[N];

    list.forEach((id, i) => {
      const target = ((i + 0.5) / m) * total;
      let lo = 0;
      let hi = N;
      while (lo < hi) {
        const mid = (lo + hi) >> 1;
        if (cum[mid] < target) lo = mid + 1;
        else hi = mid;
      }
      const t = (lo / N) * Math.PI * 2;
      pos.set(id, { x: cx + a * Math.cos(t), y: cy + b * Math.sin(t) });
    });
  });

  return { pos, rings: buckets.length };
}

/** Fruchterman-Reingold，确定性初值 + 温度衰减，坐标每轮夹在给定盒子内 */
function forceLayout(ids: string[], edges: BlocEdge[], box: Box): Map<string, { x: number; y: number }> {
  const n = ids.length;
  const pos = new Map<string, { x: number; y: number }>();
  if (n === 0) return pos;

  const cx = box.x + box.w / 2;
  const cy = box.y + box.h / 2;

  // 黄金角螺旋：同样的输入永远得到同样的初始分布，重算时不会乱跳
  ids.forEach((id, i) => {
    const angle = i * 2.399963229728653;
    const r = Math.sqrt((i + 0.5) / n) * Math.min(box.w, box.h) * 0.44;
    pos.set(id, { x: cx + Math.cos(angle) * r, y: cy + Math.sin(angle) * r });
  });

  if (n === 1) return pos;

  const k = Math.sqrt((box.w * box.h) / n);
  const idx = new Map(ids.map((id, i) => [id, i]));
  const disp = ids.map(() => ({ x: 0, y: 0 }));
  let temp = Math.max(box.w, box.h) / 8;
  const iterations = n > 40 ? 260 : 320;

  /**
   * 向心力必须随节点数缩放：斥力总量随 n 线性增长，
   * 固定系数会出现"20 个节点刚好、60 个节点炸到画布外"。
   * 目标是让稳态半径落在盒子短边的 0.45 左右。
   */
  const R = Math.min(box.w, box.h) * 0.45;
  const G = (n * k * k) / (R * R);

  for (let it = 0; it < iterations; it += 1) {
    for (let i = 0; i < n; i += 1) {
      disp[i].x = 0;
      disp[i].y = 0;
    }

    // 斥力
    for (let i = 0; i < n; i += 1) {
      const a = pos.get(ids[i])!;
      for (let j = i + 1; j < n; j += 1) {
        const b = pos.get(ids[j])!;
        let dx = a.x - b.x;
        let dy = a.y - b.y;
        let d2 = dx * dx + dy * dy;
        if (d2 < 0.01) {
          dx = (Math.random() - 0.5) * 0.5;
          dy = (Math.random() - 0.5) * 0.5;
          d2 = dx * dx + dy * dy + 0.01;
        }
        const d = Math.sqrt(d2);
        const f = (k * k) / d;
        const ux = (dx / d) * f;
        const uy = (dy / d) * f;
        disp[i].x += ux;
        disp[i].y += uy;
        disp[j].x -= ux;
        disp[j].y -= uy;
      }
    }

    // 引力（只沿有边的方向）
    for (const e of edges) {
      const ia = idx.get(e.a);
      const ib = idx.get(e.b);
      if (ia === undefined || ib === undefined) continue;
      const a = pos.get(e.a)!;
      const b = pos.get(e.b)!;
      const dx = a.x - b.x;
      const dy = a.y - b.y;
      const d = Math.max(0.01, Math.hypot(dx, dy));
      const f = ((d * d) / k) * (0.25 + e.w);
      const ux = (dx / d) * f;
      const uy = (dy / d) * f;
      disp[ia].x -= ux;
      disp[ia].y -= uy;
      disp[ib].x += ux;
      disp[ib].y += uy;
    }

    // 向心力：只做轻微收敛，防止连通分量被斥力推到盒子边界上贴墙
    for (let i = 0; i < n; i += 1) {
      const p = pos.get(ids[i])!;
      disp[i].x += (cx - p.x) * G;
      disp[i].y += (cy - p.y) * G;
    }

    // 限温移动（不夹边界，最后统一归一化到盒子里）
    for (let i = 0; i < n; i += 1) {
      const p = pos.get(ids[i])!;
      const d = disp[i];
      const len = Math.max(0.01, Math.hypot(d.x, d.y));
      const step = Math.min(len, temp);
      p.x += (d.x / len) * step;
      p.y += (d.y / len) * step;
    }
    temp *= 0.985;
  }

  /* 归一化进盒子：等比缩放 + 居中，保证既铺得开又不出界 */
  const pts = ids.map((id) => pos.get(id)!);
  const bMinX = Math.min(...pts.map((p) => p.x));
  const bMaxX = Math.max(...pts.map((p) => p.x));
  const bMinY = Math.min(...pts.map((p) => p.y));
  const bMaxY = Math.max(...pts.map((p) => p.y));
  const spanX = Math.max(1e-3, bMaxX - bMinX);
  const spanY = Math.max(1e-3, bMaxY - bMinY);
  const scale = Math.min(box.w / spanX, box.h / spanY);
  const offX = box.x + (box.w - spanX * scale) / 2 - bMinX * scale;
  const offY = box.y + (box.h - spanY * scale) / 2 - bMinY * scale;
  for (const p of pts) {
    p.x = p.x * scale + offX;
    p.y = p.y * scale + offY;
  }

  return pos;
}

export function layoutGraph(
  nodeIds: string[],
  edges: BlocEdge[],
  width = CANVAS_W,
  height = CANVAS_H,
): BlocNode[] {
  if (nodeIds.length === 0) return [];

  const degree = new Map<string, number>();
  for (const e of edges) {
    degree.set(e.a, (degree.get(e.a) ?? 0) + 1);
    degree.set(e.b, (degree.get(e.b) ?? 0) + 1);
  }
  const linked = nodeIds.filter((id) => (degree.get(id) ?? 0) > 0);
  const lonely = nodeIds.filter((id) => (degree.get(id) ?? 0) === 0);

  const pos = new Map<string, { x: number; y: number }>();

  const cx = width / 2;
  const cy = height / 2;
  const RING_GAP = 34;
  const outerA = width / 2 - 26;
  const outerB = height / 2 - 22;

  let insetX = 58;
  let insetY = 34;
  if (lonely.length > 0) {
    const { pos: ringPos, rings } = placeOnRings(lonely, cx, cy, outerA, outerB, RING_GAP);
    for (const [id, p] of ringPos) pos.set(id, p);
    // 内区要把外圈的厚度整体让出来，否则边缘的连通节点会贴到圈上
    insetX = 30 + rings * RING_GAP + 16;
    insetY = 26 + rings * RING_GAP + 20;
  }

  if (linked.length > 0) {
    const box: Box = {
      x: insetX,
      y: insetY,
      w: Math.max(120, width - insetX * 2),
      h: Math.max(90, height - insetY * 2),
    };
    const inner = forceLayout(linked, edges, box);
    for (const [id, p] of inner) pos.set(id, p);
  }

  const strength = new Map<string, number>();
  for (const e of edges) {
    strength.set(e.a, (strength.get(e.a) ?? 0) + e.w);
    strength.set(e.b, (strength.get(e.b) ?? 0) + e.w);
  }

  return nodeIds.map((id) => {
    const p = pos.get(id) ?? { x: cx, y: cy };
    return { id, x: p.x, y: p.y, strength: strength.get(id) ?? 0 };
  });
}
