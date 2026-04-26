import { Stack } from 'expo-router';

const HEADER = {
  headerStyle: { backgroundColor: '#020617' },  // slate-950
  headerTintColor: '#f8fafc',                    // slate-50
  headerTitleStyle: { fontWeight: '700' as const },
};

export default function AppLayout() {
  return (
    <Stack>
      <Stack.Screen name="index"  options={{ title: 'Dashboard',    ...HEADER }} />
      <Stack.Screen name="search" options={{ title: 'Find Athletes', ...HEADER }} />
    </Stack>
  );
}
