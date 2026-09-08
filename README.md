# 🏛️ Plataforma Kleos - Sistema de Producción para Google Sheets & Looker Studio

Plataforma web moderna y responsiva inspirada en la gloria atlética griega clásica (*Kleos*), conectada en tiempo real mediante **Google Apps Script Web App** hacia tu archivo de **Google Sheets** bajo reglas estrictas de producción.

---

## 🎯 Reglas de Producción Implementadas

### 1. Pestañas Activas y Fila Inferior Libre
- **`Wellness`**: Registros matutinos con 10 columnas exactas y métricas normalizadas ("a mayor número, mejor estado"):
  | Columna | Campo | Lógica / Inversión Matemática |
  | :---: | :--- | :--- |
  | **A** | **Marca temporal** | Fecha y hora exacta del envío. |
  | **B** | **Calidad del Sueño** | Escala 1 a 5 (5 = Óptima, 1 = Pésima). |
  | **C** | **Nivel de Energía** | **`11 - fatiga_ingresada`** (de fatiga 1-10: 10 energía = fresco, 1 = exhausto). |
  | **D** | **Dolor Muscular** | Escala 1 a 5 (5 = Sin dolor / Óptimo, 1 = Dolor severo). |
  | **E** | **Nivel de Estrés** | **`6 - estrés_ingresado`** (de estrés 1-5: 5 = sin estrés, 1 = extremo). |
  | **F** | **Estado de Ánimo** | Escala 1 a 5 (5 = Excelente / Motivado, 1 = Muy bajo). |
  | **G** | **Horas de Sueño** | Horas reales de descanso (ej. 7.5, 8.0). |
  | **H** | **Nombre del Atleta** | Atleta seleccionado. |
  | **I** | **Fecha** | Fecha del registro (`YYYY-MM-DD`). |
  | **J** | **Wellness Score** | **Cálculo automático: `B + C + D + E + F`** (Rango 5 a 30 pts). |
- **`Registro_Diario`**: Registros del entrenamiento (fuerza, halterofilia, metcon o cardio).
- **Garantía de Inserción Precisa (Sin `appendRow` ni saltos por fórmulas)**:
  El script no utiliza `appendRow()` ni `getLastRow()` para ubicar la fila. En su lugar, ejecuta `getFirstEmptyRowByColumnA()`, que busca la primera celda vacía **únicamente en la Columna A (Atleta / Marca temporal)**. Escribe en esa fila exacta usando `getRange()` y `setValue()`, lo que:
  1. **Preserva intactas las fórmulas en columnas adyacentes** (como K a R) para que se ejecuten de inmediato en cada nueva fila.
  2. **Elimina saltos masivos de filas vacías**: no salta a la fila 1000 por culpa de plantillas de fórmulas.
  3. **Mantiene una sola fila limpia al final** para compatibilidad óptima con Looker Studio.

### 2. Consumo Dinámico de Atletas ('Nombre de Atletas')
- El selector de atleta en la cabecera no está cableado a mano: consume dinámicamente los registros de la columna A de la pestaña **`Nombre de Atletas`**.
- Cuenta con un botón de sincronización rápida 🔄 para actualizar la lista en un clic sin recargar la página.

### 3. Mapeo Exacto de Columnas en 'Registro_Diario'
| Columna | Nombre de Campo | Origen / Formato |
| :---: | :--- | :--- |
| **A** | **Atleta** | Nombre del atleta seleccionado en el encabezado. |
| **B** | **Fecha** | Fecha del entrenamiento (`YYYY-MM-DD`). |
| **C** | **Mes** | Nombre del mes en español (ej. *Septiembre*). |
| **D** | **Semana** | Número de semana ISO del año (ej. *Semana 36*). |
| **E** | **Ejercicio** | Nombre del ejercicio (ej. *Back Squat*, *Carrera*, etc.). |
| **F** | **Categoría** | Fuerza, Levantamiento Olímpico, Cardio, etc. |
| **G** | **Series** | Número de series realizadas. |
| **H** | **Reps / Distancia (km)** | Repeticiones logradas o kilómetros recorridos. |
| **I** | **Carga (kg)** | Peso en kilogramos (*0 en Cardio Carrera*). |
| **J** | **1RM Atleta (kg)** | 1RM del atleta de `RM_Atletas` o calculado con Epley (*0 en Cardio Carrera*). |
| **K - R** | *(Vacías)* | Espacio reservado para fórmulas o métricas adicionales de Looker Studio. |
| **S** | **RPE** | Percepción de esfuerzo de la sesión (escala Borg CR-10). |

