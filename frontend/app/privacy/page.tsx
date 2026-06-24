export default function PrivacyPage() {
  return (
    <main style={{ maxWidth: 720, margin: "0 auto", padding: "48px 24px", fontFamily: "sans-serif", color: "#1a1a1a" }}>
      <h1 style={{ fontSize: 28, fontWeight: 700, marginBottom: 8 }}>Política de Privacidad</h1>
      <p style={{ color: "#666", marginBottom: 32 }}>Última actualización: junio 2026</p>

      <section style={{ marginBottom: 24 }}>
        <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 8 }}>1. Datos que recopilamos</h2>
        <p>Recopilamos nombre, número de teléfono, DNI y datos de turnos médicos para gestionar la agenda de la clínica. Los mensajes de WhatsApp se procesan únicamente para coordinar turnos.</p>
      </section>

      <section style={{ marginBottom: 24 }}>
        <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 8 }}>2. Uso de los datos</h2>
        <p>Los datos se usan exclusivamente para agendar, modificar y cancelar turnos médicos. No se comparten con terceros ni se usan con fines publicitarios.</p>
      </section>

      <section style={{ marginBottom: 24 }}>
        <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 8 }}>3. Almacenamiento y seguridad</h2>
        <p>Los datos se almacenan en servidores seguros con cifrado en tránsito (HTTPS) y en reposo. Solo el personal autorizado de la clínica tiene acceso.</p>
      </section>

      <section style={{ marginBottom: 24 }}>
        <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 8 }}>4. Tus derechos</h2>
        <p>Podés solicitar acceso, corrección o eliminación de tus datos contactando a la clínica directamente por WhatsApp o de forma presencial.</p>
      </section>

      <section style={{ marginBottom: 24 }}>
        <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 8 }}>5. WhatsApp</h2>
        <p>Usamos la API de WhatsApp Business de Meta para recibir y enviar mensajes relacionados con turnos. Al enviarnos un mensaje, aceptás que procesemos esa comunicación con el fin de gestionar tu turno.</p>
      </section>

      <section>
        <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 8 }}>6. Contacto</h2>
        <p>Para consultas sobre privacidad, contactanos por WhatsApp al número registrado de la clínica.</p>
      </section>
    </main>
  );
}
