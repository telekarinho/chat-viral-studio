import { requireOptionalNativeModule } from "expo";

interface PostaiShareNative {
  shareVideo(contentUri: string, packageName: string | null, text: string | null): Promise<boolean>;
}

/** null fora do APK (Expo Go / testes): o app usa o seletor padrão do sistema. */
export const PostaiShare = requireOptionalNativeModule<PostaiShareNative>("PostaiShare");
