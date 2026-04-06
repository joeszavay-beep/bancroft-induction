import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'io.coresite.app',
  appName: 'CoreSite',
  webDir: 'dist',
  server: {
    url: 'https://coresite.io',
    cleartext: false,
  },
  ios: {
    contentInset: 'automatic',
    preferredContentMode: 'mobile',
    scheme: 'CoreSite',
  },
  plugins: {
    SplashScreen: {
      launchAutoHide: true,
      launchFadeOutDuration: 300,
      backgroundColor: '#0D1526',
    },
    StatusBar: {
      style: 'LIGHT',
      backgroundColor: '#0D1526',
    },
  },
};

export default config;
