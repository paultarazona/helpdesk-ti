# Plan de Proyecto: Mesa de Ayuda de TI — v1 Insegura vs v2 SecDevOps

**Curso:** Ciberseguridad
**Objetivo:** Sistema de mesa de ayuda de TI construido en dos versiones (v1 sin prácticas de seguridad, v2 con SecDevOps) para demostrar y remediar un conjunto amplio de vulnerabilidades, probables desde Kali Linux.
**Criterio del docente:** valora el sistema más completo; se probará atacando desde Kali contra el sistema corriendo localmente.

---

## 1. Dominio y alcance funcional

**Sistema:** Mesa de Ayuda de TI (IT Helpdesk) con dos entidades relacionadas.

### Entidades
```
users     — cuentas del sistema (roles: user, agent, admin)
assets    — activos de TI (servidor, laptop, switch, router, impresora)
tickets   — solicitudes de soporte, opcionalmente asociadas a un asset
comments  — comentarios en un ticket (habilita XSS almacenado natural)
```

### Funcionalidad núcleo (idéntica en v1 y v2)
- **Auth:** registro, login, logout, roles
- **Tickets (CRUD):** crear, listar, ver detalle, editar, cerrar/eliminar; filtro por estado/prioridad; buscador
- **Assets (CRUD):** inventario de equipos; buscador por nombre/IP
- **Comentarios:** agregar comentarios a un ticket (se renderizan a otros usuarios)
- **Upload:** adjuntar archivo a un ticket (screenshot del error, log)
- **Diagnóstico de red:** herramienta que hace ping / health-check a un asset (justifica command injection y SSRF de forma realista)

---

## 2. Stack técnico

| Componente | Elección | Razón |
|---|---|---|
| Backend | Node.js + Express | Ecosistema de seguridad maduro; tooling del pipeline nativo |
| Vistas | EJS (server-side rendering) | XSS y CSRF se demuestran de forma natural con HTML renderizado en servidor + formularios reales |
| DB | **PostgreSQL** (driver `pg` en v1, Knex en v2) | Habilita SQLi rico y realista (stacked queries, time-based con `pg_sleep`, error-based); es lo que usa un sistema de TI real; sqlmap rinde mucho mejor contra Postgres |
| Orquestación | **Docker Compose** (app + postgres) | El repo queda autocontenido: `docker compose up` levanta app + BD sin instalar nada. No se pierde portabilidad al dejar SQLite |
| Auth | JWT en cookie + roles | Cookie habilita demostración de CSRF (imposible con JWT solo en header) |
| Contenedores | Docker | Paridad de entorno + escaneo de imagen |
| CI/CD | GitHub Actions | Pipeline SecDevOps |
| SAST | Semgrep | |
| SCA | npm audit + Trivy | |
| Secret scanning | gitleaks | |
| DAST | OWASP ZAP baseline | Ahora con superficie HTML real que escanear |

**Nota:** mantener una dependencia con CVE conocido en v1 (ej. `jsonwebtoken@8.5.1`, CVE-2022-23529) y actualizarla en v2, para evidencia de SCA. El agente debe verificar el CVE vigente con `npm audit` al construir.

**Nota sobre v1 y SQLi con Postgres:** el driver `pg` usa placeholders parametrizados (`$1, $2`) de forma natural. Para que la SQLi exista en v1 hay que **concatenar strings explícitamente** en las queries (`` `SELECT ... WHERE x='${input}'` ``) en vez de usar placeholders. En v2 se usan queries parametrizadas o Knex. El contraste es el mismo que con SQLite; solo cambia el motor.

---

## 3. Catálogo de vulnerabilidades (v1) y mitigaciones (v2)

Objetivo: cobertura amplia tipo DVWA (14 vulnerabilidades). Cada una debe ser **explotable de verdad** desde Kali (sqlmap, Burp Suite, nmap, nikto, navegador) y tener su mitigación correspondiente en v2.

