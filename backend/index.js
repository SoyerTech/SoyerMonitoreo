require('dotenv').config();
const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const mqtt = require('mqtt');
const sqlite3 = require('sqlite3').verbose();
const { open } = require('sqlite');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const http = require('http');
const { Server } = require('socket.io');

const app = express();
app.use(cors());
app.use(express.json());

// Servir archivos estáticos del Frontend compilado (Vite)
app.use(express.static(path.join(__dirname, 'public')));

if (!fs.existsSync('./uploads')) {
    fs.mkdirSync('./uploads');
}
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, 'uploads/');
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, 'plano-' + uniqueSuffix + path.extname(file.originalname));
    }
});
const upload = multer({ storage: storage });

const server = http.createServer(app);
const io = new Server(server, {
    cors: { origin: "*", methods: ["GET", "POST"] }
});

const PORT = 3000;
const SECRET_KEY = process.env.JWT_SECRET || 'llave_secreta_super_perrona';

let db;
let estadoMqttConectado = false;

const ultimasAlertasPorCamara = {};

function obtenerHoraActualLocal() {
    let d = new Date();
    let anio = d.getFullYear();
    let mes = String(d.getMonth() + 1).padStart(2, '0');
    let dia = String(d.getDate()).padStart(2, '0');
    let horas = String(d.getHours()).padStart(2, '0');
    let minutos = String(d.getMinutes()).padStart(2, '0');
    let segundos = String(d.getSeconds()).padStart(2, '0');
    
    return `${anio}-${mes}-${dia} ${horas}:${minutos}:${segundos}`;
}

async function iniciarDB() {
    db = await open({
        filename: './database.sqlite',
        driver: sqlite3.Database
    });

    await db.exec(`
        CREATE TABLE IF NOT EXISTS camaras (
            keyFrigate TEXT PRIMARY KEY,
            cedis TEXT,
            zona TEXT,
            subzona TEXT,
            dispositivo TEXT,
            idInterno TEXT
        )
    `);

    await db.exec(`
        CREATE TABLE IF NOT EXISTS eventos (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            keyFrigate TEXT,
            cedis TEXT,
            zona TEXT,
            subzona TEXT,
            dispositivo TEXT,
            id_interno TEXT,
            id_foto TEXT,
            etiqueta TEXT,
            timestamp DATETIME
        )
    `);

    await db.exec(`
        CREATE TABLE IF NOT EXISTS emap_posiciones (
            keyFrigate TEXT PRIMARY KEY,
            cedis TEXT,
            x REAL DEFAULT 50.0,
            y REAL DEFAULT 50.0
        )
    `);

    await db.exec(`
        CREATE TABLE IF NOT EXISTS emap_planos (
            cedis TEXT PRIMARY KEY,
            planoUrl TEXT
        )
    `);

    try {
        await db.exec(`ALTER TABLE eventos ADD COLUMN keyFrigate TEXT`);
    } catch (e) {}

    console.log('🗄️ Base de datos SQLite inicializada y sincronizada correctamente.');
}

iniciarDB();

const USUARIOS_DB = [
    { username: 'admin', password: 'Dan.741852', rol: 'Administrador' },
    { username: 'gerente', password: 'gerente123', rol: 'Gerente' },
    { username: 'operador', password: 'operador123', rol: 'Visualizador' }
];

app.post('/api/login', (req, res) => {
    const { username, password } = req.body;
    const userFound = USUARIOS_DB.find(u => u.username === username && u.password === password);
    
    if (userFound) {
        const token = jwt.sign({ username: userFound.username, rol: userFound.rol }, SECRET_KEY, { expiresIn: '8h' });
        return res.json({ mensaje: 'Bienvenido patrón', token, rol: userFound.rol });
    }
    
    return res.status(401).json({ error: 'Credenciales inválidas' });
});

