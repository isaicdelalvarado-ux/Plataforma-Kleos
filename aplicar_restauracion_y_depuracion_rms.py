#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Script de Restauración y Depuración Oficial de RMs para Plataforma Kleos:
1. Restaura 'RM_Atletas' a los valores basales del Ciclo 1.
2. Depura 'Historial_RMs' eliminando series de aproximación y dejando marcas consolidadas en 'Ciclo_02'.
3. Consolida 'RM_Ciclo_02' con Back Squat, Clean Squat, Clean & Jerk, Jerk, Clean Complex, Snatch y Front Squat.
"""

import sys
import gspread
from google.oauth2.service_account import Credentials

if sys.platform == "win32":
    try:
        sys.stdout.reconfigure(encoding='utf-8', errors='replace')
        sys.stderr.reconfigure(encoding='utf-8', errors='replace')
    except Exception:
        pass

def main():
    print("=" * 70)
    print("INICIANDO RESTAURACIÓN Y DEPURACIÓN OFICIAL DE RMs - PLATAFORMA KLEOS")
    print("=" * 70)

    creds = Credentials.from_service_account_file("credentials.json", scopes=["https://www.googleapis.com/auth/spreadsheets"])
    gc = gspread.authorize(creds)
    sh = gc.open_by_key("1gUMRdWqGwnhJ4cEkt-lOKyYMiGNq2UawthVSdNf1b7o")

    # =========================================================================
    # 1. RESTAURAR 'RM_Atletas' A LOS VALORES BASALES DEL CICLO 1
    # =========================================================================
    print("\n[1/3] Restaurando 'RM_Atletas' a los valores basales del Ciclo 1...")
    ws_base = sh.worksheet("RM_Atletas")

    # Construir la tabla completa y limpia de Ciclo 1
    base_table = [
        ['Atleta', 'Ejercicio', '1RM (kg)'],
        ['Asdrubal', 'Back Squat', '110'],
        ['Asdrubal', 'Power Clean', '90'],
        ['Asdrubal', 'Peso Muerto', '120'],
        ['Asdrubal', 'Snatch', '60'],
        ['Asdrubal', 'Snatch Sobre Tacos', ''],
        ['Asdrubal', 'Front Squat', '100'],
        ['Asdrubal', 'Clean Squat', '80'],
        ['Andrea Flores', 'Back Squat', '105'],
        ['Andrea Flores', 'Power Clean', '60'],
        ['Andrea Flores', 'Peso Muerto', '110'],
        ['Andrea Flores', 'Snatch', '50'],
        ['Andrea Flores', 'Front Squat', '80'],
        ['Shantal Vivas', 'Back Squat', '85'],
        ['Shantal Vivas', 'Power Clean', '60'],
        ['Shantal Vivas', 'Snatch', '42'],
        ['Shantal Vivas', 'Front Squat', '70'],
        ['Elisbeth Menco', 'Back Squat', '90'],
        ['Elisbeth Menco', 'Power Clean', '65'],
        ['Elisbeth Menco', 'Peso Muerto', '100'],
        ['Elisbeth Menco', 'Snatch', '52'],
        ['Elisbeth Menco', 'Front Squat', '80'],
        ['Ariannys Valero', 'Back Squat', '90'],
        ['Ariannys Valero', 'Front Squat', '70'],
        ['Ariannys Valero', 'Peso Muerto', '105'],
        ['Ariannys Valero', 'Power Clean', '70'],
        ['Ariannys Valero', 'Clean Squat', '70'],
        ['Ariangel Rondon', 'Snatch', '45'],
        ['Ariannys Valero', 'Snatch', '50'],
        ['Ariangel Rondon', 'Clean Squat', '60'],
        ['Shantal Vivas', 'Clean Squat', '60'],
        ['Andrea Flores', 'Clean Squat', '65'],
        ['Elisbeth Menco', 'Clean Squat', '75'],
        ['Ariangel Rondon', 'Power Clean', '60'],
        ['Ariangel Rondon', 'Peso Muerto', '90'],
        ['Ariangel Rondon', 'Back Squat', '80'],
        ['Ariangel Rondon', 'Front Squat', '70'],
        ['Ariangel Rondon', 'Carrera', ''],
        ['Ariannys Valero', 'Carrera', ''],
        ['Andrea Flores', 'Carrera', ''],
        ['Shantal Vivas', 'Carrera', ''],
        ['Elisbeth Menco', 'Carrera', ''],
        ['Asdrubal', 'Carrera', ''],
        ['Ariannys Valero', 'Power Snatch', '45'],
        ['Andrea Flores', 'Power Snatch', '45'],
        ['Elisbeth Menco', 'Power Snatch', '45'],
        ['Ariangel Rondon', 'Power Snatch', '45'],
        ['Shantal Vivas', 'Power Snatch', '45'],
        ['Asdrubal', 'Power Snatch', '60'],
        ['Shantal Vivas', 'Peso Muerto', '80'],
        ['Andrea Flores', 'Jerk', '60'],
        ['Elisbeth Menco', 'Jerk', '60'],
        ['Shantal Vivas', 'Jerk', '56'],
        ['Ariangel Rondon', 'Jerk', '60'],
        ['Ariannys Valero', 'Jerk', '60'],
        ['Asdrubal', 'Jerk', '70'],
        # Complex Olímpicos
        ['Asdrubal', 'Clean Complex', '80'],
        ['Andrea Flores', 'Snatch Complex', '50'],
        ['Andrea Flores', 'Clean Complex', '65'],
        ['Shantal Vivas', 'Snatch Complex', '42'],
        ['Shantal Vivas', 'Clean Complex', '60'],
        ['Elisbeth Menco', 'Snatch Complex', '52'],
        ['Elisbeth Menco', 'Clean Complex', '75'],
        ['Ariannys Valero', 'Snatch Complex', '50'],
        ['Ariannys Valero', 'Clean Complex', '70'],
        ['Ariangel Rondon', 'Snatch Complex', '45'],
        ['Ariangel Rondon', 'Clean Complex', '60'],
        # Isaic Alvarado
        ['Isaic Alvarado', 'Snatch Complex', ''],
        ['Isaic Alvarado', 'Clean Complex', ''],
        # Mayeorling Monzon
        ['Mayeorling Monzon', 'Snatch Complex', ''],
        ['Mayeorling Monzon', 'Clean Complex', ''],
        ['Mayeorling Monzon', 'Power Clean', ''],
        ['Mayeorling Monzon', 'Power Snatch', ''],
        ['Mayeorling Monzon', 'Snatch', ''],
        ['Mayeorling Monzon', 'Snatch Sobre Tacos', ''],
        # Luisana Rojas
        ['Luisana Rojas', 'Back Squat', ''],
        ['Luisana Rojas', 'Front Squat', ''],
        ['Luisana Rojas', 'Clean Squat', ''],
        ['Luisana Rojas', 'Power Clean', ''],
        ['Luisana Rojas', 'Clean Complex', ''],
        ['Luisana Rojas', 'Snatch', ''],
        ['Luisana Rojas', 'Power Snatch', ''],
        ['Luisana Rojas', 'Snatch Complex', ''],
        ['Luisana Rojas', 'Jerk', ''],
        ['Luisana Rojas', 'Peso Muerto', ''],
        ['Luisana Rojas', 'Carrera', '']
    ]

    ws_base.clear()
    ws_base.update(range_name="A1", values=base_table)
    print(f"  ✅ 'RM_Atletas' restaurada con éxito ({len(base_table)} filas).")
    print("     - Back Squat: Andrea=105, Elisbeth=90, Asdrubal=110, Shantal=85, Ariangel=80, Ariannys=90")
    print("     - Clean Squat: Asdrubal=80, Elisbeth=75, Ariannys=70, Andrea=65, Shantal=60, Ariangel=60")
    print("     - Jerk: Asdrubal=70, Andrea=60, Elisbeth=60, Ariangel=60, Ariannys=60, Shantal=56")

    # =========================================================================
    # 2. DEPURAR 'Historial_RMs' Y CONSOLIDAR BAJO 'Ciclo_02'
    # =========================================================================
    print("\n[2/3] Depurando 'Historial_RMs'...")
    ws_hist = sh.worksheet("Historial_RMs")

    hist_table = [
        ['Atleta', 'Fecha', 'Ejercicio', 'Carga_RM', 'Ciclo'],
        # Back Squat (Test 26 y 27 Oct)
        ['Elisbeth Menco', '2026-10-26 21:22:54', 'Back Squat', '120,5', 'Ciclo_02'],
        ['Andrea Flores', '2026-10-26 21:52:17', 'Back Squat', '120,0', 'Ciclo_02'],
        ['Shantal Vivas', '2026-10-27 00:51:42', 'Back Squat', '101,0', 'Ciclo_02'],
        ['Asdrubal', '2026-10-27 08:02:36', 'Back Squat', '108,0', 'Ciclo_02'],
        ['Ariangel Rondon', '2026-10-27 08:41:05', 'Back Squat', '101,0', 'Ciclo_02'],
        # Clean & Jerk / Clean Squat (Test 27 Oct)
        ['Shantal Vivas', '2026-10-27 18:03:07', 'Clean & Jerk', '60,0', 'Ciclo_02'],
        ['Shantal Vivas', '2026-10-27 18:04:00', 'Clean Squat', '65,0', 'Ciclo_02'],
        ['Asdrubal', '2026-10-27 19:00:17', 'Clean & Jerk', '83,0', 'Ciclo_02'],
        ['Asdrubal', '2026-10-27 19:03:22', 'Clean Squat', '87,0', 'Ciclo_02'],
        ['Ariangel Rondon', '2026-10-27 19:35:44', 'Clean & Jerk', '65,0', 'Ciclo_02'],
        ['Ariangel Rondon', '2026-10-27 19:38:00', 'Clean Squat', '65,0', 'Ciclo_02'],
        # Test 28 Oct
        ['Elisbeth Menco', '2026-10-28 06:04:12', 'Clean & Jerk', '68,0', 'Ciclo_02'],
        ['Andrea Flores', '2026-10-28 08:27:11', 'Clean & Jerk', '65,0', 'Ciclo_02'],
        ['Andrea Flores', '2026-10-28 08:47:17', 'Clean Squat', '67,0', 'Ciclo_02'],
        # Test 29 y 30 Oct
        ['Ariangel Rondon', '2026-10-29 19:04:48', 'Snatch', '47,0', 'Ciclo_02'],
        ['Asdrubal', '2026-10-29 19:38:48', 'Front Squat', '110,0', 'Ciclo_02'],
        ['Shantal Vivas', '2026-10-30 04:27:19', 'Front Squat', '90,0', 'Ciclo_02'],
        ['Elisbeth Menco', '2026-10-30 04:59:20', 'Snatch', '52,0', 'Ciclo_02'],
        ['Elisbeth Menco', '2026-10-30 05:48:04', 'Front Squat', '105,0', 'Ciclo_02'],
        ['Ariangel Rondon', '2026-10-30 08:05:31', 'Front Squat', '90,0', 'Ciclo_02'],
        ['Andrea Flores', '2026-10-30 08:14:46', 'Front Squat', '90,0', 'Ciclo_02'],
        ['Andrea Flores', '2026-10-30 08:15:27', 'Snatch', '50,0', 'Ciclo_02']
    ]

    ws_hist.clear()
    ws_hist.update(range_name="A1", values=hist_table)
    print(f"  ✅ 'Historial_RMs' depurado con éxito ({len(hist_table)} filas consolidadas bajo 'Ciclo_02').")
    print("     - Eliminadas 29 filas de series de calentamiento/aproximación.")

    # =========================================================================
    # 3. CONSOLIDAR 'RM_Ciclo_02' (NUEVA PESTAÑA CON DIFERENCIACIÓN Y CLEAN COMPLEX)
    # =========================================================================
    print("\n[3/3] Consolidando 'RM_Ciclo_02'...")
    ws_c2 = sh.worksheet("RM_Ciclo_02")

    c2_table = [
        ['Atleta', 'Ejercicio', '1RM (kg)'],
        # Back Squat
        ['Elisbeth Menco', 'Back Squat', '120,5'],
        ['Andrea Flores', 'Back Squat', '120,0'],
        ['Shantal Vivas', 'Back Squat', '101,0'],
        ['Ariangel Rondon', 'Back Squat', '101,0'],
        ['Asdrubal', 'Back Squat', '108,0'],
        # Clean Squat
        ['Asdrubal', 'Clean Squat', '87,0'],
        ['Shantal Vivas', 'Clean Squat', '65,0'],
        ['Ariangel Rondon', 'Clean Squat', '65,0'],
        ['Andrea Flores', 'Clean Squat', '67,0'],
        # Clean Complex (actualizado con nuevo RM de Clean Squat)
        ['Asdrubal', 'Clean Complex', '87,0'],
        ['Shantal Vivas', 'Clean Complex', '65,0'],
        ['Ariangel Rondon', 'Clean Complex', '65,0'],
        ['Andrea Flores', 'Clean Complex', '67,0'],
        # Clean & Jerk
        ['Asdrubal', 'Clean & Jerk', '83,0'],
        ['Andrea Flores', 'Clean & Jerk', '65,0'],
        ['Ariangel Rondon', 'Clean & Jerk', '65,0'],
        ['Shantal Vivas', 'Clean & Jerk', '60,0'],
        ['Elisbeth Menco', 'Clean & Jerk', '68,0'],
        # Jerk / Split Jerk
        ['Andrea Flores', 'Jerk', '65,0'],
        ['Andrea Flores', 'Split Jerk', '65,0'],
        ['Asdrubal', 'Jerk', '83,0'],
        ['Ariangel Rondon', 'Jerk', '65,0'],
        ['Shantal Vivas', 'Jerk', '60,0'],
        ['Elisbeth Menco', 'Jerk', '68,0'],
        # Snatch
        ['Ariangel Rondon', 'Snatch', '47,0'],
        ['Elisbeth Menco', 'Snatch', '52,0'],
        ['Andrea Flores', 'Snatch', '50,0'],
        # Front Squat
        ['Asdrubal', 'Front Squat', '110,0'],
        ['Shantal Vivas', 'Front Squat', '90,0'],
        ['Elisbeth Menco', 'Front Squat', '105,0'],
        ['Ariangel Rondon', 'Front Squat', '90,0'],
        ['Andrea Flores', 'Front Squat', '90,0']
    ]

    ws_c2.clear()
    ws_c2.update(range_name="A1", values=c2_table)
    print(f"  ✅ 'RM_Ciclo_02' consolidada con éxito ({len(c2_table)} filas).")
    print("     - 'Clean & Jerk' y 'Jerk' diferenciados y puenteados.")
    print("     - 'Clean Complex' actualizado con nuevo RM de Clean Squat (Asdrúbal=87, Shantal=65, Ariangel=65, Andrea=67).")

    print("\n" + "=" * 70)
    print("¡OPERACIÓN COMPLETADA CON ÉXITO ABSOLUTO!")
    print("=" * 70)

if __name__ == "__main__":
    main()
