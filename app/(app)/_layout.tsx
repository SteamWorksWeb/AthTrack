import { Stack } from 'expo-router';

export default function AppLayout() {
  return (
    <Stack>
      <Stack.Screen
        name="index"
        options={{
          title: 'Dashboard',
          headerStyle: { backgroundColor: '#020617' },   // slate-950
          headerTintColor: '#f8fafc',                     // slate-50
          headerTitleStyle: { fontWeight: '700' },
        }}
      />
    </Stack>
  );
}
