const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*', methods: ['GET', 'POST'] }
});

const PORT = process.env.PORT || 3000;

// Serve static HTML files
app.use(express.static(path.join(__dirname, 'public')));

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'phone.html'));
});
app.get('/laptop', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'laptop.html'));
});

// ── Rooms: each room = one phone + one laptop ──
// rooms[code] = { phone: socketId, laptop: socketId }
const rooms = {};

io.on('connection', (socket) => {

  // Phone registers with a code
  socket.on('register-phone', (code) => {
    const c = code.toUpperCase();
    if (!rooms[c]) rooms[c] = {};
    rooms[c].phone = socket.id;
    socket.join(c);
    socket.roomCode = c;
    socket.role = 'phone';
    console.log('📱 Phone registered code:', c);

    // If laptop already waiting, notify it
    if (rooms[c].laptop) {
      io.to(rooms[c].laptop).emit('phone-joined');
    }
  });

  // Laptop joins with a code
  socket.on('join-laptop', (code) => {
    const c = code.toUpperCase();
    if (!rooms[c] || !rooms[c].phone) {
      socket.emit('error', 'Code not found. Make sure your phone is open and showing the code.');
      return;
    }
    rooms[c].laptop = socket.id;
    socket.join(c);
    socket.roomCode = c;
    socket.role = 'laptop';
    console.log('💻 Laptop joined code:', c);

    // Tell phone laptop is ready
    io.to(rooms[c].phone).emit('laptop-joined');
    socket.emit('connected');
  });

  // Phone sends mouse events → relay to laptop
  socket.on('mouse-event', (data) => {
    const c = socket.roomCode;
    if (c && rooms[c] && rooms[c].laptop) {
      io.to(rooms[c].laptop).emit('mouse-event', data);
    }
  });

  socket.on('disconnect', () => {
    const c = socket.roomCode;
    if (!c || !rooms[c]) return;
    if (socket.role === 'phone') {
      console.log('📱 Phone disconnected:', c);
      delete rooms[c].phone;
      if (rooms[c].laptop) io.to(rooms[c].laptop).emit('phone-disconnected');
      if (!rooms[c].laptop) delete rooms[c];
    } else if (socket.role === 'laptop') {
      console.log('💻 Laptop disconnected:', c);
      delete rooms[c].laptop;
      if (rooms[c].phone) io.to(rooms[c].phone).emit('laptop-disconnected');
      if (!rooms[c].phone) delete rooms[c];
    }
  });
});

server.listen(PORT, () => {
  console.log('Mouse Mode relay server running on port', PORT);
});