| # | Vulnerabilidad | OWASP / CWE | Dónde vive en el sistema | Mitigación v2 |
|---|---|---|---|---|
| 1 | SQL Injection (ver §3.1 para subtipos) | A03 / CWE-89 | Login; buscador de tickets/assets; filtro por estado (query concatenada) | Prepared statements; validación Zod |
| 2 | XSS Almacenado | A03 / CWE-79 | Comentarios y descripción de ticket (se renderizan sin escapar) | Auto-escape de EJS + sanitización (DOMPurify server-side) + CSP |
| 3 | XSS Reflejado | A03 / CWE-79 | Mensaje de búsqueda ("no se encontró: X") reflejado sin escapar | Escape de salida + CSP |
| 4 | Broken Access Control (IDOR) | A01 / CWE-639 | Ver/editar ticket o asset de otro usuario cambiando el id | Middleware de ownership; mismo 404 genérico |
| 5 | CSRF | A01 / CWE-352 | Cambio de estado / borrado de ticket vía formulario sin token | Tokens CSRF (csurf o doble-submit) + SameSite cookies |
| 6 | Upload inseguro | A05 / CWE-434 | Adjunto de ticket: sin whitelist, nombre original, path traversal | Whitelist MIME por contenido, límite tamaño, nombre UUID, fuera de webroot |
| 7 | Command Injection | A03 / CWE-78 | Herramienta "ping al asset": IP concatenada a `exec()` | Sin shell; `execFile` con args validados; validar IP |
| 8 | SSRF | A10 / CWE-918 | "Health-check de servicio": el server hace fetch a URL provista por el usuario | Allowlist de destinos; bloquear IPs internas/metadata |
| 9 | Autenticación débil | A07 / CWE-307 | Sin rate limit en login; política de password inexistente | Rate limiting; política de complejidad; bloqueo temporal |
| 10 | Password en texto plano | A02 / CWE-256 | Registro guarda password sin hash | bcrypt (12 rounds) |
| 11 | JWT inseguro | A02 / CWE-798 | Secreto hardcodeado, sin expiración, algoritmo no fijado | Secreto desde env, expiración corta, HS256 fijado, refresh rotation |
| 12 | Security Misconfiguration | A05 / CWE-209 | CORS `*`, sin Helmet, stack traces expuestos, debug on | Helmet, CORS restringido, error handler genérico, logs server-side |
| 13 | Secretos hardcodeados | A02 / CWE-798 | Credenciales/secretos en el código fuente | `.env` + dotenv, `.env.example`, gitleaks en CI |
| 14 | Broken Access Control por rol | A01 / CWE-285 | Endpoints admin accesibles por usuarios normales (falta verificación de rol) | Middleware de autorización por rol (RBAC) |

> Ampliable a futuro (open redirect CWE-601, XXE CWE-611, insecure deserialization CWE-502) si quieres pasar de 14. La arquitectura modular (sección 5) lo permite sin reorganizar.

### 3.1 Subtipos de SQL Injection a demostrar (habilitados por PostgreSQL)

VULN-001 no es un solo ataque: PostgreSQL permite demostrar varios subtipos, cada uno en un punto distinto del sistema. Esto enriquece mucho la sección de SQLi del informe.

| Subtipo | Cómo se demuestra | Punto del sistema |
|---|---|---|
| **Boolean-based blind** | `' OR '1'='1` que hace el WHERE siempre verdadero | Login |
| **UNION-based** | `UNION SELECT username, password_hash FROM users` para extraer credenciales de otra tabla | Buscador de tickets/assets |
| **Error-based** | Provocar error de Postgres que revela datos en el mensaje (v1 filtra stack traces, VULN-012) | Filtro por estado/prioridad |
| **Time-based blind** | `'; SELECT pg_sleep(5)--` para inferir por tiempo de respuesta | Buscador (cuando no hay salida visible) |
| **Stacked queries** | `'; UPDATE users SET role='admin'...--` (Postgres permite múltiples statements; SQLite no) | Cualquier campo concatenado que ejecute con un driver que permita multi-statement |

**Mitigación en v2 (cubre todos los subtipos):** queries parametrizadas / Knex (los placeholders separan datos de código, así ningún subtipo funciona) + validación de input con Zod + el error handler genérico de v2 elimina el canal error-based.

### 3.2 Ejes de prueba (para el informe y la demo con Kali)

Cada vulnerabilidad (empezando por SQLi) se prueba desde cuatro ángulos, que conviene documentar por separado:

| Eje | Qué es | Herramienta |
|---|---|---|
| **Manual** | Payloads construidos a mano | Burp Suite, navegador, curl |
| **Automatizado** | Explotación automática | sqlmap (SQLi), Hydra (fuerza bruta) |
| **Estático (SAST)** | Detección leyendo el código sin ejecutarlo | Semgrep en el pipeline detecta la query concatenada de v1 |
| **Dinámico (DAST)** | Detección atacando la app corriendo | OWASP ZAP / sqlmap contra el contenedor |

