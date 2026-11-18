# TrackFlow para Android (preparação do APK)

O frontend foi preparado para empacotamento Android com Capacitor. O APK final depende de uma API publicada em HTTPS: o aplicativo não pode usar `localhost` do computador no celular.

## 1. Publicar o backend

Publique a pasta `backend` em um serviço de hospedagem Node.js e conecte um PostgreSQL. Configure as variáveis do arquivo `backend/.env.example` no painel do serviço. Execute o schema `backend/sql/schema.sql` no banco. Use HTTPS e um `JWT_SECRET` forte (32 caracteres ou mais).

## 2. Configurar a URL da API

Na pasta `frontend`, copie `.env.production.example` para `.env.production` e substitua o valor por sua URL real, por exemplo `https://trackflow-api.exemplo.com`. Não inclua `/api` no final.

## 3. Gerar o projeto Android

Instale Node.js LTS, Android Studio e Android SDK. No terminal, entre em `frontend` e execute:

```bash
npm install
npx cap add android
npm run build
npx cap sync android
npx cap open android
```

No Android Studio, aguarde a sincronização do Gradle. Para gerar APK: **Build > Build Bundle(s) / APK(s) > Build APK(s)**. O APK de debug fica normalmente em `frontend/android/app/build/outputs/apk/debug/app-debug.apk`. Para distribuição, gere um APK/AAB assinado em **Build > Generate Signed Bundle / APK**.

## Observações

- O app exige internet para acessar API, Socket.IO e os mapas.
- A geolocalização exige permissão explícita do usuário. O compartilhamento deve ser iniciado e encerrado pelo próprio usuário.
- O navegador/WebView não garante rastreamento contínuo quando o app é fechado ou suspenso.
- Não use dados reais até validar autenticação, consentimento, regras de acesso e segurança em produção.
