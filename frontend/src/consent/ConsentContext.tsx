import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';

const CONSENT_KEY = 'sdl_consent';
export const CONSENT_VERSION = '2026-11';
const MAX_AGE_MS = 1000 * 60 * 60 * 24 * 183;

export interface ConsentCategories {
  necessary: true;
  functional: boolean;
  thirdParty: boolean;
}

export interface ConsentRecord {
  version: string;
  timestamp: number;
  categories: ConsentCategories;
}

function isValid(value: unknown): value is ConsentRecord {
  if (typeof value !== 'object' || value === null) return false;
  const record = value as Record<string, unknown>;
  if (record.version !== CONSENT_VERSION) return false;
  if (typeof record.timestamp !== 'number') return false;
  if (typeof record.categories !== 'object' || record.categories === null) return false;
  const categories = record.categories as Record<string, unknown>;
  return (
    categories.necessary === true &&
    typeof categories.functional === 'boolean' &&
    typeof categories.thirdParty === 'boolean'
  );
}

export function readConsent(now = Date.now()): ConsentRecord | null {
  try {
    const raw = localStorage.getItem(CONSENT_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!isValid(parsed)) return null;
    if (now - parsed.timestamp > MAX_AGE_MS) return null;
    return parsed;
  } catch {
    return null;
  }
}

function persist(categories: ConsentCategories): ConsentRecord {
  const record: ConsentRecord = { version: CONSENT_VERSION, timestamp: Date.now(), categories };
  try {
    localStorage.setItem(CONSENT_KEY, JSON.stringify(record));
  } catch {
    // Storage bloqueado: la decisión vale para esta sesión.
  }
  return record;
}

interface ConsentContextValue {
  consent: ConsentRecord | null;
  bannerOpen: boolean;
  canLoadThirdParty: boolean;
  acceptAll: () => void;
  rejectAll: () => void;
  openBanner: () => void;
  closeBanner: () => void;
}

const ConsentContext = createContext<ConsentContextValue | null>(null);

export function ConsentProvider({ children }: { children: ReactNode }) {
  const [consent, setConsent] = useState<ConsentRecord | null>(() => readConsent());
  const [bannerOpen, setBannerOpen] = useState(() => readConsent() === null);

  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key === CONSENT_KEY) setConsent(readConsent());
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const acceptAll = useCallback(() => {
    setConsent(persist({ necessary: true, functional: true, thirdParty: true }));
    setBannerOpen(false);
  }, []);

  const rejectAll = useCallback(() => {
    setConsent(persist({ necessary: true, functional: false, thirdParty: false }));
    setBannerOpen(false);
  }, []);

  const value = useMemo<ConsentContextValue>(
    () => ({
      consent,
      bannerOpen,
      canLoadThirdParty: consent?.categories.thirdParty === true,
      acceptAll,
      rejectAll,
      openBanner: () => setBannerOpen(true),
      closeBanner: () => setBannerOpen(false),
    }),
    [consent, bannerOpen, acceptAll, rejectAll],
  );

  return <ConsentContext.Provider value={value}>{children}</ConsentContext.Provider>;
}

export function useConsent(): ConsentContextValue {
  const value = useContext(ConsentContext);
  if (!value) throw new Error('useConsent debe usarse dentro de ConsentProvider');
  return value;
}
