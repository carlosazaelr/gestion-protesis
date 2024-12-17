
const express = require('express');
const session = require('express-session');
const bcrypt = require('bcrypt');
const mysql = require('mysql2');
const app = express();
const bodyParser = require('body-parser');
const path = require('path');
const multer = require('multer');
const xlsx = require('xlsx');
require('dotenv').config();

// Configuración de la sesión
app.use(session({
  secret: 'secretKey',
  resave: false,
  saveUninitialized: false,
}));

app.use(express.urlencoded({ extended: true }));
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());

// Configuración de MySQL
const connection = mysql.createConnection({
  host: process.env.DB_HOST,       // Host desde .env
  user: process.env.DB_USER,       // Usuario desde .env
  password: process.env.DB_PASSWORD,   // Contraseña desde .env
  database: process.env.DB_NAME  // Nombre de la base de datos desde .env    
});

// Conectar a la base de datos
connection.connect(err => {
  if (err) {
    console.error('Error al conectar con la base de datos:', err);
    return;
  }
  console.log('Conexión exitosa a la base de datos');
});  

//Middleware
function requireLogin(req, res, next) {
  if (!req.session.userId) {
    return res.redirect('/login.html');
  }
  next();
}

function requireRole(roles) {
  return (req, res, next) => {
      if (req.session.userId && roles.includes(req.session.userId.tipo_usuario)) {
          next();
      } else {
          res.status(403).send('Acceso denegado');
      }
  };
}

// Ruta para obtener el tipo de usuario actual
app.get('/tipo-usuario', requireLogin, (req, res) => {
  res.json({ tipo_usuario: req.session.userId.tipo_usuario });
});

// Ruta protegida (Página principal después de iniciar sesión)
app.get('/', requireLogin, (_req, res) => {
  res.sendFile(__dirname + '/public/index.html');
});

app.get('/gestion-protesis.html', requireLogin, (_req, res) => {
  res.sendFile(__dirname + '/public/gestion-protesis.html');
});

app.get('/gestion-archivos.html', requireLogin, (_req, res) => {
  res.sendFile(__dirname + '/public/gestion-archivos.html');
});

app.get('/gestion-revisiones.html', requireLogin, (_req, res) => {
  res.sendFile(__dirname + '/public/gestion-revisiones.html');
});

app.get('/busqueda.html', requireLogin, (_req, res) => {
  res.sendFile(__dirname + '/public/busqueda.html');
});
// Servir archivos estáticos (HTML)
app.use(express.static(path.join(__dirname, 'public')));


// Registro de usuario
app.post('/registrar', (req, res) => {
  const { nombre_usuario, password, codigo_acceso} = req.body;
  const query = 'SELECT tipo_usuario FROM codigos_acceso WHERE codigo = ?';

  connection.query(query, [codigo_acceso], (err, results) => { 
    if (err || results.length === 0) {
      return res.send('Código de acceso inválido');
    }
    const tipo_usuario = results[0].tipo_usuario;
    const hashedPassword = bcrypt.hashSync(password, 10);
    const insertUser = 'INSERT INTO usuarios (nombre_usuario, password_hash, tipo_usuario) VALUES (?, ?, ?)';
    connection.query(insertUser, [nombre_usuario, hashedPassword, tipo_usuario], (err) => {
      if (err) return res.send('Error al registrar usuario');
      res.redirect('/login.html');
    });
  });
});

// Iniciar sesión
app.post('/login.html', (req, res) => {
  const { nombre_usuario, password } = req.body;
  // Consulta para obtener el usuario y su tipo
  connection.query('SELECT * FROM usuarios WHERE nombre_usuario = ?',
    [nombre_usuario], async (err, results) => { 
    if (err || results.length === 0) {
      return res.send('Usuario no encontrado');
    }

    const user = results[0];
    const match = await bcrypt.compare(password, user.password_hash);
    if (match) {
      // Almacenar la información del usuario en la sesión
      req.session.userId = {
        id: user.id,
        username: user.username,
        tipo_usuario: user.tipo_usuario // Aquí se establece el tipo de usuario en la sesión
    };
    res.redirect('/');
    }else {
      res.send('contrasena incorrecta');
    }
  });
});

