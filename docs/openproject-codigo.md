# OpenProject: cards, código e revisão

Mapeamento feito em 05/11/2026 a partir das imagens do Kanban fornecidas pelo grupo e do código deste repositório. As descrições completas dos cards e os repositórios dos backends não foram consultados. A existência de código relacionado não comprova a conclusão do card.

## Correção desta pull request

Card principal: **#925 — H05.2, Frontend: painel do técnico**. A correção mantém a atualização em tempo real sem recriar a barra de busca e filtros. Ela não implementa o painel com uma coluna por estado pedido no card.

| Card | Relação com a correção | Código e evidência |
| --- | --- | --- |
| #925 — H05.2 | Atualização do painel ao receber `chamadoAtualizado`, preservando a interação do usuário. | `App.handleTicketUpdated()`, `App.renderLiveViews()`, `applyFilters()` e `bindGlobalEvents()` em [app.js](../frontend/js/app.js); `renderTicketListResults()` em [components.js](../frontend/js/components.js). As funções internas `applyFilters` e `bindGlobalEvents` não são exportadas. |
| #923 — H04.2 | A mesma renderização atende a listagem de solicitações do funcionário. | `renderTicketsList()` e `renderTicketListResults()` em [components.js](../frontend/js/components.js); rotas `chamados` e `resolvidos` em [app.js](../frontend/js/app.js). |
| #928 — H06.2 | Alterações de estado recebidas pelo socket passam pela renderização corrigida. | `renderLiveViews()` e `handleTicketUpdated()` em [app.js](../frontend/js/app.js). Os comandos de assumir e encerrar não foram alterados nesta correção. |
| #926 — H05.3 | Cenário de integração: uma criação deve aparecer em outra sessão sem recarregar. | [ticket-socket.test.cjs](../tests/ticket-socket.test.cjs) e [ticket-sync.test.cjs](../tests/ticket-sync.test.cjs) dão cobertura automatizada com simulações; o teste com serviços reais e duas sessões continua necessário. |
| #929 — H06.3 | Cenário de integração: a alteração de estado deve aparecer em outro navegador. | [ticket-sync.test.cjs](../tests/ticket-sync.test.cjs); validar também com os serviços reais. |

Mudanças: remoção da consulta periódica de 15 segundos; manutenção da sincronização ao retornar à aba e pelo WebSocket; atualização apenas da área `ticketListResults`; preservação do campo de busca, seleção e debounce; reutilização do conteúdo quando o HTML gerado não muda. A animação de entrada permanece na navegação inicial, sem ser reiniciada pelos filtros.

Os testes novos em [ticket-filters.test.cjs](../tests/ticket-filters.test.cjs) verificam o caminho de atualização parcial, a seleção do texto digitado, buscas vazias, limpeza dos controles e ausência de novas escritas de conteúdo idêntico. Eles usam um DOM simulado e não substituem a conferência visual no navegador.

## Mapa dos cards de frontend

