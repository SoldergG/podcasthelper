import type { Metadata } from "next";
import { Suspense } from "react";
import { RoomScreen } from "@/components/room/room-screen";

export const metadata: Metadata = { title: "Sala" };

export default function SalaPage() {
  return (
    <Suspense fallback={<div className="flex-1" />}>
      <RoomScreen />
    </Suspense>
  );
}
