import fs from 'fs';
import path from 'path';

const sourceDir = '_html-originais';
const destPagesDir = path.join('src', 'pages');
const destStylesDir = path.join('src', 'styles');
const destScriptsDir = path.join('src', 'scripts');

[destPagesDir, destStylesDir, destScriptsDir].forEach(dir => {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

function slugify(text) {
  return text.toString().toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, '-')
    .replace(/[^\w\-]+/g, '')
    .replace(/\-\-+/g, '-')
    .replace(/^-+/, '')
    .replace(/-+$/, '');
}

// ─── Meta extraction ─────────────────────────────────────────────────────────

function extractMeta(html) {
  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const descMatch =
    html.match(/<meta\s[^>]*name=["']description["'][^>]*content=["']([^"']*)["']/i) ||
    html.match(/<meta\s[^>]*content=["']([^"']*)["'][^>]*name=["']description["']/i);
  const ogImageMatch =
    html.match(/<meta\s[^>]*property=["']og:image["'][^>]*content=["']([^"']*)["']/i) ||
    html.match(/<meta\s[^>]*content=["']([^"']*)["'][^>]*property=["']og:image["']/i);
  const canonicalMatch =
    html.match(/<link\s[^>]*rel=["']canonical["'][^>]*href=["']([^"']*)["']/i) ||
    html.match(/<link\s[^>]*href=["']([^"']*)["'][^>]*rel=["']canonical["']/i);

  return {
    title: titleMatch ? titleMatch[1].trim().replace(/\s+/g, ' ') : '',
    description: descMatch ? descMatch[1].trim() : '',
    ogImage: ogImageMatch ? ogImageMatch[1].trim() : '',
    canonical: canonicalMatch ? canonicalMatch[1].trim() : '',
  };
}

// ─── HTML extraction helpers ──────────────────────────────────────────────────

function extractBody(html) {
  const m = html.match(/<body[^>]*>([\s\S]*)<\/body>/i);
  return m ? m[1].trim() : html;
}

function extractStyleBlocks(html) {
  const rx = /<style[^>]*>([\s\S]*?)<\/style>/gi;
  const blocks = [];
  let m;
  while ((m = rx.exec(html)) !== null) blocks.push(m[1].trim());
  return blocks;
}

function extractInlineScriptBlocks(html) {
  const rx = /<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi;
  const blocks = [];
  let m;
  while ((m = rx.exec(html)) !== null) {
    const content = m[1].trim();
    if (!content) continue;
    // GTM é injetado automaticamente pelo Base.astro — ignorar
    if (content.includes('googletagmanager.com/gtm.js') || content.includes("'gtm.start'")) continue;
    blocks.push(content);
  }
  return blocks;
}

function stripTagBlocks(html, tag) {
  return html.replace(new RegExp(`<${tag}[\\s\\S]*?<\\/${tag}>`, 'gi'), '');
}

function stripGTMBlocks(html) {
  html = html.replace(
    /<noscript>\s*<iframe[^>]*googletagmanager\.com\/ns\.html[^>]*>[\s\S]*?<\/iframe>\s*<\/noscript>/gi,
    ''
  );
  html = html.replace(/[ \t]*<!--[^>]*GTM[\s\S]*?-->\s*\n?/gi, '');
  return html;
}

function stripWPAdminBar(html) {
  html = html.replace(/<div\s+id=["']wpadminbar["'][\s\S]*?<\/div>/gi, '');
  html = html.replace(/<ul\s+id=["']wp-admin-bar-[\s\S]*?<\/ul>/gi, '');
  html = html.replace(/<li\s+[^>]*id=["']wp-admin-bar-[\s\S]*?<\/li>/gi, '');
  html = html.replace(/<style[^>]*>[\s\S]*?html\s*\{\s*margin-top:\s*32px\s*!important;\s*\}[\s\S]*?<\/style>/gi, '');
  return html;
}

function stripComments(html) {
  html = html.replace(/<!--\s*Title:[\s\S]*?End of snippet\s*-->/gi, '');
  return html;
}

function stripElementorBloat(html) {
  html = html.replace(/<script\s+id=["']elementor-frontend-js-before["'][\s\S]*?<\/script>/gi, '');
  html = html.replace(/var\s+elementorFrontendConfig\s*=\s*\{[\s\S]*?\};/gi, '');
  html = html.replace(/<link\s+rel=["']edituri["'][\s\S]*?>/gi, '');
  html = html.replace(/<link\s+rel=["']wlwmanifest["'][\s\S]*?>/gi, '');
  html = html.replace(/<meta\s+name=["']generator["']\s+content=["']Elementor[\s\S]*?>/gi, '');
  html = html.replace(/<iframe[^>]*id=["']rd_tmgr["'][\s\S]*?<\/iframe>/gi, '');
  return html;
}

function fixExternalScripts(html) {
  return html.replace(/<script\s+src/gi, '<script is:inline src');
}

// ─── Icon library detector ────────────────────────────────────────────────────
// Escaneia o HTML em busca de classes de ícones e retorna os <link> CDN corretos.
// Bibliotecas detectadas: Font Awesome 6, Line Awesome, Bootstrap Icons, Simple Line Icons.

function detectIconLibraries(html) {
  const links = [];

  // Font Awesome 6 Free — classes: fa-solid, fa-regular, fa-brands, fa-*
  if (/\bfa-(solid|regular|brands|thin|duotone|\w+-fa|[a-z-]+)\b/.test(html) || /class=["'][^"']*\bfa-\w/.test(html)) {
    links.push(
      `<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.2/css/all.min.css" integrity="sha512-SnH5WK+bZxgPHs44uWIX+LLJAJ9/2PkPKZ5QiAj6Ta86w+fsb2TkcmfRyVX3pBnMFcV7oQPJkl9QevSCWr3W==" crossorigin="anonymous" referrerpolicy="no-referrer" />`
    );
  }

  // Line Awesome — classes: la-*, las, lar, lab, lal, lad
  if (/class=["'][^"']*\b(la-\w|las\b|lar\b|lab\b)/.test(html)) {
    links.push(
      `<link rel="stylesheet" href="https://maxst.icons8.com/vue-static/landings/line-awesome/line-awesome/1.3.0/css/line-awesome.min.css" />`
    );
  }

  // Bootstrap Icons — classes: bi-*
  if (/class=["'][^"']*\bbi-\w/.test(html)) {
    links.push(
      `<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/bootstrap-icons@1.11.3/font/bootstrap-icons.min.css" />`
    );
  }

  // Simple Line Icons — classes: icon-*
  if (/class=["'][^"']*\bicon-[a-z]/.test(html)) {
    links.push(
      `<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/simple-line-icons/2.5.5/css/simple-line-icons.min.css" />`
    );
  }

  return links;
}

// ─── Component warning detector ───────────────────────────────────────────────
// Escaneia o HTML gerado e retorna avisos para componentes que precisam de
// atenção manual após o scaffold.

function detectComponentWarnings(html) {
  const checks = [
    [/class=["'][^"']*\bswiper\b[^"']*["']/i,             'Carousel/Swiper — considere componente com lazy-load otimizado'],
    [/class=["'][^"']*\bowl-carousel\b[^"']*["']/i,        'OWL Carousel — migrar para Swiper ou componente nativo'],
    [/class=["'][^"']*\bslick-slider\b[^"']*["']/i,        'Slick Slider — migrar para Swiper ou componente nativo'],
    [/class=["'][^"']*\belementor-tabs\b[^"']*["']/i,      'Tabs (Elementor) — substituir por <details> nativo ou componente Astro'],
    [/class=["'][^"']*\belementor-accordion\b[^"']*["']/i, 'Accordion (Elementor) — substituir por <details>/<summary> nativos'],
    [/class=["'][^"']*\belementor-gallery\b[^"']*["']/i,   'Galeria (Elementor) — verifique lazy-load das imagens'],
    [/class=["'][^"']*\belementor-counter\b[^"']*["']/i,   'Counter animado — inspecione o script JS gerado'],
    [/class=["'][^"']*\belementor-progress\b[^"']*["']/i,  'Progress bar (Elementor) — inspecione animação JS'],
    [/class=["'][^"']*\bwoocommerce\b[^"']*["']/i,         'WooCommerce — componentes de loja não são migrados automaticamente'],
    [/\bdata-aos=/i,                                        'AOS animate-on-scroll — substitua por data-animate do template'],
  ];
  return checks.filter(([rx]) => rx.test(html)).map(([, msg]) => msg);
}

// ─── Indentation helper ───────────────────────────────────────────────────────

function getIndentAt(str, pos) {
  const lineStart = str.lastIndexOf('\n', pos - 1);
  if (lineStart < 0) return '';
  return (str.slice(lineStart + 1, pos).match(/^(\s*)/) || ['', ''])[1];
}

// ─── <img> → <Img> ───────────────────────────────────────────────────────────

function replaceImages(html) {
  let imgCount = 0;
  let hasImg = false;

  const result = html.replace(/<img\s([^>]*?)(?:\s\/)?>/gi, (match, attrs) => {
    const alt = (attrs.match(/\balt=["']([^"']*)["']/) || [])[1] || '';
    const widthStr = (attrs.match(/\bwidth=["']?(\d+)["']?/) || [])[1];
    const heightStr = (attrs.match(/\bheight=["']?(\d+)["']?/) || [])[1];
    const cls = (attrs.match(/\bclass=["']([^"']*)["']/) || [])[1];
    const style = (attrs.match(/\bstyle=["']([^"']*)["']/) || [])[1];

    const srcMatch = attrs.match(/\bsrc=["']([^"']*)["']/);
    const originalSrc = srcMatch ? srcMatch[1] : '';
    const imgFilename = originalSrc ? path.basename(originalSrc).split('?')[0] : 'placeholder.jpg';

    hasImg = true;
    const isPriority = imgCount === 0;
    imgCount++;

    let props = `src="${imgFilename}" alt="${alt}"`;
    if (widthStr) props += ` width={${widthStr}}`;
    if (heightStr) props += ` height={${heightStr}}`;
    if (cls) props += ` class="${cls}"`;
    if (style) props += ` style="${style}"`;
    if (isPriority) props += ` priority`;

    return `<Img ${props} />`;
  });

  return { html: result, hasImg };
}

// ─── <video> → <Video> ────────────────────────────────────────────────────────

function replaceVideos(html) {
  let hasVideo = false;

  const result = html.replace(/<video[\s\S]*?<\/video>/gi, (match) => {
    hasVideo = true;
    const cls     = (match.match(/\bclass=["']([^"']*)["']/) || [])[1];
    const poster  = (match.match(/\bposter=["']([^"']*)["']/) || [])[1] || '';
    // Preferir <source> interna, depois src= direto do <video>
    const srcFromSource = (match.match(/<source[^>]*\bdata-src=["']([^"']+)["']/) ||
                           match.match(/<source[^>]*\bsrc=["']([^"']+)["']/) || [])[1] || '';
    const srcFromAttr   = (match.match(/\bsrc=["']([^"']+\.mp4[^"']*)["']/) ||
                           match.match(/\bsrc=["']([^"']+)["']/) || [])[1] || '';
    const rawSrc  = srcFromSource || srcFromAttr;
    const videoTitle = (match.match(/\btitle=["']([^"']*)["']/) ||
                        match.match(/\bdata-title=["']([^"']*)["']/) ||
                        match.match(/\baria-label=["']([^"']*)["']/) || [])[1] || 'Vídeo';

    const videoSrc  = rawSrc && rawSrc.startsWith('http') ? rawSrc : '/videos/placeholder.mp4';
    const posterSrc = poster && poster.startsWith('http') ? poster : '/images/placeholder-video.jpg';
    const year      = new Date().getFullYear();

    let props = `src="${videoSrc}" poster="${posterSrc}" title="${videoTitle.replace(/"/g, '&quot;')}" description="Vídeo" uploadDate="${year}-01-01" duration="PT1M"`;
    if (cls) props += ` class="${cls}"`;

    return `<Video ${props} />`;
  });

  return { html: result, hasVideo };
}

// ─── YouTube iframe optimizer ─────────────────────────────────────────────────
// Converte embeds do YouTube para youtube-nocookie.com e adiciona loading="lazy".

function replaceYouTubeIframes(html) {
  return html.replace(
    /<iframe([^>]*)src=["'](?:https?:)?\/\/(?:www\.)?youtube(?:-nocookie)?\.com\/embed\/([a-zA-Z0-9_-]+)([^"']*)["']([^>]*)(?:><\/iframe>|\/?>)/gi,
    (match, _before, videoId, params, _after) => {
      const cls    = (match.match(/\bclass=["']([^"']*)["']/) || [])[1];
      const width  = (match.match(/\bwidth=["']?(\d+)["']?/) || [])[1] || '560';
      const height = (match.match(/\bheight=["']?(\d+)["']?/) || [])[1] || '315';
      const title  = (match.match(/\btitle=["']([^"']*)["']/) || [])[1] || 'Vídeo';
      // Remove autoplay para conformidade com políticas de privacidade
      const cleanParams = params.replace(/[?&]autoplay=1/gi, '');
      return `<iframe src="https://www.youtube-nocookie.com/embed/${videoId}${cleanParams}" width="${width}" height="${height}" title="${title}" loading="lazy" frameborder="0" allow="accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen${cls ? ` class="${cls}"` : ''}></iframe>`;
    }
  );
}

// ─── <form> → <LeadForm> ─────────────────────────────────────────────────────

function findFormBounds(html) {
  const lower = html.toLowerCase();
  let start = -1;
  let depth = 0;
  let i = 0;

  while (i < lower.length) {
    if (lower[i] !== '<') { i++; continue; }

    const chunk6 = lower.slice(i, i + 6);
    const chunk7 = lower.slice(i, i + 7);

    if (chunk6 === '<form ' || chunk6 === '<form>') {
      if (start === -1) start = i;
      depth++;
      i += 5;
    } else if (chunk7 === '</form>') {
      if (start !== -1) {
        depth--;
        if (depth === 0) return { start, end: i + 7 };
      }
      i += 7;
    } else {
      i++;
    }
  }
  return null;
}

function extractFormFields(formHtml) {
  const nameMap = { name: 'nome', whatsapp: 'telefone', phone: 'telefone', 'e-mail': 'email' };
  const fields = [];
  const radioGroups = new Map(); // name → { name, type:'select', options, required }

  const inputRx = /<input\s([^>]*?)(?:\s\/)?>/gi;
  let m;
  while ((m = inputRx.exec(formHtml)) !== null) {
    const attrs    = m[1];
    let name       = (attrs.match(/\bname=["']([^"']*)["']/) || [])[1];
    const rawType  = ((attrs.match(/\btype=["']([^"']*)["']/) || [])[1] || 'text').toLowerCase();
    const placeholder = (attrs.match(/\bplaceholder=["']([^"']*)["']/) || [])[1] || '';
    const required = /\brequired\b/i.test(attrs);

    if (!name) continue;
    if (['submit', 'button', 'hidden', 'reset', 'image', 'checkbox'].includes(rawType)) continue;
    if (name === 'website') continue;

    name = nameMap[name.toLowerCase()] || name;

    // Agrupa radio buttons como <select> com opções
    if (rawType === 'radio') {
      const value = (attrs.match(/\bvalue=["']([^"']*)["']/) || [])[1] || '';
      if (!radioGroups.has(name)) {
        radioGroups.set(name, { name, type: 'select', placeholder: '', required, options: [] });
      }
      const group = radioGroups.get(name);
      if (value && !group.options.some(o => o.value === value)) {
        group.options.push({ value, label: value });
      }
      continue;
    }

    if (fields.some(f => f.name === name)) continue;

    const type = ['text', 'email', 'tel', 'number'].includes(rawType) ? rawType : 'text';
    const minlength = (attrs.match(/\bminlength=["']?(\d+)["']?/) || [])[1];
    const maxlength = (attrs.match(/\bmaxlength=["']?(\d+)["']?/) || [])[1];
    const pattern   = (attrs.match(/\bpattern=["']([^"']*)["']/) || [])[1];

    const field = { name, type, placeholder, required };
    if (minlength) field.minlength = parseInt(minlength, 10);
    if (maxlength) field.maxlength = parseInt(maxlength, 10);
    if (pattern)   field.pattern   = pattern;
    fields.push(field);
  }

  const taRx = /<textarea\s([^>]*?)>/gi;
  while ((m = taRx.exec(formHtml)) !== null) {
    const attrs = m[1];
    let name = (attrs.match(/\bname=["']([^"']*)["']/) || [])[1];
    const placeholder = (attrs.match(/\bplaceholder=["']([^"']*)["']/) || [])[1] || '';
    const required = /\brequired\b/i.test(attrs);
    if (!name) continue;
    name = nameMap[name.toLowerCase()] || name;
    if (fields.some(f => f.name === name)) continue;
    fields.push({ name, type: 'textarea', placeholder, required });
  }

  const selRx = /<select\s([^>]*?)>([\s\S]*?)<\/select>/gi;
  while ((m = selRx.exec(formHtml)) !== null) {
    const attrs = m[1];
    const selectInner = m[2];
    let name = (attrs.match(/\bname=["']([^"']*)["']/) || [])[1];
    const required = /\brequired\b/i.test(attrs);
    if (!name) continue;
    name = nameMap[name.toLowerCase()] || name;
    if (fields.some(f => f.name === name)) continue;

    const optRx = /<option([^>]*)>([\s\S]*?)<\/option>/gi;
    const options = [];
    let om;
    while ((om = optRx.exec(selectInner)) !== null) {
      const oAttrs = om[1];
      const label = om[2].trim().replace(/<[^>]*>/g, '');
      const value = (oAttrs.match(/\bvalue=["']([^"']*)["']/) || [])[1] ?? label;
      const disabled = /\bdisabled\b/i.test(oAttrs);
      const selected = /\bselected\b/i.test(oAttrs);
      if (label) options.push({ value, label, ...(disabled && { disabled }), ...(selected && { selected }) });
    }
    fields.push({ name, type: 'select', placeholder: '', required, options });
  }

  // Adiciona grupos de radio que não conflitam com um <select> explícito
  for (const [name, group] of radioGroups) {
    if (!fields.some(f => f.name === name)) fields.push(group);
  }

  return fields;
}

function buildFieldsProp(fields, indent) {
  const defaults = ['nome', 'telefone', 'email'];
  const isDefault =
    fields.length === defaults.length &&
    defaults.every(n => fields.some(f => f.name === n));

  if (isDefault) return '';

  const pi = indent + '  ';
  const fi = pi + '  ';
  const oi = fi + '  ';

  const defs = fields.map(f => {
    let parts = [`name: '${f.name}'`, `type: '${f.type}'`];
    parts.push(`placeholder: '${(f.placeholder || '').replace(/'/g, "\\'")}'`);
    parts.push(`required: ${f.required}`);
    if (f.minlength) parts.push(`minlength: ${f.minlength}`);
    if (f.maxlength) parts.push(`maxlength: ${f.maxlength}`);
    if (f.pattern)   parts.push(`pattern: '${f.pattern.replace(/'/g, "\\'")}'`);

    if (f.type === 'select' && f.options?.length) {
      const opts = f.options
        .map(o => `${oi}{ value: '${o.value.replace(/'/g, "\\'")}', label: '${o.label.replace(/'/g, "\\'")}' }`)
        .join(',\n');
      parts.push(`options: [\n${opts}\n${fi}]`);
    }

    return `${fi}{ ${parts.join(', ')} }`;
  });

  return `\n${pi}fields={[\n${defs.join(',\n')}\n${pi}]}`;
}

function replaceAllForms(html) {
  let hasForm = false;
  let result = html;

  while (true) {
    const bounds = findFormBounds(result);
    if (!bounds) break;
    hasForm = true;

    const formHtml = result.slice(bounds.start, bounds.end);
    const indent = getIndentAt(result, bounds.start);
    const pi = indent + '  ';

    const btnMatch =
      formHtml.match(/<button[^>]*type=["']submit["'][^>]*>([\s\S]*?)<\/button>/i) ||
      formHtml.match(/<input[^>]*type=["']submit["'][^>]*>/i);
    let submitText = 'Enviar';
    if (btnMatch) {
      if (btnMatch[1] !== undefined) {
        submitText = btnMatch[1].replace(/<[^>]*>/g, '').trim() || 'Enviar';
      } else {
        submitText = (btnMatch[0].match(/\bvalue=["']([^"']*)["']/) || [])[1] || 'Enviar';
      }
    }

    const fields = extractFormFields(formHtml);
    const fieldsProp = buildFieldsProp(fields, indent);

    const leadFormTag =
      `<LeadForm\n` +
      `${pi}formId="lead-form"\n` +
      `${pi}project={config.project_slug}\n` +
      `${pi}submitUrl={config.forms['lead-form'].webhooks[0]}\n` +
      `${pi}redirectUrl={config.forms['lead-form'].redirect_on_success}\n` +
      `${pi}submitText="${submitText}"\n` +
      `${pi}honeypot${fieldsProp}\n` +
      `${indent}/>`;

    result = result.slice(0, bounds.start) + leadFormTag + result.slice(bounds.end);
  }

  return { html: result, hasForm };
}

// ─── Main loop ────────────────────────────────────────────────────────────────

const forceFlag = process.argv.includes('--force');

if (!fs.existsSync(sourceDir)) {
  console.error(`\n❌ Erro: Diretório "${sourceDir}" não encontrado.\n`);
  process.exit(1);
}

const files = fs.readdirSync(sourceDir).filter(f => f.endsWith('.html'));
if (!files.length) {
  console.log(`\n⚠️ Nenhum .html encontrado em "${sourceDir}".\n`);
  process.exit(0);
}

console.log(`\n🚀 Iniciando conversão de ${files.length} arquivo(s)...${forceFlag ? ' (--force: sobrescrevendo existentes)' : ''}\n`);
let successCount = 0;
let skippedCount = 0;

files.forEach(filename => {
  const sourceFile = path.join(sourceDir, filename);
  const rawName = filename.replace('.html', '');
  const slugSource = rawName.includes(' - ') ? rawName.split(' - ').slice(1).join(' - ') : rawName;
  const baseName = slugify(slugSource);

  const destAstroFile = path.join(destPagesDir, `${baseName}.astro`);
  const destCssFile = path.join(destStylesDir, `${baseName}.css`);
  const destJsFile = path.join(destScriptsDir, `${baseName}.js`);

  if (!forceFlag && fs.existsSync(destAstroFile)) {
    console.log(`⏭️  [${filename}] → ${baseName}.astro já existe, pulando. Use --force para sobrescrever.`);
    skippedCount++;
    return;
  }

  try {
    const htmlContent = fs.readFileSync(sourceFile, 'utf8');

    const meta = extractMeta(htmlContent);

    const cssBlocks = extractStyleBlocks(htmlContent);
    const hasCss = cssBlocks.length > 0;
    if (hasCss) {
      fs.writeFileSync(destCssFile, `/* Estilos extraídos de ${filename} */\n\n${cssBlocks.join('\n\n')}`, 'utf8');
    }

    const jsBlocks = extractInlineScriptBlocks(htmlContent);
    const hasJs = jsBlocks.length > 0;
    if (hasJs) {
      fs.writeFileSync(destJsFile, `/* Scripts extraídos de ${filename} */\n\n${jsBlocks.join('\n\n')}`, 'utf8');
    }
    const jsHasFormCode = jsBlocks.some(b => b.includes("addEventListener('submit'") || b.includes('addEventListener("submit"'));

    let body = extractBody(htmlContent);
    body = stripTagBlocks(body, 'style');
    body = stripTagBlocks(body, 'script');
    body = stripGTMBlocks(body);
    body = stripWPAdminBar(body);
    body = stripElementorBloat(body);
    body = stripComments(body);
    body = fixExternalScripts(body);

    const { html: bodyAfterImg, hasImg } = replaceImages(body);
    body = bodyAfterImg;

    const { html: bodyAfterForm, hasForm } = replaceAllForms(body);
    body = bodyAfterForm;

    const { html: bodyAfterVideo, hasVideo } = replaceVideos(body);
    body = bodyAfterVideo;

    body = replaceYouTubeIframes(body);

    const componentWarnings = detectComponentWarnings(body);

    const hasStaticMap = body.includes('<StaticMap ') || body.includes("maps.google.com/maps/embed");

    // Detecção automática de bibliotecas de ícones
    const iconLinks = detectIconLibraries(body);

    const imports = [
      `import Base from '../layouts/Base.astro';`,
      `import config from '../../config.json';`,
    ];
    if (hasImg)       imports.push(`import Img from '../components/ui/Img.astro';`);
    if (hasVideo)     imports.push(`import Video from '../components/ui/Video.astro';`);
    if (hasForm)      imports.push(`import LeadForm from '../components/forms/LeadForm.astro';`);
    if (hasStaticMap) imports.push(`import StaticMap from '../components/ui/StaticMap.astro';`);
    if (hasCss)       imports.push(`import '../styles/${baseName}.css';`);

    const titleStr = meta.title || `Página | {config.project_name}`;
    let baseOpen = `<Base\n  title="${titleStr}"`;
    if (meta.description) baseOpen += `\n  description="${meta.description}"`;
    baseOpen += `\n  ogImage="${meta.ogImage || `/images/og-${baseName}.jpg`}"`;
    if (meta.canonical) baseOpen += `\n  canonical="${meta.canonical}"`;
    baseOpen += `\n>`;

    // Bloco de head com CDNs de ícones detectados automaticamente
    const headSlot = iconLinks.length > 0
      ? `\n<Fragment slot="head">\n${iconLinks.map(l => `  ${l}`).join('\n')}\n</Fragment>`
      : '';

    const pageScriptBlock = hasJs
      ? `\n<script>\n  import '../scripts/${baseName}.js';\n</script>`
      : '';

    // Adiciona import de Fragment se necessário
    if (iconLinks.length > 0 && !imports.includes(`import { Fragment } from 'astro/jsx-runtime';`)) {
      imports.unshift(`import { Fragment } from 'astro/jsx-runtime';`);
    }

    const warningsBlock = componentWarnings.length > 0
      ? `<!-- ⚠️ Componentes para revisar após scaffold:\n${componentWarnings.map(w => `  - ${w}`).join('\n')}\n-->\n`
      : '';

    const finalAstro =
      `---\n// Gerado a partir de: ${filename}\n${imports.join('\n')}\n---\n\n` +
      `${warningsBlock}${baseOpen}${headSlot}\n${body}\n</Base>${pageScriptBlock}\n`;

    fs.writeFileSync(destAstroFile, finalAstro, 'utf8');

    const flags = [
      hasCss && 'css',
      hasJs && 'js',
      hasImg && 'img',
      hasForm && 'form',
      hasVideo && 'video',
    ].filter(Boolean).join(', ');

    console.log(`✅ [${filename}] → ${baseName}.astro${flags ? ` (${flags})` : ''}`);
    if (componentWarnings.length > 0) {
      console.log(`   ⚠️  Componentes para revisar:`);
      componentWarnings.forEach(w => console.log(`      • ${w}`));
    }
    if (hasForm && hasJs && jsHasFormCode) {
      console.warn(`   ⚠️  ${baseName}.js contém código de formulário original.`);
      console.warn(`      O LeadForm + forms.ts já cuida disso — remova esse trecho do .js para evitar conflito.`);
    }
    successCount++;

  } catch (err) {
    console.error(`\n❌ Erro ao processar [${filename}]:`);
    console.error(err.message);
  }
});

console.log(`\n🎉 Concluído! ${successCount} arquivo(s) convertido(s)${skippedCount > 0 ? `, ${skippedCount} pulado(s) (já migrados)` : ''}.`);
if (successCount > 0) {
  console.log('👉 Revise title, description, ogImage e canonical em cada .astro gerado.');
}
if (skippedCount > 0) {
  console.log('💡 Para regenerar páginas existentes: npm run scaffold -- --force\n');
}