| Card | Parte do código | Situação observada / ponto de validação |
| --- | --- | --- |
| #919 — H02.3: cadastro e login | [login.html](../frontend/login.html), [register.html](../frontend/register.html), [auth.js](../frontend/js/auth.js), [register.js](../frontend/js/register.js), `Api.request()` em [api.js](../frontend/js/api.js), [router.js](../frontend/js/router.js). | Formulários, mensagens, token e redirecionamento em HTTP 401 existem. A área é escolhida pelo departamento TI, e não exclusivamente pelo perfil do card. |
| #921 — H03.2: nova solicitação | `renderTicketModal()` em [components.js](../frontend/js/components.js); `openNewTicket()` e `saveTicket()` em [app.js](../frontend/js/app.js); `Api.createTicket()` e `Api.fetchCategories()` em [api.js](../frontend/js/api.js). | Há título, categoria, descrição, prioridade e mensagens. O solicitante/setor vem da sessão; validar o requisito de setor do formulário e o estado inicial devolvido pela API. |
| #923 — H04.2: minhas solicitações | `renderTicketsList()`, `renderTicketRow()` em [components.js](../frontend/js/components.js); `getFilteredTickets()` em [app.js](../frontend/js/app.js); `getVisibleTickets()` em [data.js](../frontend/js/data.js); traduções em [i18n.js](../frontend/js/i18n.js). | Título, data e estado em português existem. A visibilidade atual é por departamento, incluindo chamados de colegas e atribuídos ao setor; difere de mostrar apenas os chamados do próprio funcionário. |
| #925 — H05.2: painel do técnico | [socket.js](../frontend/js/socket.js), `App.init()`, `handleTicketUpdated()` e `renderLiveViews()` em [app.js](../frontend/js/app.js); `renderTicketsList()` em [components.js](../frontend/js/components.js); meta `helpdesk-socket-url` em [index.html](../frontend/index.html). | Conexão após inicialização autenticada, tratamento do evento e atualização da tabela existem. **A interface atual é uma tabela, sem uma coluna por estado.** |
| #928 — H06.2: assumir e encerrar | `quickStatusChange()`, `quickTechnicianChange()`, `selfAssignTicket()`, `synchronizeSavedTicket()` e rota `chamado/:id` em [app.js](../frontend/js/app.js); `Api.updateTicket()` e `Api.startTicket()` em [api.js](../frontend/js/api.js); ações em `renderTicketDetail()` em [components.js](../frontend/js/components.js). | Há ações de responsável/estado e tratamento de erro. A abertura do detalhe pela TI inicia automaticamente chamados `NEW`; confirmar aderência à exigência de botão “Assumir”. A atualização remota ocorre na tabela, sem colunas de estado. |
| #931 — H07.2: histórico do chamado | `Api.fetchTicketById()` e `mapTimelineFromApi()` em [api.js](../frontend/js/api.js); `renderTicketDetail()` em [components.js](../frontend/js/components.js). | A linha do tempo renderiza eventos, autor e data recebidos da API. Validar completude e ordem dos eventos com o backend. |
| #933 — H08.2: página de usuários | Existe apenas `Api.fetchUsers()` em [api.js](../frontend/js/api.js), usado para nomes e seletores. Referência funcional em [E7](fluxos/E7-gerenciamento-de-usuarios.md). | **Não foi encontrada rota/tela de gestão de usuários, nem chamadas de criar, editar e desativar usuário.** Cadastro público não atende esse card. |
| #934 — H09.1: dashboard | `getDashboardStats()` em [data.js](../frontend/js/data.js); `renderDashboard()` em [components.js](../frontend/js/components.js); rotas `dashboard` e `meu-departamento` em [app.js](../frontend/js/app.js). | Calcula estados e prioridades usando os chamados carregados. O dashboard exibe estados e categorias; conferir a apresentação das gravidades solicitadas. Acesso usa departamento TI, não uma área exclusiva de administrador. |
| #937 — H10.2: relatório | Filtros em `getFilteredTickets()` de [app.js](../frontend/js/app.js), tabela em [components.js](../frontend/js/components.js); referência em [E9](fluxos/E9-relatorio-de-atendimentos.md). | **Não foi encontrada tela específica de relatório.** O filtro de data atual é um dia de abertura, sem período; a tabela não oferece toda a estrutura de abertura/encerramento do card. Não considerar concluído pelos filtros existentes. |

## Integração e testes

| Card | Relação com os arquivos | O que ainda precisa ser comprovado |
| --- | --- | --- |
| #926 — H05.3: criação aparece em outra aba | [socket.js](../frontend/js/socket.js), [ticket-socket.test.cjs](../tests/ticket-socket.test.cjs), [ticket-sync.test.cjs](../tests/ticket-sync.test.cjs). | Executar frontend, API, socket e banco; abrir chamado como funcionário e observar a sessão do técnico sem recarregar. O Compose não está neste repositório. |
| #929 — H06.3: assumir/encerrar aparece em outro navegador | [app.js](../frontend/js/app.js), [ticket-sync.test.cjs](../tests/ticket-sync.test.cjs), [ticket-socket.test.cjs](../tests/ticket-socket.test.cjs). | Repetir com duas sessões e serviços reais, incluindo operação recusada. A exigência de mudança de coluna depende da implementação de #925. |
| #935 — H09.2: conferir números do dashboard | `getDashboardStats()` em [data.js](../frontend/js/data.js); cenários em [department-access.test.cjs](../tests/department-access.test.cjs) e [ticket-sync.test.cjs](../tests/ticket-sync.test.cjs). | Registrar comparação escrita entre as contagens da interface e consultas na tabela `tickets` com os mesmos dados e permissões. Os testes simulados não fazem essa conferência no PostgreSQL real. |
| #939 — H11.2: roteiro de demonstração | Fluxos em [docs/fluxos](fluxos/README.md) e testes em [tests](../tests). | Não foi encontrado roteiro consolidado de demonstração ensaiado em máquina limpa com três perfis e navegadores diferentes. |