El contraste ideal para el informe: mostrar que en v1 los cuatro ejes detectan/explotan la vulnerabilidad, y en v2 los cuatro fallan (SAST limpio, DAST sin hallazgos, sqlmap no encuentra inyección, payload manual rechazado).

---

## 4. Superficie de ataque para Kali (mapa de pruebas)

Para el informe y la demo, cada vulnerabilidad con su herramienta sugerida:

| Vulnerabilidad | Herramienta Kali | Vector concreto |
|---|---|---|
| SQLi (boolean/UNION/error/time/stacked) | sqlmap (`--dbms=postgresql`) | `POST /login`, `GET /tickets?search=`, `GET /tickets?status=` |
| XSS almacenado | navegador / Burp | payload en comentario de ticket |
| XSS reflejado | navegador / Burp | `GET /search?q=<script>` |
| IDOR | Burp Repeater | `GET /tickets/:id` con id ajeno |
| CSRF | HTML PoC / Burp | formulario externo que borra un ticket |
| Upload | navegador / Burp | subir `.php`/`.js`, nombre `../../x` |
| Command injection | Burp / curl | campo IP: `8.8.8.8; cat /etc/passwd` |
| SSRF | Burp / curl | URL: `http://169.254.169.254/` o `http://localhost:...` |
| Auth débil | Hydra | fuerza bruta al login sin rate limit |
| Misconfig | nikto / curl -I | headers ausentes, stack traces |
| RBAC | Burp | usuario normal accede a `/admin/*` |

---

## 5. Arquitectura escalable (modular por feature)

Organización **por módulo de dominio**, no por tipo de archivo, para que agregar vulnerabilidades/módulos a futuro sea aislado.

### v2-seguro (arquitectura por capas dentro de cada módulo)
```
v2-seguro/src/
  config/          (env, cors, helmet, csrf)
  db/              (connection, schema, seed, migrations)
  core/
    middleware/    (auth, authorize, rbac, errorHandler, rateLimiter, validate, csrf)
    errors/        (AppError)
    views/         (layouts, partials EJS)
  modules/
    auth/          (routes, controller, service, validators, repository)
    tickets/       (routes, controller, service, validators, repository)
    assets/        (routes, controller, service, validators, repository)
    comments/      (routes, controller, service, validators)
    diagnostics/   (routes, controller, service — ping/health-check seguros)
  app.js
  server.js
```

### v1-inseguro (modular por feature, pero SIN capas de seguridad — a propósito)
```
v1-inseguro/src/
  config.js        (secretos hardcodeados)
  db/              (connection, schema, seed)
  core/middleware/ (auth JWT inseguro)
  modules/
    auth/          (SQLi, password plano, JWT inseguro — lógica junta)
    tickets/       (SQLi, IDOR, XSS almacenado — lógica junta)
    assets/        (SQLi, IDOR)
    comments/      (XSS almacenado)
    diagnostics/   (command injection, SSRF)
  views/           (EJS sin escapar — habilita XSS)
  app.js           (CORS *, sin helmet, error handler que filtra stack)
  server.js
```

### Convención para catalogar vulnerabilidades (escalabilidad)
Marcador uniforme en el código de v1:
```js
// [VULN-002][A03:XSS-Stored][CWE-79] Comentario renderizado sin escapar en la vista.
```
Más un índice central `v1-inseguro/VULNERABILITIES.md` (tabla: ID, nombre, OWASP, CWE, archivo, endpoint, cómo explotar). Agregar VULN-015 a futuro = nueva fila + marcador, sin tocar lo existente.

---

## 6. Frontend

**EJS server-side, mismo diseño en v1 y v2** (reutilizar el design system de `DESIGN.md` que ya existe — es bueno y neutral al dominio). Se ve como una mesa de ayuda de TI profesional.

Pantallas:
- Login / Registro
- Dashboard: lista de tickets (con estado/prioridad como badges), buscador, filtro
- Detalle de ticket: descripción, comentarios, adjuntos, asset relacionado
- Formulario crear/editar ticket
- Inventario de assets + detalle
- Herramienta de diagnóstico (ping / health-check)
- Panel admin (solo rol admin en v2; en v1 accesible por cualquiera = VULN-014)

