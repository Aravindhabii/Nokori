import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.abiiaravindh.expensetracker',
  appName: 'Expense Tracker',
  webDir: 'dist',
  server: {
    androidScheme: 'https',
  },
  plugins: {
    // Route fetch/XHR through native HTTP so calls to the backend domain work
    // without CORS/CSP config. (Only applies in native builds.)
    CapacitorHttp: { enabled: true },
  },
};

export default config;
