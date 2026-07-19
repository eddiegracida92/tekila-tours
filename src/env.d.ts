/// <reference types="astro/client" />

declare namespace App {
  interface Locals {
    /** Perfil admin autenticado (lo inyecta el middleware en `/admin/*`). */
    admin: import('@/lib/auth').AdminProfile | null;
  }
}
