import * as SecureStore from "expo-secure-store";
import {
  SESS_EXPIRES,
  SESS_ISSUED,
  TOKEN_REFRESH,
  TOKEN_STATUS,
} from "@/store/storeValues";
import axios, {
  AxiosError,
  AxiosHeaderValue,
  InternalAxiosRequestConfig,
} from "axios";
import { router } from "expo-router";
import { TokenResponse } from "expo-auth-session";
import { setStorageItemAsync } from "@/store/useStorageState";
import { DEFAULT_WAIT, ERR } from "@/constants/networkConstants";

export const axiosAbortController = new AbortController();

const base = process.env.EXPO_PUBLIC_API_URL;

const ROOT = "https://login.microsoftonline.us";
const TENANT_ID = process.env.EXPO_PUBLIC_TENANT_ID || ""; // directory id
const CLIENT_ID = process.env.EXPO_PUBLIC_CLIENT_ID || ""; // application id
const SCOPES =
  process.env.EXPO_PUBLIC_SCOPES ||
  `api://${CLIENT_ID}/user_impersonation offline_access`;
const tokenEndpoint = `${ROOT}/${TENANT_ID}/oauth2/v2.0/token`; // fallback token endpoint in case "discovery" fails

const barrier = 7; // max 401 failues we allow before forcing sign in
let fail = 0; // current session 401 failure count

let refreshInProgress = false;

const axiosInstance = axios.create({
  baseURL: base,
  timeout: __DEV__ ? 100000 : 60000, // 60 seconds
  headers: { accept: "application/json" },
  signal: axiosAbortController.signal,
});

async function setSecureStoreAxios(key: string, value: string | null) {
  return await setStorageItemAsync(key, value);
}

const getAuthTokenAsync = async () =>
  await SecureStore.getItemAsync(TOKEN_STATUS);

const getRefreshTokenAsync = async () =>
  await SecureStore.getItemAsync(TOKEN_REFRESH);

const printAbridgedTokenInfo = (
  token: AxiosHeaderValue | string | undefined,
) => {
  if (!token) return;

  const t = token.toString();
  const result =
    t.substring(0, 15) + "..." + t.substring(t.length - 10, t.length);

  return `Token info: ${result}`;
};

async function sleep(msec: number) {
  return new Promise((resolve) => setTimeout(resolve, msec));
}

async function axiosSleeprequest(
  config: InternalAxiosRequestConfig<any>,
  msec: number,
) {
  console.log("[axios] Waiting to retry " + config?.url);
  console.log(`[axios] token is ${config?.headers?.Authorization ? "set" : "not set"}`);
  await sleep(msec);
  console.log(
    `[axios] Waited ${msec} ms, proceeding with request /${config?.url}`,
  );
}

const axiosRefeshTokenManually = async () => {
  console.debug("[axios] Refresh in progress check: " + refreshInProgress);

  if (refreshInProgress) return;

  try {
    console.warn("[axios] manually refreshing token...");
    refreshInProgress = true;
    console.debug("[axios] Set refresh in progress: " + refreshInProgress);

    const refresh = await getRefreshTokenAsync();
    const q = `?client_id=${CLIENT_ID}&scope=${encodeURIComponent(SCOPES)}&refresh_token=${refresh}&grant_type=refresh_token`;
    const response = await axios({
      method: "post",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      data: {
        client_id: CLIENT_ID,
        scope: [...SCOPES.split(" ")],
        refresh_token: refresh,
        grant_type: "refresh_token",
      },
      url: tokenEndpoint + q,
    });
    const { access_token, expires_in, refresh_token } = response.data;

    // console.debug(response.data);
    console.log(
      "[axios] Refresh success! New access token is " +
        printAbridgedTokenInfo(access_token),
    );

    await Promise.all([
      await setSecureStoreAxios(TOKEN_STATUS, access_token),
      await setSecureStoreAxios(TOKEN_REFRESH, refresh_token),
      await setSecureStoreAxios(SESS_EXPIRES, expires_in.toString()),
      await setSecureStoreAxios(
        SESS_ISSUED,
        Math.floor(Date.now() / 1000).toString(),
      ), // approx unix time (seconds)
    ]).then(() => {
      console.warn("[axios] Secure auth artifacts set. Refresh successful");
    });

    console.log("[axios] Updating default bearer token for axios instance");
    axiosInstance.defaults.headers.common.authorization = `Bearer ${access_token}`;
  } catch (error) {
    const e = error as Error;
    console.warn("[axios] Refresh failed! Issue was " + e?.message);
  } finally {
    console.log(
      "[axios] Refresh done! " +
        printAbridgedTokenInfo(
          axiosInstance.defaults.headers.common.authorization,
        ),
    );
    refreshInProgress = false;
    console.debug("[axios] Set refresh in progress: " + refreshInProgress);
  }
};

