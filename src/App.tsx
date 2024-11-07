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

  // Load modules on mount
  useEffect(() => {
    loadModules();
  }, []);

  const loadModules = async () => {
    try {
      setIsLoading(true);
      const loadedModules = await moduleService.getAll();
      console.log('Loaded modules:', loadedModules);
      setModules(loadedModules);
      if (loadedModules.length > 0 && !selectedModule) {
        setSelectedModule(loadedModules[0]);
        console.log('Initial selected module:', loadedModules[0]);
      }
    } catch (err) {
      setError('Failed to load modules');
      console.error('Load modules error:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const addModule = async () => {
    try {
      const newModule = {
        title: `New Module ${modules.length + 1}`,
        content: 'Start writing your content here...',
      };
      console.log('Creating new module:', newModule);
      const created = await moduleService.create(newModule);
      console.log('Created module:', created);
      setModules([...modules, created]);
      setSelectedModule(created);
      console.log('Selected module after creation:', created);
    } catch (err) {
      setError('Failed to create module');
      console.error('Create module error:', err);
    }
  };

  const updateModuleContent = async (content: string) => {
    if (!selectedModule?.id) return;
    console.log('Updating module content:', { moduleId: selectedModule.id, content: content.substring(0, 100) + '...' });
    try {
      const updated = await moduleService.update(selectedModule.id, {
        title: selectedModule.title,
        content
      });
      console.log('Module content updated:', updated);
      setModules(prevModules => 
        prevModules.map(mod => mod.id === updated.id ? updated : mod)
      );
      setSelectedModule(updated);
      console.log('Selected module after content update:', updated);
    } catch (err) {
      setError('Failed to update module content');
      console.error('Update content error:', err);
    }
  };

  const updateModuleTitle = async (id: number, title: string) => {
    const module = modules.find(m => m.id === id);
    if (!module) return;
    console.log('Updating module title:', { moduleId: id, title });
    try {
      const updated = await moduleService.update(id, {
        title,
        content: module.content
      });
      console.log('Module title updated:', updated);
      setModules(prevModules => 
        prevModules.map(mod => mod.id === updated.id ? updated : mod)
      );
      if (selectedModule?.id === id) {
        setSelectedModule(updated);
        console.log('Selected module after title update:', updated);
      }
    } catch (err) {
      setError('Failed to update module title');
      console.error('Update title error:', err);
    }
  };

  const deleteModule = async (id: number) => {
    console.log('Deleting module:', id);
    try {
      await moduleService.delete(id);
      console.log('Module deleted:', id);
      const newModules = modules.filter(mod => mod.id !== id);
      setModules(newModules);
      if (selectedModule?.id === id && newModules.length > 0) {
        setSelectedModule(newModules[0]);
        console.log('Selected module after deletion:', newModules[0]);
      } else if (newModules.length === 0) {
        setSelectedModule(null);
        console.log('No modules left, selected module set to null');
      }
    } catch (err) {
      setError('Failed to delete module');
      console.error('Delete module error:', err);
    }
  };

  const handleModuleSelect = (module: Module) => {
    console.log('Selected module:', module);
    setSelectedModule(module);
    console.log('Selected module after selection:', module);
    setIsMobileMenuOpen(false);
  };

  const handleReorderModules = async (orderedIds: number[]) => {
    try {
      const updatedModules = await moduleService.reorder(orderedIds);
      console.log('Modules reordered:', updatedModules);
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
        />
        
        <main className="flex-1 overflow-auto bg-white">
          {selectedModule?.id && (
            <Editor
              moduleId={selectedModule.id}
              content={selectedModule.content}
              title={selectedModule.title}
              onChange={updateModuleContent}
            />
          )}
        </main>
      </div>
    </div>
  );
}

export default App;