**Sin panel de "lecciones/lab"** — las vulnerabilidades viven en el flujo natural de la app y se demuestran desde Kali, no desde la UI. El material educativo (`docs/challenges/`) se conserva como documentación del informe, fuera del producto.

---

## 7. Calidad, mantenibilidad y escalabilidad

Este eje refuerza el punto de la premisa del docente: *"arquitectura y buenas prácticas"*. La clave pedagógica: **v1 omite todo esto a propósito** (parte de lo que la hace "sin buenas prácticas"), **v2 lo implementa completo**. Así el contraste v1↔v2 no es solo de seguridad, también de calidad de ingeniería.

### 7.1 Tabla de contraste

| Aspecto | v1-inseguro (omitido a propósito) | v2-seguro (buena práctica) |
|---|---|---|
| **Migraciones de BD** | `schema.sql` suelto, cambios manuales | Knex migrations versionadas y reversibles |
| **Configuración** | Valores hardcodeados en el código | Variables de entorno por ambiente (dev/test/prod), `.env.example` completo |
| **Logging** | `console.log` disperso, o nada | Logging estructurado (Pino/Winston) con niveles; sirve como auditoría de seguridad |
| **Manejo de errores** | Try/catch inconsistente, stack traces al cliente | Handler centralizado, errores tipados (`AppError`), mensaje genérico al cliente |
| **Estándar de código** | Sin linter ni formato | ESLint + Prettier + convención de commits |
| **Testing** | Ninguno | Unit + integración + e2e; cobertura como métrica |
| **Documentación de API** | Ninguna | OpenAPI/Swagger (`/api-docs`) |
| **Paginación** | Listados devuelven todo | Paginación + límites en tickets/assets |
| **Health checks** | `/health` básico o ausente | `/health` (liveness) + `/ready` (readiness, verifica conexión a BD) |
| **Estructura** | Lógica junta por archivo | Modular por feature, capas separadas (§5) |

### 7.2 Migraciones (v2)

Con PostgreSQL, usar **Knex migrations** en vez de un `schema.sql` estático:
```
v2-seguro/migrations/
  001_create_users.js
  002_create_assets.js
  003_create_tickets.js
  004_create_comments.js
v2-seguro/seeds/
  dev_seed.js
```
Scripts: `npm run migrate`, `npm run migrate:rollback`, `npm run seed`. Esto hace el esquema versionable, reversible y reproducible — clave para mantenibilidad y para que el pipeline pueda levantar la BD de forma determinista.

### 7.3 Testing por capas (v2)

| Nivel | Qué prueba | Herramienta |
|---|---|---|
| Unit | Servicios/validadores en aislamiento | Node test runner / Jest |
| Integración | Repositorios contra Postgres real (service container) | + supertest |
| E2E | Flujos completos (login → crear ticket → comentar) | supertest contra la app levantada |

Incluir tests que verifiquen explícitamente que **las mitigaciones funcionan**: que un payload SQLi es rechazado, que IDOR devuelve 404, que un rol normal no accede a `/admin`. Estos tests son evidencia directa para el informe.

### 7.4 Observabilidad y operabilidad (v2)

- **Logging estructurado** (JSON) con `requestId` por petición; nunca loguear passwords/tokens/secretos.
- **Health/readiness** para que el orquestador (docker-compose/CI) sepa cuándo la app está lista.
- **Scripts npm** claros y documentados: `dev`, `start`, `test`, `test:coverage`, `lint`, `format`, `migrate`, `seed`.
- **README con diagrama de arquitectura** (componentes + capas) y tabla de variables de entorno.

### 7.5 Nota sobre escalabilidad de vulnerabilidades (ya cubierto en §5)

La arquitectura modular + marcadores `[VULN-XXX]` + `VULNERABILITIES.md` (sección 5) permiten agregar nuevas vulnerabilidades o módulos de negocio sin reorganizar el código existente. Este apartado (§7) complementa esa escalabilidad "de casos de estudio" con la escalabilidad y mantenibilidad "de software de producción" en v2.

---

## 8. Pipeline SecDevOps

