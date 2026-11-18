# TrackFlow — rastreamento GPS consentido

Starter de desenvolvimento para uma plataforma web de compartilhamento de localização.
A pessoa rastreada inicia e encerra o compartilhamento de forma explícita.

## Requisitos
- Node.js 20+
- PostgreSQL 15+
- Navegador com suporte à Geolocation API
- HTTPS em produção (necessário para geolocalização)

## Estrutura
- `backend/`: API Express, Socket.IO, autenticação JWT e PostgreSQL
- `frontend/`: React, Vite, Leaflet e captura GPS

## 1. Banco de dados
Crie um banco PostgreSQL chamado `trackflow` e configure `backend/.env`:

```env
PORT=3333
DATABASE_URL=postgresql://postgres:SUA_SENHA@localhost:5432/trackflow
JWT_SECRET=troque-por-uma-chave-aleatoria-com-mais-de-32-caracteres
FRONTEND_ORIGIN=http://localhost:5173
```

Execute o SQL atualizado de `backend/sql/schema.sql` no banco. Se você já executou uma versão anterior, execute novamente o arquivo: os comandos usam `IF NOT EXISTS` para criar a tabela de compartilhamentos sem apagar os dados existentes.

## 2. Backend
```bash
cd backend
npm install
npm run dev
```

## 3. Frontend
Em outro terminal:
```bash
cd frontend
npm install
npm run dev
```
Abra `http://localhost:5173`.

## 4. Teste
1. Crie uma conta na tela de cadastro.
2. Entre no sistema.
3. Clique em **Iniciar compartilhamento** e permita o acesso à localização.
4. A posição será enviada ao servidor via Socket.IO e registrada no banco.
5. Para encerrar, clique em **Parar compartilhamento**.

Este primeiro marco registra a própria localização do usuário autenticado. O fluxo inicial de solicitação, aceite, recusa e revogação de compartilhamento entre contas está implementado. Histórico com filtros, geofencing e administração são etapas seguintes. Não exponha posições de pessoas a outros usuários antes de implementar e testar os controles de autorização.

## Segurança e privacidade
- Não use este projeto para rastreamento oculto.
- O compartilhamento deve ser informado, voluntário, visível e revogável.
- Use HTTPS/WSS em produção.
- Configure `JWT_SECRET` forte e mantenha `.env` fora do Git.
- Defina retenção e exclusão de histórico antes de usar dados reais.
- Não coloque tokens ou coordenadas em logs públicos.
- A precisão do GPS varia conforme dispositivo, ambiente e permissões.
- A Geolocation API do navegador não garante execução contínua em segundo plano.

## Próximas etapas
1. Convites e concessão/revogação de acesso entre usuários.
2. Visualização de pessoas que concederam acesso ao usuário logado.
3. Histórico de trajetos com paginação e limites de retenção.
4. Geofences e alertas.
5. Painel administrativo, auditoria e exportação.
6. Testes automatizados, rate limiting, validação e observabilidade.

## Aplicativo Android

Consulte `ANDROID-APP.md` para publicar a API e gerar o APK com Capacitor.
