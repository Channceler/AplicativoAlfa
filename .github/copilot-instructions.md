# Instruções do projeto

- Aplicativo React Native com Expo SDK 57 e TypeScript.
- Mantenha as interfaces e mensagens em português.
- Use módulos Expo compatíveis com o SDK e permissões solicitadas no momento de uso.
- Não registre coordenadas, imagens ou dados biométricos fora do aparelho.
- AsyncStorage deve usar o prefixo `@aplicativo-alfa/` para as chaves do app.
- Verifique alterações com `npx tsc --noEmit` e valide as dependências com `npx expo install --check`.
- Para testar em dispositivo físico, inicie com `npx expo start --tunnel` e use o Expo Go.
