package com.ghosttech.svi;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.fail;

import androidx.test.ext.junit.rules.ActivityScenarioRule;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;
import org.junit.Rule;
import org.junit.Test;
import org.junit.runner.RunWith;

/** Roda o app num emulador: abre no catálogo Ghost tech, leva ao SVI e volta. */
@RunWith(AndroidJUnit4.class)
public class CatalogoNoAppTest {

    @Rule
    public ActivityScenarioRule<MainActivity> regra = new ActivityScenarioRule<>(MainActivity.class);

    @Test
    public void abreNoCatalogoELevaAoSvi() throws Exception {
        esperar("location.host === 'ghosttech.vercel.app' && document.querySelectorAll('#grade .card').length > 0", "catálogo com os sistemas");
        assertEquals("false", js("document.querySelector('meta[name=viewport]').content.includes('cover')"));

        // Toca no link logo, sem esperar o catálogo terminar de carregar (as fontes vêm da internet)
        js("document.querySelector('a[href^=\"https://svi-ingressos.vercel.app\"]').click()");
        // Sem acesso à API do SVI (Supabase) a página certa é a 503 do próprio SVI
        esperar(
            "location.host === 'svi-ingressos.vercel.app' && (document.documentElement.classList.contains('native-app') || document.title.includes('Serviço indisponível'))",
            "SVI aberto pelo link de demonstração"
        );
        Thread.sleep(500); // O SVI registra o botão voltar no Android

        voltar();
        esperar("location.host === 'ghosttech.vercel.app'", "voltar do SVI para o catálogo");
    }

    @Test
    public void enderecosSemHtmlAbremAsPaginas() throws Exception {
        esperar("location.host === 'ghosttech.vercel.app' && document.readyState === 'complete'", "catálogo aberto");

        js("location.href = '/termos'");
        esperar("location.pathname === '/termos' && document.title.includes('Termos de Uso')", "termos do catálogo");

        js("location.href = '/nao-existe'");
        esperar("document.title.includes('Página não encontrada')", "404 do catálogo");

        js("location.href = 'https://svi-ingressos.vercel.app/suporte'");
        esperar("location.host === 'svi-ingressos.vercel.app' && document.title.includes('Suporte')", "suporte do SVI");

        js("location.href = '/503'");
        esperar("document.title.includes('Serviço indisponível')", "503 do SVI");
    }

    private void voltar() {
        regra.getScenario().onActivity((activity) -> activity.getOnBackPressedDispatcher().onBackPressed());
    }

    private void esperar(String condicao, String descricao) throws Exception {
        long limite = System.currentTimeMillis() + 30000;
        while (System.currentTimeMillis() < limite) {
            if ("true".equals(js("Boolean(" + condicao + ")"))) return;
            Thread.sleep(250);
        }
        fail("Não aconteceu: " + descricao + " (página: " + js("location.href + ' | ' + document.title") + ")");
    }

    private String js(String script) throws InterruptedException {
        AtomicReference<String> resultado = new AtomicReference<>();
        CountDownLatch pronto = new CountDownLatch(1);
        regra.getScenario().onActivity((activity) ->
            activity.getBridge().getWebView().evaluateJavascript(script, (valor) -> {
                resultado.set(valor);
                pronto.countDown();
            })
        );
        pronto.await(10, TimeUnit.SECONDS);
        return resultado.get();
    }
}
