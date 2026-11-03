package com.ghosttech.svi;

import java.util.Locale;

/**
 * Converte o endereço pedido no arquivo guardado dentro do app, como o "cleanUrls" da Vercel faz
 * no site: "/" abre index.html e "/termos" abre termos.html.
 */
final class RotasLocais {

    private RotasLocais() {}

    /** Arquivo para o caminho pedido, ou null se o caminho tenta sair da pasta do site. */
    static String arquivo(String caminho) {
        if (caminho == null || caminho.isEmpty() || caminho.equals("/")) return "index.html";
        if (caminho.contains("..") || caminho.contains("\\")) return null;

        String relativo = caminho.startsWith("/") ? caminho.substring(1) : caminho;
        if (relativo.endsWith("/")) return relativo + "index.html";
        return ultimoTrecho(relativo).contains(".") ? relativo : relativo + ".html";
    }

    /** Endereço de página sem ".html" (ex.: /503, /suporte), fora a página inicial. */
    static boolean ehEnderecoLimpo(String caminho) {
        if (caminho == null || caminho.isEmpty() || caminho.equals("/") || caminho.endsWith("/")) return false;
        return !ultimoTrecho(caminho).contains(".");
    }

    static String tipo(String arquivo) {
        String extensao = arquivo.substring(arquivo.lastIndexOf('.') + 1).toLowerCase(Locale.ROOT);
        switch (extensao) {
            case "html":
                return "text/html";
            case "css":
                return "text/css";
            case "js":
                return "text/javascript";
            case "json":
                return "application/json";
            case "webmanifest":
                return "application/manifest+json";
            case "svg":
                return "image/svg+xml";
            case "png":
                return "image/png";
            case "ico":
                return "image/x-icon";
            default:
                return "application/octet-stream";
        }
    }

    /**
     * As páginas do catálogo pedem viewport-fit=cover mas só tratam as laterais da tela. Sem ele,
     * o Android afasta a página da barra de status e da barra de gestos.
     */
    static String semViewportCover(String html) {
        return html.replace(", viewport-fit=cover", "");
    }

    private static String ultimoTrecho(String caminho) {
        return caminho.substring(caminho.lastIndexOf('/') + 1);
    }
}
