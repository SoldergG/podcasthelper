"use client";

import { Crown, MicOff, UserMinus } from "lucide-react";
import type { PeerInfo } from "@/lib/room";
import type { PeerView, StudioSnapshot } from "@/lib/studio";
import type { Marker } from "@/lib/types";
import { formatDuration } from "@/lib/util";

export function NotesPanel({
  snap,
  onChange,
}: {
  snap: StudioSnapshot;
  onChange: (text: string) => void;
}) {
  const startHost = snap.rec.startHost;
  return (
    <div className="flex h-full flex-col">
      <textarea
        aria-label="Notas partilhadas"
        value={snap.notes.text}
        onChange={(e) => onChange(e.target.value)}
        placeholder={"Notas que todos veem: guião, temas, links, perguntas…\n\nTudo o que escreveres aparece logo aos outros e fica guardado com o episódio."}
        className="min-h-48 w-full flex-1 resize-none rounded-[14px] bg-grouped p-3.5 text-[15px] leading-relaxed text-label outline-none placeholder:text-label-3 focus:ring-3 focus:ring-accent/30"
      />
      {snap.notes.by && (
        <p className="mt-2 text-[12px] text-label-3">Última edição por {snap.notes.by}</p>
      )}
      {snap.markers.length > 0 && (
        <div className="mt-4">
          <h3 className="text-[13px] font-semibold text-label-2">Marcadores desta gravação</h3>
          <ul className="mt-2 space-y-1.5">
            {snap.markers.map((m: Marker) => (
              <li key={m.id} className="flex items-center gap-2 text-[14px]">
                <span className="tabular rounded-md bg-accent-soft px-1.5 py-0.5 text-[12px] font-semibold text-accent">
                  {startHost ? formatDuration(m.t - startHost) : "—"}
                </span>
                <span className="truncate">{m.label}</span>
                <span className="ml-auto shrink-0 text-[12px] text-label-3">{m.by}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function StatusRow({ label, value, warn }: { label: string; value: string; warn?: boolean }) {
  return (
    <div className="flex justify-between gap-2 text-[12px]">
      <span className="text-label-3">{label}</span>
      <span className={`tabular ${warn ? "font-medium text-orange" : "text-label-2"}`}>{value}</span>
    </div>
  );
}

export function PeoplePanel({
  snap,
  onMute,
  onRemove,
}: {
  snap: StudioSnapshot;
  onMute: (peerId: string) => void;
  onRemove: (peerId: string) => void;
}) {
  if (!snap.self) return null;
  const rows: { info: PeerInfo; view?: PeerView }[] = [{ info: snap.self }, ...snap.peers.map((p) => ({ info: p.info, view: p }))];
  return (
    <div className="space-y-3">
      {!snap.isMaster && (
        <p className="text-[13px] text-label-3">Só o anfitrião controla a gravação e pode silenciar ou remover pessoas.</p>
      )}
      {rows.map(({ info, view }) => {
        const isSelf = info.peerId === snap.self!.peerId;
        const isMaster = info.peerId === snap.masterId;
        const conn = isSelf ? "connected" : view?.connection || "new";
        const lowStorage = info.storageFreeGb !== undefined && info.storageFreeGb < 2;
        return (
          <div key={info.peerId} className="rounded-[14px] bg-grouped p-3">
            <div className="flex items-center gap-2">
              <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-[14px] font-semibold text-white" style={{ background: info.color }}>
                {info.name.charAt(0).toUpperCase()}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5 text-[15px] font-medium">
                  <span className="truncate">{info.name}{isSelf ? " (tu)" : ""}</span>
                  {isMaster && <Crown aria-label="Anfitrião" className="h-3.5 w-3.5 shrink-0 text-orange" />}
                  {info.muted && <MicOff aria-label="Sem micro" className="h-3.5 w-3.5 shrink-0 text-label-3" />}
                </div>
                <div className="text-[12px] text-label-3">
                  {info.recording ? "A gravar" : conn === "connected" ? "Ligado" : conn === "failed" ? "Sem ligação direta" : "A ligar…"}
                </div>
              </div>
              {snap.isMaster && !isSelf && (
                <div className="flex gap-1">
                  <button
                    onClick={() => onMute(info.peerId)}
                    disabled={info.muted}
                    className="grid h-9 w-9 place-items-center rounded-full bg-elevated text-label-2 hover:text-label disabled:opacity-40"
                    aria-label={`Silenciar ${info.name}`}
                    title="Silenciar"
                  >
                    <MicOff className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => {
                      if (confirm(`Remover ${info.name} da sala?`)) onRemove(info.peerId);
                    }}
                    className="grid h-9 w-9 place-items-center rounded-full bg-elevated text-red hover:brightness-95"
                    aria-label={`Remover ${info.name}`}
                    title="Remover da sala"
                  >
                    <UserMinus className="h-4 w-4" />
                  </button>
                </div>
              )}
            </div>
            <div className="mt-2.5 space-y-1 border-t border-separator pt-2">
              <StatusRow
                label="Sincronia"
                value={isMaster ? "referência" : info.syncMs !== undefined ? `±${info.syncMs} ms` : "a acertar…"}
                warn={!isMaster && info.syncMs !== undefined && info.syncMs > 60}
              />
              <StatusRow label="Câmara" value={info.video ? info.res || "—" : "desligada"} />
              <StatusRow
                label="Espaço livre"
                value={info.storageFreeGb !== undefined ? `${info.storageFreeGb} GB` : "—"}
                warn={lowStorage}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}
