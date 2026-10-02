# Aplicativo Alfa

Aplicativo móvel demonstrativo em português, feito com Expo e TypeScript. Inclui login/cadastro de demonstração, organizador pessoal, biometria do aparelho, mapa/GPS, câmera e armazenamento local.

## Executar no Expo Go

1. Instale Node.js LTS e o Expo Go no celular.
2. Abra um terminal na pasta `aplicativo-alfa`.
3. Instale as dependências (se necessário) com `npm install`.
4. Inicie o servidor com `npx expo start --tunnel` (no Windows PowerShell, use `npx.cmd expo start --tunnel`).
5. Escaneie o QR exibido pelo terminal usando o Expo Go. O celular precisa de acesso à internet para o túnel; o mapa também precisa de conexão para carregar os tiles.

## Funcionalidades

- Login e cadastro são apenas telas demonstrativas; não há servidor nem validação real de contas. Não use senhas reais.
- Tarefas com categorias, prioridade, prazo, conclusão, exclusão e persistência local. “Meu dia” resume tarefas vencendo/atrasadas e hábitos concluídos.
- Lembretes locais opcionais para tarefas com prazo e horário, sujeitos à permissão de notificações do aparelho.
- Hábitos diários com marcação de conclusão e contagem de sequência.
- Notas rápidas com título opcional, conteúdo e data de atualização; ficam salvas localmente.
- Cadastro biométrico opcional na aba “Segurança”. O app registra somente o status e a data/hora, nunca os dados biométricos; o login continua sendo feito com senha.
- Mapa OpenStreetMap com GPS sob demanda. Cada posição obtida é salva localmente com coordenadas, precisão e data/hora; o histórico mantém até 50 registros.
- Captura de fotos persistidas no armazenamento privado do app, com opção de associá-las a uma tarefa e consultar miniaturas na tela “Dados”.
- Consulta e limpeza dos dados locais, incluindo tarefas, hábitos, notas, fotos, posições GPS e registro biométrico.

Câmera, GPS, biometria e lembretes dependem do hardware, permissões e configurações do aparelho. O cadastro biométrico é opcional e pode ser ativado ou removido na aba “Segurança”; ele não substitui nem altera o login. O mapa exige conexão com a internet; fotos, tarefas, hábitos e notas ficam salvos localmente no aparelho. No Expo Go, atualize o bundle e conceda permissão para receber lembretes; builds próprias precisam ser recompiladas para incluir o módulo nativo de notificações.

Ao abrir o mapa ou centralizá-lo no GPS, a região e as coordenadas exibidas são enviadas ao OpenStreetMap para carregar o mapa. Tarefas, hábitos, notas, fotos e o registro de biometria permanecem no armazenamento local do aparelho.
