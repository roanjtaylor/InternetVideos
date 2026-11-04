// Extends app.json.
//
// Two app variants share this config, chosen by APP_VARIANT:
//   production (default)  "Internet Vids", com.roanjtaylor.internetvids. The
//                         standalone app on TestFlight.
//   development           "Internet Vids Dev", com.roanjtaylor.internetvids.dev.
//                         A development client that loads code live from
//                         `npx expo start --dev-client`. Installed next to
//                         the production app, never replacing it.
//
// Each variant has its own Google iOS OAuth client, because Google ties the
// client to the bundle id and redirects back to the app on a URL scheme that
// is the client id reversed; that scheme is registered here. Expo CLI loads
// app/.env (and .env.development when starting the dev server) before
// evaluating this file; EAS build profiles set the same variables.
const variant = process.env.APP_VARIANT === 'development' ? 'development' : 'production';
const dev = variant === 'development';
const clientId = process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID ?? '';

function reversed(id) {
  const [head, ...rest] = id.split('.');
  return [...rest.reverse(), head].join('.');
}

module.exports = ({ config }) => {
  const scheme = dev ? `${config.scheme}-dev` : config.scheme;
  return {
    ...config,
    name: dev ? `${config.name} Dev` : config.name,
    scheme: clientId ? [scheme, reversed(clientId)] : scheme,
    ios: {
      ...config.ios,
      bundleIdentifier: dev ? `${config.ios.bundleIdentifier}.dev` : config.ios.bundleIdentifier,
    },
    extra: { ...config.extra, variant },
  };
};
