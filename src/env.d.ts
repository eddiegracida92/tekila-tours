/// <reference types="astro/client" />

declare namespace App {
  interface Locals {
    /** Perfil de gestión (owner/staff) autenticado; lo inyecta el middleware en `/admin/*`. */
    admin: import('@/lib/auth').AdminProfile | null;
    /** Perfil de vendedor autenticado; lo inyecta el middleware en `/vendedor/*`. */
    vendedor: import('@/lib/auth').AdminProfile | null;
  }
}
