import type { Metadata } from "next";
import { EpisodesList } from "@/components/episodes-list";
import { Header } from "@/components/ui";

export const metadata: Metadata = { title: "Episódios" };

export default function EpisodiosPage() {
  return (
    <>
      <Header />
      <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-10 sm:px-6">
        <h1 className="text-[34px] font-semibold tracking-tight">Episódios</h1>
        <p className="mt-1 text-[15px] text-label-2">Tudo o que está guardado neste aparelho.</p>
        <EpisodesList />
      </main>
    </>
  );
}
