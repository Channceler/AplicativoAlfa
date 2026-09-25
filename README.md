# Aplicativo Alfa

Demo mobile Expo em português com cinco áreas: ToDo, biometria, mapa/GPS, câmera e AsyncStorage.

## Executar no Expo Go

1. Instale Node.js LTS e o Expo Go no celular.
2. Abra um terminal na pasta `aplicativo-alfa`.
3. Instale as dependências (se necessário) com `npm install`.
4. Inicie o servidor com `npx expo start --tunnel` (no Windows PowerShell, use `npx.cmd expo start --tunnel`).
5. Escaneie o QR exibido pelo terminal usando o Expo Go. O celular precisa de acesso à internet para o túnel; o mapa também precisa de conexão para carregar os tiles.

## Funcionalidades

- Tarefas com criação, conclusão, exclusão e persistência local.
- Biometria do aparelho com estado de disponibilidade e retorno da autenticação.
- Mapa centralizado na posição atual após conceder permissão de localização.
- Captura de foto com prévia temporária na tela.
- Consulta e limpeza dos dados do app no AsyncStorage.

Câmera, GPS e biometria dependem do hardware, permissões e configurações do aparelho. A tela de biometria também pode usar o método alternativo oferecido pelo sistema.
