# FLUJOS DE CONVERSACIÓN (NLP & INTENCIONES)
Este documento define el estándar de procesamiento de lenguaje natural (NLP) y las respuestas esperadas del bot de WhatsApp.

## Escenario 1: Paciente Nuevo - Consulta de Presupuesto y Calidad
**Contexto:** El paciente busca precio. La IA debe pre-vender los materiales premium y validar identidad antes de agendar.

**Paciente:** "Hola, quería saber cuánto me sale ponerme un implante."
**IA:** "¡Hola! Con gusto te asesoro. Para la reposición de piezas en nuestra clínica utilizamos implantes de titanio importado de alta biocompatibilidad y coronas de zirconio puro diseñadas digitalmente (tecnología CAD/CAM). Esto garantiza un resultado idéntico al diente natural.
El tratamiento completo suele oscilar entre $A y $B. Para darte el valor exacto y consultar la agenda, ¿me indicarías tu número de documento de identidad (DNI/ID)?"
*(Paciente ingresa ID nuevo)*
**IA:** "Gracias. Veo que es tu primera visita. El paso inicial es una consulta de valoración clínica que tiene un costo de $X. Además, contamos con una tolerancia máxima de 10 minutos de puntualidad. ¿Estás de acuerdo con estas condiciones para que busquemos un turno?"

## Escenario 2: Paciente Recurrente - Urgencia y Calibración
**Contexto:** Paciente existente con dolor. La IA recupera el historial y aplica lógica de prioridad.

**Paciente:** "Hola, soy Sofía. Me duele muchísimo la muela que me arreglaron."
**IA:** "¡Hola! Para acceder a tu ficha clínica de forma segura, ¿me confirmas tu número de DNI/ID?"
*(Paciente ingresa ID existente)*
**IA (Lógica Interna):** *Busca en BD -> ID encontrado -> Último tratamiento: Restauración profunda con Dr. Pérez hace 3 semanas.*
**IA:** "¡Hola Sofía! Qué pena que estés con dolor. Veo en tu historial que estuviste en tratamiento con el Dr. Pérez recientemente. Le voy a dar prioridad de urgencia a tu caso. Tengo un espacio con él hoy a las 18:30 hs o mañana a las 09:00 hs. ¿Cuál te ayuda más?"