// Cerrar sesión
app.get('/logout', (req, res) => {
  req.session.destroy();
  res.redirect('/login.html');
});

// Ruta para que solo admin pueda ver todos los usuarios
app.get('/ver-usuarios', requireLogin, requireRole('admin'), (_req, res) => {
  connection.query('SELECT * FROM usuarios', (err, results) => {
    if (err) {
      return res.send('Error al obtener los datos.');
    }

  let html = `
    <html>
    <head>
      <link rel="stylesheet" href="/styles.css">
      <title>Usuarios</title>
    </head>
    <body>
      <h1>Usuarios Registrados</h1>
      <table>
        <thead>
          <tr>
            <th>id</th>
            <th>Nombre</th>
            <th>Contraseña Encriptada</th>
            <th>Tipo de usuario</th>
          </tr>
        </thead>
        <tbody>
  `;

  results.forEach(usuario => {
    html += `
      <tr>
        <td>${usuario.id}</td>
        <td>${usuario.nombre_usuario}</td>
        <td>${usuario.password_hash}</td>
        <td>${usuario.tipo_usuario}</td>
      </tr>
    `;
  });

  html += `
        </tbody>
      </table>
      <button onclick="window.location.href='/'">Volver</button>
    </body>
    </html>
  `;

  res.send(html);
});
});

// Ruta para buscar usuarios
app.get('/buscar', requireLogin, requireRole('admin'), (req, res) => {
  const query = req.query.query;
  const sql = `SELECT nombre_usuario, tipo_usuario FROM usuarios WHERE nombre_usuario LIKE ?`;
  connection.query(sql, [`%${query}%`], (err, results) => {
    if (err) throw err;
    res.json(results);
  });
});

// Ruta para guardar datos en la base de datos
app.post('/submit-data',requireLogin ,requireRole(['tecnico','admin']), (req, res) => {
  const { name, last_name, email, birthday } = req.body;

  const query = 'INSERT INTO pacientes (nombre, apellido, email, fecha_nacimiento) VALUES (?, ?, ?, ?)';
  connection.query(query, [name, last_name, email, birthday ], (err, result) => {
    if (err) {
      return res.send('<h1>Error al guardar al paciente en la base de datos</h1><a href="/">Volver</a>');;
    }
    res.send('<h1>Paciente guardado en la base de datos</h1><a href="/">Volver</a>');
  });
});

// Ruta para la carga de archivos de excel
const upload = multer({ dest: 'uploads/' });

app.post('/upload', upload.single('excelFile'),requireLogin ,requireRole(['tecnico','admin']), (req, res) => {
  const filePath = req.file.path;
  const workbook = xlsx.readFile(filePath);
  const sheetName = workbook.SheetNames[0];
  const data = xlsx.utils.sheet_to_json(workbook.Sheets[sheetName]);

  data.forEach(row => {
    const { name, last_name, email, birthday } = row;
    const sql = `INSERT INTO pacientes (nombre, apellido, email, fecha_nacimiento) VALUES (?, ?, ?, ?)`;
    connection.query(sql, [name, last_name, email, birthday], err => {
      if (err) throw err;
    });
  });

  res.send('<h1>Archivo cargado y datos guardados</h1><a href="/">Volver</a>');
});

//Ruta para la descarga de archivos de excel
app.get('/download', (req, res) => {
  const sql = `SELECT * FROM pacientes`;
  connection.query(sql, (err, results) => {
    if (err) throw err;

    const worksheet = xlsx.utils.json_to_sheet(results);
    const workbook = xlsx.utils.book_new();
    xlsx.utils.book_append_sheet(workbook, worksheet, 'Pacientes');

    const filePath = path.join(__dirname, 'uploads', 'pacientes.xlsx');
    xlsx.writeFile(workbook, filePath);
    res.download(filePath, 'pacientes.xlsx');
  });
});

