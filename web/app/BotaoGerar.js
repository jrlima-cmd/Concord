"use client";

import { useActionState } from "react";
import { gerarAgora } from "./actions";

export default function BotaoGerar({ item, rotulo = "⚡ Gerar um vídeo agora", className = "botao secundario" }) {
  const [estado, acao, gerando] = useActionState(gerarAgora, null);
  return (
    <form action={acao} className={item ? undefined : "gerar"}>
      {item && <input type="hidden" name="item" value={item} />}
      <button className={className} disabled={gerando}>
        {gerando ? "Chamando o robô…" : rotulo}
      </button>
      {estado?.ok && <p className="ok">{estado.ok}</p>}
      {estado?.erro && <p className="erro">{estado.erro}</p>}
    </form>
  );
}
