export interface DocFile {
  name: string;
  size: number;
  file: File;
  text: string;
  wordCount: number;
  status: 'pending' | 'processing' | 'done' | 'error';
  error?: string;
}

export interface RepeatedSegment {
  text: string;
  docIndex: number;
  docName: string;
  count: number;
}

export interface PairwiseDetail {
  docIndex: number;
  docName: string;
  /** N-gram 包含度 */
  ngramSimilarity: number;
  /** 字符编辑距离相似度 */
  editSimilarity: number;
  /** LSH 语义相似度 */
  lshSimilarity: number;
  /** 综合得分 */
  combined: number;
  /** 连续重复片段 */
  segments: RepeatedSegment[];
}

export interface DocResult {
  name: string;
  size: number;
  wordCount: number;
  /** N-gram 综合重复率 */
  ngramRate: number;
  /** 编辑距离综合重复率 */
  editRate: number;
  /** LSH 综合重复率 */
  lshRate: number;
  /** 综合重复率（加权平均）*/
  combinedRate: number;
  pairwise: PairwiseDetail[];
  /** 所有重复片段汇总 */
  allSegments: RepeatedSegment[];
}