// Ruta para cargar archivos en pdf
app.post('/subir-pdf', upload.single('pdf'), requireLogin ,requireRole(['tecnico','admin']),(req, res) => {
  const filePath = req.file.path;
  const originalName = req.file.originalname;

  connection.query(
    'INSERT INTO archivos_pdf (nombre_original, ruta_archivo) VALUES (?, ?)',
    [originalName, filePath],
    (err, results) => {
      if (err) throw err;
      res.send('<h1>Archivo cargado y datos guardados</h1><a href="/">Volver</a>');
    }
  );
});

// Ruta para mostrar los datos de la base de datos en formato HTML
app.get('/ver-pdf', requireLogin, requireRole(['tecnico','admin']),(_req, res) => {
  connection.query('SELECT * FROM archivos_pdf', (err, results) => {
    if (err) {
      return res.send('Error al obtener los datos.');
    }

    let html = `
      <html>
      <head>
        <link rel="stylesheet" href="/styles.css">
        <title>Pacientes</title>
      </head>
      <body>
        <h1>Reportes</h1>
        <table>
          <thead>
            <tr>
              <th>id</th>
              <th>Nombre del archivo</th>
              <th>Ruta</th>
              <th>Fecha de subida</th>
            </tr>
          </thead>
          <tbody>
    `;

    results.forEach(archivo => {
      html += `
        <tr>
          <td>${archivo.id}</td>
          <td>${archivo.nombre_original}</td>
          <td>${archivo.ruta_archivo}</td>
          <td>${archivo.fecha_subida}</td>
        </tr>
      `;
    });

    html += `
          </tbody>
        </table>
        <button onclick="window.location.href='/'">Volver</button>
      </body>
      </html>
    `;

    res.send(html);
  });
});

app.post('/download-pdf', (req, res) => {
  const fileId = req.body;
  connection.query(
    'SELECT ruta_archivo, nombre_original FROM archivos_pdf WHERE id = ?',
    [fileId],
    (err, results) => {
      if (err) throw err;
      if (results.length === 0) {
        return res.status(404).send('Archivo no encontrado');
      }

      const { ruta_archivo, nombre_original } = results[0];
      res.download(ruta_archivo, nombre_original, (err) => {
        if (err) {
          console.error(err);
          res.status(500).send('Error al descargar el archivo');
        }
      });
    }
  );
});

// Ruta para mostrar los datos de la base de datos en formato HTML
app.get('/pacientes', requireLogin, requireRole(['tecnico','admin']),(_req, res) => {
  connection.query('SELECT * FROM pacientes', (err, results) => {
    if (err) {
      return res.send('Error al obtener los datos.');
    }

    let html = `
      <html>
      <head>
        <link rel="stylesheet" href="/styles.css">
        <title>Pacientes</title>
      </head>
      <body>
        <h1>Pacientes Registrados</h1>
        <table>
          <thead>
            <tr>
              <th>id</th>
              <th>Nombre</th>
              <th>Apellido</th>
              <th>Email</th>
              <th>Fecha de nacimiento</th>
              <th>Fecha de registro</th>
            </tr>
          </thead>
          <tbody>
    `;

    results.forEach(paciente => {
      html += `
        <tr>
          <td>${paciente.id}</td>
          <td>${paciente.nombre}</td>
          <td>${paciente.apellido}</td>
          <td>${paciente.email}</td>
          <td>${paciente.fecha_nacimiento}</td>
          <td>${paciente.fecha_registro}</td>
        </tr>
      `;
    });

    html += `
          </tbody>
        </table>
        <button onclick="window.location.href='/'">Volver</button>
      </body>
      </html>
    `;

    res.send(html);
  });
});

