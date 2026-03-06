import React, { useState } from 'react';
import { DocResult, PairwiseDetail } from '../types';

interface DocumentCardProps {
  result: DocResult;
  index: number;
  onRemove: (index: number) => void;
}

// ─── Color helpers ────────────────────────────────────────────────
function rateColor(r: number) {
  if (r >= 0.5) return { text: 'text-red-600', bg: 'bg-red-500', badge: 'bg-red-100 text-red-700', border: 'border-red-300', cardBg: 'bg-red-50', ring: 'ring-red-200' };
  if (r >= 0.3) return { text: 'text-orange-500', bg: 'bg-orange-400', badge: 'bg-orange-100 text-orange-700', border: 'border-orange-300', cardBg: 'bg-orange-50', ring: 'ring-orange-200' };
  if (r >= 0.1) return { text: 'text-yellow-600', bg: 'bg-yellow-400', badge: 'bg-yellow-100 text-yellow-700', border: 'border-yellow-300', cardBg: 'bg-yellow-50', ring: 'ring-yellow-200' };
  return { text: 'text-green-600', bg: 'bg-green-500', badge: 'bg-green-100 text-green-700', border: 'border-green-300', cardBg: 'bg-green-50', ring: 'ring-green-200' };
}

function rateLabel(r: number) {
  if (r >= 0.5) return '高重复';
  if (r >= 0.3) return '中重复';
  if (r >= 0.1) return '低重复';
  return '基本原创';
}

// ─── Small progress bar ───────────────────────────────────────────
function Bar({ value, colorClass, height = 'h-2' }: { value: number; colorClass: string; height?: string }) {
  return (
    <div className={`w-full ${height} bg-gray-200 rounded-full overflow-hidden`}>
      <div
        className={`h-full rounded-full transition-all duration-700 ${colorClass}`}
        style={{ width: `${Math.min(100, Math.round(value * 100))}%` }}
      />
    </div>
  );
}

