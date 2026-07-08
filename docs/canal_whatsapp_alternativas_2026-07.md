# Canal WhatsApp: alternativas ante el rechazo de la verificación de Meta — Julio 2026

Contexto: la solicitud directa de WhatsApp Business (Cloud API de Meta) fue
rechazada. Requisito del producto: **el canal tiene que seguir siendo WhatsApp**
(los pacientes viven ahí). Este documento compara los caminos reales y estima
costos para una clínica en Argentina.

---

## 1. Lo primero: qué significa el rechazo (y qué NO significa)

La verificación del negocio (Meta Business Verification) **no es requisito para
empezar a operar** la API de WhatsApp — es requisito para *escalar*. Una cuenta
**sin verificar** puede:

- Recibir mensajes de pacientes **sin límite** y responderlos gratis dentro de
  la ventana de 24 h (que es exactamente lo que hace el bot hoy).
- Iniciar hasta **250 conversaciones salientes por día** (recordatorios con
  plantilla). Para una clínica con decenas de turnos/día, alcanza de sobra
  al principio.
- Usar hasta 2 números.

O sea: **se puede lanzar ya con límites, y la verificación se reintenta en
paralelo** para levantar el tope y obtener el nombre visible verificado.

### Por qué suelen rechazar la verificación
Meta valida que el negocio "exista" con documentos cruzados. Los rechazos
típicos (y su fix) son:

| Causa de rechazo | Cómo resolverlo |
|---|---|
| Nombre legal no coincide exactamente con los documentos | Usar la razón social del monotributo/S.A.S. tal cual figura en AFIP/constancia |
| Sin sitio web propio o con dominio genérico | Dominio propio (ej. `clinicaX.com.ar`) con el nombre legal visible en el footer |
| Email de contacto @gmail | Email con el dominio propio (`info@clinicaX.com.ar`) |
| Documentos ilegibles o desactualizados | Constancia de inscripción AFIP + factura de servicio a nombre del negocio (2–3 documentos que coincidan en nombre y dirección) |

Con un BSP (Twilio, 360dialog) el proceso es el mismo de fondo (lo decide
Meta), pero el **onboarding embebido del BSP guía el alta, el soporte del BSP
media los rechazos**, y se puede operar en modo limitado mientras tanto.

---

## 2. Opción recomendada: Twilio como BSP

### Costos (2026)

Twilio cobra **US$ 0,005 por mensaje** (entrante o saliente) y **pasa el fee de
Meta sin markup**. El fee de Meta desde julio 2025 es **por plantilla
entregada**, según categoría y país del receptor. Para **Argentina**:

| Tipo de mensaje | Fee Meta (AR) | Fee Twilio | Total aprox. |
|---|---|---|---|
| Respuesta del bot dentro de la ventana de 24 h (texto libre) | **US$ 0** | US$ 0,005 | **US$ 0,005** |
| Plantilla *utility* dentro de la ventana de 24 h | **US$ 0** | US$ 0,005 | **US$ 0,005** |
| Plantilla *utility* fuera de ventana (recordatorio de turno) | ~US$ 0,058 | US$ 0,005 | **~US$ 0,063** |
| Plantilla *authentication* | ~US$ 0,053 | US$ 0,005 | ~US$ 0,058 |
| Plantilla *marketing* | ~US$ 0,124 | US$ 0,005 | ~US$ 0,129 |

Desde abril 2026 Meta factura en **pesos (ARS)** en Argentina.

### Simulación mensual (clínica tipo)

- Bot conversacional (pacientes escriben primero): ~2.000 mensajes/mes
  intercambiados → solo fee Twilio ≈ **US$ 10**.
- Recordatorios de turno (plantilla utility, fuera de ventana): ~400/mes →
  ≈ **US$ 25**.
- **Total estimado: US$ 35–40/mes.** Sin cargo fijo mensual de Twilio por el
  número WhatsApp (el número de teléfono en sí, si lo provee Twilio, ~US$ 1–15/mes
  según tipo).

### Limitaciones de Twilio a tener en cuenta

1. **La verificación de Meta sigue existiendo**: Twilio no la elimina, la
   acompaña. Sin verificar rigen los límites de arriba (250 salientes/día).
2. **Las plantillas** (recordatorios) se aprueban vía Twilio (Content API) —
   mismo proceso de revisión de Meta, 24–48 h.
3. **Cambio técnico**: hoy el backend habla directo con `graph.facebook.com`
   (envío) y valida `X-Hub-Signature-256` (webhook). Con Twilio cambia el
   transporte: envío por la API de Twilio y webhook con formato/firma de Twilio
   (`X-Twilio-Signature`). **El bot no se toca**: la lógica conversacional está
   desacoplada (cola BullMQ + handlers); es un módulo de transporte nuevo
   (`TwilioWhatsappService` + adaptador de webhook), ~2-3 días de trabajo.
4. **Portar el número**: si el número de la clínica ya usó la app WhatsApp
   Business (la app del teléfono), hay que darlo de baja ahí antes de migrarlo
   a la API. Un número solo puede estar en un lado a la vez.

### Alternativa BSP: 360dialog

Modelo distinto: **cuota fija mensual por número** (sin markup por mensaje;
solo pagás los fees de Meta). Conviene cuando el volumen de mensajes es alto
(el fee de US$ 0,005 de Twilio supera la cuota fija). Para el volumen inicial
de una clínica, Twilio sale más barato y tiene mejor documentación/SDKs.
Referencia: [360dialog](https://360dialog.com/) — onboarding embebido similar.

---

## 3. Plan de acción sugerido

1. **Ya** (sin esperar verificación): alta en Twilio → WhatsApp Self Sign-up →
   conectar el número en modo limitado. Implementar el módulo de transporte
   Twilio detrás de una abstracción de canal (interfaz `MessagingChannel` que
   implementen `MetaCloudApiChannel` y `TwilioChannel` — deja la puerta abierta
   a volver a Cloud API directa si algún día conviene).
2. **En paralelo**: preparar el paquete de verificación (razón social exacta,
   dominio propio + email del dominio, constancia AFIP + factura de servicio) y
   reintentar la verificación desde el Business Manager, ahora con Twilio como
   BSP.
3. **Si la verificación vuelve a fallar** tras 2 intentos con documentos
   correctos: apelar vía el soporte de Twilio (median con Meta) — es parte de
   lo que se paga con el BSP.

### Fuentes

- [Twilio — WhatsApp Messaging Pricing](https://www.twilio.com/en-us/whatsapp/pricing)
- [Twilio — cambio de pricing de WhatsApp (julio 2025)](https://help.twilio.com/articles/30304057900699-Notice-Changes-to-WhatsApp-s-Pricing-July-2025)
- [Twilio — Self Sign-up de senders WhatsApp](https://www.twilio.com/docs/whatsapp/self-sign-up)
- [Meta — precios de la plataforma WhatsApp Business](https://developers.facebook.com/documentation/business-messaging/whatsapp/pricing/?locale=es_LA)
- [WhatsApp Business API en Argentina 2026 (Basework)](https://www.basework.com.ar/blog/whatsapp-business-api-argentina)
- [Precios WhatsApp API LATAM (Kharyo)](https://kharyo.com/blog/whatsapp-business-api-precios-latam)
- [Meta Business Verification (360dialog docs)](https://docs.360dialog.com/docs/resources/meta-business-verification)
