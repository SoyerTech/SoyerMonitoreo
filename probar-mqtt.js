const mqtt = require('mqtt');

// Nos conectamos al mismo broker Mosquitto
const client = mqtt.connect('mqtt://10.10.2.78:1884');

client.on('connect', () => {
    console.log('🔌 Conectado al broker para enviar evento de prueba...');

    // Creamos el JSON exacto de Frigate
    const eventoPrueba = JSON.stringify({
        type: "new",
        after: {
            camera: "camara_de_prueba",
            id: "123456789",
            label: "humano"
        }
    });

    // Publicamos directamente en el canal frigate/events
    client.publish('frigate/events', eventoPrueba, () => {
        console.log('📤 ¡Evento de prueba enviado exitosamente!');
        client.end();
    });
});