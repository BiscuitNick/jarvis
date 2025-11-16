import type { TimelineState, MediaItem, SavedProject } from '../types';
import { v4 as uuidv4 } from 'uuid';

const STORAGE_VERSION = '1.0.0';
const STORAGE_KEYS = {
  CURRENT_PROJECT: 'videoeditor_current_project',
  PROJECTS_LIST: 'videoeditor_projects',
  AUTO_SAVE: 'videoeditor_autosave',
  SETTINGS: 'videoeditor_settings',
};

// Auto-save functionality
export class AutoSave {
  private saveTimeout: NodeJS.Timeout | null = null;
  private readonly SAVE_DELAY = 2000; // 2 seconds

  constructor(private onSave: () => void) {}

  trigger(): void {
    if (this.saveTimeout) {
      clearTimeout(this.saveTimeout);
    }

    this.saveTimeout = setTimeout(() => {
      this.onSave();
      this.saveTimeout = null;
    }, this.SAVE_DELAY);
  }

  flush(): void {
    if (this.saveTimeout) {
      clearTimeout(this.saveTimeout);
      this.onSave();
      this.saveTimeout = null;
    }
  }

  cancel(): void {
    if (this.saveTimeout) {
      clearTimeout(this.saveTimeout);
      this.saveTimeout = null;
    }
  }
}

