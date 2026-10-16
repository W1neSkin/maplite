import type { CapacitorConfig } from "@capacitor/cli"

/**
 * Store name and bundle id live only in this file.
 * The on-screen name is apps/client/src/brand.ts and should be changed together.
 * androidScheme https keeps the WebView on a secure origin.
 */
const config: CapacitorConfig = {
  appId: "app.cartography.workspace",
  appName: "Cartographic Workspace",
  webDir: "../client/dist",
  server: {
    androidScheme: "https",
  },
}

export default config
