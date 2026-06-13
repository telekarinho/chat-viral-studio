import type { ThemeId } from './types';

// Visual inspired by popular messengers — NO official WhatsApp/Meta marks or assets.
// "Chat Verde" identity. All colors are our own.

export interface ChatTheme {
  id: ThemeId;
  label: string;
  // canvas + DOM colors
  headerBg: string;
  headerText: string;
  bg: string;            // conversation background
  bgPattern: string;     // subtle dot/overlay color
  bubbleOut: string;     // sent (right)
  bubbleOutText: string;
  bubbleIn: string;      // received (left)
  bubbleInText: string;
  meta: string;          // timestamps / checks
  accent: string;        // online dot, send button
  inputBg: string;
  inputText: string;
}

export const THEMES: Record<ThemeId, ChatTheme> = {
  verde: {
    id: 'verde',
    label: 'Chat Verde clássico',
    headerBg: '#075E54',
    headerText: '#FFFFFF',
    bg: '#ECE5DD',
    bgPattern: 'rgba(0,0,0,0.03)',
    bubbleOut: '#DCF8C6',
    bubbleOutText: '#0B141A',
    bubbleIn: '#FFFFFF',
    bubbleInText: '#0B141A',
    meta: '#667781',
    accent: '#25D366',
    inputBg: '#FFFFFF',
    inputText: '#0B141A',
  },
  escuro: {
    id: 'escuro',
    label: 'Chat Escuro',
    headerBg: '#1F2C34',
    headerText: '#E9EDEF',
    bg: '#0B141A',
    bgPattern: 'rgba(255,255,255,0.03)',
    bubbleOut: '#005C4B',
    bubbleOutText: '#E9EDEF',
    bubbleIn: '#202C33',
    bubbleInText: '#E9EDEF',
    meta: '#8696A0',
    accent: '#00A884',
    inputBg: '#202C33',
    inputText: '#E9EDEF',
  },
  business: {
    id: 'business',
    label: 'Chat Business',
    headerBg: '#0A66C2',
    headerText: '#FFFFFF',
    bg: '#F3F6F9',
    bgPattern: 'rgba(10,102,194,0.04)',
    bubbleOut: '#D6E9FF',
    bubbleOutText: '#0B2540',
    bubbleIn: '#FFFFFF',
    bubbleInText: '#0B2540',
    meta: '#5B7184',
    accent: '#0A66C2',
    inputBg: '#FFFFFF',
    inputText: '#0B2540',
  },
  minimalista: {
    id: 'minimalista',
    label: 'Chat Minimalista',
    headerBg: '#FFFFFF',
    headerText: '#111111',
    bg: '#FAFAFA',
    bgPattern: 'rgba(0,0,0,0.02)',
    bubbleOut: '#111111',
    bubbleOutText: '#FFFFFF',
    bubbleIn: '#EFEFEF',
    bubbleInText: '#111111',
    meta: '#9A9A9A',
    accent: '#111111',
    inputBg: '#F2F2F2',
    inputText: '#111111',
  },
};

export const THEME_LIST = Object.values(THEMES);