// Ruta para mostrar la vista de pacientes
app.get('/vista', requireLogin, requireRole(['tecnico','admin']),(_req, res) => {
  connection.query('SELECT * FROM vista_pacientes', (err, results) => {
    if (err) {
      return res.send('Error al obtener los datos.');
    }

    let html = `
      <html>
      <head>
        <link rel="stylesheet" href="/styles.css">
        <title>Pacientes</title>
      </head>
      <body>
        <h1>Pacientes Registrados</h1>
        <table>
          <thead>
            <tr>
              <th>Nombre</th>
              <th>Apellido</th>
              <th>Tipo de protesis</th>
              <th>Fecha de revisión</th>
              <th>Estado de la protesis</th>
              <th>Observaciones</th>
            </tr>
          </thead>
          <tbody>
    `;

    results.forEach(paciente => {
      html += `
        <tr>
          <td>${paciente.nombre}</td>
          <td>${paciente.apellido}</td>
          <td>${paciente.tipo}</td>
          <td>${paciente.fecha}</td>
          <td>${paciente.estado}</td>
          <td>${paciente.observaciones}</td>
        </tr>
      `;
    });

    html += `
          </tbody>
        </table>
        <button onclick="window.location.href='/'">Volver</button>
      </body>
      </html>
    `;

    res.send(html);
  });
});

// Ruta para mostrar las revisiones mayores al promedio
app.get('/mayor-promedio', requireLogin, requireRole(['tecnico','admin']),(_req, res) => {
  connection.query('SELECT protesis.id, protesis.tipo, revisiones.puntaje AS puntaje, revisiones.fecha AS fecha_revision FROM protesis JOIN revisiones ON protesis.id = revisiones.id_protesis WHERE puntaje > (SELECT AVG(puntaje) FROM revisiones)', (err, results) => {
    if (err) {
      return res.send('Error al obtener los datos.');
    }

    let html = `
      <html>
      <head>
        <link rel="stylesheet" href="/styles.css">
        <title>Mayor promedio</title>
      </head>
      <body>
        <h1>Protesis con puntaje mayor al promedio</h1>
        <table>
          <thead>
            <tr>
              <th>Id</th>
              <th>Tipo</th>
              <th>Puntaje</th>
              <th>Fecha</th>
            </tr>
          </thead>
          <tbody>
    `;

    results.forEach(protesis => {
      html += `
        <tr>
          <td>${protesis.id}</td>
          <td>${protesis.tipo}</td>
          <td>${protesis.puntaje}</td>
          <td>${protesis.fecha_revision}</td>
        </tr>
      `;
    });

    html += `
          </tbody>
        </table>
        <button onclick="window.location.href='/'">Volver</button>
      </body>
      </html>
    `;

    res.send(html);
  });
});

// Ruta para mostrar los datos de la base de datos en formato HTML
app.get('/prom-puntaje', requireLogin, requireRole(['tecnico','admin']),(_req, res) => {
  connection.query('SELECT AVG(puntaje) AS promedio_puntaje FROM revisiones', (err, results) => {
    if (err) {
      return res.send('Error al obtener los datos.');
    }

    let html = `
      <html>
      <head>
        <link rel="stylesheet" href="/styles.css">
        <title>Pacientes</title>
      </head>
      <body>
        <h1>Promedio del puntaje de revisiones</h1>
    `;

    results.forEach(revision => {
      html += `
          <h2>${revision.promedio_puntaje}</h2>
      `;
    });

    html += `
        <button onclick="window.location.href='/'">Volver</button>
      </body>
      </html>
    `;

    res.send(html);
  });
});

app.post('/actualizar-paciente', requireLogin, requireRole (['tecnico','admin']), (req, res) => {
  const {name, last_name, email, birthday, id } = req.body;
  const query = 'UPDATE pacientes SET nombre = ?, apellido = ?, email = ?, fecha_nacimiento = ? WHERE id = ?';
  connection.query(query, [name, last_name, email, birthday, id], (err, result) => {
    if (err) {
      return res.send('<h1>Error al guardar al paciente en la base de datos</h1><a href="/">Volver</a>');
    }
    res.send('<h1>Paciente guardado en la base de datos</h1><a href="/">Volver</a>');
  });
});

