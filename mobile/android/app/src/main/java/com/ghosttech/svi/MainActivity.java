package com.ghosttech.svi;

import android.net.Uri;
import android.os.Bundle;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebView;
import androidx.activity.OnBackPressedCallback;
import com.getcapacitor.BridgeActivity;
import com.getcapacitor.BridgeWebViewClient;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.util.Collections;

public class MainActivity extends BridgeActivity {

    // O app abre no catálogo Ghost tech, servido de dentro do app no mesmo endereço do site.
    // Assim o pagamento da assinatura (que volta para ghosttech.vercel.app/obrigado) termina no app.
    // Os arquivos vêm de ../../catalogo, copiados por "npm run sync" (mobile/scripts/copiar-catalogo.js).
    static final String CATALOGO_HOST = "ghosttech.vercel.app";
    static final String CATALOGO_INICIO = "https://" + CATALOGO_HOST + "/";

    private boolean historicoLimpo = false;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        bridge.setWebViewClient(new BridgeWebViewClient(bridge) {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                // O Capacitor abre no navegador externo qualquer endereço fora do app, inclusive dentro de iframes.
                // No Checkout da Stripe, a confirmação 3D Secure do banco roda num iframe e precisa ficar no app.
                if (!request.isForMainFrame()) return false;
                return super.shouldOverrideUrlLoading(view, request);
            }

            @Override
            public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                WebResourceResponse local = servirLocal(request);
                return local != null ? local : super.shouldInterceptRequest(view, request);
            }

            @Override
            public void onPageFinished(WebView view, String url) {
                super.onPageFinished(view, url);
                // Tira do histórico a página do SVI que o Capacitor abre antes do catálogo
                if (!historicoLimpo && url != null && url.startsWith(CATALOGO_INICIO)) {
                    historicoLimpo = true;
                    view.clearHistory();
                }
            }
        });
        bridge.getWebView().loadUrl(CATALOGO_INICIO);

        // Botão "voltar": no catálogo volta uma página ou minimiza o app; no SVI quem decide é o
        // próprio SVI (fecha o que estiver aberto, troca de aba e, por fim, volta ao catálogo)
        getOnBackPressedDispatcher().addCallback(this, new OnBackPressedCallback(true) {
            @Override
            public void handleOnBackPressed() {
                WebView web = bridge.getWebView();
                Uri atual = web.getUrl() == null ? null : Uri.parse(web.getUrl());
                if (atual != null && CATALOGO_HOST.equals(atual.getHost())) {
                    if (web.canGoBack()) web.goBack();
                    else moveTaskToBack(true);
                    return;
                }
                setEnabled(false);
                getOnBackPressedDispatcher().onBackPressed();
                setEnabled(true);
            }
        });
    }

    private WebResourceResponse servirLocal(WebResourceRequest request) {
        if (!"GET".equals(request.getMethod())) return null;
        Uri url = request.getUrl();
        String caminho = url.getPath();

        if (CATALOGO_HOST.equals(url.getHost())) {
            String arquivo = RotasLocais.arquivo(caminho);
            WebResourceResponse resposta = arquivo == null ? null : abrirDoCatalogo(arquivo, 200, "OK");
            return resposta != null ? resposta : abrirDoCatalogo("404.html", 404, "Not Found");
        }

        // SVI: o servidor do Capacitor responde qualquer endereço sem ".html" (/503, /suporte...) com
        // o próprio app. Quando existe a página, ela é servida aqui, como no site.
        if (bridge.getHost().equals(url.getHost()) && RotasLocais.ehEnderecoLimpo(caminho)) {
            String arquivo = RotasLocais.arquivo(caminho);
            return arquivo == null ? null : abrir("public/" + arquivo, 200, "OK");
        }
        return null;
    }

    private WebResourceResponse abrirDoCatalogo(String arquivo, int status, String motivo) {
        if (!arquivo.endsWith(".html")) return abrir("ghosttech/" + arquivo, status, motivo);
        try (InputStream conteudo = getAssets().open("ghosttech/" + arquivo)) {
            String html = RotasLocais.semViewportCover(new String(lerTudo(conteudo), StandardCharsets.UTF_8));
            return resposta(arquivo, status, motivo, new ByteArrayInputStream(html.getBytes(StandardCharsets.UTF_8)));
        } catch (IOException e) {
            return null;
        }
    }

    /** Arquivo dos assets do app, ou null quando ele não existe. */
    private WebResourceResponse abrir(String asset, int status, String motivo) {
        try {
            return resposta(asset, status, motivo, getAssets().open(asset));
        } catch (IOException e) {
            return null;
        }
    }

    private static WebResourceResponse resposta(String arquivo, int status, String motivo, InputStream conteudo) {
        return new WebResourceResponse(
            RotasLocais.tipo(arquivo),
            "UTF-8",
            status,
            motivo,
            Collections.singletonMap("Cache-Control", "no-cache"),
            conteudo
        );
    }

    private static byte[] lerTudo(InputStream entrada) throws IOException {
        ByteArrayOutputStream saida = new ByteArrayOutputStream();
        byte[] bloco = new byte[8192];
        int lidos;
        while ((lidos = entrada.read(bloco)) != -1) saida.write(bloco, 0, lidos);
        return saida.toByteArray();
    }
}
