/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    // Desactiva el Router Cache del cliente (staleTimes = 0).
    // Así cada navegación a una página dinámica va al servidor y obtiene datos frescos.
    // Necesario para que borrados/ediciones en Supabase se reflejen inmediatamente.
    staleTimes: {
      dynamic: 0,
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
