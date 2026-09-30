import type { SegmentRole } from "./segments";

/**
 * Como gravar cada parte para segurar quem assiste (docs/VIRAL_PLAYBOOK.md).
 * Aparece na tela de gravação, uma dica curta por vez.
 */
export const RECORDING_TIPS: Record<SegmentRole, string> = {
  hook: "Comece já falando no 1º segundo, olhando na lente, com energia. Nada de “oi, gente”.",
  e: "Conte a cena com detalhe real: onde, quando, o que você viu ou ouviu.",
  mas: "Mude o tom aqui: é a virada. Pode chegar mais perto da câmera.",
  por_isso: "Fale devagar a frase principal — é a que vão querer mandar para alguém.",
  cta: "Faça a pergunta olhando na lente, como se fosse para UMA pessoa.",
  closing: "Sorria e segure 1 segundo parado no final (ajuda o vídeo a repetir).",
  free: "Fale como se fosse para um amigo, frases curtas, sem pressa.",
};

/** Antes da 1ª parte: o básico que mais muda a qualidade de um vídeo falado no celular. */
export const RECORDING_CHECKLIST = "Luz de frente para o rosto · celular na altura dos olhos · rosto no terço de cima da tela · lugar sem eco";
