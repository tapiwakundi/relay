import { rewriteIceServers } from "../../shared/livekit-ice";

const Original = window.RTCPeerConnection;

function lookup(host: string) {
  try {
    return window.relayDesktop?.lookupHost(host) ?? null;
  } catch {
    return null;
  }
}

function withResolvedHosts(config?: RTCConfiguration) {
  if (!config?.iceServers?.length) return config;
  return { ...config, iceServers: rewriteIceServers(config.iceServers, lookup) };
}

const Patched = function RTCPeerConnection(this: RTCPeerConnection, config?: RTCConfiguration) {
  return new Original(withResolvedHosts(config));
} as unknown as typeof RTCPeerConnection;

Patched.prototype = Original.prototype;
if ("generateCertificate" in Original) {
  Object.defineProperty(Patched, "generateCertificate", {
    get: () => Original.generateCertificate,
  });
}
window.RTCPeerConnection = Patched;

const setConfiguration = Original.prototype.setConfiguration;
Original.prototype.setConfiguration = function (config?: RTCConfiguration) {
  return setConfiguration.call(this, withResolvedHosts(config));
};
