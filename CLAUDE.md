# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Visão geral

Extensão para Microsoft Edge (Manifest V3) que move de uma vez todas as abas de um domínio para a janela de um Workspace do Edge — por botão no popup ou por atalho de teclado (`Alt+Shift+M`). JS/HTML puro, sem build step e sem dependências externas.

## Comandos

```bash
# Sanity de sintaxe (não há testes nem build)
node --check background.js && node --check popup.js

# Empacotar para distribuição (apenas arquivos carregáveis, sem docs)
zip -r edge-send-to-workspace.zip manifest.json background.js popup.html popup.js icons
```

Para testar: abra `edge://extensions`, ative o **Modo de desenvolvedor**, **Carregar sem pacote** apontando para a pasta. Após editar, clique em **Recarregar** no card da extensão. O atalho é configurável em `edge://extensions/shortcuts`.

## Arquitetura

A restrição central que molda todo o design: **o Edge Workspaces não expõe API** (nem `chrome.tabs`, nem DevTools Protocol). Não há como endereçar um Workspace pelo nome. Mas um Workspace aberto é uma **janela comum** (`type: "normal"`) para a API. Por isso a extensão move abas para uma *janela de destino* identificada por `windowId`, e o usuário precisa abrir o Workspace antes.

Dois contextos de execução, sem content scripts e sem acesso à rede:

- **`background.js`** (service worker) — fonte da verdade da lógica de movimentação. Faz o matching por domínio (`tabMatches`), coleta as abas (`collectTabs`) e move (`performMove` via `chrome.tabs.move`). Atende tanto mensagens do popup (`type: "move"` e `type: "preview"`) quanto o atalho de teclado (`chrome.commands.onCommand`). Preserva abas fixadas movendo-as primeiro para o início da janela de destino. Mostra um badge no ícone com a contagem (`flashBadge`).
- **`popup.js`** + **`popup.html`** — UI. Lista as janelas normais abertas como destinos possíveis (`buildWindowList`), faz preview ao vivo da contagem (`refreshPreview`), e dispara o move enviando mensagem ao service worker. Persiste a escolha (`mode`, `customPattern`, `targetWindowId`, `focusAfter`) em `chrome.storage.local` para o atalho reaproveitar.

### Pontos de atenção ao editar

- **Lógica de matching duplicada de propósito.** `hostnameOf` e `tabMatches` existem em `background.js` E em `popup.js`. O background usa para mover; o popup usa para o preview ao vivo sem round-trip de mensagem. Ao mudar o comportamento de match (modos `host` / `subdomain` / `custom`), **altere as duas cópias** ou o preview divergirá do que realmente é movido.
- **`targetWindowId` é volátil.** O ID muda quando o Workspace é fechado/reaberto. `performMove` checa `chrome.windows.get` antes e retorna `{ error: "target-missing" }`; o popup traduz isso pedindo para reabrir o Workspace e reselecionar.
- **`DEFAULTS` em `background.js`** define o shape das settings persistidas. O `chrome.storage.local.get` no popup repete esses defaults inline — mantenha os dois consistentes.

## Permissões

`tabs` (ler URL/título e mover abas) e `storage` (lembrar a escolha para o atalho). Sem host permissions, sem rede.
