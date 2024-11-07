const API_URL = 'http://localhost:3001/api/modules';

export interface Module {
  id?: number;
  title: string;
  content: string;
  plain_content: string;
  display_order?: number;
  created_at?: string;
  updated_at?: string;
}

export interface ModuleUpdate {
  title?: string;
  content?: string;
  plain_content?: string;
}

export const moduleService = {
  async getAll(): Promise<Module[]> {
    const response = await fetch(API_URL);
    if (!response.ok) throw new Error('Failed to fetch modules');
    return response.json();
  },

  async getById(id: number): Promise<Module> {
    const response = await fetch(`${API_URL}/${id}`);
    if (!response.ok) throw new Error('Failed to fetch module');
    return response.json();
  },

  async create(module: Module): Promise<Module> {
    const response = await fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(module)
    });
    if (!response.ok) throw new Error('Failed to create module');
    return response.json();
  },

  async update(id: number, module: ModuleUpdate): Promise<Module> {
    const response = await fetch(`${API_URL}/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(module)
    });
    if (!response.ok) {
      console.error('Update failed:', response.status, response.statusText);
      throw new Error('Failed to update module');
    }
    const result = await response.json();
    return result;
  },

  async delete(id: number): Promise<void> {
    const response = await fetch(`${API_URL}/${id}`, {
      method: 'DELETE'
    });
    if (!response.ok) throw new Error('Failed to delete module');
  },

  async reorder(orderedIds: number[]): Promise<Module[]> {
    const response = await fetch(`${API_URL}/reorder`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ orderedIds })
    });
    if (!response.ok) throw new Error('Failed to reorder modules');
    return response.json();
  }
};
