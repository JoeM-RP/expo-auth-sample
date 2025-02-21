import { focusManager, NotifyOnChangeProps } from "@tanstack/react-query";
import { useFocusEffect } from "expo-router";
import { useCallback, useEffect, useRef } from "react";
import { AppState, AppStateStatus, Platform } from "react-native";

export const isDev = process.env.NODE_ENV === "development";
export const blurhash =
  "|rF?hV%2WCj[ayj[a|j[az_NaeWBj@ayfRayfQfQM{M|azj[azf6fQfQfQIpWXofj[ayj[j[fQayWCoeoeaya}j[ayfQa{oLj?j[WVj[ayayj[fQoff7azayj[ayj[j[ayofayayayj[fQj[ayayj[ayfjj[j[ayjuayj[";
export const placeholderIcon =
  "data:image/png;base64,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";


function onAppStateChange(status: AppStateStatus) {
  if (Platform.OS !== "web") {
    focusManager.setFocused(status === "active");
  }
}

/**
 * Hook to listen for app state changes. Instead of event listeners on window, React Native provides focus information through the AppState module.
 * You can use the AppState "change" event to trigger an update when the app state changes to "active".
 * @ref https://tanstack.com/query/latest/docs/framework/react/react-native#refetch-on-app-focus
 */
export function useAppStateChange() {
  useEffect(() => {
    const subscription = AppState.addEventListener("change", onAppStateChange);

    return () => subscription.remove();
  }, []);
}

/**
 * In some situations, you may want to refetch the query when a React Native Screen is focused again. This custom hook will call the provided refetch
 * function when the screen is focused again.
 * @ref https://tanstack.com/query/latest/docs/framework/react/react-native#refetch-on-focus
 * @param refetch
 */
export function useRefreshOnFocus<T>(refetch: () => Promise<T>) {
  const firstTimeRef = useRef(true);

  useFocusEffect(
    useCallback(() => {
      if (firstTimeRef.current) {
        firstTimeRef.current = false;
        return;
      }

      refetch();
    }, [refetch]),
  );
}

/**
 * @ref https://tanstack.com/query/latest/docs/framework/react/react-native#disable-re-renders-on-out-of-focus-screens
 * @param notifyOnChangeProps
 * @returns
 */
export function useFocusNotifyOnChangeProps(
  notifyOnChangeProps?: NotifyOnChangeProps,
) {
  const focusedRef = useRef(true);

  useFocusEffect(
    useCallback(() => {
      focusedRef.current = true;

      return () => {
        focusedRef.current = false;
      };
    }, []),
  );

  return () => {
    if (!focusedRef.current) {
      return [];
    }

    if (typeof notifyOnChangeProps === "function") {
      return notifyOnChangeProps();
    }

    return notifyOnChangeProps;
  };
}