Comando dos testes automatizados deste frontend, sem instalar dependências:

```powershell
node --test tests/*.test.cjs
```

Em 05/11/2026, a correção passou nos 45 testes Node. Os testes Java de [run-backend-contract.ps1](../tests/run-backend-contract.ps1) exigem o checkout do backend e não foram executados para esta correção.

## Cards de backend, infraestrutura e documentação

O frontend consome essas entregas. Contratos e patches neste repositório são referências; não comprovam que o código de produção do backend foi implementado ou publicado.

| Card | Referência neste repositório | Onde implementar / validar |
| --- | --- | --- |
| #910 — H01.1: fluxos alinhados às fichas | [docs/fluxos](fluxos/README.md), [visao-geral.md](fluxos/visao-geral.md), [docs/adr](adr). | Documentação. Conferir numeração: os arquivos atuais usam E1–E9 e registram a renumeração antiga; os cards usam H01–H11. Não renomear por equivalência presumida. |
| #912 — H01.3: repositórios de cada parte | [README.md](../README.md), [visao-geral.md](fluxos/visao-geral.md), [.github/workflows/sync-to-main.yml](../.github/workflows/sync-to-main.yml). | Organização dos repositórios e seus respectivos conteúdos. Este checkout contém o frontend; o workflow o sincroniza ao repositório principal após push na `main`. |
| #913 — H01.4: Compose com frontend, API, socket e PostgreSQL | Referência arquitetural em [visao-geral.md](fluxos/visao-geral.md). | Infraestrutura/repositório agregador. Não há arquivo Compose neste checkout. |
| #914 — H01.5: criação das tabelas | Referências em [docs/backend](backend) e contratos em [docs/fluxos](fluxos/README.md). | Backend API/banco. Não foi encontrado script SQL versionado neste checkout; `.gitignore` ignora `*.sql`. |
| #915 — H01.6: porta TCP `publicarEvento` | [CT18-publicarEvento.md](fluxos/CT18-publicarEvento.md). | Backend Socket. O navegador não implementa o servidor TCP interno. |
| #916 — H01.7: CI/JUnit dos backends | Há apenas sincronização do frontend em [.github/workflows](../.github/workflows) e testes auxiliares em [tests](../tests). | Workflows dos repositórios Backend API e Backend Socket; não foi verificada a execução de JUnit nesses repositórios. |
| #917 — H02.1: cadastrarUsuario | Consumidor em [register.js](../frontend/js/register.js), `POST /api/register`. | Backend API: validações, perfil inicial e persistência. |
| #918 — H02.2: autenticarUsuario | Consumidor em [auth.js](../frontend/js/auth.js), `POST /api/login`; Bearer/401 em [api.js](../frontend/js/api.js). | Backend API: credenciais, usuário ativo, validade e integridade do token. |
| #920 — H03.1: listarCategorias e abrirChamado | `Api.fetchCategories()` e `Api.createTicket()` em [api.js](../frontend/js/api.js). | Backend API: estado inicial, solicitante do token, histórico e publicação de `CREATED`. |
| #922 — H04.1: listarChamados por perfil | `Api.fetchTickets()` em [api.js](../frontend/js/api.js); `canViewTicket()` em [data.js](../frontend/js/data.js); [department-access.test.cjs](../tests/department-access.test.cjs). | Backend API: autorização efetiva. Conferir divergência entre a regra de perfil/autor do card e a regra de departamento no frontend. |
| #924 — H05.1: WebSocket público | Cliente em [socket.js](../frontend/js/socket.js); contratos [CT19](fluxos/CT19-autenticarConexao.md) e [CT22](fluxos/CT22-chamadoAtualizado.md). | Backend Socket: autenticação e seleção dos destinatários. Os testes Node simulam o servidor. |
| #927 — H06.1: atualizarChamado com regras de estado | `Api.updateTicket()` em [api.js](../frontend/js/api.js); referências em [docs/backend](backend); [ticket-rules.test.cjs](../tests/ticket-rules.test.cjs) e [run-backend-contract.ps1](../tests/run-backend-contract.ps1). | Backend API: transições, estados finais, histórico e eventos. Patches locais não comprovam implantação. |
| #932 — H08.1: listar/criar/editar/desativar usuários | Apenas `Api.fetchUsers()` em [api.js](../frontend/js/api.js); referência em [E7](fluxos/E7-gerenciamento-de-usuarios.md). | Backend API. Faltam consumidores frontend para gestão e desativação. |
| #936 — H10.1: ficha e filtros de relatório | `Api.fetchTickets()` em [api.js](../frontend/js/api.js) envia apenas `status`, `clientId` e `supportId`; referência em [E9](fluxos/E9-relatorio-de-atendimentos.md). | Backend API/contratos. Não há chamada atual enviando período e gravidade para esse relatório. |
| #938 — H11.1: README para máquina limpa e release v1.0 | [README.md](../README.md), [.github/workflows/sync-to-main.yml](../.github/workflows/sync-to-main.yml). | Documentação, infraestrutura local e release no GitHub. A presença do README não comprova o cenário Compose/PostgreSQL local nem a publicação da release. |

