// Per-weight subpaths so only the faces we use are bundled (the package roots pull in every weight).
import { NotoNastaliqUrdu_400Regular } from '@expo-google-fonts/noto-nastaliq-urdu/400Regular';
import { NotoNastaliqUrdu_600SemiBold } from '@expo-google-fonts/noto-nastaliq-urdu/600SemiBold';
import { NotoSansBengali_400Regular } from '@expo-google-fonts/noto-sans-bengali/400Regular';
import { NotoSansBengali_500Medium } from '@expo-google-fonts/noto-sans-bengali/500Medium';
import { NotoSansBengali_600SemiBold } from '@expo-google-fonts/noto-sans-bengali/600SemiBold';
import { Poppins_400Regular } from '@expo-google-fonts/poppins/400Regular';
import { Poppins_500Medium } from '@expo-google-fonts/poppins/500Medium';
import { Poppins_600SemiBold } from '@expo-google-fonts/poppins/600SemiBold';
import { Poppins_700Bold } from '@expo-google-fonts/poppins/700Bold';
import { useFonts } from 'expo-font';
import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import * as SystemUI from 'expo-system-ui';
import { useEffect } from 'react';
import { View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { AskProvider } from '@/components/cz/ask-atmos';
import { AuthProvider } from '@/context/auth';
import { LocationProvider } from '@/context/location';
import { PrefsProvider, useCz } from '@/context/prefs';

SplashScreen.preventAutoHideAsync();

function App() {
  const { c, prefs, f } = useCz();

  useEffect(() => {
    SystemUI.setBackgroundColorAsync(c.bg).catch(() => {});
  }, [c.bg]);

  const base = c.dark ? DarkTheme : DefaultTheme;
  const theme = { ...base, colors: { ...base.colors, background: c.bg, card: c.card, text: c.ink, border: c.line, primary: c.leaf } };

  return (
    <ThemeProvider value={theme}>
      <LocationProvider autoStart={prefs.onboarded}>
        {/* `direction` flips every row and start/end inset for Urdu without an app reload */}
        <View style={{ flex: 1, backgroundColor: c.bg, direction: f.rtl ? 'rtl' : 'ltr' }}>
          <AskProvider>
            <StatusBar style={c.dark ? 'light' : 'dark'} />
            <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: c.bg }, animation: 'slide_from_right' }}>
              <Stack.Screen name="(tabs)" />
              <Stack.Screen name="onboarding/welcome" options={{ animation: 'fade' }} />
              <Stack.Screen name="log-action" options={{ presentation: 'fullScreenModal', animation: 'slide_from_bottom' }} />
              <Stack.Screen name="team/new" options={{ presentation: 'modal' }} />
              <Stack.Screen name="air/add" options={{ presentation: 'modal' }} />
              <Stack.Screen name="auth" options={{ presentation: 'modal' }} />
            </Stack>
          </AskProvider>
        </View>
      </LocationProvider>
    </ThemeProvider>
  );
}

export default function RootLayout() {
  const [loaded, error] = useFonts({
    Poppins_400Regular,
    Poppins_500Medium,
    Poppins_600SemiBold,
    Poppins_700Bold,
    NotoSansBengali_400Regular,
    NotoSansBengali_500Medium,
    NotoSansBengali_600SemiBold,
    NotoNastaliqUrdu_400Regular,
    NotoNastaliqUrdu_600SemiBold,
    LemonMilk: require('@/assets/fonts/LemonMilk.ttf'),
  });

  useEffect(() => {
    if (loaded || error) SplashScreen.hideAsync().catch(() => {});
  }, [loaded, error]);

  if (!loaded && !error) return null;

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <PrefsProvider>
          <AuthProvider>
            <App />
          </AuthProvider>
        </PrefsProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