### 4. Comportamiento Inteligente de Cardio (Carrera)
- Al seleccionar la categoría **Cardio** y el ejercicio **Carrera**:
  - La interfaz oculta el peso y deshabilita los inputs de carga y 1RM.
  - El campo de la **Columna H** se ajusta a **Distancia (km)**.
  - El sistema inyecta automáticamente un **0** en la **Columna I (Carga)** y en la **Columna J (1RM Atleta)**.

### 5. Lógica de 1RM con Ecuación de Epley
- Cuando se selecciona un ejercicio con barra o peso:
  - El sistema consulta la pestaña **`RM_Atletas`**.
  - **Si el atleta ya tiene una marca registrada**: Se pre-carga automáticamente en la Columna J y se muestra el badge `✅ 1RM Registrado en Hoja: XX kg`.
  - **Si el atleta NO cuenta con 1RM registrado**: Se despliega automáticamente la **Calculadora Epley**:
    $$\text{1RM} = \text{Carga} \times \left(1 + \frac{\text{Reps}}{30}\right)$$
    El atleta ingresa los kilos trabajados y las repeticiones logradas, y con un clic en **"Aplicar este 1RM Estimado a la Columna J"**, el valor se asigna listo para enviarse.

---

## 🚀 Guía de Despliegue en Google Apps Script

1. **Abrir Apps Script**:
   - En tu archivo de Google Sheets, ve a **Extensiones > Apps Script**.
