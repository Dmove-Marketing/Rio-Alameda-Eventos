# Guia de Migração Dmove — Elementor → Astro
**Template:** `dmove-astro-template` v1.1
**Metodologia:** Clean-Room Migration — zero dependências WordPress/Elementor no output final.

---

## Visão Geral do Fluxo

```
WordPress/Elementor          dmove-astro-template         Resultado Final
─────────────────            ────────────────────         ───────────────
URL da página WP    ──→  npm run extract  ──→  HTML + imagens locais
HTML original       ──→  npm run scaffold ──→  .astro + .css + .js gerados
post-XXX.css        ──→  IA lê + reescreve ─→  CSS scoped limpo por seção
                          npm run compare  ──→  diff visual produção vs local
                          npm run build    ──→  HTML estático sem WP
                          npm run deploy   ──→  Site no ar
```

---

## Configuração Inicial (por projeto/cliente)

Antes de iniciar qualquer migração, edite o `config.json`:

```json
{
  "project_name": "Nome Completo do Projeto",
  "project_slug": "slug-do-projeto",
  "whatsapp": {
    "phone": "5511999999999",
    "display_name": "Nome do Cliente",
    "avatar": "/images/whatsapp-avatar.jpg",
    "enabled": true
  },
  "forms": {
    "lead-form": {
      "webhooks": ["https://n8n.dmove.com.br/webhook/SLUG-DO-PROJETO"]
    }
  }
}
```

> **WhatsApp:** Coloque a foto do cliente em `public/images/whatsapp-avatar.jpg` e configure `whatsapp.display_name`. O modal aparece automaticamente em todas as páginas.

---

## Passo a Passo da Migração

### ETAPA 1 — Extração de Assets

```bash
npm run extract -- --url=https://cliente.com.br/nome-da-pagina/
```

**Automático:** baixa o HTML e todas as imagens (jpg, png, webp, avif) para `src/assets/images/`.

**Verificar manualmente:** imagens com `⚠️` no terminal (falha no download) e fontes `.woff2` customizadas.

---

### ETAPA 2 — Scaffold da Página

```bash
npm run scaffold
```

**Automático:**
- Gera `src/pages/[slug].astro` com metadados SEO extraídos
- Gera `src/styles/[slug].css` com estilos inline do original
- **NOVO v1.1:** Detecta e injeta CDNs de ícones automaticamente:
  - `fa-*` → Font Awesome 6
  - `la-*` → Line Awesome
  - `bi-*` → Bootstrap Icons
  - `icon-*` → Simple Line Icons
- Substitui `<form>` por `<LeadForm>` com webhook do config.json
- Substitui `<img>` por `<Img>` com otimização automática

---

### ETAPA 3 — Migração CSS (IA + Revisão)

Para cada seção da página, a IA:
1. Lê o seletor `.elementor-element-XXXX` no `post-XXX.css`
2. Extrai margin, padding, typography, background, layout
3. Reescreve em CSS semântico limpo (ex: `.hero-section`, `.intro-content`)
4. Aplica no `src/styles/[slug].css`

**Checklist por seção:** background, tipografia, espaçamentos, layout, responsividade, hover states.

---

### ETAPA 4 — Validação Visual (VRT)

**Instalar uma vez:**
```bash
npm install --save-dev playwright pixelmatch pngjs
npx playwright install chromium
```

**Usar:**
```bash
npm run compare -- --slug=casamentos
npm run compare -- --slug=debutantes-v1 --prod=https://cliente.com.br
```

**Resultado:**
- 🟢 0% → Deploy liberado
- 🟡 < 1% → Diferenças de anti-aliasing — OK
- 🟠 1–5% → Revisar seções em vermelho no diff
- 🔴 > 5% → Migração precisa de ajustes

**Arquivos gerados em** `scripts/vrt-output/`:
- `[slug]-prod.png` — screenshot de produção
- `[slug]-local.png` — screenshot local
- `[slug]-diff.png` — pixels em vermelho = diferença

---

### ETAPA 5 — Build e Deploy

```bash
npm run build    # verifica zero erros de compilação
npm run deploy   # build + rsync para servidor
```

---

## Componentes Globais (Automáticos)

| Componente | Config | Função |
|---|---|---|
| **GTM** | `config.tracking.gtm_id` | Google Tag Manager |
| **UTMCapture** | Automático | Salva UTMs para o webhook |
| **WhatsAppModal** | `config.whatsapp.*` | Botão flutuante + captura de lead |
| **LeadForm** | `config.forms.*` | Formulário → n8n |

---

## Checklist de Onboarding de Novo Cliente

```
[ ] 1. Clonar o dmove-astro-template
[ ] 2. Preencher config.json completamente
[ ] 3. Colocar favicon em public/images/icone.png
[ ] 4. Colocar foto do WhatsApp em public/images/whatsapp-avatar.jpg
[ ] 5. npm install
[ ] 6. Para cada página:
        [ ] npm run extract -- --url=URL
        [ ] npm run scaffold
        [ ] IA migra o CSS seção por seção
        [ ] npm run dev → validar no browser
        [ ] npm run compare -- --slug=SLUG
[ ] 7. npm run build → zero erros
[ ] 8. npm run deploy
```

---

## Garantias do Fluxo

| Garantia | Nível |
|---|---|
| Zero código Elementor/WP no output | ✅ 100% — arquitetura |
| Zero hotlinks de imagens para WP | ✅ 100% — extract |
| Formulários funcionais sem CF7 | ✅ 100% — LeadForm |
| GTM sem dependência WP | ✅ 100% — nativo |
| Ícones detectados automaticamente | ✅ 100% — scaffold v1.1 |
| WhatsApp com dados do cliente | ✅ 100% — config.json |
| CSS visualmente idêntico | 🔄 100% possível — IA + VRT |
