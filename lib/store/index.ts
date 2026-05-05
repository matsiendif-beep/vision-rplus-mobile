import { create } from 'zustand';
import * as SecureStore from 'expo-secure-store';
import { authApi } from '../api/client';

interface User {
  id: string; email: string; first_name: string; last_name: string; plan: string;
}

interface Company {
  id: string; name: string; currency: string; accounting_system: string;
}

interface FiscalYear {
  id: string; label: string; start_date: string; end_date: string; is_closed: boolean;
}

interface AuthState {
  user:           User | null;
  token:          string | null;
  isLoading:      boolean;
  login:          (email: string, password: string) => Promise<void>;
  logout:         () => Promise<void>;
  loadFromStorage:() => Promise<void>;
}

interface CompanyState {
  companies:       Company[];
  activeCompany:   Company | null;
  activeFiscalYear: FiscalYear | null;
  fiscalYears:     FiscalYear[];
  setCompanies:    (c: Company[]) => void;
  setActiveCompany:(c: Company) => void;
  setFiscalYears:  (fy: FiscalYear[]) => void;
  setActiveFiscalYear: (fy: FiscalYear) => void;
}

interface SyncState {
  lastSyncAt:   string | null;
  isSyncing:    boolean;
  pendingCount: number;
  setLastSyncAt: (t: string) => void;
  setIsSyncing:  (v: boolean) => void;
  setPending:    (n: number) => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  user:      null,
  token:     null,
  isLoading: true,

  login: async (email, password) => {
    const data = await authApi.login(email, password);
    await SecureStore.setItemAsync('access_token', data.access_token);
    set({ user: data.user, token: data.access_token });
  },

  logout: async () => {
    await SecureStore.deleteItemAsync('access_token');
    set({ user: null, token: null });
  },

  loadFromStorage: async () => {
    try {
      const token = await SecureStore.getItemAsync('access_token');
      if (token) {
        const user = await authApi.me();
        set({ user, token });
      }
    } catch {
      await SecureStore.deleteItemAsync('access_token');
    } finally {
      set({ isLoading: false });
    }
  },
}));

export const useCompanyStore = create<CompanyState>((set) => ({
  companies:        [],
  activeCompany:    null,
  activeFiscalYear: null,
  fiscalYears:      [],

  setCompanies:        (companies) => set({ companies }),
  setActiveCompany:    (activeCompany) => set({ activeCompany }),
  setFiscalYears:      (fiscalYears) => set({ fiscalYears }),
  setActiveFiscalYear: (activeFiscalYear) => set({ activeFiscalYear }),
}));

export const useSyncStore = create<SyncState>((set) => ({
  lastSyncAt:   null,
  isSyncing:    false,
  pendingCount: 0,
  setLastSyncAt: (lastSyncAt) => set({ lastSyncAt }),
  setIsSyncing:  (isSyncing)  => set({ isSyncing }),
  setPending:    (pendingCount) => set({ pendingCount }),
}));
