import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Story, Message, Character, ExportSettings, ThemeId } from '@/lib/types';
import { api } from '@/lib/api';

const DEFAULT_SETTINGS: ExportSettings = {
  format: '1080x1920',
  withCaptions: true,
  withWatermark: true,
  withFictionSeal: true,
  withMusic: false,
  musicVolume: 0.15,
  narrationVolume: 1,
  messageSpeed: 1,
};

interface StudioState {
  projectId: string | null;
  story: Story | null;
  settings: ExportSettings;
  voice: string;
  audioBuffers: Map<string, AudioBuffer>;
  dirty: boolean;

  setStory: (s: Story) => void;
  patchStory: (p: Partial<Story>) => void;
  setTheme: (t: ThemeId) => void;
  updateMessage: (id: string, p: Partial<Message>) => void;
  addMessage: (afterId?: string) => void;
  removeMessage: (id: string) => void;
  moveMessage: (id: string, dir: -1 | 1) => void;
  updateCharacter: (id: string, p: Partial<Character>) => void;

  setSettings: (p: Partial<ExportSettings>) => void;
  setVoice: (v: string) => void;
  setAudioBuffers: (m: Map<string, AudioBuffer>, messages: Message[]) => void;

  save: () => Promise<void>;
  load: (id: string) => Promise<void>;
  reset: () => void;
}

export const useStudio = create<StudioState>()(
  persist(
    (set, get) => ({
      projectId: null,
      story: null,
      settings: DEFAULT_SETTINGS,
      voice: 'narradora_fem',
      audioBuffers: new Map(),
      dirty: false,

      setStory: (s) => set({ story: s, projectId: s.id, dirty: true }),
      patchStory: (p) => set((st) => (st.story ? { story: { ...st.story, ...p }, dirty: true } : {})),
      setTheme: (t) => set((st) => (st.story ? { story: { ...st.story, theme: t }, dirty: true } : {})),

      updateMessage: (id, p) =>
        set((st) =>
          st.story
            ? { story: { ...st.story, messages: st.story.messages.map((m) => (m.id === id ? { ...m, ...p } : m)) }, dirty: true }
            : {}
        ),

      addMessage: (afterId) =>
        set((st) => {
          if (!st.story) return {};
          const idx = afterId ? st.story.messages.findIndex((m) => m.id === afterId) : st.story.messages.length - 1;
          const sender = st.story.characters[(idx + 1) % st.story.characters.length]?.id || st.story.characters[0].id;
          const nm: Message = {
            id: 'm' + Math.random().toString(36).slice(2, 8),
            sender, type: 'text', text: 'Nova mensagem', emotion: 'neutro',
            delay: 1, time: '21:50', status: 'read',
          };
          const messages = [...st.story.messages];
          messages.splice(idx + 1, 0, nm);
          return { story: { ...st.story, messages }, dirty: true };
        }),

      removeMessage: (id) =>
        set((st) => (st.story ? { story: { ...st.story, messages: st.story.messages.filter((m) => m.id !== id) }, dirty: true } : {})),

      moveMessage: (id, dir) =>
        set((st) => {
          if (!st.story) return {};
          const msgs = [...st.story.messages];
          const i = msgs.findIndex((m) => m.id === id);
          const j = i + dir;
          if (i < 0 || j < 0 || j >= msgs.length) return {};
          [msgs[i], msgs[j]] = [msgs[j], msgs[i]];
          return { story: { ...st.story, messages: msgs }, dirty: true };
        }),

      updateCharacter: (id, p) =>
        set((st) =>
          st.story
            ? { story: { ...st.story, characters: st.story.characters.map((c) => (c.id === id ? { ...c, ...p } : c)) }, dirty: true }
            : {}
        ),

      setSettings: (p) => set((st) => ({ settings: { ...st.settings, ...p } })),
      setVoice: (v) => set({ voice: v }),
      setAudioBuffers: (m, messages) =>
        set((st) => ({ audioBuffers: m, story: st.story ? { ...st.story, messages } : st.story })),

      save: async () => {
        const { story, settings } = get();
        if (!story) return;
        await api.saveProject(story.id, {
          title: story.title,
          status: 'draft',
          format: settings.format,
          story,
        });
        set({ dirty: false });
      },

      load: async (id) => {
        const { project } = await api.getProject(id);
        if (project?.story) set({ story: project.story, projectId: project.id, dirty: false });
      },

      reset: () => set({ story: null, projectId: null, audioBuffers: new Map(), dirty: false }),
    }),
    {
      name: 'cvs-studio',
      // don't persist audio buffers (not serializable)
      partialize: (s) => ({ story: s.story, settings: s.settings, voice: s.voice, projectId: s.projectId }),
    }
  )
);
