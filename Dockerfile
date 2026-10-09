# Usamos una imagen oficial y ligera de Node.js
FROM node:18-alpine

# Creamos el directorio de trabajo dentro del contenedor
WORKDIR /app

# Copiamos los archivos de dependencias
COPY package*.json ./

# Instalamos las dependencias
RUN npm install

# Copiamos todo el código fuente al contenedor
COPY . .

# Exponemos el puerto donde corre tu servidor Express / Socket.io
EXPOSE 3000

# Comando para iniciar la aplicación
CMD ["node", "index.js"]
