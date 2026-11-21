import { Stack } from 'expo-router';

export default function RootLayout() {
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: '#07111f' },
        headerTintColor: '#f8fafc',
        contentStyle: { backgroundColor: '#030712' },
      }}
    >
      <Stack.Screen name="index" options={{ title: 'Founder Control Room' }} />
    </Stack>
  );
}
