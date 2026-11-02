"use client";

import { useEffect } from "react";
import dynamic from "next/dynamic";
import { GLBoundary, useWebGL2 } from "@/components/GLBoundary";
import { setViewer, useViewer } from "@/lib/viewer-state";

// three / R3F never run on the server: the stage mounts after hydration.
const BimStage = dynamic(() => import("./BimStage"), { ssr: false });

export default function StageLoader() {
  const webgl = useWebGL2();
  const { drone } = useViewer();
  // no WebGL2, no stage: a drone-view request has nothing to fly, so it is dropped instead of left hanging
  useEffect(() => {
    if (drone && !webgl) setViewer({ drone: false });
  }, [drone, webgl]);
  if (!webgl) return null;
  return (
    <GLBoundary>
      <BimStage />
    </GLBoundary>
  );
}
