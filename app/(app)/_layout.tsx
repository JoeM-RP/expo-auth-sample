import FontAwesome from '@expo/vector-icons/FontAwesome';
import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { useFonts } from 'expo-font';
import { Redirect, Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import React, { useEffect, useRef, useState } from 'react';
import 'react-native-reanimated';

import { useColorScheme } from '@/components/useColorScheme';
import { useSession } from '@/store/contexts';
import { ActivityIndicator, AppState, View, Text } from 'react-native';

export {
  // Catch any errors thrown by the Layout component.
  ErrorBoundary,
} from 'expo-router';

export const unstable_settings = {
  // Ensure that reloading on `/modal` keeps a back button present.
  initialRouteName: '(tabs)',
};

// Prevent the splash screen from auto-hiding before asset loading is complete.
SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const appState = useRef(AppState.currentState);
  const [, setAppStateVisible] = useState(appState.current);

  const {
    isLoading,
    isRefreshing,
    session,
    sessionExpiry,
    sessionIssuedDate,
    checkTokenValidity,
  } = useSession();
  
  const [loaded, error] = useFonts({
    SpaceMono: require('../../assets/fonts/SpaceMono-Regular.ttf'),
    ...FontAwesome.font,
  });

  // Expo Router uses Error Boundaries to catch errors in the navigation tree.
  useEffect(() => {
    if (error) throw error;
  }, [error]);

  useEffect(() => {
    if (loaded) {
      SplashScreen.hideAsync();
    }
    console.debug("[(app)/_layout] App loaded");
  }, [loaded]);

  useEffect(() => {
    if (session && sessionExpiry && sessionIssuedDate) {
      console.debug(
        `[(app)/_layout] Checking session: Has token: ${session ? true : false}, Lifetime: ${sessionExpiry}s, Issued: ${sessionIssuedDate}`,
      );

      // checkTokenValidity();
      console.debug("[(app)/_layout] Skipping manual token check...");

      // console.debug("[(app)/_layout] Setting access token for Axios...");
      // setAccessToken(session);
      console.debug(
        "[(app)/_layout] Did not manually set access token via layout useEffect",
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session, sessionExpiry, sessionIssuedDate]);

  useEffect(() => {
    const subscription = AppState.addEventListener("change", (nextAppState) => {
      if (
        appState.current.match(/inactive|background/) &&
        nextAppState === "active"
      ) {
        if (session && sessionExpiry && sessionIssuedDate) {
          console.log(
            `[(app)/_layout] Attempting token refresh on app state ${appState.current} -> ${nextAppState}`,
          );
          // checkTokenValidity();
          console.debug("[(app)/_layout] skipping manual token check");
        }
      }

      appState.current = nextAppState;
      setAppStateVisible(appState.current);
    });

    return () => {
      subscription.remove();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // You can keep the splash screen open, or render a loading screen here.
  if (!loaded || isLoading || isRefreshing) {
    console.debug("[(app)/_layout] Loading app...");
    return null;
  }

  // Interstitial state while app completes sign in or refreshes token
  if (isLoading || isRefreshing) {
    if (!session && !sessionExpiry && !sessionIssuedDate) {
      console.debug(
        `[(app)/_layout] Session token incomplete! Awaiting refresh/auth: ${session}, Lifetime: ${sessionExpiry}s, Issued: ${sessionIssuedDate}`,
      );
    }

    console.debug(
      `[(app)/_layout] App session loading - Loading: ${isLoading} Refreshing: ${isRefreshing}`,
    );

    return (
      <View
        style={{
          flex: 1,
          alignItems: "center",
          justifyContent: "center",
          gap: 8,
        }}
      >
        <ActivityIndicator
          size="large"
          color="black"
          animating
        />
        <Text>Loading...</Text>
      </View>
    );
  }

  // Only require authentication within the (app) group's layout as users
  // need to be able to access the (auth) group and sign in again.
  if (!session) {
    console.debug("[(app)/_layout] No session token! Redirecting to sign in...");
    // On web, static rendering will stop here as the user is not authenticated
    // in the headless Node process that the pages are rendered in.
    return <Redirect href="/sign-in" />;
  }

  if (session) {
    // Set the access token for API requests
    // setAccessToken(session);
    console.debug(
      "[(app)/_layout] Did not manually set access token via layout init",
    );
  }

  // This layout can be deferred because it's not the root layout.
  return <RootLayoutNav />;
}

function RootLayoutNav() {
  const colorScheme = useColorScheme();

  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <Stack>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="modal" options={{ presentation: 'modal' }} />
      </Stack>
    </ThemeProvider>
  );
}