const axiosCheckTokenValidity = async () => {
  let sid = await SecureStore.getItemAsync(SESS_ISSUED);
  let se = await SecureStore.getItemAsync(SESS_EXPIRES);

  if (sid && se) {
    const isTokenFresh = TokenResponse.isTokenFresh({
      issuedAt: parseInt(sid),
      expiresIn: parseInt(se),
    });

    if (!isTokenFresh) {
      console.log("[axiosCheckTokenValidity] trying axiosRefeshTokenManually");
      await axiosRefeshTokenManually();
      console.log("[axiosCheckTokenValidity] token refresh done.");
    } else {
      const now = new Date();
      const exp = new Date(parseInt(sid) * 1000);
      const r = Math.abs((exp.getTime() - now.getTime()) / 1000);
      console.debug(
        `[axios] Session is valid! Expires in ${r} seconds (${(r / 60).toFixed(1)} minutes), Lifetime: ${se}s.`,
      );
    }

    return isTokenFresh;
  } else {
    return false;
  }
};

// Add a request interceptor
axiosInstance.interceptors.request.use(
  async function (config) {
    // Do something before request is sent
    let token = await getAuthTokenAsync();
    let refresh = await getRefreshTokenAsync();

    if (refreshInProgress) {
      await axiosSleeprequest(config, DEFAULT_WAIT);
    }

    await axiosCheckTokenValidity();

    if (!token && !refresh) {
      console.log(
        "[axios] No authorization header! Expect auth failures for secured APIs",
      );

      // Don't send abort signal here which can cause issues during login
      // axiosAbortController.abort();
    }

    token = await getAuthTokenAsync();

    axiosInstance.defaults.headers.common.authorization = `Bearer ${token}`;
    config.headers.Authorization = `Bearer ${token}`;
    printAbridgedTokenInfo(JSON.stringify(config.headers.Authorization));

    console.debug(
      `[axios] Requesting /${config.url}. \t${printAbridgedTokenInfo(
        axiosInstance.defaults.headers.common.authorization,
      )}`,
    );
    return config;
  },
  function (error: AxiosError) {
    console.log("[axios] Request error: " + error);

    // Do something with request error
    return Promise.reject(error);
  },
);