// Ruta para mostrar los datos de la base de datos en formato HTML
app.get('/protesis', requireLogin, requireRole(['tecnico','admin']),(_req, res) => {
  connection.query('SELECT protesis.id, protesis.tipo, protesis.fabricante, protesis.fecha_asignacion, pacientes.nombre AS nombre_paciente, pacientes.apellido AS apellido_paciente, pacientes.email AS email, pacientes.fecha_registro AS fecha_registro FROM protesis JOIN pacientes ON protesis.id_paciente = pacientes.id', (err, results) => {
    if (err) {
      return res.send('Error al obtener los datos.');
    }

    let html = `
      <html>
      <head>
        <link rel="stylesheet" href="/styles.css">
        <title>Pacientes</title>
      </head>
      <body>
        <h1>Protesis Registrados</h1>
        <table>
          <thead>
            <tr>
              <th>id</th>
              <th>Tipo</th>
              <th>Fabricante</th>
              <th>Fecha de asignación</th>
              <th>Nombre del paciente</th>
              <th>Apellido del paciente</th>
              <th>Email</th>
              <th>Fecha de registro</th>
            </tr>
          </thead>
          <tbody>
    `;

    results.forEach(protesis => {
      html += `
        <tr>
          <td>${protesis.id}</td>
          <td>${protesis.tipo}</td>
          <td>${protesis.fabricante}</td>
          <td>${protesis.fecha_asignacion}</td>
          <td>${protesis.nombre_paciente}</td>
          <td>${protesis.apellido_paciente}</td>
          <td>${protesis.email}</td>
          <td>${protesis.fecha_registro}</td>
        </tr>
      `;
    });

    html += `
          </tbody>
        </table>
        <button onclick="window.location.href='/'">Volver</button>
      </body>
      </html>
    `;

    res.send(html);
  });
});


app.post('/eliminar-paciente', requireLogin, requireRole (['tecnico','admin']), (req, res) => {
  const {id } = req.body;
  const query = 'DELETE FROM pacientes WHERE id = ?';
  connection.query(query, [id], (err, result) => {
    if (err) {
      return res.send('<h1>Error al guardar al paciente en la base de datos</h1><a href="/">Volver</a>');
    }
    res.send('<h1>Paciente eliminado de la base de datos</h1><a href="/">Volver</a>');
  });
});

// Ruta para buscar pacientes según filtros
app.get('/buscar-pacientes',requireLogin,requireRole(['tecnico','admin']), (req, res) => {
  const { name_search, age_search } = req.query;
  let query = 'SELECT * FROM pacientes WHERE 1=1';

  if (name_search) {
    query += ` AND nombre LIKE '%${name_search}%'`;
  }
  if (age_search) {
    query += ` AND edad = ${age_search}`;
  }

  connection.query(query, (err, results) => {
    if (err) {
      return res.send('Error al obtener los datos.');
    }

    let html = `
      <html>
      <head>
        <link rel="stylesheet" href="/styles.css">
        <title>Resultados de Búsqueda</title>
      </head>
      <body>
        <h1>Resultados de Búsqueda</h1>
        <table>
          <thead>
            <tr>
              <th>id</th>
              <th>Nombre</th>
              <th>Edad</th>
              <th>Frecuencia Cardiaca (bpm)</th>
            </tr>
          </thead>
          <tbody>
    `;

    results.forEach(paciente => {
      html += `
        <tr>
          <td>${paciente.id}</td>
          <td>${paciente.nombre}</td>
          <td>${paciente.edad}</td>
          <td>${paciente.frecuencia_cardiaca}</td>
        </tr>
      `;
    });

    html += `
          </tbody>
        </table>
        <button onclick="window.location.href='/'">Volver</button>
      </body>
      </html>
    `;

    res.send(html);
  });
});

