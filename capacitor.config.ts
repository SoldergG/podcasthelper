import type { CapacitorConfig } from "@capacitor/cli";

// The app loads the live site, so every web deploy updates the app too.
// native-shell/ is only shown if the site can't be reached.
const config: CapacitorConfig = {
  appId: "pt.soldergg.podcasthelper",
  appName: "PodcastHelper",
  webDir: "native-shell",
  server: {
    url: "https://podcasthelper.vercel.app",
    errorPath: "index.html",
  },
  android: {
    allowMixedContent: false,
  },
};

export default config;
