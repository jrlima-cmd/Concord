import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { sair } from "./actions";
import CartaoVideo from "./CartaoVideo";
import BotaoGerar from "./BotaoGerar";
import EmAlta from "./EmAlta";

export const dynamic = "force-dynamic";

const ABAS = [
  { id: "pendente", nome: "Para postar" },
  { id: "emalta", nome: "Em alta" },
  { id: "postado", nome: "Postados" },
  { id: "descartado", nome: "Descartados" },
];

const contar = (db, a) =>
  a.id === "emalta"
    ? db.from("em_alta").select("item_id", { count: "exact", head: true })
    : db.from("videos").select("id", { count: "exact", head: true }).eq("status", a.id);

export default async function Painel({ searchParams }) {
  const pedida = (await searchParams).aba;
  const aba = ABAS.some((a) => a.id === pedida) ? pedida : "pendente";
  const db = supabase();

  const [{ data: videos, error }, contagens] = await Promise.all([
    aba === "emalta"
      ? db.from("em_alta").select("*").order("posicao")
      : db.from("videos").select("*").eq("status", aba).order("created_at", { ascending: false }).limit(40),
    Promise.all(ABAS.map((a) => contar(db, a))),
  ]);

  if (error) {
    return (
      <main className="painel">
        <p className="erro">Erro ao falar com o Supabase: {error.message}</p>
      </main>
    );
  }

  // Links temporários (1h) para assistir e baixar os vídeos do bucket privado
  const urls = {};
  const capa = (v) => v.video_path.replace(/\.mp4$/, ".jpg");
  if (aba !== "emalta" && videos.length) {
    const caminhos = videos.flatMap((v) => [v.video_path, capa(v)]);
    const { data } = await db.storage.from("videos").createSignedUrls(caminhos, 3600);
    for (const s of data || []) if (s.signedUrl) urls[s.path] = s.signedUrl;
  }

  return (
    <main className="painel">
      <header className="topo">
        <div>
          <h1>Concord</h1>
          <p className="sub">4 achadinhos novos por dia, prontos para postar</p>
        </div>
        <form action={sair}>
          <button className="botao fantasma">Sair</button>
        </form>
      </header>

      <BotaoGerar />

      <nav className="abas">
        {ABAS.map((a, i) => (
          <Link key={a.id} href={`/?aba=${a.id}`} className={a.id === aba ? "ativa" : ""}>
            {a.nome} <span className="contador">{contagens[i].count ?? 0}</span>
          </Link>
        ))}
      </nav>

      {aba === "emalta" ? (
        <EmAlta produtos={videos} />
      ) : videos.length === 0 ? (
        <p className="vazio">
          {aba === "pendente"
            ? "Nenhum vídeo esperando. O robô gera os próximos automaticamente. 😉"
            : "Nada por aqui ainda."}
        </p>
      ) : (
        <section className="grade">
          {videos.map((v) => (
            <CartaoVideo key={v.id} video={v} url={urls[v.video_path]} capa={urls[capa(v)]} />
          ))}
        </section>
      )}
    </main>
  );
}
