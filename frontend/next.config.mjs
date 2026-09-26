/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    // Router Cache del cliente: volver a una pantalla vista hace menos de 30 s
    // es instantáneo. Las mutaciones de la app (Server Actions con
    // revalidatePath / router.refresh) invalidan esa caché, así que lo que
    // cambia el usuario se ve al momento; cambios externos (bot de WhatsApp,
    // Google Calendar) tardan como máximo 30 s en aparecer al navegar.
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
