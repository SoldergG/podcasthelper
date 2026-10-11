import type { Metadata } from "next";
import { EpisodesList } from "@/components/episodes-list";
import { SmoothScroll } from "@/components/smooth-scroll";
import { Header } from "@/components/ui";

export const metadata: Metadata = { title: "Episódios" };

export default function EpisodiosPage() {
  return (
    <>
      <SmoothScroll />
      <Header />
      <main className="mx-auto w-full max-w-[1100px] flex-1 px-4 py-12 sm:px-6">
        <h1 className="display text-[clamp(2.25rem,5vw,3.5rem)]">Episódios</h1>
        <p className="mt-2 text-[16px] text-label-2">Tudo o que está guardado neste aparelho. Os ficheiros não saem daqui sem tu exportares.</p>
        <EpisodesList />
      </main>
    </>
  );
}
