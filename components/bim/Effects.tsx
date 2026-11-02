"use client";

import { memo } from "react";
import { Bloom, EffectComposer, Noise, ToneMapping } from "@react-three/postprocessing";
import { ToneMappingMode } from "postprocessing";

/**
 * Bloom only catches colours above 1.0 — the GLOW materials (air, data, sparks,
 * scans) and the holo style's boosted cyan linework. Tuned for holo: the wide
 * smoothing band lets thin lines glow softly instead of flaring, and the low
 * intensity keeps dense linework from blowing out. A whisper of film grain keeps
 * the dark from going flat. Tone mapping runs last inside the composer, since the
 * renderer skips it when drawing into the composer's targets. No vignette: it
 * would darken the canvas edges away from --void and show a seam against the
 * HTML sections.
 * Memoised: a fresh child tree would make EffectComposer rebuild its pass.
 */
function Effects() {
  return (
    <EffectComposer multisampling={2} enableNormalPass={false}>
      <Bloom mipmapBlur intensity={0.85} luminanceThreshold={1} luminanceSmoothing={0.3} radius={0.72} />
      <Noise opacity={0.022} />
      <ToneMapping mode={ToneMappingMode.ACES_FILMIC} />
    </EffectComposer>
  );
}

export default memo(Effects);
