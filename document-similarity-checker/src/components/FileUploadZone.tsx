import React, { useCallback, useRef, useState } from 'react';

interface FileUploadZoneProps {
  onFilesAdded: (files: File[]) => void;
}

export const FileUploadZone: React.FC<FileUploadZoneProps> = ({ onFilesAdded }) => {
  const [isDragging, setIsDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      const files = Array.from(e.dataTransfer.files).filter(
        (f) => f.name.endsWith('.docx') || f.name.endsWith('.doc')
      );
      if (files.length > 0) onFilesAdded(files);
    },
    [onFilesAdded]
  );

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []).filter(
      (f) => f.name.endsWith('.docx') || f.name.endsWith('.doc')
    );
    if (files.length > 0) onFilesAdded(files);
    if (inputRef.current) inputRef.current.value = '';
  };

  return (
    <div
      className={`relative border-2 border-dashed rounded-2xl p-10 text-center cursor-pointer transition-all duration-200 ${
        isDragging
          ? 'border-blue-500 bg-blue-50 scale-[1.01]'
          : 'border-gray-300 bg-gray-50 hover:border-blue-400 hover:bg-blue-50/40'
      }`}
      onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
      onDragLeave={() => setIsDragging(false)}
      onDrop={handleDrop}
      onClick={() => inputRef.current?.click()}
    >
      <input
        ref={inputRef}
        type="file"
        accept=".doc,.docx"
        multiple
        className="hidden"
        onChange={handleFileInput}
      />
      <div className="flex flex-col items-center gap-3">
        <div className={`w-16 h-16 rounded-full flex items-center justify-center transition-all duration-200 ${isDragging ? 'bg-blue-100' : 'bg-white shadow'}`}>
          <svg className={`w-8 h-8 ${isDragging ? 'text-blue-500' : 'text-gray-400'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 13h6m-3-3v6m5 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
        </div>
        <div>
          <p className="text-base font-semibold text-gray-700">
            {isDragging ? '松开以上传文件' : '点击或拖拽上传 Word 文档'}
          </p>
          <p className="text-sm text-gray-400 mt-1">支持 .doc / .docx 格式，可同时上传多个文件</p>
        </div>
        <button
          type="button"
          className="mt-2 px-5 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors shadow-sm"
          onClick={(e) => { e.stopPropagation(); inputRef.current?.click(); }}
        >
          选择文件
        </button>
      </div>
    </div>
  );
};
