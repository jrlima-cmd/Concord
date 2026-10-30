"use client";

import { useActionState } from "react";
import { entrar } from "../actions";

export default function Login() {
  const [estado, acao, enviando] = useActionState(entrar, null);
  return (
    <main className="login">
      <form action={acao} className="cartao">
        <h1>Concord</h1>
        <p className="sub">Seus achadinhos automáticos</p>
        <input name="senha" type="password" placeholder="Senha do painel" autoFocus required />
        <button className="botao primario" disabled={enviando}>
          {enviando ? "Entrando…" : "Entrar"}
        </button>
        {estado?.erro && <p className="erro">{estado.erro}</p>}
      </form>
    </main>
  );
}
