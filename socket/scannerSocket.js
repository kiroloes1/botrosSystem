const { Server } = require("socket.io");

const setupScannerSocket = (server) => {
  const io = new Server(server, {
    cors: {
      origin: "*",
      methods: ["GET", "POST"],
    },
  });

  io.on("connection", (socket) => {
    console.log("📱 Device connected:", socket.id);

    // ==============================
    // الكمبيوتر ينشئ جلسة Scanner
    // ==============================
    socket.on("create-scanner-session", (sessionId) => {

      const room = `scanner:${sessionId}`;

      socket.join(room);

      console.log("💻 Computer joined scanner session");
      console.log("🆔 Session:", sessionId);
      console.log("🔌 Socket:", socket.id);

      const roomSockets = io.sockets.adapter.rooms.get(room);

      console.log(
        "👥 Devices in room:",
        roomSockets ? roomSockets.size : 0
      );
    });

    // ==============================
    // الموبايل يدخل جلسة الكمبيوتر
    // ==============================
    socket.on("join-scanner-session", (sessionId) => {

      const room = `scanner:${sessionId}`;

      socket.join(room);

 
        io.to(room).emit("join", {
         isOk: true
      });
      const roomSockets = io.sockets.adapter.rooms.get(room);


    });

    // ==============================
    // Barcode
    // ==============================
    socket.on("barcode-scanned", ({ sessionId, code }) => {

      const room = `scanner:${sessionId}`;

      const roomSockets = io.sockets.adapter.rooms.get(room);


      io.to(room).emit("barcode-received", {
        code,
      });
    });

    // ==============================
    // Disconnect
    // ==============================
    socket.on("disconnect", () => {
      console.log(
        "❌ Device disconnected:",
        socket.id
      );
    });
  });

  return io;
};

module.exports = setupScannerSocket;