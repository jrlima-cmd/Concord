"use client";

import { useActionState, useEffect, useRef } from "react";
import { alterarSenha } from "../actions";

export default function FormSenha() {
  const [estado, acao, salvando] = useActionState(alterarSenha, null);
  const form = useRef(null);
  useEffect(() => {
    if (estado?.ok) form.current?.reset();
  }, [estado]);
  return (
    <form action={acao} ref={form} className="campos">
      <label>
        Senha atual
        <input name="atual" type="password" autoComplete="current-password" required />
      </label>
      <label>
        Senha nova <span className="pequeno">(mínimo 12 caracteres)</span>
        <input name="nova" type="password" autoComplete="new-password" minLength={12} required />
      </label>
      <label>
        Repita a senha nova
        <input name="confirmar" type="password" autoComplete="new-password" minLength={12} required />
      </label>
      <button className="botao primario" disabled={salvando}>
        {salvando ? "Salvando…" : "Trocar senha"}
      </button>
      {estado?.ok && <p className="ok">{estado.ok}</p>}
      {estado?.erro && <p className="erro">{estado.erro}</p>}
    </form>
  );
}
