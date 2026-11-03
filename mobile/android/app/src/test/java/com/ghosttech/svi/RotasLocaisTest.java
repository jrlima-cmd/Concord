package com.ghosttech.svi;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;

import org.junit.Test;

public class RotasLocaisTest {

    @Test
    public void paginaInicial() {
        assertEquals("index.html", RotasLocais.arquivo("/"));
        assertEquals("index.html", RotasLocais.arquivo(""));
        assertEquals("index.html", RotasLocais.arquivo(null));
    }

    @Test
    public void enderecoSemHtmlAbreOArquivoHtml() {
        assertEquals("termos.html", RotasLocais.arquivo("/termos"));
        assertEquals("obrigado.html", RotasLocais.arquivo("/obrigado"));
        assertEquals("503.html", RotasLocais.arquivo("/503"));
    }

    @Test
    public void arquivoComExtensaoFicaIgual() {
        assertEquals("sistema.html", RotasLocais.arquivo("/sistema.html"));
        assertEquals("produtos.json", RotasLocais.arquivo("/produtos.json"));
        assertEquals("icons/icon.svg", RotasLocais.arquivo("/icons/icon.svg"));
    }

    @Test
    public void pastaAbreIndex() {
        assertEquals("docs/index.html", RotasLocais.arquivo("/docs/"));
    }

    @Test
    public void naoSaiDaPastaDoSite() {
        assertNull(RotasLocais.arquivo("/../public/app.js"));
        assertNull(RotasLocais.arquivo("/a/..\\b"));
    }

    @Test
    public void reconheceEnderecoLimpo() {
        assertTrue(RotasLocais.ehEnderecoLimpo("/503"));
        assertTrue(RotasLocais.ehEnderecoLimpo("/suporte"));
        assertFalse(RotasLocais.ehEnderecoLimpo("/"));
        assertFalse(RotasLocais.ehEnderecoLimpo("/app.js"));
        assertFalse(RotasLocais.ehEnderecoLimpo("/vendor/supabase.js"));
        assertFalse(RotasLocais.ehEnderecoLimpo("/docs/"));
        assertFalse(RotasLocais.ehEnderecoLimpo(null));
    }

    @Test
    public void tipoDoArquivo() {
        assertEquals("text/html", RotasLocais.tipo("index.html"));
        assertEquals("text/css", RotasLocais.tipo("estilo.css"));
        assertEquals("text/javascript", RotasLocais.tipo("catalogo.js"));
        assertEquals("application/json", RotasLocais.tipo("produtos.json"));
        assertEquals("image/svg+xml", RotasLocais.tipo("favicon.svg"));
        assertEquals("application/octet-stream", RotasLocais.tipo("arquivo.xyz"));
    }

    @Test
    public void tiraViewportCover() {
        String meta = "<meta name=\"viewport\" content=\"width=device-width, initial-scale=1.0, viewport-fit=cover\">";
        assertEquals("<meta name=\"viewport\" content=\"width=device-width, initial-scale=1.0\">", RotasLocais.semViewportCover(meta));
    }
}
