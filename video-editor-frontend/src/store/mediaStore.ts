import { create } from 'zustand';
import { devtools, persist } from 'zustand/middleware';
import type { MediaItem, MediaUploadProgress } from '../types';

interface MediaStore {
  // Media library
  mediaItems: MediaItem[];
  uploads: Map<string, MediaUploadProgress>;

  // Filters and search
  searchQuery: string;
  filterType: 'all' | 'video' | 'image' | 'audio';
  sortBy: 'name' | 'date' | 'size' | 'type';
  sortOrder: 'asc' | 'desc';

  // Media management
  addMediaItem: (item: MediaItem) => void;
  addMediaItems: (items: MediaItem[]) => void;
  removeMediaItem: (id: string) => void;
  updateMediaItem: (id: string, updates: Partial<MediaItem>) => void;
  getMediaItem: (id: string) => MediaItem | undefined;

  // Upload management
  addUpload: (upload: MediaUploadProgress) => void;
  updateUpload: (fileId: string, updates: Partial<MediaUploadProgress>) => void;
  removeUpload: (fileId: string) => void;
  clearCompletedUploads: () => void;

  // Filtering and sorting
  setSearchQuery: (query: string) => void;
  setFilterType: (type: 'all' | 'video' | 'image' | 'audio') => void;
  setSortBy: (sortBy: 'name' | 'date' | 'size' | 'type') => void;
  setSortOrder: (order: 'asc' | 'desc') => void;
  getFilteredMedia: () => MediaItem[];

  // Utilities
  getTotalSize: () => number;
  getMediaByType: (type: 'video' | 'image' | 'audio') => MediaItem[];
  clearAllMedia: () => void;
}

export const useMediaStore = create<MediaStore>()(
  devtools(
    persist(
      (set, get) => ({
        mediaItems: [],
        uploads: new Map(),
        searchQuery: '',
        filterType: 'all',
        sortBy: 'date',
        sortOrder: 'desc',

        // Media management
        addMediaItem: (item) => {
          set((state) => ({
            mediaItems: [...state.mediaItems, item],
          }));
        },

        addMediaItems: (items) => {
          set((state) => ({
            mediaItems: [...state.mediaItems, ...items],
          }));
        },

        removeMediaItem: (id) => {
          set((state) => ({
            mediaItems: state.mediaItems.filter((item) => item.id !== id),
          }));
        },

        updateMediaItem: (id, updates) => {
          set((state) => ({
            mediaItems: state.mediaItems.map((item) =>
              item.id === id ? { ...item, ...updates } : item
            ),
          }));
        },

        getMediaItem: (id) => {
          return get().mediaItems.find((item) => item.id === id);
        },

        // Upload management
        addUpload: (upload) => {
          set((state) => {
            const newUploads = new Map(state.uploads);
            newUploads.set(upload.fileId, upload);
            return { uploads: newUploads };
          });
        },

        updateUpload: (fileId, updates) => {
          set((state) => {
            const upload = state.uploads.get(fileId);
            if (!upload) return state;

            const newUploads = new Map(state.uploads);
            newUploads.set(fileId, { ...upload, ...updates });
            return { uploads: newUploads };
          });
        },

        removeUpload: (fileId) => {
          set((state) => {
            const newUploads = new Map(state.uploads);
            newUploads.delete(fileId);
            return { uploads: newUploads };
          });
        },

        clearCompletedUploads: () => {
          set((state) => {
            const newUploads = new Map(state.uploads);
            Array.from(newUploads.entries()).forEach(([id, upload]) => {
              if (upload.status === 'completed' || upload.status === 'failed') {
                newUploads.delete(id);
              }
            });
            return { uploads: newUploads };
          });
        },

        // Filtering and sorting
        setSearchQuery: (query) => {
          set({ searchQuery: query });
        },

        setFilterType: (type) => {
          set({ filterType: type });
        },

        setSortBy: (sortBy) => {
          set({ sortBy });
        },

        setSortOrder: (order) => {
          set({ sortOrder: order });
        },

        getFilteredMedia: () => {
          const { mediaItems, searchQuery, filterType, sortBy, sortOrder } = get();

          let filtered = [...mediaItems];

          // Apply type filter
          if (filterType !== 'all') {
            filtered = filtered.filter((item) => item.type === filterType);
          }

          // Apply search query
          if (searchQuery) {
            const query = searchQuery.toLowerCase();
            filtered = filtered.filter((item) => item.name.toLowerCase().includes(query));
          }

          // Apply sorting
          filtered.sort((a, b) => {
            let comparison = 0;

            switch (sortBy) {
              case 'name':
                comparison = a.name.localeCompare(b.name);
                break;
              case 'date':
                comparison = new Date(a.uploadedAt).getTime() - new Date(b.uploadedAt).getTime();
                break;
              case 'size':
                comparison = a.size - b.size;
                break;
              case 'type':
                comparison = a.type.localeCompare(b.type);
                break;
            }

            return sortOrder === 'asc' ? comparison : -comparison;
          });

          return filtered;
        },

        // Utilities
        getTotalSize: () => {
          return get().mediaItems.reduce((total, item) => total + item.size, 0);
        },

        getMediaByType: (type) => {
          return get().mediaItems.filter((item) => item.type === type);
        },

        clearAllMedia: () => {
          set({ mediaItems: [] });
        },
      }),
      {
        name: 'media-storage',
        partialize: (state) => ({
          mediaItems: state.mediaItems,
        }),
      }
    ),
    { name: 'MediaStore' }
  )
);
