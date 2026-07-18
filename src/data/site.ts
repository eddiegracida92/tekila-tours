/**
 * Datos de contacto y marca — fuente única de verdad.
 * (En Steps posteriores parte de esto podría venir de config/BD.)
 */
export const site = {
  name: 'Tekila Tours',
  location: 'Cancún, Quintana Roo, México',
  phones: [
    { icon: '📞', label: '+52 998 240 7444', tel: '+529982407444' },
    { icon: '📱', label: '+52 998 743 1345', tel: '+529987431345' },
  ],
  instagram: {
    handle: '@tekilatours',
    url: 'https://instagram.com/tekilatours',
    icon: '📸',
  },
} as const;
