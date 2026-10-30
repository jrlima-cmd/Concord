"use client";

import { useActionState } from "react";
import { gerarAgora } from "./actions";

export default function BotaoGerar() {
  const [estado, acao, gerando] = useActionState(gerarAgora, null);
  return (
    <form action={acao} className="gerar">
      <button className="botao secundario" disabled={gerando}>
        {gerando ? "Chamando o robô…" : "⚡ Gerar um vídeo agora"}
      </button>
      {estado?.ok && <p className="ok">{estado.ok}</p>}
      {estado?.erro && <p className="erro">{estado.erro}</p>}
    </form>
  );
}
