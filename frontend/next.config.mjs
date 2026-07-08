/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    // Router Cache del cliente: 30s para rutas dinámicas. Todas las mutaciones
    // del dashboard pasan por Server Actions que llaman revalidatePath(), y eso
    // purga también el Router Cache del cliente — los cambios propios se ven al
    // instante igual que con 0. El 0 anterior forzaba un round-trip al servidor
    // (con skeleton) en CADA navegación, incluso al volver atrás a los 2 segundos.
    // Tradeoff: cambios EXTERNOS (bot de WhatsApp, sync de Google Calendar)
    // pueden tardar hasta 30s en verse al re-navegar — igual que ya pasaba al
    // quedarse mirando una página abierta, que nunca se auto-refresca.
    staleTimes: {
      dynamic: 30,
      static: 180,
    },
    // El dictado por voz manda el audio (base64) a un Server Action; el límite
    // por defecto (1MB) se queda corto para grabaciones de varios minutos.
    serverActions: {
      bodySizeLimit: "12mb",
    },
  },
};

export default nextConfig;