// Ruta para ordenar protesis por numero de revisiones
app.get('/numero-revisiones',requireLogin,requireRole(['tecnico','admin']), (req, res) => {
  const query = 'SELECT protesis.id, protesis.tipo, protesis.fabricante, COUNT(revisiones.id) AS total_revisiones FROM protesis JOIN revisiones ON protesis.id = revisiones.id_protesis GROUP BY protesis.id ORDER BY total_revisiones DESC';

  connection.query(query, (err, results) => {
    if (err) {
      return res.send('Error al obtener los datos.');
    }

    let html = `
      <html>
      <head>
        <link rel="stylesheet" href="/styles.css">
        <title>Numero de revisiones</title>
      </head>
      <body>
        <h1>Protesis Ordenadas por Número de Revisiones</h1>
        <table>
          <thead>
            <tr>
              <th>Id</th>
              <th>Tipo</th>
              <th>Fabricante</th>
              <th>Total de Revisiones</th>
            </tr>
          </thead>
          <tbody>
    `;

    results.forEach(protesis => {
      html += `
        <tr>
          <td>${protesis.id}</td>
          <td>${protesis.tipo}</td>
          <td>${protesis.fabricante}</td>
          <td>${protesis.total_revisiones}</td>
        </tr>
      `;
    });

    html += `
          </tbody>
        </table>
        <button onclick="window.location.href='/'">Volver</button>
      </body>
      </html>
    `;

    res.send(html);
  });
});

// Ruta para ver protesis en un estado
app.get('/estado',requireLogin,requireRole(['tecnico','admin']), (req, res) => {
  const { estado } = req.query;
  let query = 'SELECT protesis.id, protesis.tipo, protesis.fabricante, revisiones.fecha, revisiones.estado FROM protesis JOIN revisiones ON protesis.id = revisiones.id_protesis WHERE 1=1';
  
  if (estado) {
    query += ` AND revisiones.estado LIKE '%${estado}%'`;
  }
  
  connection.query(query, (err, results) => {
    if (err) {
      return res.send('Error al obtener los datos.');
    }
  
    let html = `
      <html>
      <head>
        <link rel="stylesheet" href="/styles.css">
        <title>Estado</title>
      </head>
      <body>
        <h1>Protesis Ordenadas por Estado</h1>
        <table>
          <thead>
            <tr>
              <th>Id</th>
              <th>Tipo</th>
              <th>Fabricante</th>
              <th>Total de Revisiones</th>
            </tr>
          </thead>
          <tbody>
    `;

    results.forEach(protesis => {
      html += `
        <tr>
          <td>${protesis.id}</td>
          <td>${protesis.tipo}</td>
          <td>${protesis.fabricante}</td>
          <td>${protesis.fecha}</td>
        </tr>
      `;
    });

    html += `
          </tbody>
        </table>
        <button onclick="window.location.href='/'">Volver</button>
      </body>
      </html>
    `;

    res.send(html);
  });
});

// Ruta para asignar  una prótesis a un paciente 
app.post('/asignar-protesis',requireLogin,requireRole(['tecnico','admin']), (req, res) => {
  const { tipo, fabricante, fecha_asignacion, id_paciente  } = req.body;
  const query = 'INSERT INTO protesis (tipo, fabricante, fecha_asignacion, id_paciente) VALUES (?, ?, ?, ?)';

  connection.query(query, [tipo, fabricante, fecha_asignacion, id_paciente], (err, result) => {
    if (err) {
      return res.send('<h1>Error al asignar la prótesis</h1><a href="/">Volver</a>');
    }
    res.send('<h1>Prótesis asignada al paciente exitosamente</h1><a href="/">Volver</a>');
  });
});

