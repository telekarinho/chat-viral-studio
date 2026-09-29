import { Skia } from "@shopify/react-native-skia";

/**
 * Live "retoque leve" for the camera preview (SkSL, runs on the GPU): edge-preserving smoothing
 * restricted to skin tones (YCbCr), plus a small light lift. Eyes, beard and edges stay sharp.
 * The recorded file is never altered; the final video gets the equivalent FFmpeg retouch.
 */
const SKSL = `
uniform shader image;
uniform float2 texel;
uniform float strength;

half4 main(float2 xy) {
  half4 c = image.eval(xy);
  half3 sum = c.rgb;
  half wsum = 1.0;
  for (int i = -2; i <= 2; i++) {
    for (int j = -2; j <= 2; j++) {
      if (i == 0 && j == 0) continue;
      half4 s = image.eval(xy + float2(float(i), float(j)) * texel);
      half d = distance(s.rgb, c.rgb);
      half w = exp(-d * d * 60.0);
      sum += s.rgb * w;
      wsum += w;
    }
  }
  half3 smoothed = sum / wsum;
  half cb = -0.1687 * c.r - 0.3313 * c.g + 0.5 * c.b;
  half cr = 0.5 * c.r - 0.4187 * c.g - 0.0813 * c.b;
  half skin = smoothstep(0.015, 0.07, cr) * (1.0 - smoothstep(0.02, 0.14, abs(cb + 0.05)));
  half3 outc = mix(c.rgb, smoothed, strength * skin);
  outc = outc * 1.03 + 0.015;
  return half4(clamp(outc, 0.0, 1.0), c.a);
}`;

export const beautyEffect = Skia.RuntimeEffect.Make(SKSL);

export function makeBeautyPaint(strength = 0.7) {
  if (!beautyEffect) return null;
  const builder = Skia.RuntimeShaderBuilder(beautyEffect);
  builder.setUniform("texel", [3, 3]);
  builder.setUniform("strength", [strength]);
  const paint = Skia.Paint();
  paint.setImageFilter(Skia.ImageFilter.MakeRuntimeShader(builder, null, null));
  return paint;
}
