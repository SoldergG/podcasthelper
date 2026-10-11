"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { markRoomHost } from "@/lib/studio";
import { newRoomCode, normalizeRoomCode } from "@/lib/util";
import { Button, Card, Segmented, inputClass } from "./ui";

export function StartPanel() {
  const router = useRouter();
  const [mode, setMode] = useState<"create" | "join">("create");
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);

  const create = () => {
    const c = newRoomCode();
    markRoomHost(c);
    router.push(`/sala?c=${c}`);
  };

  const join = (e: React.FormEvent) => {
    e.preventDefault();
    const c = normalizeRoomCode(code);
    if (!c) {
      setError("Código inválido. Tem 10 letras/números, por exemplo abc-defg-hij.");
      return;
    }
    router.push(`/sala?c=${c}`);
  };

  return (
    <Card className="w-full max-w-md p-5 sm:p-6">
      <Segmented
        label="Começar"
        value={mode}
        onChange={(v) => {
          setMode(v);
          setError(null);
        }}
        options={[
          { value: "create", label: "Criar sala" },
          { value: "join", label: "Entrar numa sala" },
        ]}
      />
      {mode === "create" ? (
        <div className="mt-5">
          <p className="text-[15px] text-label-2">
            Crias a sala, partilhas o link e controlas a gravação. Não precisas de conta.
          </p>
          <Button size="lg" className="mt-5 w-full" onClick={create}>
            Criar sala nova
          </Button>
        </div>
      ) : (
        <form className="mt-5" onSubmit={join}>
          <label className="block">
            <span className="sr-only">Código ou link da sala</span>
            <input
              className={inputClass}
              placeholder="Código ou link da sala"
              value={code}
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              onChange={(e) => {
                setCode(e.target.value);
                setError(null);
              }}
            />
          </label>
          {error && <p className="mt-2 text-[13px] text-red">{error}</p>}
          <Button size="lg" className="mt-4 w-full" type="submit" disabled={!code.trim()}>
            Entrar
          </Button>
        </form>
      )}
    </Card>
  );
}
