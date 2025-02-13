/* Derived from https://docs.expo.dev/router/reference/authentication/
 */

import * as SecureStore from "expo-secure-store";
import React, { useCallback, useEffect } from "react";
import Constants, { ExecutionEnvironment } from "expo-constants";
// eslint-disable-next-line @typescript-eslint/no-restricted-imports
import * as WebBrowser from "expo-web-browser";
import { useStorageState } from "./useStorageState";
import {
    exchangeCodeAsync,
    makeRedirectUri,
    Prompt,
    refreshAsync,
    useAuthRequest,
    useAutoDiscovery,
    TokenResponse,
    dismiss as dismissAuth,
    AuthSessionResult,
} from "expo-auth-session";
import { useRouter } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
    ONBOARDING_STATUS,
    SESS_EXPIRES,
    SESS_ISSUED,
    TOKEN_REFRESH,
    TOKEN_STATUS,
} from "./storeValues";
import { Alert, Platform } from "react-native";
import { setAccessToken } from "@/services";

WebBrowser.maybeCompleteAuthSession();

const isDev = process.env.NODE_ENV === "development";
const TENANT_ID = process.env.EXPO_PUBLIC_TENANT_ID || ""; // directory id
const CLIENT_ID = process.env.EXPO_PUBLIC_CLIENT_ID || ""; // application id
const SCOPES =
    process.env.EXPO_PUBLIC_SCOPES ||
    `api://${CLIENT_ID}/user_impersonation offline_access`;

const ROOT = "https://login.microsoftonline.us";
const DISCOVERY_URI = `${ROOT}/${TENANT_ID}/v2.0`;
const AUTH_ENDPOINT = `${ROOT}/${TENANT_ID}/oauth2/v2.0/authorize`; // fallback auth endpoint in case "discovery" fails
const TOKEN_ENDPOINT = `${ROOT}/${TENANT_ID}/oauth2/v2.0/token`; // fallback token endpoint in case "discovery" fails


const AuthContext = React.createContext<{
    signIn: () => Promise<boolean>;
    signOut: () => Promise<boolean>;
    session?: string | null;
    sessionExpiry?: number | null;
    sessionIssuedDate?: number | null;
    isLoading: boolean;
    isRefreshing: boolean;
    refresh: () => Promise<boolean>;
    checkTokenValidity: () => void;
    userInfo?: any | null;
}>({
    signIn: () => Promise.resolve(false),
    signOut: () => Promise.resolve(false),
    session: null,
    sessionExpiry: null,
    sessionIssuedDate: null,
    isLoading: false,
    isRefreshing: false,
    refresh: () => Promise.resolve(false),
    checkTokenValidity: () => { },
    userInfo: null,
});

/**
 * Determines the most likely redirect URI based on the running environment. For
 * local development or testing within Expo Go, the redirect uri should be localhost
 * with the scheme: exp://. For standalone apps, the redirect uri should be the app's
 * custom scheme; in this case, myapp.
 * @returns AuthSessionRedirectUriOptions
 */
const buildRedirectUri = () => {
    const fallbackScheme =
        ExecutionEnvironment.Standalone === "standalone" ? "myapp" : "exp";
    const scheme =
        (Constants.manifest2?.extra?.expoClient?.scheme as string) ||
        fallbackScheme;

    return makeRedirectUri({
        scheme: scheme,
        path: "sign-in",
        preferLocalhost: isDev,
    });
};

/**
 * This hook can be used to access the session info.
 * @returns AuthContext
 */
export function useSession() {
    const value = React.useContext(AuthContext);
    if (isDev) {
        if (!value) {
            throw new Error("useSession must be wrapped in a <SessionProvider />");
        }
    }

    return value;
}

/**
 * App session context
 * @param props React.PropsWithChildren
 * @returns AuthContext Provider
 */