Igual que el proyecto anterior (ya validado), con estas etapas en GitHub Actions:
1. Lint + tests unitarios (con **PostgreSQL como service container** en el runner para los tests que tocan BD)
2. SAST — Semgrep (reglas OWASP + Node; detecta las queries concatenadas de v1)
3. SCA — npm audit + Trivy (detecta el CVE de jsonwebtoken en v1)
4. Secret scanning — gitleaks (detecta secretos hardcodeados de v1)
5. Build de imagen Docker
6. Escaneo de imagen — Trivy
7. DAST — OWASP ZAP baseline (ahora con superficie HTML real; levantar la app con `docker compose up` — app + postgres — y correr ZAP contra v1 y v2 para contrastar hallazgos)

---

## 9. Informe técnico (ligero, en Markdown)

El docente valora el sistema por encima del informe. Mantener breve:
1. Contexto y objetivo (2-3 párrafos)
2. Tabla de vulnerabilidades encontradas en v1 (vulnerabilidad, OWASP/CWE, cómo se explotó desde Kali, evidencia breve)
3. Tabla de mitigaciones aplicadas en v2
4. Pipeline SecDevOps (qué detecta cada etapa)
5. Conclusión (1 párrafo)

Aprovechar `docs/challenges/*.md` (ya escritos) como insumo directo de las secciones 2-3.

---

## 10. Estructura del repositorio

```
/repo-raiz
  /v1-inseguro
    docker-compose.yml    (app v1 + postgres)
    Dockerfile
    VULNERABILITIES.md
  /v2-seguro
    docker-compose.yml    (app v2 + postgres)
    Dockerfile
  /docs
    /challenges     (material de referencia por vulnerabilidad, alimenta el informe)
  /informe
    informe-tecnico.md
  DESIGN.md         (design system, reutilizado)
  README.md         (propósito, cómo correr ambas, advertencia de uso local)
  .github/workflows/pipeline.yml
```

**Correr cada versión:** `cd v1-inseguro && docker compose up` levanta la app v1 + su PostgreSQL. Igual para v2. Cada versión tiene su propia BD aislada (distinto puerto/volumen) para no mezclar datos entre la insegura y la segura.

---

## 11. Plan de trabajo por hitos

1. Definir esquema de BD PostgreSQL (users/assets/tickets/comments) + `docker-compose.yml` (app + postgres) y seed con 2+ usuarios y datos de ambos (para IDOR)
2. Construir v1 completa y funcional con las 14 vulnerabilidades + marcadores + VULNERABILITIES.md
3. Probar cada vulnerabilidad desde Kali y recolectar evidencia
4. Construir v2: arquitectura modular por capas + las 14 mitigaciones
5. Configurar pipeline SecDevOps y ejecutarlo (contraste v1 vs v2)
6. Redactar informe ligero integrando evidencia
7. Revisión final (READMEs, .env.example, .gitignore, sin secretos reales versionados, advertencia de "solo uso local")

---

## 12. Instrucciones para el agente de código

- Construir **v1 completa y funcional primero**; las 14 vulnerabilidades deben ser reales y explotables desde Kali, cada una con su marcador `[VULN-XXX]` y entrada en `VULNERABILITIES.md`.
- Usar **EJS con renderizado server-side** y formularios HTML reales (no SPA solo-JSON), para que XSS/CSRF sean naturales y la superficie sea atacable desde Burp/navegador.
- **v2 NO es un parche de v1:** es refactor a arquitectura modular por capas (routes/controllers/services/repositories/validators + core/middleware).
- Mantener **paridad funcional total** entre v1 y v2 para comparación directa.
- Mantener `jsonwebtoken@8.5.1` en v1 y `^9.x` en v2 (evidencia SCA).
- **Base de datos PostgreSQL vía Docker Compose:** cada versión trae su `docker-compose.yml` (app + postgres) para que el repo sea autocontenido (`docker compose up`). En v1 las queries se concatenan a mano con el driver `pg` (para que exista la SQLi y sus subtipos: boolean, UNION, error, time-based con `pg_sleep`, stacked). En v2 se usan queries parametrizadas o Knex. Ajustar tipos del schema a Postgres y adaptar el seed al driver `pg`.
- **Pipeline:** agregar PostgreSQL como service container para los tests, y levantar la app con docker-compose para el DAST.
- **Advertencia de seguridad en el README raíz:** este sistema es deliberadamente vulnerable y debe ejecutarse SOLO en entorno local aislado, nunca desplegarse en red pública.
- Al terminar, entregar checklist confirmando que cada una de las 14 vulnerabilidades sigue explotable en v1 y mitigada en v2.