//Ruta para eliminar una prótesis
app.post('/eliminar-protesis', requireLogin, requireRole (['tecnico','admin']), (req, res) => {
  const {id } = req.body;
  const query = 'DELETE FROM protesis WHERE id = ?';
  connection.query(query, [id], (err, result) => {
    if (err) {
      return res.send('<h1>Error al eliminar la prótesis</h1><a href="/">Volver</a>');
    }
    res.send('<h1>Prótesis eliminada exitosamente</h1><a href="/">Volver</a>');
  });
});


// Ruta para registrar revisión de una prótesis 
app.post('/registrar-revision',requireLogin,requireRole(['tecnico','admin']), (req, res) => {
  const {id_protesis, fecha, estado, observaciones, puntaje} = req.body;
  const query = 'INSERT INTO revisiones (id_protesis, fecha, estado, observaciones, puntaje) VALUES (?, ?, ?, ?,?)';

  connection.query(query, [id_protesis, fecha, estado, observaciones, puntaje], (err, result) => {
    if (err) {
      console.log(err)
      return res.send('<h1>Error al registrar la revisión</h1><a href="/">Volver</a>');
    }
    res.send('<h1>Revisión registrada exitosamente</h1><a href="/">Volver</a>');
  });
});

// Ruta para ver historial de una prótesis
app.get('/historial',requireLogin,requireRole(['tecnico','admin']), (req, res) => {
  const { id_protesis } = req.query;
  let query = 'SELECT id,fecha,estado,observaciones,puntaje FROM revisiones WHERE 1=1';
  
  if (id_protesis) {
    query += ` AND revisiones.id_protesis LIKE '%${id_protesis}%'`;
  }
  
  connection.query(query, (err, results) => {
    if (err) {
      return res.send('<h1>Error al registrar la revisión</h1><a href="/">Volver</a>');
    }
  
    let html = `
      <html>
      <head>
        <link rel="stylesheet" href="/styles.css">
        <title>Historial de revisiones</title>
      </head>
      <body>
        <h1>Historial de revisiones de prótesis</h1>
        <table>
          <thead>
            <tr>
              <th>Id</th>
              <th>Fecha</th>
              <th>Estado</th>
              <th>Observaciones</th>
              <th>Puntaje</th>
            </tr>
          </thead>
          <tbody>
    `;

    results.forEach(protesis => {
      html += `
        <tr>
          <td>${protesis.id}</td>
          <td>${protesis.fecha}</td>
          <td>${protesis.estado}</td>
          <td>${protesis.observaciones}</td>
          <td>${protesis.puntaje}</td>
        </tr>
      `;
    });

    html += `
          </tbody>
        </table>
        <button onclick="window.location.href='/'">Volver</button>
      </body>
      </html>
    `;

    res.send(html);
  });
});

// Ruta para ver historial de una prótesis
app.get('/historial-total',requireLogin,requireRole(['tecnico','admin']), (req, res) => {
  let query = 'SELECT * FROM revisiones';
  connection.query(query, (err, results) => {
    if (err) {
      return res.send('<h1>Error al registrar la revisión</h1><a href="/">Volver</a>');
    }
  
    let html = `
      <html>
      <head>
        <link rel="stylesheet" href="/styles.css">
        <title>Historial de revisiones</title>
      </head>
      <body>
        <h1>Historial de revisiones de prótesis</h1>
        <table>
          <thead>
            <tr>
              <th>Id</th>
              <th>Fecha</th>
              <th>Estado</th>
              <th>Observaciones</th>
              <th>Puntaje</th>
            </tr>
          </thead>
          <tbody>
    `;

    results.forEach(protesis => {
      html += `
        <tr>
          <td>${protesis.id}</td>
          <td>${protesis.fecha}</td>
          <td>${protesis.estado}</td>
          <td>${protesis.observaciones}</td>
          <td>${protesis.puntaje}</td>
        </tr>
      `;
    });

    html += `
          </tbody>
        </table>
        <button onclick="window.location.href='/'">Volver</button>
      </body>
      </html>
    `;

    res.send(html);
  });
});

// Iniciar el servidor
app.listen(3000, () => {
  console.log('Servidor corriendo en http://localhost:3000');
});