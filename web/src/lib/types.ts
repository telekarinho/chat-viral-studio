export type Side = 'left' | 'right';
export type MsgType =
  | 'text' | 'audio' | 'image' | 'call_missed' | 'deleted' | 'system' | 'sticker';
export type Emotion =
  | 'neutro' | 'alegria' | 'raiva' | 'medo' | 'surpresa' | 'tristeza' | 'ironia';
export type MsgStatus = 'sent' | 'delivered' | 'read';
export type ThemeId = 'verde' | 'escuro' | 'business' | 'minimalista';

export interface Character {
  id: string;
  name: string;
  side: Side;
  online: boolean;
  avatarColor: string;
  avatarUrl?: string;
}

export interface Message {
  id: string;
  sender: string;       // Character.id
  type: MsgType;
  text: string;
  emotion: Emotion;
  delay: number;        // seconds before this message appears
  time: string;         // HH:MM
  status: MsgStatus;
  audioUrl?: string | null;   // data URL after TTS
  audioDuration?: number;     // seconds, measured after decode
  showTyping?: boolean;       // render "digitando..." before this msg
  reaction?: string;          // emoji reaction stuck on the bubble (❤️ 😂 😮 …)
  imageUrl?: string;          // data URL of an attached photo (for type:'image')
}

export interface ViralScore {
  hook: number; curiosity: number; retention: number;
  emotion: number; ending: number; part2: number; total: number;
  suggestions: string[];
}

export interface Story {
  id: string;
  title: string;
  hook: string;
  category: string;
  theme: ThemeId;
  characters: Character[];
  messages: Message[];
  narration: string;
  hashtags: string[];
  caption: string;
  part2_hook: string;
  fictionSeal: boolean;
  viralScore: ViralScore | null;
  targetDuration?: number;   // duração-alvo do vídeo em segundos (escolhida no Criar)
  seriesId?: string;         // agrupa as partes de uma mesma série (= id da parte 1)
  part?: number;             // número da parte na série (1, 2, 3…)
}

export interface ExportSettings {
  format: '1080x1920' | '720x1280' | '2160x3840';
  withCaptions: boolean;     // legendas estilo TikTok
  withWatermark: boolean;
  withFictionSeal: boolean;
  withMusic: boolean;
  musicVolume: number;       // 0..1
  narrationVolume: number;   // 0..1
  messageSpeed: number;      // multiplier
  voiceSpeed?: number;       // velocidade da leitura do TTS (1 = natural)
  watermarkText?: string;    // custom watermark label (defaults to "Chat Viral Studio")
  withNarrator?: boolean;    // locutor único narra a história toda (vozes por msg off)
  effect?: 'none' | 'hearts' | 'fire' | 'confetti' | 'sparkles';  // floating emoji overlay
  dramaticZoom?: boolean;    // slow ken-burns zoom over the video
  withCamera?: boolean;      // overlay the user's webcam (reaction)
  cameraCorner?: 'tl' | 'tr' | 'bl' | 'br';
}

export interface GenerateParams {
  category: string;
  duration: number;
  intensity: 'leve' | 'médio' | 'absurdo';
  emotion: string;
  ending: string;
  messageCount: number;
  platform?: 'curto' | 'longo';   // curto: TikTok/Reels/Shorts/Kwai · longo: YouTube/Facebook
}
