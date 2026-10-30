"use client";

import { useEffect, useState, useTransition } from "react";
import { mudarStatus } from "./actions";

const brl = (v) => Number(v).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

// Dentro do app Android (Capacitor) o navegador interno não compartilha
// arquivos, então usamos os recursos nativos do app.
const app = () =>
  typeof window !== "undefined" && window.Capacitor?.isNativePlatform?.() ? window.Capacitor : null;
const nativo = (plugin, metodo, opcoes) => {
  const cap = app();
  const p = cap.Plugins?.[plugin];
  return p?.[metodo] ? p[metodo](opcoes) : cap.nativePromise(plugin, metodo, opcoes);
};
const emBase64 = (blob) =>
  new Promise((ok, erro) => {
    const r = new FileReader();
    r.onload = () => ok(String(r.result).split(",")[1]);
    r.onerror = erro;
    r.readAsDataURL(blob);
  });

export default function CartaoVideo({ video, url, capa }) {
  const [arquivo, setArquivo] = useState(null);
  const [noApp, setNoApp] = useState(false);
  const [preparando, setPreparando] = useState(false);
  const [aviso, setAviso] = useState("");
  const [pendente, startTransition] = useTransition();
  const nomeArquivo = `achadinho-${video.item_id}.mp4`;

  // Baixa o vídeo antes do toque: o iPhone só abre o "Compartilhar"
  // se ele for chamado logo após o clique, sem espera.
  useEffect(() => {
    if (app()) {
      setNoApp(true);
      return;
    }
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

  const copiarTexto = (texto) =>
    app() ? nativo("Clipboard", "write", { string: texto }) : navigator.clipboard.writeText(texto);

  const copiar = async (texto, oque) => {
    try {
      await copiarTexto(texto);
      avisar(`${oque} copiado! ✅`);
    } catch {
      avisar("Não consegui copiar 😕");
    }
  };

  const compartilhar = async () => {
    // Muitos apps ignoram o texto junto com o vídeo, então copiamos a descrição antes.
    copiarTexto(video.legenda).catch(() => {});
    try {
      if (noApp) {
        setPreparando(true);
        const blob = await (await fetch(url)).blob();
        const { uri } = await nativo("Filesystem", "writeFile", {
          path: nomeArquivo,
          data: await emBase64(blob),
          directory: "CACHE",
        });
        setPreparando(false);
        await nativo("Share", "share", { files: [uri], text: video.legenda, dialogTitle: "Postar na Shopee" });
      } else {
        await navigator.share({ files: [arquivo], text: video.legenda });
      }
      if (confirm("Postou na Shopee? Marcar como postado?")) acao("postado");
    } catch (e) {
      setPreparando(false);
      const cancelou = e.name === "AbortError" || /cancel/i.test(e.message || "");
      if (!cancelou) avisar(noApp ? "Não deu para compartilhar. Tente de novo." : "Não deu para compartilhar. Use Baixar.");
    }
  };

  const acao = (status) => startTransition(() => mudarStatus(video.id, status));

  const comissao = video.preco * video.comissao;

  return (
    <article className={`video ${pendente ? "carregando" : ""}`}>
      {url ? (
        <video src={url} controls playsInline preload="metadata" poster={capa || video.imagem_url || undefined} />
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
          <summary>Descrição</summary>
          <pre className="legenda">{video.legenda}</pre>
        </details>
        {video.prompt && (
          <details>
            <summary>Prompt para vídeo com IA</summary>
            <pre className="legenda">{video.prompt}</pre>
            <button className="botao" onClick={() => copiar(video.prompt, "Prompt")}>Copiar prompt</button>
          </details>
        )}

        <div className="acoes">
          {video.status === "pendente" && url && (arquivo || noApp) && (
            <button className="botao primario largo" onClick={compartilhar} disabled={preparando}>
              {preparando ? "Preparando o vídeo…" : "Compartilhar na Shopee"}
            </button>
          )}
          <button className="botao" onClick={() => copiar(video.legenda, "Texto da descrição")}>Copiar descrição</button>
          <button className="botao" onClick={() => copiar(video.link_afiliado, "Link")}>Copiar link</button>
          {url && !noApp && (
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
