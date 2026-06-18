# Plano de Migração — Elementor/WordPress → Astro
**Template:** `dmove-astro-template` v1.2  
**Metodologia:** Clean-Room Migration  
**Objetivo:** Migrar páginas do Elementor para Astro com 100% de fidelidade visual e zero dependência do WordPress no output final.

---

## Índice

1. [O que é a metodologia Clean-Room](#1-o-que-é-a-metodologia-clean-room)
2. [Pré-requisitos e configuração inicial](#2-pré-requisitos-e-configuração-inicial)
3. [Estrutura do template](#3-estrutura-do-template)
4. [O fluxo em 5 etapas](#4-o-fluxo-em-5-etapas)
5. [Componentes globais automáticos](#5-componentes-globais-automáticos)
6. [Sistema de validação VRT](#6-sistema-de-validação-vrt)
7. [Garantias e limitações honestas](#7-garantias-e-limitações-honestas)
8. [Checklist de onboarding por cliente](#8-checklist-de-onboarding-por-cliente)
9. [Referência rápida de comandos](#9-referência-rápida-de-comandos)

---

## 1. O que é a metodologia Clean-Room

A migração clean-room significa que o site Astro gerado **não tem nenhum rastro** do WordPress ou Elementor. Especificamente, o output final garante:

- ❌ Zero classes `.elementor-*`, `.e-con`, `.e-parent` no HTML
- ❌ Zero `<link>` para arquivos CSS do WordPress/Elementor
- ❌ Zero hotlinks de imagens para o servidor WordPress
- ❌ Zero jQuery, Swiper via CDN Elementor ou qualquer runtime WP
- ❌ Zero plugins PHP (CF7, Yoast, etc.) no frontend
- ✅ HTML semântico puro com classes descritivas (`hero-section`, `intro-content`, etc.)
- ✅ CSS scoped por página, reescrito do zero
- ✅ Imagens servidas localmente com otimização automática (AVIF/WebP)
- ✅ Formulários via webhook JSON para n8n (sem PHP)
- ✅ Build estático — o servidor só precisa de Nginx para servir arquivos

---

## 2. Pré-requisitos e Configuração Inicial

### Requisitos de sistema
- Node.js ≥ 22.12.0
- npm ≥ 10

### Configuração do projeto (uma vez por cliente)

**Passo 1:** Clonar o template
```bash
git clone https://github.com/dmove/dmove-astro-template.git nome-do-projeto
```
ou simplesmente usar a pasta do template atual.

```bash
cd nome-do-projeto
npm install
```

**Passo 2:** Instalar dependências do VRT (uma vez por máquina)
```bash
npm install --save-dev playwright pixelmatch pngjs
npx playwright install chromium
```

**Passo 3:** Preencher `config.json` com os dados do cliente

```json
{
  "project_name": "Múltipla Eventos",
  "project_slug": "multipla-eventos",
  "client": "Múltipla Eventos",
  "environment": "development",

  "tracking": {
    "gtm_id": "GTM-XXXXXXX",
    "enabled": true
  },

  "whatsapp": {
    "phone": "5511978250000",
    "display_name": "Múltipla Eventos",
    "avatar": "/images/whatsapp-avatar.jpg",
    "enabled": true
  },

  "forms": {
    "lead-form": {
      "id": "lead-form",
      "redirect_on_success": "",
      "webhooks": [
        "https://n8n.dmove.com.br/webhook/multipla-eventos"
      ],
      "fields_required": ["nome", "email", "telefone"]
    }
  },

  "deploy": {
    "user": "root",
    "server": "multiplaeventos.com.br",
    "remote_path": "/var/www/multiplaeventos.com.br"
  }
}
```

**Passo 4:** Colocar os arquivos de imagem do cliente
```
public/
  images/
    icone.png              ← Favicon (qualquer tamanho, PNG)
    og-default.jpg         ← Imagem Open Graph padrão (1200×630px)
    whatsapp-avatar.jpg    ← Foto de perfil do WhatsApp (quadrada, mín. 200×200px)
```

---

## 3. Estrutura do Template

```
dmove-astro-template/
│
├── config.json                       ← ⭐ Centro de configuração do projeto
│
├── extract-assets.mjs                ← Script 1: baixa HTML + CSS + imagens do WP
├── scaffold-page.mjs                 ← Script 2: converte HTML → .astro + .css + .js
├── scripts/
│   ├── compare.mjs                   ← Script 3: VRT multi-viewport (desktop/tablet/mobile)
│   └── vrt-output/                   ← Diffs gerados pelo compare (ignorado pelo git)
│
├── _html-originais/                  ← HTMLs e CSSs originais do WP (entrada dos scripts)
│   ├── casamentos.html               ← gerado pelo extract
│   ├── casamentos.css                ← CSS do Elementor — fonte da verdade para migração CSS
│   └── debutantes-v1.html
│
├── src/
│   ├── assets/images/                ← Imagens baixadas localmente pelo extract
│   │
│   ├── pages/
│   │   ├── index.astro               ← Página home (manual ou gerada)
│   │   └── casamentos.astro          ← Gerada pelo scaffold + CSS migrado
│   │
│   ├── styles/
│   │   └── casamentos.css            ← CSS scoped reescrito pela IA
│   │
│   ├── scripts/
│   │   └── casamentos.js             ← Scripts inline da página (se houver)
│   │
│   ├── layouts/
│   │   └── Base.astro                ← Layout global: SEO, GTM, WhatsApp, slots
│   │
│   └── components/
│       ├── layout/
│       │   └── WhatsAppModal.astro   ← Botão flutuante + modal multi-step
│       ├── forms/
│       │   └── LeadForm.astro        ← Formulário de captura → webhook n8n
│       ├── tracking/
│       │   ├── GTMHead.astro
│       │   ├── GTMBody.astro
│       │   └── UTMCapture.astro
│       └── ui/
│           ├── Img.astro             ← <img> com otimização AVIF/WebP automática
│           ├── Video.astro
│           └── StaticMap.astro
│
└── public/
    └── images/
        ├── icone.png
        ├── og-default.jpg
        └── whatsapp-avatar.jpg       ← ⭐ Foto de perfil do WhatsApp do cliente
```

---

## 4. O Fluxo em 5 Etapas

### ━━━ ETAPA 1 — Extração (`npm run extract`) ━━━

```bash
npm run extract -- --url=https://cliente.com.br/nome-da-pagina/
```

O script `extract-assets.mjs` acessa a URL e executa automaticamente:

**1a. Download do HTML**
- Faz requisição HTTPS com suporte a redirecionamentos (301/302)
- Salva em `_html-originais/[slug].html`

**1b. Download do CSS do Elementor** *(novo v1.2)*
- Detecta automaticamente o `<link rel="stylesheet" href=".../elementor/css/post-XXX.css">` no HTML
- Baixa o arquivo e salva em `_html-originais/[slug].css`
- **Este é o arquivo-fonte para a migração de CSS** — contém todos os valores reais de design (cores, espaçamentos, tipografia, breakpoints) sem o ruído das classes de estrutura do Elementor

**1c. Download de imagens**
- Encontra todas as URLs de imagens no HTML via regex (`.jpg`, `.png`, `.webp`, `.avif`, `.gif`)
- Baixa em paralelo para `src/assets/images/`
- Ignora arquivos já baixados (idempotente — pode rodar várias vezes)
- Filtra trackers e ícones de bibliotecas externas

**Output no terminal:**
```
🔍 Acessando: https://cliente.com.br/casamentos/...
✅ HTML salvo em: _html-originais/casamentos.html

🎨 CSS Elementor detectado: post-952.css
✅ CSS salvo em: _html-originais/casamentos.css
   → Use este arquivo como referência para reescrever o CSS scoped da página.

📸 23 imagens encontradas. Baixando...
   📥 [1/23] hero-casamentos.avif
   📥 [2/23] casal-jardim.jpg
   ...

══════════════════════════════════════════════
🎉 Extração concluída — /casamentos
──────────────────────────────────────────────
   HTML     : _html-originais/casamentos.html
   CSS WP   : _html-originais/casamentos.css ✅
   Imagens  : src/assets/images/ (23 ok, 0 falhas)
──────────────────────────────────────────────
```

**O que verificar manualmente após o extract:**
- Imagens com `⚠️` (erro no download) — baixar manualmente
- Se o CSS não foi encontrado (`⚠️ CSS do Elementor não encontrado`) — abrir DevTools > Network > CSS e copiar o arquivo `post-XXX.css` manualmente
- Fontes customizadas `.woff2` não-Google — precisam ser copiadas separadamente ou substituídas por equivalentes no Google Fonts

---

### ━━━ ETAPA 2 — Scaffold (`npm run scaffold`) ━━━

```bash
npm run scaffold
```

O script `scaffold-page.mjs` processa todos os arquivos `.html` em `_html-originais/` e gera a estrutura Astro. Para cada arquivo:

**2a. Limpeza do HTML WordPress**
- Remove o `#wpadminbar` (barra de admin)
- Remove blocos GTM inline (injetados automaticamente pelo `Base.astro`)
- Remove scripts e metas do Elementor (`elementorFrontendConfig`, meta `generator`, `edituri`, etc.)
- Remove `<style>` e `<script>` do body (extraídos para arquivos separados)

**2b. Extração de metadados SEO**
- Extrai `<title>`, `<meta description>`, `og:image`, `canonical` do HTML original
- Injetados como props do componente `<Base>` no arquivo `.astro` gerado

**2c. Detecção automática de ícones** *(v1.1+)*
Escaneia o body em busca de prefixos de classe:

| Padrão detectado | CDN injetado |
|---|---|
| `fa-solid`, `fa-regular`, `fa-brands`, `fa-*` | Font Awesome 6 Free |
| `la-*`, `las`, `lar`, `lab` | Line Awesome 1.3 |
| `bi-*` | Bootstrap Icons 1.11 |
| `icon-[a-z]` | Simple Line Icons 2.5 |

Os `<link>` dos CDNs detectados são injetados em `<Fragment slot="head">` no arquivo gerado — zero ícones invisíveis no primeiro load.

**2d. Substituição de elementos HTML**

| Original (WordPress) | Gerado (Astro) |
|---|---|
| `<img src="https://wp.../foto.jpg" alt="X">` | `<Img src="foto.jpg" alt="X" priority />` |
| `<form>...</form>` com campos detectados | `<LeadForm formId="lead-form" project={...} submitUrl={...} fields={[...]} />` |
| `<video>...</video>` | `<Video src="..." title="..." />` |

**2e. Arquivos gerados**

```
src/pages/casamentos.astro     ← estrutura completa da página
src/styles/casamentos.css      ← CSS inline original (ainda com classes Elementor — será reescrito)
src/scripts/casamentos.js      ← scripts inline da página (se houver)
```

**Exemplo de `.astro` gerado:**
```astro
---
// Gerado a partir de: casamentos.html
import { Fragment } from 'astro/jsx-runtime';
import Base from '../layouts/Base.astro';
import config from '../../config.json';
import Img from '../components/ui/Img.astro';
import LeadForm from '../components/forms/LeadForm.astro';
import '../styles/casamentos.css';
---

<Base
  title="Casamentos | Múltipla Eventos"
  description="Realize o casamento dos seus sonhos com a Múltipla."
  ogImage="/images/og-casamentos.jpg"
  canonical="https://multiplaeventos.com.br/casamentos/"
>
<Fragment slot="head">
  <link rel="stylesheet" href="https://cdnjs.cloudflare.com/.../font-awesome/6.5.2/css/all.min.css" />
</Fragment>

<!-- corpo semântico da página migrado aqui -->
<!-- classes .elementor-element-XXXXX serão substituídas na Etapa 3 -->

</Base>
```

---

### ━━━ ETAPA 3 — Migração de CSS (IA + Revisão) ━━━

Esta é a etapa central que garante a fidelidade visual. O CSS gerado pelo scaffold é o **CSS inline original** — ainda contém classes `.elementor-element-XXXXXXXX`.

A IA (ou desenvolvedor) reescreve esse CSS lendo o `_html-originais/[slug].css` gerado na Etapa 1.

**Processo seção por seção:**

**3a. Identificar** o container principal de cada seção no HTML gerado:
```html
<!-- Elementor -->
<section class="elementor-element elementor-element-7a0bac9 e-con">
```

**3b. Buscar** no `_html-originais/casamentos.css` as regras com esse ID:
```css
/* Elementor — post-952.css */
.elementor-element-7a0bac9 {
  --padding-top: 0px; --padding-bottom: 0px;
  --min-height: 100vh;
  --justify-content: flex-end;
}
.elementor-element-7a0bac9 > .e-con-inner {
  padding: 50px 0 0 0;
}
@media (max-width: 1024px) {
  .elementor-element-7a0bac9 {
    --min-height: 80vh;
  }
}
```

**3c. Reescrever** em CSS semântico limpo em `src/styles/casamentos.css`:
```css
/* Clean-Room — sem classes Elementor */
.hero-section {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  justify-content: flex-end;
  padding-top: 50px;
  background-image: url('/images/hero-casamentos.avif');
  background-size: cover;
  background-position: center top;
  position: relative;
}

@media (max-width: 1024px) {
  .hero-section {
    min-height: 80vh;
  }
}
```

**3d. Atualizar** as classes no `src/pages/casamentos.astro`:
```html
<!-- Antes -->
<section class="elementor-element elementor-element-7a0bac9 e-con">

<!-- Depois -->
<section class="hero-section">
```

**Checklist de fidelidade por seção:**
- [ ] Background (cor sólida, gradiente, imagem — com `position` e `size` exatos)
- [ ] Tipografia (família, tamanho, peso, cor, `line-height`, `letter-spacing`)
- [ ] Espaçamentos (`padding` e `margin` verticais e horizontais exatos)
- [ ] Layout (`flex` ou `grid`, número de colunas, `gap`, alinhamento)
- [ ] Responsividade (`@media` para tablet ≤1024px e mobile ≤768px)
- [ ] Estados interativos (`:hover`, `:focus` em botões e links)
- [ ] Animações de entrada (reimplementadas com CSS `@keyframes` ou GSAP)

---

### ━━━ ETAPA 4 — Validação Visual VRT (`npm run compare`) ━━━

```bash
# Todos os viewports de uma vez (desktop, tablet, mobile)
npm run compare -- --slug=casamentos

# Só um viewport específico
npm run compare -- --slug=casamentos --viewport=mobile

# Com URL de produção personalizada
npm run compare -- --slug=casamentos --prod=https://cliente.com.br
```

O script `scripts/compare.mjs` roda três comparações em sequência:

**Viewports testados:**

| Viewport | Resolução | Representa |
|---|---|---|
| `desktop` | 1440×900px | Notebooks e monitores padrão |
| `tablet` | 768×1024px | iPad e tablets Android |
| `mobile` | 375×812px | iPhone SE / Android médio |

**Para cada viewport, o script:**
1. Abre a URL de produção no Playwright Chromium headless
2. Abre o `localhost:4321/[slug]` com o mesmo viewport
3. Aguarda `networkidle` (sem requisições pendentes)
4. Executa scroll completo para forçar carregamento de lazy images
5. Captura screenshot full-page de ambas as páginas
6. Compara pixel a pixel com `pixelmatch` (threshold de 10% de diferença de cor por pixel, anti-aliasing ignorado)
7. Gera imagem diff com pixels diferentes em vermelho

**Arquivos gerados em `scripts/vrt-output/casamentos/`:**
```
desktop-prod.png    ← screenshot produção (1440px)
desktop-local.png   ← screenshot local (1440px)
desktop-diff.png    ← pixels em vermelho = diferença

tablet-prod.png     ← screenshot produção (768px)
tablet-local.png    ← screenshot local (768px)
tablet-diff.png

mobile-prod.png     ← screenshot produção (375px)
mobile-local.png    ← screenshot local (375px)
mobile-diff.png
```

**Interpretação dos resultados:**

| % de diferença | Status | Ação |
|---|---|---|
| 0% | 🟢 PERFEITO | Deploy liberado |
| < 1% | 🟡 QUASE PERFEITO | Geralmente anti-aliasing — aceitável |
| 1–5% | 🟠 PEQUENAS DIFERENÇAS | Abrir `diff.png`, identificar seção em vermelho, corrigir CSS |
| > 5% | 🔴 DIFERENÇAS SIGNIFICATIVAS | Migração com problema — obrigatório corrigir antes do deploy |

**Output no terminal:**
```
🔍 VRT — /casamentos
   Produção  : https://multiplaeventos.com.br/casamentos
   Local     : http://localhost:4321/casamentos
   Viewports : desktop (1440×900) | tablet (768×1024) | mobile (375×812)
   Threshold : 10% por pixel

📐 DESKTOP — 1440×900px
    ✅ desktop-prod.png
    ✅ desktop-local.png
    🟢 0.00% — PERFEITO

📐 TABLET — 768×1024px
    ✅ tablet-prod.png
    ✅ tablet-local.png
    🟡 0.31% — QUASE PERFEITO

📐 MOBILE — 375×812px
    ✅ mobile-prod.png
    ✅ mobile-local.png
    🟠 2.14% — PEQUENAS DIFERENÇAS

══════════════════════════════════════════════════════
📊 RELATÓRIO FINAL — /casamentos
══════════════════════════════════════════════════════
  🟢 desktop     0.00%  PERFEITO
  🟡 tablet      0.31%  QUASE PERFEITO
  🟠 mobile      2.14%  PEQUENAS DIFERENÇAS
──────────────────────────────────────────────────────
📁 Diffs em: scripts/vrt-output/casamentos/
   desktop-diff.png
   tablet-diff.png
   mobile-diff.png
```

**Limitações conhecidas do VRT:**
- Não captura estados `:hover` (estático por natureza)
- Fontes podem ter leve diferença de sub-pixel rendering entre sistemas operacionais
- Carrosséis e sliders: posição dos slides pode diferir — inspecionar manualmente

---

### ━━━ ETAPA 5 — Build e Deploy ━━━

```bash
# Verificar compilação sem erros
npm run build

# Build + deploy via rsync para o servidor
npm run deploy
```

O `npm run build` compila o projeto Astro gerando HTML estático puro em `/dist`. O servidor precisa apenas de Nginx ou Apache para servir os arquivos — sem PHP, sem Node em produção.

---

## 5. Componentes Globais Automáticos

Todos os componentes abaixo são injetados automaticamente em **todas as páginas** via `Base.astro`. Nenhuma configuração adicional é necessária além do `config.json`.

### Base.astro — Layout Global

Renderizado automaticamente em toda página. Inclui:
- `<html lang="pt-BR">`, `<meta charset>`, `<meta viewport>`
- SEO completo: `<title>`, `<meta description>`, Open Graph (title, description, image, type, locale), `<link canonical>`
- JSON-LD estruturado (WebPage schema por padrão, extensível por página)
- GTM no `<head>` (via `GTMHead.astro`) e `<body>` noscript (via `GTMBody.astro`)
- Captura de UTMs (via `UTMCapture.astro`)
- Modal do WhatsApp (via `WhatsAppModal.astro`)
- Slot `head` para CDNs adicionais por página
- Slot padrão para o conteúdo da página
- Slot `scripts` para scripts extras por página

### WhatsAppModal.astro — Botão Flutuante + Modal

Configurado inteiramente via `config.json > whatsapp`:

```json
"whatsapp": {
  "phone": "5511978250000",       ← número para onde o lead é direcionado
  "display_name": "Múltipla Eventos",  ← nome exibido no header do modal
  "avatar": "/images/whatsapp-avatar.jpg",  ← foto de perfil no modal
  "enabled": true                 ← false desativa o botão sem remover o componente
}
```

**Fluxo do modal:**
1. Usuário clica no botão flutuante verde
2. Modal abre com animação suave — exibe foto e nome do cliente no header
3. **Step 1:** tipo de evento, data (Flatpickr), local, número de convidados
4. **Step 2:** nome, e-mail, telefone (com máscara automática)
5. Ao submeter: POST no webhook n8n + redireciona para WhatsApp com mensagem pré-preenchida

**Payload enviado ao n8n (nomenclatura preservada — não alterar):**
```json
{
  "Tipo": "Casamento",
  "Data": "15/08/2025",
  "Local_evento": "Espaço das Flores",
  "Convidados": "200",
  "Nome": "Ana Lima",
  "Email": "ana@email.com",
  "Telefone": "(11) 99999-9999",
  "Fonte": "WhatsApp /casamentos?utm_source=instagram",
  "Data": "03/06/2025",
  "Horário": "14:30",
  "URL da página": "https://multiplaeventos.com.br/casamentos",
  "Desenvolvido por": "Dmove",
  "form_id": "form_whatsapp",
  "form_name": "form_whatsapp"
}
```

### LeadForm.astro — Formulário de Captura

Campos padrão: `nome`, `telefone`, `email` (configuráveis via prop `fields`).

**Funcionalidades:**
- Honeypot anti-spam embutido (campo `website` invisível)
- Máscara automática de telefone `(XX) XXXXX-XXXX`
- Validação client-side com highlight vermelho nos campos inválidos
- Loading state no botão de submit
- Estado de sucesso (substitui o form por mensagem de confirmação ou redireciona via `redirectUrl`)
- Rastreamento GTM: eventos `form_start` e `form_submit`

**Payload enviado ao n8n:**
```json
{
  "Nome": "João Silva",
  "Telefone": "(11) 98888-8888",
  "Email": "joao@email.com",
  "Fonte": "multipla-eventos?utm_source=google&utm_medium=cpc&gclid=ABC123",
  "Data": "03/06/2025",
  "Horário": "11:30",
  "URL da página": "https://multiplaeventos.com.br/debutantes",
  "Desenvolvido por": "Dmove",
  "form_id": "lead-form",
  "form_name": "lead-form"
}
```

### UTMCapture.astro — Rastreamento de Origem

Captura automaticamente e salva em `sessionStorage` como `dmove_tracking`:
- UTMs: `utm_source`, `utm_medium`, `utm_campaign`, `utm_content`, `utm_term`
- Click IDs: `gclid` (Google Ads), `fbclid` (Meta), `ttclid` (TikTok), `msclkid` (Microsoft), `sck`
- `landing_page` e `landing_url`

O LeadForm e o WhatsAppModal leem automaticamente o `dmove_tracking` e incluem os parâmetros no campo `Fonte` do payload enviado ao n8n.

---

## 6. Sistema de Validação VRT

### Workflow de correção de diferenças

Quando o `npm run compare` retorna 🟠 ou 🔴, o processo é:

1. Abrir o arquivo `[viewport]-diff.png` — pixels em **vermelho** indicam onde há diferença
2. Identificar qual seção da página contém os pixels vermelhos
3. Abrir `[viewport]-prod.png` e `[viewport]-local.png` lado a lado para comparação visual
4. Corrigir o CSS em `src/styles/[slug].css`
5. Reiniciar o `npm run dev` e rodar `npm run compare` novamente

### Threshold recomendado por situação

| Situação | Threshold recomendado |
|---|---|
| Validação final antes do deploy | `0.05` (5% — padrão) |
| Página com animações CSS ativas | `0.15` (15% — mais tolerante) |
| Validação estrita pixel-perfect | `0.02` (2% — mais rigoroso) |

```bash
npm run compare -- --slug=casamentos --threshold=0.15
```

---

## 7. Garantias e Limitações Honestas

### O que é 100% garantido pela arquitetura

| Garantia | Como |
|---|---|
| Zero classes `.elementor-*` no HTML | Reescrita de classes na Etapa 3 — auditável com grep |
| Zero `<link>` para WordPress no `<head>` | `scaffold-page.mjs` nunca copia links externos WP |
| Zero hotlinks de imagens | `extract-assets.mjs` baixa tudo para `src/assets/images/` |
| Zero jQuery ou runtime Elementor | Astro compila para HTML estático sem JS runtime |
| Formulários funcionais sem CF7 | `LeadForm.astro` com webhook JSON puro |
| GTM injetado sem WP | `GTMHead/GTMBody.astro` nativos |
| Ícones visíveis no primeiro load | `scaffold-page.mjs` detecta classes e injeta CDNs |
| WhatsApp com dados do cliente | `config.json > whatsapp.*` — um arquivo, todas as páginas |
| Validação em 3 viewports | VRT desktop + tablet + mobile automático |

### O que depende de trabalho manual (e por quê)

**CSS visual de cada seção**  
O Elementor calcula o CSS final combinando tema filho + `elementor-global.css` + `post-XXX.css` + configurações inline de cada widget. Não existe forma de automatizar essa cascata sem executar o Elementor completo. O `post-XXX.css` baixado na Etapa 1 é a fonte mais próxima da verdade — a IA lê e reescreve.

**Fontes customizadas `.woff2`**  
O `extract-assets.mjs` baixa apenas imagens. Fontes `.woff2` não hospedadas no Google Fonts precisam ser copiadas do servidor WP e declaradas com `@font-face` localmente.

**Animações de entrada**  
O Elementor usa sua própria engine (`elementor-motion-fx`) configurada via JSON em `data-settings`. As animações precisam ser reimplementadas com CSS `@keyframes` ou GSAP (já incluído como dependência do template).

**Hover states e pseudo-elementos**  
O VRT captura apenas estado estático. `:hover`, `::before`, `::after` precisam de revisão visual manual.

---

## 8. Checklist de Onboarding por Cliente

```
CONFIGURAÇÃO INICIAL
[ ] Clonar o dmove-astro-template
[ ] Preencher config.json (project_name, slug, GTM, whatsapp, webhook n8n, deploy)
[ ] Colocar favicon em public/images/icone.png
[ ] Colocar imagem OG em public/images/og-default.jpg
[ ] Colocar foto WhatsApp em public/images/whatsapp-avatar.jpg
[ ] npm install
[ ] npx playwright install chromium (uma vez por máquina)

POR PÁGINA
[ ] npm run extract -- --url=URL_DA_PAGINA_NO_WP
[ ] Verificar se casamentos.css foi baixado (ver terminal)
[ ] npm run scaffold
[ ] Verificar output do scaffold (imagens faltantes, campos de formulário)
[ ] IA lê _html-originais/[slug].css e reescreve src/styles/[slug].css seção por seção
[ ] npm run dev
[ ] Validação visual manual (desktop)
[ ] npm run compare -- --slug=[slug] (após produção estar acessível)
[ ] Corrigir CSS nos viewports com 🟠/🔴
[ ] npm run compare -- --slug=[slug] (confirmar 🟢/🟡 em todos os viewports)

FINALIZAÇÃO
[ ] npm run build (zero erros de compilação)
[ ] npm run deploy
[ ] Verificar página em produção
[ ] Testar formulário e WhatsApp (verificar chegada no n8n)
[ ] Testar GTM (verificar eventos no Tag Assistant)
```

---

## 9. Referência Rápida de Comandos

```bash
# Desenvolvimento
npm run dev                                    # inicia servidor local em localhost:4321

# Por página (repetir para cada URL)
npm run extract -- --url=https://site.com/pagina/   # extrai HTML + CSS + imagens
npm run scaffold                               # gera .astro + .css + .js

# Validação
npm run compare -- --slug=pagina              # VRT desktop + tablet + mobile
npm run compare -- --slug=pagina --viewport=mobile   # só mobile
npm run compare -- --slug=pagina --threshold=0.15    # threshold personalizado

# Build e deploy
npm run build                                  # compila para /dist
npm run deploy                                 # build + rsync para servidor
```

---

*Documento atualizado para dmove-astro-template v1.2 — Junho 2025*  
*Dmove — Agência de Performance Digital*
