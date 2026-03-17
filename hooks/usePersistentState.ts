import { Dispatch, SetStateAction, useEffect, useMemo, useState } from 'react';
import { readStorageValue, writeStorageValue } from '../utils/storage';

interface PersistentStateOptions<T> {
  deserialize?: (raw: string) => T;
  serialize?: (value: T) => string;
}

export const usePersistentState = <T>(
  key: string,
  initialValue: T | (() => T),
  options?: PersistentStateOptions<T>
): [T, Dispatch<SetStateAction<T>>] => {
  const initial = useMemo(
    () => (typeof initialValue === 'function' ? (initialValue as () => T)() : initialValue),
    [initialValue]
  );

  const [value, setValue] = useState<T>(() =>
    readStorageValue<T>(key, initial, options?.deserialize)
  );

  useEffect(() => {
    writeStorageValue<T>(key, value, options?.serialize);
  }, [key, options?.serialize, value]);

  return [value, setValue];
};
