-- Tablas de tallas (origen)
CREATE TABLE IF NOT EXISTS tablas_tallas (
  tabla_id TEXT PRIMARY KEY,
  origen TEXT NOT NULL,
  version TEXT NOT NULL,
  provisional BOOLEAN NOT NULL DEFAULT 1,
  filas JSON NOT NULL -- [{ talla, pecho_min, pecho_max, cintura_min, cintura_max }]
);

-- Catálogo de prendas
CREATE TABLE IF NOT EXISTS prendas (
  sku TEXT PRIMARY KEY,
  nombre TEXT NOT NULL,
  tipo TEXT NOT NULL,
  genero TEXT NOT NULL, -- 'hombre', 'mujer', 'unisex'
  tabla_origen_id TEXT NOT NULL,
  tallas_disponibles JSON NOT NULL, -- ["S", "M", "L", "XL"]
  asset_ar TEXT,
  activo BOOLEAN NOT NULL DEFAULT 1,
  FOREIGN KEY(tabla_origen_id) REFERENCES tablas_tallas(tabla_id)
);

-- Sesiones del kiosko (anónimas)
CREATE TABLE IF NOT EXISTS sesiones (
  session_id TEXT PRIMARY KEY,
  timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
  ubicacion_evento TEXT,
  dispositivo_id TEXT,
  talla_habitual TEXT, -- 'S', 'M', 'L', 'XL', etc.
  preferencia_fit TEXT, -- 'ajustado', 'regular', 'holgado'
  pecho_ar REAL,
  cintura_ar REAL,
  altura_ar REAL,
  ar_confianza REAL
);

-- Interacciones del usuario con prendas
DROP TABLE IF EXISTS interacciones;
CREATE TABLE IF NOT EXISTS interacciones (
  interaccion_id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  sku TEXT NOT NULL,
  accion TEXT NOT NULL, -- 'probo', 'favorito'
  talla_recomendada TEXT,
  talla_elegida TEXT,
  tabla_origen_id TEXT NOT NULL,
  timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(session_id) REFERENCES sesiones(session_id)
);

-- Índices útiles para reportes
CREATE INDEX IF NOT EXISTS idx_interacciones_sku ON interacciones(sku);
CREATE INDEX IF NOT EXISTS idx_interacciones_session ON interacciones(session_id);
CREATE INDEX IF NOT EXISTS idx_sesiones_timestamp ON sesiones(timestamp);

-- Datos semilla para tablas_tallas
INSERT OR IGNORE INTO tablas_tallas (tabla_id, origen, version, provisional, filas) VALUES 
('tt_eu_std_m', 'EU_Standard_Hombre', '1.0', 1, '[
  {"talla":"S", "pecho_min":88, "pecho_max":96, "cintura_min":73, "cintura_max":81},
  {"talla":"M", "pecho_min":96, "pecho_max":104, "cintura_min":81, "cintura_max":89},
  {"talla":"L", "pecho_min":104, "pecho_max":112, "cintura_min":89, "cintura_max":97},
  {"talla":"XL", "pecho_min":112, "pecho_max":124, "cintura_min":97, "cintura_max":109}
]'),
('tt_eu_std_w', 'EU_Standard_Mujer', '1.0', 1, '[
  {"talla":"XS", "pecho_min":76, "pecho_max":82, "cintura_min":58, "cintura_max":64},
  {"talla":"S", "pecho_min":82, "pecho_max":90, "cintura_min":64, "cintura_max":72},
  {"talla":"M", "pecho_min":90, "pecho_max":98, "cintura_min":72, "cintura_max":80},
  {"talla":"L", "pecho_min":98, "pecho_max":107, "cintura_min":80, "cintura_max":89},
  {"talla":"XL", "pecho_min":107, "pecho_max":119, "cintura_min":89, "cintura_max":101}
]');

-- Datos semilla para prendas (basado en catálogo genérico para prueba)
INSERT OR IGNORE INTO prendas (sku, nombre, tipo, genero, tabla_origen_id, tallas_disponibles, activo) VALUES
('sku-001', 'Camiseta Básica Logo', 't-shirt', 'unisex', 'tt_eu_std_m', '["S", "M", "L", "XL"]', 1),
('sku-002', 'Chaqueta Deportiva', 'jacket', 'hombre', 'tt_eu_std_m', '["M", "L", "XL"]', 1),
('sku-003', 'Top Deportivo', 'top', 'mujer', 'tt_eu_std_w', '["XS", "S", "M", "L"]', 1);

-- Sesiones en vivo (decart/lucy2-vton)
CREATE TABLE IF NOT EXISTS live_sesiones (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT NOT NULL,
  sku TEXT NOT NULL,
  event TEXT NOT NULL,
  started_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  seconds INTEGER DEFAULT 15 -- Pessimistic default (LIVE_SESSION_SECONDS)
);

CREATE INDEX IF NOT EXISTS idx_live_sesiones_session ON live_sesiones(session_id);
CREATE INDEX IF NOT EXISTS idx_live_sesiones_started_at ON live_sesiones(started_at);
