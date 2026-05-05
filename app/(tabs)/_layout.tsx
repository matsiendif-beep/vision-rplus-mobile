import { useEffect } from 'react';
import { Tabs, router } from 'expo-router';
import { Ionicons }     from '@expo/vector-icons';
import { useAuthStore, useCompanyStore } from '../../lib/store';
import { companiesApi } from '../../lib/api/client';

const NAVY   = '#0B1C3D';
const ORANGE = '#F97316';

export default function TabLayout() {
  const { user, logout }               = useAuthStore();
  const { setCompanies, setActiveCompany, setFiscalYears, setActiveFiscalYear } = useCompanyStore();

  useEffect(() => {
    if (!user) { router.replace('/auth/login'); return; }
    loadCompanies();
  }, [user]);

  const loadCompanies = async () => {
    try {
      const data = await companiesApi.list();
      const all  = [...(data.owned ?? []), ...(data.shared ?? [])];
      setCompanies(all);
      if (all.length > 0) {
        setActiveCompany(all[0]);
        const fys = await companiesApi.fiscalYears(all[0].id);
        setFiscalYears(fys);
        const open = fys.find((f: any) => !f.is_closed);
        if (open) setActiveFiscalYear(open);
        else if (fys.length > 0) setActiveFiscalYear(fys[0]);
      }
    } catch { /* réseau indisponible — mode offline */ }
  };

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor:   ORANGE,
        tabBarInactiveTintColor: '#64748B',
        tabBarStyle: {
          backgroundColor: '#fff',
          borderTopColor:  '#F1F5F9',
          height: 60,
          paddingBottom: 8,
        },
        tabBarLabelStyle: { fontSize: 10, fontWeight: '600' },
        headerStyle:      { backgroundColor: NAVY },
        headerTintColor:  '#fff',
        headerTitleStyle: { fontWeight: '700' },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Dashboard',
          tabBarIcon: ({ color, size }) => <Ionicons name="grid-outline" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="journal"
        options={{
          title: 'Journal',
          tabBarIcon: ({ color, size }) => <Ionicons name="book-outline" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="scan"
        options={{
          title: 'Scanner',
          tabBarIcon: ({ color, size }) => <Ionicons name="camera-outline" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="analytics"
        options={{
          title: 'Analyse',
          tabBarIcon: ({ color, size }) => <Ionicons name="bar-chart-outline" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: 'Réglages',
          tabBarIcon: ({ color, size }) => <Ionicons name="settings-outline" size={size} color={color} />,
        }}
      />
    </Tabs>
  );
}
