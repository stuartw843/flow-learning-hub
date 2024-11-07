import React from 'react';
import { Editor } from '@tiptap/react';
import {
  Bold,
  Italic,
  List,
  ListOrdered,
  Quote,
  Heading1,
  Heading2,
  Link as LinkIcon,
  Code,
  Highlighter,
  Undo,
  Redo,
} from 'lucide-react';

interface EditorMenuProps {
  editor: Editor;
}

function EditorMenu({ editor }: EditorMenuProps) {
  const addLink = () => {
    const url = window.prompt('Enter URL:');
    if (url) {
      editor.chain().focus().setLink({ href: url }).run();
    }
  };

  const MenuButton = ({ 
    onClick, 
    isActive = false, 
    disabled = false,
    children,
    title
  }: {
    onClick: () => void;
    isActive?: boolean;
    disabled?: boolean;
    children: React.ReactNode;
    title: string;
  }) => (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`p-2 rounded-lg transition-colors ${
        isActive 
          ? 'bg-indigo-100 text-indigo-600' 
          : 'hover:bg-gray-100 text-gray-700'
      } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
      title={title}
    >
      {children}
    </button>
  );

  return (
    <div className="border-b border-gray-200 bg-white sticky top-0 z-10">
      <div className="px-4 py-2 flex flex-wrap gap-1">
        <div className="flex items-center space-x-1 mr-4">
          <MenuButton
            onClick={() => editor.chain().focus().toggleBold().run()}
            isActive={editor.isActive('bold')}
            title="Bold"
          >
            <Bold size={18} />
          </MenuButton>
          <MenuButton
            onClick={() => editor.chain().focus().toggleItalic().run()}
            isActive={editor.isActive('italic')}
            title="Italic"
          >
            <Italic size={18} />
          </MenuButton>
          <MenuButton
            onClick={() => editor.chain().focus().toggleCode().run()}
            isActive={editor.isActive('code')}
            title="Code"
          >
            <Code size={18} />
          </MenuButton>
          <MenuButton
            onClick={() => editor.chain().focus().toggleHighlight().run()}
            isActive={editor.isActive('highlight')}
            title="Highlight"
          >
            <Highlighter size={18} />
          </MenuButton>
        </div>

        <div className="flex items-center space-x-1 mr-4">
          <MenuButton
            onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
            isActive={editor.isActive('heading', { level: 1 })}
            title="Heading 1"
          >
            <Heading1 size={18} />
          </MenuButton>
          <MenuButton
            onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
            isActive={editor.isActive('heading', { level: 2 })}
            title="Heading 2"
          >
            <Heading2 size={18} />
          </MenuButton>
        </div>

        <div className="flex items-center space-x-1 mr-4">
          <MenuButton
            onClick={() => editor.chain().focus().toggleBulletList().run()}
            isActive={editor.isActive('bulletList')}
            title="Bullet List"
          >
            <List size={18} />
          </MenuButton>
          <MenuButton
            onClick={() => editor.chain().focus().toggleOrderedList().run()}
            isActive={editor.isActive('orderedList')}
            title="Numbered List"
          >
            <ListOrdered size={18} />
          </MenuButton>
          <MenuButton
            onClick={() => editor.chain().focus().toggleBlockquote().run()}
            isActive={editor.isActive('blockquote')}
            title="Quote"
          >
            <Quote size={18} />
          </MenuButton>
          <MenuButton
            onClick={addLink}
            isActive={editor.isActive('link')}
            title="Add Link"
          >
            <LinkIcon size={18} />
          </MenuButton>
        </div>

        <div className="flex items-center space-x-1">
          <MenuButton
            onClick={() => editor.chain().focus().undo().run()}
            disabled={!editor.can().undo()}
            title="Undo"
          >
            <Undo size={18} />
          </MenuButton>
          <MenuButton
            onClick={() => editor.chain().focus().redo().run()}
            disabled={!editor.can().redo()}
            title="Redo"
          >
            <Redo size={18} />
          </MenuButton>
        </div>
      </div>
    </div>
  );
}

export default EditorMenu;