app.get('/api/health', (req, res) => {
    res.json({
        estado: 'ok',
        mqttConectado: estadoMqttConectado,
        timestamp: obtenerHoraActualLocal()
    });
});

app.get('/api/camaras', async (req, res) => {
    try {
        const camaras = await db.all(`SELECT * FROM camaras`);
        const catalogo = {};
        camaras.forEach(c => {
            catalogo[c.keyFrigate] = {
                cedis: c.cedis,
                zona: c.zona,
                subzona: c.subzona,
                dispositivo: c.dispositivo,
                id: c.idInterno
            };
        });
        res.json(catalogo);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/camaras', async (req, res) => {
    let { keyFrigate, cedis, zona, subzona, dispositivo, idInterno, sincronizarCompleto, nuevoCatalogo } = req.body;
    
    try {
        if (sincronizarCompleto && nuevoCatalogo) {
            await db.run(`DELETE FROM camaras`);
            for (const [key, info] of Object.entries(nuevoCatalogo)) {
                await db.run(
                    `INSERT INTO camaras (keyFrigate, cedis, zona, subzona, dispositivo, idInterno) VALUES (?, ?, ?, ?, ?, ?)`,
                    [key, info.cedis, info.zona, info.subzona, info.dispositivo, info.id || 'gen']
                );
            }
            return res.json({ mensaje: "Catálogo sincronizado" });
        }

        if (!keyFrigate || !cedis || !zona || !subzona || !dispositivo) {
            return res.status(400).json({ error: "Faltan datos de la jerarquía" });
        }

        await db.run(
            `INSERT INTO camaras (keyFrigate, cedis, zona, subzona, dispositivo, idInterno) 
             VALUES (?, ?, ?, ?, ?, ?) 
             ON CONFLICT(keyFrigate) DO UPDATE SET cedis=?, zona=?, subzona=?, dispositivo=?`,
            [keyFrigate, cedis, zona, subzona, dispositivo, idInterno || 'gen', cedis, zona, subzona, dispositivo]
        );

        await db.run(
            `UPDATE eventos 
             SET cedis = ?, zona = ?, subzona = ?, dispositivo = ? 
             WHERE keyFrigate = ?`,
            [cedis, zona, subzona, dispositivo, keyFrigate]
        );

        res.json({ mensaje: "Ubicación e historial actualizados con éxito" });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/eventos/:dias', async (req, res) => {
    try {
        const eventos = await db.all(`SELECT * FROM eventos ORDER BY id DESC LIMIT 1000`);
        res.json(eventos);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.delete('/api/eventos', async (req, res) => {
    try {
        await db.run(`DELETE FROM eventos`);
        res.json({ mensaje: 'Historial borrado con éxito' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/emap', async (req, res) => {
    try {
        const posiciones = await db.all(`SELECT * FROM emap_posiciones`);
        const planos = await db.all(`SELECT * FROM emap_planos`);
        
        const mapaPos = {};
        posiciones.forEach(p => {
            mapaPos[p.keyFrigate] = { x: p.x, y: p.y, cedis: p.cedis };
        });

        const mapaPlanos = {};
        planos.forEach(pl => {
            mapaPlanos[pl.cedis] = pl.planoUrl;
            mapaPlanos[pl.cedis.trim().toLowerCase()] = pl.planoUrl;
        });

        res.json({ posiciones: mapaPos, planos: mapaPlanos });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/emap', upload.single('planoFile'), async (req, res) => {
    const { keyFrigate, cedis, x, y } = req.body;
    
    try {
        if (req.file && cedis) {
            const urlFinal = `/uploads/${req.file.filename}`;
            await db.run(
                `INSERT INTO emap_planos (cedis, planoUrl) VALUES (?, ?) 
                 ON CONFLICT(cedis) DO UPDATE SET planoUrl = ?`,
                [cedis, urlFinal, urlFinal]
            );
            return res.json({ mensaje: "Plano guardado con éxito", planoUrl: urlFinal });
        }

        if (keyFrigate && cedis) {
            await db.run(
                `INSERT INTO emap_posiciones (keyFrigate, cedis, x, y) 
                 VALUES (?, ?, ?, ?) 
                 ON CONFLICT(keyFrigate) DO UPDATE SET cedis=?, x=?, y=?`,
                [keyFrigate, cedis, x || 50, y || 50, cedis, x || 50, y || 50]
            );
            return res.json({ mensaje: "Posición de pin guardada" });
        }

        res.status(400).json({ error: "Datos insuficientes" });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

const brokerUrl = 'mqtt://10.10.2.78:1883';
const clienteMqtt = mqtt.connect(brokerUrl, { reconnectPeriod: 5000 });

clienteMqtt.on('connect', () => {
    estadoMqttConectado = true;
    console.log('✅ Conectado exitosamente al Mosquitto de Frigate');
    clienteMqtt.subscribe('frigate/#', (err) => {
        if (!err) console.log('📡 Suscrito a frigate/#');
    });
});

clienteMqtt.on('offline', () => {
    estadoMqttConectado = false;
});

clienteMqtt.on('error', (err) => {
    estadoMqttConectado = false;
});

io.on('connection', (socket) => {
    socket.on('disconnect', () => {});
});

clienteMqtt.on('message', async (topic, message) => {
    try {
        const payloadStr = message.toString();
        
        if (!payloadStr.startsWith('{') && !payloadStr.startsWith('[')) {
            return;
        }

        const payload = JSON.parse(payloadStr);
        const nombreCamaraFrigate = payload.after?.camera || 'desconocida';
        
        if (payload.type === 'new' || payload.type === 'update') {
            const ahora = Date.now();
            const tiempoEsperaMs = 5 * 60 * 1000;

            if (ultimasAlertasPorCamara[nombreCamaraFrigate]) {
                const diferencia = ahora - ultimasAlertasPorCamara[nombreCamaraFrigate];
                if (diferencia < tiempoEsperaMs) {
                    return;
                }
            }
            ultimasAlertasPorCamara[nombreCamaraFrigate] = ahora;

            const camaraDb = await db.get(`SELECT * FROM camaras WHERE keyFrigate = ?`, [nombreCamaraFrigate]);
            
            const ubicacion = camaraDb || {
                cedis: "No agregada",
                zona: "No agregada",
                subzona: "No agregada",
                dispositivo: nombreCamaraFrigate,
                idInterno: "sin_id"
            };

            const horaLocalExacta = obtenerHoraActualLocal();

            const eventoData = {
                keyFrigate: nombreCamaraFrigate,
                cedis: ubicacion.cedis,
                zona: ubicacion.zona,
                subzona: ubicacion.subzona,
                dispositivo: ubicacion.dispositivo,
                id_interno: ubicacion.idInterno || ubicacion.id || 'gen',
                id_foto: payload.after?.id,
                etiqueta: "MOVIMIENTO",
                timestamp: horaLocalExacta
            };

            await db.run(
                `INSERT INTO eventos (keyFrigate, cedis, zona, subzona, dispositivo, id_interno, id_foto, etiqueta, timestamp) 
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                    eventoData.keyFrigate, 
                    eventoData.cedis, 
                    eventoData.zona, 
                    eventoData.subzona, 
                    eventoData.dispositivo, 
                    eventoData.id_interno, 
                    eventoData.id_foto, 
                    eventoData.etiqueta,
                    eventoData.timestamp
                ]
            );

            io.emit('alerta_movimiento', eventoData);
        }
    } catch (error) {
        // Ignoramos silenciosamente payloads que no apliquen o datos crudos
    }
});

// Comodín seguro compatible con Express moderno para redirigir al index.html de Vite
app.get(/^(?!\/api).*/, (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

server.listen(PORT, () => {
    console.log(`🚀 Servidor HikCentral-DB corriendo en http://localhost:${PORT}`);
});
