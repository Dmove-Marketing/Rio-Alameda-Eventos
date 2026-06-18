import fs from 'fs';
import path from 'path';
import https from 'https';
import http from 'http';
import { URL } from 'url';

const sourceDir = '_html-originais';
const destImagesDir = path.join('src', 'assets', 'images');

// Garantir que os diretórios existam
[sourceDir, destImagesDir].forEach(dir => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
});

// Helper para slugificar o nome do arquivo da página
function slugify(text) {
  return text.toString().toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, '-')
    .replace(/[^\w\-]+/g, '')
    .replace(/\-\-+/g, '-')
    .replace(/^-+/, '')
    .replace(/-+$/, '');
}

// Helper para baixar um arquivo via HTTPS
function downloadFile(fileUrl, destPath) {
  return new Promise((resolve, reject) => {
    https.get(fileUrl, (response) => {
      if (response.statusCode !== 200) {
        reject(new Error(`Erro HTTP ${response.statusCode} ao baixar ${fileUrl}`));
        return;
      }

      const fileStream = fs.createWriteStream(destPath);
      response.pipe(fileStream);

      fileStream.on('finish', () => {
        fileStream.close();
        resolve();
      });

      fileStream.on('error', (err) => {
        fs.unlink(destPath, () => {});
        reject(err);
      });
    }).on('error', (err) => {
      reject(err);
    });
  });
}

// Helper para baixar HTML da página
function fetchHtml(pageUrl) {
  return new Promise((resolve, reject) => {
    https.get(pageUrl, (response) => {
      if (response.statusCode === 301 || response.statusCode === 302) {
        // Seguir redirecionamento simples
        fetchHtml(response.headers.location).then(resolve).catch(reject);
        return;
      }

      if (response.statusCode !== 200) {
        reject(new Error(`Erro HTTP ${response.statusCode} ao obter HTML de ${pageUrl}`));
        return;
      }

      let data = '';
      response.on('data', (chunk) => { data += chunk; });
      response.on('end', () => resolve(data));
    }).on('error', (err) => reject(err));
  });
}

// ─── Extrai CSS do Elementor do HTML ─────────────────────────────────────────
// Busca o link rel="stylesheet" do post-XXX.css gerado pelo Elementor.
// Retorna a URL do CSS ou null se não encontrado.

function extractElementorCssUrl(html) {
  // Padrão: /wp-content/uploads/elementor/css/post-{ID}.css
  const match = html.match(
    /href=["'](https?:\/\/[^"']*\/elementor\/css\/post-[\d]+\.css(?:\?[^"']*)?)["']/i
  );
  return match ? match[1].split('?')[0] : null;
}

// ─── Download genérico com suporte a http e https ────────────────────────────

function downloadFileAuto(fileUrl, destPath) {
  return new Promise((resolve, reject) => {
    const lib = fileUrl.startsWith('https') ? https : http;
    lib.get(fileUrl, (response) => {
      if (response.statusCode === 301 || response.statusCode === 302) {
        downloadFileAuto(response.headers.location, destPath).then(resolve).catch(reject);
        return;
      }
      if (response.statusCode !== 200) {
        reject(new Error(`HTTP ${response.statusCode}`));
        return;
      }
      const fileStream = fs.createWriteStream(destPath);
      response.pipe(fileStream);
      fileStream.on('finish', () => { fileStream.close(); resolve(); });
      fileStream.on('error', (err) => { fs.unlink(destPath, () => {}); reject(err); });
    }).on('error', reject);
  });
}

