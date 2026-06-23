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
  },
};

export default nextConfig;
