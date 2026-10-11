import type { Metadata } from "next";
import { Suspense } from "react";
import { EditorScreen } from "@/components/editor/editor-screen";

export const metadata: Metadata = { title: "Editor" };

export default function EstudioPage() {
  return (
    <Suspense fallback={<div className="flex-1" />}>
      <EditorScreen />
    </Suspense>
  );
}