// Execução principal
async function main() {
  const args = process.argv.slice(2);
  const urlArg = args.find(arg => arg.startsWith('--url='));

  if (!urlArg) {
    console.error('\n❌ Erro: Por favor, forneça a URL da página WordPress.');
    console.log('Exemplo: node extract-assets.mjs --url=https://eventos.multiplaeventos.com.br/debutantes-v1/\n');
    process.exit(1);
  }

  const pageUrl = urlArg.split('=')[1];
  console.log(`\n🔍 Acessando: ${pageUrl}...`);

  try {
    const html = await fetchHtml(pageUrl);
    
    // Extrair o slug da URL para salvar o arquivo HTML
    const parsedUrl = new URL(pageUrl);
    const pathParts = parsedUrl.pathname.split('/').filter(Boolean);
    const rawSlug = pathParts[pathParts.length - 1] || 'index';
    const slug = slugify(rawSlug);
    
    const htmlPath = path.join(sourceDir, `${slug}.html`);
    fs.writeFileSync(htmlPath, html, 'utf8');
    console.log(`✅ HTML salvo em: ${htmlPath}`);

    // ── 1. CSS do Elementor (post-XXX.css) ─────────────────────────────────
    let cssDownloaded = false;
    const elementorCssUrl = extractElementorCssUrl(html);

    if (elementorCssUrl) {
      const cssFilename = path.basename(elementorCssUrl); // ex: post-952.css
      const cssDest = path.join(sourceDir, `${slug}.css`);
      console.log(`\n🎨 CSS Elementor detectado: ${cssFilename}`);
      try {
        await downloadFileAuto(elementorCssUrl, cssDest);
        console.log(`✅ CSS salvo em: ${cssDest}`);
        console.log(`   → Use este arquivo como referência para reescrever o CSS scoped da página.`);
        cssDownloaded = true;
      } catch (err) {
        console.warn(`⚠️  Não foi possível baixar o CSS: ${err.message}`);
        console.warn(`   → Baixe manualmente via DevTools: ${elementorCssUrl}`);
      }
    } else {
      console.warn(`\n⚠️  CSS do Elementor não encontrado no HTML.`);
      console.warn(`   → Pode estar inline ou servido por outro mecanismo.`);
      console.warn(`   → Verifique manualmente em DevTools > Network > CSS.`);
    }

    // ── 2. Fontes customizadas (@font-face no CSS baixado) ──────────────────
    if (cssDownloaded) {
      const cssContent = fs.readFileSync(path.join(sourceDir, `${slug}.css`), 'utf8');
      const fontRegex = /url\(['"]?(https?:\/\/[^'")]+\.(?:woff2?|ttf|otf|eot))['"]?\)/gi;
      const fontUrls = new Set();
      let fontMatch;
      while ((fontMatch = fontRegex.exec(cssContent)) !== null) {
        fontUrls.add(fontMatch[1].split('?')[0]);
      }

      if (fontUrls.size > 0) {
        const fontsDir = path.join('src', 'assets', 'fonts');
        if (!fs.existsSync(fontsDir)) fs.mkdirSync(fontsDir, { recursive: true });
        console.log(`\n🔤 ${fontUrls.size} fonte(s) detectada(s) no CSS...`);
        for (const fontUrl of fontUrls) {
          const fontFilename = path.basename(fontUrl);
          const fontDest = path.join(fontsDir, fontFilename);
          if (fs.existsSync(fontDest)) {
            console.log(`   ✅ ${fontFilename} (já existe)`);
            continue;
          }
          try {
            await downloadFileAuto(fontUrl, fontDest);
            console.log(`   📥 ${fontFilename}`);
          } catch {
            console.warn(`   ⚠️  ${fontFilename} — não foi possível baixar. Adicione manualmente ou substitua por Google Fonts.`);
          }
        }
      }
    }

    // ── 3. Imagens ──────────────────────────────────────────────────────────
    const imgRegex = /(https?:\/\/[^\s"'()<>]+?\.(?:jpg|jpeg|png|webp|avif|gif)(?:\?[^\s"']*)?)/gi;
    const matches = html.match(imgRegex) || [];

    const imageUrls = Array.from(new Set(matches)).filter(url =>
      !url.includes('sentry') && !url.includes('facebook.com')
    );

    console.log(`\n📸 ${imageUrls.length} imagens encontradas. Baixando...`);
    let downloadCount = 0;
    let failCount = 0;

    const downloadPromises = imageUrls.map(async (imgUrl) => {
      try {
        const cleanUrl = imgUrl.split('?')[0];
        const filename = path.basename(cleanUrl);
        const destPath = path.join(destImagesDir, filename);

        if (fs.existsSync(destPath)) { downloadCount++; return; }

        await downloadFileAuto(imgUrl, destPath);
        downloadCount++;
        console.log(`   📥 [${downloadCount}/${imageUrls.length}] ${filename}`);
      } catch (err) {
        failCount++;
        console.warn(`   ⚠️ Erro: ${path.basename(imgUrl.split('?')[0])} — ${err.message}`);
      }
    });

    await Promise.all(downloadPromises);

    // ── Resumo Final ────────────────────────────────────────────────────────
    console.log(`\n${'═'.repeat(54)}`);
    console.log(`🎉 Extração concluída — /${slug}`);
    console.log(`${'─'.repeat(54)}`);
    console.log(`   HTML     : _html-originais/${slug}.html`);
    console.log(`   CSS WP   : ${cssDownloaded ? `_html-originais/${slug}.css ✅` : '⚠️  não baixado (ver aviso acima)'}`);
    console.log(`   Fontes   : src/assets/fonts/ (baixadas automaticamente se encontradas no CSS)`);
    console.log(`   Imagens  : src/assets/images/ (${downloadCount} ok, ${failCount} falhas)`);
    console.log(`${'─'.repeat(54)}`);
    console.log(`\n👉 Próximos passos:`);
    console.log(`   1. npm run scaffold`);
    console.log(`   2. IA lê _html-originais/${slug}.css → reescreve src/styles/${slug}.css`);
    console.log(`   3. npm run dev → validar visualmente`);
    console.log(`   4. npm run compare -- --slug=${slug}\n`);

  } catch (err) {
    console.error(`\n❌ Erro geral no processo: ${err.message}\n`);
    process.exit(1);
  }
}

main();
