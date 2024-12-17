# Sistema de Gestión de Prótesis Médicas

Este proyecto es un sistema web diseñado para gestionar pacientes y sus prótesis médicas. Proporciona funcionalidades para la administración eficiente de registros de pacientes, prótesis y transacciones relacionadas.

## Características principales

- **Gestión de prótesis**: Controla el inventario de prótesis disponibles.
- **Registro de pacientes**: Almacena y organiza la información de los pacientes.
- **Carga y descarga de archivos**: Subida y descarga de documentos PDF asociados a pedidos.
- **Autenticación y roles**: Acceso seguro con roles de **administrador** y **usuario**.
- **Búsqueda en tiempo real**: Filtrado rápido de registros en formularios.

---

## Tecnologías utilizadas

- **Frontend**: HTML5, CSS3, JavaScript
- **Base de datos**: MySQL
- **Herramientas**: Nodemon para reinicio automático en desarrollo

---

## Estructura del proyecto
```bash
PROYECTO/
├── node_modules/                 # Módulos instalados por npm
├── public/                       # Archivos públicos y visibles
│   ├── imagenes/                 # Imágenes del proyecto
│   │   └── protesis-logo.png
│   ├── busqueda.html             # Página de búsqueda
│   ├── gestion-archivos.html     # Gestión de archivos
│   ├── gestion-protesis.html     # Gestión de prótesis
│   ├── gestion-revisiones.html   # Gestión de revisiones
│   ├── index.html                # Página principal
│   ├── login.html                # Página de inicio de sesión
│   ├── navbar.html               # Menú de navegación
│   ├── registro.html             # Registro de usuarios
│   └── styles.css                # Hoja de estilos principal
├── uploads/                      # Carpeta para subida de archivos
├── .env                          # Variables de entorno
├── nodemon.json                  # Configuración para Nodemon
├── package-lock.json             # Archivo de bloqueo de dependencias
├── package.json                  # Archivo de configuración del proyecto
└── server.js                     # Archivo principal del servidor
```
##  Instalación y configuración

Para ejecutar el proyecto en tu máquina local:
1. Instala las dependencias siguientes: npm install express mysql2 dotenv multer xlsx nodemon bcrypt
2. Cuante con las tablas necesarias en su base de datos de MySQL.
3. Para iniciar el servidor: npm start

## Esquema SQL
```sql
-- 1. Crear la base de datos
CREATE DATABASE IF NOT EXISTS gestion_protesis;
USE gestion_protesis;

-- 2. Crear tabla de pacientes
CREATE TABLE pacientes (
    id INT AUTO_INCREMENT PRIMARY KEY,
    nombre VARCHAR(50) NOT NULL,
    apellido VARCHAR(50) NOT NULL,
    email VARCHAR(100) UNIQUE,
    fecha_nacimiento DATE,
    fecha_registro TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 3. Crear tabla de prótesis
CREATE TABLE protesis (
    id INT AUTO_INCREMENT PRIMARY KEY,
    tipo VARCHAR(50) NOT NULL,
    fabricante VARCHAR(50),
    fecha_asignacion DATE,
    id_paciente INT,
    FOREIGN KEY (id_paciente) REFERENCES pacientes(id) ON DELETE CASCADE
);

-- 4. Crear tabla de revisiones
CREATE TABLE revisiones (
    id INT AUTO_INCREMENT PRIMARY KEY,
    id_protesis INT,
    fecha DATE,
    estado VARCHAR(50),
    observaciones TEXT,
    FOREIGN KEY (id_protesis) REFERENCES protesis(id) ON DELETE CASCADE
);

-- 5. Añadir columna puntaje a la tabla revisiones
ALTER TABLE revisiones ADD puntaje DECIMAL(2,2);

-- 6. Crear tabla de archivos_pdf
CREATE TABLE archivos_pdf (
    id INT AUTO_INCREMENT PRIMARY KEY,
    nombre_original VARCHAR(255) NOT NULL,
    ruta_archivo VARCHAR(255) NOT NULL,
    fecha_subida TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```
# Autores
- Carlos Azael Ramirez Rodriguez
- Jovita María Fernanda Antúnez Rubio

```bash
git clone https://github.com/carlosazaelr/gestion-protesis.git
cd gestion-protesis
```
