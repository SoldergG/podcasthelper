import { BatteryCharging, Hand, Headphones, Laptop, MonitorSmartphone, Scissors, Share2, Wifi } from "lucide-react";
import { MicStrip } from "@/components/landing/mic-strip";
import { StartActions } from "@/components/start-panel";
import { Header } from "@/components/ui";

const steps = [
  { verb: "Cria a sala", body: "Partilha o link ou o QR code. Quem entra só precisa do nome, sem contas." },
  { verb: "Gravem", body: "O anfitrião carrega em gravar e começa no mesmo instante em todos os aparelhos." },
  { verb: "Recebam tudo", body: "As gravações passam de aparelho para aparelho, já alinhadas, prontas para editar." },
];

const checklist = [
  { icon: Headphones, title: "Fones em todos", body: "Com fio é o ideal. O Bluetooth acrescenta atraso." },
  { icon: BatteryCharging, title: "Ligados à corrente", body: "Gravar em alta qualidade gasta bateria. A app avisa o anfitrião quando está baixa." },
  { icon: Wifi, title: "Mesma Wi-Fi, se puderem", body: "Os ficheiros passam pela rede de casa e chegam muito mais depressa." },
  { icon: Hand, title: "Uma palma no início", body: "Ajuda a confirmar a sincronia quando editares noutro programa." },
];

export default function Home() {
  return (
    <>
      <Header />
      <main className="flex-1">
        {/* Hero */}
        <section className="mx-auto grid max-w-7xl items-center gap-12 px-4 pt-12 pb-20 sm:px-6 lg:grid-cols-[1.05fr_1fr] lg:pt-20">
          <div className="rise">
            <h1 className="text-[44px] font-semibold leading-[1.02] tracking-[-0.035em] sm:text-[64px]">
              Grava o podcast.
              <br />
              <span className="text-label-3">Cada um no seu aparelho.</span>
            </h1>
            <p className="mt-6 max-w-[34ch] text-[19px] leading-relaxed text-label-2">
              Cada pessoa grava o próprio micro e câmara em alta qualidade. No fim, todos ficam com tudo, sincronizado.
            </p>
            <div className="mt-9">
              <StartActions />
            </div>
          </div>
          <div className="rise flex justify-center lg:justify-end" style={{ animationDelay: "120ms" }}>
            <MicStrip />
          </div>
        </section>

        {/* Steps */}
        <section className="border-y border-separator bg-panel">
          <div className="mx-auto grid max-w-7xl gap-10 px-4 py-20 sm:px-6 lg:grid-cols-[1fr_1.6fr]">
            <h2 className="text-[34px] font-semibold leading-tight tracking-tight sm:text-[40px]">
              Três passos.
              <br />
              Zero cabos.
            </h2>
            <ol className="space-y-10">
              {steps.map((s) => (
                <li key={s.verb} className="grid gap-2 sm:grid-cols-[220px_1fr] sm:gap-8">
                  <span className="text-[26px] font-semibold tracking-tight">{s.verb}</span>
                  <p className="max-w-[48ch] text-[17px] leading-relaxed text-label-2">{s.body}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* Bento */}
        <section className="mx-auto max-w-7xl px-4 py-20 sm:px-6">
          <h2 className="max-w-[20ch] text-[34px] font-semibold leading-tight tracking-tight sm:text-[40px]">Feito como um estúdio, simples como uma chamada.</h2>
          <div className="mt-10 grid gap-4 md:grid-cols-6">
            <article className="relative overflow-hidden rounded-[22px] bg-accent p-7 text-on-accent md:col-span-4 md:row-span-2 md:p-9">
              <p className="font-mono text-[64px] font-medium leading-none tracking-tight sm:text-[96px]">48 kHz</p>
              <h3 className="mt-6 text-[24px] font-semibold">Áudio sem perdas, de cada micro</h3>
              <p className="mt-2 max-w-[44ch] text-[16px] leading-relaxed opacity-85">
                WAV gravado no próprio aparelho, a começar no mesmo frame em todos. A internet só serve para se ouvirem.
              </p>
              <p className="mt-8 font-mono text-[13px] opacity-75">Vídeo até 4K, na qualidade máxima da câmara.</p>
            </article>
            <article className="rounded-[22px] bg-label p-7 text-bg md:col-span-2">
              <Laptop aria-hidden className="h-7 w-7 opacity-80" />
              <h3 className="mt-5 text-[20px] font-semibold">Centro de controlo</h3>
              <p className="mt-2 text-[15px] leading-relaxed opacity-75">
                Usa o computador só para ver todas as câmaras, medidores e o estado de cada aparelho.
              </p>
            </article>
            <article className="console rounded-[22px] border border-separator p-7 md:col-span-2">
              <Share2 aria-hidden className="h-7 w-7 text-accent-ink" />
              <h3 className="mt-5 text-[20px] font-semibold">Partilha direta</h3>
              <p className="mt-2 text-[15px] leading-relaxed text-label-2">Os ficheiros vão de aparelho para aparelho. Nada fica num servidor.</p>
            </article>
            <article className="console rounded-[22px] border border-separator p-7 md:col-span-3">
              <Scissors aria-hidden className="h-7 w-7 text-accent-ink" />
              <h3 className="mt-5 text-[20px] font-semibold">Editor com limpeza de áudio</h3>
              <p className="mt-2 max-w-[46ch] text-[15px] leading-relaxed text-label-2">
                Cortes, volumes, redução de ruído e foco na voz de cada pessoa. Exporta MP3, WAV, vídeo ou um ZIP para o teu editor.
              </p>
            </article>
            <article className="rounded-[22px] bg-accent-soft p-7 md:col-span-3">
              <MonitorSmartphone aria-hidden className="h-7 w-7 text-accent-ink" />
              <h3 className="mt-5 text-[20px] font-semibold">Telemóvel ou computador</h3>
              <p className="mt-2 max-w-[46ch] text-[15px] leading-relaxed text-label-2">
                Funciona no navegador e na app Android. O ecrã fica ligado enquanto gravam.
              </p>
            </article>
          </div>
        </section>

        {/* Checklist */}
        <section className="mx-auto max-w-7xl px-4 pb-24 sm:px-6">
          <div className="console grid gap-10 rounded-[22px] border border-separator p-7 sm:p-10 lg:grid-cols-[1fr_2fr]">
            <div>
              <h2 className="text-[28px] font-semibold tracking-tight">Antes de carregar em gravar</h2>
              <div className="mt-6">
                <StartActions size="md" />
              </div>
            </div>
            <ul className="grid gap-x-10 gap-y-8 sm:grid-cols-2">
              {checklist.map((c) => (
                <li key={c.title} className="flex gap-4">
                  <span className="key grid h-11 w-11 shrink-0 place-items-center rounded-[12px]">
                    <c.icon aria-hidden className="h-5 w-5" />
                  </span>
                  <span>
                    <span className="block text-[16px] font-semibold">{c.title}</span>
                    <span className="mt-1 block text-[14px] leading-relaxed text-label-2">{c.body}</span>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </section>
      </main>
      <footer className="border-t border-separator">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-8 text-[13px] text-label-3 sm:px-6">
          <span>PodcastHelper é open source (licença MIT).</span>
          <a className="text-label-2 hover:text-label" href="https://github.com/SoldergG/podcasthelper">
            Código no GitHub
          </a>
        </div>
      </footer>
    </>
  );
}
