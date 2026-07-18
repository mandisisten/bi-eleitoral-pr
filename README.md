# BI Paraná — Painel Municipal e Eleitoral

Sistema de BI com dados públicos dos **399 municípios do Paraná** (IBGE e TSE) cruzados com a
operação de campanhas para deputado: lideranças, expectativa de votos, materiais de campanha,
agenda e relatórios. **Multi-campanha**: um usuário master cria e gerencia várias campanhas
(candidatos) isoladas entre si, cada uma com seus próprios dados.

## O que o sistema tem

| Módulo | Descrição |
|---|---|
| **Visão Geral** | KPIs, mapa coroplético interativo do PR (expectativa, cobertura, eleitorado, população, PIB, partido do prefeito), gráficos |
| **Municípios** | Ficha completa de cada município: população (IBGE 2024), Censo 2022, PIB 2021, produção agrícola (PAM), rebanhos (PPM), eleitorado (TSE 2024), prefeito atual e histórico 2016/2020/2024 com partido e votação |
| **Lideranças** | Cadastro por município com função, contato, potencial de votos, % de confiança e status |
| **Expectativa de Votos** | Projeção automática (potencial × confiança), metas por município, comparação com eleitorado |
| **Materiais** | Catálogo com estoque e custo + registro de envios por liderança (ex.: 1.000 adesivos, 50.000 santinhos) com saldo automático |
| **Agenda** | Compromissos e visitas por município |
| **Relatórios** | 9 relatórios com exportação CSV (abre no Excel) e impressão |
| **Configurações** | Dados do candidato, meta de votos, usuários (admin/coordenador) |

## Fontes dos dados públicos

- **IBGE — API de agregados**: estimativa populacional 2024, Censo 2022 (população, área, densidade),
  PIB dos Municípios 2021, Produção Agrícola Municipal (valor da produção por produto) e
  Pesquisa da Pecuária Municipal (rebanhos).
- **TSE — Dados Abertos**: prefeitos eleitos em 2016, 2020 e 2024 (nome, partido, votos, incluindo
  eleições suplementares) e eleitorado apto por município (2024).
- **IBGE — API de malhas**: mapa dos municípios (carregado pela internet na primeira vez).

Os dados públicos estão embutidos no arquivo `dados-pr.js`. Lideranças, materiais, metas,
agenda e usuários ficam no **Firestore** (nuvem, tempo real, multiusuário).

## Como colocar no ar (uma única vez)

O sistema usa um **projeto Firebase próprio** (`bi-eleitoral-pr`), totalmente separado do Sistema Cripto.
O projeto já foi criado com: Authentication (e-mail/senha) ativado e Firestore Database.

1. **Publicar as regras do banco**: abra [console.firebase.google.com](https://console.firebase.google.com)
   → projeto **bi-eleitoral-pr** → **Firestore Database** → aba **Regras** →
   apague tudo e cole o conteúdo do arquivo `firestore.rules` desta pasta → **Publicar**.

2. **Abrir o sistema**: dê dois cliques em `index.html` (funciona direto no navegador) —
   ou publique no **Firebase Hosting** para acessar de qualquer lugar
   (Console → Hosting → seguir instruções; ou envie a pasta para qualquer hospedagem).

3. **Primeiro acesso**: na tela de login clique em **"Primeiro acesso — criar conta master"**
   e crie seu usuário. Esse link some depois que a conta master existe.

## Usuários e campanhas

O sistema tem 3 papéis:

- **Master**: não pertence a nenhuma campanha — cria e gerencia as campanhas (candidatos) na página
  **Campanhas**, e pode entrar em qualquer uma delas para ver/ajudar com os dados.
- **Administrador**: dono de uma campanha específica. Acesso total aos dados dela (configurações,
  usuários) — mas nunca vê dados de outra campanha.
- **Coordenador**: cadastra lideranças, envios de materiais e agenda dentro da campanha — sem acesso
  a Configurações.

Cada campanha nova é criada pelo master em **Campanhas → + Nova campanha**, que já pede o primeiro
usuário administrador dela. Dentro de uma campanha, o administrador cria coordenadores adicionais em
**Configurações → Usuários** (o sistema gera uma senha inicial para compartilhar com a pessoa).
O acesso pode ser revogado a qualquer momento.

### Se você já usava a versão anterior (uma única campanha)

Na primeira vez que entrar depois desta atualização, o sistema vai mostrar uma tela pedindo para
**migrar**: sua conta vira **master** e todos os dados que você já tinha cadastrado (lideranças,
materiais, etc.) são movidos automaticamente para a sua primeira campanha — nada é perdido. Depois
da migração, use **Campanhas** para entrar nela ou criar novas campanhas para outros candidatos.

## Atualizar os dados públicos no futuro

O arquivo `dados-pr.js` foi gerado a partir das APIs do IBGE e dos CSVs do TSE em julho/2026.
Quando o IBGE divulgar novos números (ou após novas eleições), basta pedir ao Claude Code:
*"regenere o dados-pr.js do BI Eleitoral com os dados mais recentes"*.
