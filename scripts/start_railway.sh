[INFO] Actualizando start_railway.sh para ejecutar la migraci¢n.
#!/usr/bin/env bash
set -e

:: 1?? Levantar llama-server en background
./bin/llama-server &

:: 2?? Esperar a que el servidor arranque
sleep 2

:: 3?? Ejecutar la migraci¢n (crea tabla proyectos
psql $POSTGRES_URL -f scripts/migrations/001_create_proyectos.sql

:: 4?? Iniciar la aplicaci¢n Node/Express
npm run start:railway
