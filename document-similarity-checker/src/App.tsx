import { useState, useCallback } from 'react';
import mammoth from 'mammoth';
import { FileUploadZone } from './components/FileUploadZone';
import { DocumentCard } from './components/DocumentCard';
import {
  buildNgramSet,
  computeNgramRates,
  computeEditSimilarities,
  computeMinHash,
  computeLSHSimilarities,
  findRepeatedSegments,
  combinedScore,
} from './utils/similarity';
import { DocFile, DocResult } from './types';

type AppState = 'idle' | 'processing' | 'done';

// ─── Similarity Matrix ───────────────────────────────────────────
function SimilarityMatrix({ results }: { results: DocResult[] }) {
  const [mode, setMode] = useState<'combined' | 'ngram' | 'edit' | 'lsh'>('combined');
  if (results.length < 2) return null;

  const getValue = (pw: DocResult['pairwise'][0]) => {
    if (mode === 'ngram') return pw.ngramSimilarity;
    if (mode === 'edit') return pw.editSimilarity;
    if (mode === 'lsh') return pw.lshSimilarity;
    return pw.combined;
  };

  const cellColor = (v: number, isDiag: boolean) => {
    if (isDiag) return 'bg-gray-100 text-gray-400';
    if (v >= 0.5) return 'bg-red-500 text-white';
    if (v >= 0.3) return 'bg-orange-400 text-white';
    if (v >= 0.1) return 'bg-yellow-400 text-white';
    return 'bg-green-400 text-white';
  };

  const tabs = [
    { key: 'combined', label: '综合' },
    { key: 'ngram', label: 'N-gram' },
    { key: 'edit', label: '编辑距离' },
    { key: 'lsh', label: 'LSH' },
  ] as const;

  return (
    <div className="rounded-2xl border border-gray-200 shadow-sm bg-white overflow-hidden">
      <div className="flex items-center justify-between px-4 pt-3 pb-2 border-b border-gray-100">
        <span className="text-xs text-gray-500 font-medium">切换算法视图：</span>
        <div className="flex gap-1">
          {tabs.map((t) => (
            <button
              key={t.key}
              onClick={() => setMode(t.key)}
              className={`text-xs px-3 py-1 rounded-full font-medium transition-colors ${
                mode === t.key ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="text-xs text-center w-full">
          <thead>
            <tr className="bg-gray-50">
              <th className="p-3 text-left text-gray-500 font-semibold min-w-[110px]">文档 ↓ vs →</th>
              {results.map((r, i) => (
                <th key={i} className="p-3 text-gray-600 font-semibold min-w-[75px]" title={r.name}>
                  <span className="block truncate max-w-[75px] mx-auto">{r.name.replace(/\.(docx?)$/i, '')}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {results.map((rowDoc, i) => (
              <tr key={i} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50/60'}>
                <td className="p-3 text-left font-medium text-gray-700 truncate max-w-[110px]" title={rowDoc.name}>
                  {rowDoc.name.replace(/\.(docx?)$/i, '')}
                </td>
                {rowDoc.pairwise.map((pw, j) => {
                  const isDiag = pw.docIndex === i;
                  const v = isDiag ? 1 : getValue(pw);
                  return (
                    <td key={j} className="p-2">
                      {isDiag ? (
                        <span className="inline-block w-12 py-1 rounded-lg bg-gray-100 text-gray-400 font-bold">—</span>
                      ) : (
                        <span className={`inline-block w-12 py-1 rounded-lg font-bold text-xs ${cellColor(v, isDiag)}`}>
                          {Math.round(v * 100)}%
                        </span>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Stats Summary ───────────────────────────────────────────────
function StatsSummary({ results }: { results: DocResult[] }) {
  if (results.length === 0) return null;
  const avg = results.reduce((s, r) => s + r.combinedRate, 0) / results.length;
  const avgNgram = results.reduce((s, r) => s + r.ngramRate, 0) / results.length;
  const avgEdit = results.reduce((s, r) => s + r.editRate, 0) / results.length;
  const avgLsh = results.reduce((s, r) => s + r.lshRate, 0) / results.length;
  const max = Math.max(...results.map((r) => r.combinedRate));
  const high = results.filter((r) => r.combinedRate >= 0.3).length;
  const totalSegs = results.reduce((s, r) => s + r.allSegments.length, 0);

  const topStats = [
    { label: '综合平均重复率', value: `${Math.round(avg * 100)}%`, color: avg >= 0.3 ? 'text-orange-500' : 'text-green-600', icon: '📊', sub: '加权综合' },
    { label: '最高综合重复率', value: `${Math.round(max * 100)}%`, color: max >= 0.3 ? 'text-red-500' : 'text-green-600', icon: '🔝', sub: '单文档最高' },
    { label: '高重复文档数', value: `${high} 篇`, color: high > 0 ? 'text-red-500' : 'text-green-600', icon: '📄', sub: '综合重复率 ≥ 30%' },
    { label: '连续重复片段', value: `${totalSegs} 处`, color: totalSegs > 0 ? 'text-orange-500' : 'text-green-600', icon: '🔍', sub: '≥ 10 字相同段落' },
  ];

  const algoStats = [
    { icon: '🔤', label: 'N-gram 指纹', value: avgNgram, weight: '40%', desc: '平均 N-gram 重复率' },
    { icon: '✏️', label: '编辑距离', value: avgEdit, weight: '30%', desc: '平均字符级相似度' },
    { icon: '🧬', label: 'LSH 语义哈希', value: avgLsh, weight: '30%', desc: '平均语义相似度' },
  ];

  return (
    <div className="space-y-3">
      {/* Top-level stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {topStats.map((s, i) => (
          <div key={i} className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 text-center">
            <div className="text-xl mb-1">{s.icon}</div>
            <div className={`text-2xl font-extrabold ${s.color}`}>{s.value}</div>
            <div className="text-xs font-semibold text-gray-700 mt-1">{s.label}</div>
            <div className="text-[10px] text-gray-400">{s.sub}</div>
          </div>
        ))}
      </div>

      {/* Per-algorithm averages */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4">
        <div className="text-xs font-semibold text-gray-600 mb-3 flex items-center gap-1.5">
          <span>📈</span> 各算法平均重复率（全部文档）
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {algoStats.map((a) => {
            const pct = Math.round(a.value * 100);
            const color = pct >= 50 ? 'text-red-600 bg-red-500' : pct >= 30 ? 'text-orange-500 bg-orange-400' : pct >= 10 ? 'text-yellow-600 bg-yellow-400' : 'text-green-600 bg-green-500';
            const [textCls, bgCls] = color.split(' ');
            return (
              <div key={a.label} className="flex items-center gap-3 bg-gray-50 rounded-xl p-3">
                <span className="text-xl shrink-0">{a.icon}</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-semibold text-gray-700">{a.label}</span>
                    <span className="text-xs text-gray-400">{a.weight}</span>
                  </div>
                  <div className="w-full h-1.5 bg-gray-200 rounded-full overflow-hidden">
                    <div className={`h-full rounded-full transition-all duration-700 ${bgCls}`} style={{ width: `${pct}%` }} />
                  </div>
                  <div className="flex justify-between mt-1">
                    <span className="text-[10px] text-gray-400">{a.desc}</span>
                    <span className={`text-xs font-extrabold ${textCls}`}>{pct}%</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ─── Algorithm Legend ─────────────────────────────────────────────
function AlgoLegend() {
  const algos = [
    {
      icon: '🔤',
      name: 'N-gram 指纹',
      desc: '将文本切分为字符/词语滑动窗口，计算两文档中相同片段的占比（包含度指标）。对直接复制最敏感。',
      weight: '40%',
    },
    {
      icon: '✏️',
      name: '编辑距离',
      desc: '统计将一段文本转换为另一段所需的最少增删改操作数，反映字符级整体相似程度。对局部调整鲁棒。',
      weight: '30%',
    },
    {
      icon: '🧬',
      name: 'LSH 语义哈希',
      desc: '基于 MinHash 局部敏感哈希，将文档映射为紧凑签名，估算 Jaccard 相似度，能检测改写和同义替换。',
      weight: '30%',
    },
    {
      icon: '🔍',
      name: '连续片段检测',
      desc: '通过滑动窗口精确定位两文档间超过 10 字/词的逐字相同片段，直观标注具体重复内容。',
      weight: '辅助',
    },
  ];

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      {algos.map((a) => (
        <div key={a.name} className="bg-white rounded-xl border border-gray-100 p-3 flex gap-3">
          <div className="text-2xl shrink-0">{a.icon}</div>
          <div>
            <div className="flex items-center gap-2 mb-0.5">
              <span className="text-sm font-semibold text-gray-800">{a.name}</span>
              <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${a.weight === '辅助' ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'}`}>
                权重 {a.weight}
              </span>
            </div>
            <p className="text-xs text-gray-500 leading-relaxed">{a.desc}</p>
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Progress Steps ───────────────────────────────────────────────
function ProgressSteps({ step }: { step: string }) {
  return (
    <div className="text-center py-2">
      <div className="text-sm font-medium text-blue-700">{step}</div>
    </div>
  );
}

// ─── Main App ─────────────────────────────────────────────────────
export default function App() {
  const [docs, setDocs] = useState<DocFile[]>([]);
  const [results, setResults] = useState<DocResult[]>([]);
  const [appState, setAppState] = useState<AppState>('idle');
  const [progress, setProgress] = useState(0);
  const [progressLabel, setProgressLabel] = useState('');

  const handleFilesAdded = useCallback(async (files: File[]) => {
    const newDocs: DocFile[] = files.map((f) => ({
      name: f.name,
      size: f.size,
      file: f,
      text: '',
      wordCount: 0,
      status: 'pending',
    }));
    setDocs((prev) => [...prev, ...newDocs]);
    setResults([]);
    setAppState('idle');
  }, []);

  const handleRemove = useCallback((idx: number) => {
    setDocs((prev) => prev.filter((_, i) => i !== idx));
    setResults([]);
    setAppState('idle');
  }, []);

  const handleClearAll = () => {
    setDocs([]);
    setResults([]);
    setAppState('idle');
    setProgress(0);
    setProgressLabel('');
  };

  const handleAnalyze = async () => {
    if (docs.length < 2) return;
    setAppState('processing');
    setProgress(0);

    // ── Step 1: Parse documents ──────────────────────
    setProgressLabel('📄 正在解析文档内容...');
    const parsed: DocFile[] = [];
    for (let i = 0; i < docs.length; i++) {
      const doc = docs[i];
      try {
        const arrayBuffer = await doc.file.arrayBuffer();
        const result = await mammoth.extractRawText({ arrayBuffer });
        const text = result.value || '';
        parsed.push({ ...doc, text, wordCount: text.replace(/\s+/g, '').length, status: 'done' });
      } catch {
        parsed.push({ ...doc, text: '', wordCount: 0, status: 'error', error: '解析失败' });
      }
      setProgress(Math.round(((i + 1) / docs.length) * 20));
    }
    setDocs(parsed);

    const texts = parsed.map((d) => d.text);
    const n = parsed.length;

    // ── Step 2: N-gram ──────────────────────────────
    setProgressLabel('🔤 正在计算 N-gram 指纹相似度...');
    await new Promise((r) => setTimeout(r, 10));
    const ngramSets = texts.map((t) => buildNgramSet(t));
    const ngramRates = computeNgramRates(ngramSets);
    setProgress(40);

    // ── Step 3: Edit Distance ───────────────────────
    setProgressLabel('✏️ 正在计算编辑距离相似度...');
    await new Promise((r) => setTimeout(r, 10));
    const editMatrix = computeEditSimilarities(texts);
    setProgress(60);

    // ── Step 4: LSH MinHash ─────────────────────────
    setProgressLabel('🧬 正在计算 LSH 语义哈希相似度...');
    await new Promise((r) => setTimeout(r, 10));
    const signatures = ngramSets.map((s) => computeMinHash(s));
    const lshMatrix = computeLSHSimilarities(signatures);
    setProgress(75);

    // ── Step 5: Repeated Segments ───────────────────
    setProgressLabel('🔍 正在检测连续重复片段...');
    await new Promise((r) => setTimeout(r, 10));

    // Build pairwise segments: segments[i][j] = segments found in doc i that also appear in doc j
    const segmentMatrix: string[][][] = Array.from({ length: n }, () =>
      Array.from({ length: n }, () => [])
    );
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        if (i !== j && texts[i] && texts[j]) {
          segmentMatrix[i][j] = findRepeatedSegments(texts[i], texts[j]);
        }
      }
      setProgress(75 + Math.round(((i + 1) / n) * 20));
    }

    // ── Step 6: Assemble Results ────────────────────
    setProgressLabel('📊 正在汇总分析结果...');
    await new Promise((r) => setTimeout(r, 10));

    const docResults: DocResult[] = parsed.map((doc, i) => {
      const pairwise = parsed.map((_, j) => ({
        docIndex: j,
        docName: parsed[j].name,
        ngramSimilarity: j === i ? 1 : ngramRates[i].pairwise[j],
        editSimilarity: j === i ? 1 : editMatrix[i][j],
        lshSimilarity: j === i ? 1 : lshMatrix[i][j],
        combined: j === i ? 1 : combinedScore(
          ngramRates[i].pairwise[j],
          editMatrix[i][j],
          lshMatrix[i][j]
        ),
        segments: j === i ? [] : segmentMatrix[i][j].map((text) => ({
          text,
          docIndex: j,
          docName: parsed[j].name,
          count: 1,
        })),
      }));

      const allSegments = pairwise
        .filter((pw) => pw.docIndex !== i)
        .flatMap((pw) => pw.segments);

      // Overall rate per doc: use containment-style aggregation against all others combined
      const others = pairwise.filter((pw) => pw.docIndex !== i);
      // N-gram: containment vs all other docs (already computed this way)
      const ngramRate = ngramRates[i].rate;
      // Edit: average of pairwise similarities to each other doc (reflects overall textual closeness)
      const editRate = others.length > 0
        ? others.reduce((sum, pw) => sum + pw.editSimilarity, 0) / others.length
        : 0;
      // LSH: average of pairwise similarities to each other doc
      const lshRate = others.length > 0
        ? others.reduce((sum, pw) => sum + pw.lshSimilarity, 0) / others.length
        : 0;
      const combinedRate = combinedScore(ngramRate, editRate, lshRate);

      return {
        name: doc.name,
        size: doc.size,
        wordCount: doc.wordCount,
        ngramRate,
        editRate,
        lshRate,
        combinedRate,
        pairwise,
        allSegments,
      };
    });

    setResults(docResults);
    setProgress(100);
    setProgressLabel('✅ 分析完成！');
    setAppState('done');
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-100 via-blue-50 to-indigo-100">
      {/* Header */}
      <header className="bg-white/80 backdrop-blur-sm border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-4 py-4 flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-blue-600 flex items-center justify-center shadow">
            <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
          </div>
          <div>
            <h1 className="text-lg font-bold text-gray-900 leading-tight">Word 文档重复率检测</h1>
            <p className="text-xs text-gray-500">N-gram · 编辑距离 · LSH语义哈希 · 连续片段检测 — 四重算法综合分析</p>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-8 space-y-6">

        {/* Upload Zone */}
        <FileUploadZone onFilesAdded={handleFilesAdded} />

        {/* File List */}
        {docs.length > 0 && (
          <div className="bg-white/80 backdrop-blur rounded-2xl border border-gray-200 shadow-sm p-5 space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold text-gray-800 flex items-center gap-2">
                <svg className="w-4 h-4 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 10h16M4 14h16M4 18h16" />
                </svg>
                已选文档
                <span className="text-xs font-normal text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">{docs.length} 个</span>
              </h2>
              <button onClick={handleClearAll} className="text-xs text-red-400 hover:text-red-600 transition-colors">
                清空全部
              </button>
            </div>
            <div className="space-y-2">
              {docs.map((doc, i) => (
                <div key={i} className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl border border-gray-100">
                  <div className="flex-shrink-0">
                    <svg className="w-8 h-8 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                    </svg>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-gray-800 truncate">{doc.name}</div>
                    <div className="text-xs text-gray-400">{(doc.size / 1024).toFixed(1)} KB</div>
                  </div>
                  {doc.status === 'processing' && <div className="text-xs text-blue-500 animate-pulse">解析中...</div>}
                  {doc.status === 'error' && <div className="text-xs text-red-500">{doc.error}</div>}
                  <button
                    onClick={() => handleRemove(i)}
                    className="w-7 h-7 rounded-lg flex items-center justify-center text-gray-300 hover:text-red-500 hover:bg-red-50 transition-colors"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              ))}
            </div>

            {/* Analyze Button */}
            <div className="pt-2">
              {docs.length < 2 ? (
                <div className="text-sm text-amber-600 bg-amber-50 rounded-xl px-4 py-3 border border-amber-100 flex items-center gap-2">
                  <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  请至少上传 2 个文档才能进行重复率检测
                </div>
              ) : (
                <button
                  onClick={handleAnalyze}
                  disabled={appState === 'processing'}
                  className={`w-full py-3 rounded-xl font-semibold text-white text-sm transition-all shadow-sm ${
                    appState === 'processing'
                      ? 'bg-blue-400 cursor-not-allowed'
                      : 'bg-blue-600 hover:bg-blue-700 active:scale-[0.99]'
                  }`}
                >
                  {appState === 'processing' ? (
                    <span className="flex items-center justify-center gap-2">
                      <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                      </svg>
                      {progressLabel} {progress}%
                    </span>
                  ) : (
                    `🔍 开始四重算法分析（${docs.length} 个文档）`
                  )}
                </button>
              )}
            </div>

            {/* Progress Bar */}
            {appState === 'processing' && (
              <div className="space-y-1">
                <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden">
                  <div className="h-full bg-gradient-to-r from-blue-500 to-indigo-500 rounded-full transition-all duration-300" style={{ width: `${progress}%` }} />
                </div>
                <ProgressSteps step={progressLabel} />
              </div>
            )}
          </div>
        )}

        {/* Results */}
        {appState === 'done' && results.length > 0 && (
          <div className="space-y-6">
            {/* Stats */}
            <StatsSummary results={results} />

            {/* Legend */}
            <div className="flex flex-wrap gap-3 text-xs">
              {[
                { color: 'bg-green-400', label: '基本原创 (< 10%)' },
                { color: 'bg-yellow-400', label: '低重复 (10–30%)' },
                { color: 'bg-orange-400', label: '中重复 (30–50%)' },
                { color: 'bg-red-500', label: '高重复 (≥ 50%)' },
              ].map((l) => (
                <div key={l.label} className="flex items-center gap-1.5 bg-white px-3 py-1.5 rounded-full shadow-sm border border-gray-100">
                  <span className={`w-2.5 h-2.5 rounded-full ${l.color}`} />
                  <span className="text-gray-600">{l.label}</span>
                </div>
              ))}
            </div>

            {/* Document Cards */}
            <div>
              <h2 className="font-semibold text-gray-800 mb-3 flex items-center gap-2">
                <svg className="w-4 h-4 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                各文档重复率详情
                <span className="text-xs font-normal text-gray-400">（N-gram · 编辑距离 · LSH 三算法独立评分 + 展开两两对比）</span>
              </h2>
              <div className="space-y-3">
                {results
                  .slice()
                  .sort((a, b) => b.combinedRate - a.combinedRate)
                  .map((result) => {
                    const originalIndex = results.indexOf(result);
                    return (
                      <DocumentCard
                        key={originalIndex}
                        result={result}
                        index={originalIndex}
                        onRemove={handleRemove}
                      />
                    );
                  })}
              </div>
            </div>

            {/* Similarity Matrix */}
            <div>
              <h2 className="font-semibold text-gray-800 mb-3 flex items-center gap-2">
                <svg className="w-4 h-4 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
                </svg>
                两两相似度矩阵
                <span className="text-xs font-normal text-gray-400">（可切换算法视图）</span>
              </h2>
              <SimilarityMatrix results={results} />
            </div>

            {/* Algorithm Explanation */}
            <div>
              <h2 className="font-semibold text-gray-800 mb-3 flex items-center gap-2">
                <svg className="w-4 h-4 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                算法说明
              </h2>
              <AlgoLegend />
            </div>
          </div>
        )}

        {/* Empty State */}
        {docs.length === 0 && (
          <div className="text-center py-16 text-gray-400">
            <div className="text-6xl mb-4">📄</div>
            <p className="text-sm font-medium text-gray-500 mb-1">上传至少 2 个 Word 文档开始检测</p>
            <p className="text-xs text-gray-400">支持 .doc / .docx 格式，文件仅在本地处理</p>
          </div>
        )}
      </main>

      <footer className="text-center py-6 text-xs text-gray-400">
        所有文件均在本地浏览器中处理，不上传至任何服务器 · 四重算法：N-gram + 编辑距离 + LSH语义哈希 + 连续片段检测
      </footer>
    </div>
  );
}
