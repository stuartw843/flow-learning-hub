import React, { useEffect, useRef, useState } from 'react';
import Quill from 'quill';
import 'quill/dist/quill.snow.css';

interface EditorProps {
  moduleId: number;
  content: string;
  title: string;
  onChange: (content: string) => void;
}

function Editor({ moduleId, content, title, onChange }: EditorProps) {
  const editorRef = useRef<HTMLDivElement>(null);
  const quillRef = useRef<Quill | null>(null);
  const saveTimeoutRef = useRef<NodeJS.Timeout>();
  const [saveStatus, setSaveStatus] = useState<'saved' | 'saving'>('saved');

  // Initialize Quill
  useEffect(() => {
    if (!editorRef.current) return;

    // Clean up existing instance if it exists
    if (quillRef.current) {
      quillRef.current.off('text-change');
      // Remove all Quill-related elements
      while (editorRef.current.firstChild) {
        editorRef.current.removeChild(editorRef.current.firstChild);
      }
      quillRef.current = null;
    }

    // Create fresh editor div
    const editorDiv = document.createElement('div');
    editorRef.current.appendChild(editorDiv);
    const toolbarOptions = [
      ['bold', 'italic', 'underline', 'strike'],
      ['blockquote', 'code-block'],
      [{ 'header': 1 }, { 'header': 2 }],
      [{ 'list': 'ordered'}, { 'list': 'bullet' }],
      [{ 'script': 'sub'}, { 'script': 'super' }],
      [{ 'indent': '-1'}, { 'indent': '+1' }],
      [{ 'direction': 'rtl' }],
      [{ 'size': ['small', false, 'large', 'huge'] }],
      [{ 'header': [1, 2, 3, 4, 5, 6, false] }],
      [{ 'color': [] }, { 'background': [] }],
      [{ 'font': [] }],
      [{ 'align': [] }],
      ['clean']
    ];

    const quill = new Quill(editorDiv, {
      modules: {
        toolbar: toolbarOptions
      },
      theme: 'snow',
      placeholder: 'Start writing your content...'
    });

    quillRef.current = quill;
    
    // Set initial content
    quill.root.innerHTML = content;

    const handleTextChange = () => {
      setSaveStatus('saving');
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }

      saveTimeoutRef.current = setTimeout(() => {
        onChange(quill.root.innerHTML);
        setSaveStatus('saved');
      }, 1000);
    };

    quill.on('text-change', handleTextChange);

    return () => {
      if (quillRef.current) {
        quillRef.current.off('text-change');
      }
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, [moduleId]);

  // Update content when it changes externally
  useEffect(() => {
    if (quillRef.current && content !== quillRef.current.root.innerHTML) {
      quillRef.current.root.innerHTML = content;
    }
  }, [content]);

  return (
    <div className="flex flex-col h-full relative">
      <style>
        {`
          .ql-container {
            font-size: 16px;
            height: calc(100% - 42px) !important;
          }
          .ql-toolbar {
            border-top: none !important;
            border-left: none !important;
            border-right: none !important;
            border-bottom: 1px solid #e5e7eb !important;
            background-color: #f9fafb;
            position: sticky;
            top: 0;
            z-index: 10;
          }
          .ql-editor {
            padding: 1.5rem;
            min-height: 100%;
          }
          .save-status {
            position: fixed;
            top: 7rem;
            right: 1rem;
            padding: 0.5rem 1rem;
            border-radius: 0.375rem;
            font-size: 0.875rem;
            color: #4b5563;
            background-color: ${saveStatus === 'saving' ? '#fef3c7' : '#f3f4f6'};
            transition: opacity 150ms ease-in-out;
          }
        `}
      </style>
      <div ref={editorRef} className="h-full" />
      <div className="save-status">
        {saveStatus === 'saving' ? 'Saving...' : 'Saved'}
      </div>
    </div>
  );
}

export default Editor;