// Add a response interceptor
axiosInstance.interceptors.response.use(
  async function (response) {
    // Any status code that lie within the range of 2xx cause this function to trigger
    if (fail > 0) {
      console.debug("[axios] Failure count is reset, was: " + fail);
      fail = 0;
    }
    // Do something with response data here before retrunign it, if needed
    return response;
  },
  async function (error: AxiosError) {
    // AxiosError doesn't seem to hydrate the status code correctly, even though it is apparent when
    // viewed in the console or debugger. Here, we force the conversion to ensure we can drive behavior
    // based on the status code as expected
    const error_status = JSON.parse(JSON.stringify(error))["status"];

    fail++;
    console.log("[axios] Failure count is up, now: " + fail);
    console.debug(`[axios] Response error: ${error.message} (${error.code})`);

    // console.info(error.config?.baseURL + "" + error.config?.url);
    // console.info(error.config?.headers)

    // Fail if we've retried too many times
    if (fail > barrier) {
      console.warn(
        `[axios] Too many auth failures (${fail}). Aborting active requests and signing out...`,
      );

      axiosAbortController.abort();

      // Attempt to redirect to sign in - pass the "force" flag to prevent navigating back to
      // home while auth tokens are cleared (which is handled on sign in page to ensure hooks
      // are handled correctly.
      console.warn("[axios] Attempting navigation to sign in screen...");
      router.replace("/sign-in?force=true");

      // Reset failure count
      fail = 0
      console.info("[axios] Resetting failure count after issueing sign-in redirect")

      return Promise.reject(error);
    }

    // Happens if the abort signal was received
    if (error.code === ERR.CANCELED && error.config) {
      let token = await getAuthTokenAsync();
      let tokenSet;
      const maxRetry = 5; // 5 retries for a max total wait of 20 seconds to refresh

      // Crude retry block - don't send a new request until the refreshed token is set
      for (var retry = 0; retry < maxRetry; retry++) {
        await axiosSleeprequest(error.config!, DEFAULT_WAIT * (retry + 1));

        tokenSet = error.config?.headers?.Authorization ? true : false;

        // If bearer token is set, we can break the loop and request early
        if (tokenSet) {
          console.log(
            `[axios] Error block - retrying ${error.config?.url} after ${(retry * DEFAULT_WAIT) / 1000} second wait. Token is set: ${tokenSet}`,
          );

          token = await getAuthTokenAsync();

          if (token !== undefined) {
            console.log(
              `[axios] Error block - setting updated token for request /${error.config.url}. \t ${printAbridgedTokenInfo(`Bearer ${token}`)}`,
            );
            axiosInstance.defaults.headers.common.authorization = `Bearer ${token}`;
            error.config.headers.Authorization = `Bearer ${token}`;
            printAbridgedTokenInfo(
              JSON.stringify(error.config.headers.Authorization),
            );

            retry = maxRetry + 1;
            break;
          } else {
            console.log(
              "[axios] Error block - token not set for request /" +
                error.config.url,
            );
          }
        }
      }

      if (token) {
        console.warn("[axios] Retrying request with new token: " + token);
        return axios.request(error.config);
      } else {
        console.warn("[axios] token is not set! Will defer retry request");
      }
    }

    // 404 - Happens if the route is not found
    if (error.code === ERR.BAD_REQUEST && error_status === 404) {
      console.warn(`[axios] ${error_status} error for /${error.config?.url}.`);
      return Promise.reject(error);
    }

    // 403 - Happens if auth is valid, but not permitted
    if (error.code === ERR.BAD_REQUEST && error_status === 403) {
      console.warn(`[axios] ${error_status} error for /${error.config?.url}.`);
      return Promise.reject(error);
    }

    // 401 - Happens for if auth is empty or expired
    if (error.code === ERR.BAD_REQUEST && error_status === 401 && error.config) {
      console.warn(
        `[axios] ${error.response?.status} error for /${error.config?.url}. \t${printAbridgedTokenInfo(error.config.headers.Authorization)}`,
      );

      // Initiate token refresh for 401 errors and retry the request before failing
      const refreshresult = await axiosCheckTokenValidity();
      console.debug("isTokenFresh: " + refreshresult);

      if (refreshresult) {
        console.debug(
          "[axios] Interceptor trying axiosRefeshTokenManually after 401",
        );
        await axiosRefeshTokenManually();
      }
    }

    // 400 - Happens if the client sends a bad request
    if (error.code === ERR.BAD_REQUEST && error_status === 400) {
      console.warn(`[axios] ${error_status} error for /${error.config?.url}.`);
      return Promise.reject(error);
    }

    // 40X - Last-ditch retry
    if (error.config) {
      console.warn(
        `[axios] Attempting retry after ${error_status} error: ${error.code}`,
      );

      await axiosSleeprequest(error.config, DEFAULT_WAIT);

      return axios.request(error.config);
    }

    // Any status codes that falls outside the range of 2xx cause this function to trigger
    // Do something with response error
    return Promise.reject(error);
  },
);

/**
 * @deprecated
 * Manually sets the access token for the default instance of Axios. Discouraged
 * @param token
 */
export const setAccessToken = (token: string) => {
  axiosInstance.defaults.headers.common.authorization = `Bearer ${token}`;
};

export { axiosInstance };
