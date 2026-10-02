# Aplicativo Alfa

Aplicativo móvel demonstrativo em português, feito com Expo e TypeScript. Inclui login/cadastro de demonstração, tarefas, biometria do aparelho, mapa/GPS, câmera e armazenamento local.

## Executar no Expo Go

1. Instale Node.js LTS e o Expo Go no celular.
2. Abra um terminal na pasta `aplicativo-alfa`.
3. Instale as dependências (se necessário) com `npm install`.
4. Inicie o servidor com `npx expo start --tunnel` (no Windows PowerShell, use `npx.cmd expo start --tunnel`).
5. Escaneie o QR exibido pelo terminal usando o Expo Go. O celular precisa de acesso à internet para o túnel; o mapa também precisa de conexão para carregar os tiles.

## Funcionalidades

- Login e cadastro são apenas telas demonstrativas; não há servidor nem validação real de contas. Não use senhas reais.
- Tarefas com criação, conclusão, exclusão e persistência local. A tela “Dados” mostra o título e a data/hora de criação.
- Biometria do aparelho com estado de disponibilidade e confirmação pelo sistema. O app registra somente o status e a data/hora, nunca os dados biométricos.
- Mapa OpenStreetMap com GPS sob demanda. Cada posição obtida é salva localmente com coordenadas, precisão e data/hora; o histórico mantém até 50 registros.
- Captura de fotos persistidas no armazenamento privado do app, com miniaturas na tela “Dados”.
- Consulta e limpeza dos dados locais, incluindo tarefas, fotos, posições GPS e registro biométrico.

Câmera, GPS e biometria dependem do hardware, permissões e configurações do aparelho. A tela de biometria também pode usar o método alternativo oferecido pelo sistema. O mapa exige conexão com a internet; as fotos ficam salvas localmente no aparelho.

Ao abrir o mapa ou centralizá-lo no GPS, a região e as coordenadas exibidas são enviadas ao OpenStreetMap para carregar o mapa. Tarefas, fotos e o registro de biometria permanecem no armazenamento local do aparelho.
