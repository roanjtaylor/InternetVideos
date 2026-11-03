// Extends app.json. Google's iOS OAuth client redirects back to the app on a
// URL scheme that is the client id reversed, so that scheme has to be
// registered here. Expo CLI loads app/.env before evaluating this file.
const clientId = process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID ?? '';

function reversed(id) {
  const [head, ...rest] = id.split('.');
  return [...rest.reverse(), head].join('.');
}

module.exports = ({ config }) => ({
  ...config,
  scheme: clientId ? [config.scheme, reversed(clientId)] : config.scheme,
});