// Project storage
export const ProjectStorage = {
  // Save current project
  saveProject: (
    name: string,
    timeline: TimelineState,
    media: MediaItem[],
    id?: string
  ): SavedProject => {
    const project: SavedProject = {
      id: id || uuidv4(),
      name,
      timeline,
      media,
      savedAt: new Date().toISOString(),
      version: STORAGE_VERSION,
    };

    // Save to localStorage
    localStorage.setItem(STORAGE_KEYS.CURRENT_PROJECT, JSON.stringify(project));

    // Add to projects list
    const projects = ProjectStorage.getProjectsList();
    const existingIndex = projects.findIndex((p) => p.id === project.id);

    if (existingIndex >= 0) {
      projects[existingIndex] = project;
    } else {
      projects.push(project);
    }

    localStorage.setItem(STORAGE_KEYS.PROJECTS_LIST, JSON.stringify(projects));

    return project;
  },

  // Load current project
  loadCurrentProject: (): SavedProject | null => {
    try {
      const data = localStorage.getItem(STORAGE_KEYS.CURRENT_PROJECT);
      if (!data) return null;

      const project = JSON.parse(data) as SavedProject;
      return project;
    } catch (error) {
      console.error('Failed to load current project:', error);
      return null;
    }
  },

  // Get list of all projects
  getProjectsList: (): SavedProject[] => {
    try {
      const data = localStorage.getItem(STORAGE_KEYS.PROJECTS_LIST);
      if (!data) return [];

      return JSON.parse(data) as SavedProject[];
    } catch (error) {
      console.error('Failed to load projects list:', error);
      return [];
    }
  },

  // Load specific project
  loadProject: (id: string): SavedProject | null => {
    const projects = ProjectStorage.getProjectsList();
    return projects.find((p) => p.id === id) || null;
  },

  // Delete project
  deleteProject: (id: string): void => {
    const projects = ProjectStorage.getProjectsList();
    const filtered = projects.filter((p) => p.id !== id);
    localStorage.setItem(STORAGE_KEYS.PROJECTS_LIST, JSON.stringify(filtered));

    // If deleting current project, clear it
    const current = ProjectStorage.loadCurrentProject();
    if (current?.id === id) {
      localStorage.removeItem(STORAGE_KEYS.CURRENT_PROJECT);
    }
  },

  // Clear current project
  clearCurrentProject: (): void => {
    localStorage.removeItem(STORAGE_KEYS.CURRENT_PROJECT);
  },

  // Export project as JSON file
  exportProject: (project: SavedProject): void => {
    const dataStr = JSON.stringify(project, null, 2);
    const blob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);

    const link = document.createElement('a');
    link.href = url;
    link.download = `${project.name.replace(/\s+/g, '_')}_${project.id}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    URL.revokeObjectURL(url);
  },

  // Import project from JSON file
  importProject: (file: File): Promise<SavedProject> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();

      reader.onload = (e) => {
        try {
          const project = JSON.parse(e.target?.result as string) as SavedProject;

          // Validate project structure
          if (!project.id || !project.name || !project.timeline) {
            throw new Error('Invalid project file');
          }

          // Generate new ID to avoid conflicts
          project.id = uuidv4();
          project.savedAt = new Date().toISOString();

          // Add to projects list
          const projects = ProjectStorage.getProjectsList();
          projects.push(project);
          localStorage.setItem(STORAGE_KEYS.PROJECTS_LIST, JSON.stringify(projects));

          resolve(project);
        } catch (error) {
          reject(new Error('Failed to parse project file'));
        }
      };

      reader.onerror = () => {
        reject(new Error('Failed to read file'));
      };

      reader.readAsText(file);
    });
  },
};

// Auto-save storage
export const AutoSaveStorage = {
  save: (timeline: TimelineState, media: MediaItem[]): void => {
    const data = {
      timeline,
      media,
      savedAt: new Date().toISOString(),
    };
    localStorage.setItem(STORAGE_KEYS.AUTO_SAVE, JSON.stringify(data));
  },

  load: (): { timeline: TimelineState; media: MediaItem[] } | null => {
    try {
      const data = localStorage.getItem(STORAGE_KEYS.AUTO_SAVE);
      if (!data) return null;

      return JSON.parse(data);
    } catch (error) {
      console.error('Failed to load auto-save:', error);
      return null;
    }
  },

  clear: (): void => {
    localStorage.removeItem(STORAGE_KEYS.AUTO_SAVE);
  },
};

// Settings storage
export interface EditorSettings {
  theme: 'light' | 'dark';
  snapEnabled: boolean;
  snapInterval: number;
  defaultTrackHeight: number;
  autoSaveEnabled: boolean;
  autoSaveInterval: number;
  showGrid: boolean;
  showRuler: boolean;
  defaultZoom: number;
}

const DEFAULT_SETTINGS: EditorSettings = {
  theme: 'dark',
  snapEnabled: true,
  snapInterval: 0.1,
  defaultTrackHeight: 120,
  autoSaveEnabled: true,
  autoSaveInterval: 30000, // 30 seconds
  showGrid: true,
  showRuler: true,
  defaultZoom: 50,
};

export const SettingsStorage = {
  save: (settings: Partial<EditorSettings>): void => {
    const current = SettingsStorage.load();
    const updated = { ...current, ...settings };
    localStorage.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify(updated));
  },

  load: (): EditorSettings => {
    try {
      const data = localStorage.getItem(STORAGE_KEYS.SETTINGS);
      if (!data) return DEFAULT_SETTINGS;

      return { ...DEFAULT_SETTINGS, ...JSON.parse(data) };
    } catch (error) {
      console.error('Failed to load settings:', error);
      return DEFAULT_SETTINGS;
    }
  },

  reset: (): void => {
    localStorage.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify(DEFAULT_SETTINGS));
  },
};

// Clear all storage
export const clearAllStorage = (): void => {
  Object.values(STORAGE_KEYS).forEach((key) => {
    localStorage.removeItem(key);
  });
};

// Get storage usage
export const getStorageUsage = (): { used: number; total: number; percentage: number } => {
  let used = 0;

  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key) {
      const value = localStorage.getItem(key);
      if (value) {
        used += key.length + value.length;
      }
    }
  }

  // Most browsers allow 5-10MB, we'll use 5MB as conservative estimate
  const total = 5 * 1024 * 1024; // 5MB in bytes

  return {
    used,
    total,
    percentage: (used / total) * 100,
  };
};
