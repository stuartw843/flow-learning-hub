import React, { useEffect, useRef, useState } from 'react';
import Quill from 'quill';
import 'quill/dist/quill.snow.css';

interface EditorProps {
  moduleId: number;
  content: string;
  plainContent: string;
  title: string;
  onChange: (content: string, plainContent?: string) => void;
  editMode: boolean;
}

function Editor({ moduleId, content, plainContent, title, onChange, editMode }: EditorProps) {
  const editorRef = useRef<HTMLDivElement>(null);
  const quillRef = useRef<Quill | null>(null);
  const saveTimeoutRef = useRef<NodeJS.Timeout>();
  const isLoadingRef = useRef(false);
  const [saveStatus, setSaveStatus] = useState<'saved' | 'saving'>('saved');
  const [localPlainContent, setLocalPlainContent] = useState('');

  // Reset local state when module changes
  useEffect(() => {
    isLoadingRef.current = true;
    setLocalPlainContent(plainContent || '');
    setSaveStatus('saved');
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }
    // Reset loading flag after state updates
    setTimeout(() => {
      isLoadingRef.current = false;
    }, 0);
  }, [moduleId]);

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
        toolbar: editMode ? toolbarOptions : false
      },
      theme: 'snow',
      placeholder: editMode ? 'Start writing your content...' : '',
      readOnly: !editMode
    });

    quillRef.current = quill;
    
    // Set initial content
    isLoadingRef.current = true;
    quill.root.innerHTML = content;
    setTimeout(() => {
      isLoadingRef.current = false;
    }, 0);

    const handleTextChange = () => {
      if (!editMode || isLoadingRef.current) return;
      
      setSaveStatus('saving');
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }

      saveTimeoutRef.current = setTimeout(() => {
        onChange(quill.root.innerHTML, localPlainContent);
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
  }, [moduleId, editMode]);

  // Update content when it changes externally
  useEffect(() => {
    if (quillRef.current && content !== quillRef.current.root.innerHTML) {
      isLoadingRef.current = true;
      quillRef.current.root.innerHTML = content;
      setTimeout(() => {
        isLoadingRef.current = false;
      }, 0);
    }
  }, [content]);

  const handlePlainContentChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    if (!editMode || isLoadingRef.current) return;
    
    const newContent = e.target.value;
    setLocalPlainContent(newContent);
    setSaveStatus('saving');
    
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }

    saveTimeoutRef.current = setTimeout(() => {
      onChange(quillRef.current?.root.innerHTML || '', newContent);
      setSaveStatus('saved');
    }, 1000);
  };

  return (
    <div className="flex flex-col h-full relative">
      <style>
        {`
          .ql-container {
            font-size: 16px;
            height: ${editMode ? 'calc(80%)' : '100%'} !important;
          }
          .ql-toolbar {
            display: ${editMode ? 'block' : 'none'};
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
          .ql-editor.ql-blank::before {
            display: ${editMode ? 'block' : 'none'};
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
            display: ${editMode ? 'block' : 'none'};
          }
        `}
      </style>
      <div ref={editorRef} className="h-3/4" />
      {editMode && (
        <textarea
          key={moduleId}
          value={localPlainContent}
          onChange={handlePlainContentChange}
          className="h-1/4 p-6 border-t border-gray-200 resize-none focus:outline-none focus:ring-2 focus:ring-indigo-500"
          placeholder="Add plain text content here..."
        />
      )}
      {!editMode && plainContent && (
        <div className="h-1/2 p-6 border-t border-gray-200 whitespace-pre-wrap">
          {plainContent}
        </div>
      )}
      {editMode && (
        <div className="save-status">
          {saveStatus === 'saving' ? 'Saving...' : 'Saved'}
        </div>
      )}
    </div>
  );
}

export default Editor;
