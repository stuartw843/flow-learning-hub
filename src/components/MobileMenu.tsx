import React, { useState, useRef } from 'react';
import { Plus, Pencil, Trash2, Check, X } from 'lucide-react';
import type { Module } from '../services/moduleService';

interface MobileMenuProps {
  isOpen: boolean;
  modules: Module[];
  selectedModule: Module | null;
  onSelectModule: (module: Module) => void;
  onAddModule: () => void;
  onUpdateTitle: (id: number, title: string) => void;
  onDeleteModule: (id: number) => void;
}

function MobileMenu({ isOpen, modules, selectedModule, onSelectModule, onAddModule, onUpdateTitle, onDeleteModule }: MobileMenuProps) {
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const navRef = useRef<HTMLElement>(null);

  if (!isOpen) return null;

  const startEditing = (module: Module) => {
    if (module.id) {
      setEditingId(module.id);
      setEditTitle(module.title);
    }
  };

  const saveTitle = (id: number) => {
    if (editTitle.trim()) {
      onUpdateTitle(id, editTitle.trim());
    }
    setEditingId(null);
  };

  const handleModuleSelect = (module: Module) => {
    const currentScroll = navRef.current?.scrollTop;
    onSelectModule(module);
    if (navRef.current && currentScroll !== undefined) {
      requestAnimationFrame(() => {
        if (navRef.current) {
          navRef.current.scrollTop = currentScroll;
        }
      });
    }
  };

  return (
    <div className="lg:hidden fixed inset-x-0 top-[57px] bg-gray-800 text-white z-40 max-h-[70vh] overflow-y-auto">
      <div className="p-4 flex items-center justify-between border-b border-gray-700">
        <h2 className="text-lg font-semibold">Modules</h2>
        <button
          onClick={onAddModule}
          className="p-2 hover:bg-gray-700 rounded-lg transition-colors"
          aria-label="Add new module"
        >
          <Plus size={20} />
        </button>
      </div>
      
      <nav ref={navRef} className="p-2">
        <ul className="space-y-1">
          {modules.map((module) => (
            <li key={module.id} className="group">
              {editingId === module.id ? (
                <div className="flex items-center px-2 py-2 rounded-lg bg-gray-700">
                  <input
                    type="text"
                    value={editTitle}
                    onChange={(e) => setEditTitle(e.target.value)}
                    className="flex-1 bg-transparent border-none focus:ring-0 text-white"
                    autoFocus
                  />
                  <button
                    onClick={() => module.id && saveTitle(module.id)}
                    className="p-1 hover:bg-gray-600 rounded-lg ml-1"
                  >
                    <Check size={16} />
                  </button>
                  <button
                    onClick={() => setEditingId(null)}
                    className="p-1 hover:bg-gray-600 rounded-lg ml-1"
                  >
                    <X size={16} />
                  </button>
                </div>
              ) : (
                <div className={`flex items-center rounded-lg transition-colors ${
                  selectedModule?.id === module.id
                    ? 'bg-indigo-600 text-white'
                    : 'hover:bg-gray-700'
                }`}>
                  <button
                    onClick={() => handleModuleSelect(module)}
                    className="flex-1 text-left px-4 py-3"
                  >
                    {module.title}
                  </button>
                  <div className="flex pr-2">
                    <button
                      onClick={() => startEditing(module)}
                      className="p-1 hover:bg-gray-600 rounded-lg ml-1"
                    >
                      <Pencil size={16} />
                    </button>
                    <button
                      onClick={() => module.id && onDeleteModule(module.id)}
                      className="p-1 hover:bg-gray-600 rounded-lg ml-1"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
              )}
            </li>
          ))}
        </ul>
      </nav>
    </div>
  );
}

export default MobileMenu;
