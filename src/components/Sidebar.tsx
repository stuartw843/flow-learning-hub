import React, { useState, useRef } from 'react';
import { Plus, Pencil, Trash2, Check, X, GripVertical } from 'lucide-react';
import type { Module } from '../services/moduleService';

interface SidebarProps {
  modules: Module[];
  selectedModule: Module | null;
  onSelectModule: (module: Module) => void;
  onAddModule: () => void;
  onUpdateTitle: (id: number, title: string) => void;
  onDeleteModule: (id: number) => void;
  onReorderModules: (orderedIds: number[]) => void;
}

function Sidebar({ 
  modules, 
  selectedModule, 
  onSelectModule, 
  onAddModule, 
  onUpdateTitle, 
  onDeleteModule,
  onReorderModules 
}: SidebarProps) {
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [draggedId, setDraggedId] = useState<number | null>(null);
  const navRef = useRef<HTMLElement>(null);

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

  const handleDragStart = (e: React.DragEvent, moduleId: number) => {
    setDraggedId(moduleId);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  const handleDrop = (e: React.DragEvent, targetId: number) => {
    e.preventDefault();
    if (draggedId === null || draggedId === targetId) return;

    const currentModules = [...modules];
    const draggedIndex = currentModules.findIndex(m => m.id === draggedId);
    const targetIndex = currentModules.findIndex(m => m.id === targetId);
    
    if (draggedIndex === -1 || targetIndex === -1) return;

    // Remove dragged item and insert at new position
    const [draggedItem] = currentModules.splice(draggedIndex, 1);
    currentModules.splice(targetIndex, 0, draggedItem);

    // Update order in backend
    const orderedIds = currentModules.map(m => m.id!);
    onReorderModules(orderedIds);
    setDraggedId(null);
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
    <div className="hidden lg:flex w-64 bg-gray-800 text-white overflow-y-auto flex-col">
      <div className="p-4 flex items-center justify-between">
        <h2 className="text-lg font-semibold">Modules</h2>
        <button
          onClick={onAddModule}
          className="p-2 hover:bg-gray-700 rounded-lg transition-colors"
          aria-label="Add new module"
        >
          <Plus size={20} />
        </button>
      </div>
      
      <nav ref={navRef} className="flex-1">
        <ul className="space-y-1 px-2">
          {modules.map((module) => (
            <li 
              key={module.id} 
              className="group"
              draggable={editingId !== module.id}
              onDragStart={(e) => module.id && handleDragStart(e, module.id)}
              onDragOver={handleDragOver}
              onDrop={(e) => module.id && handleDrop(e, module.id)}
            >
              {editingId === module.id ? (
                <div className="flex items-center px-2 py-1 rounded-lg bg-gray-700">
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
                } ${draggedId === module.id ? 'opacity-50' : ''}`}>
                  <div className="px-2 cursor-grab">
                    <GripVertical size={16} className="text-gray-400" />
                  </div>
                  <button
                    onClick={() => handleModuleSelect(module)}
                    className="flex-1 text-left px-2 py-2"
                  >
                    {module.title}
                  </button>
                  <div className="opacity-0 group-hover:opacity-100 flex pr-2">
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

export default Sidebar;