2. **Pegar el Código**:
   - Abre [`gas/Code.gs`](file:///c:/Users/USUARIO/Documents/Plataforma%20Kleos/gas/Code.gs) y copia todo su contenido al editor de Google Apps Script.
3. **Inicializar la Estructura (Opcional)**:
   - Selecciona la función `setupProduccionKleos` en la barra superior y presiona **Ejecutar**.
   - Concede los permisos de Google. Esto creará o verificará las pestañas `Wellness`, `Registro_Diario`, `Nombre de Atletas` y `RM_Atletas` con sus cabeceras.
4. **Desplegar como Aplicación Web**:
   - Haz clic en **Implementar > Nueva implementación**.
   - Tipo: **Aplicación web**.
   - Ejecutar como: **Yo**.
   - Quién tiene acceso: **Cualquier usuario** (*Anyone*).
   - Haz clic en **Implementar** y copia la URL terminada en `/exec`.
5. **Conexión en Producción**:
   - La URL oficial definitiva de la nube (`https://script.google.com/macros/s/AKfycbwyoY9ISXFgW_BD37tg_PduuK72er45V8Wkj5r9hHcC5LbippoMya3T1Ux5azOJbpSh/exec`) ya está integrada por defecto en el frontend (`app.js`).
   - El selector de atletas se conecta automáticamente en vivo a Google Sheets desde cualquier dispositivo.

---

## 🌐 Despliegue Público 24/7 (Sin depender de tu laptop)

El frontend de la **Plataforma Kleos** es una aplicación estática autónoma de alto rendimiento (HTML5, Vanilla CSS3 y ES6+). Se conecta directamente vía HTTPS al backend de Google Apps Script. No requiere servidores de Node, Python ni bases de datos intermedias, lo que permite alojarla de forma **100% gratuita y permanente** en la nube.

### Opción 1: GitHub Pages (Recomendado para control de versiones)
1. **Crear repositorio en GitHub**:
   - Ingresa a [github.com](https://github.com) e inicia sesión.
   - Haz clic en **New repository** (Nuevo repositorio).
   - Nómbralo `plataforma-kleos` y selecciónalo como **Public**.
2. **Subir los archivos del proyecto**:
   - Haz clic en el enlace **"uploading an existing file"** (subir un archivo existente).
   - Arrastra a la ventana del navegador los siguientes archivos y carpetas:
     - `index.html`
     - Carpeta `css/` (con `styles.css`)
     - Carpeta `js/` (con `app.js`)
     - Carpeta `assets/` (con `parthenon_bg.jpg`)
   - Presiona **Commit changes**.
3. **Activar GitHub Pages**:
   - En tu repositorio de GitHub, ve a **Settings** (Configuración) > **Pages** (en el menú lateral izquierdo).
   - Bajo **Build and deployment > Branch**, selecciona `main` (o `master`) y la carpeta `/ (root)`.
   - Haz clic en **Save**.
4. **Obtener el enlace definitivo**:
   - En 1 a 2 minutos, GitHub generará tu enlace seguro:
     `https://<tu-usuario>.github.io/plataforma-kleos/`

---

### Opción 2: Vercel (Despliegue ultra rápido y dominio limpio)
1. **Acceder a Vercel**:
   - Ingresa a [vercel.com](https://vercel.com) e inicia sesión con tu cuenta de GitHub o Google.
2. **Importar Proyecto**:
   - Si vinculaste tu cuenta con GitHub, haz clic en **"Add New..." > "Project"** y selecciona `plataforma-kleos`.
   - Alternativamente, arrastra la carpeta del proyecto a la interfaz de Vercel.
3. **Desplegar**:
   - Haz clic en **Deploy**. En menos de 20 segundos obtendrás un enlace con SSL/HTTPS automático:
     `https://plataforma-kleos.vercel.app`

---

## 📱 Experiencia Móvil de los Atletas (Instalación como App)

La plataforma incluye etiquetas PWA y optimización táctil. Los atletas pueden instalarla en sus teléfonos sin pasar por la App Store o Google Play:

- **En iPhone (Safari)**:
  1. Abrir el enlace público (`https://...`).
  2. Tocar el botón de **Compartir** (icono de cuadro con flecha hacia arriba).
  3. Seleccionar **"Agregar a pantalla de inicio"** (Add to Home Screen).
  4. La app aparecerá con el icono dorado de Kleos y se abrirá en pantalla completa sin barras de navegador.

- **En Android (Chrome)**:
  1. Abrir el enlace público en Chrome.
  2. Tocar el menú de los 3 puntos arriba a la derecha.
  3. Seleccionar **"Instalar aplicación"** o **"Agregar a la pantalla principal"**.

---

## 🛡️ Medidas de Seguridad y Auto-Reparación Continua 24/7

Para evitar de raíz cualquier celda en blanco o error de autocompletado en los reportes de Looker Studio, se han implementado dos capas complementarias de protección:

### 1. Capa Preventiva en la Nube ([`gas/Code.gs`](file:///c:/Users/USUARIO/Documents/Plataforma%20Kleos/gas/Code.gs))
- Función `ensureRowFormulas(sheet, targetRow)`: Cada vez que un atleta guarda un entrenamiento, el script copia automáticamente las fórmulas maestras de la fila 2 hacia la nueva fila para las columnas:
  - **K a R**: `% 1RM Real`, `Reps Totales`, `Tonelaje`, `Zona de Carga`, `Contador Descarga`, `Contador Hipertrofia`, `Contador Fuerza Max`, `Contador Total Fuerza`.
  - **T a V**: `Fecha_Ordenada`, `Sesion_ID`, `% 1RM Porcentaje`.
- Garantiza que ninguna fila nueva quede con celdas vacías ni dependa de autocompletados erróneos de hojas de cálculo.

### 2. Capa Correctiva Automatizada ([`sincronizar_sheets.py`](file:///c:/Users/USUARIO/Documents/Plataforma%20Kleos/sincronizar_sheets.py))
- Comando `--auto-heal`:
  ```powershell
  python sincronizar_sheets.py --auto-heal
  ```
- Audita periódicamente todas las filas activas. Si detecta alguna celda vacía o fórmula alterada manualmente, la repara de inmediato y sincroniza el catálogo de atletas en `RM_Atletas`.
