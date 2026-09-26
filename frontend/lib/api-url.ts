// URL del backend NestJS. Solo se usa en Server Actions, así que no lleva el
// prefijo NEXT_PUBLIC_ (no se expone al navegador). API_URL la sobrescribe.
export const API_URL = process.env.API_URL || "https://129-146-62-253.sslip.io";
