# Bitácora de Vuelo – MVP (web app para iPhone)

Bitácora personal de vuelo basada en la **DAN 61, Apéndice D** (DGAC Chile, ED 2 Enm 5, jul-2025).
HTML + JavaScript sin dependencias. Los datos quedan **solo en el teléfono** (almacenamiento local del navegador).

## Qué incluye
- **Resumen:** horas (total, PIC, solo, instrucción, noche, travesía, IFR, SIC, simulador, aterrizajes).
- **Vigencias:** experiencia reciente (3 aterrizajes en 180 días para alumno/privado/planeador, 90 días otras licencias), experiencia nocturna (180 días, o cubierta por IFR), médico, licencia, estandarización cada 24 meses.
- **Progreso Piloto Privado – Avión:** 40 h (35 h en CIAC, máx. 5 h simulador), 20 h instrucción, 10 h solo, 5 h travesía solo, travesía de 150 NM.
- **Nuevo vuelo:** calcula el total con Hobbs o con horas, reparte el tiempo según la función y marca travesía si salida ≠ llegada.
- **Bitácora:** lista con búsqueda; **imprimir / PDF** en formato libro (14 vuelos por página, totales de página, anteriores y a la fecha, líneas de firma); **CSV** para Excel (separador `;`, decimales con coma).
- **Aeronaves**, **Perfil**, y **respaldo / restauración** en archivo JSON.

## Probar en el PC
```bash
python -m http.server 8765 --directory bitacora-app
```
Abrir http://localhost:8765

## Instalar en el iPhone
Para que funcione sin conexión, la app tiene que estar publicada en una dirección **https** (por ejemplo GitHub Pages o Netlify).
1. Abrir la dirección en **Safari**.
2. Compartir → **Agregar a pantalla de inicio**.
3. Abrirla desde el ícono: funciona sin conexión.

## Importante
- Haz **respaldos** periódicos (Perfil → Crear respaldo) y guárdalos en Archivos / iCloud Drive: si borras la app o los datos de Safari, se pierden los registros.
- Al modificar archivos de la app, sube la versión de `CACHE` en `sw.js` para que el iPhone descargue la actualización.
- Pendiente (siguiente versión): firma del instructor en pantalla con bloqueo del registro, certificaciones/autorizaciones, sugerencia automática de vuelo nocturno.
