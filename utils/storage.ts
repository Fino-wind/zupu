export const safeJsonParse = <T>(raw: string, fallback: T): T => {
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
};

export const readStorageValue = <T>(
  key: string,
  fallback: T,
  deserialize?: (raw: string) => T
): T => {
  if (typeof window === 'undefined') {
    return fallback;
  }

  const raw = window.localStorage.getItem(key);
  if (raw === null) {
    return fallback;
  }

  if (deserialize) {
    try {
      return deserialize(raw);
    } catch {
      return fallback;
    }
  }

  return safeJsonParse(raw, fallback);
};

export const writeStorageValue = <T>(key: string, value: T, serialize?: (value: T) => string) => {
  if (typeof window === 'undefined') {
    return;
  }

  const nextValue = serialize ? serialize(value) : JSON.stringify(value);
  window.localStorage.setItem(key, nextValue);
};
