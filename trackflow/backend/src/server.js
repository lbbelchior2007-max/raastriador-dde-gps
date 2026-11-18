require("dotenv").config();

const express = require("express");
const http = require("http");
const cors = require("cors");
const helmet = require("helmet");
const jwt = require("jsonwebtoken");
const { Server } = require("socket.io");
const db = require("./db");
const authRoutes = require("./routes/auth");
const locationRoutes = require("./routes/locations");
const shareRoutes = require("./routes/shares");

if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
  throw new Error("JWT_SECRET precisa ter pelo menos 32 caracteres.");
}

const app = express();
const server = http.createServer(app);
const origin = process.env.FRONTEND_ORIGIN || "http://localhost:5173";

app.use(helmet());
app.use(cors({ origin, credentials: true }));
app.use(express.json({ limit: "20kb" }));

app.get("/api/health", async (_req, res) => {
  try {
    await db.query("SELECT 1");
    res.json({ ok: true, database: "connected" });
  } catch {
    res.status(503).json({ ok: false, database: "disconnected" });
  }
});

app.use("/api/auth", authRoutes);
app.use("/api/locations", locationRoutes);
app.use("/api/shares", shareRoutes);

const io = new Server(server, {
  cors: { origin, methods: ["GET", "POST"] }
});

io.use((socket, next) => {
  try {
    const token = socket.handshake.auth?.token;
    if (!token) return next(new Error("Autenticação necessária."));
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    socket.userId = payload.sub;
    next();
  } catch {
    next(new Error("Token inválido ou expirado."));
  }
});

io.on("connection", (socket) => {
  socket.join(`user:${socket.userId}`);
  db.query("SELECT name FROM users WHERE id = $1", [socket.userId])
    .then((result) => { socket.data.displayName = result.rows[0]?.name || ""; })
    .catch(() => {});

  socket.on("gps:start", () => {
    socket.data.sharing = true;
    socket.emit("gps:status", { sharing: true });
  });

  socket.on("gps:stop", () => {
    socket.data.sharing = false;
    socket.emit("gps:status", { sharing: false });
    db.query(
      "SELECT requester_id FROM location_shares WHERE owner_id = $1 AND status = 'accepted'",
      [socket.userId]
    ).then((viewers) => {
      for (const viewer of viewers.rows) {
        io.to(`user:${viewer.requester_id}`).emit("gps:sharing-stopped", { personId: socket.userId });
      }
    }).catch(() => {});
  });

  socket.on("gps:update", async (data, acknowledge) => {
    try {
      if (!socket.data.sharing) {
        if (typeof acknowledge === "function") acknowledge({ ok: false, error: "Compartilhamento não iniciado." });
        return;
      }

      const latitude = Number(data?.latitude);
      const longitude = Number(data?.longitude);
      const accuracy = data?.accuracy == null ? null : Number(data.accuracy);
      const speed = data?.speed == null ? null : Number(data.speed);
      const heading = data?.heading == null ? null : Number(data.heading);

      if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90 ||
          !Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
        if (typeof acknowledge === "function") acknowledge({ ok: false, error: "Coordenadas inválidas." });
        return;
      }

      const result = await db.query(
        `INSERT INTO location_points
         (user_id, latitude, longitude, accuracy, speed, heading)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING id, latitude, longitude, accuracy, speed, heading, recorded_at`,
        [socket.userId, latitude, longitude, accuracy, speed, heading]
      );

      socket.emit("gps:saved", result.rows[0]);

      // Somente pessoas cujo pedido foi aceito pelo dono da localização recebem a posição.
      const viewers = await db.query(
        `SELECT requester_id FROM location_shares
         WHERE owner_id = $1 AND status = 'accepted'`,
        [socket.userId]
      );
      for (const viewer of viewers.rows) {
        io.to(`user:${viewer.requester_id}`).emit("gps:shared-location", {
          personId: socket.userId,
          personName: socket.data.displayName || "Pessoa compartilhando localização",
          ...result.rows[0]
        });
      }
      if (typeof acknowledge === "function") acknowledge({ ok: true });
    } catch (error) {
      console.error("Falha ao salvar posição:", error.message);
      if (typeof acknowledge === "function") acknowledge({ ok: false, error: "Falha ao salvar posição." });
    }
  });

  socket.on("disconnect", () => {
    const wasSharing = socket.data.sharing === true;
    socket.data.sharing = false;
    if (wasSharing) {
      db.query(
        "SELECT requester_id FROM location_shares WHERE owner_id = $1 AND status = 'accepted'",
        [socket.userId]
      ).then((viewers) => {
        for (const viewer of viewers.rows) {
          io.to(`user:${viewer.requester_id}`).emit("gps:sharing-stopped", { personId: socket.userId });
        }
      }).catch(() => {});
    }
  });
});

const port = Number(process.env.PORT) || 3333;
server.listen(port, () => console.log(`TrackFlow API executando na porta ${port}`));
