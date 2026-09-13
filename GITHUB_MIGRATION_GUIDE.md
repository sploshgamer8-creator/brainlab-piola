# Guía de Migración y Respaldo entre Sesiones de AI Studio con Repositorio Privado de GitHub

Esta guía detalla el procedimiento seguro para compartir checkpoints de nanoGPT, la base de datos relacional SQLite (`local_brain_registry.sqlite`) y las credenciales sin exponer secretos públicamente.

---

## 🔒 1. Principio de Seguridad: Cero Secretos en Repositorios Públicos

- **NUNCA** subas tus API Keys (`GEMINI_API_KEY`, tokens personales) directamente a repositorios públicos de GitHub.
- Usa **exclusivamente un repositorio privado** de GitHub para migrar tus estados entre sesiones de Google AI Studio.
- Utiliza variables de entorno o GitHub Secrets para la configuración sensible.

---

## 📦 2. ¿Qué se migra entre sesiones de AI Studio?

1. **Checkpoints nanoGPT (`.brain.json` y `.safetensors`)**:
   - Contienen la topología y las matrices de pesos Float32 resultantes del entrenamiento analítico.
2. **Registro Relacional SQLite (`local_brain_registry.sqlite`)**:
   - Administrado por el backend relacional del laboratorio en `/api/packaging/queue`.
   - Contiene el historial de encolado, estado de los artefactos empaquetados y catálogo de nodos de distribución.
3. **Datasets y Memoria Contextual**:
   - Se exportan como paquetes `.brain` unificados desde la pestaña **Exportar & Runner**.

---

## 🚀 3. Flujo Paso a Paso para Migrar tu Proyecto

### Paso A: Preparar tu repositorio privado en GitHub
### Paso A: Repositorio en GitHub
Tu repositorio configurado es:
`https://github.com/mistificacionlondres-cmd/brainlab.git`

### Paso B: Exportar la base SQLite y los Checkpoints desde AI Studio
1. En la pestaña **Exportar & Runner** de Local Brain Lab:
   - Haz clic en **"Exportar SQLite"** para descargar `local_brain_registry.sqlite`.
   - Haz clic en **"Descargar .safetensors"** o **"Exportar .brain"** para guardar tus pesos entrenados.
2. O bien, si descargas el proyecto como ZIP desde el menú superior de AI Studio (**Settings / Export** -> **Download ZIP**):
   - Descomprime el contenido en tu máquina local.

### Paso C: Enlazar tu repositorio Git Privado localmente
En tu terminal:

```bash
# Inicializar o clonar en tu repositorio
git init
git remote add origin https://github.com/mistificacionlondres-cmd/brainlab.git
# o mediante SSH:
# git remote add origin git@github.com:mistificacionlondres-cmd/brainlab.git

# Copiar el archivo .env.example a .env para tus credenciales
cp .env.example .env
# Agrega tu GEMINI_API_KEY en .env (este archivo está protegido e ignorado en .gitignore)

# Añadir archivos y hacer commit inicial
git add .
git commit -m "feat: inicializar Local Brain Lab con nanoGPT y backend SQLite"
git branch -M main
git push -u origin main
```

### Paso D: Reanudar en una nueva sesión de Google AI Studio
1. En la nueva sesión de AI Studio o máquina local, clona tu repositorio privado:
   ```bash
   git clone https://github.com/mistificacionlondres-cmd/brainlab.git
   cd brainlab
   npm install
   ```
2. Configura tu `GEMINI_API_KEY` en el menú **Settings** de AI Studio (o en `.env` en local).
3. Inicia la aplicación:
   ```bash
   npm run dev
   ```
4. El backend cargará automáticamente `local_brain_registry.sqlite` y tendrás disponible la cola de empaquetado y todos tus cerebros anteriores.

---

## 🧮 4. ¿Se pueden almacenar los paquetes de 100M de parámetros en este repositorio?

**Sí, pero con una consideración clave de tamaño:**

- Un modelo nanoGPT de **100 millones de parámetros**:
  - En precisión **Float32**: $100{,}000{,}000 \times 4\text{ bytes} \approx 400\text{ MB}$.
  - En precisión **Float16 / BFloat16**: $100{,}000{,}000 \times 2\text{ bytes} \approx 200\text{ MB}$.
- **Límite estándar de GitHub:** GitHub bloquea cualquier archivo individual superior a **100 MB** en commits regulares (`git push` fallaría si se sube como archivo git normal).

### Las 2 soluciones preparadas en este proyecto:

1. **Git LFS (Large File Storage)**:
   - Ya se ha creado el archivo `.gitattributes` en la raíz del proyecto para interceptar automáticamente `.safetensors`, `.brain`, `.bin` y `.sqlite`.
   - Para activarlo en tu máquina local:
     ```bash
     git lfs install
     git lfs track "*.safetensors"
     git lfs track "*.brain.json"
     ```

2. **GitHub Releases (Recomendado para Modelos Grandes)**:
   - Los paquetes de 100M generados por la **Fila de Empaquetado** pueden adjuntarse a los **Releases / Tags** de tu repositorio `mistificacionlondres-cmd/brainlab`.
   - Cada Release de GitHub admite binarios de hasta **2 GB** por archivo sin agotar la cuota de ancho de banda de Git LFS.

