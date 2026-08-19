/**
 * compare.mjs — Visual Regression Testing (VRT) para migrações Dmove
 * v1.2 — Multi-viewport: desktop (1440), tablet (768), mobile (375)
 *
 * Uso:
 *   npm run compare -- --slug=casamentos
 *   npm run compare -- --slug=casamentos --prod=https://cliente.com.br
 *   npm run compare -- --slug=casamentos --viewport=desktop   (só um viewport)
 *   npm run compare -- --slug=casamentos --viewport=mobile
 *
 * Saída em scripts/vrt-output/[slug]/
 *   [viewport]-prod.png, [viewport]-local.png, [viewport]-diff.png
 */

import fs from 'fs';
import path from 'path';
import { chromium } from 'playwright';
import { PNG } from 'pngjs';
import pixelmatch from 'pixelmatch';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const config  = require('../config.json');

// ─── Argumentos ───────────────────────────────────────────────────────────────

const args    = process.argv.slice(2);
const getArg  = (name) => { const e = args.find(a => a.startsWith(`--${name}=`)); return e ? e.split('=').slice(1).join('=') : null; };
const hasFlag = (name) => args.includes(`--${name}`);

const slug        = getArg('slug');
const prodBase    = getArg('prod')      || `https://${config.deploy?.server || 'localhost'}`;
const localBase   = getArg('local')     || 'http://localhost:4321';
const threshold   = parseFloat(getArg('threshold') || '0.1');
const onlyVP      = getArg('viewport'); // filtrar um viewport específico

if (!slug) {
  console.error('\n❌ Argumento obrigatório: --slug=nome-da-pagina');
  console.log('Exemplos:');
  console.log('  npm run compare -- --slug=casamentos');
  console.log('  npm run compare -- --slug=casamentos --viewport=mobile\n');
  process.exit(1);
}

// ─── Viewports ────────────────────────────────────────────────────────────────

const ALL_VIEWPORTS = [
  { name: 'desktop', width: 1440, height: 900  },
  { name: 'tablet',  width: 768,  height: 1024 },
  { name: 'mobile',  width: 375,  height: 812  },
];

const VIEWPORTS = onlyVP
  ? ALL_VIEWPORTS.filter(v => v.name === onlyVP)
  : ALL_VIEWPORTS;

if (VIEWPORTS.length === 0) {
  console.error(`\n❌ Viewport inválido: "${onlyVP}". Use: desktop, tablet ou mobile\n`);
  process.exit(1);
}

// ─── Diretório de saída por slug ──────────────────────────────────────────────

const outputDir = path.join('scripts', 'vrt-output', slug);
if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });

// ─── Screenshot ───────────────────────────────────────────────────────────────

async function captureScreenshot(url, outputPath, browser, viewport) {
  const page = await browser.newPage();
  await page.setViewportSize({ width: viewport.width, height: viewport.height });

  try {
    await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(1200);

    // Scroll completo para forçar lazy images (em steps, pra dar tempo do
    // IntersectionObserver disparar e da imagem carregar antes do próximo salto)
    await page.evaluate(async () => {
      const step = Math.max(400, window.innerHeight);
      for (let y = 0; y < document.body.scrollHeight; y += step) {
        window.scrollTo(0, y);
        await new Promise((r) => setTimeout(r, 150));
      }
      window.scrollTo(0, document.body.scrollHeight);
    });
    await page.waitForTimeout(600);

    // Espera todas as <img> da página terminarem de carregar (lazy incluído),
    // com timeout pra não travar caso alguma imagem realmente esteja quebrada
    await page.evaluate(() => Promise.race([
      Promise.all(
        Array.from(document.images)
          .filter((img) => !img.complete)
          .map((img) => new Promise((resolve) => {
            img.addEventListener('load', resolve, { once: true });
            img.addEventListener('error', resolve, { once: true });
          }))
      ),
      new Promise((resolve) => setTimeout(resolve, 8000)),
    ])).catch(() => {});
    await page.waitForTimeout(300);

    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(400);

    await page.screenshot({ path: outputPath, fullPage: true });
    console.log(`    ✅ ${path.basename(outputPath)}`);
  } catch (err) {
    console.error(`    ❌ Erro ao capturar ${url}: ${err.message}`);
    await page.close();
    throw err;
  }
  await page.close();
}

// ─── Comparação ───────────────────────────────────────────────────────────────

// pixelmatch exige buffers do mesmo tamanho; como os prints full-page costumam
// ter alturas diferentes (conteúdo com densidades distintas), recorta ambos
// para a altura comum a partir do topo antes de comparar.
function cropToHeight(img, height) {
  const cropped = new PNG({ width: img.width, height });
  img.data.copy(cropped.data, 0, 0, img.width * height * 4);
  return cropped;
}

