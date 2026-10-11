"use client";

import { ReactLenis } from "lenis/react";
import "lenis/dist/lenis.css";

/**
 * Smooth scrolling for document-scrolling pages (landing, episodes).
 * Not used on the room or the editor: those are app shells with their own
 * scroll areas. Lenis respects prefers-reduced-motion by default.
 */
export function SmoothScroll() {
  return <ReactLenis root options={{ autoRaf: true, anchors: { offset: -72 }, lerp: 0.1 }} />;
}
