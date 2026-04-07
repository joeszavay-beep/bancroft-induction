import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'io.coresite.app',
  appName: 'CoreSite',
  webDir: 'dist',
  server: {
    url: 'https://www.coresite.io',
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
      backgroundColor: '#1A2744',
    },
    StatusBar: {
      style: 'LIGHT',
      backgroundColor: '#1A2744',
    },
  },
};

export default config;