function compareImages(imgAPath, imgBPath, diffOutPath) {
  const imgARaw = PNG.sync.read(fs.readFileSync(imgAPath));
  const imgBRaw = PNG.sync.read(fs.readFileSync(imgBPath));

  const width  = Math.min(imgARaw.width,  imgBRaw.width);
  const height = Math.min(imgARaw.height, imgBRaw.height);
  const imgA   = cropToHeight(imgARaw, height);
  const imgB   = cropToHeight(imgBRaw, height);
  const diff   = new PNG({ width, height });

  const mismatch = pixelmatch(imgA.data, imgB.data, diff.data, width, height, {
    threshold,
    includeAA: false,
    diffColor: [220, 38, 38],
    aaColor:   [251, 191, 36],
  });

  fs.writeFileSync(diffOutPath, PNG.sync.write(diff));

  const totalPixels     = width * height;
  const mismatchPercent = ((mismatch / totalPixels) * 100).toFixed(2);
  return { mismatch, totalPixels, mismatchPercent, width, height };
}

// ─── Formata resultado por viewport ──────────────────────────────────────────

function formatResult(vpName, result) {
  const pct = parseFloat(result.mismatchPercent);
  const icon = pct === 0 ? '🟢' : pct < 1 ? '🟡' : pct < 5 ? '🟠' : '🔴';
  const label = pct === 0   ? 'PERFEITO'
              : pct < 1     ? 'QUASE PERFEITO'
              : pct < 5     ? 'PEQUENAS DIFERENÇAS'
              : 'DIFERENÇAS SIGNIFICATIVAS';
  return { pct, icon, label };
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const prodUrl  = `${prodBase}/${slug}`.replace(/([^:])\/\//g, '$1/');
  const localUrl = `${localBase}/${slug}`.replace(/([^:])\/\//g, '$1/');

  console.log(`\n🔍 VRT — /${slug}`);
  console.log(`   Produção  : ${prodUrl}`);
  console.log(`   Local     : ${localUrl}`);
  console.log(`   Viewports : ${VIEWPORTS.map(v => `${v.name} (${v.width}×${v.height})`).join(' | ')}`);
  console.log(`   Threshold : ${(threshold * 100).toFixed(0)}% por pixel\n`);

  const browser = await chromium.launch({ headless: true });
  const results = [];
  let hasCritical = false;

  for (const vp of VIEWPORTS) {
    const prodPath  = path.join(outputDir, `${vp.name}-prod.png`);
    const localPath = path.join(outputDir, `${vp.name}-local.png`);
    const diffPath  = path.join(outputDir, `${vp.name}-diff.png`);

    console.log(`📐 ${vp.name.toUpperCase()} — ${vp.width}×${vp.height}px`);

    try {
      // Paralelo: captura produção e local ao mesmo tempo
      await Promise.all([
        captureScreenshot(prodUrl,  prodPath,  browser, vp),
        captureScreenshot(localUrl, localPath, browser, vp),
      ]);

      console.log(`    🔬 Comparando...`);
      const result = compareImages(prodPath, localPath, diffPath);
      const { pct, icon, label } = formatResult(vp.name, result);

      console.log(`    ${icon} ${result.mismatchPercent}% — ${label}\n`);
      results.push({ vp, result, pct, icon, label });

      if (pct > 5) hasCritical = true;
    } catch {
      console.error(`    ❌ Falha no viewport ${vp.name}\n`);
      hasCritical = true;
    }
  }

  await browser.close();

  // ─── Relatório Final ────────────────────────────────────────────────────────
  console.log(`${'═'.repeat(56)}`);
  console.log(`📊 RELATÓRIO FINAL — /${slug}`);
  console.log(`${'═'.repeat(56)}`);

  for (const { vp, result, icon, label } of results) {
    console.log(`  ${icon} ${vp.name.padEnd(8)} ${result.mismatchPercent.padStart(6)}%  ${label}`);
  }

  console.log(`${'─'.repeat(56)}`);
  console.log(`📁 Diffs em: scripts/vrt-output/${slug}/`);

  for (const { vp } of results) {
    console.log(`   ${vp.name}-diff.png`);
  }

  console.log();

  if (hasCritical) {
    console.error('❌ Um ou mais viewports com diferença > 5%. Revise o diff antes do deploy.\n');
    process.exit(1);
  } else {
    console.log('✅ Todos os viewports dentro do threshold. Pronto para deploy.\n');
  }
}

main();