O card do backend para consultar o chamado/histórico aparece cortado nas imagens, sem ID legível. Seu consumidor é `Api.fetchTicketById()` em [api.js](../frontend/js/api.js); o ID deve ser conferido no OpenProject antes de nomear uma branch.

## User stories visíveis

As branches devem preferencialmente apontar para a tarefa concreta, mantendo a user story como contexto.

| User story | Entregas relacionadas visíveis |
| --- | --- |
| #898 — H01: Base de pé | #910, #912, #913, #914, #915 e #916. |
| #900 — H03: Abrir solicitação | #920 e #921. |
| #901 — H04: Minhas solicitações | #922 e #923. |
| #902 — H05: Painel do técnico | #924, #925 e #926. |
| #903 — H06: Assumir e resolver | #927, #928 e #929. |
| #904 — H07: Histórico do atendimento | #931 e tarefa backend de ID não legível na imagem. |
| #905 — H08: Gerenciar usuários | #932 e #933. |
| #906 — H09: Dashboard | #934 e #935. |
| #907 — H10: Relatório de atendimentos | #936 e #937. |
| #908 — H11: Entrega final | #938 e #939. |

## Fluxo de branches e aprovação

1. Partir da `main` atualizada e sem alterações pendentes: `git switch main`, `git pull --ff-only`.
2. Criar uma branch para a próxima tarefa: `git switch -c feat/931-historico-chamado`. Usar `fix/<id>-<descricao>` para correções, `feat/<id>-<descricao>` para funcionalidades, `test/<id>-<descricao>` para testes e `docs/<id>-<descricao>` para documentação.
3. Implementar somente a tarefa e suas correções/testes associados. Referenciar outros cards afetados na descrição da PR. Não criar branches vazias antecipadamente para todo o quadro.
4. Executar os testes, revisar `git diff`, fazer commit dos arquivos da tarefa e enviar a branch: `git push -u origin <branch>`.
5. Abrir uma PR com base `main`, ID do OpenProject no título, descrição do comportamento, resultado dos testes e passos de validação. Solicitar revisão de **@Mestter**.
6. Mover o card para `In testing` quando a implementação estiver pronta e a PR aberta. Se houver falha, registrar o cenário e corrigir na mesma branch/PR. O estado no OpenProject deve ser atualizado pelo grupo; este documento não altera o quadro.
7. Aguardar a validação e aprovação de @Mestter antes do merge. Após merge, atualizar a `main` local para iniciar outra tarefa.

Os números do OpenProject não são números de issues do GitHub. Escrever `OpenProject #925` e evitar `Closes #925`, que poderia fechar uma issue diferente no GitHub.

Este fluxo é uma convenção documentada. Não foram alteradas as regras de proteção da `main`. Para exigir aprovação tecnicamente, um administrador deve configurar a proteção/ruleset com PR obrigatória e pelo menos uma aprovação.

A correção atual usa `fix/925-painel-atualizacao-sem-perder-foco`. Commits anteriores que já estão na `main` continuam no histórico; a separação por card passa a valer para os próximos commits.