// ─── Algorithm score card (top-level per doc) ─────────────────────
interface AlgoCardProps {
  icon: string;
  label: string;
  value: number;
  description: string;
  weight: string;
}
function AlgoScoreCard({ icon, label, value, description, weight }: AlgoCardProps) {
  const c = rateColor(value);
  const pct = Math.round(value * 100);
  return (
    <div className={`flex-1 rounded-2xl border-2 ${c.border} bg-white p-3 flex flex-col gap-1.5 min-w-[130px]`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <span className="text-base">{icon}</span>
          <span className="text-xs font-semibold text-gray-700">{label}</span>
        </div>
        <span className="text-xs text-gray-400 bg-gray-100 rounded-full px-1.5 py-0.5">{weight}</span>
      </div>
      <div className="flex items-end gap-1.5">
        <span className={`text-3xl font-extrabold leading-none ${c.text}`}>{pct}%</span>
        <span className={`text-xs font-semibold mb-0.5 ${c.badge} rounded-full px-2 py-0.5`}>{rateLabel(value)}</span>
      </div>
      <Bar value={value} colorClass={c.bg} />
      <p className="text-[10px] text-gray-400 leading-snug mt-0.5">{description}</p>
    </div>
  );
}

// ─── Segment badge ────────────────────────────────────────────────
function SegmentBadge({ text }: { text: string }) {
  return (
    <span className="inline-block bg-red-100 border border-red-200 text-red-700 text-[11px] rounded-lg px-2 py-1 font-mono break-all leading-relaxed">
      「{text.length > 60 ? text.slice(0, 60) + '…' : text}」
    </span>
  );
}

// ─── Pairwise detail row ──────────────────────────────────────────
function PairwiseRow({ pw, selfIndex }: { pw: PairwiseDetail; selfIndex: number }) {
  const [open, setOpen] = useState(false);
  if (pw.docIndex === selfIndex) return null;

  const combined = rateColor(pw.combined);
  const ngram = rateColor(pw.ngramSimilarity);
  const edit = rateColor(pw.editSimilarity);
  const lsh = rateColor(pw.lshSimilarity);

  const algoItems = [
    { icon: '🔤', key: 'N-gram 指纹', value: pw.ngramSimilarity, color: ngram, tip: 'N-gram 包含度：该文档中与对方重叠的 N-gram 比例，对直接复制最敏感' },
    { icon: '✏️', key: '编辑距离', value: pw.editSimilarity, color: edit, tip: '字符级编辑距离相似度，反映逐字修改程度' },
    { icon: '🧬', key: 'LSH 语义', value: pw.lshSimilarity, color: lsh, tip: 'MinHash LSH 估算的语义相似度，能检测同义改写' },
  ];

  return (
    <div className="rounded-xl border border-gray-200 bg-white overflow-hidden shadow-sm">
      {/* Row header */}
      <button
        className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-gray-50 transition-colors"
        onClick={() => setOpen((v) => !v)}
      >
        <div className="flex-1 min-w-0">
          <span className="text-sm font-medium text-gray-700 truncate block" title={pw.docName}>
            vs &nbsp;<span className="text-gray-900 font-semibold">{pw.docName}</span>
          </span>
        </div>
        {/* Three algo chips */}
        <div className="hidden sm:flex items-center gap-1.5 shrink-0">
          {algoItems.map((a) => (
            <span key={a.key} className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${a.color.badge}`} title={a.key}>
              {a.key.split(' ')[0]} {Math.round(a.value * 100)}%
            </span>
          ))}
        </div>
        {/* Combined score */}
        <div className="flex items-center gap-2 shrink-0 ml-2">
          <div className="text-right">
            <div className={`text-lg font-extrabold ${combined.text}`}>{Math.round(pw.combined * 100)}%</div>
            <div className="text-[10px] text-gray-400">综合</div>
          </div>
          <svg className={`w-4 h-4 text-gray-400 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </button>

      {/* Expanded detail */}
      {open && (
        <div className="border-t border-gray-100 px-4 pb-4 pt-3 space-y-3">
          {/* Three algo detailed bars */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            {algoItems.map((a) => {
              const pct = Math.round(a.value * 100);
              return (
                <div key={a.key} className={`rounded-xl border ${a.color.border} bg-white p-3`} title={a.tip}>
                  <div className="flex items-center gap-1.5 mb-1">
                    <span className="text-sm">{a.icon}</span>
                    <span className="text-xs font-semibold text-gray-700">{a.key}</span>
                  </div>
                  <div className={`text-2xl font-extrabold ${a.color.text}`}>{pct}%</div>
                  <Bar value={a.value} colorClass={a.color.bg} height="h-1.5" />
                  <div className={`text-[10px] mt-1 font-medium ${a.color.text}`}>{rateLabel(a.value)}</div>
                  <p className="text-[10px] text-gray-400 mt-0.5 leading-snug">{a.tip}</p>
                </div>
              );
            })}
          </div>

          {/* Repeated segments */}
          {pw.segments.length > 0 && (
            <div className="rounded-xl bg-red-50 border border-red-100 p-3">
              <div className="text-xs font-semibold text-red-600 mb-2 flex items-center gap-1.5">
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                </svg>
                连续重复片段（{pw.segments.length} 处）
              </div>
              <div className="flex flex-wrap gap-1.5">
                {pw.segments.slice(0, 8).map((s, k) => (
                  <SegmentBadge key={k} text={s.text} />
                ))}
                {pw.segments.length > 8 && (
                  <span className="text-xs text-gray-400 self-center">+{pw.segments.length - 8} 处…</span>
                )}
              </div>
            </div>
          )}

          {pw.segments.length === 0 && (
            <div className="text-xs text-gray-400 flex items-center gap-1.5 py-1">
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              未检测到超过 10 字的连续重复片段
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Main Document Card ───────────────────────────────────────────
export const DocumentCard: React.FC<DocumentCardProps> = ({ result, index, onRemove }) => {
  const [expanded, setExpanded] = useState(false);
  const c = rateColor(result.combinedRate);
  const combinedPct = Math.round(result.combinedRate * 100);
  const totalSegments = result.allSegments.length;
  const otherPairs = result.pairwise.filter((pw) => pw.docIndex !== index);

  return (
    <div className={`rounded-2xl border-2 shadow-sm overflow-hidden ${c.border} ${c.cardBg}`}>

      {/* ── Card Header ── */}
      <div className="flex items-start gap-3 p-4 pb-3">
        <div className="flex-shrink-0 w-10 h-10 rounded-xl bg-white shadow-sm flex items-center justify-center font-bold text-gray-500 text-sm border border-gray-100 mt-0.5">
          {index + 1}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-0.5">
            <span className="font-semibold text-gray-900 truncate max-w-xs" title={result.name}>
              {result.name}
            </span>
            <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${c.badge}`}>
              {rateLabel(result.combinedRate)}
            </span>
            {totalSegments > 0 && (
              <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-red-100 text-red-700 flex items-center gap-0.5">
                🔍 {totalSegments} 处重复片段
              </span>
            )}
          </div>
          <div className="text-xs text-gray-500">
            {(result.size / 1024).toFixed(1)} KB · {result.wordCount.toLocaleString()} 字符
          </div>
        </div>
        {/* Combined rate big number */}
        <div className="flex items-center gap-2 shrink-0">
          <div className="text-right">
            <div className={`text-3xl font-extrabold leading-none ${c.text}`}>{combinedPct}%</div>
            <div className="text-[10px] text-gray-500 mt-0.5 text-right">综合重复率</div>
          </div>
          <button
            onClick={() => onRemove(index)}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-gray-400 hover:text-red-500 hover:bg-red-100 transition-colors ml-1"
            title="移除"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>

      {/* ── Combined progress bar ── */}
      <div className="px-4 pb-3">
        <Bar value={result.combinedRate} colorClass={c.bg} height="h-2.5" />
        <div className="flex justify-between text-[10px] text-gray-400 mt-1">
          <span>综合重复率（N-gram 40% + 编辑距离 30% + LSH 30%）</span>
          <span>{combinedPct}%</span>
        </div>
      </div>

      {/* ── Three Algorithm Score Cards ── */}
      <div className="px-4 pb-4 flex gap-2 flex-wrap">
        <AlgoScoreCard
          icon="🔤"
          label="N-gram 指纹"
          value={result.ngramRate}
          weight="40%"
          description="滑动窗口匹配，对直接复制最敏感"
        />
        <AlgoScoreCard
          icon="✏️"
          label="编辑距离"
          value={result.editRate}
          weight="30%"
          description="字符增删改操作数，反映整体文本相似度"
        />
        <AlgoScoreCard
          icon="🧬"
          label="LSH 语义"
          value={result.lshRate}
          weight="30%"
          description="MinHash 哈希，能检测同义改写内容"
        />
      </div>

      {/* ── Expand toggle for pairwise ── */}
      {otherPairs.length > 0 && (
        <div className="px-4 pb-4 border-t border-white/60 pt-3">
          <button
            className="text-xs text-blue-600 hover:text-blue-800 font-semibold flex items-center gap-1.5 transition-colors"
            onClick={() => setExpanded((v) => !v)}
          >
            <svg className={`w-3.5 h-3.5 transition-transform ${expanded ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
            {expanded ? '收起' : '展开'} 与各文档的逐项算法对比
            <span className="ml-1 bg-blue-100 text-blue-600 rounded-full px-1.5 py-0.5 text-[10px]">
              {otherPairs.length} 对
            </span>
          </button>

          {expanded && (
            <div className="mt-3 space-y-2">
              {/* Pairwise summary table */}
              <div className="bg-white/80 rounded-xl border border-gray-200 overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-gray-50 border-b border-gray-200">
                      <th className="text-left px-3 py-2 text-gray-600 font-semibold">对比文档</th>
                      <th className="text-center px-2 py-2 text-gray-600 font-semibold">🔤 N-gram</th>
                      <th className="text-center px-2 py-2 text-gray-600 font-semibold">✏️ 编辑距离</th>
                      <th className="text-center px-2 py-2 text-gray-600 font-semibold">🧬 LSH</th>
                      <th className="text-center px-2 py-2 text-gray-600 font-semibold">综合</th>
                    </tr>
                  </thead>
                  <tbody>
                    {otherPairs.map((pw, j) => {
                      const cc = rateColor(pw.combined);
                      const nc = rateColor(pw.ngramSimilarity);
                      const ec = rateColor(pw.editSimilarity);
                      const lc = rateColor(pw.lshSimilarity);
                      return (
                        <tr key={j} className={`border-b border-gray-100 last:border-0 ${j % 2 === 0 ? 'bg-white' : 'bg-gray-50/60'}`}>
                          <td className="px-3 py-2 font-medium text-gray-700 truncate max-w-[140px]" title={pw.docName}>
                            {pw.docName}
                          </td>
                          <td className="px-2 py-2 text-center">
                            <span className={`inline-block font-bold px-2 py-0.5 rounded-full ${nc.badge}`}>
                              {Math.round(pw.ngramSimilarity * 100)}%
                            </span>
                          </td>
                          <td className="px-2 py-2 text-center">
                            <span className={`inline-block font-bold px-2 py-0.5 rounded-full ${ec.badge}`}>
                              {Math.round(pw.editSimilarity * 100)}%
                            </span>
                          </td>
                          <td className="px-2 py-2 text-center">
                            <span className={`inline-block font-bold px-2 py-0.5 rounded-full ${lc.badge}`}>
                              {Math.round(pw.lshSimilarity * 100)}%
                            </span>
                          </td>
                          <td className="px-2 py-2 text-center">
                            <span className={`inline-block font-bold px-2 py-0.5 rounded-full ${cc.badge}`}>
                              {Math.round(pw.combined * 100)}%
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Pairwise detail cards with segments */}
              <div className="space-y-2">
                {result.pairwise.map((pw, j) => (
                  <PairwiseRow key={j} pw={pw} selfIndex={index} />
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
