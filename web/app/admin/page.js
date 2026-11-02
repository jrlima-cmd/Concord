import Link from "next/link";
import { buscarConta } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import { encerrarSessoes, sair } from "../actions";
import FormSenha from "./FormSenha";

export const dynamic = "force-dynamic";

const quando = (d) =>
  new Date(d).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: "America/Sao_Paulo" });

export default async function Admin() {
  const [conta, { data: acessos }] = await Promise.all([
    buscarConta(),
    supabase().from("acessos").select("criado_em, sucesso, dispositivo").order("criado_em", { ascending: false }).limit(20),
  ]);

  return (
    <main className="painel estreito">
      <header className="topo">
        <div>
          <Link href="/" className="voltar">← Painel</Link>
          <h1>Minha conta</h1>
          <p className="sub">Só esta conta tem acesso. Não existe cadastro de novas contas.</p>
        </div>
        <form action={sair}>
          <button className="botao fantasma">Sair</button>
        </form>
      </header>

      <section className="bloco">
        <h2>Administrador</h2>
        <p>{conta.email}</p>
        <p className="pequeno">Senha alterada pela última vez em {quando(conta.atualizado_em)}.</p>
      </section>

      <section className="bloco">
        <h2>Trocar senha</h2>
        <FormSenha />
      </section>

      <section className="bloco">
        <h2>Acessos recentes</h2>
        <p className="pequeno">
          Últimas 20 tentativas de entrar. Por privacidade, o endereço (IP) de quem acessa não é guardado nem mostrado.
        </p>
        {acessos?.length ? (
          <ul className="acessos">
            {acessos.map((a, i) => (
              <li key={i}>
                <span className={`chip ${a.sucesso ? "verde" : "vermelho"}`}>{a.sucesso ? "Entrou" : "Senha errada"}</span>
                <span>{quando(a.criado_em)}</span>
                <span className="pequeno">{a.dispositivo}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="pequeno">Nenhum acesso registrado ainda.</p>
        )}
        <p className="pequeno">
          Viu um acesso que não foi você? Troque a senha acima ou desconecte todos os aparelhos.
        </p>
      </section>

      <section className="bloco">
        <h2>Desconectar todos os aparelhos</h2>
        <p className="pequeno">Encerra o acesso em todos os celulares e computadores, inclusive neste.</p>
        <form action={encerrarSessoes}>
          <button className="botao perigo">Desconectar todos</button>
        </form>
      </section>
    </main>
  );
}
