const g = globalThis as typeof globalThis & {
  crypto?: {
    getRandomValues: <T extends ArrayBufferView>(array: T) => T;
    randomUUID: () => string;
  };
};

function getRandomValues<T extends ArrayBufferView>(array: T): T {
  const view = new Uint8Array(array.buffer, array.byteOffset, array.byteLength);
  for (let i = 0; i < view.length; i++) view[i] = Math.floor(Math.random() * 256);
  return array;
}

function randomUUID(): string {
  const bytes = getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

if (!g.crypto) {
  g.crypto = { getRandomValues, randomUUID };
} else {
  if (typeof g.crypto.getRandomValues !== "function") g.crypto.getRandomValues = getRandomValues;
  if (typeof g.crypto.randomUUID !== "function") g.crypto.randomUUID = randomUUID;
}
