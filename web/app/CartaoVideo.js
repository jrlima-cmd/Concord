"use client";

import { useEffect, useState, useTransition } from "react";
import { mudarStatus } from "./actions";

const brl = (v) => Number(v).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export default function CartaoVideo({ video, url }) {
  const [arquivo, setArquivo] = useState(null);
  const [aviso, setAviso] = useState("");
  const [pendente, startTransition] = useTransition();
  const nomeArquivo = `achadinho-${video.item_id}.mp4`;

  // Baixa o vídeo antes do toque: o iPhone só abre o "Compartilhar"
  // se ele for chamado logo após o clique, sem espera.
  useEffect(() => {
    if (!url || video.status !== "pendente" || !navigator.canShare) return;
    let cancelado = false;
    fetch(url)
      .then((r) => r.blob())
      .then((b) => {
        const f = new File([b], nomeArquivo, { type: "video/mp4" });
        if (!cancelado && navigator.canShare({ files: [f] })) setArquivo(f);
      })
      .catch(() => {});
    return () => {
      cancelado = true;
    };
  }, [url, video.status, nomeArquivo]);

  const avisar = (msg) => {
    setAviso(msg);
    setTimeout(() => setAviso(""), 2500);
  };

  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(video.legenda);
      avisar("Legenda copiada! ✅");
    } catch {
      avisar("Não consegui copiar 😕");
    }
  };

  const compartilhar = async () => {
    // Muitos apps ignoram o texto junto com o vídeo, então copiamos a legenda antes.
    navigator.clipboard?.writeText(video.legenda).catch(() => {});
    try {
      await navigator.share({ files: [arquivo], text: video.legenda });
      if (confirm("Postou na Shopee? Marcar como postado?")) acao("postado");
    } catch (e) {
      if (e.name !== "AbortError") avisar("Não deu para compartilhar. Use Baixar.");
    }
  };

  const acao = (status) => startTransition(() => mudarStatus(video.id, status));

  const comissao = video.preco * video.comissao;

  return (
    <article className={`video ${pendente ? "carregando" : ""}`}>
      {url ? (
        <video src={url} controls playsInline preload="metadata" poster={video.imagem_url || undefined} />
      ) : (
        <div className="sem-video">Vídeo indisponível</div>
      )}

      <div className="info">
        <h2>{video.titulo}</h2>
        <p className="meta">
          <strong>{brl(video.preco)}</strong>
          {video.desconto >= 10 && <span className="tag">-{Math.round(video.desconto)}%</span>}
          {comissao > 0 && <span className="tag verde">~{brl(comissao)}/venda</span>}
        </p>
        <p className="meta pequeno">
          {video.vendas > 0 && `${video.vendas.toLocaleString("pt-BR")} vendidos · `}
          {new Date(video.created_at).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}
        </p>

        <details>
          <summary>Legenda e link</summary>
          <pre className="legenda">{video.legenda}</pre>
        </details>

        <div className="acoes">
          {video.status === "pendente" && arquivo && (
            <button className="botao primario largo" onClick={compartilhar}>
              Compartilhar na Shopee
            </button>
          )}
          <button className="botao" onClick={copiar}>Copiar legenda</button>
          {url && (
            <a className="botao" href={`${url}&download=${nomeArquivo}`}>
              Baixar
            </a>
          )}
          {video.status === "pendente" ? (
            <>
              <button className="botao verde" onClick={() => acao("postado")}>Já postei</button>
              <button className="botao fantasma" onClick={() => acao("descartado")}>Descartar</button>
            </>
          ) : (
            <button className="botao fantasma" onClick={() => acao("pendente")}>Voltar para a fila</button>
          )}
        </div>
        {aviso && <p className="ok">{aviso}</p>}
      </div>
    </article>
  );
}