export function SessionProvider(props: React.PropsWithChildren) {
    const [[isLoading, session], setSession] = useStorageState(TOKEN_STATUS);
    const [[isRefreshing, refreshToken], setRefreshToken] =
        useStorageState(TOKEN_REFRESH);

    const [[, sessionExpiry], setSessionExpiry] = useStorageState(SESS_EXPIRES);
    const [[, sessionIssuedDate], setSessionIssuedDate] =
        useStorageState(SESS_ISSUED);

    const [userInfo, setUserInfo] = React.useState<any | null>(null);

    const router = useRouter();

    useEffect(() => {
        // Double check auth config in dev mode
        if ((isDev && TENANT_ID.length < 3) || CLIENT_ID.length < 1) {
            console.error(
                new Error(
                    "Auth config missing: TENANT_ID or CLIENT_ID is not set in .env.local, which will result in auth failure. Provide the appropriate values and restart metro",
                ),
            );
        }
    }, []);

    const discovery = useAutoDiscovery(DISCOVERY_URI);

    const redirectUri = buildRedirectUri();
    const clientId = CLIENT_ID;

    const config = {
        clientId,
        scopes: [...SCOPES.split(" ")],
        prompt: Prompt.SelectAccount,
        redirectUri,
    };

    const [request, sessionResult, promptAsync] = useAuthRequest(config, {
        ...discovery,
        authorizationEndpoint: discovery?.authorizationEndpoint || AUTH_ENDPOINT,
        tokenEndpoint: discovery?.tokenEndpoint || TOKEN_ENDPOINT,
    });

    const initAuthenticatedState = async () => {
        console.debug("[context] Initializing authenticated state...");
        if (!session) {
            console.debug("[context] No session found; initialization skipped.");
            return;
        }

        console.debug("[context] Checking token validity & fetching user info...");
        await checkTokenValidity();


        // TODO: get/set user info
        console.warn("TODO: get/set user info")
        // const who = await getUserInfoAsync();
        // setUserInfo(who);
    };

    useEffect(() => {
        WebBrowser.warmUpAsync();

        return () => {
            WebBrowser.coolDownAsync();
        };
    }, []);

    useEffect(() => {
        const fetchData = initAuthenticatedState;

        fetchData();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [session]);

    /**
     * Dismiss the auth session on iOS where the app may not have foreground control. Calling
     * this on Android can lead to problems showing the auth prompt, so we skip it.
     */
    const dismiss = () => {
        if (Platform.OS === "ios") dismissAuth();
    };

    /**
     * Pass auth result to exchange tokens and prepare the app for authenticated state
     * @param codeResponse returned from "promptAsync" request
     * @returns boolean
     */
    const completeSignInFlowAsync = async (codeResponse: AuthSessionResult) => {
        let result = false;

        try {
            if (!discovery) {
                console.warn(
                    new Error(
                        "[contexts] Authentication discovery document missing or incomplete: falling back to default endpoints. This can happen when the app is started in a disconnected network state",
                    ),
                );
            }

            if (request && codeResponse?.type === "success") {
                const d = discovery ?? {
                    tokenEndpoint: TOKEN_ENDPOINT,
                };

                const res = await exchangeCodeAsync(
                    {
                        clientId,
                        code: codeResponse.params.code,
                        extraParams: request.codeVerifier
                            ? { code_verifier: request.codeVerifier }
                            : undefined,
                        redirectUri,
                    },
                    d,
                );

                const refreshToken = res.refreshToken || null;
                const issuedAt = res.issuedAt;
                const expiresIn = res.expiresIn || 3600; // default expiry time 1 hour

                setSession(res.accessToken); // local/secure store
                setAccessToken(res.accessToken); // axios

                setRefreshToken(refreshToken); // local/secure store
                setSessionIssuedDate(issuedAt.toString());
                setSessionExpiry(expiresIn.toString());

                await initAuthenticatedState();

                await AsyncStorage.setItem(ONBOARDING_STATUS, JSON.stringify(true));

                console.debug(`[context] Scopes: ${JSON.stringify(res.scope)}`);
                console.debug(`Session result: ${JSON.stringify(sessionResult?.type)}`);

                result = true;
            } else if (codeResponse?.type === "dismiss" || "cancel" || "locked") {
                console.debug(
                    "[context] Prompt exited prematurely: " + codeResponse.type,
                );
                result = false;
            } else {
                throw new Error(
                    `Authorization could not be completed; missing or incomplete code response. Received: ${codeResponse}`,
                );
            }
        } catch (e: Error | any) {
            // Dismiss any current prompt if error
            dismiss();

            Alert.alert(
                "Something went wrong",
                `An error occurred while signing in. Please try again later. \n\n Reason: ${e.message || "Unknown.\n\nPlease contact support at for help."}`,

            );
            console.error(e as Error);
        } finally {
            console.debug("[context] completeSignInFlowAsync completed: " + result);
            return Promise.resolve(result);
        }
    };

    /**
     * Initialize sign in flow.
     */
    const signInFlow = useCallback(async () => {
        let result = false;

        dismiss();

        await promptAsync()
            .then(async (codeResponse) => {
                result = await completeSignInFlowAsync(codeResponse);
            })
            .catch((e: Error) => {
                dismiss();

                Alert.alert(
                    "Something went wrong",
                    `An error occurred while initiating sign in. Please try again later.\n\n Reason: ${e.message || "Unknown.\n\nPlease contact support at for help."}`,
                );

                console.error(e as Error);
                result = false;
            });

        console.debug("[context] signInFlow completed: " + result);
        return Promise.resolve(result);

        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [promptAsync]);

    /**
     * Sign out of the app
     */
    const signOutFlow = useCallback(async () => {
        console.debug("Signing out...");

        if (!session) return Promise.resolve(false);

        setSession(null);
        setRefreshToken(null);
        setUserInfo(null);
        setSessionIssuedDate(null);
        setSessionExpiry(null);
        setAccessToken(""); // axios
        return Promise.resolve(true);

        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [session]);

    const refreshSessionAsync = useCallback(async () => {
        try {
            if (!refreshToken) {
                console.warn("[context] No refresh token available for refresh");

                console.warn("TODO: should router replace sign-in?")
                // router.replace("/sign-in");
                return false;
            }

            console.warn("[context] Attempting token refresh...");

            const d = discovery ?? {
                tokenEndpoint: TOKEN_ENDPOINT,
            };

            const result = await refreshAsync(
                { refreshToken: refreshToken, ...config },
                d,
            );

            // Update the access token, refresh token, and session state
            if (result.accessToken) {
                setSession(result.accessToken);
                setAccessToken(result.accessToken);
                setSessionIssuedDate(result.issuedAt.toString());
                setSessionExpiry((result.expiresIn ?? 3600).toString());
                setRefreshToken(result.refreshToken || refreshToken);

                console.debug("[context] Token refreshed successfully");
                return true;
            } else {
                console.warn("[context] Token refresh failed! Logging out...");
                await signOutFlow(); // Log out if refresh fails

                console.warn("TODO: should router replace sign-in?")
                // router.replace("/sign-in");
                return false;
            }
        } catch (error) {
            console.error(error as Error);
            await signOutFlow(); // Log out if there's an error

            console.warn("TODO: should router replace sign-in?")
            // router.replace("/sign-in");
        } finally {
            return false;
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [refreshToken, config, setSession, setAccessToken, signOutFlow, router]);

    /**
     * Check token validity before performing actions
     */
    const checkTokenValidity = useCallback(async () => {
        let sid;
        let se;

        if (!sessionIssuedDate || !sessionExpiry) {
            sid = await SecureStore.getItemAsync(SESS_ISSUED);
            se = await SecureStore.getItemAsync(SESS_EXPIRES);
            console.log(
                "[context] Session issued date and expiry retrieved from secure store manually",
            );
        } else {
            sid = sessionIssuedDate;
            se = sessionExpiry;
        }

        if (sid && se) {
            const isTokenFresh = TokenResponse.isTokenFresh({
                issuedAt: parseInt(sid),
                expiresIn: parseInt(se),
            });

            if (!isTokenFresh) {
                console.debug("[context] Session expired, refreshing token...");
                await refreshSessionAsync(); // Refresh token instead of logging out
            } else {
                const now = new Date();
                const exp = new Date(parseInt(sid) * 1000);
                const r = Math.abs((exp.getTime() - now.getTime()) / 1000);
                console.debug(
                    `[context] Session is valid! Expires in ${r} seconds (${(r / 60).toFixed(1)} minutes), Lifetime: ${se}s`,
                );
            }
        } else {
            console.log(
                "[context] No session issued date or expiry found in persistent storage!",
            );

            // Risk a refresh anyway? What's to lose...
            if (session && refreshToken) {
                console.log(
                    "[context] Attempting to refresh session without validity check...",
                );
                await refreshSessionAsync();
            }
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [sessionIssuedDate, sessionExpiry, refreshSessionAsync]);

    return (
        <AuthContext.Provider
            value={{
                signIn: signInFlow,
                signOut: signOutFlow,
                session,
                sessionExpiry: parseInt(sessionExpiry || ""),
                sessionIssuedDate: parseInt(sessionIssuedDate || ""),
                isLoading,
                isRefreshing,
                refresh: refreshSessionAsync,
                checkTokenValidity,
                userInfo: userInfo,
            }}
        >
            {props.children}
        </AuthContext.Provider>
    );
}
