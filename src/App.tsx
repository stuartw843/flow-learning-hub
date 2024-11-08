import React, { useState, useEffect } from 'react';
import { Menu, BookOpen } from 'lucide-react';
import Sidebar from './components/Sidebar';
import Editor from './components/Editor';
import MobileMenu from './components/MobileMenu';
import { moduleService, Module } from './services/moduleService';

function App() {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [modules, setModules] = useState<Module[]>([]);
  const [selectedModule, setSelectedModule] = useState<Module | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editMode, setEditMode] = useState(false);

  // Check URL parameter for edit mode
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setEditMode(params.get('edit') === 'true');
  }, []);

  // Load modules on mount
  useEffect(() => {
    loadModules();
  }, []);

  const loadModules = async () => {
    try {
      setIsLoading(true);
      const loadedModules = await moduleService.getAll();
      
      setModules(loadedModules);
      if (loadedModules.length > 0 && !selectedModule) {
        setSelectedModule(loadedModules[0]);
      }
    } catch (err) {
      setError('Failed to load modules');
      console.error('Load modules error:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const addModule = async () => {
    if (!editMode) return;
    try {
      const newModule = {
        title: `New Module ${modules.length + 1}`,
        content: 'Start writing your content here...',
        plain_content: '',
        style: '',
        persona: ''
      };
      
      const created = await moduleService.create(newModule);
      
      setModules([...modules, created]);
      setSelectedModule(created);
      
    } catch (err) {
      setError('Failed to create module');
      console.error('Create module error:', err);
    }
  };

  const updateModuleContent = async (content: string, plain_content?: string, style?: string, persona?: string) => {
    if (!editMode || !selectedModule?.id) return;
    
    try {
      const updated = await moduleService.update(selectedModule.id, {
        title: selectedModule.title,
        content,
        ...(plain_content !== undefined && { plain_content }),
        ...(style !== undefined && { style }),
        ...(persona !== undefined && { persona })
      });
      
      setModules(prevModules => 
        prevModules.map(mod => mod.id === updated.id ? updated : mod)
      );
      setSelectedModule(updated);
      
    } catch (err) {
      setError('Failed to update module content');
      console.error('Update content error:', err);
    }
  };

  const updateModuleTitle = async (id: number, title: string) => {
    if (!editMode) return;
    const module = modules.find(m => m.id === id);
    if (!module) return;
    
    try {
      const updated = await moduleService.update(id, {
        title,
        content: module.content,
        plain_content: module.plain_content,
        style: module.style,
        persona: module.persona
      });
      
      setModules(prevModules => 
        prevModules.map(mod => mod.id === updated.id ? updated : mod)
      );
      if (selectedModule?.id === id) {
        setSelectedModule(updated);
      }
    } catch (err) {
      setError('Failed to update module title');
      console.error('Update title error:', err);
    }
  };

  const deleteModule = async (id: number) => {
    if (!editMode) return;
    
    try {
      await moduleService.delete(id);
      
      const newModules = modules.filter(mod => mod.id !== id);
      setModules(newModules);
      if (selectedModule?.id === id && newModules.length > 0) {
        setSelectedModule(newModules[0]);
      } else if (newModules.length === 0) {
        setSelectedModule(null);
      }
    } catch (err) {
      setError('Failed to delete module');
      console.error('Delete module error:', err);
    }
  };

  const handleModuleSelect = (module: Module) => {
    setSelectedModule(module);
    setIsMobileMenuOpen(false);
  };

  const handleReorderModules = async (orderedIds: number[]) => {
    if (!editMode) return;
    try {
      const updatedModules = await moduleService.reorder(orderedIds);
      setModules(updatedModules);
    } catch (err) {
      setError('Failed to reorder modules');
      console.error('Reorder modules error:', err);
    }
  };

  if (isLoading) {
    return (
      <div className="h-screen flex items-center justify-center">
        <div className="text-gray-600">Loading...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="h-screen flex items-center justify-center">
        <div className="text-red-600">{error}</div>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col bg-gray-50">
      <nav className="bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between relative z-50">
        <div className="flex items-center space-x-3">
          <button
            onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
            className="p-2 hover:bg-gray-100 rounded-lg lg:hidden"
            aria-label="Toggle menu"
          >
            <Menu size={24} />
          </button>
          <div className="flex items-center space-x-2">
            <BookOpen className="text-indigo-600" size={24} />
            <h1 className="text-xl font-semibold text-gray-800">Learning Hub</h1>
          </div>
        </div>
        <div className="flex items-center">
          <span className="text-sm text-gray-600 hidden sm:block">
            Current: {selectedModule?.title}
          </span>
        </div>
      </nav>

      <MobileMenu
        isOpen={isMobileMenuOpen}
        modules={modules}
        selectedModule={selectedModule}
        onSelectModule={handleModuleSelect}
        onAddModule={addModule}
        onUpdateTitle={updateModuleTitle}
        onDeleteModule={deleteModule}
        editMode={editMode}
      />

      <div className="flex-1 flex overflow-hidden">
        <Sidebar
          modules={modules}
          selectedModule={selectedModule}
          onSelectModule={handleModuleSelect}
          onAddModule={addModule}
          onUpdateTitle={updateModuleTitle}
          onDeleteModule={deleteModule}
          onReorderModules={handleReorderModules}
          editMode={editMode}
        />
        
        <main className="flex-1 overflow-auto bg-white">
          {selectedModule?.id && (
            <Editor
              moduleId={selectedModule.id}
              content={selectedModule.content}
              plainContent={selectedModule.plain_content}
              style={selectedModule.style}
              persona={selectedModule.persona}
              title={selectedModule.title}
              onChange={updateModuleContent}
              editMode={editMode}
            />
          )}
        </main>
      </div>
    </div>
  );
}

export default App;
